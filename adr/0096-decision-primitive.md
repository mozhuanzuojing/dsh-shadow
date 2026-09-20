# ADR-0096: Decision Primitive —— 「引擎产出的选择」是一等原语，且与「捕获的决策」是两个对象

- 状态：**提案（待用户评审后落地）** —— T1 代码**未动**；本文件只定协议与判据
- 决定日期：2026-09-20
- 关联：**ADR-0037**（决策捕获边界；本 ADR **不改其正文**，只加补记，见 §6）·
  **ADR-0081**（`core/decision-outcome.ts` 的归属 + §8.4 自陈「无生产消费者」）·
  **ADR-0086**（受保护契约面；§7 决定 T1 **不进**该面）· **ADR-0049**（缺件不静默）·
  **ADR-0003**（派生件不是 source）· **ADR-0095**（Atom 是唯一事实源，索引可重建）·
  **ADR-0080/0081**（阈值不构成权威）
- 定位：**协议**。回答「Decision 原语是什么、谁产生、怎么记、记成什么」。
  **实现清单与门禁在 §9**，不是本 ADR 的判据。
- 材料：`vendor/_src/jev-ultrafast`（局部只读实测，见 §1.2；引用均为 `文件:行号`）

## 1. Context

### 1.1 提案

用户 2026-09-20 提出：**不要**把某个决策推理服务（下称 jev）作为**外部模型服务**塞进 dsh-shadow，
而应把它的决策语义**吸收**成本仓的一等原语 ——

> 「LLM 负责**想**，Jev-like 负责**判**，Shadow 负责**记住为什么判**。」

并给出一个 8 文件的 `decision/` 层草图（`types/choice/score/boolean/rank/engine/policy/lineage`）
与 T1→T5 的推进顺序（T1 先抽象原语、不接 jev；T5 才把 jev 接成后端）。

### 1.2 Jev 实测：提案里的五个原语，只有一个是真的

只读源码实测（`vendor/_src/jev-ultrafast/jev_ultrafast/model.py`）：

| 提案原语 | Jev 里的实际状态 | 证据 |
|---|---|---|
| `choice` | ✅ **存在**，且是**唯一**的题型：`{"type":"choice","criteria":{…}}` | `model.py:81,91-106` |
| `score` | ⚠️ **半有** —— 只有**模型自报**的 `probabilities`/`confidence`；代码里**没有任何** score 函数 | `model.py:120-133` |
| `boolean` | ❌ **不存在**（无 yes/no 题型） | `model.py` 内 `boolean` 字面量 **0 处** |
| `rank` | ❌ **不存在** —— `"Ranked by Jev"` 只是 inspector UI 文案 | `jev_ultrafast/static/app.js:107` |
| `threshold` | ❌ **不存在** —— argmax 无条件执行，概率再低也照做 | `model.py:120-133` |

> **可复现**（本节这条**不是推断**，是机械核对）：
> `cd vendor/_src/jev-ultrafast` → `Select-String -Path jev_ultrafast/model.py -Pattern 'boolean|yes_no|threshold|rank'`
> → **0 命中** ⇒ `boolean` / `rank` / `threshold` 作为决策原语在 Jev 里**不存在**。

⇒ 「吸收 Jev 的语义原语」实际是**吸收一个原语（`choice`）**；另外三个是**提案新增的发明**。
本 ADR 因此不照抄五个（§3 逐条给了去向）。

**真正值得吸收的是两件东西**：

1. **`validate_choice`（`model.py:30-45`）—— 一个确定性可校验的契约**：先给候选集 `ids`，
   再要求 `choice ∈ ids`、`probabilities` 的键**恰好等于** `ids`、每个有限且 0–1、和 ≈ 1、
   且 **argmax == choice**（`model.py:39`）。这与本仓「宁可漏、不可编」同向，且**可机械校验**。
2. **`request` 与 `raw_answers` 逐字留存**（`model.py:147` / `model.py:143`；`agent.py:36,78-84`）——
   引擎在决策那一刻的**原始声明被当证据保留**。见 §5：**这是本 ADR 能成立的支点**。

另需记下一条事实：Jev 的决策**本身就是一个硬编码的远程模型服务**
（`https://api.typesafe.ai/v1/systemone`，`model.py:119`；`TYPESAFE_API_KEY` 必需）。
「不要把 jev 当外部模型服务塞进来」的落点就在这里 —— §7 用「T1 不引入任何外部依赖」回答它。

### 1.3 本仓现状：决策的**捕获**侧已冻结，**原语**侧不存在

- **已有、不重造**：`DecisionEvent`（`core/episode.ts:41`）· 写侧触发器
  （goal 事件 / 用户拍板 / assistant 明确决策，`core/writer-capture.ts:96-118`）·
  派生血缘 `DecisionLineage`（`core/episode.ts:296`）· 派生投影 `deriveDecisions`
  （`core/episode.ts:300-321`）· outcome 归属与读数（`core/decision-outcome.ts`，
  `ATTRIBUTION_RULE = "same-key-window/v1"`）。
- **`core/decision-outcome.ts` 已完整实现、有测试门，但生产消费者为零**（ADR-0081 §8.4 自陈）。
  ⇒ 它是 T3 的**接线对象**，不是重建对象。
- 全仓**没有** `decision/` 层；`choice`/`boolean`/`rank`/`threshold` 作为原语**不存在**。
- **分数与置信度在这一带是被明令禁止的**：
  `planning/guard.ts:11`（禁 `score`/`best`/`optimal`，理由「**score→optimization→preference→value→identity 入口**」）·
  `action/guard.ts:5`（禁 `expectedSuccess`/`confidence`，理由「Simulation Outcome 不得升级为行动信念」）·
  `adr/0037:88`（❌ Decision Score / Quality、❌ Confidence）。

### 1.4 一条能站住的线：**不确定性 = 可 / 成功信念 = 禁**

`action/guard.ts:21` 的 `renderCandidate` **允许** `uncertainty.toFixed(2)`，
而 `action/guard.ts:5` **禁止**同一结构带 `confidence`。
⇒ 本仓的判据不是「数字一律不许」，而是 **「认知不确定性」可 / 「对成功或正确性的信念」禁**。
§4 的命名与 §3 的删减都站在这条线的**允许侧**。

## 2. 决定一：Decision 是**两个**对象，永不混同

| | `captured`（捕获的决策） | `produced`（引擎产出的选择） |
|---|---|---|
| 是什么 | **已经发生的**决定 | 引擎**在决策那一刻声明的**选择 |
| source | 原文（`goal` / `user` / `assistant`） | 引擎名 + **逐字原始输出** |
| 归属 | `DecisionEvent`（`core/episode.ts:41`） | **新**：`decision/` 层 |
| 现状态 | 已实现、已冻结（ADR-0037） | T1 新建 |

三条不混同的禁令：

1. **不把 `produced` 写进 `DecisionEvent`** —— 那会让 `> 决策：〔source〕` 的语义漂移
   （0037「事实源与派生关系」一节）。
2. **不把 `captured` 的 statement 当 `produced` 的 `selected`** —— 前者是事实陈述，后者是候选 id。
3. 同一回合两者都有时，**记两条，不合并**。

## 3. 决定二：原语只留一个 + 两个视图（**与提案差异最大，请重点评审**）

| 提案 | 本 ADR | 理由 |
|---|---|---|
| `choice` | ✅ **保留**，唯一有 Jev 依据的原语 | `model.py:81,91-106` |
| `score` | ❌ **不成原语** —— 只能是 `reportedDistribution`（声明里的**字段**；**可为显式 `null`** = 该引擎不产出分布） | shadow 一旦「计算分数」就正好踩 `planning/guard.ts:11` 的链 |
| `boolean` | ❌ **不成独立协议** —— 定义为 `choice` 的**二元退化**（候选集两元） | Jev 也没有；另造题型是发明协议 |
| `rank` | △ **降为视图** `orderByReported()` | 它是对 `reportedDistribution` 的排序**读数**，不是新协议；且**不得**被任何偏好/选择路径消费 |
| `threshold` | ❌ **不提供** | 见下 |

**为什么删除 `threshold` 是最重要的一条**：本仓对「阈值当权威」已有立场（ADR-0080/0081）。
更根本的是 —— **一旦 shadow 按阈值把引擎输出切成「执行 / 不执行」，决策就变成了 shadow 的策略，
而不是引擎的声明**；那正是 ADR-0037 禁止的那种「**采集变判断**」（`adr/0037:82-92`）。
阈值若存在，是**引擎的内部事务**；shadow 只记结果，不记「shadow 怎么切的」。

⇒ 因此 `decision/` 的文件集从提案的 8 个减到 **6 个**（§9.1），删掉
`score.ts` / `boolean.ts` / `rank.ts` / `policy.ts`（`policy` 概念留到真有第二个后端时再定，
避免先造空抽象）。

## 4. 决定三：命名与守卫必须站在**允许侧**

- **禁**（本层**字段名**里不得出现）：`confidence` · `score` · `best` · `optimal` · `correct` ·
  `expectedSuccess` · `precision` · `winner` · `ranking`
  ⚠ **作用域是「字段名」，不是「全文」** —— `guard.ts` 在**禁令理由**里点名它们是**允许**的；
  先例：`planning/guard.ts:11,13,16` 同样在 reason 里点名 `score`/`optimal`/`ranking`。
  这条口径由 `test/decision-primitive.test.ts` 的第 ⑨ 块**静态断言**守着（并同时断言 `types.ts` **零 import**）。
- **许**：`reportedDistribution`（强调「引擎**自报**」）。§1.4 的 `uncertainty` 是**先例**
  （`ActionCandidate` 的字段），本层**不引入**同名字段。
- 依据：§1.4（`action/guard.ts:5` 与 `:21` 的对照）· `planning/guard.ts:11,13,16`

新层自带守卫 `decision/guard.ts`，与 `action/guard.ts`、`planning/guard.ts` **同形**
（`xIsClean` + `assertX` + **非空 reason**）。判据以 `declarationViolations` 为**唯一实现**：

1. `engine` 非空；`candidates` **非空**；
2. `selected` **∈** `candidates`；
3. `rawOutput` **非空**（没有原始声明就不叫「声明」）；
4. `reportedDistribution` 的键**恰好等于**候选集（**多一个少一个都非法** —— 取自 `model.py:30-45` 的口径）；
5. 每个值**有限**且 **0–1**；
6. 和 **≈ 1**（容差 `DISTRIBUTION_SUM_TOLERANCE = 1e-6` **显式写出**，**不隐式归一化**）；
7. 违例 ⇒ **逐条点名** + `invalid`，**不静默纠正、不落回默认**（ADR-0049）。

**两条「刻意如此」**（实现时定死的，后来者别顺手改回去）：

- **`reportedDistribution` 允许显式 `null`**（= 该引擎**不产出**分布，如纯规则引擎），
  但**不允许 `undefined`**（= 忘了填）—— 两者**必须分得开**（缺件不静默，ADR-0049）。
  T1 的 `HeuristicDecisionEngine` 就报 `null`：规则引擎没有概率，
  **逼它编一组数，就等于让 shadow 自己打分**。
- **不要求 `argmax(reportedDistribution) === selected`** —— 与 jev 的 `validate_choice` **不同，是有意的**：
  一旦要求，**选择就由那组数字决定**，那组数字于是成了 shadow 的优化目标，正好落回
  `planning/guard.ts:11` 的 `score → optimization → preference → value → identity` 链。
  本层要的是「**选了什么**」与「**自报了什么分布**」是**两条独立事实**。

## 5. 决定四：候选由**外部**给，引擎只选不造；原始输出**就是证据**

- **候选集由调用方提供**，引擎 selects 而不 invents。同族依据：`planning/guard.ts:4`
  的 `objectiveIsExternal`（「objective 必须外部来源」）。**引擎不得增加、改名或删除候选**。
- `core/lineage-validator.ts:31`：**decision 无 `lineage.evidence` 不进 context（Atom 保留）**
  ⇒ `produced` 决策要成为可进入上下文的 Atom，**必须带非空 evidence**；
  这条 evidence **就是引擎的 `rawOutput`（+ 请求体）**，**逐字**，不是转述、不是摘要。
- **这是 §6 与 ADR-0037 不冲突的支点**：0037 禁的是 **shadow 生成/推断**
  （「绝不生成 Reason」「不做 LLM 事后推理」）；本 ADR 做的是**逐字记录引擎的声明** ——
  「记录一个确实发生过的声明」是**捕获**，与「替一个已发生的决定编理由」是**两个不同的动作**，
  对象也不同（引擎声明 vs 人事决策）。

## 6. 决定五：与 ADR-0037 的关系 = **只加补记，不改正文**

`adr/0037` 正文已冻结。逐条对账：

| 0037 的「明确不做」 | 对 `captured` | 对 `produced` |
|---|---|---|
| ❌ DecisionStore / DB / Repository | **继续有效** | **继续有效**（仍无独立存储；Atom 是唯一事实源） |
| ❌ LLM 自动补 Reason / LLM 抽取 Decision | **继续有效** | **范围澄清**：禁「事后替**已发生的**决定编理由」；**不**禁「记录引擎在决策时声明的输出」 |
| ❌ Decision Score / Quality | **继续有效** | **继续有效**：shadow **不**给决策打质量分/正确分；`reportedDistribution` 是**引擎自报**，不是 shadow 的评分 |
| ❌ Confidence（决策置信度） | **继续有效** | **范围澄清**：不引入「shadow 对决策的信心」；引擎自报的数按 §4 命名归位，**不叫 confidence** |
| ❌ Preference / Value / Learning / Reward | **继续有效** | **继续有效** |
| ❌ 自动判断「正确决策」· ❌ 自动形成经验 · ❌ Decision → Goal | **继续有效** | **继续有效** |

⇒ 在 `adr/0037` 末尾加一节「**补记（2026-09-20，ADR-0096）**」，**正文不动**
（与 `adr/0049` 的处理同形）。

## 7. 决定六：T1 **不进入**受保护契约面（ADR-0086）

ADR-0086 的公开面 = `README.md` 表 A / 表 B 的那组 `*-v1` 契约。
⚠ **条数不许手写**（本仓规矩，见 `AGENTS.md` 的「能推出来的字段不要手写」）—— 实测 **9 个 id**，
而同一份 README 的另一处写「**8 条**」、`adr/0086:71` 又写「**七个**面族」：
**三处不一致，且没有任何门在守这个数**（§7.1 末注）。现行口径用命令取，别凭记忆：

```powershell
Select-String -Path README.md -Pattern '^\| `([a-z0-9-]+-v1)` \|' |
  ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -Unique   # ⇒ 9
```

> ⚠ **别把中间那段 `ForEach-Object` 省掉**：`Select-String | Select-Object -Unique` 比的是**整个
> MatchInfo 对象**（含行号）⇒ 同一 id 出现在表 A 与表 B 就**算两个**，实测输出 **18**，而真值是 **9**。
> 本条是实测踩到的（命令写错就等于给人一个错的数）。

**T1 一个都不加**：

- 不新增工具名 ⇒ `tool-name-v1` / `tool-schema-v1` 不动；
- 不新增 `mode` ⇒ mode 面**保持 62**（受门保护：`test/recall-envelope.test.ts:104`）；
- 不新增 `ShadowConfig` 键 ⇒ `config-keys-v1` 不动、README 默认开关表不动。

**代价必须说清、不许含混**：T1 的层**没有生产消费者**，所以它会**主动增加接线债**，
并使 `audit:ratchet` **变红**。这个增量**实测了两次**（**不是估计**）—— 先用 §9.1 的导出面做**临时桩预估**，
再用**真实现复核**：

```text
桩预估 :  a1 23 → 30 (+7)  |  a2b 0 → 1 (+1)  |  a_total 38 → 46 (+8)
真实现 :  a1 23 → 31 (+8)  |  a2b 0 → 0 (±0)  |  a_total 38 → 46 (+8)   ← **定案用这一行**
（两次实测 drift 侧都**不变**（9 个键 / 23 处）；`audit:layers` 语料 199→205 文件、553→559 边，
 含**新增 3 条方向禁令之后**仍「**全部判据通过 ✅**」⇒ §9.2 第 2 步的判断得到实证）
```

处理方式是**显式重定基线 + 在 CHANGELOG 说明**（§9.2 第 5 步），**不是偷偷 `--update-ratchet`**。
⚠ 两条教训：**总量可预估、分桶不能** —— 桩的 `a_total +8` 与真实现**一致**，`a1`/`a2b` 的分桶却**对不上**
（桩里那个没人调用的返回对象被算进了 `a2b`）⇒ **分桶数只能实测**。且这组数**绑定于 §9.1 的导出面**：
导出面一变就得重测，**不许照抄**。

本仓已有同形先例：`core/decision-outcome.ts` 完整实现、有门、**零生产消费者**，
并因此被**显式写进** `tsconfig.json` 的 `include` 才被类型检查（§9.2 第 3 步同因）。

### 7.1 将来若要暴露：代价已实测，免得下次重新发现

判据在 `tools/contract-surface.lib.ts` 的 `diffSurface`：**`added` 只报告、不判失败；`missing` 才红**
（改名 / 删除禁，**新增是加法**）。而 `tools/contract-surface.selftest.ts` 被 `tools/run-tests.ts:29`
（glob `tools/*.selftest.ts`）收进 `test:all` ⇒ **它确实在 `npm run verify` 里**，是真门、不是纸面门。

若将来把 `decision` 暴露成 DSH 工具，代价是「**加法，但落在多处**」：

| 落点 | 位置 | 有门吗 |
|---|---|---|
| 工具名 + 参数 | `index.ts`（`README.md:312` 称「三处 `name:`」） | **有**（`tool-name-v1` 在 `README.md:335` 的**有强门**行 —— `test/host-probe.test.ts:104` 断言三个名字都在注册表里。⚠ **但那个断言把三个名字写死了** ⇒ **新增**工具名**不会**被它覆盖，得手动把新名加进那一行；`tool-schema-v1` 则**只守参数名**。本行早先写作「部分」—— 那**低估**了门，自审时改正。**已读源码核实**：`:104` 就是
`for (const t of ["read_shadow", "recall_shadow", "shadow_query"]) assert.ok(tools.reg.has(t), …)` ——
**纯名字存在性**断言，不涉 schema / 参数 / 默认值） |
| 冻结清单 | `tools/contract-surface.selftest.ts:24`（`TOOLS`）· `:50`（`TOOL_PARAM_FROZEN`） | **有**（`missing` 红；清单可由 `:223-224` 的打印重新生成） |
| 登记册 **10 字段**（表 A / 表 B 的**填写完整度**） | `README.md` 受保护契约面 | **无自动化门** —— 各面**都有** verification（分组见 `README.md:333-337`；⚠ **该分组本身已腐烂**：9 个 id 被分成「6 强门 + 2 只守名字面」= **8**，**漏了 `tool-output-v1`**，而 `:337` 又写「8 条全无棘轮桶」），且那些门守的是**代码面**（名字 / 断言），**不是这张表的完整度** |
| 若加配置键 | `tools/contract-surface.selftest.ts` 的 `CONFIG_KEY_FROZEN` + README 默认开关表 | ⚠ **加键本身没有任何门挡着**（**实测**：往 `ShadowConfig` 加一个键 ⇒ 该 selftest 明说「**新增顶层键 N 个（allowed，只报告）**」并 `exit 0`；`audit:docs` ③ **完全不受影响**，仍是 `20 = 20`）。③ 守的是 **README 表自洽**（**实测**：把声明数改成 21 而表里仍 20 行 ⇒ **红，`exit 1`**）⇒ **「新键要登记进 README 那 10 个字段」这件事无门可守**，只有**删键 / 改名**才红。※ 本 ADR 早先在此写「表计数**有**（`audit:docs` ③）」—— **错了**，自审时用正反两个实验改正 |
| 若加 `mode` | `test/recall-envelope.test.ts:104`（62→63）+ `CONTEXT.md`「mode 参考」 | **有**（`:104` 计数断言 + `:111` 覆盖断言） |

⇒ 两条结论：
1. **走 `mode` 比走工具更贵** —— `62` 是**受门保护的数**（改它**必须同时改门**并说明门为什么错）；
2. **「不暴露」是本层唯一零契约面代价的形态** —— 这正是 §7 的决定；将来要暴露时，
   本节的表就是现成的清单，不必重新考古。

> **末注（实测到的三处同类腐烂，**本轮已一并修**）**：受保护契约面的**条数**曾有**三个互相矛盾**的值 ——
> 实测 **9 个 id**（命令见 §7 开头）· `README.md` 写「**8 条**」· `adr/0086` 写「**七个**面族」。
> 三者已统一为「**不写数、以 `README.md` 表 A/表 B 的 `id` 为准**」，并补上原先漏掉的 `tool-output-v1`。
> 同批修的还有：`README.md` / `BACKLOG.md` 指向**已不存在的** `../.docs/fix/2026-09-12/` 生成器
> （→ 重建为 `tools/module-ownership.ts`），以及 8 处把「守 62 的那道门」引成 `recall-envelope.test.ts:96`
> 的过期行号（真值是 **`:104`**；覆盖断言是 **`:111`**，不是 `:112`）。

## 8. 决定七：lineage / outcome **接线不重建**

- `decision.produced` 的血缘走**既有** `AtomLineage` + `AtomEvidenceRef`（`core/lineage.ts`），
  **不新造血缘类型**。
- **outcome 只作为后续独立捕获的事实**，**不自动因果回链**到产出它的决策 ——
  0037「有 Decision ≠ 一定有 Reason」的同族纪律：**有 Decision ≠ 一定有 Outcome，
  有 Outcome ≠ 证明该 Decision 正确**。
- **T3 的对象是接线** `core/decision-outcome.ts`（`OutcomeObservation` / `Attribution` /
  `OutcomeReadout`），**不是重写**（它已实现、已有门，只差生产消费者）。
- **完整性闸门**的真判据在 `reflection/types.ts:35` 的 `completenessOf`
  （`reflectionEligible: hasDecision && hasOutcome`），使用点在 `reflection/engine.ts:22`
  （`traces.filter((t) => completenessOf(t).reflectionEligible)`）：
  决策只在两者都存在时进入 Pattern 统计 —— 这条不变。
  ⚠ **本行在自审时被修正过**：原先引的是 `reflection/types.ts:22`，第一次「修」成 `reflection/engine.ts:20`
  —— **那两行都是注释，不是闸门**。同一个错（拿注释当判据）在本 ADR 里犯了**两遍**，
  而本 ADR 的 §11 恰恰把「引符号名、别引会腐烂的行号」列为纪律 ⇒ **写下来，别只改掉**。

## 9. T1 的范围、文件集与门禁

### 9.1 文件集（**6 个**，不是提案的 8 个）

```text
decision/
├── types.ts       稳定协议（候选集 / selected / reportedDistribution / rawOutput / evidence）
├── guard.ts       边界守卫（§4 的 **7 条**判据；镜像 action/ · planning/ 的 guard 形态）
├── choice.ts      choice 原语 + orderByReported 视图（§3）
├── engine.ts      DecisionEngine 接口 + 查找 + unavailable 语义（§7：无网络、无 LLM、无 jev）
├── heuristic.ts   HeuristicDecisionEngine（确定性规则表；T1 唯一后端）
└── lineage.ts     produced → 决策 Atom 的投影（evidence 非空，§5）
```

`engine.ts` 的口径：`name` 只是**标识符，不是等级**（本仓不自造 `stable/beta/experimental`，
D8）；未知 / 缺件引擎 ⇒ **`unavailable` + reason，绝不静默 fallback**（ADR-0049）。

**实现时定死的一处签名**：`DecisionEngine.decide` 返回 **`EngineDeclaration | EngineUnavailable`** ——
引擎**有权拒绝**。这是必须的：规则引擎完全可能「没有规则命中」，那时它**只能不猜**；
若签名只准返回声明，引擎就被逼着**编一个选择**出来（`heuristic.ts` 的 `no_rule_matched` 就是这一刻）。
`choose` 遇到引擎自报的 `unavailable` 时**原样透出、不覆盖成别的理由**。

### 9.2 落地清单（顺序即依赖）

1. 写 `decision/*.ts`；相对 import **一律带 `.js` 后缀**（未解析的相对 import **计违规**）；
2. `tools/audit-layers.lib.ts`：加 `DIRECTION_RULES` 条目（`why` **必须非空**，selftest ⑦ 强制）——
   本层**今天不受任何方向规则约束**（`decision` 既非任何 `from`、也不在 `FORBIDDEN_TARGETS_EVERYWHERE`），
   故**想要约束就必须改规则表本身**；只有**真正零 import** 的文件才进 `PURE_MODULES`；
3. ⚠ **`tsconfig.json:19` 的 `include` 必须加 `decision/**/*.ts`** —— 否则该层**既不被类型检查、
   也不产出 `dist/`**（实测：`outDir: "dist"` + `rootDir: "."`，且**被显式 include 的无消费者文件都有产物**
   —— `dist/core/decision-outcome.js` · `dist/core/polarity.js` 均在）；而 `test:all` = **先 build 再测**、
   测试 import 的是 `dist/` ⇒ **不加 include，测试连 `import` 都失败，且报错指向「文件不存在」而不是「类型错」**
   （会把人往错方向带）。加完必须提交重建的 `dist/`。
   **失败形态已实测**（把 `decision/**/*.ts` 从 `include` 去掉再跑）：`npm run build` → **`exit 0`、零报错**
   （**静默不检查**）、`dist/decision` **不重建**、测试死在
   `ERR_MODULE_NOT_FOUND: Cannot find module '…\dist\decision\guard.js'` ——
   **正是「文件不存在」而不是类型错**，与本行的判断逐字吻合；
4. 接线**或**接受接线债；T1 **明确选后者**，故第 5 步必需；
5. 显式重定棘轮基线，**两个命令都要跑**（各自只重写同一 JSON 的自己那一段）：
   `node tools/audit-wiring.ts . --update-ratchet`
   `node tools/audit-drift.ts . --update-ratchet`
   并在 `CHANGELOG` 写明「本次**主动**增加接线债 + 数量」——**数量就写 §7 实测的那组**
   （**定案值**：`a1 +8` · `a2b ±0` · `a_total +8`；drift 侧**不变**），**不要另写一个说法**（同一个数两处不一致 = 腐烂）。
   三条边界（**已实测**，`tools/audit-ratchet.lib.ts`）：**变多**红（`:67`）· **新桶**红（`:56`）·
   **桶消失**也红（`:60`，「缺件不静默」）⇒ 基线只有**正好等于观测**才绿
   （`观测与基线都是空表` 也不算通过，`:47`）；且语料 EMPTY / PARTIAL 时工具**拒绝**
   `--update-ratchet` 并 `exit 2`（`audit-wiring.ts:193` / `audit-drift.ts:134`），
   以防「工具坏了」被录成新基线；
6. ⚠ **模块归属表按 README 自己的指示**没法**重生成**（本次实测）：
   `README.md:344` 说该表「是**生成**的，不是手写的」，生成器指令在 `README.md:349` 与 `BACKLOG.md:808` =
   `node ../.docs/fix/2026-09-12/t15-module-ownership.ts`；而该目录**已不在本机** ——
   `../.docs/fix/` 现存 `2026-09-14` / `-15` / `-16` 三个日期，**没有 `2026-09-12`**，
   且整个 `.docs` 下**无任何 `t15*` 文件**。同一句还写着「**别在别处手写**」——
   于是加一层之后**既不能重生成、按指示又不许手写**。两条出路，T1 **选 (a)**：
   - **(a) 把生成器重建进 `tools/`** —— 这正是本仓 `AGENTS.md` 自己的结论
     （「**能复现的东西放 `tools/`**」：进版本控制、可被门守），再由它打印行数与批数；
   - (b) 手改，并**当场写明生成器缺失**（不静默）。
   ⇒ 无论走哪条，**不要在别的文档里手写这个数**（`README.md:349` 的口径）；
7. 发版三处一起改（`package.json.version` / README「当前版本」行 / `CHANGELOG` 新条目）
   + **打 tag 并推送**（本仓纪律：提交后必须推 `origin/main`）；
8. `SHADOW_EVAL_ROOT=D:\project\dsh1 npm run verify` ——
   语料根找不到会 **exit 2 且后 3 步不跑**（那一次的「全绿」是**假绿**）。

### 9.3 不动的基线

`tools/retrieval-eval.baseline.json` **不受影响** —— 它量的是 `.shadow` 语料，不是仓库源码。

## 10. 明确不做（T1）

- ❌ shadow 自己**评分 / 阈值 / 排序**并据此形成偏好（§3）
- ❌ `confidence` / 正确率 / 质量分（§4）
- ❌ Preference / Value / Learning / Reward / RL（0037 #10 继续有效）
- ❌ 自动 Decision → Goal · 自动判断「正确决策」
- ❌ **网络 / LLM / jev 后端**（T1 零外部依赖；jev 只作为将来的**后端实现**，另立切片）
- ❌ 新工具名 / 新 `mode` / 新配置键（§7）
- ❌ 改 `adr/0037` 正文（只加补记）
- ❌ DecisionStore / DB / Repository（0037 继续有效）
- ❌ **§7「让 Shadow 成为 Agent 控制层」的定位变更** —— 那是**另一个决定**，
  与 T1 不是一件事，**单独立项**，不写进本 ADR

## 11. 自检（**T1 已落地，逐条实测**）

- [x] `decision/guard.ts` 的判据各有**反例测试** —— `test/decision-primitive.test.ts` 第 ②③④ 块：
      键多 / 键少 / 越界（含 `NaN`）/ 和偏离 1 / `selected` 不在候选集 / `candidates` 空 /
      `rawOutput` 空白 / `engine` 空；外加**边界正例**（恰好落在容差内的和应当通过 —— 证明容差真的生效）
- [x] `orderByReported` **无**任何偏好 / 选择路径消费 —— 全仓仅测试消费它（本层零生产消费者，§7 的决定）
- [x] **全层 6 个文件**的**字段名**里禁词 **0 处**（口径见 §4：作用域是**字段名**，不是全文）——
  由第 ⑨ 块**静态断言**守着，同一块还断言 `types.ts` **零 import**（`PURE_MODULES` 的承诺，与结构门双保险），
  并把**文件集本身**钉进断言（文件集一变就红）。
  ⚠ **自审修正**：第 ⑨ 块原先**只扫 `types.ts`**，而本行的措辞是「本层」⇒ **声称比证明宽**。
  实测其余 5 个文件当时也干净（**结论没错**），但**证据面已补齐**；
  同时 ⑨ 的说明改为「全层 6 个文件」，两处口径对齐。
- [x] `tsconfig.json` 的 `include` 已含 `decision/**/*.ts` ⇒ `dist/decision/` 下 6 个 `.js` + 6 个 `.d.ts` 已产出。
      ⚠ **未**做「故意删一次 include 看是否报错」的破坏性验证 —— 留作可选
- [x] `npm run audit:layers` **0 违规**，且在**新增 3 条方向禁令之后**仍绿（`decision` 现受
      `core↛decision` / `decision↛query` / `decision↛tools` 约束；`why` 非空由 selftest ⑦ 强制）
- [x] 两处棘轮基线已**显式**重定（`--update-ratchet` 各跑一次，随后 `audit:ratchet` 报「与基线逐桶相等 ✅」）；
      `CHANGELOG` 写明**同一组**数（§7 定案值）
- [x] `adr/0037` **正文未动**（`git diff --numstat` = `27 0`，纯追加；6 个原标题全在，只多一个 `## 补记`）
- [x] `SHADOW_EVAL_ROOT=D:\project\dsh1 npm run verify` → **exit 0**，末行 `[run-tests] ALL PASS ✅`
      （**62 个检查全通过**）
- [x] 模块归属表：生成器已重建为 `tools/module-ownership.ts`（§9.2 第 6 步选 (a)）并由它打印
      **28 行 = 27 个目录 + `index.ts`**；`README.md` 与 `BACKLOG.md` 的**死指针**一并改指它
      ⚠ 过程中 `audit:ratchet` **判红过一次**（`b_keys 95 → 100（+5）`）—— 因为初版把 `=== "(root)"`
      内联散在 5 处；收成一处 `isRoot()` 后回到 95。**这是「判据收一处」有执行形态的证据**
- [x] **端到端**（第 ⑪ 块）：`produced` 产出的 `AtomLineage` 能过**真实**的 `core/lineage-validator.ts`
      投影门（**正例**），且**无 evidence** 时被**下游**挡下（**反证** —— 否则上一条是恒真的假绿）
- [x] **T19 有执行形态**（第 ⑫ 块）：断言 `ENGINES` 里**没有任何后端报分布**；
      引入概率型后端会让它变红，报错直接指向 §12 与 `BACKLOG` 的 `T19`

## 12. 本 ADR **最弱的一环**（自审后如实写下，不许粉饰）

`reportedDistribution` 与 `adr/0037` 的「❌ Confidence（决策置信度）」之间，
**不是「换个名字」就能划开的**：一个候选集上的概率分布，**在语义上就是**「哪个更好的置信度」。
§1.4 / §4 用「命名站在不确定性一侧」来辩护 —— **那是本 ADR 最弱的论据**
（有「让文档比事实强」之嫌，与 D8 同族）。自审时**保留它但降级为辅助**，真正承重的是另外四条：

1. **谁算的** —— 数字由**引擎**算，shadow **从不计算**（0037 禁的是 shadow 生成 / 推断）；
2. **怎么留的** —— `rawOutput` 与分布**逐字留存**，它是**证据**，不是 shadow 的断言；
3. **谁消费** —— 全仓**无人**把它当权威（不设阈值、不做优化；`orderByReported` 是只读视图，且**无生产消费者**，
   已由 `test/decision-primitive.test.ts` 与「本层零生产消费者」两处共同保证）；
4. **生产里根本不存在** —— **T1 的唯一引擎报 `null`**（§4「刻意如此」第 1 条）。

⚠ **第 4 条意味着：T1 的一部分安全性来自「还没有概率后端」这个事实本身，而不是来自本 ADR 的论证。**
⇒ **真实概率后端（LLM / jev）落地的那一版，必须把这道门重新审一遍并另立 ADR**，
**不得**以「本 ADR §6 已经做过范围澄清」为由**继承结论**。届时须正面回答 `adr/0037` 那一段理由
摆出的问题（抽取结果是不是事实？source 指原文还是模型？同一段话不同模型是否得到不同 Decision？
如何验证无 hallucination？失败怎么办？）。**本 ADR 不做这个判断** —— 那是下一个切片的事。

**这道门已经有执行形态**（v1.16.2 补）：`test/decision-primitive.test.ts` 的第 ⑫ 块断言
「**`ENGINES` 里没有任何后端报分布**」。引入概率型后端会让它**变红**，且报错直接指向本节与
`BACKLOG.md` 的 `T19`。⚠ 该块的注释里写明：**不许为了让测试变绿而改断言** ——
那正是本仓说的「**改门而不改事实**」；要改它，先按上面那条另立 ADR。
