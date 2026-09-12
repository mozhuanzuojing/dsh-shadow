# ADR-0081: M1 Decision Memory —— 「决策 → 结果 → 经验」契约草案（含 M1–M5 现状清点）

- 状态：**草案（待用户拍板 3 处）** / 2026-09-12
- 依据：用户 2026-09-12 评审（双泳道 + M1–M5 能力序列）；`adr/0037-decision-capture-boundary.md`（M1 的写侧边界**已冻结**）；`BACKLOG.md` **T15**（Protected Contract Registry 规格）
- 定位：**这是 T15 Registry 的第一条真契约** —— 用一条真契约把登记册逼出来，而不是先造一个抽象登记册。

## 1. 为什么 M1 排第一（用户原话 + 本仓现状支持）

用户：**「如果现在只选一个新 Memory 能力，我会选 Decision → Outcome → Lesson」**，
因为它同时回答：为什么这么做 / 当时有哪些选择 / 依据是什么 / 后来结果怎样 / 经验还能不能用 / 为什么现在该改变原判断。
而它**能直接复用已完成的 Evidence + Validation + Temporal + Ratchet**。

本仓现状**支持**这个判断，而且比预期更有利（见 §2）：**最难的那条边界（不把推断当理由）已经在 ADR-0037 冻结**。

## 2. 现状清点（M1–M5 × 已有 / 缺什么；每条带证据）

> 口径：只读源码与 ADR；**未跑任何真实决策链路**。凡「已有」都指**代码/ADR 里存在该机制**，不代表端到端跑通。

### M1 Decision Memory —— **已有 50%，缺的是一小块明确的边**

| 用户要的字段 | 现状 | 证据 |
|---|---|---|
| `decision`（决定本身） | ✅ **已冻结为写侧一等事件** `DecisionEvent`；落盘 `> 决策：〔source〕statement` | `adr/0037` §Decision 2 + 「决策事实与理由分离」 |
| `reasoning / why` | ✅ **已冻结**：`DecisionReason` 落盘 `> 决策理由：〔source〕reason`，**且「绝不生成理由」**（原文明确存在才算） | `adr/0037:29-42` |
| `subject` | ⚠ **未成文**：决策目前挂在 **入口/Episode**（`entry` + 时间）上，**没有 subject 维度** | `core/episode.ts`、`adr/0038` |
| `alternatives`（当时有哪些选择） | ❌ **缺**。`dream/types.ts:19` 的 `alternatives` 是**假设的替代解释**（`alternativeExplanation`），**不是决策的备选方案** | `dream/types.ts:19`、`dream/compress.ts:55` |
| `evidence`（当时依据） | 🟡 **半有**：`DecisionReason` 是原文事实，但**没有「这条决策的依据是哪条记忆/证据」的显式引用**（Evidence Lineage 在 reality/validation 域，未接到决策上） | `validation/types.ts:3`、`reality/claim/engine.ts:13` |
| `outcome.status: pending` | ❌ **缺关键的一半：没有「决策 → 后来结果」这条边**。现有 `outcome` 是两处**别的**东西：`observer/trace.ts:26` 的 `outcome{expected,actual}`（**轨迹**的结果）与 `validation` 的 `ValidationOutcome`（**假设**的验证结论） | `observer/trace.ts:26,62`、`validation/types.ts:23` |
| `lesson` | 🟡 **有但不合格**：`observer/arbitrate.ts:71 lessonOf` 存在，但它派生自**取代/证据存活状态**（「同入口已被更新，引用前先查最新记忆」），**不是**基于「这个决策执行得怎样」 | `observer/arbitrate.ts:71-72`、`query/query.ts:248` |

**⇒ M1 的缺口只有三件（都不推倒已有）：**
1. **决策 → 结果 的边**（`DecisionOutcome`）：`decisionRef` + `observedAt` + `actual`（外部观察）+ `source`（谁观察的）；
2. **结果的结算状态机**：`pending → observed → settled`（**并且允许 `unresolved` 而不是编一个结果**）；
3. **`alternatives`（可选）**：当时显式列出的备选；**同样只收原文明确存在的**（与 `DecisionReason` 同一纪律）。

### M2 Outcome Memory —— **已有「结果的形状」，但对象错了**

| 现状 | 证据 | 判断 |
|---|---|---|
| `validation` 有完整 outcome 状态机 `validated/observed/rejected/expired` + append-only 历史 | `validation/types.ts:23,34,44`；`test/recall-attribution.test.ts:2754`（场景 88：历史保留） | ✅ **可直接借用形态**，但它的对象是 **Hypothesis（假设）**，不是 **Decision（决策）** |
| `long-horizon` 有 `ActionFeedback`（执行 → 观察变化 → 成功指示 → 意外效应） | v0.39 自陈：`History→Recall→Adaptation→Planning→Action→Success→History`；`long-horizon` 域存在 `Feedback` 概念（`MEMORY.md` 的 v0.39 段） | 🟡 **已经有「行动 → 反馈」**，但同样**没有接到 Decision 上** |
| `observer/trace.ts` 的 `outcome{expected, actual}` | `observer/trace.ts:26,62` | 🟡 「预期 vs 实际」的形态已在，属**轨迹级** |

**⇒ M2 不是新建对象，而是「把已有的 outcome 形态接到 Decision 上」**（避免第二个平行 outcome 概念 —— 否则就是本仓最忌的「判据分叉」）。

### M3 Pattern Memory —— **已有统计，缺「一等对象」**

| 现状 | 证据 | 判断 |
|---|---|---|
| `decision→outcome` 相关性统计（纯统计、确定性标记集、无 AI） | `reflection/patterns/success-rate.ts:1-29`（`ReflectionDecisionOutcome = {decision, outcome, count, successRate}`） | ✅ **M3 的算法内核已存在** |
| 重复决策 / 重复结果的 tally（≥2 次） | `reflection/patterns/decision-outcome.ts:15-16`（`repeatedDecisions` / `repeatedOutcomes`） | ✅ 已有 |
| **完整性闸门**：只有「decision + outcome 齐备」的轨迹才参与 Reflection | `reflection/types.ts:22`、`reflection/engine.ts:20` | ✅ **这正是 M1 缺口的直接后果**（决策没结果 ⇒ 进不了 Pattern） |
| cross-domain abstraction（不同 decision 共享同一 outcome → 候选抽象） | `dream/compress.ts:18-55` | ✅ 已有雏形 |
| **缺**：Pattern 作为**一等对象**（`observations` / `support` / `counter_examples` / `confidence` / `evidence[]`） | 现在只活在 `reflection.learning.statement` + `evidenceCount` 里 | ❌ **M3 的真缺口**：`reflection/types.ts:8` 的结构**没有反例字段**，而用户 schema 明确要 `counter_examples` |

**⇒ M3 的关键增量 = 给 Pattern 补 `counter_examples`（反例）与一等对象身份**；**反例是本仓「不伪造精度」纪律的必然要求**（只报 support 不报反例＝自欺）。

### M4 Memory Revision —— **机制已有，缺「修订作为一等对象」**

| 现状 | 证据 | 判断 |
|---|---|---|
| `Forget ≠ Delete`、`superseded` 生命周期 | `core/lifecycle.ts`、ADR-0031、ADR-0061 | ✅ 已有 |
| append-only 历史（observed → rejected 后历史仍在） | `test/recall-attribution.test.ts:2754` | ✅ 已有（**这条正是 M4 需要的「时间连续性」**） |
| 取代的**确定性**（不靠相似度/LLM） | ADR-0059/0061；`adr/0080` 证明「阈值不可达」 | ✅ 已冻结 |
| **缺**：`revision` 作为一等对象 + **触发它的证据引用**（「因哪条证据而改判」） | `observer/arbitrate.ts` 的裁决只给 verdict/outcome/reflection，**不改写原记忆**（这是对的），但**没有留下「为什么改判」的可追溯对象** | ❌ M4 的真缺口 |

### M5 Memory Utility —— **有「召回计数」的雏形，缺「有用性」**

| 用户要的度量 | 现状 | 证据 |
|---|---|---|
| `recall_count` | 🟡 **有**：`hits` 累积（D7 讨论过「哪些读入口算命中」）；`queryLog` 有查询观测 | `BACKLOG.md` D7；`retention` 的 hotness |
| `useful_count` / `influenced_decision` / `prevented_duplicate_work` / `caused_rework` | ❌ **全缺** | —— |
| 衰减（decay） | ✅ 有：MemoryBank hotness（`halfLifeDays`） | `ADVERSARIAL`：ADR-0065 勘误；`retention` |

**⇒ M5 的前提是 M1**：没有「决策 → 结果」，就无从判断某条记忆**是否影响了决策**、**是否避免了返工**。

## 3. M1 契约（按 T15 Registry 十字段填写）

> 这一节就是 T15 要求的 **Protected Contract Registry** 的第一条真条目 —— `Contract ≠ API list`。

| 字段 | 值 |
|---|---|
| **id** | `decision-outcome-lesson-v1` |
| **surface** | **落盘格式**（`.shadow/<date>/…md` 内的 `> ` 行）+ **工具 schema**（`read_shadow` 的 mode/参数）+ **派生件**（`_index.md` 的经验段） |
| **owner** | **`observer/`**（决策与理由的捕获与裁决）· 结果边归 **`validation/` 的形态**但**不得**由 `validation` 拥有决策 —— 见分工表 |
| **semantic meaning** | 「这条记忆说的是：**当时决定了什么、为什么、还有哪些选择；后来实际发生了什么**」。**不是**「系统认为这个决策好不好」。 |
| **stability** | `hard`：`DecisionEvent` / `DecisionReason` 的**分离**与「**绝不生成理由**」（ADR-0037 已冻结）；`soft`：`alternatives` / `outcome` 的具体字段名与落盘行格式 |
| **allowed changes** | **additive**：新增可选字段（如 `alternatives`）；新增 `mode`；新增渲染行。**不得**改变已有行的语义。 |
| **forbidden changes** | ① **不得**让系统**推断**结果的优劣或理由（ADR-0037 + ADR-0059）；② **不得**为已有决策**编造** outcome 或 lesson（缺就写「未观察到」）；③ **不得**新建第二个 outcome 概念（必须接到 `DecisionEvent` 上，而不是再造一个平行对象）；④ **不得**用相似度/LLM 做「这条结果属于哪个决策」的归属判断（归属必须**显式**或**同入口+时间窗**的确定性规则）。 |
| **evidence** | `adr/0037:29-42`（事实/理由分离）· `observer/trace.ts:26,62`（expected/actual 形态）· `validation/types.ts:23`（outcome 状态机形态）· `reflection/types.ts:22`（decision+outcome 齐备才入 Pattern）· `observer/arbitrate.ts:71`（现有 lesson 的派生来源） |
| **verification** | 待建：① `DecisionOutcome` 只接受**外部来源**（用户/工具/CI）——负例：无来源的 outcome 必须拒绝；② **无结果时的渲染必须是「未观察到」**（负例：不得输出空串或 0）；③ `alternatives` 只接受原文明确存在的项；④ 归属规则的确定性（同输入同归属）。落 `test/` + 棘轮。 |
| **ratchet** | 暂用现有 **`audit-wiring` A 段**（新导出必须有生产调用点）+ **`audit-layers`**（结构门）；**待建**：`decision-outcome` 的覆盖计数桶（有决策无结果的条数 ⇒ 应**只降不升**） |

## 4. 分工（模块归属 —— 用来暴露越权）

| Module | Owns | Reads | Writes | **Must not own** |
|---|---|---|---|---|
| `observer/` | **决策事实 / 决策理由 / 裁决**（verdict, outcome, lesson 的**派生**） | trace、episode、时间 | 决策与理由的采集、裁决结果 | **不得**拥有「结果好不好」的判断（那是外部观察） |
| `validation/` | **假设**的验证结论 + append-only 历史 | evidence、temporal | validation 状态 | **不得**拥有决策（决策不是假设） |
| `reflection/` | **Pattern 统计**（decision→outcome 相关性） | trace / decision / outcome | reflection 候选 | **不得**拥有决策本身、**不得**写回原记忆 |
| `long-horizon/` | **行动 → 反馈**（ActionFeedback） | history / planning | feedback 记录 | **不得**替决策判定归属 |
| `dream/` | **候选抽象 / 替代解释** | episodes / patterns | 候选（不进主路径） | **不得**把候选当结论 |

## 5. 待用户拍板（三处，缺一不动手）

1. **结果从哪来？**（这是 M1 成败的唯一关键）候选：(a) **只收显式外部来源**（用户明说「结果如何」/ 工具/CI 输出）；
   (b) 允许**同入口 + 时间窗**的自动归属（确定性规则，不看语义）；(c) 允许 LLM 归属（**我建议否决**，撞 ADR-0059）。
2. **`subject` 要不要**（决策挂在 subject 上，还是继续挂 entry+时间）？引入 subject 会与 Episode/entry 的既有坐标**并存还是取代**？
3. **结算窗口**：决策多久没结果就标 `unresolved`（而非 `pending`）？需要给一个可解释的默认（并**不做成硬编码魔数**，走 config）。

## 6. 与两条泳道的关系

```text
🛡️ Contract Track : T8 → T15(Registry) → D1/D2/D3 → Contract Freeze → T14
🧠 Memory Track   : M1(本 ADR) → M2 → M3 → M4 → M5
                    └─ M1 的契约条目**就是** T15 Registry 的第一条 ⇒ 两条泳道在此交汇
```
**M1 不新增「横向功能」**：它只把已有的 `DecisionEvent`（ADR-0037）与已有的 outcome 形态（`validation` / `trace`）
**连成一条边**，并补上结算状态与（可选）备选方案。

## 7. 用户拍板与我的一处异议（2026-09-12，本 ADR 的决策记录）

| # | 问题 | 用户决定 | 我的处理 |
|---|---|---|---|
| 1 | 结果从哪来 | **允许 LLM 判断归属** | ⚠ **我有异议**，提出**两层合成设计**（见 §7.1）—— 若你坚持，我按你的做，但要先接受 §7.1 列出的四条代价 |
| 2 | 要不要 `subject` | **引入 subject，与 entry 并存** | ✅ 接受，并补一条**来源纪律**（见 §7.2） |
| 3 | 结算窗口 | **不设窗口：永远 `pending` 直到有结果** | ✅ 接受，并补一条**可见性要求**（见 §7.3）—— 否则「还没到」与「永远不会到」不可区分 |

### 7.1 异议：LLM 归属会打在**事实层**，而事实层正好是我们刚做可信的那一层

**先说清楚我反对的是什么**：不是「不许用模型」，而是**「归属」这一判断如果进了受契约保护的事实层**，会产生四条具体后果：

| # | 后果 | 证据 / 推理 |
|---|---|---|
| ① | **不可复现 ⇒ 棘轮会抖** | 同一条记忆、换一个模型版本就可能换一个归属 ⇒ **Pattern 计数、M5 的 `influenced_decision` 都会漂**，而 **V6/V7 刚把「线索集合未经批准的变化」做成会红的门**。归属漂移会被棘轮如实报成「变化」——**门会红，但不是因为真变了，而是因为判断重跑了**。这会把门变成噪声源（正是 V6 当初要避免的「噪声导致跳过」）。 |
| ② | **不可审计** | 「这条结果为什么归到这个决策」在 LLM 路径上没有可核证据（没有 `文件:行号`，没有规则）；而本仓纪律是**每条结论要能点出来源**。 |
| ③ | **精度上界已被别家量过** | `adr/0080`（MemStrata）：语义判断在「是否相关」这类任务上 **AUROC 0.5926**、**任何阈值 precision 上限 0.667**，「安全自动化的 0.95 floor 不可达」。而 M5 要拿归属算 `influenced_decision` / `caused_rework` ⇒ 这些**指标会带一个不可量化的偏差源**，且无法说清分母。 |
| ④ | **与已冻结的边界直接冲突** | `adr/0037:29-42` 冻结的是「**Reason 绝不生成**」。**归属比理由更强** —— 理由只是转述原文，归属是在**断言因果**（「这个结果属于那个决策」）。既然较弱的那个都不能生成，较强的更不该由系统生成。 |

**⇒ 我的合成设计（两层，能拿到你要的覆盖率，同时不污染事实层）**：

```text
原文/用户/工具/CI 明确说出结果 ──┐
                               ├─→ 【事实层】DecisionOutcome（受契约保护，进 Pattern / M5 / 棘轮）
同入口 + 时间窗（确定性规则） ──┘        ↑ 只能由这两条路写入
                                        │ 需「确认」才升级
LLM 提议的归属 ──→ 【候选层】proposal（source=model-proposal, confidence, evidence[]）
                    · 永不进事实层
                    · 只在 read_shadow 的**候选视图**里出现，并明确标「未确认」
                    · 可被丢弃 / 重新生成，**不影响任何计数与棘轮**
```

- **这不是新发明**：本仓**已有两个同形先例** —— `dream/` 产出的候选**不进主路径**；`world` 的 status 恒为
  `hypothesis/validated/rejected`、**永不 `fact`**（`world/guard/relation-guard.ts:18`）。
- **它给回你要的东西**：模型可以**大规模提议归属**（覆盖率不是问题），人只做「确认」这一下；
  而**事实层保持可复现、可审计**，Pattern/M5/棘轮的读数才不会抖。
- **代价（诚实说）**：多一层「确认」步骤；若你不确认，候选就一直是候选。
- **如果你仍要 LLM 直接进事实层**，我按你的做，但需要你在 §3 的 `forbidden changes` 里**显式改掉第 ④ 条**
  （「不用相似度/LLM 做归属」），并在契约里登记「**归属不可复现**」这一已知限制 ——
  **不能默默实现**，否则契约与实现对不上（那正是本仓最忌的「台账比事实强」）。

### 7.2 `subject`：接受并存，但**来源必须显式**（否则又是一次判据分叉）

- **落盘**：新增一行 `> 主题：〔source〕subject`（`additive`，不改已有行）。
- **来源纪律**：`subject` **只接受显式提供**（工具 mode 参数或采集时原文明确存在），
  **未提供即 `未指定`，绝不从文本推断** —— 与 `adr/0037` 的 `DecisionReason` 同一纪律。
- **与 `entry` 的关系**：`entry` 仍是**入口坐标**（召回与索引的主键），`subject` 是**概念坐标**（跨入口聚合）；
  两者**并列**，`subject` 缺失不影响任何既有读路径（这才叫 additive）。
- **待定（不脑补）**：`subject` 的**规范化**（大小写/别名/中英混写）是否需要？若要，
  必须**确定性规则 + 白名单**，不得用相似度（否则同一 subject 裂成多个，M3 反而更难）。

### 7.3 永远 `pending`：接受，但**读数必须让「永远不会到」可见**

- 不设窗口 ⇒ `pending` 会**无限增长**。风险不是数据错，而是**失效不可见**（ADR-0049「缺件不静默」同族）。
- **强制要求（写进契约的 `verification`）**：任何报告决策结果的读数**必须同时印出**：
  ① `pending` 条数；② **年龄分布**（<7d / <30d / <90d / ≥90d）；③ **最老一条 pending 的日期与入口**。
  ⇒ 这样「还没到」与「永远不会到」在读数上**可区分**，而不需要额外状态。
- **代价（诚实说）**：`unresolved` 这个状态**不再存在**，所以「这条决策最终无人结算」不会被系统标出来 ——
  只能靠上面的年龄分布被人看见。**这是你的选择，我按此实现，但把它记在契约的已知限制里。**

### 7.4 用户确认（2026-09-12，最终）：**选 A**，并把两层设计**升为通用原语**

用户接受异议，并明确：

> **「LLM 可以提高『发现候选』的召回率，但不能提高『事实』的权威性。」**
> **「只有 FACT 可以改变系统的认知统计；CANDIDATE 只能改变『待确认候选』的统计。」**

并**把它推广为所有 Memory Intelligence 能力的共同纪律** ⇒ 已单独立 ADR：**`adr/0082`（Proposal → Confirmation → Fact）**。
该 ADR 同时冻结了用户补充的三条硬要求：

1. **proposal 必须自带「基于什么提议」**：`source` / `model` / `prompt_version` / `input_refs[{file,line}]` / `proposed_relation`
   （**缺一不得入库** —— 否则 proposal 连被复核的资格都没有）；
2. **proposal 不参与任何事实统计**（六条禁令：Pattern count / influenced_decision / confidence / ratchet baseline /
   knowledge fact / identity）；唯一允许的是 `candidate coverage` / `acceptance rate` / `rejection rate`
   —— **度量模型能力，不修改世界状态**；
3. **confirmed proposal 必须留下升级链**：`P ──confirmed_by──→ C ──→ F`，**没有 C 的 F 不存在**。

**M1 因而有了明确的前置**：先有 **P1（`adr/0082`）** 这条原语，M1 是它的**第一个使用者**。
**本 ADR 的 §3 契约据此收窄**：`decision-outcome` 的 `forbidden changes` **保留**第 ④ 条禁令（不用相似度/LLM 做归属），
并把「LLM 归属」**移到候选层**（`adr/0082`）。

## 8. 实现（M1-A 已落地，v1.15.51）：确定性归属 + 接进原语

**落地物**：`core/decision-outcome.ts`（纯函数：归属规则 / 原语记录构造 / `pending` 读数 / `p90`）
+ `test/decision-outcome.test.ts`（**11 组闸**）；`tsconfig.json` 显式纳入编译面。`npm run verify` = **51/51**。

### 8.1 归属规则 `same-key-window/v1`（**确定性 + 保守**）

```text
观察 O 归属决策 D ⇔ ① 同一 key ② O.at ≥ D.at ∧ lag ≤ windowDays
                    ③ 取窗内**最晚前驱** ④ **并列 ⇒ 不归属**（计入 ambiguous，可见）
```
- **`key` 由调用方显式传入**：`ObservationTrace` 里**没有 `entry`**（只有 `id`/`observerId`/`createdAt`/`decision?`/`outcome?`）
  ⇒ **本 ADR 明确不发明 entry 的推导**（那正是「不得推断」的边界），与 §7.2「`subject` 只接受显式提供」一致。
  ⚠ **因此「`key` 从哪来」这条链仍未接** —— 那是 **M1③ 的显式入口**设计。
- **并列不归属**而不是任选：与 ADR-0061「**错误关链是静默破坏**」的不对称一致 —— **宁可少归属，不可错归属**；
  且 `ambiguous` **计数可见**（ADR-0049）。
- **一个决策可有多个结果事实**：本模块**不挑「那个」结果**（挑选＝判断）。`windowDays` 由调用方给（§5 待定项）。

### 8.2 「结果事实只能经原语产生」已接线

```text
attributeOutcomes ─→ Attribution（**候选层**）─→ toPrimitiveRecords
   ─→ Proposal(source=user/tool/ci · inputRefs 必填) + Confirmation(actor="tool", reason="rule:… key=… lag=…d")
   ─→ core/proposal.ts#projectFacts ─→ **Fact**
```
**内容来源 = 观察者**（外部）；**确认 = 确定性规则**（`actor:"tool"`，`reason` 写明规则与数字 ⇒ 可审计）。
闸 ⑧ 直接验证：本模块**不返回 `facts`**，且**直接写 `type:"fact"` 仍被拒**。

### 8.3 `pending` 读数（年龄**只暴露风险、不改变状态**）

`decisions / settled / pending / ambiguous / unattributed` + 年龄分布（<7d · 7–30d · 30–90d · ≥90d）+ **最老一条** + **`pendingAgeP90`**
（nearest-rank，**不插值**）+ 一行渲染。闸 ⑩ 验证：**换 `now` 只改读数、不改状态**；**无 pending ⇒ p90 = `null`（不可测不报 0）**。

### 8.4 §5 的三处待拍板仍然待定（未替用户决定）

`key`（≈`subject`）的**显式入口**在哪 · `windowDays` 取多少 · 是否落盘与落在哪（`adr/0082` §6）。
**未做**：M1③ 的显式入口、落盘、读路径渲染（**故当前没有生产消费者** ⇒ A 段线索仍待接线，棘轮已按规程重录并说明）。

---

## 9. M1-A′ 端到端 dry run（2026-09-12，用户同意后执行）

**做法**：拿**本会话真实发生过的决策**（不是编的样例）走完整链路
`attributeOutcomes → toPrimitiveRecords → projectFacts → candidateStats / outcomeReadout`。
探针：`.docs/fix/2026-09-12/m1-dry-run.ts`（TypeScript，`node` 直跑；**只读、不落盘、不改状态、不接读路径**）。

**输入**：9 条决策（含 2 条**故意构造**的边界）+ 10 条观察。**输出**：归属 7 · 歧义 1 · 未归属 2 ·
原语记录 Proposal 7 / Confirmation 7 / **违规 0** · 事实 7 条（全部 `fact-outcome-*`）。

### 9.1 验证到的（被真跑，不是被断言）

| 路径 | 真实输入 | 结果 |
|---|---|---|
| 正常归属 | `DEC-1 ← OBS-1`（verify 46/46 通过） | ✅ 归属，`rule same-key-window/v1` |
| 一决策多观察 | `DEC-4 ← OBS-3` 与 `DEC-4 ← OBS-4` | ✅ 两条独立事实，**读数按决策聚合**（`settled` 不虚增） |
| 同刻并列 | `DEC-8`/`DEC-9` 同 key 同刻 | ✅ 判 `ambiguous` 且**不归属**（无猜测） |
| **真超窗**（31d > 30d） | `DEC-10 ← OBS-10` | ✅ 判 `unattributed` 且**可见**（未静默丢） |
| 键不匹配 | `OBS-8` | ✅ 判 `unattributed` |
| 无确认 | `DEC-2` / `DEC-7` | ✅ 判 `pending`，**年龄只进读数** |
| 事实唯一来源 | 全链路 | ✅ `违规 0`；事实只经 `projectFacts` 产生 |

**本 dry run 自己暴露的一处错（已修正并重跑）**：第一版把 `22:00 − 17:00 = 5h` 标成「超窗」——
`lagDays` 是整日粒度，**5 小时 = 0d，在窗内**。修正后补了真正的 31d 超窗对，`未归属` 由 1 变 2。
⇒ 「边界用例是构造出来的，不等于被构造对了」；**fixture 本身要当被测对象看**。

### 9.2 由摩擦反推的载体要求（M1③ 的设计输入）

手工走这一遍，卡点如下。**F6 / F8 是本次最值钱的两条**（它们都是**契约缺维度**，不是实现 bug）。

| # | 摩擦 | 反推出的要求 |
|---|---|---|
| **F1** | 我能说出 `inputRefs.file`，**说不出 `line`** | `inputRefs` 的行号**必须由载体自动填**（或允许「文件+锚点」）。若强制手填，人只会填 `line: 1` ⇒ **闸还在、证据没了** |
| **F2** | `key` 要人判断「这两条是不是同一主题」 | 自然形态 = **建议 key（候选）+ 人确认** ⇒ 与 P1 两层**同构**，不需要第二套机制 |
| **F3** | 确认时看不见证据 ⇒ `actor:"human"` 是**盲签** | **证据展示是确认动作的必需项**，不是装饰 |
| **F4** | `DEC-4` 天然有 2 条观察 | 事实层**一决策多事实是常态** ⇒ 读数必须按决策聚合（已如此） |
| **F5** | 真实数据里 0 歧义、0 超窗（本次 1+2 **全是构造的**） | `ambiguous` 通道**保留但不应常响**；常响 ⇒ key 设计或 `windowDays` 取值有问题 |
| **F6** ⭐ | 4 条 pending 里 `DEC-2`/`DEC-7` 都是「**刻意不做**」，schema **区分不出「刻意不做」与「忘了做」** | M1 需补 **`disposition`（`open` / `deliberate-deferral`）**，否则 age 读数把两者一起报成「积压」——**不是错，是缺维度** |
| **F7** | 7 条归属**全是 `lag 0d`**，实际间隔 5 分钟 ~ 5 小时 | 整日粒度对「当天决策-当天结算」**丢失全部分辨率** ⇒ 若要支撑「结算得多快」，lag 需**小时级** |
| **F8** ⭐ | 「接受率 **1**」是**自产自销**：7 条确认全由规则代码生成（`actor:"tool"`），**0 条来自人的真实确认** ⇒ 100% **零信息量** | 候选统计**必须按 `actor` 分层**（human / tool / ci），否则 tool 自确认能把接受率刷成满分——**这正是「candidate 统计只能用于待确认候选」最容易被绕开的地方** |

### 9.3 dry run **不能**回答的（不得据此设计）

- **确认是否高频、是否要批量、是否要 diff、批与批之间怎么排** —— 本次 **0 次真实确认动作**（确认是代码生成的）。
  ⇒ 这三条**必须等真实使用**才能拍，**不据本次 dry run 决定**。
- **采集侧能不能拿到 decision / outcome 的原文** —— 本次记录是**事后手工整理**，不是采集流产生的。
- **`windowDays` 取多少** —— 本次取值只为跑通，**不构成取值证据**（§5 仍待拍板）。
- **`inputRefs.line` 的真实可获得性** —— 本次**全是占位**（F1 本身就是这条的证据）。

**结论**：M1 的**机制**被真跑验证；M1 的**载体**只得到了**要求清单**（9.2），**形状仍未定**。
F6 / F8 先落进 `BACKLOG.md` 的 M1 泳道（它们是契约缺维度，**优先级高于** M1③ 的入口形状）。


---

## 10. M1-A′ 发现项的修复（2026-09-12，v1.15.53）—— 把「要求清单」变成「已修的契约」

§9 的摩擦清单里，**能在模块内修的当场修完**；只有依赖载体的（F1/F2/F3）**不修**，因为载体仍刻意未定。

| 发现 | 修法（都在 `core/decision-outcome.ts` / `core/proposal.ts`） | 闸 |
|---|---|---|
| **F6** 刻意不做 ≠ 忘了做 | `DecisionRecord.disposition?: "open" \| "deliberate-deferral"`（**缺省 `open` ⇒ 向后兼容**）；读数分 `pendingOpen` / `pendingDeferred`，**年龄分布 / 最老 / p90 只统计 `open`**；渲染显式标注「刻意推迟 N（不计入积压）」 | ⑫ |
| **F7** 整日粒度丢分辨率 | `Attribution.lagHours`（`floor`，**不插值**）；`Confirmation.reason` 写成 `lag=<d>d(<h>h)` ⇒ 审计串同时含两个粒度 | ⑭ |
| **F8** tool 自确认刷满分 | 见 `adr/0082` §8.4：`byActor` 分层 + **总体率只认 human**，无 human 裁决 ⇒ `null` | `adr/0082` ⑫ |
| **注释承诺却没实现** | `toPrimitiveRecords` 的 `continue` 处注释写着「故下面单独报」，**代码里没有那个报** ⇒ 新增返回 `missing: string[]`，观察缺失时**报出缺了哪条**而不是静默少一条事实 | ⑮ |
| **读数口径分叉隐患** | `outcomeReadout` 不再自己判断「有没有键」，改用 `AttributionResult.considered`（**归属层给出**）⇒ `unkeyed:"include-as-unkeyed"` 模式下两处不会分叉；差额报成 `unconsidered` | ⑬ |
| **年龄不可测被吞** | `at` 不可解析 ⇒ 报 `unmeasurable` 计数（**缺件不静默**，ADR-0049），不再当 0 岁混进分布 | ⑬ |

### 10.1 修复后**用同一批真实决策重跑**（证据，不是断言）

同一支探针（`.docs/fix/2026-09-12/m1-dry-run.ts`）改判 `DEC-2`/`DEC-7` 为 `deliberate-deferral` 后重跑，读数变成：

```text
决策 10 · 已结算 5 · 待结算 5 ·（<7d 2 · 7–30d 0 · 30–90d 1 · ≥90d 0）· p90 42d · 最老 2026-08-01T10:00:00Z（42d）
         · 刻意推迟 2（不计入积压）· 歧义 1 · 未归属 2
在等(open) 3 · 刻意推迟 2 · 未参与归属 0 · 年龄不可测 0 · missing 0 ✅
候选 7 · 已确认 7 · 已拒 0 · 已撤销 0 · 待确认 0 · 口径自查 7 = 7+0+0+0 ✅
[tool] 确认 7 · 拒 0 · 撤销 0 · 接受率 1 · 拒绝率 0
总体接受率 **不可测（null）**   ← F8 修复后的正确行为：无人类裁决 ⇒ 不报假满分
lag 粒度：lagDays=0 / 0h,1h,0h,0h,0h,0h,5h   ← F7 修复后能看到小时级差别
```

**这张读数表本身就是修复的证据**：同一个「接受率 1」在修复前会被当成总体质量指标，现在被限制在 `[tool]` 分层里，
总体报 `null`（不可测）；同一个 254d 的「刻意不做」在修复前会进 `≥90d` 桶并成为「最老」，现在**不进桶、不占最老**。

### 10.2 仍然未修（依赖载体，刻意不动）

- **F1** `inputRefs` 行号谁来填 · **F2** `key` 的建议与确认 · **F3** 确认时如何展示证据 —— 这三条**只在载体里**才有答案；
- **M1③ 的显式入口、落盘、读路径渲染** —— 仍未做 ⇒ **仍无生产消费者**（棘轮已按 V6/V7 规程重录并说明：`b_keys 104 → 105`，新增的判断值是 `core/proposal.ts` 里 `action=reject` 的读点，**正是本节引入的 `revoke ≠ reject` 分类**）。
