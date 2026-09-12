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

