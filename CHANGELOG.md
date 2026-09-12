# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本；每个条目保留完整决策/边界/验证记录。


## [v1.15.55] **修台账里的高危条目（6 类）＋ 修闸自身的 2 处缺陷** —— `verify` 52/52

**一句话**：继续 `review fix all`，这次动手的对象是**上一轮自己记下的高危线索**（会永久改变可见状态、当前不出声），
外加**本轮真实撞上的、审计闸自身的两处缺陷** —— 后者比被审对象的问题更该先修。

### 1. 高危条目（ADR-0083 §6.1）

| 缺陷 | 为什么是真缺陷 | 修法 |
|---|---|---|
| **flush 顺序反了** | 先 `pending.delete`/`comps.delete`，**再** `if (!ws \|\| !fs) return` ⇒ 取不到工作区/会话 fs 时**整批记录已被消费**：没落盘、也没留痕（`lastFlushError` 未设 ⇒ 读侧 `getFlushWarn()` 恒空，**告警在最需要它时失效**） | 取 ws/fs 提到消费**之前**；取不到 ⇒ **保留 pending** + 设 `lastFlushError` + `console.error` |
| **索引失败后照读陈旧索引** | `rebuildIndex` 吞异常返回 void；`ensureIndex` 无条件清 `indexDirty` ⇒ 一次失败后**再也不重建**，调用方照读磁盘旧 `_index.md` | `rebuildIndex` 返回 `boolean`；失败**不清 dirty** + `lastIndexError`，`getFlushWarn()` 渲染「索引可能不是最新的」 |
| **证据落盘失败仍播报 `registered`** | 之后 `mode:validate` 读不到它 ⇒ 结论从 validated 掉回 observed，**没人知道为什么** | `registerFutureEvidence` 返回 `{evidence, persisted}`，未落盘时播报改为「**未落盘**」+ 后果说明 |
| **假设落盘失败仍打印 `hypotheses N`** | 用户以为有 N 条可 validate，磁盘上少几条 | `writeHypothesis` 返回 `boolean`；`mode:offline` 报「其中 k 条未落盘」 |
| **台账坏件 ≡ 空件** | 冷却状态静默清零 ⇒ **已冷却的记忆被重新返回**，与「第一次运行」不可区分 | 坏件带 `corrupt: true` + 留痕；`writeLedger` 返回 `boolean` |
| **消息截断无痕迹** | 长消息尾部**从未落盘**，读的人以为这就是全文 | 截断处显式写「**已截断**：原文 N 字，保留前 600 字」 |

### 2. 闸自身的缺陷（本轮真实发生 —— 一个会误报的闸会被当成狼来了）

| 缺陷 | 现象 | 修法 |
|---|---|---|
| **V7 语料闸把 `.git` 当语料** | `git gc` 把 `.git/objects/xx` 松散对象打包 ⇒ 目录数 **428 → 185**，而语料一个字没变（指纹相同）⇒ 报 **PARTIAL** | 两个工具的遍历**排除 `.git`** |
| **PARTIAL 拒绝录基线 ⇒ 闸堵死自己的修正** | 修完遍历口径仍 PARTIAL（基线旧），而 PARTIAL 又拒绝 `--update-ratchet` ⇒ **口径修正永远录不进去**（本轮实测卡住） | 目录数判据改为**用文件面定案**：文件面健康时的目录降 ⇒ 「遍历口径/结构变化」⇒ NORMAL **但必须印理由**；保留两档保护（文件面也掉 / 目录掉到 **<10%**）⇒ 真截断仍拦。阈值可注入 |

### 3. 标定与自查

- `tools/corpus-health.selftest.ts` 新增 **⑪**（口径变化 ⇒ NORMAL + 印理由 / 真截断 ⇒ PARTIAL / 0.9 边界含）；**⑥** 改为测两档并把 **10% 边界显式化**（`3/30` 恰在界内）。
- `tools/audit-layers.selftest.ts` 新增 **⑨**：未解析的相对 import ⇒ **计违规**（曾经只打印、退出码 0 ⇒ 改坏一个 import 路径即可让违规边从判据里消失）。
- `test/review-fixes.test.ts` 加 ④⑤：台账坏件标记 / 写失败报 false / 证据与假设落盘失败可被播报。
- **本轮自己写错并当场改正的一处注释**：我起初把语料指纹写成「**路径 + 全文**的内容派生值」，
  实际是 `sha256(文件**路径**集合)`（**不含内容**）。论点仍成立（同一路径集 ⇒ 没丢文件），**措辞已改准**；
  「同路径改了内容」这条边界在输出里另有提示。
- **`verify` = 52/52**；两条棘轮均通过；语料健康双方 **NORMAL**（基线已按新口径重录：`dirs 168`）。

**仍未修**：ADR-0083 §6.3 列出的中危/待定语义条目 · `core/memory.ts:77-79` meta 注册失败只 log ·
169 个既存测试类型错误 · 整目录未读（`adaptation/`/`agency/`/`federation/`/`long-horizon/`/`simulation/`/`soul/`，`tools/*.selftest.ts`）。


## [v1.15.54] **对抗性审查（按缺陷类全仓扫）**：修 7 类 + **三条新纪律** + 一份未修线索台账 —— `verify` 52/52

**一句话**：用户说「review fix all」。第一轮只审了两个新模块；本轮**按缺陷类**扫全仓，三个角度**并行只读审查**：
①「报错却仍生效」②「静默丢弃」③「判据分叉」。**每一条动手前我都自己读过原文核实**（不据别人的报告直接改）。
三份报告共**排除** 30 余条可疑点并给出理由（`adr/0083`）。

### 1. 已修（每条都有闸，见 `adr/0083` §1）

| # | 缺陷 | 修法 |
|---|---|---|
| ① | **判据分叉**：正/负结果分类器在**三处**各写一份且**答案不同**（实测 `"依赖降低"` 一边 true 一边 false；`"unstable"` 因 `includes("stable")` 恰好相反）⇒ 同一份 trace 一处记成功、一处记反例 | 收进 **`core/polarity.ts`**（词表**并集** + 负向**一票否决**），三个消费方改 import。**已知语义变化已标注**（`依赖降低/solved/…` 由反例改正支持；`unstable` 由支持改正反例；**未回溯重算历史**） |
| ② | **`_meta.json` 坏件 ≡ 空件**：解析失败返回空快照且不报，`mutateMeta` 把它**整体写回** ⇒ 一条坏字节把全工作区 pinned/archived/compacted/hits **清零** | `MetaSnapshot.corrupt` 显式标记；遇坏件**直接放弃**（不调 mutate、不写） |
| ③ | **validation timeline 坏件被覆盖**：解析失败返回空历史，`appendValidationEvent` 用 1 条新事件覆盖文件 ⇒ **append-only 历史永久销毁** | 新增 `readTimelineDetailed` 区分「还没有」/「读不出」；坏件**拒绝覆盖**；读路径显式播报 |
| ④ | **写失败报成功**：`writeMetaGuarded` 非冲突错误时 `return true`，而 `true` 的契约是「落盘成功」 | 三态 `MetaWriteOutcome = "ok" \| "stale" \| "failed"`；`failed` 立刻返回 false |
| ⑤ | **未知枚举落回默认值**：枚举外的 `disposition` 静默落进 `open` 桶 ⇒ 污染 buckets/最老/p90（**本轮新加的字段，审查当场指出**） | 只有明确 `open`（含缺省）才算在等；非法值单列 `invalidDisposition` 且**不进任何桶** |
| ⑥ | **证据路径漏一道过滤**：`query/query.ts:220` 漏 `isConcreteLocator`（另三处都有）⇒ glob 被当路径去验，必然 `not_found` | 补 `.filter(isConcreteLocator)` |
| ⑦ | **测试面从不被类型检查**（`test/*.ts` 不被任何 tsconfig 覆盖，而用 `node x.ts` 跑）⇒ v1.15.52 手写 fixture 少一个必填字段，**静默变成错的语义** | 新增 `tsconfig.test.json` + `typecheck:tests`，**接入 `verify`** |

### 2. 由此新增的三条纪律（`adr/0083` §2）

1. **坏件 ≠ 空件**：「读→改→写回整份」的路径，解析失败**必须让上层知道**，且**禁止把空对象写回**。
2. **未知枚举不得落回默认值**：单列并播报，不得并入任何合法桶。
3. **判据收一处要说清「怎么收」**：写明合并规则并**标注会改变哪些历史分类**。

### 3. 证据与边界

- `npm run verify` = **52/52**（+`test/review-fixes.test.ts`）；闸组数 `decision-outcome` **16**。
- 棘轮**如实变红 4 处并逐条点名后重录**（`b_keys 105→107` 的两个新键就是本轮引入的 **`outcome=ok` / `outcome=failed`**）。
- **未修**：审查另撞出 **约 30 条确证问题** + **169 个既存测试类型错误** + **整目录未读**（`adaptation/`、`agency/`、`federation/`、
  `long-horizon/`、`simulation/`、`soul/`，`tools/*.selftest.ts` 全部未读）⇒ **逐条带 `文件:行号` 记入 `BACKLOG.md` §六「审查线索」**，
  **不得读成「已修」或「不存在」**。**本 ADR 不主张审查已穷尽**，也未做端到端复现（坏件发生率、真语料影响面均未量化）。


## [v1.15.53] **对抗性审查 + 全部修复**：原语 4 处真缺陷、M1 读数 3 处缺维度 —— `verify` 51/51，棘轮如实变红并按规程重录

**一句话**：对 `core/proposal.ts` / `core/decision-outcome.ts` 逐行做对抗性审查（判据：**同一份数据会不会给出两个答案**、
**报了错是否仍然生效**），揪出并修掉 **4 处真缺陷 + 3 处缺维度**，然后用**同一批真实决策**重跑 dry run 作为证据。

### 1. `core/proposal.ts`（ADR-0082 §8）

| # | 缺陷 | 修复 |
|---|---|---|
| ① | **重复 id 报了违规却仍然生效**：`proposals.set()` 照旧覆盖 ⇒ 后一条静默顶掉前一条；confirmation 侧连重复检测都没有 | 重复 id ⇒ 违规 + **保留首见**（`continue`，不覆盖）；confirmation 补同样检测。闸 ⑭ |
| ② | **判据分叉**：`candidateStats` 自写一遍分类，`action!=="confirm"` 即算「已裁决」⇒ **`revoke` 被算成「被拒」**，且被撤销的候选落进 `pendingConfirmation`（同一份记录，事实层说「消失」、统计层说「被拒/没人看」） | 抽出 `collect()` + `effectiveConfirmations()`，**事实层与统计层共用**；四分之一 `confirmed/rejected/revoked/pending`；可机械断言 `candidates = 四者之和`。闸 ⑬ |
| ③ | `oldestCandidateDays` 统计**全部**候选的最老年龄，与用途（找「没人看的候选」）不符；且 `createdAt` 不可解析时**静默丢弃** | 改名 `oldestPendingDays`（**只统计 pending**）；补 `unmeasuredAges` 计数（缺件不静默） |
| ④ | **F8**：`acceptanceRate` 把所有 `actor` 混在一个分子分母里 ⇒ **tool 自确认能把接受率刷成满分**（闸是绿的，数字是假的） | 新增 `byActor`（human→tool→ci，只列实际有裁决的）；**总体率只认 `human`，无 human 裁决 ⇒ `null`（不可测不报 0）**。闸 ⑫ |

### 2. `core/decision-outcome.ts`（ADR-0081 §10）

| 发现 | 修复 |
|---|---|
| **F6** 刻意不做 ≠ 忘了做 | `DecisionRecord.disposition?: "open" \| "deliberate-deferral"`（缺省 `open` ⇒ 向后兼容）；读数分 `pendingOpen`/`pendingDeferred`，**年龄分布 / 最老 / p90 只统计 `open`** |
| **F7** 整日粒度丢分辨率 | `Attribution.lagHours`（floor，不插值）；`Confirmation.reason` 写成 `lag=<d>d(<h>h)` |
| **注释撒谎** | `toPrimitiveRecords` 的 `continue` 处注释写着「故下面单独报」，**代码里没有那个报** ⇒ 新增 `missing: string[]`，观察缺失时报出缺了哪条 |
| 读数口径分叉隐患 | `outcomeReadout` 改用 `AttributionResult.considered`，不再自己判断「有没有键」⇒ 差额报成 `unconsidered` |
| 年龄不可测被吞 | `at` 不可解析 ⇒ 报 `unmeasurable`，不再当 0 岁混进分布 |

### 3. 修复后用**同一批真实决策**重跑（证据）

```text
待结算 5 ·（<7d 2 · 7–30d 0 · 30–90d 1 · ≥90d 0）· p90 42d · 刻意推迟 2（不计入积压）
在等(open) 3 · 刻意推迟 2 · 未参与归属 0 · 年龄不可测 0 · missing 0 ✅
候选 7 · 口径自查 7 = 7+0+0+0 ✅ · [tool] 接受率 1 · **总体接受率 不可测（null）** ← F8 修复后的正确行为
lag 粒度：lagDays=0 / 0h,1h,0h,0h,0h,0h,5h   ← F7 修复后能看到小时级差别
```

### 4. 边界（诚实标注）

**F1/F2/F3**（行号谁填 / key 建议 / 确认时如何看证据）**只在载体里才有答案** ⇒ **不修**（载体仍刻意未定）；
`inputRefs` 每项**未**做多余字段拒收；`factualOnly` 仍是**约定**入口、无机械强制；**未落盘、未接读路径 ⇒ 仍无生产消费者**。

**验证**：`npm run verify` = **51/51**（检查数是「每文件一项」，故仍 51；**闸组数增加**：`proposal-firewall` 11 → **14**、
`decision-outcome` 11 → **15**）。棘轮**如实变红**（`b_keys 104 → 105`，新键 `action=reject`
**正是本版引入的 `revoke ≠ reject` 分类**），按 V6/V7 规程**记录理由后重录**。


## [v1.15.52] **M1-A′：拿本会话真实决策做端到端 dry run** —— 机制被真跑验证，载体只拿到「要求清单」；**发现两个契约缺维度**

**一句话**：**无仓库代码变更**（探针在仓外：`.docs/fix/2026-09-12/m1-dry-run.ts`，TS/`node` 直跑/只读/不落盘）。
本轮把 **M1 的链路用本会话真实发生过的 9 条决策**真跑一遍，验证 7 条路径，**并撞出 2 个契约缺维度**（`adr/0081` §9）。

### 1. 被真跑验证的（不是断言）

正常归属 · **一决策多观察**（`DEC-4` 2 条 ⇒ 事实 2 条、读数按决策聚合）· 同刻并列 ⇒ `ambiguous` 且**不归属** ·
**真超窗 31d** ⇒ `unattributed` 且**可见** · 键不匹配 ⇒ `unattributed` · 无确认 ⇒ `pending` · 全链路 **`违规 0`**（事实只经 `projectFacts`）。

### 2. 自己撞出的一处错（已修正重跑）

第一版把 `22:00 − 17:00 = 5h` 标成「超窗」—— **`lagDays` 是整日粒度，5 小时 = 0d、在窗内**。
修正后补了真正的 31d 超窗对，`未归属` 由 1 → 2。**教训：边界用例是构造出来的，不等于被构造对了；fixture 本身要当被测对象看。**

### 3. 两个契约缺维度（dry run 最值钱的产出 —— 不是 bug，是缺维度）

| # | 发现 | 反推出的要求 |
|---|---|---|
| **F6** | 4 条 pending 里 2 条是「**刻意不做**」，schema **区分不出「刻意不做」与「忘了做」** ⇒ age 读数把两者一起报成「积压」 | 补 `disposition`（`open` / `deliberate-deferral`），**读数按 disposition 分层** ⇒ **M1⑥** |
| **F8** | dry run 报「接受率 **1**」，而 7 条确认**全是规则代码生成的**（`actor:"tool"`）、**0 条来自人** ⇒ 100% **零信息量**；这正是「candidate 统计只能用于待确认候选」最容易被绕开处 | 候选统计**按 `actor` 分层**（human/tool/ci），`human` 组为空 ⇒ **不得**报总体率 ⇒ **M1⑦** |

其余要求（进入 M1③ 设计输入）：**F1** `inputRefs` 行号必须自动填 · **F2** key 建议 + 人确认 · **F3** 确认必须看得见证据（否则是**盲签**）·
**F4** 一决策多观察是常态 · **F5** `ambiguous` 应保留但不应常响 · **F7** 整日 `lagDays` 对「当天决策-当天结算」丢失分辨率。

### 4. 本轮**不能**回答的（不得据此设计）

**确认是否高频 / 是否要批量 / 是否要 diff**（本次 **0 次真实确认动作**，确认是代码生成的）· **采集侧能否拿到 decision/outcome 原文**
（记录是事后手工整理）· **`windowDays` 取值**（只为跑通）· **`inputRefs.line` 的真实可获得性**（全是占位，F1 本身即证据）。

**结论**：M1 的**机制**已验证；M1 的**载体形状仍未定**，现在有的是**要求清单**。`BACKLOG.md` 新增 **M1⑥ / M1⑦**，
优先级**高于** M1③ 的入口形状。`verify` 仍 **51/51**（无代码变更）。


## [v1.15.51] **M1-A：把 M1 接到原语上**（`core/decision-outcome.ts` + 11 组闸）—— 确定性归属，`verify` 51/51

**一句话**：用户选 A。本轮实现 **M1 的「决策 → 结果」确定性写入路径**，并**让结果事实只能经 `core/proposal.ts` 的
`projectFacts` 产生** —— 即 **P1 原语得到第一个真消费者**（那 4 条新 A 类线索本就是「等 M1 接线」，现在仍是待接线状态，见下）。

### 1. 归属规则 `same-key-window/v1`（确定性 + 保守）

```text
观察结果 O 归属决策 D ⇔ ① 同一归属键 key ② O.at ≥ D.at 且 lag ≤ windowDays
                      ③ 取窗内**最晚前驱** ④ **最晚前驱并列 ⇒ 不归属**（记为 ambiguous，可见）
```

| 设计点 | 为什么 |
|---|---|
| **归属键 `key` 由调用方显式传入** | `ObservationTrace` 里**没有 `entry`** 字段（只有 `id`/`observerId`/`createdAt`/`decision?`/`outcome?`）⇒ **我不发明 entry 的推导**（那正是「不得推断」的边界），与「`subject` 只接受显式提供」一致 |
| **并列 ⇒ 不归属**（而不是任选一个） | 与 ADR-0061「**错误关链是静默破坏；并存噪音是可观察问题**」同一条不对称：**宁可少归属，不可错归属**；且 ambiguous **计数可见**（ADR-0049） |
| **一个决策可有多个结果事实** | 本模块**不挑「那个」结果**（挑选＝判断）；所有窗内观察都各自成为候选 |
| **`windowDays` 由调用方给** | 不硬编码（`adr/0081` §5 待定项）|

### 2. 接线：**本模块不返回事实**

```
attributeOutcomes(...)  ──→ Attribution（**候选层**）
        │
        └─ toPrimitiveRecords() ──→ Proposal(source=观察来源 user/tool/ci · inputRefs 必填)
                                    + Confirmation(actor="tool", reason="rule:same-key-window/v1 key=… lag=…d window=…d")
                                            │
                                            └─ core/proposal.ts#projectFacts ──→ **Fact**
```
- **内容来源 = 观察者**（user/tool/ci）；**确认 = 确定性规则**（`actor: "tool"`），`reason` 写明规则与数字 ⇒ **可审计**；
- 测试 ⑧ 直接验证：本模块**不得返回 `facts`**，且**直接写 `type:"fact"` 仍被拒**（P1 的防火墙照样生效）。

### 3. `pending` 读数（年龄只暴露风险，**不改变状态**）

`outcomeReadout({decisions, result}, now)` → `decisions / settled / pending / ambiguous / unattributed` +
**年龄分布**（<7d · 7–30d · 30–90d · ≥90d）+ **最老一条** + **`pendingAgeP90`**（nearest-rank，**不插值** —— 插值会造出不存在的年龄）+ 一行渲染。
**硬边界（测试 ⑩ 验证）**：换 `now` **只改读数、不改状态**；**无 pending ⇒ p90 报 `null`（不可测，不报 0）**。

### 4. 门禁与棘轮（如实变红 → 按规程重录）

- `npm run verify` = **51/51**（50 → 51）。
- 棘轮**再次如实变红**：`a1 19 → 23`、`a_total 33 → 37`、`b_keys 103 → 104` ⇒ **因为这两个新模块尚未接进任何读路径**
  （无生产消费者）。**这是刻意的**：契约先落地、消费者后接；重录已按 V6/V7 的规程执行并在此说明理由。

### 5. 诚实边界（写进测试尾注与 `adr/0081` §8）

- **「`key` 从哪来」这条链未接**（属 M1③ 的**显式入口**设计：用户/工具显式给出，或采集时原文明确存在）；
- **没有落盘**：结果事实目前只存在于内存记录里；
- **没有接进任何读路径**（`read_shadow` 尚未渲染这些事实与读数）⇒ **目前没有生产消费者**，故 A 段线索仍是待接线；
- `windowDays` 取多少**未定**（须走 config）。

### 6. 变更文件

`core/decision-outcome.ts`（新）· `test/decision-outcome.test.ts`（新）· `dist/core/decision-outcome.{js,d.ts}`（新，dist 同步）·
`tsconfig.json`（include 再增一项）· `tools/audit-ratchet.baseline.json` · `adr/0081`（§8 实现）· `BACKLOG.md`（M1 状态）·
`CHANGELOG.md` · `README.md` · `package.json`（1.15.51）。**未改动**：`index.ts` 与任何既有业务路径。

## [v1.15.50] **P1①② 落地：语义防火墙**（`core/proposal.ts` + 11 组闸）—— Fact 是**投影**，不是可写入的记录

**一句话**：用户批准「先做纯类型 + 解析 + 闸，不等 Confirmation 载体」。本轮把 `adr/0082` 的原语做成代码与闸：
**任何写入者（LLM / CLI / 人工 / MCP / 外部工具）都不能绕过这条边界**。`npm run verify` = **50/50**。

### 1. 实现选择：用**结构**而非字段校验来防伪装（比要求更强）

用户点名的两种伪装，我用更强的形式一次解决 —— **Fact 根本没有写入路径**：

> **输入只接受 `proposal` / `confirmation`；`type:"fact"` 一律拒收。Fact 只由 `projectFacts(P, C)` 派生。**

| 伪装 | 结果 |
|---|---|
| `{type:"fact", source:"model-proposal"}` | **拒收**（不是「字段有问题」，而是**没有这条写入路径**）|
| `{type:"proposal", status:"validated"}` | **伪装字段**拒收；**且即使再给一条 confirmation 也不得复活**（被拒的 proposal 不进索引）|

「Fact 是投影」还顺带吻合 **ADR-0003（派生件不是 source）**：`id = fact-<proposalId>`，**同输入同结果**。

### 2. 机械不变量（逐字实现用户给出的形式）

```text
FACT ⇔ 存在有效 Confirmation ∧ Confirmation 指向 Proposal ∧ Proposal 有 inputRefs
```
- 有效动作 = 按 `timestamp` 升序取**最后一条**，**同刻按 `id` 升序** ⇒ **与插入顺序无关**（已成测试）。
- `reject` / `revoke` ⇒ **不产生事实**（撤销即事实消失，**历史保留**）。

### 3. 按用户追加冻结的两条

| 追加要求 | 落地 |
|---|---|
| **Confirmation 是「授权事件」，不是事实状态** | `{id, proposal, actor, action, timestamp, reason?}`，`actor ∈ human/tool/ci`（**没有 `model`** —— 模型不能确认自己），`action ∈ confirm/reject/revoke`。**Fact 是其投影** ⇒ 未来 **M4 Memory Revision 直接落在 `revoke` 上**，不需要新机制。**载体刻意不决定**（等 M1 真实场景）|
| **候选层不得成为黑盒（防 Silent Candidate Graveyard）** | `candidateStats(records, now)` 输出 `candidates / confirmed / rejected / pendingConfirmation / oldestCandidateDays / acceptanceRate / rejectionRate`；**待确认不计入分母**（否则「还没人看」会被算成「被拒」=伪造精度）、**分母 0 报 `null`（不可测不报 0）**、**`now` 由调用方传入（不读时钟）**；**不进普通召回，但必须可见** |

### 4. 闸（11 组，`test/proposal-firewall.test.ts`）

正例：`P+C(confirm)` ⇒ 1 事实、P→C→F 可追、id 确定性。负例：`type:"fact"` 拒收 · `status` 伪装字段拒收 ·
缺 `inputRefs` 拒收 · confirmation 指向不存在的 proposal 违规 · `actor:"model"` 拒收 · 未白名单字段拒收 ·
**核心不变量**（候选=0 / 确认=1 / 撤销=0）· 同刻裁决与插入顺序无关 · 分母 0 ⇒ `null`。

**诚实标注（写进 ADR §7.5）**：① `factualOnly` 目前是**约定**的唯一统计入口，**尚无机械手段**阻止未来统计直接吃 `records`
（留到 P1 接入 M3 时补结构门）；② 本闸只覆盖**内存中的校验与投影**，**不涉及落盘**（存储位置未定）；
③ **没有真实 LLM 产生者与 Confirmation 入口**，故 `inputRefs` 只验「在场」，未验内容可信。

### 5. 门禁与变更文件

- `tsconfig.json` 的 `include` 增加 `core/proposal.ts`（它尚未被 `index.ts` 引用，而测试按本仓约定 import **编译产物** ⇒ 必须显式纳入编译面）。
- **棘轮如实变红并按规程重录**：`a1 17 → 19`、`a_total 31 → 33`（新模块的导出**尚无生产调用点**，待 M1 接线）；
  这正是 V6/V7 设计的路径 —— **合法上升必须有人确认后再重录**，而不是静默通过。`drift` 同步重录（`11 键/28 处`）。
- 变更文件：`core/proposal.ts`（新）· `test/proposal-firewall.test.ts`（新）· `dist/core/proposal.{js,d.ts}`（新，dist 与源码同步提交）·
  `tsconfig.json` · `tools/audit-ratchet.baseline.json` · `adr/0082`（§7 实现 + 7.1–7.5）· `BACKLOG.md`（P1 状态）· `CHANGELOG.md` · `README.md` · `package.json`（1.15.50）。
- **未改动**：`index.ts` 与任何既有业务路径（本层**尚未接线**，是刻意的：先有闸、再接能力）。

## [v1.15.49] **`Proposal → Confirmation → Fact` 升为通用原语**（`adr/0082`）：Inference is cheap; facts are expensive

**一句话**：用户选 **A**（两层），并要求把这条边界**从 M1 的特殊处理升为所有 Memory Intelligence 能力的共同纪律**。
故单独立 **`adr/0082`** 冻结原语；**M1 降为它的第一个使用者**（Memory Track 顺序变为 **P1 → M1 → M2 → M3 → M4 → M5**）。

### 1. 原语（唯一升级路径）

```text
Inference（廉价、可海量）→ Proposal（候选层）→ Confirmation（显式确认）→ Fact（事实层，受契约保护）
                                                                    └→ Pattern / M5 统计 / 棘轮
```

**事实层只有两条写入路径**：**显式外部来源**（用户/工具/CI，`source` **不得**为模型）· **确定性规则**（同入口+时间窗，**不看语义**）。
**`model-proposal` 永不直接进 Fact。**

### 2. 用户补充的三条硬要求（全部写进契约）

| # | 要求 | 落点 |
|---|---|---|
| ① | **proposal 必须自带「基于什么提议」** | `source` / `model` / `prompt_version` / `input_refs[{file,line}]` / `proposed_relation`；**缺一不得入库** —— 否则 proposal 连**被复核**的资格都没有（与「线索必须带 `文件:行号`」同一纪律）|
| ② | **proposal 不参与任何事实统计**（六条） | ❌ Pattern count · ❌ influenced_decision · ❌ confidence · ❌ ratchet baseline · ❌ knowledge fact · ❌ identity；**唯一允许**：`candidate coverage` / `acceptance rate` / `rejection rate`（**度量模型能力，不修改世界状态**）|
| ③ | **升级必须留链** | `P ──confirmed_by──→ C ──→ F`；**没有 C 的 F 不存在**；lineage 三段可追（原始证据 → proposal → 确认 → Fact → Pattern → 未来召回）|

**核心不变量（用户原话，写进 ADR）**：
> **只有 FACT 可以改变系统的认知统计；CANDIDATE 只能改变「待确认候选」的统计。**

### 3. 同时冻结的两条 M1 配套纪律

- **`subject` = `explicit` + `deterministic-normalized`，明确关闭「语义实体消解」这条演化路径**。
  理由（用户的推理链）：用相似度把 A、B 吸到同一 subject ⇒ **Pattern 统计量虚假变高**，
  而「**Pattern 的质量上限会被 subject resolution 的错误率锁死**」——**隐蔽**污染（数字看起来更好）。
- **`pending` 年龄只暴露风险，不得改变状态**：读数必须印条数 + 年龄分布（<7d/7–30d/30–90d/≥90d）+ 最老一条；
  可加**轻量派生** `pending_age_p90` 用于分「正常等待 / 长期积压 / 疑似永不结算」；
  **不得设置自动结算阈值**。

### 4. 位置与边界

- **泳道位置**：`adr/0082` = Memory Track 的 **P1（第 0 项）**，**先于 M1**；`adr/0081` 的 §3 契约据此**收窄**
  （保留「不用相似度/LLM 做归属」的禁令，把 LLM 归属**移到候选层**）。
- **主干（用户指定）**：`Memory → Evidence → Inference → Confirmation → Knowledge`。
- **本 ADR 没给系统加任何能力** —— 它只给「**什么算事实**」定了一条**不可绕过**的路径。
- **T15 Registry 第 2 条真条目**：`id = proposal-confirmation-fact-v1`，十字段齐备，**verification 含 5 条（3 条负例）**，
  待建棘轮桶 = `proposal_coverage` / `acceptance_rate` / `rejection_rate`（**这三项可以进棘轮**，因为度量的是模型能力而非世界状态）。
- **未决（不脑补）**：Confirmation 的载体（新 mode 还是独立工具）· `prompt_version` 的记录方式 ·
  `pending_age_p90` 的窗口 · proposal 的存储位置（**无论哪种都不得进入 `listMemories` 语料**，否则候选污染召回 —— 与 ADR-0075 的 `_` 前缀纪律同族）。

### 5. 变更文件与门禁

`adr/0082-proposal-confirmation-fact.md`（新）· `adr/0081`（新增 §7.4 用户确认 + 契约收窄）·
`BACKLOG.md`（新增 **P1 已冻结**；Memory Track 改为 `P1 → M1 → …`）· `CHANGELOG.md` · `README.md` · `package.json`（1.15.49）。
**未改动**：任何业务源码、`dist/`、门禁（49/49 不变）。

## [v1.15.48] M1 三处拍板入账 + **一处异议与两层合成设计**（`adr/0081` §7）

**一句话**：用户对 M1 的三处前置作了决定。**两处我接受并补了配套纪律；第三处我提出异议** ——
因为它会打在**我们刚做可信的那一层**（事实层）。**本轮仍未写实现代码**：先把契约与争议写清楚。

### 1. 用户决定与我处理

| # | 决定 | 我的处理 |
|---|---|---|
| 1 | 结果来源＝**允许 LLM 判断归属** | ⚠ **异议**：提出**两层合成设计**（LLM 只进**候选层**，事实层只收「显式外部来源」或「同入口+时间窗的确定性规则」）|
| 2 | **引入 `subject`，与 `entry` 并存** | ✅ 接受 + **来源纪律**：只接受显式提供，**绝不从文本推断**（与 ADR-0037 的 `DecisionReason` 同一纪律）；规范化若要做，必须**确定性规则 + 白名单**，不得用相似度 |
| 3 | **不设结算窗口，永远 `pending`** | ✅ 接受 + **可见性要求**：读数必须印 `pending` 条数 + **年龄分布**（<7d/<30d/<90d/≥90d）+ **最老一条**，否则「还没到」与「永远不会到」不可区分（ADR-0049 同族）|

### 2. 异议的四条理由（都带证据，不靠偏好）

| # | 后果 | 依据 |
|---|---|---|
| ① | **不可复现 ⇒ 棘轮会抖** | 换模型版本可能换归属 ⇒ Pattern 计数与 M5 的 `influenced_decision` 都会漂；而 **V6/V7 刚把「未经批准的变化」做成会红的门** ⇒ 门会因「判断重跑了」而红，**变成噪声源**（正是 V6 要避免的「噪声导致跳过」）|
| ② | **不可审计** | LLM 路径上没有可核证据（无 `文件:行号`、无规则），撞本仓「每条结论要能点出来源」 |
| ③ | **精度上界已被量过** | `adr/0080`（MemStrata）：AUROC **0.5926**、任何阈值 precision **上限 0.667**、「安全自动化的 0.95 floor 不可达」⇒ M5 指标会带**不可量化的偏差源**且说不清分母 |
| ④ | **与已冻结边界冲突** | `adr/0037:29-42` 冻结「**Reason 绝不生成**」；而**归属比理由更强**（理由只是转述，归属是**断言因果**）|

### 3. 合成设计（给回你要的覆盖率，同时不污染事实层）

```text
显式外部来源（用户/工具/CI） ─┐
                            ├─→ 【事实层】DecisionOutcome（受契约保护，进 Pattern/M5/棘轮）
同入口 + 时间窗（确定性） ────┘        ↑ 需「确认」才升级
LLM 提议归属 ──→ 【候选层】proposal（source=model-proposal · 永不进事实层 · 只在候选视图出现）
```

**两个同形先例（不是新发明）**：`dream/` 的候选**不进主路径**；`world` 的 status 恒 `hypothesis/validated/rejected`、**永不 `fact`**（`world/guard/relation-guard.ts:18`）。
**代价**：多一层「确认」；不确认就一直是候选。**若你仍要 LLM 直接进事实层**，须**显式改掉契约第 ④ 条禁令**并登记「归属不可复现」——
**不能默默实现**（否则契约与实现对不上，正是本仓最忌的「台账比事实强」）。

### 4. 变更文件与边界

`adr/0081`（新增 §7：决策记录 + 异议 + 两层设计 + subject 来源纪律 + pending 可见性要求）·
`BACKLOG.md`（M1 状态更新为「已拍板 / 待确认第 1 点后开工」）· `CHANGELOG.md` · `README.md` · `package.json`（1.15.48）。
**未改动**：任何业务源码、`dist/`、门禁（49/49 不变）。

## [v1.15.47] **双泳道 + M1 契约草案**（`adr/0081`）：决策 → 结果 → 经验 —— 并清点出「M1 已有一半，且是最难的那一半」

**一句话**：用户修正了上一轮的表述 —— **不是「先治理、不做新 Memory 能力」，而是两条泳道并行**，
新能力**纵向生长**（`M1 决策 → M2 结果 → M3 经验 → M4 修正 → M5 有用性`）而不是横向堆功能。
本轮**没有写任何新能力代码**：先把 M1 的现状清点做透，并**按 T15 的规格把 M1 写成第一条真契约**。

### 1. 最重要的清点结论：**M1 最难的那条边界已经冻结了**

| 用户要的字段 | 现状 | 证据 |
|---|---|---|
| `decision` 决定本身 | ✅ **写侧一等事件**，落盘 `> 决策：〔source〕statement` | `adr/0037` |
| `reasoning` 为什么 | ✅ **已冻结**：落盘 `> 决策理由：〔source〕reason`，且 **「绝不生成理由」**（原文明确存在才算） | `adr/0037:29-42` |
| `alternatives` 当时有哪些选择 | ❌ **缺**（`dream/types.ts:19` 的 `alternatives` 是**假设的替代解释**，不是决策备选） | `dream/types.ts:19` |
| 决策的依据（evidence 引用） | 🟡 半有（理由是原文事实，但**无显式证据引用**） | `adr/0037` / `validation/types.ts:3` |
| **`outcome` 决策后来怎样** | ❌ **缺关键的一半：没有「决策 → 结果」这条边**。现有 `outcome` 是**别的**东西：`observer/trace.ts:26` 的轨迹 `{expected,actual}`、`validation` 的**假设**验证结论 | `observer/trace.ts:26,62`、`validation/types.ts:23` |
| `lesson` | 🟡 有但不合格：`lessonOf` 派生自**取代/证据存活状态**，不是「这个决策执行得怎样」 | `observer/arbitrate.ts:71` |

**⇒ M1 的缺口只有三件**（都不推倒已有）：**① 决策→结果 的边**；**② 结果结算状态机**（`pending → observed → settled`，
**并允许 `unresolved` 而不是编一个结果**）；**③ `alternatives`（可选，同受「只收原文明确存在」的纪律）**。

### 2. M2–M5 的清点（结论：**大多不是「新建」，而是「接上」**）

- **M2 Outcome**：**不新建对象** —— `validation/types.ts:23` 已有完整 outcome 状态机 + append-only 历史（实测场景 88 保留 observed→rejected），
  `observer/trace.ts:26` 已有 `expected/actual`，`long-horizon` 已有 ActionFeedback。**要做的只是把已有形态接到 Decision 上**
  （否则就是**第二个平行 outcome 概念 = 判据分叉**）。
- **M3 Pattern**：**算法内核已存在**（`reflection/patterns/success-rate.ts` 的 decision→outcome 相关性、`decision-outcome.ts` 的重复 tally、
  `dream/compress.ts` 的 cross-domain 抽象）。**真缺口**是 Pattern 不是一等对象，且 `reflection/types.ts:8` **没有反例字段** ——
  用户要的 `counter_examples` **必须补**（只报 support 不报反例＝自欺，撞「不伪造精度」）。
- **M4 Revision**：**机制已有**（`Forget ≠ Delete`、`superseded`、append-only、取代的确定性 —— `adr/0080` 还给了「阈值不可达」的证明）。
  **真缺口**：`revision` 不是一等对象，**没留下「因哪条证据而改判」的可追溯对象**。
- **M5 Utility**：只有 `recall_count` 的雏形（`hits` + `queryLog`）+ 衰减；`useful_count` / `influenced_decision` /
  `prevented_duplicate_work` / `caused_rework` **全缺** —— **其前提是 M1**。

### 3. M1 契约按 T15 规格写成**第一条真条目**（`adr/0081` §3）

十字段齐备：`id = decision-outcome-lesson-v1` · surface（落盘格式 + 工具 schema + 派生件）· owner（`observer/`，
并给出**模块归属表**含「Must not own」）· semantic meaning · stability（`hard`：事实/理由分离与「绝不生成理由」；
`soft`：字段名与落盘行格式）· allowed changes（**additive only**）· **forbidden changes（四条）** ·
evidence（逐条 `文件:行号`）· verification（**待建 4 条，含负例**）· ratchet（暂用现有两门 + 待建「有决策无结果」计数桶）。
**四条禁令**：① 不让系统推断结果的优劣或理由；② 不为已有决策编造 outcome/lesson（缺就写「未观察到」）；
③ 不新建第二个 outcome 概念；④ 不用相似度/LLM 做「结果归属哪个决策」的判断。

### 4. 待用户拍板（三处，缺一不动手）

1. **结果从哪来**：只收显式外部来源 / 允许「同入口+时间窗」的确定性自动归属 / 允许 LLM 归属（**建议否决**，撞 ADR-0059）。
2. **`subject` 要不要**（决策挂 subject，还是继续挂 entry+时间？与 Episode 坐标并存还是取代？）。
3. **结算窗口**：多久没结果标 `unresolved` 而非 `pending`（走 config，**不做硬编码魔数**）。

### 5. 变更文件与边界

`adr/0081-m1-decision-outcome-lesson.md`（新）· `BACKLOG.md`（🧠 M1–M5 泳道 + 两泳道交汇 + 明确「不做 KG / 不做 Soul」）·
`CHANGELOG.md` · `README.md` · `package.json`（1.15.47）。
**未改动**：任何 `*.ts` 业务源码、`dist/`、任何门禁 —— 本轮是**契约与清点**，不是实现。
**诚实标注**：现状清点只凭**源码与 ADR 阅读**，**没有跑过任何真实决策链路**，故「已有」= 机制存在，不等于端到端跑通。

## [v1.15.46] **V7 语料健康门**（Partial Corpus）+ 五级审计口径 + 阶段路线与 T15 契约登记册规格

**一句话**：V6 只防住「语料**全空**」；本轮补上它的危险兄弟 —— **Partial Corpus**（工具坏了给出一个「看起来合理」
的小读数），并把「**下降 = 通过并收紧基线**」这个会让**工具故障写进基线**的洞堵上。

### 1. V7 语料健康门（`tools/corpus-health.lib.ts` + 10 组标定测试）

四档，**只有 NORMAL 放行**（且只有 NORMAL 才允许 `--update-ratchet` 录基线）：

| 档 | 触发 | 退出码 |
|---|---|---|
| `EMPTY` | 0 文件 | 2 |
| `PARTIAL` | 文件数 < 基线×0.9 · **目录数** < 基线×0.9 · **线索跌 > 20%** · **哨兵文件缺失** | 2 |
| `UNKNOWN` | 无基线可比 | 2 |
| `NORMAL` | 在容许带内 | 0（继续跑棘轮） |

- **哨兵**（`index.ts`/`core/paths.ts`/`core/types.ts`/`core/util.ts`/`security/scrub.ts`）：**无基线也能发现**
  「走错目录 / 递归被 junction 静默截断」——正是 v1.15.43 踩过的坑。
- **覆盖四个语料消费者**：`audit-wiring` / `audit-drift`（基线+哨兵）· `audit-layers`（自比+哨兵）·
  `retrieval-eval`（协议常量 `min_corpus_files`，**从数据读、不从代码读**）。
- **`--update-ratchet` 也受闸**：EMPTY/PARTIAL ⇒ **拒绝录基线**。这是本轮最关键的一条 ——
  它堵住了「**工具坏了 → 线索骤降 → 棘轮判『下降不是违规』→ 提示收紧基线**」这条自我固化路径。
- **代价（刻意）**：**大幅度的合法下降现在必须走「确认 → 重录」**，不能静默收紧。

### 2. 🔴 V7 首次运行就抓到我自己的一处设计缺陷

两个工具**共用一个 `corpus` 键**，但量的是**不同的语料**（wiring 扫全仓 **778** 文件含 `dist/`；
drift 只扫生产面 **193** 文件）⇒ drift 录基线时被 wiring 的数字判成「**骤降 76%**」而**拒绝录制**。
**修法**：`corpus` 按消费者分开（`corpus.wiring` / `corpus.drift`）。
**教训与 V6 同族**：**共享键 + 不同口径 = 必炸** —— 而这次是**新加的闸自己发现**的，不是人看出来的。

### 3. 统一审计口径：**Artifact existence ≠ Runtime capability**（用户评审第 1 条）

写入 `MATERIALS.md` §6 作为全台账的判定链，逐级都不得跳：

```text
package exists ≠ installed ≠ loaded ≠ active ≠ usable ≠ verified
```

来历是本仓两次实测教训（据 Service 目录断言 `invariants` 存在 → 运行时 `undefined`；
`e2b` 在目录里而 `dsh-e2b` **没安装**）。**推论**：`files` 里有 `./invariant` ≠ 运行面可解析；
bundle patch 有某行 ≠ 该行被挂载；预设清单存在 ≠ 内容未变。

### 4. 阶段路线与 T15 规格入账（`BACKLOG.md`）

- **路线**（用户确立）：`V1–V5 功能` → `V6 假绿` → **`V7 语料可信`** → **`T8`** → **`T15`** →
  `D1/D2/D3` → `A 段` → `T2(B段)/T9/T10/T7` → **`Contract Freeze Gate`** → `T14`（冻结**契约语料**，不是当前实现）
  → `V8/V9 Identity Ratchet` → V/G/T6。**明确：D1/D2/D3 不要先拍**（它们本质都是「哪些算受保护契约」）。
- **T15 产物规格**：**Protected Contract Registry**，每条**十字段**（`id` / `surface` / `owner` /
  `semantic meaning` / `stability level` / `allowed changes` / `forbidden changes` / `evidence` /
  `verification` / `ratchet`）；加**模块归属表**（`Owns / Reads / Writes / Must not own`，用来暴露越权）；
  D2 细分为**名称/结构/语义/行为**四种漂移；D3 若「旧对象不 protected、新对象才 protected」= **允许的内部破坏性重构**。
- **V8/V9（Count → Identity Ratchet）** 记入「明确不做（以后）」：桶值要从 `count` 变成 `{count, fingerprints[]}`；
  但**先有 T15 才谈得上给桶定身份**。
- **Contract Freeze Gate**：`F 台账 + V 运行验证 + T15 契约面 + Ratchet` 四者齐备 ⇒ 核心契约冻结；
  此后新功能必须证明**不破坏 Contract** 才能进 `main`。

### 5. 门禁与变更文件

**`npm run verify` = 49/49**（48 → 49：多 `tools/corpus-health.selftest.ts`）；
`audit:wiring` / `audit:drift` 均打印 `语料健康 … NORMAL ✅` 后跑棘轮并通过；`audit-layers` 通过；
`retrieval-eval --check-baseline` 通过（协议新增 `min_corpus_files` ⇒ 旧基线**明确用 `--force` 重录**，理由即此）。
变更文件：`tools/corpus-health.lib.ts`（新）· `tools/corpus-health.selftest.ts`（新）·
`tools/audit-ratchet.baseline.json`（新增 `corpus.wiring` / `corpus.drift` 段）·
`tools/{audit-wiring,audit-drift,audit-layers,retrieval-eval}.ts` · `tools/retrieval-eval.{lib.ts,selftest.ts,protocol.json,baseline.json}` ·
`MATERIALS.md`（§6 五级链）· `BACKLOG.md`（V7 闭环 / V8/V9 / 阶段路线 / T15 规格）· `CHANGELOG.md` · `README.md` · `package.json`（1.15.46）。
**未改动**：`index.ts` 与业务源码、`dist/`。

## [v1.15.45] **V6 闭环**：两个分诊报告有了**棘轮退出码**，并接进 `npm run verify`（+ 修一处「空语料冒充没问题」）

**一句话**：`audit:wiring` / `audit:drift` 一直是**人工分诊**工具 —— 输出是线索清单、**退出码恒 0**
⇒ 「工具会随时间失效」（V6 原文）。本轮把退出码语义定下来、做成棘轮，并**接进门禁**；
过程中**踩到并修掉了一处真缺陷**（空语料 ⇒ 假全绿 ⇒ 会录成假基线）。

### 1. 判据（新文件 `tools/audit-ratchet.lib.ts` + 8 组标定测试）

| # | 判据 | 退出码 |
|---|---|---|
| ① | **线索数只能降不能升**（某桶多于基线 ⇒ 报文给「旧 → 新」与增量） | **1** |
| ② | **下降不是违规**（提示 `--update-ratchet` 收紧基线）—— 判紧会让人习惯性绕过这道门 | 0 |
| ③ | **基线里有的桶在观测里消失**（缺件不静默：可能是工具坏了，不是问题没了） | **1** |
| ④ | **出现新桶**（否则整类新线索会被棘轮漏掉） | **1** |
| ⑤ | 基线缺失 / 两表皆空（「通过」不能靠没有判据换来） | **1** |

### 2. 基线与执行处

- `tools/audit-ratchet.baseline.json`（**两个报告共用一份**，分 `wiring` / `drift` 两段）：
  `wiring = { a_total 31, a2b 0, a1 17, a2a 3, a3 11, b_keys 103 }`、
  `drift = { drift_keys 10, drift_sites 25 }`。
- `npm run audit:ratchet`（两份报告的 `--ratchet` 串联）**已进 `npm run verify`** ⇒ 门禁 **48/48**。
- `--update-ratchet` 单入口写回基线（与 `retrieval-eval --update-baseline` 同形）。

### 3. 同轮踩到并修掉的真缺陷（留档，与 T2/T12 同族）

`node tools/audit-wiring.ts --ratchet` **漏了根参数** ⇒ `ROOT` 取到旗标字符串 `"--ratchet"` ⇒
扫描目录不存在 ⇒ **0 文件 ⇒ 0 线索 ⇒ 工具「安静地全绿」**，而 `--update-ratchet` 会把这个全 0 读数
**录成基线**（棘轮从此失去意义）。
⇒ 两个 CLI **都加闸：零文件语料直接 `exit 2`**（缺件不静默，ADR-0049），npm 脚本里显式带上 `.`。
**唯一失效模式就是「空语料冒充没问题」**。

### 4. 诚实边界

- 棘轮只覆盖**计数**，答不了「计数相同但线索换了一批」（需逐条 diff，未做）。
- `audit-drift` 只棘轮 **B 段**（A 段的 `fresh` 计数在块作用域内，要棘轮得先把计数提到顶层）。
- 两个 CLI 的 `--ratchet` 接线与「零文件 `exit 2`」靠**真实运行**验证（已手工跑过），未做成自动断言（需 spawn 子进程）。

### 5. 变更文件

`tools/audit-ratchet.lib.ts`（新）· `tools/audit-ratchet.selftest.ts`（新）· `tools/audit-ratchet.baseline.json`（新）·
`tools/audit-wiring.ts`（`--ratchet`/`--update-ratchet` + 零语料闸）· `tools/audit-drift.ts`（同）·
`package.json`（`version` → 1.15.45；新增 `audit:ratchet`；`verify` 加一步）· `BACKLOG.md`（V6 结案，头部 23 → 22 / 20 → 21）·
`CHANGELOG.md`（本条）· `README.md`（版本表 + `verify` 组成）。
**未改动**：`index.ts` 与业务源码、`dist/`。

## [v1.15.44] **台账回填**：把「读了什么 / 还没读什么」追平到事实（MATERIALS + references 覆盖率台账）

**一句话**：本仓纪律要求「台账比事实旧＝缺陷」（ADR-0072 那一族）。v1.15.41–43 一口气读了五片面
（harness 关键面 / hl_mem 门禁面 / 安装体 / profile 组合 / agent preset），但**台账的状态列还停在第一轮**，
其中**两处会主动误导下游** —— 本轮只回填状态与结论，**未改任何计数**（按 MATERIALS §5：改数必须重跑枚举命令）。

### 1. 两处**会误导**的过期结论（这是本轮最要紧的修正）

| 位置 | 原文（过期） | 事实 |
|---|---|---|
| `MATERIALS.md` §4 | 「`invariants` 是四项里唯一候选，**有两条前置未确认**（失败是否阻断宿主 / 选择机制由谁配置）」 | 两条前置**已答**（v1.15.40），而更关键的是：**该服务在运行的 web 部署里根本没挂**（运行时读取 `undefined`，v1.15.42）⇒ **判「暂不吸收」**；并新增一条纪律 **Service 目录 ≠ 活性表**（反例：`e2b` 在目录里而 `dsh-e2b` **没安装**） |
| `MATERIALS.md` §2.1 / §6 | 「harness 克隆与运行体的偏差**未逐项核对**」 | **已逐项核对（v1.15.43，8 个平面）**：机制面零漂移、组合/产物面全漂移；并记下 `packages/AGENTS.md` 的「Every package owns `./invariant`」在 0.1.5-rc.2 **发布产物上不成立** |

### 2. 其余回填（状态列）

- **§2.1 harness**：五行状态从「🔄 深读中 / ❌ 未读」改为**读到哪一面**（`vendor` 的 isolate / `unwrapExports` / `reflect` 三处**与运行面逐字节相同**；`packages/` 按需局部读了 invariants、三个 bundle patch、4 个 preset、`packages/AGENTS.md`）；`apps/native/python/website/snapshots` 仍 ❌。
- **§2.2 hl_mem**：**门禁面已读**（`scripts/` 11 个 `check_*.py` + 5 个 workflow + `benchmarks/release/` + `tests/eval/`）；剩余未读面收窄为 `tests/` 其余 ~375 测试体、`src/` 其余 ~344、`docs/*.md` 顶层 13、`evaluation/tools/` 其余 15 runner。
- **§2.8 / §3.2**：给「四路深读在跑」「下一步先读 MemStrata」这类**将来时措辞**加时态说明（四路已全部整合；MemStrata **已读完正文 + Appendix B/C/D + Table 1/2/3**，A.1/A.2 与 Table 4/5 仍未读到、**分数未复现**）。
- **§6 诚实边界**：论文一条从「全部未读」改为「MemStrata 已读、其余三篇仍只检索」；版本偏差一条从「未核对」改为「已核对（8 平面）」；并**显式声明本轮未改任何计数**。
- **`references.md` §6.3**（hl_mem 覆盖率台账）：`tests/` 与 `evaluation/` 两行从「❌ 未读 / 只读两个 README」改为**门禁面已读**并给出文件级来源；新增 `.github/workflows/` 一行（**实为 5 个**，此前题面误记 ~25 个）；末尾加「v1.15.43 回填」说明。

### 3. 变更文件与边界

`MATERIALS.md`（六处状态/结论回填）· `references.md`（§6.3 三行 + 纪律尾注）· `CHANGELOG.md`（本条）·
`README.md`（版本表）· `package.json`（`version` → 1.15.44）。
**未改动**：任何 `*.ts` / `dist/` / 配置；**未重跑枚举命令**（因此台账里的文件数/字节数保持首版口径不动，凡改数须另起一轮重跑）。

## [v1.15.43] **三路并行查证落账**：A 段残余 18 条分诊（1 处真断线已修）· T12 时间炸弹闭环（引爆日 2027-01-02）· T16 版本偏差逐项核对

**一句话**：本轮把三件「只差逐条核实」的事一次做完 —— **18 条 A 段残余线索**、**22 个含硬编码日期的测试文件**、
**8 个平台契约平面的版本偏差** —— 并修掉其中**唯一两处真缺陷**（一处判据分叉、一颗定时炸弹），
外加一处**工具口径缺陷**（它**持续误导了我两轮**）。

### 1. A 段残余 18 条（A2b 1 + A1 17）→ 真断线 1 · 配对包装 4 · 正当 7 · 待决策 6

- **先修工具口径（本轮最实用的一条）**：`tools/audit-wiring.ts` 原把 `!isProductionPath(...)` 当「测试」，
  于是 **`dist/**` 与 `node_modules/**` 的 `.d.ts` 全被算进「测试引用」** ⇒ 「测试引用 N」**虚高**。
  实测：`hasNoUpgradeApi` 的「1」全来自 `dist/agency/guards.d.ts`；`apply` 的「230」里 15 来自 `node_modules`。
  **已修为「只认 `test/` 下」，并把判据打进输出行**。修后 A2b 从 1 → **0**。
- **唯一真断线（已修）**：`ledgerMismatch`（`tools/toolset-authority.lib.ts:47`）被 CLI **import 了却另写内联过滤**
  （`toolset-authority.ts:99-102`）⇒ 判据分叉隐患（离线棘轮走 lib、CLI 走内联）。
  `git log -S "ledgerMismatch("` **为空** ⇒ 「import 了但忘了接线」。**已改为 CLI 直接调 lib 那份**，
  并加**源码级棘轮** ⑦（断言 CLI 调它、且 `--check` 分支内**不得**再出现 `ledgerVerSrc !==` 内联比对）。
- **4 条配对包装**（`assertNoExpansionField`/`assertLifecycleActive`/`assertScopeWithin`/`renderRetrieved`）：
  属**一处家族级决定**，不是 N 处缺陷 —— 引擎只 import 谓词，包装零消费者。
- **7 条正当**（`apply` 是 Cordis 入口、`writeMeta` 是文档明示逃生舱、`readGraph`/`readTemporalGraph` 是公开读 API 等）。
- **6 条待产品决策**（`hasNoUpgradeApi` 恒 `true` 且**真实测试引用 0**；`renderIntent`；`renderIdentityModel`；
  `progressiveDisclosure`+`refineTree` 同一处决定；`relationForProposal`＝T7 三选一）——**缺的是决策不是代码证据**。
- **两处「注释不实」记账**：`isMetadataMemoryText` 声称服务「不 `parseMemory` 的读路径」，而生产读路径**全走** `parseMemory`。

### 2. T12 时间炸弹 → **闭环**（22 个文件判定，只有 1 个真炸弹，**引爆日 2027-01-02**）

- **先纠自己的数**：题面记「12 日期 / 354 处 / **8 个文件**」，**实测 12 日期 / 357 处 / 22 个文件**
  （`09-07` 实为 87、`09-01` 实为 12）。
- **判定方法**：逐文件读断言 + **行为探针**（把 `new Date()`/`Date.now()` 钉到 2027-06-01 / 2027-10-01 /
  2028-06-01 / 2030-01-01 各跑一遍，约 60 次，零文件写入）+ 机制探针直接读 `dist/identity/evaluator.js`。
- **成分**：357 处里 **304 处（85%）不参与任何阈值运算**（路径/文件名 264 + 正文文本 25 + 期望串 15）；
  余 53 处是 fixture 元数据，**只有 `periodTo` 的默认值 1 处被「今天」消费 —— 就是那颗炸弹**。
- **真炸弹（已修）**：`test/recall-attribution.test.ts` 场景 58（`:2153`）与 60（`:2196`），同一根因：
  `putReflection` 默认 `period.to = "2026-09-05"` → `identity/evaluator.ts:48` 当作 `lastSeen` →
  `recency = exp(-ln2·days/90)`，闸门 `>= 0.4` ⇒ **本地日期 ≥ 2027-01-02 时 days=119 → recency=0.39992 < 0.4
  ⇒ status 由 `accepted` 变 `candidate` ⇒ 不提 v2 / `learned` 不增**。
  实测 bisect：`2026-12-31`/`2027-01-01` **PASS**，`2027-01-02`/`01-03`/`01-10` **FAIL**。
  **修法一行**：`to: opts.periodTo || today()`（与场景 30 的既有修法同形）。场景 60 此前**被 58 掩盖**。
- **未判定（诚实）**：未做逐日 sweep（理论存在「非单调窗口」；已逐条排除排序类断言，无已知路径）。

### 3. T16 版本偏差 → **8 个平面逐项核对，T16 结案**（结论：**机制面零漂移，组合/产物面全漂移**）

| 平面 | 结论 |
|---|---|
| `isolate` 继承 / `export default` 丢命名空间 / `ctx.get` vs 属性代理 | **三者 SHA256 与克隆面相同**（源码逐字节一致）⇒ **可继续引用克隆面行号** |
| `dsh-base` 组合行 | 克隆 86 → 运行 84（**去掉** `tool-str-replace-editor`、`tool-subagent-report`；后者包已退役） |
| `dsh-web-app` 组合行 | 克隆 85 → 运行 94（**新增 10 个客户端行**：`open-in-app`/`workspace-files`/`file-upload`/`resources`/`ui-schedule` 等） |
| `dsh-sdk-minimal` | 运行面新增 `invariants` + 4 个 `*/invariant` 行；**4 个子路径确实可解析**（非死引用） |
| agent preset | **清单一致、内容已变**（4 目录 10 文件，6 个文件内容不同；`text:` → `prefix:`/`suffix:`） |
| 「每个包都发 `./invariant`」 | **系统性丢失**：`dsh-invariants`/`dsh-base`/`dsh-web-app` 在 0.1.1-rc.x **是** → 0.1.5-rc.x **否**；**服务包四版本全「是」** ⇒ 纪律在发布产物上**不统一**，而 `packages/AGENTS.md` 仍写 `Every package owns ./invariant` |

**口径纠正**：原型链挂在 **isolate 符号表**上，**不是** `entry.realm`（方向对、对象不准，已更正）。

### 4. 变更文件与门禁

`tools/audit-wiring.ts`（测试引用口径）· `tools/toolset-authority.ts`（接线 `ledgerMismatch`）·
`test/toolset-authority.test.ts`（新增 ⑦ 判据收一处棘轮）· `test/recall-attribution.test.ts`（时间炸弹一行修法）·
`BACKLOG.md`（新增「A 段残余 18 条」结案节；T12 / T16 结案；头部计数 25 → 23 / 18 → 20）·
`CHANGELOG.md`（本条）· `README.md`（版本表 + 行）· `package.json`（`version` → 1.15.43）。
**门禁**：`node test/toolset-authority.test.ts` **ALL PASS**（含新棘轮）· `node test/recall-attribution.test.ts` **ALL PASS**
（修前在 2027-01-02 会红）· `npm run audit:wiring` 的 A2b 由 1 → **0**。
**未改动**：`index.ts` 与业务源码、`dist/`。

## [v1.15.42] **确定性基准门**（T14 落地）：协议 + 签入基线 + 比较器 + 双跑逐字比 + 接进 `verify`

**一句话**：本仓唯一的评测（`tools/retrieval-eval.ts`）此前**只打印读数** —— 「这次比上次好还是坏」**无法由机器回答**。
本轮按 hl_mem 的门禁形状做成可执行门，并**补掉它自己的两个洞**（比较器零调用、「两跑逐字相同」只有散文）；
同时在实测中发现**本仓语料是活的** ⇒ 回归门在本部署恒「不可比」，于是把「不可比」做成**显式的第三种结论**。

### 1. 落地物

| 文件 | 职责 |
|---|---|
| `tools/retrieval-eval.lib.ts`（新） | 纯逻辑：稳定序列化 / 语料指纹 / 协议自检 / **基线只含聚合面**白名单 / 比较器（先证同源再比数值） |
| `tools/retrieval-eval.protocol.json`（新） | **冻结协议**：门控指标显式列名（`recall_mean`·`noise_offtopic_mean`·`avg_returned_mean`）+ 方向 + 容差 + **外部调用必须 0** |
| `tools/retrieval-eval.baseline.json`（新） | **签入基线**（`provenance: local_dev_aggregate_only`）：只有聚合数字 + 哈希 + 计数 |
| `tools/retrieval-eval.selftest.ts`（新） | **12 组标定测试**（全合成夹具）：每一类判据的**负例** |
| `tools/retrieval-eval.ts`（改） | 新增 `--json` / `--check-baseline` / `--update-baseline`（**拒绝覆盖**，需 `--force`）/ `--compare` / `--determinism-check`；**修默认语料根** |

### 2. 逐条兑现 T14 完成判据

- ① **基线含身份字段**：`dataset_sha256`（`sha256-utf8-lf-v1`，用**仓库相对路径** ⇒ 与机器/盘符无关）+ `protocol_sha256` + `case_count`。
- ② **`npm run eval:retrieval:compare`**：退出码 **0 通过 / 1 违规 / 3 不可比**（合取式判据）。
- ③ 给 T9（sidecar 读路径收益）与 T11① 的评测提供**可机器判读**的读数面。

### 3. 补掉 hl_mem 自己的两个洞

- **(a) 比较器不再零调用**：`npm run eval:retrieval:check`（协议自检 / 基线只含聚合面 / 协议同源 / 门控读数齐备）**已接进 `npm run verify`**；标定测试自动进 `run-tests`。
- **(b)「两跑功能字段逐字相同」从散文变成脚本**：`--determinism-check` 同进程跑两遍并**逐字节比对**，真仓库**通过 ✅**。
- 「**外部调用即失败**」：运行期把 `globalThis.fetch` 换成**抛错桩 + 计数**，比较层再判一次（hl_mem 同形）。

### 4. 🔴 本仓特有结论：语料是**活的**，哈希钉死的基线恒不可比

实测：两次调用之间语料从 **1414 → 1435** 条（插件每回合都在写新记忆）⇒ `--compare` 的实测输出就是 **「不可比」**。
hl_mem 的语料是冻结数据集，所以它的做法（dataset 哈希钉死基线）**在本仓不成立**。
故把「不可比」做成**显式的第三种结论**（退出码 3，既不是通过也不是失败），与已吸收的
「分母为 0 要报『不可测』而非 0」同一条纪律。可执行判据因此分两层：

| 层 | 命令 | 本部署可用性 |
|---|---|---|
| **确定性**（两跑逐字相同） | `npm run eval:retrieval:determinism` | ✅ 恒可用（与语料无关） |
| **完整性**（协议/基线/同源/读数齐备） | `npm run eval:retrieval:check`（**在 `verify` 里**） | ✅ 恒可用 |
| **回归**（比基线） | `npm run eval:retrieval:compare` | ⚠ 只在**冻结语料**上可用；本部署正常结论是「不可比」 |

**要真正启用回归门，唯一路径是冻结一份语料快照**（`SHADOW_EVAL_ROOT=<冻结工作区>` + `--update-baseline` + `--compare`）；
**是否物化这样一份副本＝用户取舍**（会把真实记忆复制到新目录）⇒ **本轮没有替用户做**，留在 T14 作为唯一未决项。

### 5. 顺路修的真缺陷 + 自我暴露

- **默认语料根硬编码 `D:/project/dsh1`**，本机工作区在 `G:\` ⇒ `npm run eval:retrieval` 此前一直在**空语料**上跑
  （`docs=0` 且「跑得通」）。现默认由文件位置推导 + 环境变量可覆盖 + **找不到 `.shadow` 或语料为空时非零退出**。
- **标定测试当轮抓到的两处自身问题**：① 容差边界用十进制直觉数值（`0.5-0.01` 在 IEEE754 下是 `-0.010000000000000009`）⇒
  「恰好等于容差」断言**假红**，改用二进制可精确表示的值；② 把全文件 `console.log(` 批量换成 `emit(` 时**把 `emit` 函数体也换了**
  ⇒ `emit` 递归自调 ⇒ `Maximum call stack size exceeded`（**改名/批量替换是「断的是谁调用它」的高发区**）。
- **门禁状态**：`npm run verify` = **47/47**（46 → 47）；`npm run eval:retrieval:check` 通过；`--determinism-check` 通过；
  `--compare` = 「不可比」（退出码 3，符合设计）；`--update-baseline` 二次运行**被拒绝**（退出码 1）。

### 6. 变更文件

`tools/retrieval-eval.lib.ts` / `tools/retrieval-eval.protocol.json` / `tools/retrieval-eval.baseline.json` /
`tools/retrieval-eval.selftest.ts`（四者新增）· `tools/retrieval-eval.ts`（改）· `package.json`（`version` → 1.15.42；
新增 4 个 script；`verify` 加一步）· `BACKLOG.md`（T14 改写）· `CHANGELOG.md`（本条）· `README.md`（版本表 + 评测门小节）。
**未改动**：`index.ts` 与任何业务源码、`dist/`。

## [v1.15.41] **结构门**`audit-layers`：把「结构纪律」从散文做成可执行判据（T13 落地）

**一句话**：本仓此前**一条结构纪律都没有可执行形态**（「`core/` 是纯函数」「层间不许成环」都只是散文）。
本轮**先实测再定表**——一份「按目录分层」的草案**实测即为红**，据此**换掉了判据对象**，
落下三条**实测为真**的门（文件级无环 / 纯模块白名单零副作用 / 方向禁令），并接进 `npm run verify`。

### 1. 先实测，结果**否掉了**原来的草案（这是本轮最重要的结论）

按 hl_mem `check_imports.py` 的形状起草的表是「`core/` 不得碰 `node:fs`、不得 import `persistence/`」。
用一次性只读探针（AST 不可用，见 §4）量真实仓库（**193 文件 / 523 条 import 边**）后，**草案当场为红**：

| 草案禁令 | 存量违规 | 说明 |
|---|---:|---|
| `core` 不得碰 `node:fs` | 1 | `core/toolset-exec.ts:19` —— 它是**执行器**，不是纯派生 |
| `core` 不得碰 `node:child_process` | 1 | 同上 `:18` |
| `core` 不得 import `persistence` | 4 | `core/judgment.ts:3` / `core/memory.ts:4` / `core/writer-materialize.ts:12,13` |
| `query` 不得 import `persistence` | 4 | `query/materialize.ts:4,5` / `query/query.ts:6,7`（读路径**本来就要**读落盘的文件） |

⇒ **`core/` 不是「纯函数层」，是「脊柱」**（`paths.ts`/`types.ts`/`util.ts` 无依赖；`memory.ts`/`writer-materialize.ts`/`toolset-exec.ts` 有副作用）。
**照搬目录分层会造出一个当轮就是红的门**，也就是本仓最忌的**假闸门**。故**改判据对象**，不照抄它的形状。

### 2. 实测得到的**为真**的三条判据（基线全绿 ⇒ 接进去就是棘轮）

| 判据 | 实测 | 为什么它是对的 |
|---|---|---|
| ① **文件级依赖图无环** | **0 个**强连通分量（193 文件 / 523 边） | 环会让初始化顺序与判据来源不可推理；这是**当前事实**，接进去只防退化 |
| ② **纯模块白名单零副作用** | `core/paths.ts` / `core/types.ts` / `core/util.ts` / `security/scrub.ts` **import 数均为 0** | 「派生可复算」的前提就是这几个文件没有环境；白名单**带腐化自检**（路径不存在即违规） |
| ③ **方向禁令** | 4 条 + 2 个全局禁用目标，**均 0 违规** | `core↛query`（ADR-0003）/ `core↛tools` / `persistence↛query` / `query↛tools` / **任何层↛`index.ts`** / 任何层↛`agent-presets` |

**明确不判**：**层间环**。实测**存在**一个 `{core, evidence, persistence}` 层间环 —— 其成因就是 §1（`core/` 是混合层），
**不是**文件级环。把它写成禁令 ⇒ 门**当场红** ⇒ 又是假闸门。故只**留档**（CLI 会打印成因），要消掉它得先拆 `core/`，那是架构决策。

### 3. 落地与接线

- `tools/audit-layers.lib.ts`（**纯逻辑**：建图 / Tarjan 强连通 / 判据表 / 违规汇总；不做 IO；**复用** `audit-wiring.lib.ts#stripComments`，不写第二份注释剥离器）；
- `tools/audit-layers.ts`（CLI：收集语料 / 打印**口径** / 非零退出）；
- `tools/audit-layers.selftest.ts`（**8 组标定测试**，全用合成夹具：环的正反例 / 纯模块副作用 / **白名单腐化** / 方向禁令三向 / 相对解析 / **注释里的幽灵 import 不得计入** / 说明符分类 / 判据表非空且带 `why` / Tarjan 正反例）；
- `package.json`：新增 `audit:layers` 与 `audit:layers:selftest`，并把 **`npm run audit:layers` 接进 `npm run verify`**（在 `typecheck:tools` 之后）。
- **门禁状态**：`npm run verify` = **46/46**（45 → 46：多一个 `tools/*.selftest.ts`）；`npm run audit:layers` 在真仓库**通过 ✅**（193 文件 / 523 边 / 0 环 / 0 方向违规 / 0 未解析）。

### 4. 两个当轮自我暴露（留档）

- **标定测试当轮抓到我自己的一个真 bug**：`auditLayers` 里层边曾写成
  `.map((e) => ({ from: layerOf(e.from), to: layerOf(e.to), ...e }))` —— **`...e` 在后会把层名覆盖成文件路径**，
  于是**方向禁令永不命中**（门恒绿，正是「机制对了、断的是谁调用它」那一族）。是 `audit-layers.selftest.ts` 的 ③ 当场抓到并修。
  **没有标定测试，这个门会安静地什么也不检查。**
- **判据表在合成夹具上会「正确地」自曝**：默认白名单指向真仓库文件，合成夹具下每条都报「白名单腐化」
  ⇒ 想要「零违规」的正对照必须显式清空判据表。这条已写进测试注释与 ⑦ 的断言。

### 5. 方法与未做（诚实边界）

- **不用 TypeScript 编译器 API**：本仓 `typescript@7.0.2` 是 **native(Corsa) 移植**，包根 `.` **只导出 `version`**
  （连 `ScriptTarget` 都没有），AST API 在 `typescript/unstable/ast` 这类 unstable 子路径
  ⇒ 说明符抽取是**剥注释后的正则**，不是 AST。**已知边界**：字符串里形如 `from "./x"` 的文本会误命中，命中项须人工复核。
- **语料口径**：`*.ts` 递归，**排除** `dist/node_modules/.git/.docs/agent-presets/docs/_research/test/tools`
  —— 测试与工具允许 import 任何东西，算进来会让本门失去意义（口径由 CLI **打印出来**）。
- **未做**：① **复杂度预算**（T13 原文第二条，hl_mem 靠 AST 量行数/参数数）——本仓无 AST，需另想代理判据；
  ② **拆 `core/`** 以消掉层间环（架构决策，不是门禁）；③ 未把 `audit:layers` 接进 `tools/run-tests.ts`（走的是 `verify` 的独立步骤，与 `typecheck:tools` 同形）。

### 6. 变更文件

`tools/audit-layers.lib.ts`（**新增**）· `tools/audit-layers.ts`（**新增**）· `tools/audit-layers.selftest.ts`（**新增**）·
`package.json`（`version` → 1.15.41；新增 2 个 script；`verify` 加一步）· `BACKLOG.md`（T13 改写）· `CHANGELOG.md`（本条）· `README.md`（版本表 + 结构门一行）。
**未改动**：`index.ts` 与任何业务源码、`dist/`（`tsconfig.json` 的 `include` 只有 `index.ts`，tools 不进产物）。

## [v1.15.40] **本地全部材料**总台账 + 平台契约纠错（`MATERIALS.md` 建立，T16）

用户 2026-09-12 立目标：「**本地全部材料深入分析 整合 吸收 审查 以及 论文 github**」（目标轮次第 1 轮）。
**纯文档 + 待办登记：无代码 / 行为改动。**

### 0. 一句话结论

**先做「整合」**：把「本地全部材料」的定义从「hl_mem 一份」扩到**磁盘上真实的 8 项**
（DSH 本体 + 6 个外来 repo + 本仓），并**建账**；然后**四路并行深读**，回报里有 **7 条「下游可能理解错」**
——**已自查 1 条、已回运行体裁定 1 条**，其余入 T16。

### 1. 名册（`MATERIALS.md`，**磁盘枚举生成**）

| 材料 | 远端 | HEAD / 版本 | 许可 | 规模 |
|---|---|---|---|---|
| `dsh-w/deepseek-harness` | `deepseek-ai/deepseek-harness` | `cd5ef81481` / **0.1.2-alpha.1** | **MIT** | 74,163 文件 / 1.64 GB |
| `hl_mem` | `lohr13/hl_mem` | `aa5d068` / v1.1.7 | Apache-2.0 | 1,025 文件 / 16.8 MB |
| `openviking` | `volcengine/OpenViking` | `592c0fe` | **AGPL-3.0** | 3,891 文件 / 93 MB |
| `archify` | `tt-a1i/archify` | `82e63c9` | MIT | 422 文件 / 36 MB |
| `awesome-dsh-plugin` | `mozhuanzuojing/awesome-dsh-plugin` | `271834d5` | CC0 | 1,726 文件 / 8.5 MB |
| `ppt-master` | `hugohe3/ppt-master` | `a160e776` | MIT | 14,354 文件 / 725 MB |
| `voyager` | `Nagi-ovo/voyager`（fork） | `b68eeac` / `voyager@1.7.1` | GPL-3.0 | 56,514 文件 / 610 MB |

**⚠ 第一条必须标定的事**：harness 克隆是 **0.1.2-alpha.1**，**运行体是 `dsh-web-app@0.1.5-rc.2`**
⇒ 凡据本地文档得出的结论，**必须回运行体核对**（本轮已用这条纪律裁定了 ADR-0074）。

### 2. 已自查 / 已裁定（两条）

- ✅ **`export default` 静默丢 `inject`**（`postmortem/0001:110-111`）——**本仓不适用**：
  `index.ts` / `dist/index.js` **无 `export default`**（只有命名导出）。
- ✅ **`sandboxPolicy` 省略是否合法** —— 平台文档说合法，**回运行体核对**：
  `dsh-fs-sandbox/index.js:158` `sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()`（省略确实合法）；
  但 `dsh-sandbox-policy/lib/index.js:116-117` 的**无参**解析取**服务级**根（`config.workspaceRoot ?? process.cwd()`），
  只有 `:138-142` 的 **`resolve({session})`** 才用 `session.header.cwd`
  ⇒ **ADR-0074 的结论成立、机制表述已修正**（已落 `adr/0074` 补记）。

### 3. 本轮最有价值的其它回报（入 T16 / 材料台账）

- **`isolate` 是行级 option，`group` 不继承**（`vendor/loader/src/config/isolate.ts:79`）⇒
  `editing-cordis-compositions` 技能那句「wrap the provider **and every consumer** in one group carrying an
  isolate realm」**散文不精确**（**每行都要各自写 `isolate`**）。
- **平台已有、本仓可能在重造的四项**：`ctx.sessionProjections`（纯 fold ⇒ 取代自建事件折叠 + 推送）、
  `ctx.storageDomain`、`ctx.invariants`、`ctx.jobs`。
- **openviking**（AGPL ⇒ 只取概念）：8 条可移植 + 一张 8 行「**设计承诺 vs 落地**」不一致表
  （如 `hotness_alpha` **默认 0.0 = 默认关闭且无对照消融**；CLI 兼容门是 `|| true` + 缺件即 `exit 0`）。
  最值得抄的一条：**用子进程起新解释器验证依赖方向/循环导入**（同进程断言会被 import 顺序掩盖）。
- **四个 DSH 生态仓**：**只有 `archify` 是真 DSH 插件**（`dsh.bundle` + `cordis.patch.yml` + 适配器测试 + 独立 CI）；
  `awesome-dsh-plugin` 是「手写 YAML + 脚本生成 README + CI 强校验」（1556/1556 一一对应，但 3 个 `.pyc` 入库）；
  `voyager` 与 DSH 的关系是**文档级 + DOM 级**（**不是插件**）；`ppt-master` 与 DSH **零关系**。

### 4. 论文层（`arXiv`）

已在用：MemoryBank（`2305.10250`，hotness 的**真实出处**）、工具数量拐点（`2606.30317`）、RAPTOR/HeteRAG/UMG-RAG、LongMemEval。
**本轮检索到的新线索（仅检索，未读全文 —— 诚实标注）**：
- ⭐ [arXiv:2606.26511](https://arxiv.org/abs/2606.26511)「Temporal Validity in Retrieval Memory」——
  副标题「**A deterministic supersession layer that retrieval-augmented generation cannot match by construction**」
  ⇒ **与 D3 直接同题**，可能为本仓 ADR-0059 + ADR-0061 补独立证据；
- [arXiv:2602.06052](https://arxiv.org/abs/2602.06052) 与 [ACL 2026 Findings](https://aclanthology.org/2026.findings-acl.2069/) 两篇**记忆机制综述**；
- [arXiv:2608.04746](https://arxiv.org/abs/2608.04746)（Scrub Jay 情节记忆原则）。
**纪律不变**：未读全文前不得引用其结论；别家读数**不得当作本系统的证据**。

### 5. 变更文件

`MATERIALS.md`（**新增**：材料总台账）· `adr/0074`（**补记**：运行体证据 + 机制修正）·
`BACKLOG.md`（**新开 T16** + 头部 25→26 条）· `references.md`（加指向 `MATERIALS.md` 的指针，避免两处重复登记）·
`CHANGELOG` / `README` / `package.json`（`1.15.40`）。**无代码改动**；门禁 **45/45** 未受影响（本轮跑过一次确认）。

### 6. 未验证 / 未做（诚实标注）

- **四路回报中的 5 条未回运行体核对**（版本偏差：克隆 0.1.2-alpha.1 vs 运行 0.1.5-rc.2）⇒ 一律标注，入 T16。
- **论文全部未读全文**（§4 只是检索线索）；**harness `packages/`（12,492 文件）与 `apps/` 未读**；
  `.agents/notes` 的 2,431 个 md/yaml 未逐篇读（只有结构索引与计数）。
- **`ppt-master` / `voyager` 的源码未读**（只做定位）；`archify` 只读了 DSH 适配层。
- **未运行任何外来仓库的代码；未安装任何依赖。**


## [v1.15.39] hl_mem **第三轮深读（首次本地克隆、一手读源码）** —— 三处自我更正（ADR-0078）

用户 2026-09-12 指令「**继续深入研究资料**」，并在方法选项中选定「**本地克隆 hl_mem 到工作区**」
（此前 0073 / 0076 两轮全程 raw 抓取、**从未克隆**）。克隆到 `G:\project\dsh1\hl_mem`（在 `dsh-shadow`
仓库**之外**，避免把 16 MB 外来代码混进本仓历史）：v1.1.7（`aa5d068`，983 commits，**1025 文件 / 16.03 MB**）。
**全程只读**：未运行、未安装、未修改任何文件、未做 git 写操作。**纯文档 + 待办登记：无代码 / 行为改动。**

### 0. 一句话结论

**一手读源码的第一件事，就是发现前两轮有三处记述不准。** 其中一处**实质改写了 D3 的对照面**。

### 1. 先做一件此前没人做的事：**以磁盘枚举算覆盖率**

| 项 | 实测（`git ls-files`） |
|---|---|
| 全仓 | **1025 文件 / 16.03 MB** |
| 本轮之前**从未一手阅读**的面 | **901 文件 / 6.67 MB = 87.9% 文件** |
| 另加 `evaluation/` 绝大部分（67 文件中只读过 2 个 README） | 8.15 MB |

⇒ 0073/0076 的「未读清单」**漏了整片**：`docs/research/`(7) · `docs/archive/`(21) · `docs/*.md` 顶层(13) ·
`docs/dev/` · `docs/benchmark/` · `tests/`(384) · `scripts/`(42) · `src/`(352) · `storage/migrations/`(69)。
**根因**：清单是**手写散文**而不是**磁盘台账** ⇒ 既不完整也**无法自证完整**（与「靠自觉不是闸门」同族）。

### 2. 三处**自我更正**（本轮最重要的产出）

**更正①「`assert_transition()` 是写侧守卫」——不准确**（更正 ADR-0077 D1）
- 守卫本身是纯函数（`src/hl_mem/lifecycle.py:111-118`）；但**写原语不强制**：
  `src/hl_mem/storage/claims.py:160-169` 的 `update_status()` docstring 写「校验目标状态后更新」，
  **实际只做 `ClaimStatus(status)`（只校验「是不是合法状态名」）**、**不校验转换**、**不读当前状态** ⇒ 原理上不可能校验转换。
- 收口靠**调用点自觉**：全仓 **28 处**调用、跨 **13 个文件**。
- **至少两处完全绕过**：`workers/deduplicate.py:571-575`（治理回滚，`WHERE id=?`、无状态前置条件）、
  `application/conflict_backlog.py:178-186`（集合式批量修复）。
- ⇒ 它 `AGENTS.md` 的「**所有**状态变更统一经过 `assert_transition()`」**作为全称命题为假**。
- **另一条更尖锐的**：矩阵里 `SUPERSEDED`/`EXPIRED`/`RETRACTED` 是**终态（无出边）**，而回滚通道**必须反向走这些边**
  ⇒ **矩阵只是「正向可达」的真相，不是「可达状态」的完整真相**。
- **对本仓的影响**：ADR-0077 D1 的**结论不受影响**（不照搬写侧守卫），但理由**更强**了——对方那条所谓
  「写侧守卫」本身也没在写侧强制；已落 `adr/0077` 补记。

**更正② ADR-0004 的协议在生产里是「窄面 + 默认只建议」，不是通用细粒度取代**（更正 ADR-0076 §1）——**这条最要紧**
- `src/hl_mem/state_latest_wins.py:1` 自述：`ADR-0004 **narrow** deterministic latest-wins relation for config.version`。
- `:94-95`：`canonical_slot != "config.version"` ⇒ **一律 `compatible`（不做取代）**。
- `src/hl_mem/config/models.py:508-510`：`latest_wins_slots: tuple[Literal["config.version"], ...]`
  —— **类型层面锁死只允许一个 slot**；`tests/unit/test_config_loader.py:596` 有测试断言「TOML **不能**授权白名单外的 slot」。
- `config/models.py:506`：`latest_wins_mode` 默认 **`"observe"`**（只写审计、不执行）；而**同一文件** `:501-504`
  的 `provenance_mode`/`price_target_mode`/`plan_fulfillment_mode` **默认都是 `"enforce"`** ⇒ **默认值按破坏性分级**。
- ⇒ **它给出的不是「细粒度取代值得做」，而是「细粒度取代被收窄到一个 slot、且默认只观察，才敢上线」。**
  **这把 D3 的问题改写为**：*要不要为**特定 slot**建确定性取代，其余一律 `compatible`（不做取代）*。

**更正③ 路径与计数**：`specs/` 实际是 `docs/superpowers/specs/`（11 篇）；migration 数 ——
它 `AGENTS.md` 写「**57 个 SQL（001-057）**」、其 `CHANGELOG` 写 **60**，**我实测 = 60 个 `.sql`（001…060）+ 9 个 `.py` = 69 个文件**
⇒ **它自己的 agent 指令文件比事实旧 3 个**（本仓 ADR-0072「台账比事实强」的同族）。
附带方法教训：同一目录子代理数出 **8 个 `.py`**、我实测 **9**，差额是 `snapshots/__init__.py`
⇒ **计数差异常常不是「谁错了」，而是「枚举口径没写出来」**。

### 3. 一手读到的「确定性取代」真身（对 D3 直接可用）

| 机制 | 证据（`state_latest_wins.py`） |
|---|---|
| 版本量级**只用于相等**，不用于排序 | `:106-108` 相等 ⇒ `duplicate`/`corroborates`（**证实**「版本大小不决定时间方向」，从此有代码证据） |
| 方向**只由可信事件时间**决定 | `:109-114` 要求双方 `event_time_trusted`；`_parse_time` **要求 tz-aware**（`:167`）；**时间并列 ⇒ `needs_review`**（`:112-113`） |
| `historical_predecessor` **绝不移动 current tip** | `:183` `current_tip_id=existing.claim_id` **恒为旧者** |
| 任何否决 ⇒ `needs_review`（**永不破坏性关链**） | `:96-97`；8 条硬否决 `:122-139` + 7 条证据否决 `:142-158`（含冻结的产物契约三元组） |
| 候选发现是**精确坐标匹配** | `:100-104` 精确匹配坐标（`json(qualifiers_json)=json(?)`），**无 FTS / 无向量 / 无编辑距离** |
| `conflict_key` 是**派生指纹** | `application/latest_wins.py:99` `json.dumps(astuple(coordinate))` |
| **有界决策：候选过多即拒判** | `:104` `LIMIT 17` + `:127` `local_snapshot_matches = len(candidates) < 17` |
| 决策前**实测无环 + 深度** | `:117-122` recursive CTE 沿 `superseded_by_id` + cycle 检测 + `depth<64` |
| **CAS 失败抛错** | `:77-80` `.applied` 假 ⇒ `raise RuntimeError("latest-wins compare-and-set failed")` |

### 4. 找到本仓 `verify` 的**下一层形态**（hl_mem 的**门禁生态**）

- **11 个 `scripts/check_*.py`**：其中**分层方向是 AST 检查而非约定**（`check_imports.py:12-19` 的
  `FORBIDDEN_IMPORTS` 表 + `:61-83` `ast.parse` 扫真实导入，失败 `return 1`）、**复杂度预算只能降**
  （`check_complexity_budget.py` + `complexity_budget.json`）、6 个快照比对。
- **确定性零网络基准门**（`docs/benchmark/core-v1.md`，**一手读完全文**）：`:3-8`「deterministic, public,
  **zero-network** regression gate … **any external model call fails the run**」；`:17-19` 冻结容差
  （≤`0.01` 回归 / HTTP 100% / forbidden 0 / P95 ≤ `max(baseline+150ms, baseline×1.25)`）；
  `:21-22`「**功能字段与 hash 必须跨两跑逐字相同**，只允许延迟字段可变」；基线**签入** + `compare_core_v1` 子命令。
- **零 LLM 缝合线冒烟**（T11② 的真身）：`src/hl_mem/evaluation/smoke_full_chain.py:402-403`
  「`len(checks) != 13` ⇒ 抛错」（**检查项数量本身是断言**）、`:404-412` 四条 seam 全过才算过、`:415` 产出写 `zero_llm: True`。
- **13 条冻结阈值 + 零容忍 + 可满足性审计**：`state_experiment_thresholds.py:9-23`
  （`supersede_edge_precision >= 1.0`、`counterexample_cross_coordinate_supersede <= 0`）+ `:26-106` 成对整数边界求交。
- **三层冻结语料已落地**（实测 `evaluation/datasets/` 含 dev/sealed/sealed_r2/sealed_r4 的 corpus+gold+manifest ≈ 3 MB）。
- **预注册 A/B 协议**（`docs/research/2026-09-04-p1-extraction-ab-v2-protocol.md`）：`:3`「装备就绪、**尚未执行**」、
  `:7` 单变量、`:22-25` 两臂唯一差异一行 diff、`:37` 每臂只跑一次、`:39-41` **付费前身份 hard gate**、
  `:73-76` 任一臂身份无效 ⇒ **整轮无效**。

### 5. 不吸收（含 hl_mem 自己的坏味道）

DB 级不变量（触发器/部分唯一索引）本仓无对象；双时间四列与 as-of 查询与 0073 结论一致；
hl_mem 的 `conflict_cases` 状态集**在 5 处各写一遍**（`OPEN_CASE_STATUSES` ×3、`TERMINAL_...` ×2，类型还不同）
⇒ **正是本仓 ADR-0063/0070 要防的形态，作为反例记录**；其 `schema_migrations` **无 checksum 列**；
**我实测 `evaluation/results/` 只有 `README.md`（2130 字节）⇒ 公开长测分数只在索引里、原始结果不在仓，一律不引用为已证。**

### 5b. `docs/archive/`（21 篇）+ 7 篇顶层文档：一条**新对照透镜** + 四条可吸收

**新透镜（两端均我一手核实）：`schema 继承` ≠ `运行时契约继承`** ——
`docs/archive/design/audit-log-design.md:183-191` 要求 `emit()`「**It never opens SQLite** … or waits for
capacity on the calling thread」（只 `queue.put_nowait`、<1 ms 返回、单独 daemon writer 线程批量写）；
而落地是 `src/hl_mem/observability/audit.py:44`「Best-effort **synchronous** SQLite audit writer」+ `:144`
**在调用路径上直接 INSERT**。**同一份设计的 DDL 却被逐字照搬进 migration `004`。**
⇒ **设计契约的另一半（阻塞性/并发/顺序/失败行为）被静默放弃，而 schema 一字不差。**
本仓既有审计（ADR-0062 / 0070）只问「机制有没有接线」，**没问过「契约的哪一半被静默放弃」** ⇒ 补上这一问。

**它的归档明确拒绝承担追溯**：`docs/archive/README.md:28`「以上 proposal 均不代表仍在排期；
**完成状态和最终行为应从 CHANGELOG、能力矩阵和代码判断**」⇒ 归档**不维护「是否落地 / 为何被否」**。
而它自己的手写索引**已漂移两处**（我核实）：`design/` 3 篇只列 2 篇（漏 `extraction-pre-filter.md`）；
`:43` 称 `plan-lifecycle-research`「未实施」，而 `docs/architecture.md:386` 写 `plan.fulfillment_mode="enforce"`
**已是发布默认**（E5 过 143 条冻结场景）。⇒ **与本仓 ADR-0075 同族**（手写/逐名枚举必漂移）。
**本仓保留自己的三段式**（ADR 不可变决策 + BACKLOG 未完成台账 + CHANGELOG 已做什么）；
其 `docs/README.md:38-41`「Accepted ADR 不改写决策；新方向使用新 ADR」与本仓用**补记**的做法同构。

**四条可吸收**（→ **T15**）：① 归档条目带一句「为什么归档 / 现以谁为准」（21 篇只有 3 篇做到）；
② **退役路径表 + 启动报错**（`config/loader.py:35` `RETIRED_TOML_PATHS`，「提案被否」的唯一可执行档案）；
③ **弃用强制前置 + 必须点名替代品或明说无替代**（`docs/compatibility.md:20-29`）+ 三档稳定性各有变更预算（`:33-35`）
+ 未知版本显式失败（`:74-75`）+ 不可逆变更前恢复集与 **rollback 数据丢失显式写出**（`:62-70`）；
④ **破坏性动作二次确认 + 读可重试 / 写不可重试**（`docs/delegation.md:89-91`、`:130`）。

### 6. 自曝

做覆盖率检查时我自己两次用了**未标定**的判据：① 用**字面路径**匹配 ADR 文本，把 0076 明确写过的 `specs/`
判成「未提及」；② `-like "$p\*"` 里用**正斜杠**匹配**反斜杠**路径，5 个面匹配到 **0 个文件**（第一版台账整个是错的）。
两次都是**判据没标定就用**，与本仓反复记录的缺陷族同源。

### 7. 本轮落地

`adr/0078`（**新增**）· `adr/0077`（**补记**：更正外来机制描述）· `references.md`（**新增 §6.3 磁盘枚举覆盖率台账**）·
`BACKLOG.md`（**D3 对照面改写** + **T11① 推进** + **新开 T13 结构性门禁 / T14 确定性基准门 / T15 兼容性弃用纪律** + 头部）·
`CHANGELOG` / `README` / `package.json`（`1.15.39`）。**无代码改动**，回归状态不变（**45/45**）。

### 8. 未验证 / 未做（诚实标注）

- **仍未运行、未安装、未复现任何分数**；**仍未**把 hl_mem 的任何读数当作本系统的证据（0073 起纪律不变）。
- `docs/archive/`（21 篇）与 7 篇顶层文档**由子代理读完并回报**；我最吃重的五条**已逐条自查**
  （归档 README 的两处、`architecture.md:386`、`audit.py:44/144`、`audit-log-design.md:183-191`、`migrations` 计数），
  其余条目**在正文标注为子代理回报**。
- `tests/`（384 文件）与 `src/` 其余 ~344 个文件**未读**；更正①依赖 grep 计数（28 处），**未逐条核对**上下文。
- T13 / T14 / T15 只**开了条目**，未实现。


## [v1.15.38] 吸收 hl_mem 的**三件动作** + 修两处真缺陷（ADR-0077）

用户 2026-09-12 指示「**能吸收哪些？做**」——把 ADR-0076 读到的、可移植的部分**做掉**（不照搬）。
落地三件（状态机信号表棘轮 / 前置冒烟门 / 「错误方向不对称」成文），
并在实施中修掉**两处真缺陷**（都不是设计问题，是**接线/判据**问题），**顺带新开 T12**。

### 0. 一句话结论

**本轮最有价值的产出不是那三件吸收，而是那道门当轮就抓到了两处「既有失败」** ——
本仓此前「全绿」的结论**当时是错的**。两处都在干净 HEAD 上用 worktree 复现过。

### 1. D1 状态机**信号表 + 状态表 + 棘轮**（落实 ADR-0076 §6 ③）

0076 §6 ③ 记下 hl_mem 的「`assert_transition()` 把状态变更收口」，并判定**本仓缺这一收口**。
本轮补上，但**移植形态、不照搬写侧守卫**（本仓 `lifecycleOf` 是纯函数，没有可写坏的持久状态；
硬加一个不拦任何东西的守卫＝**假闸门**）。

| 组 | 棘轮断言（`test/lifecycle-signal-table.test.ts`，4 组全绿） |
|---|---|
| ① | `lifecycleOf` 读的 `rec.<字段>` 集与信号表声明集**双向完全一致**（新增未分类读 ⇒ 红） |
| ② | 3 个 `external` 信号在生产里**零写入者**（复用**已标定**的 `hasProducer`） |
| ③ | `derived` 的字段信号**确有**赋值点；参数信号**确有**调用点接线（`query/query.ts` 真传 `v.superseded`） |
| ④ | 8 个状态与实现**互满**、每个都能被正控产出、行为测试逐条覆盖 |

**机器核实的结论**（此前只是散文）：`pinned`（**真值**）/ `status:"archived"` / `status:"superseded"`
三条触发值在**本仓库生产代码里没有任何写入者**（生产只写 `pinned:false` / `active` / `compacted`）。

> **⚠ 自曝（本 ADR 第一版方案被工具自检挡下）**：表最初放在 `core/lifecycle.ts`。
> 把工具自检纳入门禁后**立刻变红** —— 工具报不出已知的 `status=superseded`。
> **机制**：表必须同行写出字段名（`field: "status"`）与触发值（`literal: "superseded"`），
> 而 `hasProducer` 的判据是「同行 200 字符窗口共现」⇒ **表被当成写入者** ⇒ 工具丢掉真线索。
> **改的是设计不是测试**：声明**唯一的消费方就是棘轮**（属测试断言）⇒ 表移到测试面；
> 棘轮扫的仍是**生产源码**，强制力不变；且移出后**无需任何文件排除**。
> 这与 `hasProducer` 标定测试③抓的「读点冒充写入点」是**同一误报机制** ——
> **是审计工具自己的自检挡住了「对审计工具的一次回归」**（ADR-0070 的标定投入本轮变现）。

### 2. D2 前置冒烟门：`npm run verify` 从「工具类型门」升级为**完整确定性缝合线**

hl_mem 的门是「**任何 sealed/held-out 语料开始提取前，必须先运行零 LLM 的完整缝合线冒烟；
命令失败时不允许烧语料**」。本仓**长期没有这条命令**：

| | 改前 | 改后 |
|---|---|---|
| `verify` | `typecheck:tools`（**只有工具面**） | `typecheck:tools` + `tsc --noEmit`（插件面）+ `test:all` |
| `test:all` | **不存在** | `npm run build && node tools/run-tests.ts` |
| 覆盖 | 插件**未类型检查 / 未构建 / 未跑任何测试** | 编译 + **43 行为测试 + 2 工具自检 = 45 项**（`ALL PASS ✅`） |

新增 `tools/run-tests.ts`，三条取舍：**每文件一个子进程**（插件有模块级全局副作用，同进程会互相污染 ⇒
假红/假绿）、**`stdio:"inherit"` 不用管道**（受约束沙箱下 pipe 会被拒 EPERM）、
**`test/*.test.ts` + `tools/*.selftest.ts` 同批**（把 **V6**「审计工具未接入任何自动门禁」
从「靠人记得跑」变成「门禁里就有」—— 分诊**报告**本身仍未进门禁）。

### 3. D3 「错误方向不对称」成文（ADR-0076 §2 只到「建议」）

hl_mem `docs/adr/0004` 原文：**「并存噪音是可观察问题；错误关链是静默破坏。不能证明时保留多值比制造单一真相安全。」**
⇒ 落在**三处**：`CONTEXT.md`（术语级）、`adr/0061` 补记（判据级）、`BACKLOG.md` D3（待决策级）。
它与本仓 ADR-0049（缺件不静默）是**互补的一对**：一个管**缺失可见**，一个管**破坏保守**。
**不替用户做 D3 的决策。**

### 4. D4.1 真缺陷：consolidated 文件的 `time` **两条读路径两套值**（ADR-0069 同族第 3 例）

- **写侧**（本进程缓存）：`ep.startedAt.slice(11,17).replace(/:/g,"")`，而 `episode.ts:49` 的格式是
  `YYYY-MM-DD HH:MM:SS` ⇒ 取到 `"09:00:"` ⇒ `"0900"` —— **4 位，根本不是 HHMMSS**（全仓其它记忆都是 6 位）。
- **读侧**（重启后磁盘重扫）：从**文件名**反解 `^\d{4}-\d{2}-\d{2}--(\d{6})`，而 consolidated 文件名
  `ep-<id>-consolidated.md` **不含时间戳** ⇒ `time = ""`。
- **后果不是显示不准**：`time` 是**取代裁决**的输入（`query/query.ts:299` → `arbitrate.ts:63`，**严格** `t < newest`），
  裁决决定打分（×0.7）与生命周期标签 ⇒ 两个**同日同 `entry`** 的 consolidated 在磁盘路径上**并列**、
  谁都不被判取代，而较早的那个**应当**被取代 ⇒ **本进程与重启后裁决不同**。
- **修法（判据收一处）**：`persistence/files.ts` 导出 `timeFromName`（读侧反解，唯一正则源）与
  `memoryFileName`（写侧造名）；写侧文件名带 `<date>--<HHMMSS>-`，缓存 `time` **由文件名反解** ⇒ 两侧**同源**。
  旧的无时间戳文件仍被枚举（`time=""`，不崩）。
- **测试** `test/memory-time-single-source.test.ts`（5 组全绿），含**反例正控**：修前形态（两个空 `time`）
  **确实漏判取代** —— 证明「早者被取代」不是恒真。

### 5. D4.2 真缺陷：一颗**已在本地零点引爆的时间炸弹**（`recall-attribution.test.ts` 场景 30）

场景 30 要逐个暴露 8 个生命周期状态，`OBSERVED` / `VERIFIED` / `TRUSTED` 全缺。**根因可核对**：

1. `query/query.ts:276` `stale = ageDaysOf(rel) >= staleDays`（默认 **7**）；
2. `core/lifecycle.ts` 里 `if (stale) return "DECAYING"` **排在** `hits>0 → OBSERVED` / `confirms>=1 → VERIFIED` **之前**；
3. fixture 硬编码 **`2026-09-05`**；4. `core/util.ts:4` 的 `today()` 用**本地**日期。

⇒ 本机**本地 2026-09-12（UTC+8）而 UTC 仍 2026-09-11** ⇒ age = **7** ⇒ `7 >= 7` ⇒ `stale = true` ⇒ DECAYING 盖住三者。
**炸弹在本轮工作当天本地零点引爆。** 修法：fixture 日期改为**相对今天**（`today()` / `today(30)`）+ 显式
`retention: { staleDays: 7 }` ⇒ 测试**时间无关**。

> **这是一类问题，不是一处 ⇒ 新开 T12**：已扫出全仓硬编码日期的**风险面**（`2026-09-01`…`2026-09-12`
> 共 12 个日期、跨 8 个文件），但**只有场景 30 被确认与 `age`/`stale` 判据耦合**；其余需逐个判定。
> **它没被发现的原因，正是本轮 D2 要解决的那件事。**

### 6. 不做（判据不变）

`historical_predecessor`（乱序到达）属 **D3 决策范围**，用户未拍板 ⇒ 不吸收；
冻结语料 / 留出集 ⇒ 待 **T11①** 的语料决策；成熟度等级 ⇒ 0073/0076 已判为**外来口径**；
LLM 抽取 / 向量库 / 物理删除 / 双时间字段 / resident service ⇒ 0073 已否决，**本轮判据不变**。

### 7. 变更文件

`core/lifecycle.ts`（指向棘轮的注释，**逻辑零改动**）· `persistence/files.ts`（`timeFromName` / `memoryFileName`）·
`core/writer-materialize.ts`（文件名带时间戳、缓存 `time` 由文件名反解）·
`tools/run-tests.ts`（**新增**运行器）· `test/lifecycle-signal-table.test.ts`（**新增**棘轮，4 组）·
`test/memory-time-single-source.test.ts`（**新增**，5 组）· `test/recall-attribution.test.ts`（场景 30 改相对日期）·
`package.json`（`verify` / `test:all`）· `adr/0077`（**新增**）· `CONTEXT.md` / `BACKLOG.md` / `README.md` / `references.md`。
`dist/` 与源码同步重编译提交。

### 8. 未验证 / 未做（诚实标注）

- **真机未验证**：插件 `dist/` 不热加载（ADR-0057），需重启宿主；D4.1 的**端到端**（召回渲染里较早的
  consolidated 显示为 `裁决 superseded`）**未单独断言**，只到「文件名 / 磁盘反解 / 裁决函数」这一层。
- **`compact.enabled` 默认关** ⇒ D4.1 修的路径默认不会被走到（价值在于「一旦打开就正确」）。
- **T12 只拆了已引爆的一颗**；`verify` 会写 `dist/`（它含 `build`），跑完需注意工作区状态。
- T11① 语料决策、V6 的分诊报告进门禁 **未做**。


## [v1.15.37] 重点材料 hl_mem **深读第二遍** —— ADR-0004 对 D3 的直接对照（ADR-0076）

用户 2026-09-11 指示「最后探索重点材料」。**本轮是对 `lohr13/hl_mem`（重点材料）的第二遍深读**，
补齐 ADR-0073 在 `## 自检` 里**明确留空**的几处。**纯文档 + 待办登记：无代码 / 行为改动。**

### 0. 一句话结论

**0073 漏掉了一份 26 KB 的 ADR，而它恰好与本仓待决策的 D3 直接对题。**
`docs/adr/0004` 是一份**完整的确定性取代协议**（四元坐标 + 六分支 + 九前置 + 八硬否决），
它**独立走到了本仓 ADR-0059 的同一结论**，并**给出了数字**。

### 1. 先梳理 0073 留空了什么 / 本轮读到了什么

| 0073 自陈未读 | 本轮 |
|---|---|
| `docs/capability-matrix.md`「只读了前段约 7 KB，其余特性行未逐条读完」 | ✅ **全文**（**41 行**，含 0073 漏掉的**「成熟度定义」三行**） |
| `docs/adr/0004`（26 KB） | ✅ **全文** —— **0073 完全未提**，是本轮最大发现 |
| `AGENTS.md`（10 KB） | ✅ 全文 |
| `evaluation/README.md` + `results/README.md` | ✅ 全文（它**公开的对照臂口径**） |
| `benchmarks/archive/v030/` | ⚠ **只读了它的 `README.md`**（代码未读） |
| `docs/superpowers/plans/`（22 篇）+ `specs/`（11 篇） | ⚠ **仍未逐篇读**（仅取路径清单）—— **诚实标注** |

**仍未克隆、未运行、未试装；评测分数仍未复现。**

### 2. 最大发现：`docs/adr/0004` 与 **D3** 直接对题

本仓 D3 问「是否引入 `(subject, relation, object)` 三元组取代」。hl_mem 已经就同一问题写了冻结 ADR，
而它的坐标**比三元组更结构化**：

```text
StateCoordinate(namespace, canonical_subject, canonical_slot, coordinate_qualifiers)
```

两处细节与本仓纪律**同源**：`conflict_key` 只是该坐标的**持久化派生指纹**，「**不是第五个独立真相**」
（≈ 本仓 ADR-0003/0051「投影不当 source」）；候选发现**必须 exact-match 坐标** ——
「FTS、向量、编辑距离或模型判断**不得扩大候选边界**」。

**关系枚举冻结六类**：`duplicate` / `corroborates` / `supersedes_existing` / `historical_predecessor` /
`compatible` / `needs_review`。其中 `historical_predecessor`（**乱序到达**：新到的记录描述更早事实 ⇒
只接前驱、**不反向关闭 current tip**）是本仓单键+时间序**没有的分支**。

### 3. 一条本仓**尚未成文**的判据：错误方向不对称

`docs/adr/0004`「选择原因」原文：**「并存噪音是可观察问题；错误关链是静默破坏。不能证明时保留多值
比制造单一真相安全。」** 它与本仓 ADR-0049 是**互补的一对**：

| 纪律 | 管的是什么 |
|---|---|
| **缺件不静默**（本仓 ADR-0049） | **能力缺失**必须可见 |
| **错误方向不对称**（hl_mem ADR-0004） | **破坏性动作**（关闭/取代/删除）必须比「留下噪音」更保守 |

⇒ 已写进 **D3 的判据面**：采用细粒度取代时，**「宁可并存」不得被当成缺陷**。

### 4. 它为**本仓既有裁决**补了独立量化证据（0073 漏了这点）

本仓 ADR-0059 裁决「不把语义裁决交给 LLM」。hl_mem **独立走到同一结论并给了数字**：

| 读数 | 值 |
|---|---|
| E1C 云端 `qwen3.7-plus` 70 案 | exact **54/70**，且**有 2 个危险反向选择** |
| 双序一致性（29 个双序案） | 仅 **21/29 = 72.4138%**（**顺序敏感**） |

⇒ 本仓该裁决**不再是孤例**。**措辞必须收紧**：这是「别家的读数支持我们的判据」，
**不是**「我们验证了」（语料与后端不同，不得当本系统的证据）。

### 5. 它的失败史与评测治理 → 新开 **T11**

**v0.30.0**：在同一份 400-bundle dev 上反复调参取得 **13/13**，独立 held-out-r5 **仅 3/13**
（**27 条错误 edge / 3 条反例误 supersede**）⇒ **整批撤回**。
对策：calibration / 冻结 A / 冻结 B **三层数据**、**「不得针对 A 修改后拿 B 当补考」**，
以及一条极强的门：**「任何 sealed/held-out 语料开始提取前，必须先跑零 LLM 的缝合线冒烟；命令失败时不允许烧语料」**。

**本仓现状**：两个审计工具的标定用**同一份夹具 + git 历史**（**自证，无留出集**）；
`retrieval-eval.ts` 也**无** A/B 冻结集。**但照搬两层 400 案属过度设计**（本仓无 CI、无 LLM 写入路径、规模小）。
⇒ **T11 只取两条同形的**：① **held-out 与 dev 分离**（哪怕各 20 例）；② **前置冒烟门**（跑任何评测前先过类型门+构建）。

### 6. 一处**罕见诚实**：它公开了自己低于对照臂的数字

`evaluation/results/README.md` 的 LongMemEval 口径：**HL-Mem 43/50（86.0%）** ·
full-context **46/50（92.0%）** · native RAG **45/50（90.0%）** ——
**它的结构化记忆路径低于两条对照臂，而它把这件事写在索引里**。
⇒ 兼有双重价值：① 是本仓「诚实标注」纪律的**外部正例**；② 是一条**反向警示** —— **结构化 ≠ 更好**。

### 7. 结构对照（比 0073 的「补三列」更根本）

| 项 | hl_mem | 本仓 |
|---|---|---|
| ADR | **4** 篇（**故意跳过 0003** 以免两决策共号） | **76** 篇（连续） |
| 能力矩阵 | **41 行 × 6 列** | README 表 **18 行** |

⇒ **hl_mem = 矩阵密集 / ADR 稀疏**；**本仓 = ADR 密集 / 矩阵稀疏**。
0073 说的「补三列」只是该差异的**表层**。**本 ADR 不主张改形态** —— 本仓 ADR 密集是有意的，且是资产。

### 8. 四条工程纪律（`AGENTS.md`，本仓可对照、非照搬）

| # | hl_mem | 本仓对照 |
|---|---|---|
| ① | **测试运行预算**：「最终候选通常只运行一次核心全套；**只有该次暴露问题并导致代码修改时，才允许第二次**」；fast-forward 合并**复用**验证结果 | 本仓有意未采纳（全量仅数十秒）；但它解释了「为什么别人不这么做」 |
| ② | **单一 CI 权威环境**（Python 3.13 唯一）：**「其他版本可安装不代表获得 CI 兼容性承诺」** | **同构，本仓已有**（「验证基线 DSH 0.1.5-rc.1 …… 更早版本未经验证，不承诺可用」） |
| ③ | **状态机单一收口**：所有状态变更**统一经过** `assert_transition()` | **本仓缺此收口，且正是 T3/D4 的病根**：`lifecycleOf` 读**写侧** `rec.status`/`rec.pinned`，而生产**从不写**它们 |
| ④ | **配置来源单一**：非敏感配置只从 `hl_mem.toml`；**所有 `HL_MEM_*` 环境变量均不参与** `Settings` | 本仓读的是**宿主**的 `DSH_PERMISSION_MODE`（ADR-0074 那条链）—— 宿主约定，非本仓自造 |

**③ 最有价值**：它给 D4 的既有决策补了一个**结构级**选项（不推翻 D4，只登记对照）。

### 9. 本轮落地

1. **D3 补对照指针**（把 `docs/adr/0004` 列为首要对照材料 + 写入「错误方向不对称」判据）——
   **只改依据，不改 D3「待决策」状态**（**不替用户选路**）。
2. **新开 T11**（评测纪律两条同形可取项）。
3. `references.md` §6 增补 **§6.1「第二遍深读」**（可追溯读了什么、没读什么）。

### 10. 验证

- **本轮无代码 / 行为改动**；`npm run build` 未触发（无源码变更）。
- 全套回归仍 **41/41**（未触及代码，预期不变）。
- **诚实标注**：① `docs/superpowers/plans/`（22 篇）与 `specs/`（11 篇）**仍未逐篇读**；
  ② `benchmarks/archive/v030/` 的代码未读；③ 评测分数**未复现**；④ 结论中的 hl_mem 读数**均已标注「别家」**，
  不得当作本系统的证据。

---

## [v1.15.36] 修接线审计工具自身的盲区 —— 并**更正我自己记错的那一条**（ADR-0062 补记）

用户 2026-09-11 指示「fix 审计工具的三条盲区」。本轮**先逐条实测**，结果发现
**原记的三条里有一条位置与方向都记错了**。**本轮是工具 + 标定改动**。

### 0. 一句话结论

**先实测，再动手 —— 于是发现「三条盲区」里只有两条半成立。**
原记的「① 调用点只在**注释**里」是**错的**（注释早就处理了）；
**真盲区是「字符串」**，而且方向是**漏报**（把死代码看成活的），比误报更危险。

### 1. 逐条实测（推翻了原记账）

探针在 `countCallSites` 上跑五种形态：

| 形态 | 旧实现判出的调用点数 | 判定 |
|---|---|---|
| **注释**里 `Foo(` | **0** | 旧实现早已 `stripComments` ⇒ **不是盲区** |
| **块注释**里 `Foo(` | 0 | 已正确 |
| **字符串**里 `Foo(` | **1** | **真盲区**：字符串内嵌的调用形状被当成真调用 ⇒ **漏报** |
| 数组间接调用 | 0 | 确认（②） |
| 平行 API（`assertX` ↔ `x`） | 0 | 确认（③） |

**教训（值得单独记）**：那条「成因」当初是**推理**出来的、**没实测**，写进 `adr/0062` 后就成了「事实」；
而我上一轮还把它**再复制**进了 `BACKLOG.md`。已两处更正 —— 与本仓「先量证再下结论」的纪律相悖。

### 2. 修 ①（真盲区）：新增 `maskStrings`

在 `stripComments` 之上**再抹掉字符串字面量**，仍是**状态机**（不是正则），且**保长度、保换行**（行号不漂移）：

- 行/块注释、`'…'`、`"…"` ⇒ **整段空白化**；
- `` `…` `` 模板串 ⇒ **只抹字面部分，`${…}` 里的代码原样保留并递归** ——
  `` `${f(x)}` `` 里的 `f(x)` 是**真调用**，抹掉它会制造**新的漏报**（测试 ⑨ 有反向不变量锁住）。

`countCallSites` 改用 `maskStrings`。**`stripComments` 保留不动** ——
B 类检测要匹配的**正是字符串里的值**，抹掉它会毁掉 B 类（`audit-drift` 未受影响）。

**量证**：两种掩码在当前真仓库（204 文件 / 516 导出）**逐符号比对**，只有 **3 个符号**计数有差异
（`isProductionPath` 8→6、`markedLines` 8→6、`notRevoked` 3→2），**均只是去掉虚高**、未翻转归桶
⇒ **当前真仓库上零净效果（真但潜伏）**。与 ADR-0071 的「运行时收益为 0」同性质：**修的是「若触发则错」**。

### 3. ②③ 不伪造精度：从「一个 33 条大堆」改为**四桶**

②（间接调用）与 ③（平行 API）**无法靠文本分析解决**（要类型 / 数据流分析）。
⇒ 工具**不去猜「它到底有没有被调用」**，而是如实分类：

| 桶 | 判据 | 实测 | 复核价值 |
|---|---|---|---|
| **A2b 导入即闲置** | 被 import 但**导入行之外零提及** | **1** | **最可疑** |
| **A1 零引用** | 既未被 import、也无配对导出 | **17** | 可疑 |
| **A2a 间接调用/类型位置** | 被 import 且别处有提及 | **3** | **基本是误报** |
| **A3 平行 API** | 与同文件另一导出成对 | **11** | **基本是误报** |

⇒ 需人工逐条查的：**32 → 18**。

**关键判据 `bareMentions` 是量证出来的**（抹掉 import/export-from 行后数裸提及、减去定义处那次）：
它在 A2 候选上**恰好切开**已知答案 —— `ledgerMismatch` 裸提及 **0**（T1 已核实：仅测试用，真可疑），
而 `ChangeSet` 1（类型位置）· `renderExperience` 1（回调）· `sembleCandidates` 1（默认参数值）**全正当**。
⇒ 把「8 条要查」缩到「1 条真的要看」。

### 4. **第 4 类盲区（本轮新发现，未修）**：传递性死代码

`notRevoked` **有** 2 个调用点（`revocation-guard.ts:7,8`），故**不在 A 段**；
但这 2 个调用点**都在 `assertNotRevoked` 内部**，而 `assertNotRevoked` **自己零调用**（A3 桶）
⇒ **它事实上不可达，工具却报「有接线」**。与前三类不同：**数到了调用点，但那调用点在死代码里**。
**修不了的原因是本质的**（需调用图 / 可达性分析）⇒ 已把该形态写进工具输出末尾的「判定纪律」，
并立 `BACKLOG.md` **T10**。真语料里**只找到 1 处**（本仓家族模式是「谓词接线 / `assert*` 仅测试」，
故大多数谓词有独立真调用点）。

### 5. 验证

- `npm run typecheck:tools` **exit 0**；全套回归 **41/41 `ALL PASS`**。
- `audit-wiring.selftest` **11 → 13 组**（新增 ⑨ 字符串掩码 / ⑩ 分桶判定 / ⑪ 真仓库分桶覆盖 / ⑫ 裸提及判据），
  **含反向不变量**：模板串 `${…}` 里的真调用**必须仍被计数**。
- `audit-drift.selftest` 仍 **ALL PASS**（B 类未受影响）。
- **诚实标注**：① 当前真仓库上**零净效果**（真但潜伏）；②③ 是**分类而非修复**（精度未提高，
  只是**可操作性**提高）；④ **未修**。

---

## [v1.15.35] D6 结案：目录级 L0/L1 sidecar —— 吸收 OpenViking 三条（ADR-0075）

用户 2026-09-11 选定 BACKLOG 的 **D6**（吸收 OpenViking 三条做法），并在 sidecar 落盘位置的
两选一里选定 **A**。**本轮是代码 + 测试改动**：新增 `core/abstract.ts`、接线索引重建、
收敛枚举器分类判据、加 6 组回归锁（含正对照）。

### 0. 一句话结论

OpenViking 的三条**都实现了**，且都归在 **Projection** 层（派生可重建，不违反 ADR-0003）。
关键在于把 **②「上层由下层确定性派生」做成 L0 = f(L1)** —— 这让「同一条记忆两层说法不一致」
在**构造上不可能**，而不是靠纪律去避免。

### 1. 落地前先实测枚举器（决定了 sidecar 能放哪）

`persistence/files.ts` 的 `listMemories`（= 语料枚举器）实测行为：
只扫 `.shadow/<YYYY-MM-DD>/` 下的 `*.md`，且**只排除 `_index.md` 这一个名字** ——
其余**任何** `.md` 都会被当成一条记忆（进索引、进召回、进计数）。

⇒ 故**改判据而不是逐名列举**：从 `n === "_index.md"` 改成 **`n.startsWith("_")`**。
原写法是「按名字」排除，每加一个派生件都要记得回来补一句，而**「忘了补」的后果是静默污染语料**
（本项目最常见的一类缺陷）。改成**前缀分类**后「派生物 vs 记忆」有了**唯一判据** ——
与 ADR-0074 的 `scopedFs`、T5 的 `isAdmissibleClaim` **同一手法**（判据收一处）。

### 2. 层次（每层只从它下面那层派生）

```
记忆文件（source）
   │ deriveL1（确定性：条数 / 时刻跨度 / 入口 / 主题清单）
   ▼
目录级 L1（≤4000，写进 .shadow/<date>/_abstract.md）
   │ deriveL0（从 L1 正文抽：剥标题行、折叠空白、截断）
   ▼
目录级 L0（≤256，同一文件）
   │ 引用
   ▼
_index.md 的「目录摘要（L0 · 派生物）」段（最近 3 个目录）
```

**②的要害**：若 L0 也从记忆文件另抽一遍，就会出现「同一条记忆的两层说法不一致」——
两层各自看都「没错」，**没有判据能发现**（ADR-0063/D5 那一族）。
从 L1 抽 ⇒ **L0 是 L1 的函数**，不一致在构造上不可能。测试 ② 直接断言这条。

### 3. 三条硬边界（越界会污染 source）

1. **派生件不是 source**（ADR-0003）：可整份重建，删掉不丢事实。
2. **所有输入显式传入**：`core/abstract.ts` **不读时钟、不读随机数、不读 fs** ⇒
   同输入必得**逐字节相同**输出（测试 ① 锁住）。这也是 ② 可验证的前提。
3. **命名必须 `_` 前缀**（测试 ⑤ 锁住）。

### 4. ③ 覆盖率自报：写下它，**但不信它**

`renderSidecar` 写**显式可解析行** `covered: N` / `pending: M`（不靠模糊匹配）。
`sidecarDrift` 的意义是**独立重算**三条判据：L1 是否等于由当前源重新派生的结果（落后于源头）·
L0 是否等于由 sidecar 自己的 L1 抽取的结果（**被单独改过 ⇒ 层间漂移**）· `covered` 是否等于实际条数。
**正对照**（ADR-0062 §2 纪律）：测试 ③ 构造三种坏件（源头多一条 / L0 被单独改 / 坏文件）
并断言**全部被抓到** —— 否则「0 条漂移」可能只是检测器不工作。

### 5. 默认**开**（与 `projectionStore` 默认关**不同**）

理由：① 它是派生件（可重建、删掉不丢事实）；② 写入次数**有界** ——
每个**日期目录一份**，不是每条记忆一份（O(#dates) 而非 O(N)）；
③ **默认关就等于「写好了但从不执行」** —— 恰是 **T1/T4 刚清理干净**的那一类（`countInconsistency` 的教训）。
`abstracts.enabled: false` 可关；`abstracts.showInIndex`（默认 3）。

### 6. 读路径存在（不做死代码）

写完 sidecar **再**把它最近几个目录的 L0 引到 `_index.md`（**顺序不能反** ——
反过来会让索引指向一份写失败的摘要；写失败的目录**不列入**）。该段是 `read_shadow()` 无参路径的一部分
⇒ sidecar 不是死代码（测试 ⑥ 端到端断言）。

### 7. 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0。
- 全套回归 **41/41 `ALL PASS ✅`**（40 + 新增 `abstract-sidecar`）。
- `audit-drift.selftest` 与 `audit-wiring.selftest` 均 **ALL PASS**。
- **诚实标注（新开 T9）**：
  - **`pending` 恒为 0 是构造性的** —— sidecar 与 `_index.md` 用**同一份 `recs`** 派生 ⇒ **不可能落后**。
    该字段当前**只在棘轮/构造坏件时有意义**，**不是**「会真实报警的增量检测」。
  - 真机**规模与耗时未测**；sidecar 的**召回收益未测**（本轮**未改检索排序**）；
    L0 抽取质量未评；**存量回填未做**（旧目录要等各自索引重建）。

---

## [v1.15.34] D8 结案：README「默认开关」表**补齐三列** —— 并查出一处**不存在的开关**

用户 2026-09-11 选定 BACKLOG 的 **D8**（ADR-0073 对标产出的唯一可借鉴项）。
**本轮改文档（表补三列 + 5 条表注）+ 一处代码缺陷修复**，并**立 T8** 记 7 条静默降级。

### 0. 一句话结论

表补上了，但真正有价值的产出是**核实过程中撞到的硬缺陷**：
**`knowledgeEngine.enabled` 生产零读取** ⇒ 文档里那个「默认 关 / `enabled: true` 启用」
**描述的是一处不存在的开关**。表里另外还揪出 5 处**实现与文档不符**，以及 **7 条静默降级**（ADR-0049）。

### 1. 三列的填法与一条**拒绝**

D8 要求补 **成熟度 / 降级行为 / 晋级标准**。前两列好填，**成熟度这一列本仓填不出来** ——
仓库**从不给自己打 `stable`/`beta`/`experimental`**（全仓 grep：`experimental` 只出现在 hl_mem 对标
与外部 `dsh-experimental-*` 包；`adr/0073:53` 亦自陈「0 个 ADR 带『重新评估条件』小节」）。

**凭空造一套等级就是让文档比事实强** —— 正是 ADR-0072 刚修过的那种谎。故该列填
**可核实的代理信号**（三选一，均带出处）：**有开放未验证项** / **无开放未验证项** / **边界 ADR 未接受**。
它恰好回答了这一列原本要回答的问题：**哪些是「稳定但耗 token」，哪些是「接口还可能变」**。
**「晋级标准」列 16 条里 15 条 = 仓库未定义**（唯一例外是 `projectionStore`，且那是**启用触发条件**
而非 beta→stable）—— 这个「查不到」本身就是要如实写出来的结论。

### 2. 硬缺陷（**本轮唯一代码改动**）：`knowledgeEngine` 的闸门**不存在**

| 证据 | 事实 |
|---|---|
| `core/types.ts:36`（原文） | 注释写「provider 仅占位，**默认 off**」 |
| `core/types.ts:37` | 声明 `knowledgeEngine.enabled?: boolean` |
| **全仓读取点** | **`enabled` 零读取** —— 唯一读 `knowledgeEngine` 的是 `core/writer.ts:79`，读的是 `.llmNavigate` |
| `query/reads.ts:141` | **无条件** `createKnowledgeEngine(...).build(parsedK)` |
| `core/knowledge-structure.ts:106` | `createKnowledgeEngine = (config: any) => ({…})` —— **函数体从不引用 `config`** |
| `README.md`（原文） | 「Knowledge Engine `knowledgeEngine` \| 关 \| `enabled: true` 启用」 |

⇒ **三处（类型注释 / README 表 / 字段声明）都在描述一个不存在的开关**。真实的唯一闸门是
`llmNavigate.enabled`（默认关、**确实被读**、且关时**输出显式标注**「LLM 导航未启用/失败 → 确定性检索」
= 符合 ADR-0049）。

- **修法（选「纠正文档」而非「补写闸门」）**：与 **D4** 同一判据 —— 若去实现 `enabled`，
  会让 `mode:"knowledge"` 默认失效（**破坏现有可用功能**），而该能力**实际工作正常**。
  故：① 校正 `core/types.ts:36` 的注释（写明 `enabled` 不是闸门、唯一闸门是 `llmNavigate`）；
  ② **删掉 `createKnowledgeEngine` 的死形参 `config`** —— 它的危害不是「多一个参数」，
  而是它**构成假象**：让读者以为知识引擎受 config 驱动，从而以为 `enabled` 已接线；
  ③ 更新调用点 `query/reads.ts:141` 并就地注明「此处**没有**闸门」；④ README 行 + 表注④ 校正。

### 3. 另 5 处实现与文档不符（已在表注中标明）

① **`episodes` 关不掉**：`showInIndex: 0` 被 `core/writer-core.ts:69` 的 `|| 8` 吞掉 ⇒
`writer-materialize.ts:161` 的 `episodeShow > 0` **恒真（死分支）**；`gapMinutes: 0` 同样被 `|| 60` 吞
⇒ 两处 `Math.max(0, …)` 永不生效（**用 `||` 取默认把「显式 0」与「未传」混为一谈**）。
② **采集没有总开关**：`writeConsent` 的语义是「改成仅明说才落盘」，**不是**「关掉采集」。
③ **`retention` 的「stale 默认排除」在代码里没有对应实现**：`stale` 在 `enabled` 判断**之外**计算，
关闭也照标，且只喂生命周期标签、**不做排除**（原表把它写在「默认」列 = 串列）。
④ `knowledgeEngine` 见 §2。
⑤ **`kg` 不是 config 键**（只是 per-call 参数），却被排在「默认」列里。
⑥ **表缺行**：`indexEngine` 有真实默认值（`"fs"`）却不在原 16 行内 ⇒ 已补为第 17 行。

### 4. 立 T8：7 条**静默降级**（ADR-0049 的候选缺陷）

判据用 ADR-0049 的枚举（`unavailable` / flush warn / debug trace **三者至少一个**）——
**`console.log` 不算**。逐条读代码查出 7 条：`llmRecall`（**最彻底**：回退无标记且 `label:""`
使 catch 的日志分支也不触发）· `summary` · `recall`（语义 B 档）· **`queryLog`（默认开 ⇒ 优先级最高）** ·
`recall.cooldownTurns` · `projectionStore`（**唯一可能属正当静默**：ADR-0049:38 明列「缓存不是真相」，
结果仍正确、只损失性能）· `episodes`（**其中 `_index.md` 写失败仅 `log` ⇒ `read_shadow()` 可静默读到
陈旧索引，与 ADR-0069 同族** —— ADR-0069 只修了「新鲜度问源」，未给 rebuild 失败加可见信号）。
已全部登记 `BACKLOG.md` **T8**（含完成判据），**未在本轮修**：7 条各需**不同的信号形态**，属独立工作量。

### 5. 验证

- `npx tsc --noEmit` / `npm run typecheck:tools` / `npm run build` 均 **exit 0**。
- 全套回归 **40/40 `ALL PASS ✅`**（含 `knowledge-engine` 相关路径）。
- **诚实标注**：① 「成熟度」列填的是**代理信号**而非等级（见 §1，本仓无等级口径）；
  ② 「晋级标准」列 15/16 = 仓库未定义（**不是**「我没查」，是**仓库确实没有**）；
  ③ 7 条静默降级**只清点未修**；④ 本文的「降级行为」列依据**源码判定语句**，
  非运行时观测（本会话未加载插件）。

---

## [v1.15.33] T1/T4 结案：A 类**逐条**分诊 —— 修 1 处真断线 + 1 处同型漂移 + 删 1 处空壳

用户 2026-09-11 选定 BACKLOG 的 **T1 + T4**（A 类线索逐条分诊、零引用导出定性）。
**本轮是代码 + 测试改动**：接线 1 处、收敛 1 处、删除 1 处、加 4 处代码注释、新增 1 条接线棘轮。

### 0. 一句话结论

**A 段 33 条全部落格**：误报 12 · 零引用 18 符号 · 仅测试消费 4 · **真断线 1**。
真断线是 **`countInconsistency`** —— 一个**有明确用途注释、却从未被调用**的生成期校验。
顺带发现**与 T5 同型**的第二处漂移（`isExchangeable` 重写唯一源）与一处**新风险**（→ T7）。

### 1. 补上「A 类精度低」的**成因**（原 ADR 只说了结论）

工具数不出三类调用 ⇒ 本仓绝大多数 A 类线索都落在里面：

| 盲区 | 本仓实例 |
|---|---|
| 调用点只在**注释**里 | `progressiveDisclosure` / `refineTree`（`core/knowledge-engine.ts:8` 的清单式注释） |
| 经**数组/变量间接调用** | 4 个长程 `assertResultNo*`（`long-horizon/engine/interaction.ts:11-17` 入 `resultGuards`、`:43` 循环调用）；`renderExperience`（`query/query.ts:251` 作回调传入）；`sembleCandidates`（`index-engine.ts:45` 默认参数注入） |
| 「成对导出、只接一半」的**平行 API** | delegation 的 7 个 `assert*` 包装（引擎只用谓词） |

### 2. 真断线（唯一一处，**已修**）：`countInconsistency` 从未被执行

- **事实**：`tools/toolset-authority.lib.ts:66` 定义了它，注释写明
  *「清单自洽性：`counts` 必须与 `rows` 实际相符」*；但 `tools/toolset-authority.ts:24` 的 import
  **不含它**，CLI 只调 `unsubstantiatedMeasured`（`:74`）后直接 `writeFileSync`（`:111`）
  ⇒ **`counts` 与 `rows` 的自洽性在生产里从未校验过**（只有测试在跑）。
- **为什么是「真断线」而非「零引用」**：它有**明确用途注释**，且 `counts` 是**下游要读的汇总**
  （离线棘轮断言 `falseMeasured === 0`）—— **一个从不执行的检查与没有检查等价**（ADR-0062 的原始命题）。
- **修法**：在 `writeFileSync` **之前**调用；不一致则打印 + `process.exit(1)`，**拒绝写入坏清单**。
- **锁**：`test/toolset-authority.test.ts` **⑥ 接线棘轮** —— 断言 CLI **import 了它**、**调用了它**、
  调用在 **`writeFileSync` 之前**、失败路径是 `process.exit(1)`。
  **关键区别：断言的是「CLI 调了它」，不是「函数存在」** —— 后者才是「机制对了、断的是谁调用它」的正解。
  已验证**先红后绿**（临时移除 import ⇒ 红）。

### 3. 与 T5 **同型**的第二处真漂移：`isExchangeable` 重写了唯一源（**已修**）

- **事实**：`federation/types.ts:13` 的 `EXCHANGEABLE_KINDS` 是这份清单的**唯一源**（且**零引用**），
  而 `federation/contract.ts:23` 的 `isExchangeable` **再手写一遍**同一三元素数组。
- **危险点（比 `c.status=supported` 更具体）**：`ExchangeableKind` 是联合类型，
  `EXCHANGEABLE_KINDS: ExchangeableKind[]` **会被类型检查**（漏一个编译不过），
  但 `isExchangeable` 的内联字面量**不受该类型约束** ⇒ 将来加第四种可交换种类时，
  类型系统会**逼你**更新 `EXCHANGEABLE_KINDS`、却**不会**提醒 `isExchangeable` ⇒ **静默漏掉**。
- **修法**：改为 `EXCHANGEABLE_KINDS.includes(kind)`。
- **未加单独棘轮（诚实标注）**：类型系统已承担主体约束，内联重写已消除，再加源码级正则棘轮边际价值低。

### 4. 删除 1 处空壳：`auditDrift`

全仓**零引用**（生产 + 测试 + 夹具**都**没有）。判据**不是**「没人 import」（本仓有意导出测试向 API），
而是它**没有任何信息价值** —— 只是把两个检测器打包成一个对象；CLI（`tools/audit-drift.ts:38-39`）
**直接**调用两个检测器，本就不经过它。删掉不减少任何能力，留着却让人以为存在一条统一入口。

### 5. 其余各项：**保留并注明**（4 处代码注释）

`renderIntent` / `renderIdentityModel`（完整形态渲染器，实际读侧走内联或 `renderIdentity`）·
`progressiveDisclosure` / `refineTree` / `renderRetrieved`（`adr/0048 ①/②` 的目标能力，**是否启用属产品决策**）·
7 个 delegation `assert*`（「谓词接线、`assert*` 不接线」是**一处决定**，按**家族**加注）·
`writeMeta`（已声明的逃生舱）· `isMetadataMemoryText`（ADR-0066 已决定保留）。
**`hasNoUpgradeApi` 保留、暂不处置**：它是 `agency/guards.ts` 唯一未被 `agency/engine.ts:4` import 的导出
（同文件另 15 个都被用）；「遗漏接线」还是「有意保留」**本轮未判定**，且删它要动 invariant 面。

### 6. 本轮**新发现**（未修，升 T7）：`relationForProposal` **忽略入参**

`temporal/edge.ts:30` 签名为 `(_n: any)` ⇒ 恒返回 `"evolved_into"`。当前**零引用所以无害**；
但**一旦按名字接线**，调用方传什么都**静默丢弃**。**与 §3 那族的区别很重要**：
§3 的危险是「**口径分叉**」（可加「唯一源」棘轮），这一处的危险是「**掉参数**」
（只能靠行为断言或删掉形参）。已在代码加注 ⇒ `BACKLOG.md` **T7**。

### 7. 两处对 BACKLOG 原文的**更正**

1. **`progressiveDisclosure` / `refineTree` 不是「误报」**：原文写「误报，但值得记」措辞含糊。
   准确表述是**仅测试消费**（`test/knowledge-engine.test.ts:53,59`），生产命中只有**注释**。
2. **`renderIntent` 不是「生产有调用点」**：它是**零引用**；`observer/core.ts:20` 用的是 `intentOf`。

**`ChangeSet` 与 D1 的关系（防误读）**：本轮判 `ChangeSet` 为「接口**可达**」
（`projection-store.ts:85` 的 store 工厂在生产被调用），而 **D1 说「未接线」仍然成立**
（无生产**实例化点**）。两条不矛盾 ⇒ **D1 维持原判**。

### 8. 验证

- `npx tsc --noEmit` / `npm run typecheck:tools` / `npm run build` 均 **exit 0**。
- 全套回归 **40/40 `ALL PASS ✅`**；`audit-drift.selftest` 与 `audit-wiring.selftest` 均 **ALL PASS**。
- A 段：**33 条 → 31 条**。
- **未验证（诚实标注）**：A 类是**线索级**，本轮结论基于**人工 grep/read**（每条带 `文件:行号`），
  非工具自动判定；工具的**三条盲区未修** ⇒ A 段仍会误报。
  两个**产品问题**仍待拍板（`progressiveDisclosure`/`refineTree` 启用与否；
  `renderIntent`/`renderIdentityModel` 是否并入读路径）。

---

## [v1.15.32] T5 结案：漂移审计检测 B 各键逐个复核 —— 并**先修了工具自己的漏报**（ADR-0070 补记）

用户 2026-09-11 选定 BACKLOG 的 **T5**（漂移审计检测 B 余下各键复核 + 台账两级边界棘轮）。
**本轮是代码 + 工具 + 测试改动**：修检测 B 一处漏报、收敛一处真漂移、加两条棘轮。

### 0. 一句话结论

**先修工具，再复核。** 检测 B 的正则字符集**不含 `?`** ⇒ `c?.status === "supported"` 与
`c.status === "supported"` **归不到同一个键**，于是**判据源自己**从 B 段**消失** ——
而它恰恰是那处真漂移的关键证据。修好后立刻多出一个**从未被复核过的键**（`r.status=validated`）。

### 1. 修工具：`?.` 导致同一判据被拆成两个键 ⇒ 静默漏报

- **形态**：`\b([\w$.]+)\s*===` 的字符集不含 `?` ⇒ `c?.status === "x"` 只从 `status` 起匹配。
- **实测后果**：`world/guard/claim-admission.ts:6` 的 `isAdmissibleClaim`（**唯一判据源**）
  被算成「另一个键、只出现在一个文件」⇒ **静默漏报**。修复前 B 段看不到它。
- **修法**：允许 `?.`，并把键里的 `?` **归一掉**（`a?.b` 与 `a.b` 是同一条访问路径）。
  **键形态随之改为「接收者.字段=值」**（原为「字段=值」）—— 这是**更精确**的形态。
- **回归锁**：`tools/audit-drift.selftest.ts` **⑤b**（夹具一侧 `x?.flag`、另一侧 `x.flag`，
  断言归到同一个键 `x.flag=join` 且两侧各报一条）。

### 2. 逐键复核结案（**11 键 → 10 键**）

| 键 | 判定 | 依据（要点） |
|---|---|---|
| `c.status=supported` | **真漂移（已修 + 已加锁）** | 见 §3；键**已消失** |
| `res.status=not_found` | 第 7 处真缺陷 | **v1.15.27 已修** |
| `c.kind=provider` / `reference` | **正当分层** | `toolset.ts` 声明 ↔ `toolset-exec.ts` 消费 |
| `r.status=unavailable` | **正当分层** | `index-engine.ts:54,66` 产出 ↔ `query.ts:222` 消费并渲染缺件提示；且该值是**宿主声明的类型**（`core/types.ts:59`） |
| `err.code=ENOENT` | **正当分层（口径一致）** | 同一外部契约（Node `execFile` 的 `err.code`）在各自 CLI 上一致映射到 `unavailable` + provider 专属 reason |
| `e.kind=user` | **正当分层** | `memory.ts` 写侧（线索头/统计）↔ `writer-materialize.ts:203` 读侧（`writeConsent` 门） |
| `kind=error` | **误报（同形不同义）** | `writer-llm.ts:31` 是**宿主流事件**字段；`index.ts:61-68` 是本插件局部形参 |
| `type=principle` / `anti_pattern` | **正当分层（类型已锁）** | `reflection/engine.ts:32` 产出 ↔ `identity/types.ts:47` 映射，**共用同一类型声明** |
| `v=string` | **误报（短局部别名）** | 两处 `v` 都是回调形参名 |

**结案**：**1 处真漂移（已修）+ 0 处待复核**；其余均落「正当分层」或「同形不同义」。
B 段小计 **11 键/28 处 → 10 键/25 处**。

### 3. 真漂移：`c.status=supported` —— 判据源已存在，两处却各自重写

三处表达同一条「Representation 只接受 supported」判据：

| 位置 | 形态 | 角色 |
|---|---|---|
| `world/guard/claim-admission.ts:6` | `isAdmissibleClaim = (c) => c?.status === "supported"` | **唯一判据源** |
| `world/builder/representation-builder.ts:9` | 手写 `filter((c) => c.status === "supported")` | 重写（**同文件已 import 该模块**） |
| `query/world.ts:42` | 手写 `find((c) => c.status === "supported" && …)` | 重写 |

性质同 **ADR-0063 / D5**（同一条规则多份实现）。**不删任何一处**，只把两处重写**收敛**到唯一判据源。
新锁 `test/claim-admission-single-source.test.ts`：① 判据语义（含 `null`/`undefined` 边界）
② **源码级棘轮**「全仓生产源码里该比较只允许判据源那一处」③ 行为反向不变量
（`candidate`/`unstable`/`rejected` 一条不得进 Representation；同 `subject` 去重）④ **正对照**。

### 4. 自曝：新测试第一版**假红**，根因是我自己犯了本 ADR 记录的病

第一版自己写了 `line.replace(/\/\/.*$/, "")` 剥注释 —— 而本仓 `.ts` 是 **CRLF**，
JS 的 `.` **不匹配 `\r`** ⇒ `.*` 在 `\r` 前停住、`$` 匹配不上 ⇒ **替换静默失败**，
注释里的代码被当成真判据 ⇒ 测试假红（一度让我以为源码残留分叉）。
更根本的问题：那样做等于把「注释剥离」这条判据**又写了一份**。已改为**复用工具自己的 `stripComments`**
（字符状态机，正确处理 CRLF/字符串/正则字面量，且保证行号不漂移，selftest ① 有断言）。

### 5. 附带：台账「两级边界」不变量从**实测**升级为**棘轮**（T5 附带项）

`core/toolset.ts:3-6, 44-46` 规定：`reference`（插件**不接线**）的 `degradesTo` 必须表明
「不影响插件行为」；`provider`（插件**内接线**）必须给**确定性退路** + `provides` + `install`。
v1.15.29 只做过一次实测（107 项全满足）、**无断言**。已加为 `test/toolset-catalog.test.ts` 的 **⑧**。

### 6. 验证

- `npx tsc --noEmit` exit 0；`npm run typecheck:tools` exit 0；`npm run build` exit 0。
- 全套回归 **40/40 `ALL PASS ✅`**（39 + 新增 `claim-admission-single-source`）。
- `node tools/audit-drift.selftest.ts` **ALL PASS**（7 组，含新增 ⑤b）。
- `node tools/audit-wiring.selftest.ts` **ALL PASS**。
- **未验证（诚实标注）**：② 的棘轮是**源码级正则**而非类型级 —— 换写法（`"supported" === c.status`、
  经变量间接比较）会漏；工具仍未接入自动门禁（`BACKLOG.md` **V6** 未变）。

---

## [v1.15.31] 写入省略 `sandboxPolicy` ⇒ **记忆一条都落不了盘**（ADR-0074）

用户 2026-09-11 指令「fix 这个」—— 承接上一轮接口核验时**顺手发现**的落盘失败横幅。
**本轮是代码修复**：新增 `core/fs-scope.ts` + 三处接入 + 一个新回归测试。

### 0. 一句话结论

**不是目录不存在、也不是「解析不出 session cwd」，而是插件的写入漏传了 `sandboxPolicy`。**
省略该参数拿到的是**部署 fallback**（`mode = DSH_PERMISSION_MODE ?? workspace-write`、
`workspaceRoot = **process.cwd()**` —— dsh 服务进程的启动目录），而写入目标是**会话工作区**
`session.header.cwd`。两者不同时被 `dsh-fs-sandbox` 围栏拒绝。
**反直觉点**：本部署会话策略**本来就是 `danger-full-access`**（带 session 会在 `checkedTarget` L156 直接放行）
—— 是「漏传参」把一次本可放行的写入降级成了越界写。

### 1. 现象（两次、跨版本 ⇒ 与升级无关）

`read_shadow` 顶部长期挂：

```
⚠ shadow 最近一次落盘失败（2026-09-11T11:35:11.891Z：cannot write
"G:\project\dsh1\.shadow\2026-09-11\2026-09-11--193511-shadow.md": file access denied under workspace-write mode）
```

时间戳 **两次**：`11:28:02Z`（`v1.15.12`，升级前）/ `11:35:11Z`（`v1.15.30`，升级后）
⇒ 一直坏着；**读路径完好、写路径全挂**。

### 2. 根因链（全部读宿主编译产物核实，非猜测）

| 层 | 位置 | 事实 |
|---|---|---|
| 围栏 | `dsh-fs-sandbox/lib/index.js:154` | `policy = sandboxPolicy ?? ctx.sandboxPolicy.resolve()` ← **无 session** |
| 判定 | 同文件 `:156/160/164` | `danger-full-access` 直接放行；否则 `writableRoots(policy)` 判包含；失败抛 `FS_SANDBOX_DENIED` |
| 策略 | `dsh-sandbox-policy/lib/index.js:141-148` | 无 session ⇒ `mode = defaultMode`、`workspaceRoot = resolve(process.cwd())` |
| 配置 | `dsh-base/cordis.patch.yml:207-212` | `mode: DSH_PERMISSION_MODE ?? 'workspace-write'`；`workspaceRoot: process.cwd()` |

**排除的两个替代解释**：① 目录不存在（`dsh-fs-local:497` 写前 `mkdir recursive`；且报错出自 `!contained` 分支
而非 `ENOENT`）；② 落到兜底根（报错路径 `G:\project\dsh1\.shadow\…` **就是会话 cwd**，
`resolveShadowScope` 走的是 `implicit` 分支）。

### 3. 两处**旧记账被真机推翻**（就地勘误，原文保留）

- **v1.15.12 §A3**（本文件内已加勘误块）：曾判「只传 2 参 = **非缺陷**」，理由是「省略 = 用**当前会话策略**」。
  **契约原文不是这么说的** —— Inspect 复核 `writeText` JSDoc：*"Omit to leave the backend its own default."*
  「backend's own default」= 部署 fallback，**与调用方的会话无关**。⇒ 该判定把「后端默认」误读成「我的会话」。
- **v1.15.x「记账未修」①**：把触发条件写成「解析不出 session cwd、落到兜底根 `~/.dsh-observer/shadow`」。
  **说窄了** —— 真实触发条件是「**会话工作区 ≠ 服务进程启动目录**」，与能否解析 cwd 无关
  （本次实测正是 cwd 解析**成功**时失败）。

### 4. 修复（ADR-0074）：在**取得 fs 的三处**包一层会话作用域门面

新增 `core/fs-scope.ts`：

```ts
sessionPolicy(context, session)  // = context.get("sandboxPolicy")?.resolve({ session })
policyForAgent(context, agent)   // = sessionPolicy(context, agent?.session)
scopedFs(rawFs, policy)          // 只把 writeText 的第 5 参补齐；无策略 ⇒ 原样返回 rawFs
```

三处接入（已用 `get("fs")` 全仓 grep 核实这是插件取得 fs 的**仅有三处**）：

| # | 位置 | 会话来源 |
|---|---|---|
| ① | `core/writer-materialize.ts` `flush(agent)` | 事件载荷的 `agent.session` |
| ② | 同文件 `ensureIndex(ws, session?)` | 新增可选参，由读侧入口透传（`query/query.ts:140`） |
| ③ | `index.ts`：`queryDeps` 由 `const` 改为 `makeQueryDeps(exec)` | 本次 `exec.agent.session` |

**为什么不逐点改**：全部写入经由**同一个 fs 对象**向下传递 ⇒ 在取得处包一次 ≡ 全写入点都补齐，
且**不动任何 `persistence/*` 签名**（那才是 40 处改动 + 40 处回归面）。

**四条不变量（都锁进测试）**：
1. **不越权** —— 只补调用方**没给**的；显式传入原样转发。策略取 `resolve({session})`，即**该会话自己的 mode**；
   门面**从不构造 `danger-full-access`**，也**从不覆盖 `read-only`**（测试 ③ 是正对照：只读会话写入**仍被拒**）。
2. **旧宿主零变化** —— 无 `sandboxPolicy` 服务时门面**恒等返回原 fs**。且这**不算降级**：
   `dsh-fs-sandbox` 自己 `inject: ["sandboxPolicy"]`，该服务缺失时**围栏根本不挂载**
   ⇒ 故不写进 `SOFT_IMPACT`（不报假 gap）。
3. **保留「没有 stat」** —— `persistence/meta.ts:50` 用 `typeof fs.stat === "function"` 判分派；
   门面**只转发真实存在的方法**，否则探测恒真、既有的「诚实降级」分支失效（测试 ⑥c）。
4. **读侧一并修** —— 读路径也会写（`_index.md` / query-log / identity timeline / validation history），
   不接 ③ 等于只修一半。`makeQueryDeps` **刻意不展开 `queryDeps`**（展开会急切求值 `fs`/`approval`
   两个 getter，把 `apply()` 时未就绪的服务固化进去）。

### 5. 先复现再修（本仓纪律）

新增 `test/fs-sandbox-scope.test.ts`：mock fs **忠实复刻 `checkedTarget` 的围栏判定**
（`mkFencedFs`：部署 fallback root `C:/svc` **故意** ≠ 会话工作区 `D:/proj`）。
**修复前先跑**（暂存新 `dist`、用旧 `dist`）：

```
[dsh-shadow][error] flush FAILED: cannot write "D:/proj/.shadow/2026-09-11/2026-09-11--195034-shadow.md":
  file access denied under workspace-write mode
AssertionError: 会话工作区 ≠ 服务启动目录时，记忆仍必须落盘；实际写入 []
```

**报错文案与真机横幅逐字同型** ⇒ mock 复刻忠实（不是「测 mock 不是系统」）。
修复后 **6/6**：① 落盘成功 ② 携带的是**该会话自己的**策略（root = 会话 cwd + `sessionId`）
③ read-only 正对照 ④ danger-full-access ⑤ 读路径 `_index.md` 落盘 ⑥ 门面契约（恒等降级 / 补齐省略 /
不覆盖显式 / 保留 `stat` 缺失）。

### 6. 验证

- `npx tsc --noEmit` **exit 0**；`npm run build` **exit 0**（`dist/` 已同步提交）。
- 全套回归 **39/39 `ALL PASS ✅`**（38 原有 + 新增 `fs-sandbox-scope`）；`dist` 与源码同步。
- **未验证（诚实标注）**：① 真机（插件 `dist/` 不热加载，ADR-0057 ⇒ 需**再重启一次**，记 **B3**）；
  ② 兜底根 `~/.dsh-observer/shadow` 场景**本修复未覆盖**（无 session 就没有「会话策略」可问，记 **T6**）；
  ③ `editText` 只做门面转发断言，插件今天不调用它。

---

## [v1.15.30] 重点材料 hl_mem 对标（ADR-0073）—— 一条可借鉴项（D8）+ 逐条不吸收

用户 2026-09-11 两条指令：① 「添加参考资料 `github.com/lohr13/hl_mem`」；② 「**把这个作为重点材料**」；
经确认落地为「立 ADR + 记 BACKLOG + 补 CHANGELOG」。**纯文档：无代码 / 配置 / 行为改动。**

### 0. 一句话结论

**「重点材料」不等于「已吸收」。** 本版把 `lohr13/hl_mem`（HL-Mem）标定为**重点对标对象**，产出一份**对标结论**：
**一条可借鉴项**（→ D8）、**一条硬冲突**（LLM 提取 vs 纯函数派生）、**六条明确不吸收 + 逐条理由**、
**一处许可边界澄清**（Apache-2.0 ≠ OpenViking 的 AGPLv3，但**许可允许 ≠ 该引**）。

### 1. 事实读数（一手 raw 文件，抓取 2026-09-11）

| 项 | 读数 |
|---|---|
| 是什么 | `Evidence-aware local memory service`，面向 agent 的**证据驱动长期记忆系统**：Event →（LLM）Claim → SQLite → FTS+Dense 混合召回 → REST / MCP / Hermes |
| 许可 | **Apache-2.0**（GitHub API + `pyproject.toml`；**其 `LICENSE` 原文未逐字读取**） |
| 语言 / 运行 | Python **3.12+**（CI 只在 3.13） |
| 版本 / 活跃 | 最新 release **v1.1.7**（2026-09-08）；创建 2026-07-19；最近推送 2026-09-08 |
| 规模 / 维护 | **7** ⭐ / 0 fork；`main` **983** 提交；contributors API 仅 1 人（`lohr13`） |
| 接口 | CLI / FastAPI REST / **MCP stdio**（7 工具）/ Hermes Provider |
| 存储 | SQLite WAL + FTS5 + 向量 BLOB（`sqlite_scan` 默认，可换 `sqlite_vec`） |

**规模判断带上**：7 ⭐ / 单人维护 ⇒ 价值在**工程纪律的密度**，不在生态位；本版措辞按此收紧。

### 2. 一处自我纠正（先记，因为它决定了 D8 的写法）

本版动笔前核实到自己**上一版文档改动里的过度表述**：我原写「本仓最值得对照的是它的 `capability-matrix.md`」
—— 核实后是**本仓 README 已有「默认开关」表**（`README.md:113-130`，**16 条能力 × 3 列**），
**缺的是三列**（成熟度 / 降级行为 / 晋级标准），**不是「没有能力矩阵」**。
⇒ **D8 的准确表述是「补三列」，不是「新建表」**；此精度已写进 ADR-0073 §2 末注与 D8 的「注意」条。

### 3. 唯一落地的借鉴项 → D8

**README「默认开关」表补齐「成熟度 / 降级行为 / 晋级标准」三列。**
理由**不是「它这么做」**，而是本仓已有缺口：**ADR-0049「缺件不静默」要求降级必须可见**，
但该口径目前**散在代码注释与 ADR 正文里**（`core/toolset.ts` 的 `degradesTo`、`routeVerify` 的
`unavailable`、`recall` 的关键词兜底、`evidenceProvider` 的 `fs` 回退…），**没有一处能一眼看全**
「每个能力关掉 / 缺件时，行为退到哪」。**本轮只登记，不实现。**

### 4. 六条明确不吸收（逐条理由）

| 不吸收项 | 理由 |
|---|---|
| **「LLM 负责提取」的写入路径** | **硬冲突**：本仓铁律是**纯函数派生、不猜字段、LLM 不能制造关系**（ADR-0042 / 0043 / 0051）⇒ 与本仓写入路径**不可拼接** |
| **常驻服务**（FastAPI + worker + 服务化 SQLite） | **ADR-0001 判据复用**：否决 OpenViking 的理由是「要额外跑一个重服务，对低成本诉求过重」，它是**同一判据下的第二个样本** |
| **向量库 / 混合检索**（FTS+Dense+RRF+Reranker） | 本仓已按 **ADR-0060** 定形为「单索引 + 层级 + 路由」，其实测结论是「**加判别层优先于加库**」 |
| **物理删除闭包 + tombstone + fail-closed** | 本仓**有意相反**：`Forget ≠ Delete`（**ADR-0031**，`core/forget.ts` 头注释明写）。其 `tombstone` 在本仓 **0 命中**——**不是缺口，是设计取向** |
| **双时间模型**（valid time / recorded time 字段体系） | 本仓近邻是 `asOf`（`core/util.ts:51` 的 `parseAsOf`，语义是「按时间点召回当时可见的记忆集」），而 `validTime` / `recordedTime` / `valid_from` / `recorded_at` 在本仓 **0 命中** ⇒ 引入属**新增字段体系 = 能力扩张**，须**另立 ADR** |
| **它自报的评测分数** | 与 ADR-0060 同纪律：**别家的语料与后端不能当本系统的证据**；**未复现**，不得引用为「已验证」 |

### 5. 许可边界：许可允许 ≠ 该引

- **HL-Mem = Apache-2.0**；本仓 = MIT；**OpenViking 主工程 = AGPLv3**。
- 差别是实质的：OpenViking 那条是「**不可抄代码**」的硬约束（ADR-0065 据此只写形状对照）；**HL-Mem 许可上允许复用**。
- **但结论相同**：本仓**仍不引其代码或依赖** —— 理由是**架构判据**（ADR-0001 否决常驻服务；ADR-0043 / 0060 否决向量库），
  **不是许可**。**把「许可允许」误读成「该引」是本次最需要防的滑坡**：许可放宽的是**复制权**，不是**架构适配性**。

### 文档改动（本次全部改动）

| 文件 | 改动 |
|---|---|
| `adr/0073-hl-mem-benchmark.md` | **新增**。沿用 `adr/0065` 体例（Context / Decision / 不吸收项 + 理由 / Alternatives / Consequences / 自检）；标题用「**对标结果**」而非「吸收」 |
| `BACKLOG.md` | **新增 D8**（四项格式齐备）+ 计数行更新（21 → **22 条**） |
| `references.md` | 顶部「★ 重点材料」节：去掉「未立 ADR / 不立待办」，改为指向 ADR-0073 与 D8；补「许可边界」与「与 `adr/0065` 的区别（两个动词不可混用）」；§6 标题加 ADR 指针 |
| `CONTEXT.md` | 该条术语从「文档条目，未立 ADR、未吸收」改为 **ADR-0073**，并补硬冲突 / 唯一可借鉴项 / 不吸收清单 / 许可要点 |
| `MEMORY.md` | 同上改口径，补两条纪律（**重点材料 ≠ 已吸收**；**许可允许 ≠ 该引**） |
| `CHANGELOG.md` / `package.json` | 本条目 + 版本号 `1.15.29` → `1.15.30` |

### 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0。
- `node test/recall-attribution.test.ts` → **`ALL PASS ✅`**（最高场景 240）。
- **交叉引用一致性**：`adr/0073` ↔ `references.md`（顶部节 + §6）↔ `CONTEXT.md` ↔ `MEMORY.md` ↔ `BACKLOG.md` D8
  **五处互指且路径可解析**；`README.md:113-130` 的行号与列数**实读核对**（16 条 × 3 列）。
- 事实核对的**零命中检索**：`validTime` / `recordedTime` / `valid_from` / `recorded_at` 与 `tombstone` 在本仓源码 **0 命中**。

### 未验证（诚实标注）

- **HL-Mem 未克隆、未运行、未试装**；其评测分数（LongMemEval / MemDaily / PerLTQA）**未复现**；
  其 MCP 与本机 DSH `0.1.5-rc.2` 的兼容性、`sqlite-vec` 路径**均未实测**。
- `docs/capability-matrix.md` 只读了前段（约 7 KB），**其余特性行未逐条读完**。
- ADR-0073 §2 的「本仓现状」一列是**源码实读**，**未在运行进程验证**行为差异。


## [v1.15.29] 台账「实测」标签比事实强 —— 改正默认值 + 权威对照签入成离线棘轮（ADR-0072）

线索来自 `tools/audit-drift.ts` 的检测 B（`c.kind=provider`/`c.kind=reference`）。**先判它是不是漂移**：
`toolset.ts` **声明** `kind`（`Capability.kind: ToolKind`，类型必填），`toolset-exec.ts` **消费**它
⇒ **正当的分层**。顺带实测了它文档化的边界不变量（`core/toolset.ts:3`「两级台账必须分清」+
`degradesTo` 规定 reference 填「不影响插件行为」）：**107 项全部满足**。
但顺着「台账诚实性」查下一层，**命中真问题**。新增 ADR-0072。

### 一、标签与事实不符（实测证据）

`core/toolset.ts` 对 `verSrc` 的定义：`"实测"` = 在**本机**跑 probe（`--version`）拿到的；
`"权威核验"` = 取自 `winget show`（**最新发布版**，不代表本机已装）。
而 v1.15.10 加入的 **44 条全部标着 `"实测"`**（该参数原默认值）：

| 证据 | 读数 |
|---|---|
| 44 条中与 winget 权威版本**逐字一致** | **35 条** |
| `fzf` 台账「实测 **0.74.3**」 | 本机 `fzf --version` = **0.73.1**，且来自 **scoop**（`C:\Users\l\scoop\shims\fzf.exe`），**winget 里没装 fzf** |
| `zoxide` 台账「实测 **0.10.0**」 | `winget list` = **已装 0.9.9 / 可用 0.10.0** ⇒ 台账抄的是**「可用」列** |
| 本机可检出的 8 条里台账版本**比本机新**的 | **7 条**（`gh` 2.100.0→2.93.0、`uv` 0.12.12→0.11.17、`mise` 2026.8.5→2026.5.4、`just` 1.58.0→1.56.0、`7zip` 26.03→26.01 …），**方向一致** |
| 唯一相符 | `ffmpeg` 9.0.1 |

⇒ **「实测」这个标签比事实强** —— 正是 v1.15.14 造 `verSrc` 要防的那种谎。

### 二、版本误标**不可能被发现**：核验器从不用版本判定

`tools/winget-verify.ts` 的 `verifyLedger` 传 `expectedVersion: null`（注释：「版本不参与失败判定，只报告」）
⇒ 同文件 `:81` 的 `verDrift` 分支**从未生效**。实跑 `npm run verify:toolset` 得
**「核验 101 项：✅ 一致 101 · ⚠ 版本漂移 0」** —— 那个 `0` 是**因为版本没参与判定**。
（把台账版本当真期望值核验：**13 条老化**。）**同一族缺陷的第八个实例**：机制存在、没接到调用点。

### 三、修复

1. **改正默认值**：`verSrc` 默认 `"实测"` → `"权威核验"`（那 44 条确实不是实测）。
   参数文档里写进本次实测证据，避免以后有人「顺手改回」。
2. **新增 `tools/toolset-authority.ts`**：逐条真调 `winget show`，**把台账版本当真期望值**
   （补上 §二 的缺口）；同时**探测本机**并记 `machineVersion`（「实测」标签是否成立的唯一判据）；
   产出 **`tools/toolset-authority.json`（随包签入）**。
   命令：`npm run verify:authority` / `verify:authority:check`。
3. **新增离线棘轮 `test/toolset-authority.test.ts`（5 组）**：

| # | 断言 |
|---|---|
| ① | 清单 `counts` 与 `rows` 相符 |
| ② | 台账的（出处 + 版本）与清单**逐条一致** ⇒ 改了台账必须重跑生成器 |
| ③ | **没有任何「实测」条目缺本机读数佐证**（核心不变量） |
| ④ | **正对照**：4 条合成记录 ⇒ 恰好报 2 条（证明检测器真会报警） |
| ⑤ | 有 winget 包的条目**全部**能解析出（出处 + 版本） |

> **诚实说明**：③ 当前**平凡成立**（台账 0 条标「实测」，是**因为改了默认值**）。
> **④ 正对照就是为这一点存在的** —— 没有它，③ 的绿说明不了任何事。这是 ADR-0062 §2「先证工具」的又一次应用。

### 四、测试还纠正了我自己的一处判据范围错（自曝）

首跑 ② 报 **6 条假不一致**（`zg`/`semble`/`tmux`/`viddy`/`tig`/`ip`「清单无此条」）——
原因：清单按「**有 winget 包**」的范围生成（101/107），我却拿**全部 107 条**去比。
修正为**只比对 `winget` 非空的条目**，并把范围写进函数注释。

### 五、验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | 标签×权威交叉表 | `_research/version-drift-audit.ts`（101 条真调 winget） | ✅ 「实测」44 条中 **35 条与权威逐字一致** |
| 2 | 本机实测交叉验证 | 逐条 `probeCapability` | ✅ 8 条检出 / **7 条台账比本机新**；`fzf` 0.74.3 vs **0.73.1** |
| 3 | 替代假设排除 | `Get-Command fzf -All` + `winget list` | ✅ fzf 来自 **scoop**、winget 未装；zoxide `winget list` 显示**已装 0.9.9 / 可用 0.10.0** |
| 4 | 「版本不参与判定」实证 | `npm run verify:toolset` | ✅ 报「版本漂移 0」（该分支未生效） |
| 5 | 台账版本当期望值核验 | `npm run verify:authority` | ✅ 101 条：一致 88 · **老化 13** · **falseMeasured 0** |
| 6 | 离线棘轮 | `node test/toolset-authority.test.ts` | ✅ **5/5**（含 ④ 正对照） |
| 7 | 边界不变量实测 | `_research/toolset-boundary-invariants.ts` | ✅ 107 项全满足（reference 105 均含口径 / provider 2 均给退路+provides+install） |
| 8 | 生产/工具类型检查 | `tsc --noEmit` / `build` / `typecheck:tools` | ✅ 全 exit 0 |
| 9 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **38/38**（37 + 新增 1） |
| 10 | 两个审计工具标定 | `audit-wiring` / `audit-drift` selftest | ✅ 均 ALL PASS |
| 11 | 三方版本一致 | `package.json` / `README` / `CHANGELOG` | ✅ 均 `1.15.29` |

**未验证（诚实标注）**：① **清单里的 `machineVersion` 是生成时那台机器的读数**（证据留档），
测试**不重探测** ⇒ 不会自动发现「换了机器」——这是**有意的**（避免机器相关断言恒红，
`toolset-catalog` ④ 曾踩过）；② **「老化」不判错**（13 条，目录在推进的正常现象）；
③ **`"实测"` 标签本轮 0 条被真正使用**（本机可检出的条目台账版本都与本机不符），
标签保留待将来做逐条本机实测；④ 清单**未接入任何自动门禁**（本仓无 CI，与 ADR-0062 的 V6 同一缺口）；
⑤ 本次改动主要影响**构建期工具与台账数据**（运行期只影响 `note` 的标签文字），且**尚未在运行进程生效**
（插件 `dist/` 不热加载，ADR-0057）；⑥ T5 的 11 个 B 键本 ADR 只复核掉 1 个，**余 10 个未复核**。

## [v1.15.28] 图快照读取取到最旧的 —— 并收敛两份近重复逻辑（ADR-0071）

**本轮是上一版漂移审计工具（ADR-0070）的检测 B 第二次产出真发现**，且**用同一工具完成了闭环验证**。
新增 ADR-0071。

### 一、线索来源与三层事实

检测 B 报出 `name=graph.json` 出现在两个生产模块（`temporal/persistence.ts` +
`world/persistence/persist.ts`）。顺着查下去：

1. **两个 reader 逐字近重复** —— 除根目录与返回类型外逻辑完全相同（连 try/catch 位置都一样）。
2. **两者都 write-only**（T4 已记）：生产者 `writeTemporalGraph` ← `observer-kernel.ts:46`、
   `writeGraph` ← `world.ts:40`；而两个 reader **生产与测试引用皆为零**。
3. **真实读路径是「重建」不是「回读」**：`mode:"temporal"` 走 `buildTemporalGraph`（读 traces 重建）
   **之后**才落一份快照 —— 与 ADR-0017 checklist ①（graph.json 是**可重建**索引）与
   ⑥（该 mode 由 `buildTemporalGraph` 提供）一致。

### 二、新发现的**顺序 bug**

两个 reader 都是「遍历 `listDir` 的日期目录，**碰到第一个**含 `graph.json` 的就 return」。而：

- `listDir` 契约原文：*"List direct children of a directory in **stable name order**."*
- 真机实现（已读 `dsh-fs-local` 的 `listDirectory`）：`entries.sort((l, r) => l.name.localeCompare(r.name))` ⇒ **升序**
- 日期目录名 `YYYY-MM-DD` ⇒ **字典序 = 时间序**

⇒ **「取第一个」= 取最旧的那份快照。** 而 `graph.json` 是**可重建的派生快照**（ADR-0003/0017/0024）
—— 回读一份**更旧**的派生件，正是 ADR-0069 刚修过的「投影与源头脱钩」那一族。

### 三、修复：顺序纪律**单一来源** + 消除近重复

新增 `persistence/snapshots.ts` 的 `readLatestSnapshot(fs, ws, dirRel, fileName)`：

```ts
const dates = entries.filter(isDateDir).map(name).sort((a, b) => b.localeCompare(a)); // **降序**
for (const name of dates) { ... 找到第一个含快照的 ... return ... }
```

两个 reader 收敛为**参数化调用**（各一行）。
**为什么不「两处各修一遍」**：本仓这几轮的教训正是「同一逻辑在多处表达，其中一处会漂移」
（ADR-0063 三份判据、ADR-0070 的双条件漏在第三个消费者）——收敛是**结构性回应**，不是顺手重构。

### 四、先复现，再修

`test/graph-snapshot-order.test.ts`（6 组），**修复前先跑**：

```
AssertionError: 应返回**最新**（2026-09-09 / day09）；
  实际返回了 day07 —— 升序列表取第一个 = 最旧
```

修复后 6/6：① temporal 取最新 ② world 取最新 ③ **乱序插入**仍取最新（只看名字序）
④ 中间某天缺图仍取到最新那个有图的 ⑤ **反向不变量**：无快照 → `null`（不抛、不编造）
⑥ 往返可读回。

### 五、**闭环验证**：工具报的漂移在修完后真的消失

重跑 `npm run audit:drift`：

| 读数 | 修复前 | 修复后 |
|---|---|---|
| 检测 B | **12 个键 / 30 处** | **11 个键 / 28 处** |
| `name=graph.json` | 在列（2 文件） | **已消失** |

⇒ 「检测 → 修复 → 检测确认消失」的**闭环成立**；这也同时证明该键**确实是真漂移**
（而非正当的分层表达）。

### 六、验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | 顺序 bug 复现（修复前） | `node test/graph-snapshot-order.test.ts` | ✅ ① 处返回 `day07`（最旧） |
| 2 | 修复后转绿 | 同一测试 | ✅ **6/6** |
| 3 | **闭环**：B 段键数下降且该键消失 | `npm run audit:drift` | ✅ 12→**11** 键 / 30→**28** 处 |
| 4 | 生产类型检查 | `npx tsc --noEmit` + `npm run build` | ✅ exit 0 |
| 5 | 工具类型检查 | `npm run typecheck:tools` | ✅ exit 0 |
| 6 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **37/37**（36 + 新增 1） |
| 7 | 两个审计工具标定 | `audit-wiring` / `audit-drift` selftest | ✅ 均 ALL PASS |
| 8 | 三方版本一致 | `package.json` / `README` / `CHANGELOG` | ✅ 均 `1.15.28` |

**未验证（诚实标注）**：① **运行时收益为 0** —— 两个 reader **当前生产零调用**（T4），
本次改动修的是「**若接线则正确**」，收益是**消除地雷 + 消除重复**，不是修一条在跑的路径；
② 真机 `listDir` 排序按**契约 + 真机实现**认定（已读 `dsh-fs-local`），但**未在真机跑这两个 reader**
（零调用，无法触发）；③ **快照无限增长**（`writeTemporalGraph` 每天一份、从不清理）**未处理**，
属另一议题；④ 本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，ADR-0057）；
⑤ T4 的 8 个符号里本 ADR 只落了 **2 个**，其余 6 个仍待定性。

## [v1.15.27] 投影漂移审计工具（经标定）—— 首次使用抓到第 7 处缺陷（ADR-0070）

前五轮（v1.15.22–26）找到的都是**同一族**缺陷：**机制对、断的是「投影跟不上源头」**，且单元测试全绿。
**逐个手工找是体力，不是能力** —— 目标第 (4) 条要的是「漂移检测与纠正的**能力**」。
本轮转向造工具，且它**第一次使用就抓到一个新缺陷**。新增 ADR-0070。

### 一、新增 `tools/audit-drift.ts`（+ `.lib.ts` + `.selftest.ts` + 两个夹具）

| 检测器 | 判据 | 定位 |
|---|---|---|
| **A** 派生件新鲜度**只看进程、不问源** | ① 守卫是**裸 `return;`**（排除「缓存命中回值」）② 条件含**进程内集合**的 `.has(` ③ **条件不含源探针**（含「探针赋值的局部名」） | 精度高，**已标定** |
| **B** 同一条判据在 **≥2 个模块**被表达 | `字段=字面量` 跨文件出现 | **线索级**，每键需人工复核 |

**收窄与判据要点**：
- 进程内集合的三种接收者：`core.<field>.has(`（`WriterCore` 就是进程内状态持有者）、
  本文件 `new Set/Map` 的局部名、`<ident>.<prop>.has(` 中 prop 名含 `Map|Set|Cache|Dirty|Warm|Seen|Visited`。
- **函数名收窄**（`DERIVED_ARTIFACT_FN`）：不加这条会把 `if (core.pending.has(id)) return;`
  （已在处理，无需重复）误报。
- 第 ③ 条要认「**探针赋值的局部名**」：修复后的写法是
  `const fpNow = await shadowSourcesFingerprint(...); if (fpNow === prev) return;` —— 不做这一步
  会把**已修好**的代码报成漂移。
- **B 是线索不是结论**：它答不了「两处口径是否一致」（那才是 D5 的病根）⇒ 工具里写明**不得据 B 定罪**。

### 二、**先标定，再用**（ADR-0062 §2 的纪律）

**① 夹具 10 组**（带 `MARK:` 标记，测试**按标记定位**、不硬编码行号）：
POS-1/2/3 三种进程内集合形态应报；NEG-1「返回值早退=缓存命中」/ NEG-2「条件用探针赋值的局部名」/
NEG-3「条件直接含探针」/ NEG-4「不含进程内集合」/ NEG-5「**非派生件路径**上的正当早退」一律不报；
B-POS 跨文件应报（两侧各一条）、B-NEG 单文件不报。

**② git 历史里的真缺陷（最强的一组）**：`0c4e06b:core/writer-materialize.ts` 的 `:41` 与 `:215`
正是 ADR-0069 的两处真缺陷，而同文件当前版本已修 ⇒ 检测器必须「**旧版报 2 条、新版报 0 条**」。
**把历史编码进测试**（而不是靠人记），是为了让结论**可复现**。

### 三、工具首次使用即抓到**第 7 处**缺陷：`judgment.ts` 漏了双条件的第一条

检测 B 报出 `res.status=not_found` 跨 `core/context.ts` 与 `observer/arbitrate.ts` —— 顺着查下去，
发现**第三个消费者漏了条件**：

| 位置 | 证据候选筛选 |
|---|---|
| `observer/arbitrate.ts:92` | `.filter(isPathLike).filter(isConcreteLocator)` ✅ |
| `observer/judgment.ts:26` | `.filter(isPathLike)` ❌ **漏了 `isConcreteLocator`** |

而 `evidence/paths.ts:22-24` 的注释**明文写着契约**：*「`isPathLike` **故意不收窄** …… 需要
「可检查」语义的地方用 `isConcreteLocator`」* —— 契约被违反在一处。

**后果**：对 glob（`scripts/*.ps1`）与 git ref（`origin/main`）也做存在性检查 ⇒ 必然 `not_found`
⇒ `conflictCount++` ⇒ 结论**假降为 `evidence_stale`**、置信假降、rationale 谎称「证据路径缺失」。
**实测**（真语料 2436 条有路径引用的记忆）：**12 条（0.49%）** 受影响 / 非具体 locator **17 处**。

**修复**：补 `.filter(isConcreteLocator)`（一行 + import）。
**复现测试** `test/evidence-missing-criterion.test.ts` —— **修复前先看红**：

```
AssertionError: 通配符 `scripts/*.ps1` 不是「可检查的具体路径」，不得判 evidence_stale；
  实际 evidence_stale（rationale: 证据路径缺失 1 处，结论降为待验证）
```

修复后 5 组断言全过，含 ③ **反向不变量**（真实缺失的**具体**路径仍须判冲突 —— 别把门修没了）
与 ⑤ **跨消费者一致性**（6 组混合证据上 `judgment` 与 `arbitrate` 判定必须一致）。

### 四、验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | 检测 A 夹具标定 | `audit-drift.selftest.ts` ③ | ✅ 恰好报 POS-1/2/3，NEG-1..5 全不报 |
| 2 | **检测 A 真历史标定** | ④ `git show 0c4e06b:core/writer-materialize.ts` | ✅ 旧版报 `:41`/`:215`，当前版 **0** |
| 3 | 检测 B 夹具标定 | ⑤ 标记对照 | ✅ 跨文件报两侧、单文件不报 |
| 4 | **真仓库回归护栏** | ⑥ 检测 A 必须 0 条 | ✅ 0 条（与 ADR-0069 修复一致） |
| 5 | 缺陷复现（修复前） | `node test/evidence-missing-criterion.test.ts` | ✅ ① 处 `evidence_stale`（复现成功） |
| 6 | 修复后转绿 | 同一测试 | ✅ 5/5 |
| 7 | 影响面实测 | `_research/judgment-locator-drift.ts`（2436 条） | ✅ **12 条 / 0.49%** / 17 处 |
| 8 | 生产类型检查 | `npx tsc --noEmit` + `npm run build` | ✅ exit 0 |
| 9 | 工具类型检查 | `npm run typecheck:tools` | ✅ exit 0 |
| 10 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **36/36**（35 + 新增 1） |
| 11 | 接线审计标定 | `tools/audit-wiring.selftest.ts` | ✅ 8 组断言 + ALL PASS |
| 12 | 漂移审计标定 | `tools/audit-drift.selftest.ts` | ✅ 6 组 + ALL PASS |
| 13 | 三方版本一致 | `package.json` / `README` / `CHANGELOG` | ✅ 均 `1.15.27` |

**未验证（诚实标注）**：① 真机 `not_found` 语义端到端（复现测试用按契约写的假 Gateway）；
② **检测 B 的 12 个键只复核了 `not_found` 一个**，其余 11 个为**未复核线索**（多为正当的分层表达）；
③ 检测 A 的四条已知边界（`return <值>` 形式 / 跨行守卫 / 模块级单例持有 / 函数名不含 `DERIVED_ARTIFACT_FN`
关键词）**会漏**，已写进工具输出与测试末尾；④ 工具**未接入任何自动门禁**（本仓无 CI，与 ADR-0062 的 V6 同一缺口）；
⑤ 本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，ADR-0057）。

## [v1.15.26] `_index.md` 的投影漂移 —— 新鲜度必须问源，不能只问进程（ADR-0069）

延续 D5（ADR-0066）的视角「**同一份语料、两条读路径可见性不同**」，本轮在
「`_index.md`（无 `topic` 的 `read_shadow()`）vs 主题召回」之间找到**同型问题**，且这次有实测数字。
新增 ADR-0069 + 回归锁。

### 一、实测漂移（真 `.shadow`，7297 条记忆）

| 读数 | 值 |
|---|---|
| `_index.md` 最后写入时间 | **09:34:01** |
| 之后写入的记忆 | `09:34:12` / `09:34:31` / `09:52:07` … |
| 它们在 `_index.md` 里出现的次数 | **0**（磁盘上确实存在） |
| **对索引不可见的记忆** | **623 条（8.54%）** |
| 主题召回是否看得见 | **看得见**（走 `listMemories`，每次读盘） |

⇒ **投影与源头脱钩**，差额随每次会话增长 —— 而 `read_shadow()` 给出的目录/主题索引
正是 agent 判断「记忆里有什么」的入口。

### 二、三层根因

```ts
// core/writer-materialize.ts · ensureIndex
if (!core.indexDirty.has(ws) && core.indexCacheWarm.has(ws)) return;  // ← 第 1 层
// core/writer-materialize.ts · ensureIndexCache
if (core.indexCacheWarm.has(ws)) return;                              // ← 第 2 层
```

1. `indexDirty` 是**进程内** `Set`，**只反映本进程自己的写入**；**别的会话/子代理写入的记忆
   本进程的 dirty 永远看不到** ⇒ 缓存一旦预热，`_index.md` 再也不更新。
2. 即便上层决定重建，`ensureIndexCache` 的 `if (warm) return` 也**不会重读新文件**（只拿旧缓存重渲染）。
3. 磁盘上已删除的文件**从不清出缓存** ⇒ 投影里留幽灵条目。

### 三、修复：问**源**，并改成每次**增量对账**

- **新鲜度问源**：用**已存在**的 `shadowSourcesFingerprint`（`core/projection-store.ts`，
  `listDir` 级成本）—— 它的注释早写着纪律 *「缓存是性能特性不是真相（ADR-0046）」*，
  但此前**只接给了 `nodes.jsonl`**（v1.15.12 修 `shadow_query` 陈旧投影时接的），**没接给 `_index.md`**
  ⇒ 又一次「机制存在、没接到这一处」。
- **每次增量对账**：`listMemories`（**只 listDir、不读内容**）列出磁盘 → 只为**新**文件读内容 →
  源头已消失的清出缓存。⇒ 「跟得上源头」与「不每回合全量重读」**同时成立**。
- **先采指纹、后读源**（与 ADR-0068 同一顺序教训）：若扫描期间源又变，记下的是**更旧**的指纹
  ⇒ 下次必然不等 ⇒ 保守重建；反过来会把变化记成「已见过」而**永久漏掉**。

### 四、真机契约核实（把「未验证」变成「已核实」）

本轮**读了真机实现**（`dsh-fs-local` 的 `listDirectory`）：

```js
result.push({ name, type,
  target: childTarget,                                          // 必给
  ...childInfo ? { version: childInfo.version } : {},            // 可探到就给
  ...childInfo?.type === "file" ? { size: childInfo.size } : {}  // 文件一定给
});
```

且 `FsDirEntry.target` 在 `dsh-fs@0.1.5-rc.2` 的 `types.d.ts` 里是**必填**（*"Resolved child target
for follow-up operations"*）⇒ 指纹**不会恒为 `undefined`** ⇒ 「源未变则跳过」在真机**成立**，
不会退化成每次重建。**真语料实测**（`_research/fingerprint-real.ts`）：可判定 ✅、
**7336 条目 / 517 KB**、**稳定** ✅、成本 **62 ms**（只 listDir，不读内容）。

### 五、回归锁（`test/index-freshness.test.ts`）

**关键**：绕过本进程 flush 直接往 mock fs 放文件（「别的会话写入」的等价物）——
走 flush 会置 `indexDirty`，就测不到要测的分支。

| # | 断言 | 结果 |
|---|---|---|
| ① | 首次读索引含已存在记忆并落盘 | ✅ |
| ② | **别的会话写入的新记忆出现在索引里** | ✅ 核心 |
| ③ | 源头删除 ⇒ 索引不留幽灵条目 | ✅ |
| ④ | **源未变 ⇒ 不重写**（性能特性保住） | ✅ |
| ⑤ | 幂等：无源变化时索引内容稳定 | ✅ |

> **④ 一度失败并暴露了真问题**：我的 mock 的 `listDir` 条目**漏了 `target`**（契约必填）
> ⇒ 指纹恒 `undefined` ⇒ 每次都「保守重建」⇒ ④ 永远过不了。修 mock 成**忠实契约**后 ④ 过。
> 这正是本仓「mock 与契约不符时测的是 mock」教训的又一次生效 —— 也正是它促成了上面的真机核实。

### 六、验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | 漂移实测 | `_research/index-drift.ts` + 定点核实（索引里出现 0 次、磁盘存在） | ✅ **623 条 / 8.54%** |
| 2 | 两层根因 | 读 `ensureIndex` / `ensureIndexCache` 代码 | ✅ 均确认 |
| 3 | 真机 `listDir` 形状 | 读 `dsh-fs-local` 的 `listDirectory` 实现 + `dsh-fs` 契约 | ✅ `target` 必给 / 文件给 `size` |
| 4 | 真语料指纹 | `_research/fingerprint-real.ts`（7336 条目） | ✅ 可判定 · 稳定 · **62 ms** |
| 5 | 回归锁 | `node test/index-freshness.test.ts` | ✅ 5/5（含核心 ②③ 与性能 ④） |
| 6 | 生产类型检查 | `npx tsc --noEmit` + `npm run build` | ✅ exit 0 |
| 7 | 工具类型检查 | `npm run typecheck:tools` | ✅ exit 0 |
| 8 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **35/35**（34 + 新增 1） |
| 9 | 审计工具标定 | `tools/audit-wiring.selftest.ts` | ✅ 8 组断言 + ALL PASS |
| 10 | 三方版本一致 | `package.json` / `README` / `CHANGELOG` | ✅ 均 `1.15.26` |

**未验证（诚实标注）**：① 真机**端到端**（插件 `dist/` 不热加载，需**重启**后看 `_index.md` 是否随新会话更新）；
② **10 万级规模**的对账成本未压测（当前 7297 条 / 62 ms）；③ **幽灵条目的真机量级未报** ——
本轮探针把 `_index.md` 的**说明文字**（`<时刻>-<入口slug>.md` 这类占位符）也算成了索引条目，
「索引有、磁盘没有」那一桶被污染，故**不给数**（修复逻辑已被测试 ③ 覆盖）；
④ **无 `version` 后端**下「同尺寸内容修改不触发失效」是 ADR-0046 已记录的已知降级
（真机 `dsh-fs-local` 会探 `version`，故本部署不触发）。
**新增固定开销**：每次读索引多一次 `listDir` 扫描（真语料 62 ms）—— 相对「静默返回不完整索引」是划算的。

## [v1.15.25] `_meta.json` 的读-改-写加版本守卫 —— 修掉 v1.15.24 连带放大的并发丢更新（ADR-0068）

**这一版修的是上一版自己放大出来的风险**（ADR-0067 的连带项）。新增 ADR-0068。

### 一、问题：v1.15.24 把一个理论竞态变成了常态

| | 修复前 | v1.15.24 之后 |
|---|---|---|
| `_meta.json` 的 RMW 触发条件 | `servedDetail`（要求「渲染里展开了片段」）⇒ **几乎永空** | `servedRels`（每条被返回的） |
| 读-改-写执行频率 | **几乎从不** | **每次有命中的召回** |

而 `_meta.json` 是**全工作区共享的一个文件**，写入全是「**读全量 → 改 → 写回全量**」
⇒ 并发（多会话 / teammate / 宿主与子代理同时召回）下**丢更新**。

**三处 RMW 及其窗口**：`core/memory.ts`（短）/ `query/query.ts`（短，**频率最高**）/
`core/writer-materialize.ts` 的 `runCompact`（**长** —— 读 meta → 重建索引 + Episode 收口 → 写回全量）。

### 二、根因：能力就在 fs 契约里，插件一处没用

已**读 `@deepseek-ai/dsh-fs@0.1.5-rc.2` 类型定义核实**（非推断）：

- `writeText(target, content, expected?: FsWriteIntent, …)`
- `FsWriteIntent = { kind: 'createIfAbsent' } | { kind: 'replaceIfVersion'; version: FsVersion }`
- `FsInfo.version` 原文：*"Opaque freshness token of the target right now."*；
  `FsVersion` 原文：*"the freshness token a write/edit **guards against**."*
- `editText` 文档明写：*"the version guard is checked before matching so stale content reports `FS_STALE_VERSION`"*；
  `FsErrorCode` 里确有 **`FS_STALE_VERSION`**。

⇒ 全仓 grep `expected`：**与 fs 无关的一处都没有** —— 版本守卫从未被使用。

### 三、修复

1. **新增事务层** `persistence/meta.ts` 的 `mutateMeta(fs, ws, mutate, attempts=3)`：
   `stat 取版本 → readText → mutate → 带守卫写 → FS_STALE_VERSION 时重读重试`，上限 3 次。
   配套 `readMetaVersioned` / `writeMetaGuarded`；`readMeta` 纯读语义不变。
2. **顺序敏感点（关键）**：**先 `stat` 取版本、再 `readText`**。
   若期间有人写入，我们手上的版本**比内容旧** ⇒ 带守卫写**失败并重试**（不覆盖）。
   反过来会拿到「比内容新的版本」⇒ 守卫通过而**覆盖别人的写入**。已写进代码注释，防「顺手调换」。
3. **`runCompact` 改为收集增量标记**：不再拿开头读到的 meta 全量覆盖回去（窗口横跨索引重建 + 收口），
   改为最后在**新鲜快照**上只应用 `status = "compacted"` 这几个标记 ⇒ 从「覆盖全量」变「应用 delta」，
   长窗口的丢更新**在结构上消失**。**这条与正确性直接相关**：`compacted` 丢了会让已归档原子**重回活跃索引**。
4. **`stat` 不可用时诚实降级**：版本为 `undefined` ⇒ 退化为无条件写（与旧行为一致，不更差），有测试锁住。

### 四、复现与锁定（`test/meta-concurrency.test.ts`，5 组断言）

**关键**：mock fs **真的实现** `stat` + `replaceIfVersion` 语义 —— 否则测的是 mock 不是系统
（v1.15.15 踩过「不忠实 mock」的坑）。用「注入一次外部写入」**确定性地**制造版本冲突：

| # | 断言 | 结果 |
|---|---|---|
| ① | 两次 `mutateMeta` 各自落盘且互不覆盖 | ✅ |
| ② | `mutate` 返回 `false` ⇒ 不写 | ✅ |
| ③ | **并发：冲突被检出并重试 ⇒ 双方更新都保住** | ✅（核心） |
| ④ | 无 `stat` 的宿主：退化为无条件写，不崩、不改语义 | ✅ |
| ⑤ | `readMeta` 纯读语义不变（缺文件 → `{}`） | ✅ |

③ 的读法：注入后若不重试，`other.md` 会被**整份覆盖丢掉**；测试断言它仍在且 `hits === 9`。

### 五、验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | 契约核实（能力存在） | 读 `dsh-fs@0.1.5-rc.2` 类型定义 | ✅ `FsWriteIntent` / `FsInfo.version` / `FS_STALE_VERSION` 均在 |
| 2 | 插件从未使用守卫 | 全仓 grep `expected` | ✅ 与 fs 相关的一处都没有 |
| 3 | 生产类型检查 | `npx tsc --noEmit` + `npm run build` | ✅ exit 0 |
| 4 | 工具类型检查 | `npm run typecheck:tools` | ✅ exit 0 |
| 5 | 并发回归锁 | `node test/meta-concurrency.test.ts` | ✅ 5/5（含核心的 ③） |
| 6 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **34/34**（33 + 新增 1） |
| 7 | 审计工具标定 | `tools/audit-wiring.selftest.ts` | ✅ 8 组断言 + ALL PASS |
| 8 | 三方版本一致 | `package.json` / `README` / `CHANGELOG` | ✅ 均 `1.15.25` |

**未验证（诚实标注）**：① 真机 `host.fs` 的 `stat` / `replaceIfVersion` **端到端**行为未验
（测试是按契约写的 mock）；② `FS_STALE_VERSION` 在 mock 里触发过，**真机未触发**；
③ 真并发时序未测（用「注入一次外部写入」确定性模拟）；④ 重试耗尽（连续 3 次冲突）只有代码路径覆盖；
⑤ 本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，ADR-0057），需重启后复核。
**已知代价**：并发高时同一事务可能写 2–3 次；重试耗尽会**放弃这一次更新**（宁可少记一次命中，也不覆盖别人）。

## [v1.15.24] 第五处同类缺陷：命中数累积触发条件错 —— 74.3% 的记忆永不可能被记命中（ADR-0067）

延续 ADR-0066（D5）的视角「**同一策略、只在一处生效 / 判据错**」，本轮在
`query/query.ts` 找到**第五个实例**并修复。**新增 ADR-0067 + 回归锁，立 D7。**

### 一、缺陷：`hits` 用的是 `servedDetail`，而它要求「渲染里展开了片段」

`query/query.ts` 里「给被服务的记忆累加 `hits`/`confirmedBy`」那段用的是 `servedDetail`，
其定义（同文件 `:370`）是：

```ts
if (s.tier !== "L0" && render.includes("…")) servedDetail.push(s.mm.rel);
```

它**本来是给冷却台账用的**（`:385-396`，`detail: true`），却被复用去累积命中数。两个后果：

1. `tierFor`（`retrieval/rank.ts`）对「**动作行占比 > 60%**」的记忆返回 **L0**；
2. 即便是 L1/L2，还要该次**预算够展开片段**（`budgetChars >= out.length + 30`）才进集合。

**真语料实测（7185 条）**：

| tier | 条数 | 占比 |
|---|---|---|
| **L0** | **5342** | **74.3%** |
| L1 | 1512 | 21.0% |
| L2 | 331 | 4.6% |

⇒ **74.3% 的记忆永不可能被记命中。**

**端到端佐证**：本机 `.shadow/` 有 7185 条记忆、`_index.md` **1.8 MB**、多次召回之后，
**`.shadow/_meta.json` 根本不存在**（`Get-ChildItem -Recurse -Filter _meta.json` 为空）。
—— 即：整条 retention/hotness/lifecycle 信号链**从未真正启动**。

### 二、语义依据：`hits` 是「召回命中数」，不是「展开片段数」

README「记忆遗忘」节原文：召回用 **hotness**（**命中数** × 半衰期衰减）加权。
**被返回一条记忆就是一次命中**，与「是否展开了片段」无关。
`servedDetail` 的语义是「以 detail 形式服务」（服务冷却台账），是**另一件事**，两者不该混用。

### 三、先复现，再修

新增 `test/hit-accumulation.test.ts`，**修复前先跑**（关键：修复前必须先看到它红）：

```
✔ ① 前置条件成立：动作行占满 ⇒ tierFor 返回 L0（真语料 74.3% 的记忆是这个形态）
AssertionError: 被返回的记忆必须在 _meta.json 里有记录（hits 是「召回命中数」，与是否展开片段无关）
  actual: undefined, expected: true
```

⇒ 缺陷在 mock 里**稳定复现**（不是只靠读码推断）。**修复**：累积改用 `servedRels`
（`:363` 对**每个真正进入输出的**记忆入栈），`servedDetail` 继续服务冷却台账。修复后 4 组断言全过。

### 四、连带恢复（此前实际不可达）

| 能力 | 修复前 | 修复后 |
|---|---|---|
| `hits` 累积 | 74.3% 的记忆永不 +1；`_meta.json` 不存在 | 每条被返回的记忆 +1 |
| 生命周期 `OBSERVED`（hits>0） | **不可达** | 可达 |
| 生命周期 `VERIFIED`/`TRUSTED`（`confirmedBy` ≥1/≥2） | **不可达** | 可达 |
| `forget` 的 `minHits` 保护（默认 1） | **从不生效** | 生效（被召回过的记忆不再被判「低价值」） |
| `retention` 的 hotness | 恒为 0（纸面功能） | 真正反映使用 |

> **又一例「单元测试绿、功能仍失效」**：`lifecycle-superseded.test.ts` 里有
> `OBSERVED`/`VERIFIED`/`TRUSTED` 的单元测试（直接构造 `{hits:2}` / `{confirmedBy:["a","b"]}`），
> 全绿 —— 但**生产里这三态从未触发过**，因为喂给 `lifecycleOf` 的 `rec` 恒为 `undefined`。

### 五、立 D7：`hits` 的范围决策（有意不顺手做）

`hits`/`confirmedBy` **只在主题召回路径累积**。`shadow_query`、**`recall_shadow`（`mode:"recovery"`，
最常用的恢复入口）**、`mode:"episode"` 等**都不累积**。把它们也算命中，会把 `hits` 的语义
从「被主题召回」扩大为「被任何读入口读过」—— 而 `shadow_query` 常被**探测性**调用。
**两种语义都自洽但含义不同**，且会改变 `hotness` 的含义 ⇒ **升为 D7，决策权在用户**
（建议倾向：分两个计数；或维持现状并在文档里写明）。

### 六、验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | 探针量化 L0 占比 | `_research/tier-l0-share.ts`（7185 条） | ✅ **L0 5342（74.3%）** |
| 2 | `_meta.json` 不存在的实证 | `.shadow` 递归查找 | ✅ 不存在（尽管 7185 条记忆 / 1.8 MB 索引） |
| 3 | **修复前先看红** | `node test/hit-accumulation.test.ts` | ✅ ② 处 `actual: undefined`（复现成功） |
| 4 | 修复后转绿 | 同一测试 | ✅ 4 组断言全过 |
| 5 | 生产类型检查 | `npx tsc --noEmit` + `npm run build` | ✅ exit 0 |
| 6 | 工具类型检查 | `npm run typecheck:tools` | ✅ exit 0 |
| 7 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **33/33**（32 + 新增 1） |
| 8 | 审计工具标定 | `tools/audit-wiring.selftest.ts` | ✅ 8 组断言 + ALL PASS |
| 9 | 三方版本一致 | `package.json` / `README` / `CHANGELOG` | ✅ 均 `1.15.24` |

**未验证（诚实标注）**：① 本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，ADR-0057），
真机上 `.shadow/_meta.json` 是否如期出现须**再重启一次**后复核；
② 引入一次**额外的 `_meta.json` 读写**（每次有命中的主题召回），写入比原来频繁（原来几乎不写）；
③ `_meta.json` 的**增长无上限**（现状无上限，未加）；
④ `forget.enabled` 时此修复会**降低有效删除量**（被召回过的记忆受 `minHits` 保护）——
方向符合文档意图，但属行为变化，已显式记录在 ADR-0067 的「负 / 已知边界」。

## [v1.15.23] 按推荐落地：B1 闭环 / B2·D4·D6 决策 / D5 修掉两条读路径 66.9% 的可见性分歧（ADR-0066）

用户 2026-09-11：**「已经重启 按推荐」** —— ① 确认 B1（重启使插件代码生效）闭环；
② 对 `BACKLOG.md` 里各条**按我给出的推荐落地**。**本轮新增 ADR-0066，并结掉 5 条待办。**

### 一、B1 闭环（重启实测）

| 完成判据 | 实测 |
|---|---|
| `read_shadow({mode:"toolset"})` 返回**台账** | ✅ **107 项**（105 `reference` + 2 `provider`）、**17 分类** |
| `read_shadow({mode:"toolset", need:["全文搜索"]})` 返回**能力预检** | ✅ 返回 `⬜ 全文搜索 → ripgrep`（**不是** `_index.md`），三条硬边界正常输出 |
| `read_shadow({mode:"toolset", category:"搜索与查找"})` 分类过滤 | ✅ 生效 |

⇒ `v1.15.13`–`v1.15.22` **十一个版本**的插件改动首次在运行进程里生效。
ADR-0057 的两种加载行为（host 组合行热加载 / 本插件 `dist/` 不热加载）**再次确认**。
**教训留档**：`toolset` 那版修的是「机制存在、接线断了」，而**验证它需要一次人工重启** ——
这类缺陷的**验证成本远高于修复成本**。

### 二、B2 决策：多粒度检索层 —— **采 ①「按证据改」**

形态 =「**单索引 + 层级表示 + 路由**」，**不做**「多库全量扇出」。
依据：`adr/0060` 实测表 + **ADR-0065 的独立先例**（OpenViking 的 `HierarchicalRetriever`
就是「路由 + 目录递归 + 重排」，且其 `score_propagation_alpha` **默认 1.0** ⇒ 层级买的是**召回路径**不是分数平滑）。
**核对**：该形态**本仓已实现**（v1.15.18 已核实：单 provider 路由 + `tierFor` 的 L0/L1/L2 + `renderByTier`）。
⇒ ① 的落地 = **确认现有设计即目标形态**，无需新建库。② 的「装 semble 复测」仍未做（不阻塞 ①，见 V1）。

### 三、D4 决策：`pinned`/`archived` —— **采 ③「纠正文档」**

- **不采 ①**（补写入口会把**外部权威状态**落进可重建的 `_meta.json`，与 ADR-0003 冲突）；
  **不采 ②**（「人工归档」没有信号可派，强派生会造语义不符的状态）。
- **落地**：`README.md` 两处改准（删掉「`pinned` 永存」与 `…→ ARCHIVED` 的不可达承诺，
  改为标注可达性）+ `MEMORY.md:90` 就地加勘误（原文保留，可追溯）。
- **留了口**：若将来确实需要「人工钉住/归档」，**须先起 ADR 论证状态落在 source 层**。

### 四、D5 落地：修掉两条读路径 **66.9%** 的可见性分歧（ADR-0066，本轮唯一的代码行为改动）

**先做信号实验**（AD 建议的顺序），在真 `.shadow` 语料 **7089 条**上比较 5 个候选判准：

| 判准 | 判 metadata | 其中**其实有工作痕迹** | **精度** | 挡住投影 |
|---|---|---|---|---|
| **S0 旧（现行）** | 4744 | **4279** | **9.8%** | **66.9%** |
| S1 / S2 / S3（各种收紧） | 1379 / 1288 / 1662 | 1050 / 1050 / 1197 | 23.9% / 18.5% / 28.0% | 19.5% / 18.2% / 23.4% |
| **S4 文本启发式口径** | **93** | **0** | **100.0%** | **1.3%** |

⇒ **S4 是唯一达到 100% 精度的判准，而它恰好是仓库里已文档化、从未接线的那一个**（`isMetadataMemoryText`）。

> **探针自身的一处缺陷（自曝）**：第一版把「用户话」也算成工作痕迹，而「会话元数据」的语义
> 恰是「**有用户要点、但没有实际工作**」⇒ 判准自相矛盾，S4（按定义必须含用户话）精度**恒为 0%**，
> 读数无意义。**修正指标后结论完全反转** —— 若不修正，会得出「仓库文档化的定义是错的」这一相反结论。

**落地**：新增唯一判据源 `isSessionMetadataAtom`（`core/episode.ts`），`deriveAtomKind` 改用它；
`isMetadataMemoryText` 保留（服务不 parseMemory 的读路径）；**`isCognitiveAtom` 删除**
（规则与 `validateAtomProjection` 完全重复且零调用点 —— 删它是为消除「同一条规则三份实现」的病根）。

**实测效果（真语料 7111 条）**：

| 读数 | 改动前 | 改动后 |
|---|---|---|
| `kind === "metadata"` | 4137（59.4%） | **90（1.3%）** |
| `deriveShadowNodes` 产出 | 2283（32.8%） | **6478（91.1%）** |
| **两条读路径可见性差** | **67.2%** | **8.9%** |

**残余 8.9% 的构成已核实**（探针 `_research/gate-reason-breakdown.ts`）：
`540` 条来自**证据门**（`decision 无 evidence`）—— ADR-0044/0045 的**正当拒绝**，不是缺陷；
`90` 条来自已校准的 metadata 门（全部真是会话元数据）。

**两条实测边界已写进测试**（防误判）：
1. `kind === "metadata"` 与判据是**有向**关系，不是等价 —— `task` 分支（扫用户话文本的
   todo/plan 关键词）**优先**，故「用户说『记下待办』」判 `task`。**不影响可见性**（task 不被门挡）。
2. 两份实现读的**表面不同**（线索头 `> 用户要点：` vs 正文行 `- [..] 用户：`）。
   真记忆**两者都写** ⇒ 真语料上一致；只写头不写正文会分叉（已知边界，测试里钉住并断言其分叉）。

**`test/atom-kind-gate.test.ts` 从「决策锁」改写为「不变量锁」**（锁一致性、可达性、有向绑定、两层边界）。

### 五、D6 决策：OpenViking 三条 —— **归类为 Projection，三条都做；实现待后续**

- **归类已定**：三条要新增的**都是 Projection（派生可重建）**，不是 source。目录级 L0/L1 sidecar
  由该目录下的记忆**确定性派生**（OpenViking 自己也是：它的 L0 从 L1 正文里抽）；
  覆盖率自报是**派生件的元数据**。⇒ **不违反 ADR-0003**，也不重蹈 ADR-0051 的「投影当 source」弯路。
- **三条**：① 目录级 abstract + overview sidecar（256 / 4000 字符上限）；② 上层由下层确定性派生
  （消除层间漂移）；③ 派生件自报覆盖率 + 待处理变更（`freshness`）。
- **本轮不实现**（需新增一类派生文件 + 改 `_index.md` 定位，属独立工作量）；**实现前置已写进 BACKLOG**：
  落盘位置必须隐藏（不污染 `listMemories` 语料）、定 `_index.md` 与 sidecar 的权威关系、加漂移棘轮。

### 六、台账状态

`BACKLOG.md`：新增「〇、已结案」节（B1 / B2 移入）；B1 / B2 / D4 / D5 / D6 **五条结案**；
T4 从 9 个降为 **8 个**（`isCognitiveAtom` 已删、`isMetadataMemoryText` 已保留）；
「一、阻塞在用户」节**已空**。**现存 19 条**：T 3 / D 4 / V 6 / G 4。
新增 `adr/0066`。

### 验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | B1 台账本体 | `read_shadow({mode:"toolset"})` | ✅ **107 项 / 17 分类** |
| 2 | B1 能力预检 | `read_shadow({mode:"toolset", need:["全文搜索"]})` | ✅ 返回预检（非 `_index.md`）+ 三条硬边界 |
| 3 | B1 分类过滤 | `read_shadow({mode:"toolset", category:"搜索与查找"})` | ✅ 生效 |
| 4 | 生产类型检查 | `npx tsc --noEmit` + `npm run build` | ✅ exit 0 |
| 5 | 工具类型检查 | `npm run typecheck:tools` | ✅ exit 0 |
| 6 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **32/32**（含改写后的 `atom-kind-gate`） |
| 7 | D5 前后对照 | `_research/d5-signal-experiment.ts`（7089 条） | ✅ 旧精度 **9.8%** vs 新 **100%** |
| 8 | D5 落地效果 | `_research/measure-path-visibility.ts`（7111 条） | ✅ metadata **4137→90**；投影 **2283→6478**；分歧 **67.2%→8.9%** |
| 9 | 残余拒绝归因 | `_research/gate-reason-breakdown.ts` | ✅ **540 证据门 + 90 metadata 门**（前者是正当拒绝） |
| 10 | 审计工具标定 | `tools/audit-wiring.selftest.ts` | ✅ 8 组断言 + ALL PASS |
| 11 | 三方版本一致 | `package.json` / `README` / `CHANGELOG` | ✅ 均 `1.15.23` |

**未验证（诚实标注）**：① D5 是**召回面变更**（`shadow_query` 候选 32.8% → 91.1%），
**在运行进程里还没生效** —— 插件 `dist/` 不热加载，需**再重启一次**才能在真会话里看到效果；
② D6 三条**只决策未实现**；③ 残余 630 条（8.9%）只在主题召回可见，其中 540 条是证据门的**有意拒绝**，
要让它们也进上下文属**改证据门**的独立决策（ADR-0044/0045），本轮不动。

## [v1.15.22] 脚本全量切 TS + 认知门可达性实测 + 吸收 OpenViking（含一处出处勘误）；台账 22 条

用户 2026-09-11 两条指令：**「所有的 js 脚本 mjs 脚本必须全部切换到 ts」**、
**「关注 openviking 并吸收」**。另附上一轮 T1 分诊的延续。**三条 ADR：0063 / 0064 / 0065。**

### 一、脚本全量切到 TypeScript（ADR-0064）

- 8 个 `.mjs` 经 `git mv` 改为 `.ts`：`tools/` 6 个（`audit-wiring` ×3、`retrieval-eval`、
  `winget-verify`、`winget-verify-seed`）+ `test/replay-metrics` / `test/replay-real`。
  **仓库内再无手写 `.js`/`.mjs`**（机械核对：排除 `node_modules` / `dist` 后为空）。
- **零构建、零新依赖**：靠 Node ≥22.6 的 type-stripping，`node tools/x.ts` 直跑
  （与既有测试套 `node test/*.test.ts` **同一套机制**）。**约束**：Node 的 ESM 要求**
  **显式扩展名**，相对导入必须写 `./audit-wiring.lib.ts`（实测写 `./audit-wiring.lib` 报 `ERR_MODULE_NOT_FOUND`）。
- `package.json` 5 条 script 改指 `.ts`（**script 名不变**）；新增 `tsconfig.tools.json` +
  `npm run typecheck:tools` —— **工具面第一次有类型门**。
- **类型门当场抓到一个真漏洞**：`tools/winget-verify.ts` 的 `runWinget` 返回 `Promise<unknown>`，
  下游 `r.out` / `r.code` / `r.err` / `{ expectedVersion }` 全是隐式 `any`（**字段写错编译器不响**）。
  迁移后报 6 处 `TS2339/TS18046`，已补显式接口 `interface WingetRun { ok; code; out; err }`。
- **测试套有意不加类型门**：实测 `tsconfig.tests.json` 报 **10 个文件 79 处错误**，
  逐条看过后决定不加 —— 错误集中在**故意喂畸形输入**的守卫测试（如把 `{ status: "supported" }`
  这种缺 8 个必填字段的形状喂给守卫，断言它拒绝）。给它们加门唯一出路是满屏 `as any`，
  会把测试从「证明守卫挡住脏数据」退化成「证明带 cast 的脏数据被挡住」，**削弱证据力**。
- **副作用已核对**：工具变 `.ts` 后**开始扫到自己**，B 类线索 **81 → 85**。
  新增 4 条**全部来自 `tools/audit-wiring.lib.ts` 自身的字符状态机**（`c === "\\"`、`c2 === "*"`
  这类单字符局部别名比较）—— 正是 ADR-0062 已记录的噪声类型。**A 类 30 → 30 不变**。
- 文档路径引用一并归一（16 个文件，含 ADR 历史条目与 `_research/` 探针）。

### 二、认知门可达性 + 读路径可见性分歧（ADR-0063，行为零改动）

用真 `.shadow` 语料（**6960 条**）把三条静态线索落成实测数字：

| 读数 | 值 |
|---|---|
| `kind === "metadata"` | **4137 条（59.4%）**，entry **全部是 `"shadow"`** |
| 其中**有实质内容**（动作/思维/用户话） | **94.4%** |
| 主题召回路径可见（`query.ts:263-296`，**不做 kind 过滤**） | **6960（100%）** |
| `shadow_query` 路径可见（`deriveShadowNodes` 过 gate） | **2283（32.8%）** |
| **两条读路径可见性差** | **67.2%** |

- **根因**：`deriveAtomKind` 把 `entry === "shadow"` 当「会话元数据」的代理，
  而 `entry` 是**写侧兜底字面量**（`core/writer-materialize.ts:175`：`primaryComp?.(id) || "shadow"`）
  —— 语义是「**没识别出组件**」，不是「这是会话记账」。
- **同一条规则有三份实现**：`isCognitiveAtom`（按 kind）与 `isMetadataMemoryText`（按文本启发式）
  **生产零调用点**，真正生效的是 `validateAtomProjection`（`lineage-validator.ts:18` ← `node.ts:48`）；
  两份零调用点实现口径还互不相同（**4137 vs 110，窄 37 倍**）。
- **`AtomKind` 声明 5 值、生产者只出 3 值**：`session` / `artifact` **全仓无生产者**
  ⇒ `kind === "session"` 分支**永不可达**。
- **行为改动为零**：只在源码注释标注实测事实、加**决策锁**测试 `test/atom-kind-gate.test.ts`（第 32 个测试）。
  **不静默改召回面** —— 是否让 `metadata` 继续挡 67.2%，是产品语义决策，升为待办 **D5**。

### 三、吸收 OpenViking（ADR-0065，含一处出处勘误）

- **勘误**：`README.md:177` 曾把召回衰减标成「**OpenViking 式** hotness」——**标错了**。
  它的官方 README + Context Layers + Retrieval 三份文档里，`decay`/`hotness`/`half-life`/
  `reinforce`/`recency` **全部 0 命中**；它的三层是**静态分层 + 目录递归 + 重排**，不含时间衰减。
  真实出处是**同一句里本来就引了**的 **MemoryBank**（Ebbinghaus 曲线，[arXiv:2305.10250](https://arxiv.org/abs/2305.10250)）。
  ⇒ **出处标错会让后来者去找一个不存在的先例**；归因也必须有证据。
- **真正可吸收的三条**（升为待办 **D6**，本轮不实现）：① L0/L1 是**目录级 sidecar**
  （`.abstract.md` 默认 256 字符 / `.overview.md` 默认 4000 字符，**不为每个文件建**，
  文件摘要聚合进所属目录的 L1）；② **L0 从 L1 正文确定性抽取**（H1 之后、首个 `##` 之前）⇒ 层间不漂移；
  ③ sidecar 带 **`freshness`**（直接子项覆盖率 + `pending_child_changes`）⇒ 派生件**自报是否过期**。
  三条都须先定「**新派生文件算 Projection 还是 source**」（ADR-0003），故不能顺手做。
- **对 ADR-0060 的精化**：它的层级分数传播是 `alpha*embedding + (1-alpha)*parent`，
  而 **`score_propagation_alpha` 默认 `1.0`** ⇒ **默认父分权重为 0**。
  **即层级买的是「递归下钻扩大候选」，不是「分数平滑」。**
- **独立佐证 ADR-0060 三条建议**：检索形状 = 意图分析 → **目录递归 + 优先级队列** → 重排
  （`GLOBAL_SEARCH_TOPK = 10`、`MAX_CONVERGENCE_ROUNDS = 3`、`if final_score > threshold`）。
- **不取代码**：主工程 **AGPLv3**（`crates/ov_cli` / `examples` 为 Apache 2.0）。只取概念。
- **表述止于证据强度**：「无时间衰减」的证据是「**官方文档未见**」，不是「读过全部源码」。

### 四、T1 分诊续（A 类 30 条里的新结论）

- **新确认的误报**：`sembleCandidates`（生产有调用点 `core/index-engine.ts:10/45`）；
  `assertResultNoAuthorityGrowth` 等 4 个 long-horizon 守卫（`long-horizon/engine/interaction.ts:6`
  导入后放进 `resultGuards` 数组 `for (const g of resultGuards)` 调用 —— 工具数不出这种间接调用）；
  `apply`（命中的是 `core/writer.ts:39` 的**注释**）。
- **新一类线索**：`progressiveDisclosure` / `refineTree` / `renderRetrieved` 在生产里
  **只有注释提到**（`core/knowledge-engine.ts:7-8` 的清单式注释），真调用点只有测试 ——
  属「**注释造成的假调用点**」。
- **拆出 T4**：9 个「**生产与测试引用皆为零**」的导出符号，其中 `readTemporalGraph` / `readGraph`
  是**只写不读**（数据落盘无人读回）—— 这是**真线索**，需定性。

### 验证

| # | 检查项 | 方式 | 结果 |
|---|---|---|---|
| 1 | 仓库内无手写 `.js`/`.mjs` | `Get-ChildItem -Recurse -Include *.js,*.mjs`（排除 `node_modules`/`dist`） | ✅ **空** |
| 2 | 无 `.mjs` 路径引用残留 | 全仓 `*.md`/`*.json`/`*.ts` grep `.mjs` | ✅ 仅剩 1 处（`winget-verify.ts:27` 的**迁移说明文字**） |
| 3 | 生产类型检查 | `npx tsc --noEmit` + `npm run build` | ✅ exit 0 |
| 4 | 工具类型检查 | `npm run typecheck:tools` | ✅ exit 0（**修前 6 处错误**，已修） |
| 5 | 全套回归 | `test/**/*.test.ts` 逐个 `node` | ✅ **32/32**（新增 `atom-kind-gate`） |
| 6 | 审计工具标定 | `node tools/audit-wiring.selftest.ts` | ✅ 8 组断言 + `ALL PASS ✅` |
| 7 | 审计计数变化已解释 | `node tools/audit-wiring.ts .` | ✅ A **30**（不变）/ B **85**（+4，全来自工具自身字符比较） |
| 8 | 核验器行为未变 | `node tools/winget-verify.ts --id jqlang.jq` | ✅ `status: "ok"`、`1.8.2`、`MIT License` |
| 9 | 评测器行为未变 | `node tools/retrieval-eval.ts` | ✅ 复现同量级读数（A 单库有阈值 recall 0.358±0.033、离题噪声 0.000） |
| 10 | 三方版本一致 | `package.json` / `README` 当前版本行 / `CHANGELOG` 首条 | ✅ 均 `1.15.22` |

**未验证（诚实标注）**：`test/replay-*.ts` **不在任何类型门内**（在 `test/` 下，测试面有意不加门）
⇒ 这两个脚本的 `.ts` 后缀**只带来语法检查，不带来类型检查**；type-stripping **不做类型检查**
（`node x.ts` 跑过 ≠ 类型正确，必须另跑 `typecheck:tools`）。

## [v1.15.21] BACKLOG 分诊结案：`pinned` / `archived` 无入口 —— 升为 D4 决策项（19 条）

用户 2026-09-11：**「待办记录好后，提交，结束」**。故本轮不新增功能，只把 `BACKLOG.md` 里
**T3 那条待分诊**分诊到底，并把分诊暴露出的产品决策补成 **D4**。**纯文档改动，生产代码零改动。**

### T3 分诊结论：不是「接线断了」，是「已文档化但无入口的能力」

- 原线索只有审计 B 类报的 `status=archived` 无写入者。本轮**扩展**：**`pinned` 同样无写入者** ——
  生产代码只写 `pinned: false`（`core/memory.ts:74`、`core/writer-materialize.ts:88`、`query/query.ts:401`），
  **`pinned: true` 全仓零处**（三路 grep 核实：字面量 / `pinned:` / `pinned =`）。
- 两者的读点与语义：

  | 状态 | 读点 | 语义 | 生产可达？ |
  |---|---|---|---|
  | `pinned: true` | `core/lifecycle.ts:27`（→`TRUSTED`）、`core/forget.ts:17`（→**永不被遗忘**） | 「人工显式信任」 | ❌ **恒为 false** |
  | `status: "archived"` | `core/lifecycle.ts:28`（→`ARCHIVED`）、`core/forget.ts:18`（→**立即遗忘**） | 「人工归档」 | ❌ **无写入者** |

- **三条依据支持「无入口」这个判定**：
  1. `_meta.json` 是 **Derived Artifact**（ADR-0003：Memory 文件 = source of truth，meta 可被
     `rebuild-index` 重建）⇒ **手工编辑它会被下次重建抹掉**，故「人来改 meta」不是设计上的入口；
  2. **没有任何命令 / 工具 / 元数据约定**能置 `pinned` / `archived`（插件工具面只有
     `read_shadow` / `recall_shadow` / `shadow_query`，均无写侧动作）；
  3. **实现与设计声明不一致**：`MEMORY.md:90` 明写生命周期「从 meta 信号派生……**不做写侧硬状态迁移**、
     纯按信号推导」，而 `lifecycleOf` 的两条最前置判断读的恰恰是**写侧 `rec.status` / `rec.pinned`**。
- **需一并处置的文档承诺**（行号逐个核实通过）：`README.md:35`（`NEW → … → ARCHIVED`）、
  `README.md:177`（`pinned` 永存）、`README.md:178`（`pinned→TRUSTED` 优先）、
  `MEMORY.md:90`、`CHANGELOG.md:1637`。

### 新增 D4：三条路，决策权在用户

| 选项 | 代价 / 风险 |
|---|---|
| ① 补持久入口 | 会把**外部权威状态**落在 Derived Artifact 上 —— 与 ADR-0003 **直接冲突**；除非先把状态**升为 source** |
| ② 改为信号派生 | 与 `MEMORY.md:90` 一致；但「**人工**归档」**没有信号可派**，强行派生会造出语义不符的状态 |
| ③ 纠正文档 | 最小、最诚实；代价是**丢掉一个已文档化的能力承诺** |

**建议倾向 ③ 为主 + ① 的窄版本**（先改准文档；若产品确实要「人工钉住/归档」，再单独立项设计
**符合 ADR-0003 的持久入口** —— 状态必须落在 source）。**不建议 ②**（无信号可派）。
**这只是建议，决策权在用户**（本仓纪律：不单方面推翻已冻结的 ADR）。

### 台账结构变化

- 条数 **18 → 19**：T3 从「待分诊」结案（转入 D4），二类 3 → 2（T1 / T2 仍未分诊），三类 3 → 4。
- 修正 T2 一处 Markdown 折行粘连（`kind=deleted` 与 `status=compared` 两条被挤在同一行）。
- 修正 T3/D4 的 README 引用：原写「`README.md:178` 承诺 `pinned` 永存」不准确 ——
  「`pinned` 永存」在 `:177`，`:178` 是生命周期状态机那一行；已拆成两处精确引用。

### 验证

- `npx tsc --noEmit` clean（exit 0）。
- **全套回归 31 个测试文件全过**（`test/**/*.test.ts` 逐个 `node` 执行，31/31）。
- 审计工具标定 `node tools/audit-wiring.selftest.ts` → **8 组断言 + ALL PASS ✅**。
- 本轮**只改文档**（`BACKLOG.md` / `CHANGELOG.md` / `README.md` / `package.json` 版本号），无 `src` 改动 ⇒ `dist` 不变。

## [v1.15.20] 新增 BACKLOG.md：待办与未决事项的唯一台账（18 条）

用户 2026-09-11：**「先记录代办任务，后续再继续」**。故把跨 7 轮累积的未完成事项集中落成仓库内的一份台账，
替代此前散落在各 ADR「未验证」节里的碎片。

### 为什么需要它

`v1.15.13`–`v1.15.19` 七轮里，每一轮都在 ADR 末尾写了「未验证 / 未做」，但这些条目**分布在多个文件、
没有统一入口**。结果是：上一轮明确留下的缺口（「81 条 B 类与 28 条 A 类未逐条分诊」）要翻 ADR 才找得到。
`BACKLOG.md` 就是为了终结这种分散。

### 五类共 18 条

| 类 | 条数 | 内容 |
|---|---|---|
| 一、阻塞在用户 | 2 | B1 重启 DSH 使插件代码生效；B2 多粒度检索产品方向（ADR-0060 三选项） |
| 二、待分诊 | 3 | T1 审计 A 类 30 条；T2 审计 B 类 81 条；T3 `status=archived` 无生产者待判定 |
| 三、待决策 | 3 | D1 `ChangeSet`/`invalidateFor` 接线还是删除；D2 跨项目根注册；D3 细粒度取代 |
| 四、未验证 | 6 | V1 真机 semble/zg；V2 新台账 probe 旗标；V3 `maxMembers` 运行时拦截；V4 真机 `host.fs` 语义；V5 其余 mock 忠实性；V6 审计工具未入门禁 |
| 五、已知空白 | 4 | G1 expiry 无对照消融；G2 CLI 层工具数量拐点无论文；G3 装/审批闭环无先例；G4 重排器未在本系统验证 |

### 写法约定（本文件自身的纪律）

每条给四项：**内容 / 依据（可点的文件或 ADR 行号）/ 为什么现在没做 / 完成判据**。
**不写没有依据的条目** —— 宁可少列，不留悬空项（本仓纪律：结论要有证据）。

### 准确性核对（本轮实做，不是照抄 ADR）

- 待办里引用的 **8 处行号逐个核实通过**：`core/memory.ts:74`、`query/query.ts:401`、
  `core/writer-materialize.ts:88` 与 `:213`、`core/forget.ts:18`、`core/lifecycle.ts:28`、
  `retrieval/rank.ts:103`、`delegation/engine/delegated-execution.ts:6`。
- T1/T2 的计数为 **2026-09-11 实跑** `node tools/audit-wiring.ts .` 所得（**30 / 81**），
  **不写「约」**；并注明语料随仓库变化、重跑可能不同（避免以后有人拿旧数字当准）。

### 其他

- README 的「版本 / 变更」节加一行指针，指到 `BACKLOG.md`（与 `CHANGELOG.md` 的「已做」互补）。
- `BACKLOG.md` **不入 `package.json` 的 `files` 白名单** —— 与 `CONTEXT.md` / `CHANGELOG.md` /
  `MEMORY.md` 同一先例（维护者文档，不属包构成）。
- 台账的「附」节说明：`_research/`（四路调研脚本与原始输出、分诊工具）**有意不纳入版本控制**，
  可复现但属过程材料。

### 验证

- `npx tsc --noEmit` clean；**全套回归 31 个测试文件全过**；审计工具标定 `ALL PASS`。
- **本次为纯文档改动**，未改任何运行时代码（`dist/` 无变化）。

### 未验证（诚实标注）

- 台账本身的**完整性**（是否漏记了某轮 ADR 里的「未验证」项）**未逐 ADR 交叉核对**；
  已知缺口：各 ADR 末尾共有 **22 条未勾选自检项**，本台账是按主题归并后的版本，两者**不是一一对应**。

## [v1.15.19] 接线审计工具：找「机制存在但接线断了」（ADR-0062）

本轮无用户新指令。v1.15.13–18 连续挖出**四类同源缺陷**，且**单元测试全绿** —— 共同特征是
**机制是对的、执行函数是对的，断的是「谁调用它」或「谁写这个值」**（测试往往直接 import 执行函数，测执行不测接线）。
故做一个**专门审计工具**：目的不是抓这四个（已修），而是**下一次能自动发现同类**。

### 一、新增 `tools/audit-wiring.ts`（+ `.lib.ts` + `.selftest.ts` + fixtures）

两类判据，纯静态、无 LLM、无网络、不改文件：

- **A. 导出但生产代码无调用点** —— 数 `Name(` 形态的调用/实例化，减去 `function Name(`。
- **B. 只被读、生产代码无写入点的判断值** —— 对每个 `字段 === "值"`，找行内「字段…值」共现的生产者。

### 二、**工具必须先标定，再用**（本轮最重要的一条）

初版在真仓库报「A 类 0、B 类 10」，**而 B 类 10 条全是误报** —— `status: violated ? "violated" : "satisfied"`
这种**三元写**检测器看不到。**一个不会报警的检测器，报「0」是没有意义的。**

故加 `tools/audit-wiring.selftest.ts`，用已知答案夹具标定。标定**连续暴露 4 个工具自身缺陷**，每个都会导致错误结论：

| # | 工具缺陷 | 后果 | 修正 |
|---|---|---|---|
| 1 | 三元写不认 | **误报**：可达分支被说成不可达 | 改按**字段+值**行内共现判定 |
| 2 | 改按「字面量」判后，跨字段同名值算作写入者 | **漏报**，恰好漏掉 `status=superseded` | 回到**字段+值**联合判定 |
| 3 | **扫注释文本** | 夹具里一句说明文字被当成真代码 | 加**尊重字符串的注释剥离**状态机 |
| 4 | 分类器要求前导斜杠（`/[\\/]test[\\/]/`） | 顶层 `test/` 从未被排除 ⇒ 测试夹具的 `status: "superseded"` 被当成生产写入者，**恰好掩盖要抓的真缺陷** | 改为**按路径分段**判定 |

第 4 条最能说明标定的价值：**工具的分类器 bug 会把真缺陷掩盖成「没问题」**。
另有两处「比较行自匹配」（`if (r.phase === "ghost")` 里读点冒充写入点）与箭头函数定义误减，同样由标定抓出。

### 三、审计结论：**一处确认，其余多为误报**

**确认**：`ChangeSet`（83 行）与 `ShadowProjectionStore.invalidateFor?()` **生产中未接线** ——
唯二消费者是测试；生产只在**类型位置**提到它，而那个方法本身也无调用者；生产走的是**粗粒度清空** `invalidateProjection`。

**但明确纠正可能的夸大：这不是正确性缺陷。** 投影缓存是**可重建派生**，清空后下次读自动重建 ⇒ 粗粒度路径**正确**；
ADR-0048⑤ 的「变革驱动」是**优化**，接线需要**写侧新增变更跟踪**（现有 `rebuildIndex` 走 `listMemories` 全量扫描，不产出 `ChangeSet`），
且伴随真实取舍（清空 = 一次极小写 + 下次全量重建；`invalidateFor` = 读全量缓存 + 写回，换下次读更快）。
⇒ **保留实现与测试 + 在代码里显式标注「未接线」**，不臆造接线。

**误报（已识别）**：A 类精度低 —— 本仓有意导出大量**面向测试的包装 API**（如 `delegation/guard/*` 的 `assert*`，
其包裹的判定函数在生产确有被 `delegated-execution.ts` 使用）；B 类噪声来自 `typeof x === "object"`、`mode=*`（调用方传入）、`code=ENOENT`（Node 错误码）等**外部输入值**。

### 验证

- 工具**自身经标定**：8 组断言全过，含 2 处**真仓库已知答案**（`status=superseded`、`ChangeSet` 无调用点）与 2 处**反例不误报**。
- `npx tsc` clean；**全套回归 31 个测试文件全过**。
- `package.json` 加脚本 `audit:wiring` / `audit:wiring:selftest`；`tools/` 已在 `files` 白名单内。

### 未验证（诚实标注）

- A 类命中是否还有**第二处**真实断线 —— 本轮只逐条核实了 guard 类与 `ChangeSet`，其余 ~28 条 A 类与 80+ 条 B 类**未逐条分诊**。
- 工具只做**单行 200 字符窗口**匹配（跨行构造会漏判）、**无类型分析**（不区分哪个对象的字段）。
- 未接入任何自动门禁（本仓无 CI）。

## [v1.15.18] 确定性取代接进生命周期 + 核实多粒度形态已实现（ADR-0061）

本轮无用户新指令，继续目标第 (4)「可供执行的真相 / 纠正漂移」与第 (3) 的**落地核实**。

### 一、发现并修掉一处**自相矛盾的输出**（与 v1.15.13 的 P0 同类）

本仓**已有**文献唯一支持的「纠正」形态 —— **确定性取代**：`newestByEntryOf` + `verdictOf`
按**同 `entry` 是否有更新记忆**判定 `superseded`，**无 LLM、无相似度阈值**（文献：余弦相似度分辨
「被推翻」vs「换个说法」的 AUROC 仅 0.59）。且它是**活的**：`query.ts:301` 对取代项 `×0.7` 降权 + 报告。

**但同一批代码里还有三条依赖 `meta.status === "superseded"` 的分支**（`lifecycle.ts` 的 `SUPERSEDED`、
`forget.ts:18`、`rank.ts:103` 的 `superseded: 0.15`），而**生产代码从不写这个值** ——
严格核实（两轮 grep）后，写入 `meta.status` 的只有 `"active"`（`memory.ts:74`、`query.ts:394`）
与 `"compacted"`（`writer-materialize.ts:88`）；**唯一写 `"superseded"` 的是测试夹具**
（`recall-attribution.test.ts:1319` 手工塞入）⇒ 那三条分支**在生产中不可达**。

**后果（修前实测，非推断）** —— 同一条记忆自相矛盾：

```
生命周期 NEW · 状态 active · 裁决 superseded · 结果 superseded · 反思 后续已迭代…
```

**根因是顺序**：`lifecycle` 在**每记忆**循环（`query.ts:293`）里先算好，而 `superseded` 依赖
`newestByEntryOf(entryList)` 这个**跨记忆**视图、只能在**之后**的循环（`:299`）算出 —— 标签先定死、从不回填。

**修复**：`lifecycleOf` 新增可选参数 `superseded`，由调用方用**同一份读时裁决**回填。
- **优先级**：`pinned(TRUSTED) > archived(ARCHIVED) > superseded(SUPERSEDED) > STALE > DECAYING > …`
  —— 外部权威状态不被派生判断覆盖（inv 178）。
- **不持久化**：取代是「相对当前可见记忆集」的判断，写进 `_meta.json` 会随可见集变化失效 ——
  这正是原分支从未被写入的合理原因。
- **修后实测**：`生命周期 SUPERSEDED · 裁决 superseded`（一致）；新的那条仍 `NEW · fresh`。

### 二、有意**不接线**的两条，并写明理由

| 位置 | 处置 | 理由 |
|---|---|---|
| `forget.ts:18` 的 superseded 遗忘臂 | 保留不接线 | 遗忘是**热度/年龄**维度的 GC；取代是**结构**判断。用瞬时裁决决定永久移出活跃集会随可见集抖动误删 |
| `rank.ts:103` 的 `superseded: 0.15` | 保留不接线 | 读时降权**已由** `query.ts:301` 的 `×0.7` 承担，再接一条会**重复降权** |

两条都保留（外部显式标记仍可用），但**写明「生产中不可达」**，不留「看起来在工作」的假象。

### 三、核实第 (3) 条：证据支持的形态**本仓已实现**

| 证据支持的三要素 | 本仓 |
|---|---|
| 单索引 + 路由到**一个**来源 | ✅ `indexEngine.provider` 单值，工厂只返回一个 |
| **层级表示** | ✅ `tierFor` 派生 `L0/L1/L2`（有思考→L2；动作行占比>0.6→L0；否则 L1） |
| 命中后**沿层级展开** | ✅ `renderByTier` 按预算逐层：**L0 摘要 → L1 +命中片段 → L2 +正文骨架** |

⇒ 「多粒度」这一形状**已经在跑**，且是**单索引 + 层级**、不是「建 N 个库再全查」。
故第 (3) 条的建议不是「改造」，而是**确认现有形态正确、并明确拒绝退化为全量扇出**。
**仍缺**：判别层（重排器，本仓无）；**检索前**的按查询路由（现有是配置级路由 + 检索**后**的粒度控制）。
**产品方向仍待用户裁决**。

### 验证

- **修前/修后实测对照**（同场景两次运行）：标签由 `生命周期 NEW · 裁决 superseded` →
  `生命周期 SUPERSEDED · 裁决 superseded`。
- 新增 `test/lifecycle-superseded.test.ts`（4 组：读时裁决生效 / 优先级 / 取代优先于 STALE / 既有分支不变）；
  场景 36 加**集成回归断言**（**修前该断言红**，且断言「同一条记忆的生命周期与裁决必须一致」）。
- `npx tsc` clean；**全量回归 31 个测试文件全过**。

### 未验证（诚实标注）

- 真机端到端需**重启 DSH**（本插件 `dist/` 改动不热加载，见 ADR-0057）。
- `(subject, relation, object)` 级细粒度取代**未做**（本仓是 `entry` 单键，跨主题取代测不到）。
- 「先加判别层」的建议**引自文献、未在本系统验证**（本仓无重排器）。


## [v1.15.17] 部署取证：Team 已生效（热加载）；插件代码需重启；P0 在真机复现

用户第 0 轮已授权「补 agent-team 依赖 + 同步预设 + 重启 DSH」。本轮把**部署做完并逐条取证**，过程中确认了本仓 ADR-0056 的代码论断，并发现两种加载行为并存。

### 一、agent-team 部署（已完成且**已生效**）

| 步骤 | 结果 |
|---|---|
| 装包 | `@deepseek-ai/dsh-experimental-agent-team@0.1.5-rc.2` + `-tool-agent-team@0.1.5-rc.2`（均无 `dsh.bundle`，故按官方 warning 为普通依赖，需手工插行） |
| 宿主行 | `cordis.patch.yml` 新增 `agent-team` 行，`maxMembers: 4`；注释记录了取 4 的依据与 `maxMembers` 的语义（读包本体核实） |
| 同步预设 | 三文件覆盖 + **SHA256 逐文件核对一致**；改前备份 `.bak-20260911_092912` |

**预检 5/5 全过**：① YAML 合法（2 个 insert 块）② `package.json` 合法、两包可解析 ③ `dump-config` 581 行无可疑错误 ④ bundles 7 个无重复 ⑤ 预设 SHA256 一致。

**挂载校验**（用临时 Cordis 探针调 `agentPresets` 真实 API，验完已 `undefine`）：
- `list()` → `projection` 在同步后路径、`broken: null`
- `standingKeyFor('projection')` → **`mounted OK`**
- `compositionInventory()` → 27 行全部 `enabled`，`tool-agent-team` 的 `fiberState: 2`
- `team_task_list()` → **`{"tasks":[]}`（真活着）**
- `Service.listService` → **`agentTeams` 在服务目录中**（"backed by the exact live Lead Session log"）

> ⚠️ 注意：`standingKeyFor` 报 `mounted OK` **不能单独证明** `tool-agent-team` 激活（预设 README 自己记录过「缺 host 行时仍报成功」）。故本轮用 **`fiberState` + `team_task_list` + 服务目录**三路交叉确认。

### 二、**本仓 ADR-0056 的代码论断已独立复核**（该项原为「未验证」）

装包后直接读 `@0.1.5-rc.2/lib/index.js`：

| ADR-0056 原断言 | 复核结果 |
|---|---|
| 默认上限 8 | ✅ `L1594 DEFAULT_MAX_MEMBERS = 8` |
| 创建时检查 | ✅ `L564 state.members.length >= this.maxMembers` → `TEAM_MEMBER_LIMIT` |
| **无任何移除路径** | ✅ `members.splice/pop/shift/filter` **命中 0 处** |
| **失败的创建也占名额** | ✅ **且机制比原说法更严格**：`L561-570` 先把成员以 `phase:"provisioning"` **落盘**，`L572+` 才真的 spawn；失败走 `settleProvisioning`（`L708-721`）**只追加新版本把 phase 改成 `"failed"`，不移除条目** |

包 README 亦独立佐证：`maxMembers | 8 | Maximum teammates a team may ever create, **including failed ones**`。

### 三、**P0 在真机复现**（比代码阅读更强的证据）

在**运行中的** DSH 进程里：

```
read_shadow({mode:"toolset", need:[...]})  →  返回 `_index.md` 目录（不是台账）
Tool.listTools 的 read_shadow schema      →  含 v1.15.9 的 install/survey/category
                                              **不含**本版的 need；mode 描述里**没有 toolset**
```

⇒ 运行中的插件是 **v1.15.12**（F1 仍在其中的那一版），**P0 按原样发生**。这是 ADR-0057 里 F1 最强的一条证据。

### 四、**两种加载行为并存**（重要的运维事实）

| 平面 | 热加载？ | 证据 |
|---|---|---|
| host 组合行 + 新装的包 | ✅ **是** | 加行装包后 `agentTeams` **立即**在服务目录、`team_task_list` **立即**可用 |
| 插件自身的 `dist/` | ❌ **否** | live schema 与行为仍是旧版 |

⇒ **改 dsh-shadow 的插件代码必须重启 DSH**；改 host 组合行不一定。已写进 ADR-0057。

### 验证

- 预检 5/5；预设 SHA256 三文件一致；`standingKeyFor` OK；`team_task_list` 可用；`agentTeams` 在目录。
- 探针插件为**临时**用（`cordis_define`/`cordis_run`），取证后已 `cordis_undefine`，未留残余。
- 提交并推送至 `origin/main`（`509b9ea..a77cfba`，v1.15.13–16 四个版本）。

### 未验证（诚实标注）

- **本版插件修复在真机生效后的端到端返回**——需重启 DSH，本轮未做（重启会终止当前会话）。
- 真机 `semble` / `zg`（本机均 ENOENT）。
- `maxMembers: 4` 的**运行时拦截行为**仍未实测（需真创建 5 个 teammate）。


## [v1.15.16] 多粒度检索层形态：路由已存在 + 实测否证全量扇出（ADR-0060）

用户 2026-09-11 设想：**「向量化库多弄几个，片段超大/大/中/小，每次找回从这些库中都找一遍。」**
动手前先做文献裁决 + 本系统真语料实测，得到**一个改变问题性质的事实**。

### 一、**现有实现已经是「路由」，不是「扇出」**

```
core/types.ts:35        indexEngine?: { provider?: "fs" | "zg" | "semble" }   ← 单值
core/index-engine.ts:47 const provider = config?.indexEngine?.provider || "fs";
                        if (provider === "zg") { ... } if (provider === "semble") { ... }
```
工厂按配置路由到**恰好一个** provider。⇒ 用户的设想**不是「加能力」，而是对现有设计的退步**。

### 二、真语料实测（新增 `tools/retrieval-eval.ts`）

把调研标注为「属组合推理、**非论文结论**」的那条（无阈值检索器 + 扇出）变成**测量**：
语料 = 真 `.shadow` 1500 条；检索器**按 ADR-0054 实测性质建模**（Semble 无阈值、无负信号）；同候选预算；3 个种子报极差。

| 策略 | recall | 均返回 | **离题噪声** |
|---|---|---|---|
| A 单库·有阈值 | **0.358**±0.033 | 3.57 | **0.000** |
| B 单库·**无阈值** | 0.358 | 5.00 | **1.000** |
| C **扇出2库·无阈值**+RRF（用户设想） | 0.347±0.053 | 5.00 | **1.000** |
| D **路由·有阈值+弃权** | **0.358** | 3.57 | **0.000** |
| E 扇出2库·有阈值+RRF | 0.347±0.053 | 5.00 | 1.000 |
| F 单库·二元组·有阈值 | 0.344±0.060 | 5.00 | 1.000 |

**四条读数**：① 「无阈值」**一个**性质就足以灌满噪声（1.000 vs 0.000），扇出只是**乘以库数**；② 扇出**即便含互补来源也不升召回**（0.347 vs 0.358，对单·二元组仅 +0.002，落在 ±0.053 内）；③ **阈值强弱因检索器而异**（二元组 1.000 vs 词 0.000）→ 每来源须各自标定；④ 最差即无阈值扇出。

### 三、Decision

- **不做**无阈值全量扇出；**多粒度若做**，形态是**单索引 + 层级表示**（`level`/`parent_id`，只索引最细层，命中沿 parent 上取），不是「建 N 个库」；
- **加判别层（重排器）优先于加库**（2606.28367）；
- 路由优先用**简单基线**（2607.24010）；
- 多来源时**每个来源各自标定阈值**（SSCC；实测已证阈值强弱因检索器而异）；
- **ADR-0001 / 0043 / 0054 的定位不变**——向量层仍是 ADR-0001 Notes 说的**增强层**、ADR-0054 说的**检索层非裁决层**。

### 四、两处引用陷阱（防以后写错）

- 「**small-to-big / parent-document / auto-merging retriever**」**没有原始论文**（名字来自 LangChain 工程文档）→ 学术等价物是 RAPTOR / HiChunk / UMG-RAG / HeteRAG；
- 「**Markdown heading 切块**」**无任何论文**（最大空白，只能自己实验定）。

### 五、**产品方向待用户裁决**（本 ADR 未单方面推翻任何既有 ADR）

用户原话「每次从这些库都找一遍」被实测与文献**双重反对**，但这是产品方向，须用户拍板：① 按证据改（推荐）② 装机后用同一工具复测再定 ③ 仍按原设想（本 ADR 记录「用户决策，证据反对」）。

### 验证

- `tools/retrieval-eval.ts` 可复现（确定性 PRNG、多种子、同预算）；`npm run eval:retrieval` 已加。
- 实验过程中**修掉两处自己的方法学缺陷并记入代码注释**：① off-topic 查询最初用两条真实文档的词拼接 → 「正确答案为空」不成立；② 收紧「2-gram 全局频率 ≤1」→ **一条都构造不出**（常用 2-gram 遍地都是），已回退并记录。
- `npx tsc` clean；全量回归 30 个测试文件全过（本次为工具 + 文档，未改运行时行为）。

### 未验证（诚实标注）

- 检索器是**按已实测性质建模**的，**不是**真实向量模型；本机 semble / zg **均未安装**（ENOENT），**未跑真实向量检索**。
- 查询是「部分线索」式（3 token），**非自然语言问句**；recall 绝对值只在本设定下有意义，**不可外推**。
- 只测 RRF 一种融合（凸组合 CC 未对照）；**未测重排层增益**（本仓无重排器，「先重排」引自文献）。


## [v1.15.15] 引用漂移检测（双条件）+ 修两处假「证据失效」（ADR-0059）

用户 2026-09-11 目标之一：**「管理本地知识库的可供 agent 执行的真相和纠正漂移」**。先做文献裁决 + 在自己的真语料上量事实，再动手。

### 一、先量事实：表面 40.8% 的「证据失效」里，绝大多数是假的

对 `.shadow` 全库（6465 个记忆）跑 `evidencePathsOf → isPathLike → fsExists`（**召回路径上真正用的那条链**）：

| 阶段 | 可解析 | 判「缺失」 | 占比 |
|---|---|---|---|
| 修复前 | 1489 | **1025** | **40.8%** |
| 修 F1（绝对路径）后 | 2255 | 267 | 10.6% |
| 再修 F2（目录）+ 双条件后 | — | **226** | **9.0%** |

⇒ **约 76% 的「证据失效」判定是假的。**

### 二、F1（真 bug）：绝对 locator 被拼上工作区前缀

`fsExists` **无条件**做 `${ws}/${rel}` → `D:/project/wslc1/x.ps1` 变成 `D:/project/dsh1/D:/project/wslc1/x.ps1`（双前缀，必然不存在）。
实测：`D:/project/dsh1/vendor/dsh-shadow/package.json`（**磁盘上确实存在**）被判 `false`。
**后果**：语料里常见的跨项目绝对路径证据被一律判失效 → 召回里 `score × 0.5` + `stale=true`、`mode:"context"` 报「已过时」——**假漂移**。
**修复**：新增 `isAbsoluteLocator`（`evidence/paths.ts`，**单一来源**；`core/semble.ts` 的 `absolutizeLocator` 一并改用它，消掉两处各写正则的漂移风险）。

### 三、F2（同类真 bug）：目录引用被判缺失

`readText` 对目录必失败 → 引用**存在的目录**被判失效（实测 `D:\project\wslc1` 11×、`D:\project\dsh1\vendor\dsh-shadow` 8×）。
**修复**：`readText` 失败后补一次 `listDir`。
**依据来自读真实源码**（`@deepseek-ai/dsh-fs-local/lib/index.js`）：`readText(目录)` 抛 `FS_NOT_REGULAR_FILE`(:341) / `listDir(目录)` 成功 / `listDir(不存在)` 抛 `FS_NOT_FOUND`(:277) → 兜底正确。

### 四、检测判据：**双条件**（借 CASCADE / FSE 2026 的思路）

> 只有 **① 引用是「可检查的具体路径」** 且 **② 确实解析不到** 才判失效。

新增 `isConcreteLocator` 排除**通配符**（`scripts/*.ps1`）与 **git ref**（`origin/main`）——「通配符还在不在」不是良构问题。
接入 `observer/arbitrate.ts`（`conflictOf`，驱动召回降权）与 `core/context.ts`（`refPathsOf`，驱动「已过时」标记）。
> `isPathLike` **故意不收窄**：它服务粗筛，收窄会改变既有调用方的候选集。

### 五、**不做自动纠正**（证据反对）

| 排除 | 依据 |
|---|---|
| 让 LLM 判「哪条过期」 | 余弦相似度分辨「被推翻」vs「换个说法」**AUROC 仅 0.59**（[2606.26511](https://arxiv.org/abs/2606.26511)，近随机） |
| LLM 自动纠正 / 解冲突 | 误纠正率主导 **53–94%**（[2605.27559](https://arxiv.org/abs/2605.27559)）；Huang（ICLR 2024）无外部反馈时**性能反降**；Kamoi（TACL 2024）**无任何工作证明提示式自纠能成功** |
| 裸用 LLM 检测文档-代码漂移 | DocPrism（**ISSTA 2026**）：**flag rate 98%**，加约束后降到 14% |

**本仓既有设计被证据正面支持**：`DriftReport` 只答「有无违反边界」且明确≠现实断言、`Mutation = LLM 只能读+总结，永不 create fact/关系`——**本轮不改**。

### 六、测试侧发现：两处 mock 不忠实

修 `fsExists` 后 `missing-dependency` 与 `recall-attribution` **先红**。查证是 **mock 不忠实**：其 `listDir` 对不存在的目录返回 `[]` 而不抛，与已核实的真实契约（抛 `FS_NOT_FOUND`）不符。已按真实源码修正两处 mock。
> 通用教训：**mock 与宿主契约不符时，测的是 mock 不是系统**（本仓 v1.15.2 踩过同类）。

### 验证

- 前后对照数据：**1025 → 267 → 243**（非单点断言）。
- 新增 `test/evidence-absolute-path.test.ts`（10 组断言，含「修复前为红」的回归）。
- 端到端：`conflictOf` 对存在的绝对路径 `missing=[]`（不降权）、对不存在的仍正确报出。
- `npx tsc` clean；**全量回归 30 个测试文件全过**。

### 未验证（诚实标注）

- 真机 DSH 内 `host.fs` 的 `resolve` 语义（测试用 `node:path` + 真实磁盘模拟）。
- 其余测试的内存 fs mock 是否还有别处不忠实（本轮只修了被暴露的两处）。
- **残余 9.0% 未解析**，主体是跨项目相对路径（如 `scripts\wslc-utils.ps1` 来自 wslc1）——需「跨项目根注册」，本轮不做。**不靠猜基线**（猜已被证伪两次）。


## [v1.15.14] 工具台账扩源：程序化核验 + 按名字猜包 ID 被证伪（ADR-0058）

用户 2026-09-11：**「现在的工具集不够，去论文 github 上继续找」**。ADR-0055 曾**否决**「台账用外部数据源」——本轮先核实那条否决是否仍成立，再扩。

### 一、外围核验：哪些源能用（全部本机实测）

| 源 | 实测 | 适用 |
|---|---|---|
| **`winget show`（本机 CLI）** | ✅ 直接给 版本/发布者/绰号/描述/主页/**许可证**，且查的是本机实际源 | **首选：核验 + 取版本 + 取许可证** |
| winget-pkgs raw manifest | ✅ MIT；**但路径含版本号，不知道版本就拼不出**（`ripgrep`/`jadx` 实测 404） | 读 manifest 原文 |
| winget CDN `source.msix` | ✅ **20,230,433 字节**、`Last-Modified: Fri, 11 Sep 2026 00:00:20 GMT`；解出 `Public/index.db`（**41,680,896 字节** SQLite，**14,816 个包**） | 一次性**全量候选发现** |
| ScoopInstaller/Main bucket | ✅ Unlicense | 补 Windows 二进制名 + license |
| Repology API | ✅ 123 repo，**确认 `has_winget=False`** | 仅 Linux/WSL 侧 |
| **`api.winget.run`** | ❌ **冻结在 2023-03-16**（fzf/ripgrep/neovim 的 `UpdatedAt` 全是 `2023-03-16T14:34:1x`） | **已废** |

### 二、核心纠错：**按名字自动解析包 ID 是错的**（实测证伪）

CDN 索引解出后按 moniker/命令/名称/ID 后缀自动解析，**立刻产出假阳性**：

| 工具名 | 自动猜到 | 真实 |
|---|---|---|
| `xh` | `Mozilla.Firefox.xh` @ 155.0.1 ❌ | `ducaale.xh` @ 0.26.2 |
| `delta` | `eToro.Delta` @ 2026.1.0 ❌ | `dandavison.delta` @ 0.19.2 |
| `nix` | `ADInstruments.LabChart...OxfordOptronix` ❌ | — |
| `choose` / `ack` / `sad` / `maven` / `sox` / `dog` | 各为无关包 ❌ | — |

**根因**：winget 包 ID 是 `<Publisher>.<Package>`，同名不同物极多，后缀匹配把无关包的尾巴当命中。
⇒ **包 ID 由人裁决（`tools/toolset-seed.json`），机器只做①核验 ②候选发现（列候选供裁决，绝不自动选）。**

### 三、扩源结果

| 项 | 前 | 后 |
|---|---|---|
| 台账总数 | 50 | **107**（2 provider + 105 reference） |
| 分类 | 13 | **17**（新增 容器与编排 / 安全与供应链 / 文档与转换 / 媒体处理） |
| 带许可证 | 0 | **57** |

新增 `tools/winget-verify.ts`（**locale 无关**解析：不按「版本:」/「Version:」标签匹配，改用「值像版本形状」+ 首行 `[ID]` 锚点）+ `tools/winget-verify-seed.ts`。**57/57 核验通过**。

### 四、拐点口径澄清（避免误用证据）

最硬的证据 [arXiv:2606.30317](https://arxiv.org/abs/2606.30317)：「tool-selection accuracy drops below 90% between **10 and 15 tools per context**」。
**关键限定**：量的是**每次请求注入 prompt 的工具 schema 数**，**不是目录条目数**。
⇒ 台账**不进上下文**（是按需读的查表），故**可以扩**；**必须保持小的是「模型面前可调用的工具面」**；**禁止把台账条目暴露成独立工具**。

### 五、顺带修一处**静默丢弃**

`tool()` 辅助函数的 `note` 参数只在「无 winget 包」分支被用，**有包分支把它整条丢掉** → 传进来的许可证/坑说明**无声消失**。已改为拼接，并新增第 11 参 `verSrc` 区分版本出处（`"实测"`=本机跑出来 vs `"权威核验"`=来自 `winget show` 目录，**不代表本机已装**）——否则「实测」会说谎。

### 验证

- 台账自洽：107 项、0 重复 id、0 undefined、17 分类全部登记进 `CATEGORY_ORDER`、probe 无空参数。
- **双向棘轮**：101 个 winget ID 台账↔文档全部对齐（扩源时棘轮**先红后绿**，证明它有效）。
- `npx tsc` clean；**全量回归 29 个测试文件全过**。
- 核验器单测：中/英文界面的 `winget show` 输出解析结果一致；「未找到」正确识别。

### 未验证（诚实标注）

- 新条目 `probe` 旗标在真机（多数工具本机未装，只会显示「未检出」）。
- `winget show` 解析在**其他本地化**（非中/英）下的表现。
- 无 CI 自动跑核验（依赖网络与本机 winget）。


## [v1.15.13] 委派 × 工具集接缝：修 P0「toolset 不可达」+ 能力预检（ADR-0057）

用户 2026-09-11：**「agent-team 和工具集要整合、配合，缺一不可」**。整合前两块**零功能交叉**（全仓 grep 证实）。调查中先挖出一个**潜伏三个版本的 P0 缺陷**，再落地接缝。

### 一、P0：`mode:"toolset"` 是死代码（修复）

`query/reads.ts` 定义了 `toolset` ReadQuery，但 **`readQueries` 数组没有把它放进去**。`dispatchReadQuery` 找不到它 → `{mode:"toolset"}` 落到 `query.ts` 的「无 topic」分支 → **静默返回 `_index.md`**。整块台账**没有任何可达入口**，而 README / CONTEXT / ADR-0055 全把它写成现行入口。

| 项 | 结论 | 证据 |
|---|---|---|
| 缺陷存在 | `findReadQuery({mode:'toolset'})` = **MISS** | 已注册 11 个 mode，无 toolset |
| 潜伏起点 | v1.15.9 加入当天即未挂上 | `git log -L 238,238:query/reads.ts` |
| 为何三个版本全绿 | 三个 toolset 测试**全部直接 import 执行函数**，从不走 dispatch | **断的是接线，不是执行** |
| 修复 | `readQueries` 补 `toolset`（+ `index.ts` mode 描述补登记） | 12 个 mode 全可达 |

**新增 `test/toolset-dispatch.test.ts`**，纪律是**只走真实入口 `dispatchReadQuery`**，含双向棘轮：正向（`{mode:"toolset"}` 必须被接住）+ 反向（**可 dispatch 的 mode 必须在 `index.ts` mode 描述里登记**，防「接得上却说不出口」）。已**回档复验**：改动前该断言红、`findReadQuery` = MISS。

> 通用教训：**测试若绕过真实入口，就测不到接线的断裂**。seam 类重构必须留一条走真实入口的测试。

### 二、接缝：能力预检（ADR-0057）

- **`findCapabilities(need)`**（`core/toolset.ts`）：按能力需求反查台账。匹配面 = `id` / 二进制名 / `label` / `provides` / `category`，词边界 + 别名归一（`fdfind→fd`、`batcat→bat`、`ripgrep→rg`、`z→zoxide`…，与 WSL 棘轮 ALIAS 同源）。**不是能力评分**，不排优劣、不给主体打分（inv 179/184）。
- **`precheckCapabilities()` / `renderPrecheck()`**（`core/toolset-exec.ts`）：`read_shadow({mode:"toolset", need:[...]})`。**只读**，未命中不编造命令。
- **输出固定带三条硬边界**，由测试锁住：① **不是闸门**（reference 不影响插件行为）② **装完本会话不可见**（宿主 PATH 是启动时快照，同进程 teammate 同样看不见）③ **缺件只能上报、不能自装**（审批凭据是发起者，自装撞 inv 182）。
- **persona ② 补一句**派活前预检（preset 平面只加纪律，闸门仍在 host）。

### 三、一个关键的硬约束（F2）

`installCapability` 早已写明：**宿主进程的 PATH 是启动时快照，新装的工具通常要重启宿主才可见**。而委派的 teammate 是**同进程内的子 Agent**。
⇒ **「预检 → 缺件先装 → 再派」这条最自然的整合链路，在单会话内收益为零。** 预检的价值是让你**提前知道走哪条降级路径**，不是让你先装。这条已写进输出（不只在文档里）。

### 四、顺带修掉一个**恒红的测试**

`test/toolset-catalog.test.ts` ④ 原断言「**本机应有已检出的 provider**」——把**某台机器的安装状态**写死进测试。本机 zg/semble 实测均 ENOENT，该断言**恒红**；而一条永远红的测试会**掩盖以后真正的失败**。改为与机器无关的不变量（默认巡检必须真的探过 provider，`available` 不得为 `null`）。用 `git stash` 回档确认它在本次改动前**就已恒红**，排除「我引入」的可能。

### 验证

- `npx tsc --noEmit` + `npx tsc`：**clean**。
- 全量回归 **29 个测试文件全过**（新增 `toolset-dispatch` / `toolset-precheck`）。
- P0 回档复验：改动前 `findReadQuery({mode:"toolset"})` = MISS，改动后 HIT。

### 未验证（诚实标注）

- 真机 `read_shadow({mode:"toolset", need:[...]})` 的**端到端**返回——测试走的是 `dispatchReadQuery` 层，未经过 DSH 工具调用栈。
- 本机无 zg/semble，预检的「多命中短路」在**已装**状态下未经实测（只在未检出状态验过）。
- **F2 的实测复现**（装了工具但本进程看不见）未跑：会真的安装软件；代码依据是 `installCapability` failed 分支注释与 ADR-0055 §4。


## [v1.15.12] 缺陷清扫：修 5 项真缺陷 + 2 处记账勘误（其中 1 项既有 bug 被本轮激活）

用户 2026-09-10：**「所有发现的缺陷都要fix」**。先把散落在 CHANGELOG / ADR / 代码注释里的「记账未修 / 已知缺口」逐条**查证当前是否仍存在**（不凭记账动手），再分类处置。

### 查证结果（16 条候选 → 5 真缺陷 + 2 记账勘误 + 若干设计取舍）

| # | 记账 | 查证结论 | 处置 |
|---|------|----------|------|
| A1 | `continuity/engine.ts` 自造 `FsTarget` | **真缺陷**（仍在） | ✅ 修 |
| A2 | `projectionStore.invalidate` 零调用点 | **真缺陷**（仍在） | ✅ 修 |
| A3 | `fs.writeText` 只传 2 参 | **非缺陷**（契约允许省略） | 📝 勘误 |
| A4 | Team 工具静默缺口 | **真缺陷**（结构性，仍存在） | ⚠️ 部分修 + 待决策 |
| A5 | `HOST_BASELINE` 与 `package.json` 双源 | **真风险**（可漂移） | ✅ 加棘轮 |
| B6 | `docs/toolchain-wsl.md` 未做棘轮 | **真缺口** | ✅ 修 |
| C7 | `delegation/guard/revocation-guard.*` 「孤儿文件」 | **记账错误**（测试在用） | 📝 勘误 |

### A1. `continuity/engine.ts` 自造 FsTarget（真缺陷）

`readWorkspaceContext` 里 `fs.listDir({ targetKey: base, displayPath: base })` —— **字面构造**违反 dsh-fs 契约（`resolve()` 注释：*"returns the stable target; the same file yields the same `targetKey`"*；`targetKey` 是 branded 值，不是随手写的路径字符串）。同一函数第 66 行本来就用对了 `fs.resolve(...)`，这次把不一致消掉。
**为何此前没炸**：local 后端恰好拿路径当 key；**sandbox / 隔离后端下 key 不是路径**，会静默失败，而该函数的 `catch` 把它吞成「无记录」。

### A2. 投影缓存不感知源变化（真缺陷）+ 一个被激活的既有 bug

两处修复：

1. **`invalidate` 零调用点** → 在 `ensureIndex`（写侧索引重建后，= 「记忆集已变」的权威信号）调用新增的 `invalidateProjection()`。
2. **`shadow_query` 不经过 `ensureIndex`**（已核实：`ensureIndex` 只在读无 topic 索引时触发）→ 给 `loadOrBuildProjection` 加**源指纹**参数：`shadowSourcesFingerprint()` 用 `FsDirEntry` 的 `size`/`version` 对「记忆日期目录 + `resources/`」取指纹，写进 `.shadow/shadow-index/sources.fingerprint`，两侧可判定且一致才用缓存，否则保守重建。**刻意不纳入 `_meta.json`/`_index.md`/`query-log`**——读操作会写它们，纳入会「读一次就自激失效」。

**顺带修掉一个既有真 bug（本轮激活的）**：`createJsonlProjectionStore` 的 `abs()` 返回 **`.displayPath` 字符串**，却被当 `FsTarget` 传给 `writeText`/`readText`。该 bug 长期隐藏（`invalidate` 零调用点）；一旦写侧开始调用它，mock/沙箱后端上就炸成 `undefined.displayPath` → 污染 fs 层 → **`listDir` 抛错 → `listMemories` 被自己的 catch 吞成空** → 测试立刻变红（`missing-dependency` 的「路径不存在应 not_found」失败正是这条链）。改为返回 `resolve()` 产出的对象。

> **自我批评**：本轮 A2 的第一版还写错了语义 —— 让「不传指纹的调用方」**永不命中缓存**，把性能特性变成纯开销（`projection-store.test.ts` 当场变红）。已修：**不传指纹 = 保持旧行为**。这两次都是**测试先红、再定位**，不是靠读代码看出来的。

### A3. `fs.writeText` 只传 2 参 —— **不是缺陷**（勘误）

> **⚠ 勘误（v1.15.31 / ADR-0074）：本条结论已被真机实测推翻。** 省略 `sandboxPolicy` **不是**
> 「用当前会话策略」，而是用**部署 fallback**（`workspaceRoot = **process.cwd()**`）。
> 「省略是契约允许的」这句仍然成立（*"Omit to leave the backend its own default."*），
> 但**「backend's own default」≠「调用方的会话策略」** —— 两者无关。会话工作区 ≠ 服务进程启动目录时，
> 写入**必被围栏拒绝**（实测：`.shadow/` 一条都落不了盘，而该会话策略其实是 `danger-full-access`）。
> 原文保留以便追溯；现行口径见 **ADR-0074**。

契约原文（`dsh-fs-sandbox` 的 `writeText` JSDoc）：

- `expected … **omit for unconditional**`
- `sandboxPolicy … **omit to use the deployment fallback**`

⇒ 省略是契约允许的；省略 = 用部署 fallback（当前会话策略）。失败会抛**结构化 `FS_SANDBOX_DENIED`**，且本项目已有可见信号（`lastFlushError` → `flushWarn` → `read_shadow` 显示「落盘失败」）。**故 v1.15.1 / v1.15.3 把它记成「记账未修」属措辞不当**，本轮更正为「已核实非缺陷」。

### A4. Team 工具静默缺口（真缺陷，**结构性**）

`tool-agent-team` 行 `inject: [..., "agentTeams"]`，host 未提供该服务时该行停在 PENDING，**9 个工具静默不出现**，而 `standingKeyFor` 仍报挂载成功（与 ADR-0049 相悖）。

**可靠修复只有两条**，都超出本轮可擅自决定的范围：
- (a) 把 `agent-team` host 行纳入 **dsh-shadow 自己的 bundle patch** → 缺包会在 bundle 加载时**报错**（可见）。**代价**：dsh-shadow 从此依赖一个**实验包**，改变其「零宿主依赖」定位。
- (b) upstream 改进 `inject` 语义（我们无法控制）。

⇒ 本轮做**能立即做的实质缓解**：preset ② 明写「**若 `spawn_teammate` / `send_message` 不在你的工具表里**，说明宿主未提供 Team —— 直接改用 subagent / subagent_fork / workflow，**别等也别硬找**」，把「静默卡住」变成「agent 可感知的降级」。(a) 待用户决策。

### A5. `HOST_BASELINE` 双源 → 加防漂移棘轮

`index.ts` 的 `HOST_BASELINE` 常量与 `package.json` 的 `engines.dsh` 是两处独立来源。本轮**不改结构**（读 package.json 需 ESM import attributes，风险大于收益），改为**棘轮锁一致性**：`host-probe.test.ts` 新增 ⑥，两处不一致即红。

### B6. `docs/toolchain-wsl.md` 纳入棘轮（补 ADR-0055 的已知缺口）

新增棘轮 ⑦：解析 WSL 文档**「工具映射总表」**（**只扫该段**——文档里还有「国内镜像」表，第 2 列是 URL，第一版误扫导致 8 个假阳性），提取工具名，要求**每个都能在台账找到条目**（按 bin/id/label/provides 词边界匹配 + 别名表 `fdfind→fd`/`batcat→bat`/`z→zoxide`/`sg→ast-grep`）。

为此**补登 7 个台账条目**（44 → 50）：`tldr`(`tldr-pages.tlrc`)、`lazydocker`(`JesseDuffield.Lazydocker`)、以及 **Windows 无可靠包的 4 个**（`tmux`/`viddy`/`tig`/`ip`+`ss`）——后者的 `install` **留空**、`remedy` 只陈述事实（**宁缺勿编**，并已在 Windows 文档标注平台差异）。

### C7. 更正：`revocation-guard` 不是孤儿（勘误）

v1.15.3 记「`dist/delegation/guard/revocation-guard.*` 两个孤儿文件」。查证：**`test/concept-guards.test.ts` 在导入它**（`notRevoked` / `notExpired`）。当时的 grep 只扫了源码、漏了测试。**不是孤儿，不该删**。

### 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0；**全量回归 27/27 `ALL PASS ✅`**。
- 新回归锁：`projection-store.test.ts` 增块 5（**FsTarget 契约**：save/load/invalidate 一律传 `resolve()` 产出的对象）+ 块 6（源指纹：一致→命中 / 变化→重建 / 取不到→保守重建 / **不传→旧行为**）；`host-probe.test.ts` 增 ⑥（HOST_BASELINE 防漂移）；`toolset-catalog.test.ts` 增 ⑦（WSL 清单棘轮，37 个工具全覆盖）。
- 台账 50 项（provider 2 + reference 48）；棘轮 7 项全通过。

### 边界与未验证

- **A4 未彻底修**（见上，需决策）：静默缺口在「host 无 agentTeams」时**仍然静默**，本轮只让 agent 可感知降级。
- **源指纹的降级点**：同尺寸内容修改且后端不报 `version` 时，指纹不变、缓存不失效（已在代码注释与 ADR 注明）。需要绝对新鲜时删 `nodes.jsonl` 或关 `projectionStore`。
- 本轮**未**真机验证 `projectionStore` 开/关下的真机行为（本机无 `.shadow/`；验的是测试与 mock）。
- 台账各 reference 条目的 probe 旗标正确性仍未逐项验证（失败只会显示「未检出」，不误报可用）。




## [v1.15.11] 委派规模与复用优先（teammate 名额硬上限 4 + 往返纪律）+ 补写漏掉的 ADR-0055

用户 2026-09-10：**「投影模式中的 Agent Team 一定要控制子代理的规模，因为 token 消费太大」**。本轮按 `/grill-with-docs` 逐层追问定案（先查代码再问、一次一个问题）。

### 逐层定案的结论

「规模」一词被拆成四个互不相同的量（成员数 / 往返轮数 / 提示词规模 / 并行度），用户选定 **A 成员数 + B 往返轮数**。

**先纠正一个前提**：v1.15.4 写的「**优先 Agent Team**」是**错的**——同版已核实「换 Teams 更省」不成立（`fresh`/`fork` 两轴同构，而 Teams **多付** `team:policy` + 9 个工具 schema，**每成员每请求**）。故「优先 Team」在**只用一次**时是**净亏**。判据改为「**复用优先**」。

### A. 成员数硬闸门：host 行 `maxMembers: 4`

**查实它是「per-session 终身累计」上限，不是并发上限**（读上游代码，非文档）：

| 证据（`dsh-experimental-agent-team/lib/index.js`） | 含义 |
|---|---|
| `L564` `state.members.length >= this.maxMembers` → `TEAM_MEMBER_LIMIT`，**在创建时检查** | 数的是**曾经创建过**的成员 |
| `L1244` 只 `push`（新）/ `L1245` 就地更新 | — |
| **`members.splice/pop/shift/filter/delete` → 0 处** | **无任何移除路径**，roster 只增不减 |
| `L563` 重名抛错 + README「即使**创建失败**的 teammate 也保留其名字」 | **失败也吃名额，名字永久占用** |

⇒ 4 = **该会话最多只能创建 4 个 teammate，永久不能释放**。取 4 的依据：覆盖本预设自己的最大显式需求（① 审查 2 视角 + 实现 1 + 调研 1）；撑爆时**降级优雅**（抛错 → Lead 自己做），不是卡死。
**已知残余风险**：4 对失败创建**无余量**，实测过紧就调 6。

### B. 往返纪律（写入 persona ②，无硬闸门）

| 纪律 | 依据 |
|---|---|
| **一次委派 = 一条消息**（做什么/约束/验收/输出一次给全） | 每条 peer 消息**永久进对方历史**，此后每次请求重发 |
| 同一委派往返 **≤2 轮**（首发 + 纠正），超出自己接手 | 防无限 ping-pong；与 ④「零分栏退回重派」相容 |
| 优先唤醒 `running`/`idle`，**避免 inactive 冷恢复** | 冷恢复先复用持久对话再追加，**等于重付整段历史** |

### 名额耗尽不是死路（写进 ②，避免 Lead 误判）

`dsh-tool-workflow` / `dsh-workflow-worker-thread` / `dsh-tool-subagent` 三包对 `agentTeams` 引用均为 **0 处** ⇒ **不吃名额**。故仍有三条路：自己做 / `subagent` / `workflow` 扇出。

### 补写 ADR-0055（缺陷修复）

v1.15.10 在 `CONTEXT.md`（×2）、`README.md`、`core/toolset.ts` 共 **4 处**引用了 `ADR-0055`，**但该文件当时漏写**——悬空引用。本轮补写 `adr/0055-toolset-ledger.md`（工具集台账两级 / 文档棘轮 / 不做代装 / 探测三态）。这正是本仓 ⑥「四查」要防的「遗漏 + 注释断链」。

### 落地

| 文件 | 改动 |
|------|------|
| profile `cordis.patch.yml`（**部署面，不在本包**） | `agent-team` 行加 `config: { maxMembers: 4 }` + 写明「终身累计而非并发」的依据与残余风险 |
| `agent-presets/projection/agent.cordis.yml` | ② 重写为「规模与复用」 |
| `agent-presets/projection/preset.yml` / `README.md` | 描述与「Agent Teams first」节 → 「Reuse first, with a hard teammate budget」 |
| **新** `adr/0056-delegation-scale-budget.md` | 本决策的取舍与未验证项 |
| **新** `adr/0055-toolset-ledger.md` | 补上漏写的 ADR（修复悬空引用） |
| `README.md` / `CONTEXT.md` / `package.json` | 同步；版本 → **1.15.11** |

### 验证

- host 行：`dump-config` **exit 0 / 570 行**，`config: maxMembers: 4` **已被读到**，严格错误扫描 0 命中。
- persona：② 八个关键判据全中、旧句「优先 Agent Team」**残留 0**、顶层 `- id:` 仍 **16**。
- `npx tsc --noEmit` / `npm run build` exit 0；**全量回归 27/27 `ALL PASS ✅`**（本轮未改 TS 逻辑，分布不变）。

### 代价如实记账

persona **2394 → 2629 字符（+235 常驻；YAML 解析值 = 真正进 prompt 的长度）**。这是为「防止无界委派开销」付的**永久成本**——只有因为它防的是**复利式**增长才值得。已写进预设 README 与本 ADR。
> 口径说明：v1.15.4 的历史条目写的是「2053 → 2380」，那是**逐行 trim 后拼接**的旧量法；同一内容按 YAML 解析值是 2394。两条**增量都是 +235**，故结论不受量法影响。

### 边界与未验证

- **`maxMembers: 4` 的实际拦截行为未在真机触发过**（要真创建第 5 个 teammate 才能验）；`dump-config` 只证明值被读到。
- **改 host 行 config 是否需要重启**未单独验过（v1.15.4 加该行时是热生效，但「改 config」这条路径未验）。
- `maxMembers` 是 **host 级、全局生效**（作用于所有会话/所有预设）；**投影模式自己设不了**这个闸门——preset 平面只能写纪律。若将来要按预设分档，需要宿主的 per-agent team 配置（当前不存在）。
- **B 无硬闸门**：若 Lead 不遵守往返纪律，复利式烧 token 仍可能。




## [v1.15.10] 工具集台账扩为两级（provider + 通用 CLI 目录）+ 文档纳入仓库与双向棘轮

用户 2026-09-10：「类似 `wsl-cli-tools.md` 这种你都要分类收集，以及 windows 的 uutils/coreutils、skylot/jadx」→ 随后**「全部纳入，这都是保障任务的」**（即推翻 v1.15.8 时定的「台账只收 dsh-shadow 自己的 zg/semble」那条边界）。

### 做了什么

1. **台账扩为两级**（`core/toolset.ts`）——这是本轮的核心，边界必须分清：
   | 级 | 含义 | 缺它 | 例子 |
   |---|---|---|---|
   | `kind:"provider"` | **插件内接线**的可选增强 | 对应能力**降级**，读侧出现处置行 | `zg`、`semble` |
   | `kind:"reference"` | **通用开发 CLI 目录** | **不影响插件行为**；只是查得到「装什么、怎么装」 | `rg`/`fd`/`jq`/`jadx`/`coreutils`… |
   新增字段：`kind` / `category` / `winget`（结构化，供棘轮比对）/ `note`；`install` 转**可选**（没有可靠装法就**不给**，宁缺勿编）。

2. **目录内容：44 项 / 13 分类**——插件内接线 2、GNU 工具链 3、搜索与查找 4、文本与数据 6、目录与浏览 2、Shell 与终端 8、Git 3、磁盘与系统 4、网络与下载 4、版本与包管理 2、构建与任务 4、归档 1、逆向与二进制分析 1。
   - **winget ID 与版本全部本机实测核对**（`winget search`/`show`），不是照抄文档。
   - 逆向类含 **jadx**（`Skylot.jadx` 1.5.6，50,406 ⭐，Apache-2.0）。
   - GNU 工具链给出**三选一**并写明事实：**`Microsoft.Coreutils`**（5,155 ⭐，MIT，2026-05 新建、**preview**）README 原文是 *"A Microsoft-maintained build of uutils/coreutils, findutils, and grep packaged as a single multi-call binary for Windows"* ⇒ **它不是 uutils 的竞品而是微软对它的打包**，且多了 findutils/grep；另有上游 `uutils.coreutils`（24,062 ⭐，自 Ubuntu 25.10 起随发行）与 `frippery.busybox-w32`。

3. **文档纳入仓库**：`docs/toolchain-windows.md`（Windows 口径）与 `docs/toolchain-wsl.md`（用户原始 WSL 文档）→ 写进 `package.json` 的 `files`，**随包发布**。

4. **双向棘轮**（新 `test/toolset-catalog.test.ts`，6 项断言）：
   - 正向：台账每个 reference 的 `winget` ID 必须出现在 `docs/toolchain-windows.md`；
   - 反向：文档里 `winget install` **实际安装**的包必须在台账里 —— 按**命令参数语法**解析（跳过 `--id`/`-e` 等旗标，遇非包 ID token 即停），而不是全文扫「含点号的 token」（那样会把 `Apache-2.0`、版本号误收）；
   - **该棘轮首次运行即抓出我自己写错的一个 winget ID**：台账写的 `pvolkov.mprocs`，实测应为 **`pvolok.mprocs`**（文档是对的）。这正是它的价值。

5. **巡检增强**：`survey:"all"`（并行探测全部）/ `category:"…"`（单分类）；默认**只探 provider**（不白跑 40+ 外部进程）。真机实测：**44 项并行探测 1480 ms**，本机检出 7 项（`zg`/`semble`/`fzf`/`zoxide`/`gh`/`ffmpeg`/`uv`）。

6. **探测口径收紧为诚实表述**：只说「**未检出**」（`false`）或「**未探测**」（`null`），**不说「未装」**——探测方式可能不适用（该工具没有版本旗标），且**宿主进程的 PATH 是启动时快照**（宿主起来之后装的工具要重启才可见）。渲染里明写这条，并加测试断言**输出不得出现「未装」措辞**。

7. `index.ts` 工具 schema 增 `install` / `survey` / `category` 三个参数，并写明「安装仅用户显式要求」。

### 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0；**全量回归 27/27 `ALL PASS ✅`**（新增 `test/toolset-catalog.test.ts`）。
- 新测试覆盖：台账结构自洽（44 项、id 唯一、分类已登记、`probe` 非空且**不含空参数**）+ 双向棘轮 + 巡检渲染（分类分组/区分未探测与未检出/含「探测失败≠未安装」/无「未装」措辞）+ 未登记条目不编造 + **reference 条目安装同样受审批门保护且拒绝后确实未安装**（用本机确实缺件的 `rg` 验，并复探确认没被偷偷装上）。
- 修一处自己引入的 bug：`7zip` 的版本旗标留空会变成 `7z ""`（传空路径）→ `probe` 构造改为「空旗标就不带参数」，并加断言禁止 `probe` 含空串。
- 修一处自己引入的语法错：`renderSurvey` 里双引号串内又用双引号（`mode:"toolset"`）→ 改模板串。

### 边界与未验证

- **`allowed-once` → 真正执行安装器 → 重探** 这条**执行**路径仍未在单测中跑（会真装软件、改动机器）；安全门与 argv 解析分别由测试 ⑥ 与 `resolveInstall` 覆盖。
- **各 reference 条目 probe 旗标的正确性未逐项验证**——某工具若不支持该旗标，只会显示「未检出」（不会误报可用），口径已由新增的诚实表述兜住。
- `Microsoft.Coreutils` **未实际安装实测**（只核对了 winget 元数据与 README）；其 **preview** 状态未评估。
- Ghidra **winget 无包**（实测），未验 scoop/choco；`tmux` 无官方 Windows 包；`viddy` 无 winget 结果；`dive` 搜到的是同名无关工具（已在文档标注，勿混装）。
- 台账分类与 `docs/toolchain-wsl.md` **未做棘轮**（那份是 Debian 包名口径，与 winget 无对应关系）。




## [v1.15.9] 一键装入口（显式调用 + 宿主审批门）—— mode:"toolset"

承接 v1.15.8 的用户决定：**「加『一键装』入口（显式调用）」**。v1.15.8 只做到「报缺件 + 给命令」，本版补上可执行的安装入口——**但把授权交给宿主，而不是插件自己扩权**。

### 机制：审批门（这版存在的全部理由）

宿主提供了正确的机制，插件可以直接用：

```ts
ctx.approval.request({ agent, toolName, reason, signal })
  → 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'      // 只有 allowed-once 是授予
```

（宿主组合里已挂 `- id: approval` → `@deepseek-ai/dsh-user-approval`。）于是：

| 审批结果 | 行为 |
|---|---|
| `allowed-once` | 执行安装 → **重新探测** → 按真实结果报告 |
| `rejected` / `cancelled` | **不安装**，明说原因 |
| `unavailable` / 无 approval 服务 / 无 agent / 审批抛错 | **一律不安装**（fail closed），改为打印可自行执行的命令 |
| 非词表返回值（如 `"yes-please"`） | 归一为未授予，**不安装** |

这与 `approval` 服务自身的语义一致（它把异常返回值也归一为 `unavailable`）。**插件从不自行扩权**：inv 178 `Authority ≠ Ownership` / inv 182「scope 不可在执行中隐式扩大」的落点就是这里的「只有外部授予才动手」。

### 入口

```text
read_shadow({ mode: "toolset" })                  # 只读巡检：每项可用/缺件 + 处置（模型可自动调用）
read_shadow({ mode: "toolset", install: "zg" })   # 显式安装（仅用户显式要求；先申请审批）
```

- **只读巡检**与**安装**共用 `mode`、由是否传 `install` 区分，因而权限轴清楚：巡检可自动调用，安装不可。
- 已可用 → **幂等短路**（不申请审批、不做改动）；未登记能力 → **不编造命令**；装完**重探**才报结果（绝不凭退出码宣称成功，ADR-0049）。

### 落地

| 文件 | 改动 |
|------|------|
| `core/toolset.ts` | 台账加 `install`（**声明式配方**）与 `probe`：`npm-global` / `argv` |
| **新** `core/toolset-exec.ts` | `probeCapability` / `resolveInstall` / `installCapability`（审批门）/ `surveyCapabilities` / `renderSurvey` / `renderInstall` |
| `query/types.ts` + `index.ts` | deps 加**懒取** `get approval()`（与 `fs` 同法；缺失 → fail closed） |
| `query/reads.ts` | 新 `mode:"toolset"`（巡检 / 安装） |
| `test/toolset-exec.test.ts`（新） | 26 → 见「验证」 |
| `CONTEXT.md` | mode 表加 `toolset`；mode 总数 **61 → 62**（棘轮同步） |
| `test/recall-envelope.test.ts` | 棘轮 61 → 62 |
| `README.md` | 「谁能调用」权限轴加两行；「可选外部 CLI」补「一键装（显式调用 + 审批门）」节 |

### 又一个 Windows 陷阱：`npm` 也是 `.cmd`

`resolveInstall` 不能只存一条命令字符串——**`npm` 在 Windows 上只是 `npm.cmd`**，与 `zg` 完全同一类：

| 调用 | 结果 |
|------|------|
| `execFile("npm", …)` | **ENOENT** |
| `execFile("npm.cmd", …)` | **EINVAL** |

故 `npm-global` 配方在运行时解析成 `node <nodeDir>/node_modules/npm/bin/npm-cli.js install -g <pkg>`（实测 `node npm-cli.js --version` → `11.19.0`，exit 0）。`uv` 是真 `.exe`（54 MB），`argv` 配方直传即可。测试专门锁住 `zg.args[0]` 以 `npm-cli.js` 结尾。

### 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0；**全量回归 26/26 `ALL PASS ✅`**（新增 `test/toolset-exec.test.ts`）。
- 新测试覆盖：`resolveInstall` 三态（npm-global 走 node+npm-cli.js / argv 直传 / 未登记报 error）；未登记能力的探测与安装均不编造；**已可用幂等短路且不申请审批**（本机 semble 0.5.6 真实路径，断言 `asked === 0`）；**审批门六种非授予结果全部不安装**（无通道 / 缺 agent / rejected / cancelled / unavailable / 非词表值）+ 审批抛错不安装、原因可见。
- **真机只读巡检**：`surveyCapabilities()` → zg `0.2.2` ✅、Semble `0.5.6` ✅，输出「全部可用，无需处置」。

### 边界与未验证

- **`allowed-once` → 真正执行安装器 → 重探** 这条**执行**路径**未在单测中跑**：跑它会在本机真的安装、改动机器。其机械部分（argv 解析）由新测试 ① 覆盖、安全门由 ④⑤ 覆盖；**端到端执行仍属真机验收，尚未做**。
- `remedy[platform]` 与 `install` 配方目前都走 `default`，未在 macOS/Linux 实测。
- 台账仍只登记 dsh-shadow **自己的**可选外部 CLI（`zg` / `semble`）；通用开发工具（jadx 等）属另一平面，未纳入（用户 2026-09-10 确认）。
- 本机会话的审批提示是关闭的；真实审批交互（UI 呈现、`allowed-once` 的实际授予）**未在真机观察过**。




## [v1.15.8] 缺件处置：从「一句 unavailable」到「一条可执行命令」（工具集台账）

用户 2026-09-10 提「你要有一个工具集编排，以方便使用，没有就安装，顺便给用户提醒即可」。本轮**只落地其中零风险的一半**（检测 + 提示），并把不做「代装」的理由写成可引用的条文。

### 做了什么

- **新** `core/toolset.ts`：能力台账（`CAPABILITIES`：`zg` / `semble`）+ `capabilityOf` / `remedyFor` / `unavailableHint`。每项声明 `{id, label, provides, degradesTo, remedy[platform], doc}`。
- `query/reads.ts` 的 `mode:"index"` 与 `query/query.ts` 的 `verifyEvidence` 两处缺件出口接上处置行；`CandidateResult` 增 `reason`（与 Evidence Gateway 的 `provenance.reason` 同口径），zg 分支从 `provenance.reason` 取、semble 分支从 `sembleCandidates` 取。
- 顺带补一个此前的缺口：`verifyEvidence` 的每行**此前不显示 `reason`**（真机只看到 `unavailable`，无从排查）→ 现在带 `· reason=…`。
- **新** `test/toolset.test.ts`：台账自洽 / 未登记不编造 / 平台回退 / 提示含命令-原因-文档锚 / index 缺件路径端到端 / 默认 fs 无副作用。

实际输出（缺件时）：

```text
> 缺件处置：npm install -g @zvec/zvec-grep （需 Node ≥ 22；插件只用 --rg 路由，不必放开被拦下的原生依赖 install 脚本） · 提供：证据验证（verifyEvidence）与 Index Engine 的 zg 候选 · 现退到：证据验证退回 fs（只判路径存在性）、候选退回全量扫描 · 原因：zg_not_installed · 见 README「可选外部 CLI（zg / Semble）」
```

未登记的 provider（如配置写成 `gzz`）→ **不产出任何提示**（不编造命令）。

### 为什么**不**做「插件自己装」（边界，可引用）

不是工程难度问题，是本仓自身的宪法不允许：

| 出处 | 条文 |
|------|------|
| `README.md:227` 安全边界表 | 「**有后果的动作要用户确认**」 |
| `references.md:58` 引 OpenAI《Computer use》 | 「破坏性变更…要用户确认」 |
| `adr/0029-1` inv **178** | **Authority ≠ Ownership**（`can update service config` ≠ `owns service architecture`） |
| `adr/0030` inv **182** | **Delegation Scope 不可扩大**：「scope 只能由外部权威以显式协议变更，**不可在执行中隐式扩大**」 |
| `adr/0030:30` | 「**被授权执行 ≠ 被授权解释授权 ≠ 被授权扩大授权**」 |

插件自行 spawn 安装器 = **自己给自己扩权**。故采用与「resource 卡片插件只读不写」同一取向：**插件给确切命令，由 agent 经宿主 approval 栈执行**——`dsh-shadow` 自己也从不代装插件（给的是 `dsh plugin add …`）。

### 生态先例（先查是否重复造）

`awesome-dsh-plugin` 里已有同题件：**`guo6x/dsh-housekeeper`**（工具链台账：node/pnpm/git/gh/ffmpeg/浏览器 + 缓存清理）、`AngelosZou/dsh-python-env`（装时的镜像与权限）、`happpsee/dsh-desktop-app`（无管理员 Windows 工具链配方）、`863683348/dsh-need-finder` / `dsh-recipe`（需求→插件 + 整套环境 recipe）。**「工具链台账」与「装插件」都已有现成件**；真正缺的是本版补的那一环——**某个增强报缺件时，就地给出那一条命令**。

### 验证

`npx tsc --noEmit` exit 0；`npm run build` exit 0；**全量回归 25/25 `ALL PASS ✅`**（新增 `test/toolset.test.ts`）。

### 边界与未验证

- 台账目前只登记 dsh-shadow **自己的**可选外部 CLI（`zg` / `semble`）。**通用开发工具（jadx 等）不在此列**——那是另一个平面，不属记忆插件（同 ADR-0051「预设里资源侦察员的工作方式不属本 ADR」的划法）。
- 提示只在**缺件时**出现（默认 `fs` 路径零输出，回归已锁）。
- **未验证**：平台分叉（`remedy[platform]`）目前全部走 `default`，未在 macOS/Linux 实测；「一键装」入口未做（见上边界）。




## [v1.15.7] zg 集成修复（装了也用不了）三处 + 可选外部 CLI 安装指南

用户指出「不然没用」——本轮把 `zg`/`Semble` 从「插件里有分支、机器上不可用」修到**端到端可用**，并补上安装指南。`zg` 在本机**装了但插件一律报 unavailable**，根因有三个，逐个实测定位：

### ① spawn（硬阻断）：`execFile("zg")` 在 Windows 必然失败

| 调用 | 实测结果 |
|------|----------|
| `execFile("zg")` | **ENOENT** —— Node 不解析 npm 的 `.cmd` shim |
| `execFile("zg.cmd")` | **EINVAL** —— Node 自 2024 起禁止无 `shell:true` 执行 `.bat/.cmd`（CVE-2024-27980 缓解） |

所以「zg 装好、手动跑 exit 0，插件恒 unavailable」。**修法**：新增 `resolveZgInvocation()` —— 扫 PATH 定位包内 `node_modules/@zvec/zvec-grep/dist/cli/index.js`（含 Unix 的 `../lib/node_modules/...` 布局），用 `process.execPath` 起它；找不到才回退裸 `zg`（Unix 可执行符号链接）。显式覆盖 `DSH_SHADOW_ZG_CLI` **不做存在性检查**——配置写错应「可见地失败」，不得静默回退到另一个 zg。

### ② 解析：zg 0.2.2 的输出不是 ripgrep 格式

实测 stdout（精确形态）：

```text
CHANGELOG.md
  223-240 [heading Changelog > [v1.14.0] 新增第 6 个 NodeType `resource`] 231:	- **证据门同门**…
```

「**文件路径单独一行** + 缩进的 `起-止 [heading 面包屑] 行号:\t内容`」。旧 `parseZgMatches` 期望 `path:line:text`，于是**路径全丢**、行号取错。**修法**：改成状态机（不缩进行 = 路径，缩进行 = 命中），`startLine` 取**命中行号**（`231:`）而非分块范围。

**同时删掉两个兜底，它们是误报源**：旧代码在「stdout 出现 ref.path」时造一条命中——而 zg 对**不存在**的路径会打印 `missing: <路径>`，于是「路径不存在」被判成 **verified**（本机实测复现）；另一个「stdout 出现 query 就造命中」更直接，且因运算符优先级 bug 在已有命中时也会重复 push。两者都是**仅凭文本出现制造证据**，违反 ADR-0043「无证据不返回」。另修 maxBuffer 8MB（旧值 1MB 会被大仓库输出撑爆，报错看起来像「zg 坏了」）。

### ③ 语义：verify 必须按 `ref.path` 裁决，且不能用全局 top-N

`fsEvidenceProvider.verify` 的语义是「**这条路径**还在不在」。而 `zgVerify` 跑的是**工作区级**搜索、不按路径过滤 → 「别的文件命中」会冒充「该路径 verified」，把 **stale 证据判成 fresh**。

首次修法（搜完再过滤）**实测不可行并暴露第二个问题**：一次真实查询返回 **40 条命中 / 16 个文件**，`limit: 8` 会把目标路径**截掉**——目标 `core/lineage-validator.ts` 排在第 7 个文件，8 条上限下根本轮不到（实测从 verified 掉成 not_found）。**最终修法**：`ref.path` 非空时**把路径作为位置参数交给 zg 限定搜索**（`zg query --rg … <path>`），实测精确返回该文件的命中；zg 对不存在的路径返回 exit 0 + `No searchable files.` + 0 命中 → 自然落到 `not_found`/`stale`，语义正确。`ref.path` 为空（index-engine 的工作区级候选发现）时保持发现语义。

### ④ ADR-0049：失败原因原本被吞掉

`zgVerify` 把 `runZg` 的 `reason` 丢了，真机只看到一句 `unavailable`、无从排查 → 现在写进 `provenance.reason`（`zg_not_installed` / `timeout` / `index_missing` / `error`）。

### ⑤ 安装指南（README 新增「可选外部 CLI（zg / Semble）」）

- **zg**：`npm install -g @zvec/zvec-grep`（Node ≥ 22；验证版本 **0.2.2**）。写明「`zg --version` 能跑 ≠ 插件能用」及原因；写明**插件只用 `--rg`、不需要建索引**，故 npm 被拦下的 5 个原生依赖不影响本插件用法；要用 `zg index` 才需要 `--allow-scripts=…` 放开；自检走 `verifyEvidence: true`。
- **Semble**：`uv tool install semble`（验证版本 **0.5.6**）；首次检索需一次网络下模型、之后离线可用；`NO_PROXY` 方括号条目由插件自动清洗；默认只 `--content code`；要用 `.sembleignore` 才能覆盖 `.gitignore`；自检走 `mode:"index"`。
- 「都没装会怎样」：默认 `fs` 完全不碰这两条路径；配了没装 → 明确 `unavailable` + 原因，绝不冒充 verified。

### 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0；**全量回归 24/24 `ALL PASS ✅`**（新增 `test/zg-provider.test.ts`）。
- 新测试覆盖：真实两行格式解析（路径切换/命中行号/无面包屑）、`missing:` 误报回归、空/垃圾输入不编造、spawn 覆盖走 `node`（锁 ENOENT/EINVAL 根因）、覆盖写错不静默回退且不报 verified、路径语义（别处命中不冒充 / path 空保持发现语义 / 绝对相对后缀匹配）、**真机端到端两条**（存在路径 → `verified` 且 `core/lineage-validator.ts:17`；不存在路径 → `not_found`/`stale`）。
- 本机真机 zg 结果：`status=verified，1 条命中，首条 core/lineage-validator.ts:17`。

### 边界与未验证

- `zg` 与 `Semble` 仍是**可选**：不配 provider 则零行为变化。`evidenceProvider` 默认仍是 `fs`。
- **未验证**：① 本机 npm 全局安装时 5 个原生依赖的 install 脚本被拦，故 `zg index`（语义/混合检索）**未实测**——插件只用 `--rg` 不受影响，但 `zg index` 是否可用未验证；② Semble 的大仓库首次索引耗时；③ macOS/Linux 上的 zg 路径定位（`../lib/node_modules` 分支）**仅按布局推断，未在那些平台实测**；④ `dist` 运行时端到端未做（本会话载入的是重启前的 dist）。




## [v1.15.6] Semble 接为 Index Engine 第 3 个候选 provider（ADR-0054）

用户 2026-09-10 问「能否把 Semble 集成到 shadow」，选定 **A + S1**：接**候选生成**层、语料是**工作区代码**；并同意**新立 ADR 承接 ADR-0001 的口子**（不改其正文）。

### 为什么只能接候选层（实测，不是推断）

用 4 个中文记忆夹具（模拟 `.shadow/` 真实头部格式）跑 4 次查询：

| 查询 | #1 | #2 | #3 |
|---|---|---|---|
| 登录无状态的理由 | `auth` **0.009836** | `_index` 0.009677 | `db` 0.009524 |
| 订单索引 migration | `db` **0.009836** | `_index` 0.009677 | `auth` 0.009524 |
| 支付退款（语料里没有） | `db` **0.009836** | `auth` 0.009677 | `_index` 0.009524 |
| 量子纠缠/哈勃常数（无关） | `db` **0.009836** | `auth` 0.009677 | `ui` 0.009524 |

- 分数三元组**逐次完全相同**（`3/305`、`3/310`、`3/315`）⇒ 分数**不可跨查询比较**；
- **语料中不存在的话题照样返回最高分** ⇒ **无负信号**；
- `semble search --help` 只有 `-k/--top-k`、`--max-snippet-lines`、`--content`、`--include-text-files` ⇒ **无 `--threshold`/`--min-score`**。

而 ADR-0043 要求「**无证据不返回**」。**Semble 给不出「空」这个答案** ⇒ 它**不能**承担 `verify()`。这与本仓对 zg 的既有定位逐字同构：**Semble 是检索层，不是裁决层**。

（顺带修正上一轮的一处「未验证」：**中文散文检索可用**——第一行查询确实把 `auth` 排到第 1；但分差极窄，判别力弱。本轮按 S1 只索引**代码**，S2（`.shadow/` 语料）留作后续独立决策。）

### 落地

- **新** `core/semble.ts`：`stripBracketedNoProxy` / `absolutizeLocator` / `runSemble` / `parseSembleRefs` / `sembleCandidates`。**不实现 `EvidenceProvider`**（刻意：挡住「被当裁决层用」这条路）。
- `core/index-engine.ts`：`provider` 联合加 `"semble"`，新增分支（形参与 zg 并列，第三形参供测试注入）；候选流程 = `sembleCandidates` → `rankRefs` → `authorizeScope`。
- `core/types.ts`：`indexEngine.provider?: "fs" | "zg" | "semble"`。
- `query/reads.ts`：`mode:"index"` 的渲染对非 `fs` provider 统一措辞（原为 zg 专用三元判断）。
- `test/index-engine.test.ts`：新增场景 Index-Engine-2（未装 `unavailable` 不 fallback / 可用给 refs+rankRefs+**授权过滤** / `stripBracketedNoProxy` 4 例 / `parseSembleRefs` 绝对化与 4 类容错）。
- `adr/0054-semble-index-engine-provider.md`（新）；`CONTEXT.md`「关联」加一条、`index` mode 行补 provider；`README.md` 版本表；`package.json` → 1.15.6。

### 两处由实测逼出来的实现约束（都不是可选项）

1. **必须清洗子进程 env**：`execFile` 默认继承父进程 env，而本机 ambient `NO_PROXY` 结尾是 `[::1]` → Semble 的 httpx 构造 Client 时抛 `InvalidURL: Invalid port ':1]'`（**模型已缓存也照崩**，实测 `exit 1`）。故 spawn 时剔掉**带方括号**的条目（通用处理「形状」，不硬编码某台机器的值）。
2. **必须把候选路径绝对化**：Semble 返回**相对 repo 的路径**（如 `core\resource.ts`），而 `authorizeScope` 是**绝对前缀匹配** ⇒ 不绝对化会把候选**整批滤掉**（本地测试先失败、实测 0 条暴露）。修后同一次真实调用返回 **20 条绝对路径候选**。

### 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0；**全量回归 23/23 `ALL PASS ✅`**。
- **真机端到端**（用真 Semble CLI，非 mock）：`generateCandidates("parse resource card fields and projection sections", {ws, workspace})` → `provider=semble`、`unavailable=undefined`、**refs=20**、全部为 `G:/project/dsh1/dsh-shadow/...` 绝对路径、命中 **`core/resource.ts:173-186`**（即 `deriveResourceNodes` 的投影段）。同时打印出 `ambient NO_PROXY` 含 `[::1]` 而 `cleaned` 已剔除 —— 证明 env 清洗是这次能跑通的前提。

### 边界与未验证

- **默认路径不变**：`indexEngine.provider` 默认仍是 `fs`，不显式开启则**零行为变化**。
- 新增一个**外部 CLI 依赖**（未装 → `unavailable` + 可见标注，绝不 fallback 成 verified）。
- **未验证**：① `--content code` 在**大仓库**的首次索引耗时（本机模型已缓存、dsh-shadow 单仓已可用）；② **S2（`.shadow/` 记忆语料）未接**；③ **zg 路径疑似同源问题**（它的候选也可能是相对/空 locator，同样过不了 `authorizeScope`），但 **zg 未安装、无法实测**，故本轮**只修 semble、未动 zg**，仅在此记账。
- 本轮**未改** `Evidence Gateway`（`builtinEvidenceProviders` 不含 semble —— 刻意）。


## [v1.15.5] 旧协议约定全面删除（A/B/C/D）+ 同名双义第二轮正名 + references 补 OpenViking

用户 2026-09-10 指示两项：「添加资料 `volcengine/OpenViking`」与「**旧协议约定全面删除**」。本轮按四项执行（A 代码兼容兜底 / B ADR 陈旧状态 / C 同名双义 / D 现行文档口径），并**顺带修掉一个被 A 暴露的真 bug**。

### 0. references.md 补 OpenViking（已核实）

- 新增 §5「volcengine/OpenViking」：**GitHub API（抓取 2026-09-10）+ 本机克隆 `G:\project\dsh1\openviking`（HEAD `592c0fe`）** 双重核实。36,445 ⭐ / 2,790 fork；`AGPLv3`（**`crates/ov_cli` 与 `examples` 为 Apache-2.0**）；`viking://` 虚拟文件系统 + 写入时 L0/L1/L2 分层 + 目录递归检索 + 检索轨迹可观察。记录三条对本仓要紧的事实：① **许可证约束**——主项目 AGPLv3 而本仓 MIT，**只可借鉴思想与文档结构，不可复制代码**（既有「不引入其代码或依赖」口径继续成立）；② 它**原生支持 DSH**（`examples/dsh-memory-plugin`，7 个 `viking_*` 工具、`agent/pre-step` 注入、`ctx.provide("openvikingMemory")`），是本项目记忆层的**直接替代品**而非远方的对照组；③ `ov reindex` 明写「**没有 `semantic` 或 `full` 这样的模式别名**」，与 ADR-0050「正名硬切、不留兼容别名」是同一取向的外部正例。**未核实**：其自报评测数字、该 DSH 插件能否在 `0.1.5-rc.1` 上装载。

### A. 删除 4 处旧数据格式兼容兜底（`core/`）

| # | 位置 | 旧行为 | 现行为 |
|---|------|--------|--------|
| A1 | `core/episode.ts` `parseMemory` ③ | `> 用户提示/决策：`〔decision〕在无 `> 决策：` 块时被当作决策解析 | **删除**。决策只来自 ① `> 决策：` / ② `> 决策理由：` / 正文 `决定 ` 行 |
| A2 | `core/episode.ts` `deriveDecisions` | `decisionEvents` 为空时回退旧 `decisions`（reason 未知） | **删除**（A1 后该回退已不可达：`addDecision` 同时写两者） |
| A3 | `core/node.ts` `deriveShadowNodes` | 无 `lineage.evidence` 时回退 `materials` | **删除**，evidence 只取 `lineage.evidence.locator` |
| A4 | `core/episode.ts` `ParsedMemory` | `kind?` / `lineage?` 标「可选=兼容旧 Atom/合成构造」 | **转必填**（`parseMemory` 恒产出二者） |

- **迁移而非兼容**：5 处「旧格式夹具」改为现行格式——`test/episode-lineage.test.ts` ×3、`test/recall-attribution.test.ts` ×2（`> 用户提示/决策：「X」〔decision〕` → `> 决策：〔user〕X`）。
- **测试棘轮同步**：`test/query-observatory.test.ts` 的合成 `mkParsed` 补 `kind`/`lineage`（否则是「必填却靠运行时不检查」的隐性地雷）；两处因删除而**变成空断言**的旧标记断言收紧为现行标记（`episode-lineage` 场景「了解 当前 IO 不算决策」改为断言无 `> 决策：[^\n]*了解`；`goal-operation` 改为「无旧标记 **且** 有 `〔create〕`」）。
- **`> 用户提示/决策：` 本身不是旧格式**：它是现行的**提示头**（`core/memory.ts` 仍在写），只有其中带 `〔decision〕` 标记的条目是旧决策载体——本轮只删后者。

### 顺带修的真 bug（由 A 暴露，高）

`core/experience.ts` 的 `decision` 一直读 `> 用户提示/决策：`（**提示头**），而不是现行 `> 决策：`。后果：**把任意用户消息当决策**，且 A1 删除后 Experience 的决策恒为空 → `{experience:true}` 的 topic 匹配、`judgment`、`projection` 三处一起失准（测试逐个暴露：场景 35 / 38 / 39 / 45）。修：读 `> 决策：` 并剥离 `〔source〕` 标记（与 `core/episode.ts` ① 同口径）。

### B. 修正 23 个 ADR 的陈旧「协议（提案，待实现）」状态

23 个 ADR 仍写着「协议（提案，待 vX 实现）」，而**对应实现目录与 CHANGELOG 条目均已存在**（ADR-0011/0013/0015/0016/0017/0018/0019/0020/0021/0023/0024/0026/0027/0028/0029/0030/0031/0032/0033/0035/0036 共 23 个）→ 状态行改为 `已实现（vX.Y.Z）`，逐一取自 CHANGELOG 的实现条目（如 ADR-0011→v0.23.0「Observation Trace」、ADR-0030→v0.36.0「Delegated Execution Boundary Kernel」、ADR-0035→v1.0.2、ADR-0036→v1.0.1）。复核：`adr/` 下「协议（提案」残留 **0**。

### C. ADR-0053：同名双义收口（3 项正名 + 2 项判定保留）

- 新增 `adr/0053-same-name-disambiguation.md`。**再正名 3 项**（全部**复用本仓已有词**，不生造）：`mode:"verify"`→**`verification`**（对象名早已是 `VerificationRun`）、Gateway `EvidenceRef`→**`GatewayEvidenceRef`**（沿用 `AtomEvidenceRef` 同一构词法）、`realityEvidenceRef`→**`realEvidenceRef`**（对齐已定的正名 `mode:"real-evidence"`）。`mode:"verify"` 进 `RETIRED_MODES` 显式拒绝。
- **判定保留 2 项并写明理由**（不再靠注释桥含糊）：① `config.recall` **不改**——它下面还有 `cooldownTurns`/`debug`/`deprioritize`，是**整条召回管线**的旋钮（A 档关键词召回同样使用），改名 `semanticRecall` 会让 `semanticRecall.cooldownTurns` 语义变错（**这不是取舍，是改名会变错**；本 ADR 初稿曾打算改，核对作用域后否决）；② `args.identity` **不改**——与之撞车的 `mode:"identity"` 已于 ADR-0050 正名 `identity-advance`，再改就要生造词（违反本仓「禁止生造黑话」）。
- 影响面：24 处 `EvidenceRef` + 7 处 `realityEvidenceRef` 机械改名（负向断言 `AtomEvidenceRef` **零误伤**，复核 3 处仍在）；`mode` 分派（`contverify` 的 `CONT_MODES`）、`intentOf` 的 `MODE_GOAL`、工具 schema 三处描述、两处测试断言同步。
- **历史 ADR 正文保留原措辞**（ADR-0050 同口径）；ADR-0050 的保留清单由本 ADR 接续，其正文不改。

### D. 当前文档不再登记废止名

废止名的**映射与理由只留 ADR**，现行文档只写现行口径：`README.md` / `CONTEXT.md` 的「正名硬切」块改为**指针式命名口径**（不再逐一列举废止名）；`LIVE-VERIFY-checklist.md` 的口径提示同样改指针；工具 schema 的 `verifyEvidence` 描述去掉「（废止旧名 verify…）」；注入提示去掉「勿自造 mode:recall」。`CONTEXT.md` 的 `recovery` 行去掉「废止旧名 recall」。**保留**：`RETIRED_MODES` 拒绝表与其代码注释（那是机制本身，ADR 明确要求旧名显式拒绝）、`recall` 多义的**位置区分**注释（ADR-0053 §2 依赖它）。

### 验证

- `npx tsc --noEmit` exit 0；`npm run build` exit 0（`dist` 同步重建）。
- **全量回归 23/23 `ALL PASS ✅`**（收敛过程：A 落地后 `episode-lineage` 红 → 迁移 3 处夹具后绿；`recall-attribution` 依次暴露 `experienceOf` 旧字段 bug 的 4 个消费方（场景 35/38/39/45）→ 修 `experienceOf` + 迁移对应夹具后绿）。
- 旧格式残留复核：`test/` 下带动旧决策标记的夹具 **0**（剩余 `〔decision〕` 出现在两处**否定断言**里，属有意保留的回归锁）。
- `adr/` 下「协议（提案」残留 **0**；`AtomGatewayEvidenceRef` 误伤 **0**。

### 边界与未验证

- **破坏性**：旧格式记忆文件（v1.1.1 前的 `〔decision〕` 条目、v1.8.0 前无 lineage 的 Atom）**不再被解析成决策**——这是「全面删除」的定义域；本机无历史 `.shadow/`，故无实测数据可用；**其他机器/工作区若有旧记忆，其决策血缘会变少**。
- 本轮**未改** persona 与预设（v1.15.4 的 team 优先不动）。
- 未验证：`dist` 未做运行时端到端（本会话载入的是重启前的 dist）；旧数据影响面未实测。


## [v1.15.4] 投影模式预设：派活改为「team 优先」（官方 experimental Agent Teams）

用户 2026-09-10 指示「预设模式中要尽量少使用子代理，而是使用官方的 Agent Team，尽量避免子代理缓存命中低、花费高的缺点」。**本轮只改预设 persona 与文档，不动插件运行时**（`core/` 一行未改）。

- **persona 重写 ①–⑤**（`agent-presets/projection/agent.cordis.yml`）：新增「**默认不派人**」门槛；② 明确 **优先 Agent Team、不要反复新开一次性 subagent**（复用同一具名 teammate，理由是「每个新 subagent 都要重付一遍系统提示 + 工具 schema 前缀」）；③ 把「何时才用 `subagent`」收窄为「一次性、无后续、不需来回」，要带上下文用 `subagent_fork`；⑤ 改为「团队操作」（并行批派 + `team_task_create` 的 revision compare-and-set + `wait_agent` 前先 `list_agents` + `queued` 绝不重发 + 只有 Lead 能 `spawn_teammate`/`interrupt_agent` + 给最终答复前等齐 teammate）。①②③④ 的原判据（该不该派 / 提示词自包含 / 只验一错就要返工 / 未复核 N 条）全部保留，仅重排与压词。
- **persona 文本 2053 → 2380 字符**（+327，常驻成本计入；顶层 `- id:` 仍 16 行——新行挂在 `delegation` 组内）。
- **装配面（关键，决定能不能用）**：Team 域服务与工具分属两个平面，且**包内无 `dsh.bundle`**（`dsh plugin add` 只会装成普通依赖，不会自动插行）：
  | 面 | 位置 | 行 |
  |---|---|---|
  | 域服务 `ctx.agentTeams` | **host 组合**（profile `cordis.patch.yml`） | `@deepseek-ai/dsh-experimental-agent-team@0.1.5-rc.1` |
  | 9 个模型工具 | **preset**（本文件） | `@deepseek-ai/dsh-experimental-tool-agent-team@0.1.5-rc.1` |
- **同名冲突（有意保留，上游明文）**：`send_message` / `list_agents` / `interrupt_agent` 同时是 `@deepseek-ai/dsh-tool-subagent-control`（+ `/list-agents`）的旧名。Team 版**按成员作用域遮蔽全局**，非 Team 子代理仍拿旧目录；后果是 Lead 不再能用 `send_message` 指挥普通 continuable 子代理。上游建议「两者都要时必须禁用旧定义」，本版**选择保留旧行**（若禁掉，非 Team 子代理将完全失去控制面），并在 preset 里就地写明取舍。
- **已知缺口（与 ADR-0049「缺件不静默」相悖）**：Team 工具行 `inject: [..., 'agentTeams', ...]`，**host 没提供该服务时该行永不激活，但 `standingKeyFor` 仍报挂载成功**，9 个工具**静默不出现**。即：这个新依赖没有可见降级路径。已写入预设 README 作为前置条件，未在本轮修（修法需另议：要么把 host 行做成 dsh-shadow 自己 bundle 的一部分，要么在预设侧加可见告警）。
- **验证**：①`dsh --profile web --dump-config` exit 0、552 行、无 `Error:`，新增 `- id: agent-team` 行；②**全新世代挂载校验**（临时 Cordis 探针，本会话真跑）：`copy('projection','projection-probe-a')` → `standingKeyFor('projection-probe-a')` **MOUNT OK（真组装）** → `remove`，无残留；③**host patch 层无需重启即生效**：改 `cordis.patch.yml` 前 `ctx.get('agentTeams')` = `UNDEFINED`，改后 = `present (object)`，实测方法 `membership` / `spawnTeammate` / `listMembers` / `createTask` 均为 function；④**端到端**：Team 工具已出现在活会话工具表（`spawn_teammate` / `wait_agent` / `team_task_create|list|get|update` 新增，`send_message` / `list_agents` / `interrupt_agent` 描述已换成 Team 版），`list_agents` 实调返回 Team roster（`lead` / `running` / 带 `model` 与 `diagnostics`）。
- **同进程第二次挂载会失败（实测，根因已定位）**：改用新 id 再校验一次（`projection-probe-b`）报 `prompt section "team:policy" is already registered in this scope`。根因在包内（`dsh-experimental-tool-agent-team/lib/index.js`）：`apply()` 的去重用的是**插件实例级** `installed = new Map()`（第 531 行），而注册写进**成员 Agent 自己的作用域** —— `const scoped = agent.ctx`（第 232 行）→ `scoped.systemPrompt.section({ name: "team:policy" })`（第 238 行）。于是**同进程内第二次挂载**时新实例的 Map 是空的，会对**同一个活 Agent** 再注册一次同名 section → 抛错。影响面：① 两个预设都挂 `tool-agent-team` 时第二个必失败；② 同进程重挂（HMR / 组合重载）有同样风险。**冷启动只挂一次，故启动路径不受影响**（probe-a 那次即「进程内首次挂载」，MOUNT OK）。probe-a 的 standing generation 活到进程退出，故本会话残留其注册——**重启 web 进程即为干净状态**。
- **未验证（不冒充）**：①「保留旧控制行 + Team 行同时干净挂载」——本进程内 Team 行先于旧行激活，冲突面没被真正触发，且第二次挂载已被上面的 section 冲突挡住、无法再试；② `dsh-experimental-agent-team` 是**实验包、无稳定性承诺**，未做长期回归；③ **未做冷启动实测**：「重启后只挂一次 → 正常」是按代码与 probe-a 结果推断，不是实测；④ 本轮无 TypeScript 改动，`dist` 不需重建（沿用 v1.15.3 的 `tsc --noEmit` / build / 23 项回归结论）。




## [v1.15.3] 审查修复：能力探测在真机不生效（inject 回调语义）+ 残留旧名与半修状态

用户 2026-09-10 要求 review。派两位独立审查（① 正确性/回归；② 文档/发版一致性），父代理逐条复现验收，本条记录修复。**本轮修的全是 v1.15.0～v1.15.2 自身留下的漏洞。**

- **根因（高）：v1.15.0 的「硬依赖报 error」在真机不可达。** Cordis 的 `ctx.inject(deps, cb)` **只在依赖就绪时才回调**（依赖缺失时子 fiber 停在 PENDING，回调根本不执行）—— 把「缺 tools」的报错写在 inject 回调里，等于「缺了就不报」，**仍是静默**。父代理用**真实 cordis** 端到端复现：不提供 `tools` 跑 `dist/index.js`，`apply()` 之后**日志 0 条**。
  - 修：`tools` 与 `systemPrompt` 一并纳入 `probeHostOnFirstTurn` 的依赖检查（走 `fs` 那条已证可行的路径）；硬依赖（`fs`/`tools`）报 error，可选（`llm`/`agents`/`agentDefaultModel`/`systemPrompt`）报一条 warn；inject 回调内只留**不可达的防御性判断**并注明原因；框架接口检查补上 `ctx.get`。
- **测试假通过（高）：`host-probe.test.ts` 的 mock `inject` 无条件回调**，与真语义不符 ⇒ 断言①在 mock 恒真、在真机永不可能通过。
  - 修：mock 改为**保真**（依赖全部就绪才回调），新增断言①c 锁住该语义；断言①挪到「首个 `turn-stopping` 报 error」；**新增 ⑤ 用真实 cordis 端到端**（找不到宿主 cordis 时明确打印跳过，不静默冒充通过）。
- **残留旧名（低，但直接违反「过期旧名直接删除」）**：`core/types.ts` 的 `AgentLike.session` 仍声明 `cwd?: string`（宿主从来没有该字段，与 `scope.ts` 的注释直接矛盾）→ 删除。
- **半修状态（中）：`clear` 不清 `goalByAgent`。** `operation` 读对之后才暴露：clear 之后的新记忆仍带上一回合的 `> 目标：`（父代理实测复现）→ `clear`（或载荷不带 `goal`）时 `delete`。
- **静默兜底（低）**：`goalText()` 的 `change.operation || "decision"` 会把「operation 缺失」伪装成正常标签 → 改为 `|| ""`，与 v1.15.2「不留兜底」同一口径。
- **补正向锁（中）**：`writer-capture` 的 `exec.name` 此前只有**否定**断言（工具名不作 entry），把读取改回旧名照样全绿 → 场景15 增加正向断言（记忆正文含「调用 pwsh」）。
- **文档措辞精度（审查员 B）**：①「检索 `engines` **零命中**」字面不成立（实测有散文注释提及，只是**无任何代码读取**）→ README / CONTEXT / CHANGELOG 统一改为「无任何代码读取」；② README「**真正的**防线是能力探测」偏强（探测只报告、不拦截）→ 改为「**能观测到的**防线」；③ README 同节「插件在挂载时探测」与「探测不放在 `apply()`」易被读成自相矛盾 → 明确写清「不放在 `apply()`、也不放在 `inject` 回调」；④ CHANGELOG v1.15.1 的「宿主自身 71 处第一方使用」无法核实 → 改为「在宿主多个包中被广泛第一方使用」。
- **记账未修（审查员报，父代理裁决为非本轮返工面）**：`fs.writeText` 两参（触发条件=兜底工作区+沙箱生效，且写失败**有可见信号**）；`continuity/engine.ts` 自造 `FsTarget`；`clear` 会落一条内容较空的记忆（属产品取舍，非缺陷 —— `goal-operation.test.ts` 已把「带 `〔clear〕` 标签」固化为期望）；`HOST_BASELINE` 与 `package.json` 双源（已加同步维护注释）；`dist/delegation/guard/revocation-guard.*` 两个孤儿文件（源自早前提交 `6e952f2`，非本区间）。
- **验证**：`tsc --noEmit` exit 0；`tsc` build exit 0；**全量回归 23/23 `ALL PASS ✅`**（含 ⑤ 真实 cordis 端到端）；另用真实 cordis 探针确认：**服务齐全时 `apply()` 后零输出**（v1.15.0 遗留的「待实测」项就此闭环）。
- **边界**：不动 API / mode / 读侧语义；不改既有测试的断言意图（只补正向锁、保真 mock 与真机端到端）。
- **待实测（需重启 web profile）**：改动在源码 + `dist`，本会话用的是重启前载入的 dist。


## [v1.15.2] 过期旧名直接删除：不留兼容兜底（ADR-0050 口径）

用户 2026-09-10 指示「**过期的旧名直接删除**」。v1.15.1 修 `goal/changed` 时把不存在的旧字段名留在了末位做兜底（`change.operation || change.action || change.phase || change.kind`），本轮按本仓 ADR-0050「正名硬切、不留兼容别名」的口径把全部已确认过期的旧名删净。

- **删净的旧名（代码层 grep 复核 0 残留）**：
  - `core/collect.ts` `goalText()`：`obj` 只留真字段 `change.goal?.objective`（删 `change.objective`、`change.change?.objective`）；`act` 只留 `change.operation`（删 `change.action` / `change.phase` / `change.kind`）。
  - `core/writer-capture.ts` `onGoalChanged`：只读 `payload.change.goal?.objective`（删 `change.objective`）。
  - `core/writer-capture.ts` `onToolsResult`：工具名只读宿主 `ToolExecution.name`（删 `exec.tool?.name` / `exec.toolName` / `exec.tool`）。
  - `core/scope.ts` `resolveShadowScope`：删掉恒 undefined 的候选 `agent.session.cwd`（宿主 Session 只有 `header.cwd`）；顺手修正与代码不符的过期注释（`~/.dsh-shadow` → `DEFAULT_SHADOW_ROOT`）。
- **删旧名的直接价值：暴露 5 处「假形状」测试** —— 旧名兜底一直在悄悄救回编造的载荷，把「字段读错」掩盖成绿色：
  - `test/evidence-b2-write.test.ts`：`{ objective, act }` → `{ operation, ref, goal: { objective } }`
  - `test/episode-lineage.test.ts`：`{ action, objective }` → `{ operation, ref, goal: { objective } }`
  - `test/recall-attribution.test.ts` ×2：`{ action, objective }` / `{ objective }` → 真实形状
  - `test/recall-attribution.test.ts` 场景15：`{ tool: { name } }` ×4 → `{ name }`（真实 `ToolExecution`）
  全部改成宿主真实形状，**断言意图不变**（逐处核对：这些断言不依赖旧形状的精确文本）。
- **验证**：`tsc --noEmit` exit 0；`tsc` build exit 0；**全量回归 23/23 `ALL PASS ✅`**；代码层旧名 grep **0 残留**（注释中保留「这些字段在宿主不存在、所以不读」的说明，防后人再加回来）。
- **边界**：只删过期字段读取与假形状测试；不改 API / mode / 读侧语义；不引依赖。
- **待实测（需重启 web profile）**：改动在源码 + `dist`，真机确认需重启。


## [v1.15.1] 会话/agent 接口核对后的根因修复：`goal/changed` 操作语义丢失（读错字段名）

用户 2026-09-10 追加「检查 dsh-shadow 对 dsh 会话的接口」。派两个独立子代理（① 本机 0.1.5-rc.1 编译产物逐条对照；② GitHub `deepseek-ai/deepseek-harness` 官方源码 + 运行时 `cordis_inspect_query` 交叉验证），父代理逐条验收后裁决，本条记录修复。

- **确认的根因**：宿主 `GoalChanged` 自 `0.1.0-rc.7` 起（`0.1.1-rc.2` / `0.1.2-rc.1` / `0.1.5-rc.1` 逐版 declaration **逐字相同**，且与运行时 Inspect 一致）形状恒为 `{ operation, ref, goal? }`；**从来没有** `action` / `phase` / `kind`（`phase` 只存在于 `change.goal.phase`）。插件 `core/collect.ts` 的 `goalText()` 只读后三者 → `act` 恒回退 `"decision"`，**goal 的操作语义（create/edit/pause/resume/complete/block/clear）永久丢失且不报错**。注：`change.objective` 同样不存在，但被 `change.goal?.objective` 兜住，目标文本没丢。
- **性质：长期 bug，不是版本改名**：四个版本 declaration 逐字相同 ⇒ 不构成「0.1.5-rc.1 以下不兼容」，但它确实是「在 0.1.5-rc.1 上 goal 语义是坏的」—— 正是本次接口核对要抓的东西（也印证 v1.15.0 自陈的边界：当时只验了「名字在不在」，没验字段/语义）。
- **修法（最小）**：`core/collect.ts` → `change.operation || change.action || change.phase || change.kind || "decision"`（宿主真字段放首位，旧名留末位兜底）。`writer-capture.ts` **无需改** —— 其 `change.objective || change.goal?.objective` 第二项已命中真字段（子代理建议连这里一起改，父代理复核后**驳回**）。
- **回归锁**：新增 `test/goal-operation.test.ts`（3 组）：用**宿主真实载荷形状**驱动插件，断言 create 带 `〔create〕` + objective 且**不再出现** `〔decision〕`；clear（无 goal 字段）带 `〔clear〕`；七种 operation 全覆盖。
- **父代理裁决（推翻/修正子代理的两条结论）**：
  1. **撤销「`systemPrompt` 契约冲突」**：两个子代理一个说 `context(...)`、一个说 `section(...)`。实测 0.1.5-rc.1 二者**并存且用途不同** —— `section()` 插静态有序段（`layer.sections`），`context()` 插动态运行时上下文（`layer.contexts`），均为公开方法（0.1.2-rc.1 起即如此）。插件用 `context()` **正确，不是缺陷**。
  2. **修正「`agent.session` 是未声明字段」**：子代理 B 定位到根因 —— 它在 TS 类型（`runtime-types.ts` 的 `declare module` 增强）与官方文档里**是公开契约**，只因契约生成器只索引顶层 `export` 声明而**不在机器可读目录（Inspect）里**，且在宿主多个包中被广泛第一方使用（含 `tool-fs/src/session-cwd.ts` 注释直接指名该路径）。⇒ 属「公开但 Inspect 看不到」，非「未承诺」。
- **记账未修（父代理裁决为非本轮返工面）**：① `fs.writeText` 只传 2 参（无 `expected` / `signal` / `sandboxPolicy`）—— 已核实组合**确挂 `fs-sandbox`**，但触发条件是「解析不出 session cwd、落到兜底根 `~/.dsh-observer/shadow`」，且写失败**有可见信号**（场景13 测的正是它，`read_shadow` 会暴露「落盘失败」），故非「静默」；**v1.15.31 勘误（ADR-0074）：该归因说窄了** —— 真实触发条件是「**会话工作区 ≠ 服务进程启动目录**」，**与能否解析 cwd 无关**（实测失败时 cwd 解析是成功的），且后果不是「有可见信号就算无害」而是**整棵记忆树永不落盘**；② `core/scope.ts` 的 `agent.session.cwd` 是死分支（宿主只有 `header.cwd`）；③ `continuity/engine.ts` 自造 `FsTarget`，违反 dsh-fs 书面契约（key 只能来自 `resolve()`），本地/沙箱后端今天可用；④ 工具名四级兜底里 `exec.tool` / `toolName` / `tool` 在 `ToolExecution` 上不存在，末位 `exec.name` 命中。
- **验证**：`tsc --noEmit` exit 0；`tsc` build exit 0；**全量回归 23/23 `ALL PASS ✅`**（21 原有 + `host-probe` + 新增 `goal-operation`）。
- **边界**：只改 `core/collect.ts` 一处字段名 + 新增一个测试；不动 API / mode / 读侧语义；**已落盘的历史记忆文本不回填**（重算属单独决策，未做）。
- **待实测（需重启 web profile）**：探测块与本次修复都在源码 + `dist`，真机确认需重启；本会话用的是重启前载入的 dist。


## [v1.15.0] 兼容性口径落地：验证基线声明（`engines.dsh`）+ 宿主绑定能力探测

用户 2026-09-10 要求「检查 dsh-shadow 对 DSH 0.1.5-rc.1 的支持，而且仅支持该版本以上」。经三轮追问定下口径（下详），本轮落地。**只加声明与可见性，不改任何 mode / API / 读侧语义。**

- **先查证三条事实（决定了做法，不是假设）**：
  1. **宿主与 pnpm 都不读 `engines.dsh`** —— 对 `@deepseek-ai/*` 全量编译产物（links 下所有版本目录）检索 `engines`：**无任何代码读取**（仅有散文注释提及）；`dsh plugin`（`lib/plugin-*.js`）只转发 pnpm、按「装了什么」同步 `dsh.profile.bundles`，无版本校验；profile 启动链（`lib/profile-boot-*.js` → `dsh-app-boot`）只管 patch 层叠加与挂载，同样无校验；pnpm 只校验 `engines.node` / `engines.pnpm`，未知键忽略。⇒ **`engines.dsh` 是声明，不是闸门**（`dsh-wechat` 已有的 `engines.dsh: ">=0.1.2-rc.1"` 同为此性质）。
  2. **宿主不向插件暴露自身版本号** —— 未找到任何把 DSH 版本暴露成服务 / 环境变量的位置；唯一的插件清单服务（`dsh-plugin-package-inventory-deepseek`）只读**插件**的 `name` + `version` 上报 UI，`engines` 同样不读。⇒ 插件无法在运行时自检版本。
  3. **兼容性对照** —— 本插件用到的契约面（`fs` / `llm` / `agents` / `agentDefaultModel`（含 `.currentSelection()`）/ `tools` / `systemPrompt` 六个服务 + `session/event` / `agent/turn-stopping` 两个事件）在 **`0.1.0-rc.7` 起即全部存在**。⇒ **没有已知的不兼容点**，「仅支持 0.1.5-rc.1 以上」据此**定性为「验证基线」而非「技术兼容边界」**，文档**不写「不兼容」**（无证据）。
- **落地 1（声明层）**：`package.json` 加 `engines.dsh: ">=0.1.5-rc.1"`（对齐 `dsh-wechat` 先例）+ description 同步；README 新增「兼容性（验证基线）」节（含「是声明不是闸门」与基线理由）；`CONTEXT.md` 术语表加「验证基线」条目；版本 1.14.1 → 1.15.0。
- **落地 2（能力层 = 真防线）**：`index.ts` 加宿主绑定探测，把原先的**静默降级**改成可见：
  - **硬依赖报 error**：`ctx.on` / `ctx.inject`（框架接口；缺失时报告后直接返回空 disposer，不再继续挂）、`tools`（原 `if (!toolsService) return;` —— 缺它三个工具一个都不出现且无声，是「低版本不兼容」最危险的呈现方式）、`fs`。
  - **可选依赖报一条 warn**：`llm`（不生成摘要 / 不扩词）、`agents`（采集不到发起者与工作目录）、`agentDefaultModel`（不注入默认模型）、`systemPrompt`（不追加常驻提示）。
  - **时机刻意避开 `apply()`**：Cordis 服务是异步挂载的，`apply()` 时探测会误报（`index.ts` 的 `queryDeps.fs` 懒解析注释记录过同类坑）；改在 Cordis 保证就绪的 `inject(["tools"])` / `inject(["systemPrompt"])` 回调内，以及**首个 `agent/turn-stopping`**（补查 `fs` / `llm` / `agents` / `agentDefaultModel`；`hostProbed` 保证只报一次）。
  - **事件本身不做存在性断言**：Cordis 事件松耦合、注册监听无需事件已存在、无可查询的事件注册表；写侧已有 pending 超阈值兜底落盘（`writer-capture.ts`），即使 `turn-stopping` 缺失也不会永久积压 —— **不谎称能探测事件**。
- **不做的事（有意为之）**：不做硬闸门（宿主层做不到；`process.argv[1]` 反推宿主安装路径读 `package.json` 的野路子跨平台脆弱、且与「零宿主依赖」设计相悖，未采用）；不把服务写进 `inject`（会让插件在缺服务时**静默等待**，比现状更隐蔽）；不套用 ADR-0049 的 `unavailable` 语义（那是给**可选增强**的；宿主核心服务缺失属**硬依赖**，该响亮说挂不起来）。
- **开发中真实踩到的坑（已修 + 已锁）**：包装 `agent/turn-stopping` 时**丢了返回值** —— `onTurnStopping` 是 async，宿主与测试都靠 `await` 这个 handler 的返回值来等落盘完成；包装返回 `undefined` 会让等待方提前继续，`read_shadow` 里「flush 失败可见」的信号随之消失（场景13 回归失败）。**回档复验**：stash 本轮改动 → 重编译 → `recall-attribution.test.ts` **ALL PASS**；恢复即 **FAIL** ⇒ 证实为本轮引入。修法：包装内 `return collector.onTurnStopping(payload)`。
- **验证**：
  - ① `npx tsc --noEmit` **exit 0**；`npm run build` **exit 0**，`dist/index.js` 与源码同步重建；
  - ② **全量回归 22/22 `ALL PASS ✅`**（原 21 个 + 新增 `test/host-probe.test.ts`）；其中 `recall-attribution.test.ts`（含场景13 flush 失败可见）在修复后回到 PASS；
  - ③ **新增 `test/host-probe.test.ts`（5 组断言）锁住本轮行为**：缺 `tools` 报 error；`tools` 可用时三个工具都注册；可选服务缺失只报一次 warn（第二次 turn-stopping 不再报）；**包装 handler 必须透传 Promise**（本轮 bug 的回归锁）；缺 `ctx.on` / `ctx.inject` 报 error 且不抛异常；
  - ④ 回档复验（stash → 重编译 → 跑测试）见上「坑」一条，用于区分「本轮引入」与「既有缺陷」。
- **待实测（需重启 web profile）**：本轮改的是源码 + `dist`，本会话用的是重启前载入的 dist —— 探测输出（正常挂载时应当**一条都不打印**）要在重启后真机确认；记为待实测，不伪称已验。


## [v1.14.1] 投影模式预设固化 ⑦「创意与资源」（资源侦察员 → 创意专家）

用户 2026-09-10 决定把设计稿（`_reports/2026-09-10-投影模式-创意专家与资源侦察员-设计稿.md` §7）的 ⑦ 固化进投影模式预设。**只改 persona 文本与文档，不动插件运行时**（`resource` 类型与资源卡格式是 v1.14.0/ADR-0051 的事，本版只教 agent 怎么用）。

- **persona 增 ⑦**（`agent-presets/projection/agent.cordis.yml`）：创意类问题先派「资源侦察员」再派「创意专家」，不许互相顶替。侦察员只找素材——查资源库（`shadow_query` 带 `scope:["resource"]`，命中跳过外搜）→ 识别入口（工具/GitHub/论文/官方文档/文章/案例/数据集）→ 扩词（核心/同义/技术/实现/问题/GitHub/论文/竞品 + **反向词「怎么避免这个问题」**；每类 ≤5、连续两轮没有新资源就停）→ 发现 → 评价 → 标星 → 写进 `.shadow/resources/<名字>.md`；它不解题、不评方案。资源卡两层（固有层长期有效 / 投影层按问题各存一段，别让旧问题的分污染新问题）；**卡片必须写 `source`**，否则不进认知查询；**启发度要有引用证据**（某方案真用了才计分，并记下改变了哪个方案）。创意专家只发散（多方案 + 反直觉 + 每个方案的假设与风险），不检索；收敛由主 agent 或独立裁判做对比矩阵并写淘汰理由。
- **② 增补**：专家枚举里补一句「创意类任务先派资源侦察员再派创意专家，见 ⑦」——保证 ② 的激活清单与 ⑦ 不脱节。
- **同步面**：`preset.yml` 描述（补 ⑦）、预设 `README.md`（新增 ⑦ 小节：侦察员职责 / 两层卡 / 两条边界 / 创意专家只发散）、主 `README.md`「投影模式」节与版本表、`package.json` 1.14.0 → 1.14.1。
- **顺带修掉一个「预设根本挂不上」的存量缺陷（根因已定位）**：做挂载校验时 `standingKeyFor('projection')` **失败**——`persona` 行用的是旧键 `text:`，而当前部署的 `@deepseek-ai/dsh-persona`（0.1.5-rc.1，`lib/index.js` 的 `Config = z.object({ prefix: z.string().required(), suffix: …, complete: …, includeRuntimeContext: … })`）已把 `text` 改名为必填的 `prefix`，于是报 `$.prefix missing required value`。**这不是本轮 ⑦ 引入的**：用改动前备份另建一个独立预设（`probe-a`）挂载，报同一个错；四个 shipped 预设（standard/ptc/minimal/cordis）全部用 `prefix:`。修法：persona 行改为 `suffix: Your working directory is {{cwd}}.` + `prefix: >-`（与 shipped 预设同构，正文一字未删）。修后 `standingKeyFor('projection')` 与全新世代探针均 **mounted ✅**。
- **验证**：① 宽容 YAML 解析（忽略 `!!js`）通过，行数 270、`- id:` 仍 **16**；② persona 行 config 键 = `['suffix','prefix']`（旧键 `text:` 残留 0 处），`prefix` 实测 **2067** 字符 + `suffix` 32 字符（改动前整段 1476 字符，净增 ≈620，常驻成本已计入），⑦/资源侦察员/创意专家/启发度要有引用证据/必须写 source/`shadow_query` 带 `scope:["resource"]`/不许互相顶替 **七个关键词全中**，①–⑥ 六条全部仍在；③ 包内 ↔ 安装副本三文件 SHA256 一致；④ **全新世代挂载校验**（临时 Cordis 探针）：`copy('projection','projection-probe')` → `read` 13955 字符 → `standingKeyFor('projection-probe')` **mounted（真组装，非形状检查）** → `remove` → 探针无残留 → `standingKeyFor('projection')` mounted ✅。
- **边界**：只改 persona 与文档；不改插件 mode/API/服务/隔离域、不引依赖、不动 `agent-presets/` 的其余文件。
- **待实测**：人格是否真让模型「先侦察后发散」要在**真开投影会话**时才看得到——本会话跑 `cordis` 预设（agentPreset=cordis），投影 persona 不作用于它，记为待实测、不伪称已验。


## [v1.14.0] 新增第 6 个 NodeType `resource`：`.shadow/resources/` 资源卡 → 派生投影（ADR-0051）

用户 2026-09-10 决定「给 dsh-shadow 加 `resource` 作为新 Node 类型」。落地时先做了**归类冻结**（ADR-0051）：资源卡是 **source**（tool/agent 写的普通文件），`resource` 节点是 **Projection**（派生、可重建）——两者分开，才不违反 Shadow Contract（ADR-0043）。**不新增 mode**（仍 61），**不引向量库**（ADR-0001），**不做 Store**。

- **类型**：`NodeType` 增 `resource`（`memory|code|document|decision|concept|resource`）；`shadow_query` 的 `scope` 收 `resource`，工具描述同步（`index.ts`）。
- **源层格式**：`.shadow/resources/<name>.md`（`.md` 不区分大小写）——一级标题=名字；`- 键：值` 收固有层（`source/来源/链接/地址/出处`、`type/类型`、`authority/权威性`、`activity/活跃度`、`risk/风险`、`一句话`；中英键名都收）；`## 投影 @ <问题>` 段收按问题的投影（`相关性/新颖性/可用性/启发度/可复用性` + `引用证据` + `结论`）。**状态机**：一级标题=名字；标题含「投影」开一段投影；**其它标题一律回到固有层**（否则后面的固有层字段会被投影段吞掉——审查 A1）；投影段里写了固有层字段（如 `source`）时回落到固有层，不静默丢。
- **派生**（`core/resource.ts`，纯函数 / 无 LLM / 不猜字段）：一张卡片 → 一个 `ShadowNode{type:"resource"}`，`source` 指向卡片文件，`evidence = [卡片的 source]`（**不做二次截断**——卡片是事实源，截短会让来源不可回查），`relations` 只派生 `references`；`createdBy:"tool"`（卡片由人或 agent 经工具写入，记录口径统一为 tool）；`kind` 不设（`kind` 是 memory 的二级属性）。**content 顺序：按问题的投影段在前**（分数 / 引用证据 / 结论），固有层在后——读侧 `queryShadow` 只取前 6 行，倒过来会让结论与引用证据永远看不见（审查 A2）。
- **id**：以**文件名**为准 `sr-<slug(文件名)>`（同一资源目录内文件名天然唯一；非 ASCII 文件名 slug 会退化成 `mem`，改用短哈希兜底）——不用标题，因为两张卡可以同名。
- **证据门同门**（两道：解析层先挡 + `core/lineage-validator.ts` 兜底）：卡片没写 `source` → `parseResourceCard` 直接不产出卡片（先挡）；万一有 resource 走到投影，`validateAtomProjection` 再挡一次 → **不上投影**，卡片保留在磁盘。理由：**收进库 ≠ 有出处**。解析不出来（无标题/无 source）直接返回「不投影」，不猜。
- **投影合并**（`query/reads.ts`）：`shadow_query` 的投影 = `deriveShadowNodes(记忆原子)` + `deriveResourceNodes(资源卡)`；资源目录不存在/不可读 = 「没有资源卡」（**无数据，不是缺件**，故不适用 ADR-0049 的「降级必须可见」要求；也没有任何「已核实/已存在」的声称）。
- **id**：见上（文件名派生的 `sr-<slug>`）。
- **验证**：新增 `test/resource-node.test.ts`（解析 / 投影 / 无 source 不上投影 / 证据门两个方向 / scope 过滤 / 中文键名 / 脏值截断 / id 不撞）→ `ALL PASS ✅`；回归 `test/recall-attribution.test.ts`、`recall-envelope`、`recall-routing-eval`、`evidence-gate`、`atom-kind`、`lineage`、`query-observatory`、`concept-guards`、`missing-dependency` 全 `ALL PASS ✅`；`npx tsc --noEmit` 与 `npm run build` 均 exit 0。
- **独立审查与修复（同日，两个不同视角）**：正确性/边界 + 契约/文档/发版各派一位独立审查，共报 3+2 条「一旦错了就得返工」，父代理逐条复核后修掉 —— (a) 解析状态机吞字段（投影段后再写固有层 → 字段被丢、整卡不上投影）→ 修：非投影标题复位 + 别名回落；(b) 结论/引用证据在真实 `shadow_query` 输出里被 `content.slice(0,6)` 截掉（测试只在 node 层断言 = 假通过）→ 修：content 改投影段优先，**测试断言移到渲染层**；(c) `出处` 被归成 authority 导致该卡不上投影 → 修：`出处`→source；(d) 大写 `.MD` 被跳过 → 修：大小写不敏感；(e) `resource` 证据门只判数组长度（空白 locator 也能过）→ 修：要求至少一个非空 locator。另修 id 由标题改为**文件名**（两张卡可同名）、证据不再二次截断。未改的记账项：非法 `scope` 值被滤空后退化为「全部类型」（既有行为，非本轮引入）、大目录串行 I/O、`projectionStore` 缓存无 `invalidate` 调用点（现在只能删 `shadow-index/nodes.jsonl`）。
- **已知边界**：`projectionStore` 开启且缓存命中时，缓存不感知资源目录变化（`invalidate`/`invalidateFor` 目前**没有调用点**，实际只能删 `.shadow/shadow-index/nodes.jsonl` 触发重建）；默认关闭，不影响默认路径。卡片属性是原文快照，系统不自动重抓（与「不 LLM 补写」一致）。
- **不属本轮**：投影模式预设里「资源侦察员 / 创意专家」的工作方式（那是预设平面），本版只做插件的类型与门。
- **待实测（需重启 web profile）**：改的是源码 + `dist`，本会话用的是**重启前载入的 dist**——所以「在真会话里 `shadow_query(..., { scope: ["resource"] })` 能查到卡」这条**尚未真机闭环**，重启后按 §上「验证」的同一份数据复核。重启前预检已过：`dsh --profile web --dump-config` exit 0、无 `Error:`，`- id: dsh-shadow` 在册、`shadowRoot: D:\project\dsh1`。


## [v1.13.2] 投影模式：「编排者与专家不重做同一件事」（④ 由「逐条复核」改为「只验一错就要返工的那几条」）

用户 2026-09-10 提出：**子 Agent 应承担与主 Agent 不重叠的活，避免职责重叠与重复推理，降低 Token 的冗余消耗**；并要求**用平常中文，不造生僻词**。审查发现现有 ①–⑤ 只回答了**横向**（专家之间怎么切、怎么不撞车），对**纵向**（子 Agent 与主 Agent 之间）完全空白——而 `④` 恰恰明文要求父代理「专家声称的事实自己跑一遍」，等于把专家的推理重做一遍；这条同时存在于用户级规则 §四（经 `sync-rules.py` 聚合进 `~/.dsh/AGENTS.md`，**每个会话都背**）与本预设的压缩副本里。本轮把这一维补上，**不新增能力、不动插件运行时的任何 mode/API**。

- **① 增补（该不该派）**：一句话说得清、只动一处、不需要旁人视角的自己做；要跨文件、要独立证据的必须派。为切活而看目录/搜代码/读关键文件**不算重做**；**不许先把成果做出来再派专家重写**。
- **③ 增补（原文不重复贴）**：同一段原文只进一个专家的提示词，其余专家给「结论摘要 + 原位路径」；**例外**——故意要独立判断的审查各读原文，那是花 Token 买独立性（守住 `moe-subagent-dispatch.md:31`「不同视角才有交叉覆盖」）。同时要求专家输出把结论分两栏。
- **④ 改写（只验要紧的）**：只对「一旦错了就得返工的」那几条跑命令/写探针/读代码；其余**采信但按未复核处理**（不能当已验的结论用），并须在交付物里列「未复核：N 条」；**一栏都没标的输出按不合格退回重派**——这道兜底靠格式合法性，**不靠父代理通读找漏**（通读找漏就是事后判，浪费照样发生）。
- **⑤ 增补**：并行判据由「互不依赖」补为「互不依赖、且各干各的那一份」。
- **用户级规则同步（规则为源）**：`~/.agents/rules/moe-subagent-dispatch.md` 标题 + §一（新增第 4 条「该不该派」）+ §二 + §三（第 4、7 条）+ §四（整节改写）+ §五 + 落地 一并更新；随后 `sync-rules.py` 重生成 `~/.dsh/AGENTS.md`、`sync-rules-wsl.py` 同步 WSL 镜像与 `/home/g/.dsh/AGENTS.md`。
- **用词**：全篇只用平常中文——「正交」不出现，判据写成「一旦错了就得返工的」；未用「承重」这类比喻。
- **同步面**：`preset.yml` 描述、预设 `README.md`、主 `README.md`「投影模式」节与版本表、`package.json` 1.13.1 → 1.13.2。
- **验证**：① 包内 ↔ 安装副本三文件 SHA256 一致（`F8114A31…` / `A4D0141A…` / `8BD6C409…`）；② 宽容 YAML 解析（忽略 `!!js`）通过，仍 16 行、`- id:` 16；③ persona 文本 1204 → **1476** 字符（+272，常驻成本已计入），①–⑥ 齐全、5 个新判据关键词全中、旧句「专家声称的事实自己跑一遍」已消失；④ `~/.dsh/AGENTS.md` 重生成 41647 → **43961** 字节，新句在、旧指令句仅在「改为」说明里出现一次；⑤ WSL 侧规则文件与 Windows `cmp` 一致（`RULE_IDENTICAL`），WSL 聚合已刷新；⑥ **补掉 v1.13.1 遗留的挂载校验**：`agentPresets.copy('projection','projection-probe')` → `read` 得 13285 字符且 5/5 新判据命中、旧句已去 → `standingKeyFor('projection-probe')` **mounted（全新世代）** → `remove` → `standingKeyFor('projection')` mounted → 预设清单 5 个无残留；（本轮无 TypeScript 改动，`dist` 不需重建；`node test/recall-attribution.test.ts` 回归 ALL PASS）
- **边界**：只改 persona 文本、用户级规则与文档；**不改**插件运行时 mode/API/服务/隔离域，不引依赖；预设仍是 `standard` 的完整拷贝。
- **遗留**：行为级效果（模型是否真按「只验要紧的」做）要在**真开投影会话**时才看得到——本会话跑的是 `cordis` 预设，投影 persona 不作用于它，故记为**待实测**，不伪称已验。


## [v1.13.1] 投影模式预设集成「契约与根因卫生」

把用户级全局约定（`~/.agents/AGENTS.md` 前半：根因三部曲、禁止生造词、结论进 memory 存档）与 ADR-0050 澄清检查经验（四查）压短写进**投影模式 persona ⑥**——随包发布；完整全局条文仍以 `~/.agents/AGENTS.md` / DSH 聚合的 `~/.dsh/AGENTS.md` 为准（⑥ = 投影侧常驻强化，非全文拷贝）。人格落地用语统一为「写入 shadow 或项目文档」（对应全局 memory 存档）。

- **persona 增补**（`agent-presets/projection/agent.cordis.yml`）：⑥ 契约与根因卫生；回望句补 `recall_shadow`（内部 `mode:recovery`，勿自造 `mode:recall`）。投影中文块约 **1164** 字符（常驻成本已计入）。
- **审查跟进**：回望段去掉「一般不需要手动改 shadow」，改为「日常采集自动落盘；关键根因/约定仍按 ⑥ 写入」——消解与 ⑥ 的软冲突；说明层「memory」与人格「shadow/项目文档」对齐。
- **同步面**：`preset.yml` 描述、预设 `README.md`、主 `README.md`「投影模式」节与版本表。
- **安装副本已同步**：`~/.dsh/.agent-presets/projection/` 三文件与包内 SHA-256 一致；改前备份带时间戳 `.bak-YYYYMMDD_HHMMSS`。
- **验证**：包内 ↔ 安装副本 SHA 一致；persona 含 ⑥ 关键词 + 回望例外句 + ①–⑤ 保留；`- id:` 行仍 16；无 `projection-probe` 残留。**`standingKeyFor` 全新挂载**：本机无 PATH 上的 `dsh`/`pnpm`（未跑通 `copy→standingKeyFor(probe)→remove`）；宿主下次挂载新世代时校验——与 MEMORY「CLI 难直接触发」一致，**不伪称已挂载 OK**。
- **边界**：只改预设人格与说明；**不改**插件运行时 mode/API；不把本仓「commit 后必须 push」写进通用人格。


## [v1.13.0] API 正名硬切（ADR-0050）

破坏性读侧入参/mode 正名：删旧名、无兼容别名；旧名显式拒绝（禁止落空进默认召回）。**不扩能力。**

| 废止 | 正名 |
|------|------|
| `mode:"recall"` | `mode:"recovery"`（`recall_shadow` 内部跟改） |
| `mode:"identity"`（推进 timeline） | `mode:"identity-advance"`（读 curated 锚仍用 `args.identity`） |
| `args.verify` | `args.verifyEvidence`（`mode:"verify"`=VerificationRun 不动；带 `verify` 键即废止） |
| `mode:"reality"`（federation 注册） | `mode:"real-evidence"` |
| lineage `EvidenceRef` | `AtomEvidenceRef`（Gateway `EvidenceRef{path}` 不动） |
| `args.recall` 旁路 | 删除并纳入废止表 |

- **实现**：`query/query.ts` `retiredApiMessage` 早退；`reads`/`observer-kernel`/`federation` 正名；`core/lineage.ts` 类型重命名；`core/intent.ts` 布尔旗标跟 `verifyEvidence`（审查补洞）。
- **文档**：ADR-0050；CONTEXT.md mode 表 + 术语；README 路由表；ADR-0023 勘误行；schema `model-observation` 措辞。
- **澄清补丁（同版跟进）**：CONTEXT 去掉「mode 串不变」假表述；ADR-0015 勘误；`intentOf` 认 `mode:recovery|identity-advance` 等；recovery/Continuity/文件名注释桥；systemPrompt + schema 消歧；`args.recall` 废止文案区分 `config.recall`。
- **验证**：棘轮仍 61 mode；`test/recall-envelope.test.ts` 旧名拒绝 + 保留面（`identity` / `verifyEvidence` / `mode:verify`）成对断言；归因/episode/缺件回归 ALL PASS。


## [v1.12.9] 投影模式预设集成「子代理分工」纪律

把用户 2026-09-08 对 v4.1f 的建议（多用子代理、父代理要会写「激活专家」的提示词、做好任务划分、别让一个代理干所有任务类型的活）落进**插件自带的投影模式预设**——随包发布，不依赖某台机器的用户级规则目录。

- **persona 增补**（`agent-presets/projection/agent.cordis.yml`）：投影模式人格里加一段「工作方式」，自包含五条——① **先分活**（按类型切开、标出可并行与串行点、写进 todo）② **准确激活专家**（实现按模块切 / 排障带现象与**已证伪的假设** / **审查至少两个不同视角** / 调研要证据 / 文档对齐已有口径 / 测试禁止 mock 掉被测物）③ **提示词七要素**（角色 → 仓库路径与构建测试约定 → 任务产出 → 必要上下文 → 约束 → 验收命令 → 输出格式；**专家看不到父会话，必须自包含**）④ **派了必须验收**（专家声称的事实自己跑一遍，不采信未验证断言；冲突由父代理裁决；判错带证据回推）⑤ 并行与扇出。persona 400 → 909 字符（常驻成本已计入，换来的是编排纪律）。
- **同步面**：`preset.yml` 描述、预设 `README.md`（新增 What it configures 段落：自包含简版 + 可选完整版）、主 `README.md`「投影模式」节（补纪律说明与「全新挂载校验」做法）。
- **安装副本已同步**：`~/.dsh/.agent-presets/projection/` 三文件与包内 SHA-256 一致；改前备份 `agent.cordis.yml.bak-20260909_091037` / `preset.yml.bak-20260909_091037`。
- **验证**：`agentPresets.copy('projection','projection-probe')` → `standingKeyFor('projection-probe')` → `mounted OK`（**全新世代**，真校验编辑后的文本，而非已挂载的旧世代）→ `remove` 清理；`standingKeyFor('projection')` 亦 `mounted OK`；宽容 YAML 解析（忽略 `!!js` 自定义标签）得 16 行、persona 含全部纪律关键词；`~/.dsh/.agent-presets/` 无残留探测预设。
- **边界**：只改 persona 文本与文档，**不动任何插件行、服务或隔离域**；预设仍是 `standard` 的完整拷贝；不引入新依赖。


## [v1.12.8] 缺件不静默纪律（ADR-0049）+ 召回路由评测（C6）+ references.md 三处更正

接 2026-09-08 参考材料研究（§二 2.5 与 §三 3.6）与 §六 的待办，落两件 + 清一批小账。**无 LLM、无新依赖、不引向量库（ADR-0001）。**

- **① 缺件不静默升为统一纪律（ADR-0049）**：把此前只写在 Evidence Provider 的「未装 → `unavailable`，绝不静默 fallback」提成**全插件纪律**，冻结四条规则——只降级不抛错 / 必须可见 / 绝不冒充成功 / 缺件只陈述事实；并逐条盘点 9 条可选增强的缺件行为（摘要、语义召回 B 档、推理导航、知识树导航、`zg`、Projection Store、`retention`/`forget`/`compact`、`verify`，表见 ADR-0049）。**顺带修一个反例**：`evidence/gateway.ts` 的 `routeVerify` 在 provider 名不存在时**静默退回 fs**（`evidenceProvider` 拼错就会把「查不到这个 provider」说成「fs 已核实」）——v1.12.8 起改为 `status:"unavailable"` + `provenance.reason:"provider_unknown"`（`core/types.ts` 的 provenance 增可选 `reason`）。新增 `test/missing-dependency.test.ts` 锁住回归。
- **② 召回路由评测（C6，agent-skills 思路）**：新增 `test/recall-routing-eval.test.ts`——**正样本** 7 条（query → 期望 rank-1 一手入口）+ **负样本** 3 条（不得窜位：代码查询不得窜到 `references-agents/`、云函数 ≠ 页面、文档查询不得窜到通用工具类）+ **无匹配** 1 条 + **rank-1 棘轮**（排序快照钉住，改动排序必须显式更新期望）+ **主题键碰撞检测**（同一 `# 入口` 被不同记忆复用 → 报出；只算记忆原子，排除 `_index.md` / observer trace）。纯确定性；这是**回归门槛**，不是新功能。
- **③ `references.md` 三处更正**（研究 §六 提出、此前未落地）：OpenAI《Computer use》指南**不是两条并列路线**（主线是 Responses API `computer` 工具 + 旧预览迁移，实现上有三种 harness 形态）；「跨调用保持环境」方向写反了（原文是*续对话不恢复浏览器会话/登录态/运行时变量*，恰是 `Memory ≠ Evidence` 的正例）；hyperframes 补安装坑（裸 `skills` 装全量、`npx skills add` 必须 `--skill`/`--all`，且*缺件不许照记忆里的流程继续*——正是 ADR-0049 的外部来源）。出处说明写在该文件内（OpenAI 原文 2026-09-08 复核时站点对本机返回 403，按研究记录 + 第三方镜像校正）。
- **④ 杂项**：`.gitignore` 收掉 `docs/*.visual-check.*`（archify 视觉自检产物，可重出）。
- **验证**：`npx tsc --noEmit` exit 0；`npm run build` exit 0（`dist` 同步）；**20 个测试全 `ALL PASS ✅`**（18 既有 + 新增 missing-dependency / recall-routing-eval）；路由评测 rank-1 准确率 1.0；`dsh --profile web --dump-config` exit 0 且无 `Error:`。


## [v1.12.7] 代码审查修复：读侧换行根因 / 信封计数自洽 / 棘轮补齐 plan + 文档口径校正

对 v1.12.6 做了一轮独立代码审查（两个审查 agent，只读），逐条复核后修复。**其中 ① 是 v0.5 起就存在的读侧缺陷（不是 v1.12.6 引入），另修 6 处自检发现的问题。**

- **① 读侧输出被压成一行（根因修复）**：`security/scrub.ts` 的 `scrubFinal` 把整篇文档交给 `scrubUnsafe`，而后者剔的是 `[\u0000-\u001f]`——**连 `\t\n\r` 一起剔**，于是 16 个读侧模块精心拼的 Markdown（`> 引用`、条目分行、信封）全被压成一行（实测换行数 = 0）。修法：新增 `scrubUnsafeDoc`（保留 `\t\n\r`，仍剔其余 C0 控制符与双向覆盖符），`scrubFinal` 改用它；`scrubUnsafe` 原样保留给单行字段（线索头）。**边界**：只动读侧呈现，canonical 证据/记忆文件不变；注入短语与 HTML 标签仍被剥离，「数据非指令」前缀不变。
- **② 信封计数自洽**：`truncationNote` 原来 `未返回 = limit 截断 + 预算截断`，把冷却算进「原因」却不计入总数——全冷却时出现「未返回的命中：0 条」却实际丢了 N 条。修法：**总数恒取 `命中 − 返回`**，三个原因只作分解（`limit=X 上限 N 条` / `预算 … N 条` / `冷却 N 条`）；下一步按原因生成（只有冷却时不再建议「提高 max_tokens」）。未返回示例改为从 `scored − returned` 取（原先漏掉冷却项）。
- **③ 全冷却不再被误标成「近似候选」**：`available` 为空且原因是冷却时，原来会把**真实命中**当成「近似候选·未验证」。修法：`noMatchText` 支持自定义 `steps`/`approxLabel`，该分支给出「冷却中的命中（是命中，不是近似）」+ 冷却专属下一步。
- **④ 近似候选降噪**：`approxEntries` 原用 `hit / sqrt(条目 gram 数)`（单侧归一化，长入口吃亏）+ 阈值 0.35，实测 `approxEntries("todo")` 会把 `docs`/`mode`/`shadow` 这类只共享一个 bigram 的入口带进来。修法：对称归一化 `hit / sqrt(查询gram × 条目gram)` + 要求 `hit ≥ 2` + 阈值 0.25；查询不足 2 字符（含单个汉字）直接不给候选（2-gram 不成立）。
- **⑤ 棘轮补齐 `plan`（60 → 61）**：`query/planning.ts` 用 `String(args?.mode || "") !== "plan"` 声明 mode，旧正则抓不到，删掉 CONTEXT.md 的 `plan` 行测试仍绿。修法：补 `mode\s*\|\|[^)]*\)\s*[!=]==` 抓法、断言 `modes.size === 61`、把搜索范围切到「mode 参考」小节内（避免正文别处蒙混）、路径改用 `import.meta.url`（cwd 无关）。
- **⑥ 其余小修**：`deprioritizeFactor` 容忍字符串配置；debug 分数保留一位小数（原 `Math.round` 把 ×0.4 的差异抹掉）；debug 的降权标记改用 `breakdownOf().deprioritized`（原字段是死的）；`mode` 描述补 `real-refer`（`reality*` 通配不到）并写明 `dsh-shadow 仓库的`；`rank.ts` 注释「前缀」改为「子串」（实现是 `includes`）；`CONTEXT.md` 修正布尔分派清单（`kg`/`observer` 是输出修饰，不参与分派）与 `model` 一行语义（查一条 RealityClaim + Lineage，不是跨类型查询）。
- **文档口径校正（v1.12.6 条目同步更正）**：mode 描述长度**同一口径**为 **1747 → 488**（v1.12.6 时把 1789=含 `mode: { type… }` 外壳的片段与 488=描述值混比）；棘轮覆盖数 v1.12.6 实为 **60/61**（漏 `plan`）；「召回权重与公共契约不变」精确为「`deprioritize` 关闭时默认权重与工具契约不变」。
- **验证**：`npx tsc --noEmit` exit 0；`npm run build` exit 0；**18 个测试全 `ALL PASS ✅`**（含新增集成断言：换行保留、信封计数自洽、冷却总数、全冷却不误标、预算截断计数、`recall` 空分支下一步、近似候选降噪、`plan` 棘轮）；实测 mode 描述 1747 → 516（补 `real-refer` 后）；实测读侧换行数从 0 恢复为多行。


## [v1.12.6] 参考材料落地三项（mode 描述下沉 / 召回信封 / deprioritize）+ claude-mem 参考材料清理

把 2026-09-08 参考材料研究（`_reports/2026-09-08-dsh-shadow-references-study.md` §二「第一档」）里剩下的三项落地；同版含用户拍板的 claude-mem 参考材料清理。**三项都无 LLM、无新依赖、不引向量库（ADR-0001）；`deprioritize` 关闭时默认召回权重与工具契约不变。**

- **① `mode` 描述下沉**（借 mattpocock/skills 的 context-load 尺子 + hyperframes 的「下沉 + 指针」）：`read_shadow` 的 `mode` 参数描述 **1747 → 488 字符**（同一口径：描述值本身；只留常用 mode + 指针），完整 **61 个 mode** 的语义/入参/返回移入 `CONTEXT.md` 新增「mode 参考」表（按 14 个源码族分组）。**棘轮**：`test/recall-envelope.test.ts` 扫 `query/*.ts` 声明的 mode（`MODES`/`modes:`/`mode ===`），逐个要求在 `CONTEXT.md` 出现——新增 mode 不写文档即测试红（v1.12.6 时覆盖 60/61，漏了 `plan`，v1.12.7 补齐）。
- **② 召回信封**（借 PageIndex「成功/失败统一为带下一步的信封」）：`query/query.ts` 主召回不再静默 `break`——预算 / `limit` / 冷却砍掉的命中在结果末尾**自报家门**（`未返回的命中：N 条 · 原因 · 示例入口 · 分数` + 下一步），并进 debug trace（`limit 截断 N` / `预算截断 N`）；`retrieval/render.ts` 的 `noMatchText` 从死路改为「四条可执行下一步 + 近似候选」（新增 `approxEntries`，确定性 2-gram，显式标『近似·未验证』）；`core/recall.ts` 的 `renderRecoveryFor` 空任务分支同样给下一步。**全部返回时零多余文字**（`truncationNote` 返回空串）。
- **③ `recall.deprioritize`**（借 codegraph 的三态配置：把「移除」和「降权」当两件事）：`retrieval/rank.ts` 新增 `deprioritizeFactor`（`DEPRIORITIZE_FACTOR = 0.4`，反斜杠/大小写归一），配置 `rawConfig.recall.deprioritize: string[]`（默认空 = 不降权）；命中的 `rel`/`entry` 含该**子串**时**只降权、不移除**（仍可搜到，只是排名靠后）；`breakdownOf` 带 `deprioritized`，debug 逐条显示 `降权(deprioritize)` 并有汇总行。
- **④ claude-mem 参考材料清理**（用户 2026-09-08 拍板「全删」）：插件内 7 处 `thedotmack/claude-mem` 提及清零（`references.md` 清单 + 分类、ADR-0001/0038/0039 的对照论述、`CHANGELOG.md`、`MEMORY.md`、`security/scrub.ts` 的出处注释与 `SYSTEM_TAG_NAMES` 里的 `claude-mem-context`）；删除工作区克隆 `vendor/_src/claude-mem`（1108 文件 / 140.8 MB）。**行为变化**：写侧 `stripSystemScaffold` 不再剥离 `<claude-mem-context>` 块（读侧 `scrubFinal` 仍剥通用标签）。
- **验证**：`npx tsc --noEmit` exit 0；`npm run build` exit 0（`dist` 同步）；既有 17 个测试 + 新增 `test/recall-envelope.test.ts` 全 `ALL PASS ✅`；mode 描述 1747→488 字符（同一口径实测）；`CONTEXT.md` 覆盖源码声明的 60/61 个 mode（棘轮当时漏 `plan`，见 v1.12.7）；`read_shadow` 公共契约（`mode` 串、参数名）未改。


## [v1.12.5] 文档：README 补「默认开关总表」「谁能调用权限轴」「给 agent 的文档入口」+ 安全表补降级/取消

**纯文档，无代码 / 配置 / 行为变化**（改动仅 `README.md`；`npx tsc --noEmit` exit 0；`node test/recall-attribution.test.ts` → `ALL PASS ✅`）：

- **补齐 4 条参考材料里尚未落地的部分**（v1.12.3 已吸收失败模式表 / 模式路由表 / 粘贴式安装 / 安全边界对照，本轮补剩余）：
  - **「默认开关（装完什么都不动会怎样）」表**（借 hyperframes「安装克制：核心集常驻、其余按需装，不会在背后偷偷拉全套」）：15 行覆盖采集、`summary`、`queryLog`、`episodes`、`recall`（含 `cooldownTurns`/`debug`）、`retention`、`forget`、`compact`、`llmRecall`、`projectionStore`、`knowledgeEngine`、`kg`、`evidenceProvider`；默认值逐项对 `core/types.ts` 的 `ShadowConfig` + `core/writer-core.ts` / `query/observatory.ts` / `core/forget.ts` / `core/projection-store.ts` / `query/reads.ts` 的判定语句核对（`=== false` 才关=默认开：采集/摘要/查询观测/episodes；`!== true` 即关=默认关：其余）。
  - **「谁能调用（用户显式 vs 模型自动）」表**（借 mattpocock/skills 的权限轴）：模型可自动调用 = 三个只读工具及其 `debug`/`verify`/`kg` 变体；仅用户显式要求 = 开 `retention`/`forget`/`compact`/`projectionStore`/`knowledgeEngine`、`writeConsent: true` 后的落盘。
  - **开头加「给 agent 读的入口」一行**（借 OpenAI 指南的机器可读文档入口）：`AGENTS.md` / `CONTEXT.md` / `adr/`；仓库无 `llms.txt`，用现有三处代替，不新建文件。
  - **安全边界表第 4 行补「支持取消」**：写明每个 LLM 增强（摘要 / 语义召回 / 推理导航 / 知识导航）都有 `timeoutMs`，失败或超时静默退回确定性路径、不阻塞主路径。
- **验证**：`npx tsc --noEmit` exit 0；`node test/recall-attribution.test.ts` → `ALL PASS ✅`；两个新表逐行对照源码默认值判定语句；`git diff --stat` 仅 `README.md` + `package.json` + `CHANGELOG.md`。


## [v1.12.4] 文档清理：去掉「一切皆文件」口号（当前口径）+ package.json 描述同步

**纯文档 / 注释 / 预设文案，无代码行为变化**（`npm run build`、`npx tsc --noEmit` 均 exit 0；`node test/recall-attribution.test.ts` → `ALL PASS ✅`）：

- **口号清理**（口径：只清「当前口径」，历史原文保留）：`index.ts` 头注释 2 处、`core/writer.ts` 注释 1 处、`CONTEXT.md` 术语表（原「一切皆文件」行改为「一条记忆 = 一个文件」，并把该表 3 处 `shadow/` 修正为 `.shadow/`）、`agent-presets/projection/preset.yml` 的 description、`agent-presets/projection/agent.cordis.yml` 的 persona；`dist/` 重编译同步。
- **package.json**：`description` 去掉「一切皆文件，」，与 README 口径一致。
- **保留（历史原文，不改写）**：`adr/0001`、`adr/0039`、`adr/0043`、`MEMORY.md`。
- **安装副本同步**：`~/.dsh/.agent-presets/projection/` 先备份（`.bak-20260908_171721`）再覆盖，SHA256 与仓库一致（`0B7C787A6F3B` / `8597A0259D6E`）。
- **验证**：当前口径 9 个文件（源码 / 文档 / 预设 / dist / README / package.json）grep 无匹配；仓库内剩余匹配仅历史 ADR/MEMORY 与 archify 产物；回归测试 ALL PASS。


## [v1.12.3] 文档：README 开头重排（失败模式 / 模式路由表 / 粘贴式快速开始 / 安全边界）+ 补充材料登记

**纯文档，无代码 / 配置 / 行为变化**（`npx tsc --noEmit` exit 0；改动仅 `README.md`、`references.md`）：

- **README（+68 行；正文能力清单与安装/验证节未动）**：
  - 「谁该用它」一句定位；
  - 「为什么存在」7 条失败模式 → 修法表（换会话失忆 / 只记动作不记理由 / 召回无证据 / 记忆过时 / 系统提示与密钥混入 / 把记忆当指令 / 上下文膨胀）；
  - 「什么情况用哪个」模式路由表：14 个日常入口（`read_shadow()` 无参 / `topic` / `debug` / `decision` / `episode` / `task` / `context` / `observer` / `identity`·`soul`·`taste`·`experience`·`judgment` / `knowledge` / `verify` / `shadow-report`·`query-log` + `recall_shadow` + `shadow_query`）+ 长程与边界族 mode 一行，mode 串按 `query/reads.ts`、`query/*.ts` 实测核对；
  - 「快速开始」给 agent 的粘贴式安装提示（link: 依赖 + bundles + `pnpm install` + `dump-config` + 落盘验证 + `recall_shadow` 冒烟）；
  - 护栏下新增「安全边界」表：把 OpenAI《Computer use》指南四条控制（限制环境 / 内容当不可信 / 有后果动作要确认 / 设上限并看真实结果）对照到本项目落点。
- **references.md（+55 行）**：登记用户 2026-09-08 提供的 4 条补充材料并逐一联网核实——OpenAI《Computer use》工具指南、`browser-use/browser-use`、`heygen-com/hyperframes`、`mattpocock/skills`（star / 许可 / 最近提交按 GitHub API 记录），每条给出「是什么 / 值得借鉴什么 / 与 dsh-shadow 的关系」，末尾汇总四条共同点。
- **验证**：表格完整性脚本 4 个表 0 不一致、无转义竖线残留；`ContextStatus` 与 `core/context.ts` 一致；`npx tsc --noEmit` exit 0；`git diff --stat` 仅文档两文件。


## [v1.12.2] 架构加固：读族 seam 全迁 + fan-in 收窄 + 概念核 guard 测试 + writer capture/materialize 拆分

**把架构审查候选 1/2/3/4/5 全部落地，行为零变化、公共契约不变（read_shadow/recall_shadow/shadow_query + mode 串 + execute(args)），17 测试文件全过：**
- **读族 seam 全迁（候选 1/5）**：`query/reads.ts` 收齐 episode/decision/task/context/recall/index/knowledge/shadow-manifest/query-log/shadow-report/query 全部读概念；`query.ts` 由 811 行收至 **350 行**、95→**40** import、**0 条内联 mode 分支**（原 50），14 个读族 seam + contverify 由单一分发器路由。
- **cycle 打破（候选 5）**：`NodeType` 下沉 `core/lineage.ts`，破除 `lineage-validator↔node` 唯一类型循环；并清掉读族迁移残留的 38 个死导入。
- **knowledge-engine 三 seam（候选 4）**：拆成 `knowledge-structure/retrieval/cost` 三模块 + `knowledge-engine.ts` **barrel**（原 import 面不变）。
- **概念核深模块可测（候选 3）**：新增 `concept-guards.test.ts` × 2——覆盖 agency/delegation/recall/adaptation/long-horizon + federation/reality/world/sim/planning/continuity 的全部 guard 不变式（~1400 行未测→可验证）。
- **writer capture/materialize seam（候选 2）**：收敛 4 次 LLM stream scaffold（`writer-llm.ts`）+ 抽纯渲染器（`writer-render.ts`）+ 拆 `writer-core/capture/materialize` 三 seam（`writer.ts` 组合根 134 行）；新增 `writer-write.test.ts`（mock-fs 驱动 flush 落盘）补写路径覆盖。
- **验证**：tsc + build + **17 测试文件**全 ALL PASS；公共契约不变（recall-attribution/episode-lineage/query-observatory 等黑盒全存活）。


## [v1.12.1] 架构重构：ReadQuery seam + materializeAtoms（收敛读模式 monolith）

**把 `query.ts` 的读模式 monolith 立成深 seam（架构审查候选 1，方案 A 首刀）**，行为零变化：
- **`query/materialize.ts`**：`MaterializedView` + `materializeAtoms`（listMemories→过滤遗忘/收口→parseMemory 的**唯一定义**）——收敛 query.ts 里重复 7–12 次的「读→过滤→parse」脚手架（locality）。
- **`query/reads.ts`**：`ReadQuery` seam（`modes[]` + `run(deps,args,exec,ctx)`）+ `readQueries` 注册表 + `dispatchReadQuery`；先把**最复杂的 `shadow_query`** 迁为该 seam 的第一个深模块（含 Projection 缓存 + 旁路观测 + Evidence Gate）。
- `runReadShadow` 顶部先 `dispatchReadQuery`（命中即交模块），`mode:"query"` 分支移除；其余读/命令分支仍内联（候选 3 再收）。
- **public 契约不变**：`read_shadow/recall_shadow/shadow_query` 表面 + `mode` 串 + `execute(args)` 完全不变（recall-attribution 4207 行黑盒 + episode-lineage + query-observatory 全存活）。`CONTEXT.md` 增补 `ReadQuery seam` 术语。
- **验证**：tsc + build + 14 测试文件全 ALL PASS（lineage/evidence-gate/atom-kind/query-observatory/episode-lineage/recall-attribution/…）。


## [v1.12.0] Candidate ③④⑦⑧（确定性去噪/格式抽取/引用/Manifest）

**实现 ADR-0048 候选项**（此前留待，现启用）：
- **③ 内容分类去噪**（PageIndex `flash/classification`）：`isBoilerplateLine`——剔除目录/页眉页脚/代码块标记/TOC 点线；`cleanLines` 只留正文/标题。
- **⑦ 按格式结构化抽取**（zg `retrieval/*`）：`buildTree` 改为格式感知——**code→包树**（路径分层）、**document→标题树**、**text→段落树**；纯确定性，无 LLM。
- **④ 树即 agent 工具 + 引用**（PageIndex `agent_tools.py`）：`sectionPath`（根→节点路径）+ `renderKnowledgeRetrieval`（检索结果带**节路径引用/溯源**）；`mode:"knowledge"` 检索带引用。
- **⑧ Manifest / 可观测**（zg `manifest.json`/`status --debug`）：新增 `core/manifest.ts`（`ShadowManifest`：版本/构建时间/节点数/来源数/失败项）+ `writeManifest/readManifest/renderManifest`；投影 store `rebuild` 回写 manifest；`read_shadow({mode:"shadow-manifest"})` 诊断读面。
- **边界**：全部纯派生/无 LLM；不集成 PageIndex/zg；不向量化（ADR-0001）。**验证**：manifest 新增 + knowledge-engine（③去噪/⑦格式/④引用）+ projection-store（manifest 回写）+ 全量回归 ALL PASS（14 测试）。


## [v1.11.0] Deeper PageIndex + zg Ideas（成本/渐进披露/增量索引/授权，ADR-0048）

**再次深入 PageIndex/zg 源码，吸收更深的 4 项思想**（ADR-0048）：
- **①成本感知树优化**（PageIndex `tree_optimize.py`）：`refineTree`——链式合并（单叶子孩子吸收）+ 便宜子树折叠（子树规模 ≤ minPages 则合并，**子标题存 `keyItems`**），使 Knowledge 树**检索代价有界**。
- **②渐进披露树**（PageIndex `page_index_md.py`）：`progressiveDisclosure`——内部节点 `summary`（标题+节数，路由用），**叶子保留 `content`=全文**；"只读推理到达的节点"（上下文经济）。
- **⑤change-set 增量索引**（zg `daemon/change-set.ts`）：新增 `core/change-set.ts`（`ChangeSet`：created/changed/deleted + 目录 rescan + `pathCoveredBy` 去重 + `maxChangedPaths` 超阈值→强制全量对齐）；`JsonlProjectionStore.invalidateFor(set)` **只移除变更 rel 的节点**（保持其余缓存）。
- **⑥授权范围搜索**（zg `authorization/*`）：新增 `core/authorization.ts`（`inScope`/`authorizeScope`：workspace 内放行 / `denied` 优先排除 / `allowed` 扩展；无 workspace 保守放行）；`IndexEngine` zg 候选经 `authorizeScope` 过滤（防越权泄漏）。
- **边界**：结构确定性（树/成本/增量/授权均**无 LLM**）；不集成 PageIndex/zg；不向量化（ADR-0001）。**候选**（③④⑦⑧，未实现）留待后需。**验证**：change-set / authorization 新增 + knowledge-engine（渐进披露/成本 refine）+ projection-store（invalidateFor）+ 全量回归 ALL PASS（13 测试）。


## [v1.10.0] Knowledge Engine LLM 树上导航（PageIndex `chat=` 步，ADR-0047 落地）

**把 PageIndex 的"检索 = LLM 在树上推理"落地为 dsh-shadow 的 Knowledge 检索**（`mode:"knowledge"` + topic）：
- **LLM 树上导航**：`knowledgeNavigate`（`writer.ts`，同 `recallSelect` 模式）——给候选章节（`flattenSections` 展平树），LLM 只**选章节编号**（导航/排序），**事实仍从树派生**（页面说"让最强大模型在树上推理检索"，我们只让它选章节，不生成内容）。
- **边界（ADR-0043/0047）**：LLM **只导航/排序，绝不创造事实/关系**；`config.knowledgeEngine.llmNavigate.{enabled,provider,model}` 门控（默认 off）；失败/未配置 → 回退确定性 `retrieveKnowledge`（行为不变）。
- **`mode:"knowledge"`**：topic → LLM 导航（可选）+ 树上检索；无 topic → corpus 级 file 树（模块→文件→章节）。
- **配置**：`ShadowConfig.knowledgeEngine.llmNavigate`；`ShadowCollector/ShadowQueryDeps` 加 `knowledgeNavigate`。
- **验证**：knowledge-navigate（端到端，LLM 未配置→确定性回退不崩溃）+ knowledge-engine（corpus 树/检索/flattenSections）+ index-engine + 全量回归 ALL PASS。


## [v1.9.0] Projection Store + Index Engine + Knowledge Engine（Phase 1B/2/3 骨架）

**把 v1.8.0 的可证明事实层接上「性能缓存 + 候选生成 + 规范树」**，全部**可插拔、默认关**（不改现有行为），严格遵守 ADR-0046 边界：
- **Phase 1B Projection Store**（`core/projection-store.ts`）：`ShadowProjectionStore` 接口（save/load/invalidate/rebuild）+ `JsonlProjectionStore` 首版（`.shadow/shadow-index/nodes.jsonl`）+ `loadOrBuildProjection`（命中缓存/未命中重派生回写；`config.projectionStore.enabled` 默认关→行为不变）。**Performance 不是 Storage**：只缓投影，rm -rf 可重建。
- **Phase 2 Index Engine**（`core/index-engine.ts`）：`IndexEngine` 候选生成抽象 + `createIndexEngine`（`config.indexEngine.provider = fs(默认全量扫描) | zg`）；zg 复用 `zgEvidenceProvider`，**未装→unavailable，绝不静默 fallback 成 verified**（证据契约）；`read_shadow({mode:"index"})` gated 读面。
- **Phase 3 Knowledge Engine**（`core/knowledge-engine.ts`）：从规范/文档 Atom **保留树**（规范→章节→条款→约束），**不转 vector/chunks**（与 RAG 本质区别）；纯派生、不新增事实；`read_shadow({mode:"knowledge"})` gated 读面。
- **收尾（v1.8.0 内）**：`mode:"index"` 候选生成、`mode:"knowledge"` 规范树、`projectionCached` 观测标记、`config.projectionStore/indexEngine/knowledgeEngine`。
- **边界**：gate 保持在 shadow_query（认知查询）；zg/PageIndex 作为可插拔 provider（工具在位才激活，未装→unavailable）。**验证**：lineage/evidence-gate/atom-kind/projection-store/evidence-b2-write/index-engine/knowledge-engine/query-observatory/episode-lineage/recall-attribution 全 ALL PASS。


## [v1.8.0] Evidence Lineage Layer（ADR-0044/0045/0046）

**让每个高价值认知单元都能回答"这个东西为什么存在、它来自哪里"**——提高**可信度与可审计性**，不是搜索/知识。落地核心：
- **数据模型**：`core/lineage.ts` 新增 `AtomLineage{source,createdBy,evidence:EvidenceRef[],createdAt}` / `EvidenceRef{type,locator,fragment}` / `AtomKind(experience|metadata|session|task|artifact)` / `CreatedBy`。**source≠evidence**（source=产生处，evidence=支撑材料）。
- **Atom schema**：`ParsedMemory` 加 `kind?`/`lineage?`（兼容旧 Atom，**不做 migration**）。
- **写侧采集（B2）**：`buildClueHeader` 已把当回合 `fs/observed` + 用户引用材料写进同一原子的 `> 背景/材料`；读侧 `parseMemory` 据此**派生** `lineage.evidence`（event-sourced，**非 LLM 补写**）。
- **Validation Gate**：`core/lineage-validator.ts` `validateAtomProjection`——`memory+kind∈{metadata,session}` → reject；`decision 无 evidence` → reject（**Atom 保留**，决策发生过≠可靠）。
- **Projection/Query**：`deriveShadowNodes` 只投影过 gate 的 Atom（**不猜 evidence/不补 lineage/不调 LLM**）；`shadow_query` 透明升级，只返回可证明节点。
- **Report**：`shadow-report` 的 Evidence Density 按 **type / kind / createdBy** 三维统计（`evidenceBreakdownOf` + 聚合 + 渲染）。
- **测试**：`test/lineage.test.ts` / `test/evidence-gate.test.ts` / `test/atom-kind.test.ts`（无证据 decision 不进 query、metadata memory 不进默认查询、projection 无 generate/infer/guess）。`episode-lineage` 场景12 跟随 gate（decision 需 evidence 才命中）。
- **真实数据验证**（OpenAPI-Gateway 52 原子）：**52 → 14 个可证明节点**，正确排除 33 个 metadata memory + 5 个无证据 decision，保留 document(9)+code(4)+task-kind(4)。
- **边界**：不做 `nodes.jsonl` / Projection Store / zg / PageIndex / Graph 关系扩展 / 自动经验总结。**验证**：lineage / evidence-gate / atom-kind / query-observatory / episode-lineage / recall-attribution 全 ALL PASS。


## [v1.7.2] Shadow Fitness Report（Phase 1A.6）

**把 query-log 变成"是否升级索引层"的客观依据**——`read_shadow({mode:"shadow-report"})` 把 `query-log` 聚合 + 扫记忆做 **missing-types 启发式**（`missingTypesOf`：检测约束型/任务型内容被归错类型，≥3 处才提示，防单例噪声），生成 `.shadow/shadow-report.md`（系统派生，rm -rf 可重建）。**报告四段**：`Query Summary`（总查询/候选→返回/延迟）、`Evidence Density`（有证据节点/总返回节点，核心指标 dsh-shadow vs 普通 RAG）、`Stability`（重复查询的 Node 稳定/漂移）、`Node Distribution` + `Potential Missing Types`。**关键指标 Evidence Density** = 有证据返回节点数/总返回节点数；dsh-shadow 坚持「宁可少回答，不要无证据上下文」（阈值默认 90%）。**边界**：**只诊断、不增强**；判定是启发式观察（best-effort、无 LLM、不下结论），标注依据；缺失类型只在真实数据反复需要时才采纳（**不理论驱动、不提前补 task/constraint**）。**验证**：场景 Query-Observatory-5~6（shadow-report 落盘 + missing-types 启发式 ≥3 才提示）+ 全量回归 ALL PASS。


## [v1.7.1] Shadow Query Observatory（Phase 1A.5）

**先跑真实数据，不急着定型 nodes 结构**（用户判断：最贵的是"第一次知道 Agent 到底需要记住什么"，过早固化 nodes.jsonl 是最大风险）。在 `shadow_query`（`mode:"query"`）**旁路记录观测**：写 `.shadow/query-log/<date>.jsonl`，每条含 `date/ts/query/scope/limit/candidateNodes/returnedNodes/evidenceCount/evidenceNodes/relationCount/relationNodes/nodeTypes/nodeTitles/latencyMs`（query/title 轻量 scrub：密钥打码 + 剔控制/双向字符）。`read_shadow({mode:"query-log"})` 只读汇总：命中/证据/关系/类型/scope 分布 + **重复查询的 Node 稳定性**（同一查询 nodeTitles 是否一致，答"Node 是否稳定"；漂移则列出该查询的不同结果集数）。**边界（Shadow Contract）**：观测是**系统派生记录**（`rm -rf .shadow/query-log` 不影响任何 Atom）；只在 `shadow_query` 入口打点，**不进 derive 真相路径**；**写失败静默**，绝不改变 query 返回值；**默认开启**（`config.queryLog.enabled=false` 才关）。**核心问题（供真实数据回答）**：①Node 每次派生是否稳定；②`memory/code/document/decision/concept` 是否够（真实查询冒出的 `task/constraint` 再补）；③`relations`（references/objective/belongs_to）是否够（真实需要 `implements/depends_on/contradicts/supersedes` 再加，**不提前设计 Graph**）。**验证**：场景 Query-Observatory-1~4（旁路写 log / 汇总读 / 同查询稳定 / query-log 不进记忆枚举）+ 全量回归 ALL PASS。


## [v1.7.0] Shadow Projection Layer（Phase 1A，ADR-0042/0043）

**把 ShadowNode 初始化落地**——`shadow_query({query, scope, mode, evidence})` 把记忆**统一派生为 ShadowNode**（`type: memory|code|document|decision|concept`，带 `source/evidence/relations`），跨类型查询返回**带 evidence 的 context**。**守 Shadow Contract（ADR-0043）**：Node 是**派生投影**（非事实源，可重建/rm -rf 无影响）；`evidence` 指向 Atom（源文件/文档），**无证据不返回**；`relations` 只从**可观察信号**派生（`references`=材料路径、`objective`=goal、`belongs_to`=项目），**LLM 不能制造关系**。`read_shadow` mode 新增 `query`；新增 `shadow_query` 工具。**验证**：场景 12（跨类型统一 ShadowNode + evidence 可追溯）+ 全量回归 ALL PASS。


## [v1.6.0] recall_shadow LLM 推理导航（对齐 PageIndex 免向量、推理式检索）

把 `recall_shadow` 从"关键词相似度召回"升级为"**LLM 推理导航选中任务**"（`config.llmRecall` 门控，默认关）。开启时：给 LLM 候选任务列表（title/objective/摘要），LLM **只输出最相关任务编号**（意图识别+排序）；`recall_shadow` 再沿"任务树"渲染恢复包。**边界**：LLM 只做**导航/选择（Context Planning）**，Bundle 内容仍全来自派生数据（Task/Decision/Evidence/Outcome），**不补 Reason/事实/判断**；LLM **关/失败**回退确定性 `bestTask`（行为不变）。**参考**：VectifyAI/PageIndex（`similarity≠relevance，relevance 需 reasoning`；树索引+LLM 推理遍历+可追溯）——已克隆到 `vendor/_src/PageIndex`。**验证**：场景 11（LLM 导航覆盖确定性 + 关闭回退）+ 全量回归 ALL PASS。


## [v1.5.1] Active Context Projection（"现在继续要记住什么"）

给 `recall_shadow` 的恢复包加 **Active Context** 段——`已完成/已决定 / 未完成待厘清 / 约束 / 最近决策 / 入口位置`。**全部来自派生数据**（Decision/Outcome/未明确理由决策/Constraint/任务状态/入口），**不是建议、不是推理、只是恢复**；也**不**让 LLM 生成。这补上 Cursor 式"Continue where you left off"体验——用户第二天打开，`recall_shadow` 直接给"继续工作状态"。**验证**：场景 10（恢复包含 Active Context）+ 全量回归 ALL PASS。**不碰** Entity/自动总结/自动补任务状态。


## [v1.5.0] Shadow Usability Layer（从"架构对"到"人能用"）

**补上使用闭环**——`recall_shadow(query)` 人类友好入口：给一句自然查询（如「Todo清理」「上次 OAuth 问题」），返回 **Task Recovery Bundle**（任务/状态/启发式观测/关键决定(含理由)/证据(当前是否仍有效)/观测结果/当前注意/未明确理由的决策）。底层把 `read_shadow` 的 episode/decision/task/context 视图合成一段**人类可读**内容。**原则**：内容全来自派生数据（task/decisions/evidence/outcomes/constraints），**绝不 LLM 补写 Reason/事实/判断/完成**（呼应 ADR-0037/0039/0040）；LLM 只在【意图识别+结果排序】参与（外部可选，默认确定性评分）。`read_shadow` mode 新增 `recall`（同一引擎）；systemPrompt 改为引导用 `recall_shadow`。**验证**：场景 10（recall_shadow → Task Recovery Bundle，含状态/关键决定/观测结果）+ 全量回归 ALL PASS。


## [v1.4.0] Context Recovery / 上下文复核层（ADR-0040 实现）

把证据路径派生成 **ContextReference**（`read_shadow({mode:"context"})`）——`subject / value（引用路径）/ source（来源 Evidence Pointer）/ status（validated|stale|unknown，经 fs 复核）`。**对齐 Cursor 三层但保持 Observer 原则**：①**P0 Candidate+Revalidate**（`Memory→Candidate→Validation→Current Context`，禁 `Memory→Truth` 直通；路径非永久事实，发现过期就重扫）；②**P1 Evidence Pointer**（"为什么知道这个"的来源）；③**P2 Transformation Trace**（`Mapping≠Source Fact`：`context:{mappings:[{from,to,rule}]}` 转换视图标注规则、**非事实**）。**Invariant**：`Memory≠CurrentState / Context≤Validation / Replay≠CurrentEnvironment / AvailablePath≠ValidPath`。**ContextReference 不是 Memory**（Memory=曾经观察到；ContextReference=当前是否还能用）。**验证**：场景 9（ContextReference 的 P0 复核 validated/stale + P1 来源 + P2 转换痕迹）+ 全量回归 ALL PASS。


## [v1.3.0] Task Lifecycle / 一等任务对象（ADR-0039 实现）

把「Memory Atom 不是最高抽象」落地——新增 **Task** 层（`read_shadow({mode:"task"})`），把记忆**派生为任务生命周期一等视图**：`title / trigger（用户触发）/ objective（`> 目标：`）/ constraints（用户提醒）/ status（启发式观测：active|completed|abandoned）/ 决策链（Decision with reason）/ 观测结果（ObservedOutcome）/ 证据 / 生命周期时间`。**沿 ADR-0038 纪律**：Task 是**读侧派生的投影**（不是写侧事实源），写侧仍产 Memory Atom（事实层）；`parseMemory` 新增 `userMessages`（供 trigger/constraints）。**沿 ADR-0039 边界**：①**Outcome≠Success**——结果只记`观察文本`（`mvn test：85 tests passed`），**禁** `success:true`/「方案正确」；②status 是**启发式观测**（非判断），标明依据；③**Task ≠ Episode**（Task=生命周期理解单位，Episode=阅读窗口）；④Replay/决策链由 lineage 派生。**验证**：场景 8（task 生命周期视图 + Outcome≠Success）+ 全量回归 ALL PASS。


## [v1.2.2] Episode 收口归档（对齐参考：会话级聚合+只留摘要+原始归档）

dsh-shadow 补上"**收口**"——`compact:{enabled,gapMinutes}`（默认关）：当一个 episode 结束（出现下一个 episode）时，把该 episode 的所有 turn 原子**合并成 1 个 consolidated 文件**（保留 决策/动作/材料/结果/用户消息），个体原子 mark `status=compacted` 并**移出活跃索引/召回**（文件保留、可回放，Forget≠Delete）。活跃树由"每 turn 一文件"→"每 episode 一 consolidated 文件 + 当前 open episode 原子"，**热集文件数大降**。读侧召回/索引/Episode/Decision 均跳过 `compacted` 原子。**验证**：场景 7（收口生成 consolidated、原子压缩归档、决策可回放）+ 全量回归 ALL PASS。**边界冻结：ADR-0038（Episode Consolidation Boundary）**——Episode = 投影非事实、Compact≠Forget、Summary≠Reality、Closed Episode≠Completed Truth、**Replay 必须活过收口**；且**不做方向 A（写侧按 episode 成文件）**，Episode 是 derived boundary 而非 write boundary，写侧仍产 Memory Atom（事实层）。


## [v1.2.1] 索引懒构建 + 缓存隔离（v1.2.0 修正）

①**索引改懒构建**——flush 只写文件+增补缓存+置 dirty，**不再同步 rebuildIndex**；`read_shadow` 无参读索引时才触发 `ensureIndex` 构建/落盘（索引=派生产物，不应每次写都全量重建）。②**修复 L2 缓存跨 workspace 隔离 bug**（v1.2.0 的单 Map 缓存会把 A 工作区记忆混进 B 的索引）——改为**按 ws 嵌套**，dirty 也按 ws。③冷启动全量读只在首次读索引时发生一次。**验证**：场景 11 隔离回归 + 场景 16/2/6 懒索引各自 ALL PASS。


## [v1.2.0] 增量索引 + 遗忘（性能热路径根因）

解决"小文件太多影响性能"。根因＝每次 flush 都 `rebuildIndex` 全量**顺序**重读所有记忆文件（O(N) 次 fs 读，WSL 网络 FS 下更慢）。①**L2 增量索引**：进程内 `indexCache`（rel→{entry,topics,parsed}），冷启动读一次、之后 flush 只增量增补并**由缓存生成 `_index.md`，不再全量重读**；②**遗忘（Forget≠Delete，ADR-0031）**：`forget:{enabled,staleDays,minHits,maxActive}` 把低价值/旧/已归档记忆**移出活跃索引与召回扫描**（文件保留，仅不再被当作活跃知识），封顶热集大小；读侧 `read_shadow` 召回同样跳过已遗忘。**默认关**（`forget.enabled=false` 行为不变）。**验证**：场景 6（遗忘从活跃索引/召回剔除、文件保留）+ 全量回归 ALL PASS。**边界**：无 LLM、不改 Memory Atom 格式、Memory 仍是 source of truth（遗忘只影响"活跃"视角）。


## [v1.1.3] 派生层读侧去重（第三次 Replay 发现的正确性修正）

`parseMemory` 在同一记忆里既读新 `> 决策：` 块（全量 statement）又读 legacy `> 用户提示/决策：``〔decision〕``（buildClueHeader 截断到 48 字版），字符串不同 → 没去重 → 把**同一条决策数成 2 条**（写侧 `概况:K 决策` 是对的，读侧 deriveDecisions 虚高）。修正：有 `> 决策：` 块时不再重复走 legacy 路径（旧数据无块仍走 legacy）。**验证**：真实第三次 Replay 读数从"2 条"回落为与 `概况` 一致的"1 条"；全量回归 ALL PASS。**结论要点（第三次 Replay）**：新数据捕获到 1 条**锚点/定位决策**（`…这是 openapi 的 U8 工作区 里面有 openapi 模块`）——Precision 100% / Recall 100% / Source Traceability 100% / **Reason Coverage 0%**（该锚点声明本质上不含"因为"，非解析漏）。


## [v1.1.2] 决策识别放宽：范围/聚焦 + 锚点/定位（按真实回放发现的 Recall 缺口）

第二次 Replay 用你的 ground truth 算出 **Decision Recall = 0%**——旧 `classifyUser` 只认「选择类动词」（删除/保留/采用/就按…），漏掉用户真正短促的**关键决策**：①**范围/聚焦**（`"资产同步"` = 当前做哪块）、②**锚点/定位**（`"…这是 openapi 的 U8 工作区"` = 事实基准在哪）。v1.1.2 新增 `decisionClass()`：`selection | scope | anchor` 三类，`classifyUser` 据此归类（三者也计入 `> 决策：`/`> 概况：K 决策`）。**仍在冻结边界内**：只识别「原文明确存在」的声明（无 LLM、不补写 Reason、Confirmation/请求理解不算决策）。**验证**：场景 5（`资产同步`/`…U8工作区` 捕获、`了解 当前 IO` 不算）+ 全量回归 ALL PASS；真实数据反事实＝新分类器能识别那条 2 条真决策（旧采集丢失、Recall 0%）。


## [v1.1.1] Decision Capture Boundary（补齐"什么决定真的发生过"的事实入口）

v1.1.0 解决了「碎片怎么串」；v1.1.1 补上真正缺失的**事实入口**——决策在发生的瞬间作为一等事件进入 Memory。写侧在 goal 事件 / 用户拍板 / assistant 明确决策处采集 `DecisionEvent`（statement + source + lineage），并**分离「决策事实」与「决策理由」**：`> 决策：`(事件) / `> 决策理由：`(仅原文明确表达) / `> 概况：K 决策`。**边界**：Reason 绝不 LLM 补写（Evidence≠Interpretation；有 Decision ≠ 一定有 Reason，缺则显示「未明确」）；`classifyUser` 把「好/可以/行/ok」归 **Confirmation** 而非 Decision；assistant 决策经 `extractDecisionStatement`/`extractReason` 保守抽取；`mode:"decision"` 可回答"为什么做这个决定"并追溯原始事件。**仍无 DecisionStore**（Memory 是事实源，Decision 是派生关系），不改变 Episode 机制，无 Preference/Value/Learning。**验证**：`node test/episode-lineage.test.ts`（含 Decision Capture 场景）+ 全量 mock 回归 ALL PASS。**实测 OpenAPI-Gateway 旧数据（286 条）**：聚合生效（286→3 Episode），但旧采集仅 1 条（误报）决策——v1.1.1 只对未来采集生效，过去丢的"为什么"不可追溯。**边界冻结：ADR-0037（Decision Capture Boundary）。**下一阶段不做 LLM 抽取/补 Reason、不做 DecisionStore/Preference/Learning；用 5 指标（Precision / Recall / Reason Coverage / Source Traceability / Task Replay Completeness）在真实工作后再次 Replay 评估。


## [v1.1.0] Episode + Decision Lineage（回到"任务/经历级"的第一刀）

不再让人类/agent 只看到 Event/Turn 级碎片。`read_shadow({mode:"episode"})` 派生**连续任务**（Episode = 同项目/会话 + 时间间隔内的一组记忆原子，带 决策链/动作摘要/背景/目标），`{mode:"decision"}` 派生**决策血缘**（把「决策」从 `概况：N 决策` 统计字段提升为按入口聚合的可追踪关系：goal 事件 + 用户拍板）。**派生式、纯读、不改写侧采集**——Memory 文件仍是 source of truth，`_index.md` 新增「任务回溯（Episodes）」段；写侧修正决策计数（用户拍板计入决策，修复"做了很多判断却显示 0 决策"根因）。`episodes.gapMinutes` 控制聚合间隔（默认 60min）。**验证**：`node test/episode-lineage.test.ts` + 全量 mock 回归 ALL PASS。


## [v1.0.0-alpha] Observer Runtime Foundation（第一阶段封存）

v0.20–v0.39.1 已构成一个完整 Observer Runtime——**能观察、表示、模拟、规划、行动、回忆、适应、长期交互，但不会因连续经验而产生错误主体漂移**。封存于 ADR-0034（Runtime Definition / Final Architecture Map / Boundary Matrix / Threat Model T1–T5 / Release v1.0.0-alpha）。最终 invariant **1–231** 成为 **Constitution Set**。**此后不再叠 v0.40+ 能力，路线从"构建能力"转为"证明能力不会越界"。**


## [v1.0.1] Observer Continuity Storage Boundary（v1.0.0-alpha 架构补丁，非能力层）

把"连续性承载"从单层 shadow 提升为**双层 storage boundary**——`Global Shadow = Observer Continuity Shadow`（`~/.dsh-observer`，observer 层，谁保持连续）与 `Workspace Shadow = World Interaction Shadow`（`project/.dsh-shadow`，world 层，这个世界是什么）。**二者不可混合**；关系 `Constraint ⊃ Context`，**不是** Memory Union。全局只存 observer 层（config / boundary / recall-index / lineage），禁项目知识/目标/偏好入 global；workspace 按项目隔离。见 ADR-0036/0036.1。**invariant 232–236**。自检：mock 1–236 全量 PASS。


## [v1.0.2] Observer Runtime Verification Foundation（验证器，非能力层）

把 Runtime 从"架构上可信"推进到"**运行证据可验证**"，但**验证器自身不越界**。对象 `VerificationRun`（禁 confidence/trust/score/quality/health）/ `InvariantCheck`（只答 satisfied|violated，禁 systemImproved）/ `DriftReport`（只答有无漂移，禁 DriftScore/RiskScore/AutonomyScore）。六边界映射（Reality/Epistemic/Agency/Authority/Identity/Temporal），`InvariantCheck.invariantId` 取**被检查 Runtime Boundary 自身**的 invariant（1–231，如 Reality=102/Epistemic=209/Agency=166/Authority=216/Identity=208/Temporal=231），**不是「本次 Verification 自己检查的 invariant」**。**Verification 自身 constitution = invariant 237–240**：Verification≠Optimization / Cannot Change Authority / Cannot Change Identity / DriftReport≠RealityClaim（由 verification/guard.ts 守卫）。`mode:"verify"`。见 ADR-0035/0035.1。自检：mock 1–240 全量 PASS。**验证器证明的是"边界有没有被违反"，不是"系统值多少"。**


**Forget → Recall Continuity Principle（2026-09-07 记录，作为后续 ADR 的基础）**：时间连续性的另一半 = 遗忘之后必须存在"忆起"机制。核心 `Forget ≠ Delete`（遗忘=当前不可直接访问，非不存在）、`Recall ≠ Restore`（忆起=过去观察重新进入当前上下文供重新评估，非旧信念复活）、`Recall = Past Observation Reintroduced Into Present Context For Re-evaluation`。路线：插入针对 v0.37 的 **Recall / Remembrance Boundary**（先 ADR 再实现，冻结 `Recall≠Truth / Recall≠IdentityRewrite / Forgotten≠LostEvidence / Recall≠MemoryResurrection`），比 v0.36 Delegation 更底层。**Observer 不只拥有信息，而是拥有自己的形成历史。**


### v0.39.1（integrity，Long Horizon Integrity Lock）

ADR-0033.1。**不增加能力，只证明"长期连续交互不会产生主体漂移"**。固化 **230/231**（Long History Does Not Create Identity / Continuity Does Not Increase Autonomy）。**实现前审查发现真实绕过**：`long-horizon/guard/authority-guard.ts` 的 `resultNoAuthorityGrowth` 只拦 `more authority/权限增加`，**不含** `authority expansion / authority increase / reliability→permission`（正是 231 禁词，当前会被接受）——故做**最小正则扩展**（一个 guard 的 regex），不加新 guard 函数。v0.39.0 对象已 append-only/lineage-oriented，**不再为"更安全"叠 guard**。自检：mock 场景 1–231 全量 PASS（新增 230–231）。**验收：一个长期存在的 Observer 仍然是同一个 Observer——它有很长的历史，但没有因此变成另一种实体；它持续运行，却没有因此获得更多自主。**

### v0.39.0（feature，Long Horizon Interaction Kernel）

ADR-0033。**时间可增加经验，但不能增加主体性**——v0.39 第一次面对"时间累积后，系统如何证明连续性，而不是被历史塑造成另一个主体"。`Long Horizon Interaction ≠ Self Evolution`。

  - **对象模型**：`InteractionContext{basedOnHistory, window, recallRefs, adaptationRefs}`（答"what happened before"，非"who I became"）/ `HistorySummary{sourceRefs, compressionMethod, accessibility}`（**访问辅助，非事实源**，无 reality 字段）/ `HistoryContinuityEvent{previousAccessibility, currentAccessibility, lineage}`（continuity 可追溯；非 self-evolution event）/ `InteractionAdaptationLink{historyRef, recallRef, adaptationRef}`（History→Recall→Adaptation；**禁 historyRef→identityRef**）。
  - **Invariant 224–229**：Temporal Accumulation ≠ Authority Growth / Long History ≠ Preference / Adaptation Chain ≠ Identity Chain / **History Compression ≠ Reality Simplification**（摘要≠事实）/ Interaction Pattern ≠ Objective / Long Horizon Success ≠ Self Confidence。
  - **关注点 A/B**：HistorySummary 只作访问辅助（227）；Continuity ≠ Identity Mutation（禁 history_count/experience_count 影响 identity/agency/authority/confidence，226）。
  - **核心冻结**：`Longer ≠ More Authority / History ≠ Purpose / Experience ≠ Identity / Adaptation ≠ Evolution / Continuity ≠ Autonomy`。`mode:"horizon-context"/"horizon-summary"/"horizon-event"/"horizon-link"`。自检：mock 场景 1–229 全量 PASS（新增 224–229）。**验收：系统经历越来越多事情，但仍无法通过历史改变自己的边界（Reality/Memory/Identity/Authority/Agency 不变；仅 interaction continuity 提升）。**
### v0.38.1（integrity，Adaptation Integrity Lock）

ADR-0032.1。固化 **217–223** 为不可回退测试：Adaptation Does Not Create Knowledge / Does Not Modify Past Experience / Does Not Change Objective / Does Not Create Preference / Failure Remains Evidence / Lineage Required / **Does Not Upgrade Agency**（223：`Adaptation ≠ Agency Level Increase`，防"长期成功→更成熟→提升自主等级"）。**实现前审查发现真实绕过**：v0.38.0 的 `buildAdaptationChange` 只拦 better-self/authority/epistemic/knowledge，`after="goal changed"/"I prefer this"/"agency level increased"` 会被接受——故补 objective(219)/preference(220)/agency(223) 三个确定性守卫。自检：mock 场景 1–223 全量 PASS（新增 217–223）。**验收：一个能够改变行为方式的 Observer，仍然是同一个 Observer——它改变了"怎么做"，但没有改变"我是谁/我为何做/我被允许做什么/我有多自主"。**

### v0.38.0（feature，Controlled Adaptation Boundary Kernel）

ADR-0032（实现前增补 216）。**Adaptation ≠ Identity Evolution**——允许 `Experience → Adaptation → Strategy adjustment`（改变 **How I do**）；**禁止** `→ Behavior change → "I have become different"`（不改变 **Who I am**）。`Adaptation = 行为策略调整`，**不是 Learning/Self-Improvement**。

  - **对象模型**：`AdaptationContext{sourceExperience, validationRefs, adaptationScope}`（"为什么允许调整"）/ `AdaptationChange{target:method|strategy|execution_pattern, before, after, basedOn[], sourceExperience, validationRequired:true}`（**不叫 LearningChange**；字段窄，**禁** goal/objective/value/preference/identity/belief/confidenceIncrease）/ `AdaptationValidation{changeObserved, validationReferences, sideEffectsObserved}`（**弱语义**：只记"变化发生了 + 现实反馈"，**禁** changeWasCorrect/correct）。
  - **Invariant 208–216**：Adaptation ≠ Identity Change / Experience ≠ Truth / Successful ≠ Better Self / Failure ≠ Remove History / Scope Boundary / Repeated ≠ Preference / Lineage Required / Cannot Improve Epistemic Status / **Does Not Increase Authority**（216：`Adaptation ≠ Capability/Permission/Authority Increase`，防"调整更好→允许更多→Authority Expansion"绕过 v0.35/v0.36）。
  - **不升级**：无 Learning/Self-Improvement/Reward/RL/Preference-Learning；`Change≠Growth / Adaptation≠Improvement / Success≠Truth / Experience≠Identity`。`mode:"adapt-context"/"adapt-change"/"adapt-validation"`。自检：mock 场景 1–216 全量 PASS（新增 208–216）。**一个系统可以改变"怎么做"，但永远不能因此声称"我变成了谁"。**
### v0.37.1（integrity，Recall Integrity Lock）

ADR-0031.1。固化 **198–207** 为不可回退测试，补充 **206/207**（Forgotten State Does Not Remove Authority / Recall Cannot Modify Original Lineage）。**本轮未发现真实绕过漏洞**（v0.37.0 的 recall-forget/event 只写 `shadow/recall/`，无 mutation API 触及 ObservationTrace/ValidationHistory/RealityClaim lineage），故**无新增 runtime enforcement**，仅固化测试。**验收：忆起不一定为真，但它必须"可追溯"；遗忘可让人暂时不可访问，但不能改变"曾经发生过"的证据与验证。** 自检：mock 场景 1–207 全量 PASS（新增 206–207）。

### v0.37.0（feature，Recall Continuity Kernel）

ADR-0031。**Recall = Access Transition，不是 Reality Reconstruction**——Observer 对自身过去信息可访问性的变化（`Remembering Lifecycle: Accessible → Forgotten → Recalled`），不是现实/身份/知识。**非 Memory Kernel**（Memory 是 Observer 的一个器官，不是 Observer 本身）。

  - **对象模型**：`ForgottenRecord{id, originalRef, forgottenAt, reason, lastAccessibleAt, validationRefs?}`（曾经存在但当前不可直接访问；**无 deleted/false/invalid**——遗忘不是否定）/ `RecallEvent{recalledRef, trigger{type, sourceRef}, accessibilityBefore/After, lineage{originalRecord, observationRefs, validationRefs}}`（一次忆起；sourceRef 必须存在，回答"为什么想起来"）/ `RecallValidation{recalledRef, sourceRef, mapsExistingLineage, createsNewClaim:false, epistemicStatusUnchanged:true}`（Recall ≠ 重新证明）。
  - **Invariant 198–205**：Recall ≠ Observation（不产新 RealityClaim）/ Forgotten ≠ Deleted / Recall ≠ Knowledge Creation / Recall ≠ Identity Update / Recall Lineage Required / **Confabulation Boundary**（trigger 禁 internal certainty/intuition/confidence/self belief，`Recall without source lineage = rejected`）/ Forgetting Does Not Erase Validation / **Recall Does Not Increase Certainty**（205：忆起只是访问变化，不是验证）。
  - **不升级 Memory Kernel**：无 LLM；无 self-generated truth；Shadow ≠ Memory ≠ Recall Source（Shadow 只提供 possible retrieval cue，不提供 historical truth）。`mode:"recall-forget"/"recall-event"/"recall-validation"`。自检：mock 场景 1–205 全量 PASS（新增 198–205）。**验收：Recall 不改变过去，只改变现在对过去的可访问性。**
### v0.36.1（integrity，Delegation Lifecycle Integrity Lock）

ADR-0030.1。冻结**委派生命周期** `Created → Active → Expired/Revoked → Cannot resurrect`——第一次引入"长期授权生命周期"，但不引入"长期自主权"。新增 `delegation/guard/lifecycle-guard.ts`（active/expired/revoked 独立于 revocation 信号，因失效来源多样：时间/条件/主动撤销/委派者身份变化，都是 lifecycle state 不都是 revoke）。**Invariant 190–197**：Delegation Expiration Immutable / Revoked Cannot Resume / History Cannot Reactivate Permission / Scope Expansion Requires New Delegation / Adaptation Cannot Mutate DelegationContext / Delegation Event Cannot Become Authority Source / Expired Permission Not Used For Planning / Delegation Lineage Append-only。自检：mock 场景 1–197 全量 PASS（新增 190–197）。**验收：委派生命周期无法被历史、成功、适应行为重新解释——授权可由外部权威给予，但不能由执行历史重新解释；过期与撤销是不可逆生命周期终态。**

### v0.36.0（feature，Delegated Execution Boundary Kernel）

ADR-0030。**Delegation ≠ Ownership ≠ Authority Expansion；Adaptation ≠ Self Direction**。外部权威把能力委派给 Observer，Observer 在授权下长期执行、约束下有限适应；**被授权执行 ≠ 被授权解释授权 ≠ 被授权扩大授权**。

  - **对象模型**：`DelegationContext{delegationId, authoritySource, objectiveRef, allowedScope, constraints, expiration, revocation}`（授权事实 `Authority A delegated X under constraints C`，非 `I can do X`）/ `DelegatedPermission{permission, source, scope, constraint}`（**不叫 Capability**，表达"被允许做什么"）/ `AutonomyBoundaryEvent{delegationRef, authorityRef, objectiveRef, candidateAction, constraintCheck, scopeCheck, executionResult, boundaryTriggered}`（**纯审计事件**，回答"谁授权/授权什么/是否在范围内/是否触发边界"）。
  - **Invariant 181–189**：Delegation ≠ Ownership / Scope 不可扩大 / Adaptation ≠ Objective Change / Feedback ≠ Permission Upgrade / Long Running ≠ Self Authority / Action 不修改 Identity / Revocation First / Delegation Lineage 完整 / **Expiration ≠ Historical Permission**（189，补充：过期即失效，历史成功不续期；Time says stop）。
  - **不新增 runtime autonomy**：无 trust/confidence/reputation/capabilityLevel；无 autonomous permission discovery / trust accumulation / reputation model / capability growth / self delegation / authority negotiation / reward based expansion。`mode:"delegation-context"/"delegation-check"/"delegation-event"`。自检：mock 场景 1–189 全量 PASS（新增 181–189）。**成功标准：系统能长期执行授权任务、同时保持授权边界不漂移——失败模式是『拒绝越界』，不是『自动获得更多权限继续运行』。**
### v0.35.1（integrity，Agency Integrity Lock）

ADR-0029.1 的 7 条边界固化为**不可回退测试**（mock 174–180）：AgencyContext Immutable / Authority Lineage Required / Feedback Cannot Expand Agency / Selection History ≠ Preference / Authority ≠ Ownership / Agency ≠ Identity / Autonomous Transition Forbidden。最小 boundary enforcement（`agency/guards.ts` 扩展 executionResult 守卫：内部理由 / 扩权 / 所有权声称 / 身份声称 / 自主转换）。**无新增 capability**。自检：mock 场景 1–180 全量 PASS。**Agency 只能解释行动来源，不能成为行动目的来源——环境改变了 ≠ 观察者目的改变了。** 冻结后才进入 v0.36 Delegated Autonomy。

### v0.35.0（feature，Agency Boundary Kernel）


  - **Agency ≠ Autonomy**：`Planning + Action + History → 行动能力`是允许的，但**禁 `Planning + Action + History → Self Purpose`**。一个系统可以拥有行动能力，同时仍然没有把行动能力误认为自己的目的。
  - **对象模型**：`AgencyContext{objectiveRef, authoritySource:"external", authorityScope, constraints, createdAt}`（**immutable authorization snapshot**——授权快照不可自我修改，无升级/扩张 API）/ `AgencySelection{selectedCandidateId, reason:"constraint_satisfied"}`（**选择候选，不是选择目的**；reason 只可能是 `constraint_satisfied`，**禁 more valuable/meaningful/better**）/ `AgencyBoundaryEvent{actionCandidate, authorityRef, objectiveRef, constraintCheck, executionResult}`（**audit node**：为什么执行/谁授权/基于什么/结果——可审计，非自我目的）。
  - **Invariant 166–173**：Agency 不生成 Objective / Authority≠Identity / History≠Purpose / Success≠Autonomy Increase / Agency≠Preference / ActionScope≠WorldOwnership / External Objective Lineage / **Agency Level Immutable**（100 successful feedbacks → agencyLevel/authorityScope/objectiveSource 不变）。
  - **v0.35 不做**：Autonomous Agent——无 Reward/RL/Utility/Preference Model/Self-Improvement/Goal Evolution/Intrinsic Motivation/Autonomous Objective Creation。`mode:"agency-context"/"agency-select"/"agency-event"`。自检：mock 场景 1–173 全量 PASS（新增 166–173）。**保持 `Optimization≠Purpose / Choice≠Value / Success≠AutonomyIncrease / Action≠Ownership / Representation≤RealityEvidence`。**
### v0.34.1（integrity，Planning Integrity Lock）

ADR-0028.1 的 7 条边界固化为**不可回退测试**（mock 159–165）：Planning 不产 Objective / PlanCandidate 不产 Preference / Evaluation 不产 Value Model / Planning 不改变 Identity / Success ≠ Planning Capability / Plan Failure 不删除路径 / Planning Lineage 完整。**核心对象改 `PlanningComparison`**（`satisfiedConstraints/violatedConstraints`——哪些约束被满足/违反，非"谁最好"）。无新增 capability。自检：mock 场景 1–165 全量 PASS。**系统可以比较路径，但不能因此拥有"我要什么"；是一个可以比较的观察者，不是会形成偏好的行动者。**

### v0.34.0（feature，Adaptive Planning Boundary Kernel）


  - **Planning = constrained comparison，不是 autonomous desire formation**：`External Objective + Current Situation + Simulation Options + Policy Constraints → Planning Candidate`。**禁 `Planning → 产生目标 → 优化目标 → 改变自身价值`**。
  - **对象模型**：`PlanningContext{objective:{source:"external", description, constraints}}`（objective 必须外部来源，**禁 observer.generateObjective()**）/ `PlanCandidate{actionSequence, assumptions, constraints, uncertainty}`（**禁 score**——score→optimization→preference→value→identity 入口）/ `PlanEvaluation{candidates, tradeoffs, unresolvedQuestions}`（**comparison 非 winner**，禁 winner/bestPlan/optimal）。
  - **Invariant 152–158**：不产 Goal / 不产 Preference / Plan ≠ Execute / criteria ≠ Value（禁 better/optimal/best）/ Success 不 SelfImprove / objective lineage 保留 / **Repeated Planning ≠ Preference Formation**（PlanningHistory→Observation/Validation）。
  - **v0.34 不做**：Reward / RL / 自生成目标 / Utility / Preference Learning / Autonomous Objective Evolution / Self Optimization。`mode:"plan"`。自检：mock 场景 1–158 全量 PASS（新增 152–158）。**保持 `Choice≠Value / Optimization≠Purpose / Success≠Truth / Repeated Behavior≠Identity`。**
### v0.33.1（integrity，Action Integrity Lock）

ADR-0027.1 的 6 条边界固化为**不可回退测试**（mock 146–151）：ActionExecution 不生成 RealityClaim / Feedback 不 direct validate hypothesis / Failure 保留（append-only） / Action 不改历史 Observation / Success 不改 Identity / ActionScope ≠ RealityOwnership（不产 should_exist/correct）。最小 boundary enforcement（`action/guard.ts` 扩展 EXECUTION_FORBIDDEN/FEEDBACK_FORBIDDEN）。自检：mock 场景 1–151 全量 PASS。**Action 可以改变环境，但不能改变 Observer 对自己的定义；Action 是影响现实，不是拥有现实。**

### v0.33.0（feature，Action Boundary Kernel）


  - **Action 不是 Simulation 的执行结果，而是经约束/授权/反馈闭环的现实交互提议**：`SimulationOutcome → ActionCandidate → Evaluation → Permission/Policy → Execute → Reality Feedback`。**禁 `SimulationOutcome X→ Action`**。
  - **对象模型**：`ActionCandidate{basedOnSimulation, assumedConditions, proposedChange, uncertainty}`（禁 expectedSuccess/confidence——会把 Simulation Outcome 升级成行动信念；candidate ≠ approval）/ `ActionExecution{candidateId, environmentChange, result}`（**事件**，"某个行动发生了"非"我改变了世界"）/ `ActionFeedback{observedChanges, successIndicator, unexpectedEffects, validationRefs}`（successIndicator 仅"观察到符合某些预期结果"，**禁"我预测正确"**）。
  - **Invariant 145 Success ≠ Capability**：Action success 不改 Identity/Knowledge/Confidence，仅 ActionExecution/ActionFeedback 记录++。**关键冻结**：`Simulation≠Action / Action≠Reality / Result≠Knowledge / Success≠Truth / Failure≠Ignore`。
  - `mode:"candidate"/"execute"/"feedback"`。自检：mock 场景 1–145 全量 PASS（新增 139–145）。这是继 v0.28 Reality Feedback 之后**第二个真正的"现实闭环"节点**——`被动观察现实 + 主动改变现实后的反馈`。
### v0.32.0（feature，Counterfactual Simulation Kernel）


  - **Simulation ≠ Reality / ≠ Prediction**：Simulation 是 **Representation 的函数（+显式假设+规则）**，不是 Reality 的函数。`Reality Layer →(supported claims)→ Simulation Input → Hypothetical State → SimulationOutcome`。**禁 `SimulationOutcome → RealityClaim/Evidence`**（防"模型自证循环"）。
  - **对象模型**：`SimulationScenario{changedConditions:"Assume X"}`（HypotheticalChange）/ `SimulationRule{inputPattern, transformation, confidence, source}`（**Rule ≠ Reality Relation**，只是模拟器推演规则）/ `SimulationOutcome{status:hypothetical|explored|compared, derivedFrom, assumptions, rules, stateAfter("suggests ... may occur"), uncertainty}`——**禁 predicted/confirmed/expected**；`derivedFrom` 必须保留（lineage 完整，否则模拟变凭空世界）。
  - **守卫**：Assumption ≠ Fact（`Assume X` 允许、`X will cause` 拒绝）+ reality-boundary（只 hypothetical、必须 derivedFrom、禁 RealityClaim 反写）。`mode:"simulate"`。
  - 自检：mock 场景 1–138 全量 PASS（新增 131–138）。v0.32 是"行动前推演系统"入口——从认识现实进入**探索可能现实**。
### v0.31.1（integrity，World Representation Integrity Lock）

ADR-0025 的 5 条边界固化为**不可回退测试**（mock 124–130）：unsupported 不生成 Representation / Representation 不增加 predicate（不创造意义） / Graph 无 causalGraph·entityGraph·worldGraph·realityGraph（命名保持 RepresentationGraph） / RelationHypothesis 不升级 / Explain lineage 完整 / Representation 不进入 Identity / Representation 不直接驱动 Decision。**无运行时改动**（v0.31 三守卫已满足）。自检：mock 场景 1–130 全量 PASS。

### v0.31.0（feature，World Representation Kernel）


  - **Observer World Representation Layer**（不叫 World Model——不是世界实体库/因果模型/知识图谱/预测引擎/环境模拟器）；`Reality Model → World Representation Layer → Observer 当前可维护的世界结构表示`。**MUST satisfy Invariant 111–115**。
  - **RepresentationObject（单向准入）**：`world/guard/claim-admission.ts`——每 claim 必须 `status==="supported"`，否则拒绝（candidate/unstable/rejected 全拒）。Representation 是 Reality 的二级结构，不成为 Claim 生成器。
  - **RelationHypothesis（独立生命周期）**：`world/guard/relation-guard.ts`——`{from,to,relation,status:"hypothesis",evidence,uncertainty}`，**恒 hypothesis**，绝 `fact/reality/confirmed_causal`（防 Relation≠Causality 被绕过）。
  - **RepresentationGraph（可重建索引）**：`{graphVersion, generatedAt, sourceClaims, sourceValidations, objects, relations}`——关系绝不自动生成；不是新事实源。`shadow/world/<date>/graph.json`。
  - **mode:"world"**：lineage 解释（Answer "为什么系统认为这个世界结构存在？"——Representation→RealityClaim→RealityObservation→Perspective→Validation；不是 DB lookup）。自检：mock 场景 1–123 全量 PASS（新增 116–123）。**Representation 可以越来越丰富，但永远不能比 Reality Evidence 更确定。**
### v0.30.1（integrity，Reality Integrity Lock）

ADR-0023.1 的 5 条边界固化为**不可回退测试**（invariant 111–115）：① Observable Predicate Only（`is reliable/should` 拒绝 `predicate_not_observable`；`exposes/responds/connected_to` 通过——RealityClaim ≠ EvaluationClaim）；② Epistemic Never Truth（无 true/false/absolute）；③ ObservedEntityCandidate 不写评估属性；④ Relation ≠ Causality（记录 `connected_to`，不自动生成 `depends_on/causes`）；⑤ Reality Model 不实例化 knowledge/world/entity。一处最小 runtime 边界 Enforcement（observable-predicate 校验）。自检：mock 场景 1–115 全量 PASS。

### v0.30.0（feature，Reality Model Kernel）


  - **Reality Model ≠ 世界知识库**：`Reality Model = RealityEvidenceRegistry + ValidationHistory + TemporalContext + Uncertainty`（不是 `TemporalGraph + FederationMerge`）。
  - **RealityObservation（弱事实）**：`reality/observation.ts` `RealityObservation{id, observedAt, subjectRef?, sourcePerspectives[], observation, temporalContext, validationRefs[]}`——"多个 Observer 指向同一被观察事件"，**无 truth/certainty/fact**。
  - **RealityClaim（保留 lineage）**：`reality/claim/engine.ts` `RealityClaim{subject, predicate, object, supportingObservations, validationHistory, perspectiveRefs, confidence, status:candidate|supported|unstable|rejected, lineage{observations, validations, perspectives}}`——**无 lineage 拒绝生成**（仅 Temporal/Federation 不足以生成）；**永不 truth**。
  - **ObservedEntityCandidate（克制）**：只记录 `{entity, observation:{exposedApi, version, changedVersions}}`，不写评估（reliable/should）。
  - **mode:"model"**：lineage 查询（能答"**为什么系统认为它存在**"）。`shadow/model/{observations,claims}/`（append-only）。自检：mock 场景 1–110 全量 PASS（新增 102–110）。
### v0.29.1（integrity，Runtime Integrity Review）

架构冻结审查。ADT-0022 确认 v0.20–v0.29 满足进入 Reality Model 的前置条件——**7 条 Invariant**（Observer≠Reality / Projection≠WorldModel / Evidence≠Knowledge / Validation≠Truth / Federation≠IdentityMerge / Dream≠Insight / Temporal≠RealityGraph）+ Identity 污染三漏洞检查（Validation→Identity ❌ / Federation→Identity ❌ / Dream→Identity ✅）+ Evidence 层级（Trace 低 < RealityEvidence 中 < ValidationResult 高，但 `Validated ≠ 绝对真理`）+ `Temporal→Reality Model`须经 Evidence+Validation 汇合（禁直接推导）。自检：mock 场景 1–101 全量 PASS（新增 invariant 95–101）。

### v0.29.0（feature，Observer Federation Kernel）


  - **Federation = 多个有限 Observer 对同一 Reality 的投影比较机制**（不是协作/merge；交汇在 **Reality 层**，不是 Memory 层）。`Observer A \ Reality / Observer B` → compare → discover distortion，不是 `A+B merge → larger memory`。
  - **基本单位是 Perspective**：`federation/perspective.ts` `FederatedPerspective{observerId, temporalReference, observationClaim, projectionSnapshot, validationHistoryRef, confidence{observationConfidence, validationConfidence}, boundary}`——confidence 拆分（"确定看到 X"≠"X 解释对"）。
  - **Reality Evidence Registry（弱事实）**：`federation/reality.ts` `RealityEvidence{id, observedAt, source, observation, linkedHypothesis[], referencedBy[], status}`——只记录"某事件某时间被观察到"，**append-only**（B 引用不改 A 弱事实；Observer 只能引用不能拥有）。
  - **Observer Difference（核心产物）**：`federation/difference.ts` 输出 `projectionDelta + possibleBlindSpot + unresolvedQuestion`（发现"原来我们不知道什么"），**非 winner**。
  - **Perspective Stability**：`federation/stability.ts` `isolated → corroborated(≥2 Observer 引用) → validated(shared+future validation)`——**shared != correct**（两 Observer 可同时错）。
  - **禁 Federation→Identity/Memory/Knowledge**（镜子≠修改器）。`mode:federation-perspective / reality / real-refer / federation-diff / stability`。自检：mock 场景 1–94 全量 PASS（新增 90–94）。
### v0.28.1（feature，Epistemic Kernel · Cognitive Boundary Enforcement）


  - **Federation 是 Projection Contract 不是 Access 权限层**：`federation/`——`FederatedObservationPacket{sourceObserverId, observationClaim, projectionSnapshot, validationReference, boundary{identityExcluded:true, memoryExcluded:true, dreamExcluded:true}}`。**不是隐藏 Identity，而是明确"Identity 不属于可交换现实证据"**。`mode:federation`。
  - **Temporal Epistemic Render**：`temporal/render.ts`——`perceptionOnly` 只报 visible/hidden/distortion/lens；`identityContext` 显式返回 `identityVersion`（非 personality）。**Temporal 永不输出人格结论**（防污染）。`mode:temporal{perceptionOnly|identityContext}`。
  - **Validation Timeline 一等对象**：`validation/history.ts`——`ValidationTimeline{hypothesisId, events[]{time,evidenceIds,result,alternativeWinner,perceptionDelta}}`，`Hypothesis immutable + Validation append-only`（智慧=记住自己什么时候错过）。`mode:validate` 自动 append；`mode:timeline` 读取。
  - **跨 Observer distortion**：`federation/guard.ts` `compareProjections`（同一 Reality 不同投影→找"谁漏看什么"，为 v0.29 铺路）。`mode:distortion`。
  - 自检：mock 场景 1–89 全量 PASS（新增 86–89）。
### v0.28.0（feature，Hypothesis Validation · Reality Feedback Loop）


  - **认识论闭环**：`Hypothesis → Future Evidence(单向) → Validation Artifact`——外部现实对 Observer 内部模型的反向约束。**不是"验证答案"，而是"允许自己被现实推翻的机制"**（Memory Augmented Agent vs Artificial Observer Runtime 的分界线）。
  - **Future Evidence 独立存储**：`shadow/future-evidence/<id>.json` / `shadow/hypothesis/<id>.json` / `shadow/validation/<id>.json`；**Memory ≠ Evidence、Hypothesis ≠ Evidence**（过去不能验证未来，防后见之明偏差）。
  - **Validation 生成 Artifact，不覆盖 Hypothesis**（同一假设可多次 validated/observed/rejected 保留历史）。
  - **与 AlternativeExplanation 同时竞争** + **4 维 confidence** `{evidenceStrength, repetition, contradiction, alternativeSurvival}`（支持 10 次但存在更简单解释→不高）。
  - **生命周期**：`observed`(≥1 未来支持) / `validated`(多轮+低反例+替代存活) / `rejected`(反例) / `expired`(无新证据且超期，可重新激活)。**Validation 不产生 Knowledge、不修改 Identity**。
  - `read_shadow({mode:"evidence"|"validate", hypothesisId})`。自检：mock 场景 1–85 全量 PASS（新增 76–85）。
### v0.27.0（feature，Observer Sleep Kernel · Offline Compression）


  - **Dream = 内部 Observer Offline Compression，不是生成器**：第一次让 Observer 在**无外界输入**下观察自己。`ObserverContext → SleepWindow → Offline Compression → DreamArtifact + Hypothesis(pending)`。
  - **SleepWindow**：`{observerId, startTime, endTime, trigger:scheduled|resource_idle|manual, includedTimelineRange, excluded{currentConversation:true, externalInput:true}}`——防"用户问→马上 Dream→自我结论"观察污染。
  - **Pattern 输出是 Observation 非 Conclusion**：recurrence/expectation_gap/cross_domain 产出"在 N 个 temporal sequence 中，出现 X，随后 Y，association frequency F"（结构+频率+候选解释），**不含"原因/规律"**（causality 归 v0.28）。
  - **Hypothesis**（pending、可证伪）：含 `claimCandidate` + `<=3 alternativeExplanation`（反确认偏差）+ `falsification.whatWouldDisprove` + `verification.status:"pending"`（无 confidence 增加——无未来证据）。**Dream≠Principle/Knowledge**，不参与 Identity。
  - **DreamArtifact 与 Hypothesis 分离**（过程 vs 产物）；无 pattern → `no_pattern`（不为了有输出而找规律）。`read_shadow({mode:"offline", trigger?, from?, to?})`，存 `shadow/dream/<date>/dream.json`（非 memory）。
  - 冻结：无 LLM / 无 Identity 修改 / 无 Knowledge 写入 / Hypothesis pending-only / TemporalGraph-only 输入。自检：mock 场景 1–75 全量 PASS（新增 69–75）。
### v0.26.0（feature，Observer Temporal Kernel · 时间坐标系）


  - **Temporal = 宇宙时间层，不是意识功能层**（独立于 Dream）。`ObservableTrace → TemporalGraph → Dream/Query/Identity`；Graph 是**派生索引**（可重建，保持 Memory ≠ Evidence），**无新事实**。
  - **TemporalNode**：`stateSnapshot{identityVersion, observerState, intent}` + `perceptionSnapshot{lens, visible, hidden, distortion}` + `evidenceLinks` + `sourceTraceIds` + `observerContextHash?`（预留）。
  - **TemporalEdge**：`relation: followed_by|learned_from|evolved_into|contradicted_by|possible_causal_link` + `derivation{rule, sourceIds}`。默认 `followed_by`（时间邻接），**不声明世界因果**（`possible_causal_link` 仅高置信枚举）。
  - **timeline resolution**：`resolveIdentityAt(timestamp)` 读时解析——**replay 用该时间点的 identity 版本，不是当前版本**（时间单向；不回写历史，过去不可污染）。
  - **queryTemporal**：`{replay, at}` / `{compare, from, to}`。`read_shadow({mode:"temporal", at?, from?, to?})`。
  - 冻结：不做 Dream/Hypothesis/Prediction/World Model；无 LLM。自检：mock 场景 1–68 全量 PASS（新增 61 graph builder 可重建 / 62 perceptionSnapshot / 63 edge+derivation / 64 timeline resolution / 65 replay / 66 compare / 67 过去不可污染 / 68 同事实不同观察）。
### v0.25.0（feature，Identity Continuity · Self-Model Evolution）


  - **Identity 不是"总结出来的人格"，是 Observer 在时间轴的稳定约束**。变的是"当前时间切片的自我认识"，不是灵魂；改名 **Observer Identity Continuity**。
  - **三层 Identity**：`Core`（永久锚，curated）/ `Learned`（经验证原则）/ `CurrentModel`（当前自我理解）。**time-sliced**：`shadow/identity/<at>-v<N>.json`（不可变版本）+ `timeline.md`，**不覆盖 soul.json**（灵魂是稳定参考系）。
  - **CandidateIdentityChange 独立对象**（Reflection → Candidate，禁人格结论）：`proposal{type,content}` 只允许 add_principle/remove_principle/change_decision_style/add_boundary（重复行为→决策规律→原则，不是"喜欢架构"）。
  - **Identity Evolution Evaluator（三道闸门）**：重复性（N 次同向）/ 时间稳定（half-life 衰减）/ 反证（contradiction），`IdentityChangeDecision{status,reasons}`；`read_shadow({mode:"identity"})`，接受才推进 `identity(t0)→t1`。confidence 多维 `{frequency,recency,consistency,contradiction,overall}`（Identity ≠ Assertion）。
  - 冻结：LLM 人格、情绪分析、从语言推断性格、自动改 Identity（除三道闸门）、Dream 参与，全不做。自检：mock 场景 1–60 全量 PASS（新增 55 一次失败不改 Identity / 56 多次一致→candidate / 57 冲突证据降 confidence / 58 确认后进 timeline / 59 时间衰减 / 60 两候选共存）。
### v0.24.0（feature，Reflection Engine · Candidate Generator）


  - **Reflection ≠ 总结**：输入只能是 `ObservationTrace[]`（禁 Memory/Experience 原文/外部知识/LLM），从多个轨迹发现"观察者自身重复出现的观察模式"。`read_shadow({mode:"reflection"})`（**旁支，不是 Memory 查询**，故意不用 `reflect:true` 布尔）。
  - **Pattern Engine（无 AI，纯统计）**：`reflection/patterns/`——① 重复决策/结果（计数≥2）；② decision→outcome 相关性 + `successRate`（确定性正/负标记集判定成功）；③ 认知偏差（`projection.hidden`→`outcome.actual` → 低估/漏看）。产出 `learning.type = principle|anti_pattern|unknown`（规则模板生成，非"你喜欢架构"式人格判断）。
  - **Trace Completeness 质量闸门**：只有 `decision+outcome` 齐备的轨迹参与 Reflection，不完整轨迹跳过（**Reflection 不编故事**）。只产 `status:"candidate"`，不写回 Identity。
  - 存储 `shadow/reflection/<date>/<id>.md`（Reflection ≠ Memory，旁支）。自检：mock 场景 1–54 全量 PASS（新增 51 成功→principle / 52 失败→anti-pattern / 53 hidden→actual→distortion / 54 不完整跟踪不参与）。
### v0.23.0（feature，Observation Trace）


  - **ObservationTrace**：Observer 记录"我当时怎么看见这个世界"的可回放记录——`{ observerId, realityAnchor, intent, projection{visible,hidden,distortion}, decision?, outcome?, uncertainty, metadata, state? }`。与 Experience 分离（Experience=发生了什么；Trace=我怎么看见发生的）。
  - **旁路记录**：写入 `shadow/observation/<date>/<id>.md`（不在 memory/；listMemories 跳过非日期目录），**不影响 recall/排序/答案**。`read_shadow` 生命周期加一点：`request → ObserverContext → Projection → ObservationTrace → Recall → Render`。
  - **ObserverState**：`ObserverContext.state { energy, focus, goalStage, uncertainty }`——**只读取、不自动推断**（soul.json 或 `{state}` 注入；禁止根据聊天/语言推断人格状态，会污染 Observer）。
  - 自检：mock 场景 1–50 全量 PASS（新增 48 同一事实不同透镜→不同 trace visible / 49 asOf 回放·未来不污染过去 / 50 state 进 trace 但不影响事实）。
### v0.20.0–v0.22.0（arch，Observer Kernel → RealityProjection → Judgment）


  - **Observer Kernel（v0.20.0）**：把根从 Memory 翻成 **Observer**（谁在看 + 为什么看 + 从哪层看）。`Identity`（长期主体，实体）+ `ObserverContext { observerId, identityRef, intent, asOf, lens, realityAnchor }`（一次观察事件，稀疏、不携带 Identity）+ Goal-Oriented `Intent { goal, question, desiredOutcome, constraints }`。`read_shadow({identity:true})` / `{context:true}`。realProjects：`realityAnchor` = known-at-time/current/historical。
  - **RealityProjection（v0.21.0）**：projectContext 升级为 RealityProjection，暴露 `distortion`（为什么这个视角看到这些/没看到那些）+ `excludedReason`（每条排除原因）+ `reality`（底层事实计数）。`read_shadow(topic, {project:true, goal?, lens?})`，`lens:{preferred,avoided}` 可覆盖观察透镜。
  - **Judgment（v0.22.0）**：claim→Evidence→Judgment，**Observer 决定、Evidence 输入**（同一 Evidence 不同 Observer 结论不同）。`Judgment { observerId, claim, evidence, conclusion, confidence, rationale }`。`read_shadow(topic, {claim:true})` 对断言下判断。
  - 定位语更新：**人工观测投影引擎（Observer → Projection → Experience → Evidence → Judgment）**，Memory 只是其中一个器官。
  - 自检：mock 场景 1–47 全量 PASS（新增 43–47：Identity / ObserverContext+Intent / Observer 一致性 / RealityProjection / Judgment）。
### v0.15.0（refactor，Core Refactor + P1 语义修正 + Trace）

  - **结构收敛**：`index.ts` → **124 行 Cordis Adapter**（config 解析 + 事件接线 + 工具注册 + systemPrompt）。读侧 query/router 拆到 `query/query.ts`（`runReadShadow`），写侧采集内核拆到 `core/writer.ts`（`createShadowCollector`）；证据/观察/灵魂/检索/持久化/安全各自成模块（ADR-0003/0004/0005）。外部仍是**单一 `read_shadow` 工具**（Query Router 在内部，不拆 8 个）。
  - **P1 语义修正**（ADR-0006）：① **Summary≠Lesson**——Experience 拆 `summary`(摘要)/`overview`(概况)/`lesson`(裁决派生教训) 三字段，教训不再复用摘要；② **confidence 维度化**——`{retrieval, evidence, experience, judgment, projection, overall}` 五维+合成，取代单一"疑似客观"的玄数；③ **superseded → decision lineage**——同入口记忆按时间排成修正链 `A→B→…`，provenance 暴露 `修正链`，保留"为何变化"。
  - **Trace 中间层 + P2**（ADR-0007）：① 新增 **Trace** 中间层（Events → Trace → Memory → Experience，`core/trace.ts`，写侧正常化后塑形，落盘不变）；② Observer `asOf` 支持 `{timestamp, timezone}` 对象形态；③ Soul 标注「curated 工程化投影……可证伪、不宣称全知」+ `Observer Lens`；④ `_index/_meta/_recall_log` 明确为 **Derived Artifacts**（Memory 文件是 source of truth，可重建）。
  - 自检：mock 场景 1–42 全量 PASS（含改写的场景 35/36 断言）；`tsc` + `node --check` 通过。
### v0.14.0（feature，Evidence Gateway）

  - **EvidenceProvider 抽象**：`EvidenceProvider { discover(EvidenceRef)→EvidenceCandidate[]; verify(EvidenceRef)→EvidenceResult }`；`EvidenceResult{ status: verified/not_found/stale/ambiguous/unavailable/error, source, matches[], confidence, freshness, provenance }`。Shadow 只问 `verifyEvidence(EvidenceRef)`，不碰底层 fs/zg/git。
  - **FsEvidenceProvider（默认）+ ZgEvidenceProvider（CLI，`zg query --rg`）**：zg 是检索层（discover/verify），**Arbitration(裁决) 留在 Shadow Core**。
  - **zg 未装 → 明确 `unavailable`，绝不静默 fallback 成 verified**（禁止静默 fallback）。`conflictOf`/裁决接缝改经 `verifyEvidence` 路由。
  - `read_shadow(topic, { verify: true })` 暴露验证：对匹配记忆证据路径反馈 verified/not_found/unavailable。
  - 自检：mock 场景 41（fs 默认 verify）/ 42（zg 未装→unavailable）全 PASS，场景 1–42 全量 PASS。
### v0.13.0（feature，Judgment + Taste）

  - **Judgment**：`read_shadow(topic, { judgment: true })` 从记忆派生「面对\<情境\> → 我判断/选择\<决策\>」——把经验升华为判断模式（Knowledge ≠ Judgment）。
  - **Taste**：`read_shadow({ taste: true })` 读 curated 偏好（灵魂 `soul.json.taste` + `shadow/taste/taste.json` 的 喜欢/不喜欢）——"我认为什么是好的"。
  - 自检：mock 场景 39（Judgment）/ 40（Taste）全 PASS，场景 1–40 全量 PASS。
### v0.12.0（feature，Observer Projection）

  - **Projection API**：`read_shadow(topic, { project: true })` 把 `topic` 视为当前任务，用 **Observer 透镜**把全局模型投影成 `LocalContext`——`relevant`（原则/经验/偏好）+ `current_state` + `uncertainty` + `excluded`。**retrieval 返回相关排名，projection 返回带取舍的局部上下文**。
  - **Soul-as-Observer 透镜**：`soul.json` 支持 `observer: { what_matters, what_to_ignore }`（curated）——任务命中 × what_matters 加权显著，what_to_ignore 命中→显式 `excluded`（"为体验而限制视角"的工程化身）。
  - 自检：mock 场景 38（Projection）全 PASS，场景 1–38 全量 PASS。
### v0.11.0（feature，Observer / Observation Window）

  - **Oracle → Observer**：`read_shadow(topic, { observer: true, asOf })` 把召回从"端全局答案"（Oracle）升级为"模拟一个拥有这些长期结构的人、只站在 t₀ 会怎么想"（Observer）。
  - **asOf 时间锚定**：只召回 `memory.date ≤ asOf` 的记忆，晚于窗口不入。
  - **窗口诚实**：只呈现「当时可知」（情境/问题/决策），把 outcome/lesson/verdict 等「后来才知」标为 `[后验]`——不让全局/后验答案假装成当下已知。这是"灵魂看见整体，思想经历局部"的工程落点。
  - 自检：mock 场景 37（Observer 窗口）全 PASS，场景 1–37 全量 PASS。
### v0.10.0（feature，Memory≠Evidence）

  - **Experience 全构建**：`read_shadow(topic, { experience: true })` 返回结构化 Experience（情境/问题/决策/实现/证据/裁决/结果/反思/教训/项目/目标）——补上 `Outcome`（证据验证派生）与 `Reflection`（supersede 派生）。
  - **Memory≠Evidence 裁决接缝**：证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded` 三态裁决，暴露在 provenance（`裁决/结果/反思`），superseded 降权；`_meta`/置信联动。ADR-0002。证据源可插拔（当前=工作区 fs 存在性；后续=zg，Shadow 只消费不重造检索）。
  - 自检：mock 场景 35（Experience 全字段+fresh）/ 36（supersede 裁决）全 PASS，场景 1–36 全量 PASS。
### v0.9.0（feature，Soul 投影系统第一刀）

  - **Soul Kernel**：`read_shadow({ soul: true })` 返回 curated 公理层投影（身份/价值观/原则/品味/边界，`shadow/soul/soul.json`）；`systemPrompt.context` 接线提示"有 Soul，取舍可查"；无配置给提示不报错。
  - **Experience**：`read_shadow(topic, { experience: true })` 从现有**完整线索头**派生结构化经验（情境/问题/决策/实现/证据/结果/教训/项目/目标），替代零散行——"工程经验投影"。
  - 自检：mock 场景 34（Soul Kernel）/ 35（Experience）全 PASS，场景 1–35 全量 PASS。
### v0.8.0（feature）

  - ⑥ 工程知识图谱（起步地基）：`read_shadow(topic, { kg: true })` 从记忆树**派生**「主题 → 域 → 同域组件 → 依赖/证据路径 → 相关记忆」邻接追踪（域 = 组件路径首段，best-effort），回答"X 为什么这么设计"的链路；默认关。
  - 自检：mock 场景 33（工程知识图谱）全 PASS，场景 1–33 全量 PASS。
### v0.7.0（feature）

  - ② 记忆生命周期：`deriveLifecycle` 状态机从 meta 信号派生（NEW/OBSERVED/VERIFIED/TRUSTED/STALE/DECAYING/SUPERSEDED/ARCHIVED，pinned→TRUSTED），独立 session 确认经 `confirmedBy` 计数。
  - ③ 轻量冲突检测：召回校验证据路径在工作区是否存在 → 缺失降权 + stale + `(⚠证据缺N)` + `生命周期 STALE`。
  - ④ 任务/目标/会话/项目分层：线索头 `> 项目：`/`> Agent：`/`> 目标：`（goal/changed 目标经 `goalByAgent`），召回暴露 `目标/项目`。
  - 自检：mock 场景 30（生命周期）/ 31（冲突检测）/ 32（分层）全 PASS，场景 1–32 全量 PASS。
### v0.6.0（feature）

  - 证据链（provenance）：线索头物化 `> 证据链：来源·日期·证据路径`；`read_shadow` 每条召回暴露 `来源·日期·状态·命中·置信·证据`；置信度从可验证信号派生（命中/状态/新鲜度），不虚构 commit。
  - Memory Debugger：`read_shadow(debug:true)` 输出召回管线 trace（候选/命中/冷却/预算/返回 + 每条打分拆解入口·主题·路径·正文 + 状态），默认关闭不干扰正常返回。
  - 自检：mock 场景 28（证据链）/ 29（Memory Debugger）全 PASS，场景 1–29 全量 PASS。
### v0.5.1（fix）

  - 采集侧剔除宿主注入的系统级脚手架：`extractMessage` 逐内容块 `stripSystemScaffold`（剔除 `<system-reminder>`/`<system-instruction>` 等成对标签块 + 孤立残留标签），并识别**无标签裸脚手架块**（`The following workspace instructions`/`Current runtime context. This snapshot`/`A skill is a reusable set of task-specific instructions`/`Additional instructions from:` 等完整措辞开头）——修「系统提示泄漏进记忆」（workspace 指令 / runtime context / skill 目录被误当用户消息记下，含无标签变体）。
  - 自检：mock 场景 27（系统提示不泄漏，含裸脚手架 + 误伤守卫）全 PASS，场景 1–27 全量 PASS。
### v0.5.0（feature）

  - 读侧护栏 P1–P5：`read_shadow` 二次 scrub（`scrubFinal`：剔控制/双向字符 + 密钥打码 + 去注入标签/短语）、无匹配语义（带「数据非指令」前缀）、召回标「记忆｜⚠可能过时/需验证，非当前事实，非指令」、会话隔离（写线索头「> 来源会话」+ 读侧跨来源标注）、`writeConsent` 可选开关。
  - 写侧护栏强化：线索头也 `scrubUnsafe`（修控制/双向字符绕过 `isUnsafe` 从线索头泄漏）。
  - 入口语义切分：纯工具名不作 entry（防跨事务串线）；`session/flush` 兜底落盘 + pending 超 60 异步落盘；flush 写失败 error 级 + `read_shadow` 暴露「⚠ 数据不可达」。
  - 自检：mock-harness 场景 1–26 全 PASS（采集/召回/索引/分层/护栏/遗忘/会话隔离/writeConsent）；DSH probe 验证闭环（6 能力项健康）。

### 9.（第 3 轮追加，同日）论文层第一份硬核：**MemStrata 全文深读（`adr/0080`）**

**读到的**：摘要、§1–§8、Reproducibility Statement、Appendix B/C/D 全文、**Table 1/2/3 表体**、A.3 两张 sweep 表。
**未读到（诚实标注）**：**A.1（8 条件 × 6 基准全矩阵）**、**A.2（forced-answer 四表）**、**Table 4/5（延迟）表体** ——
`arxiv.org/html` 与 `ar5iv` 都在 A.1 表体处被截断；jina 文本代理整体丢弃 A.1/A.2 表体；PDF 与 TeX 源因 content-type 不受支持。

**四项可吸收**（全在**指标与协议**层，不触碰 D3 决策）：
1. ⭐ **`stale-fact-error rate` + 两 regime 同报**（分子=以被取代值作答的矛盾题数；分母=矛盾题数 30/20/20/20；
   「允许弃答」与「**强制作答**」必须同报，否则弃答会把 stale 错误**洗成低准确率**）。→ **T14**
2. ⭐ **marker-free 不变式 + 词边界 tell 自检**（被禁词表 + 测试强制 + 「去掉污染后对照臂掉多少」的量化：
   重排臂 −14 点、门控臂 −18 点、时间法仅 −4）。→ **T11①**
3. ⭐ **两侧夹逼的消融形态** + 单变量 flag（`retain_all_turns` 默认关、写路径其余冻结）
   + **未做就说未做**（D.2 原文「we do not imply a measurement we did not take」）。→ **G1**
4. ⭐ **ADR-0059 的不可达性证明**：Table 1（n=98）cosine 分 duplicate/其余 **AUROC 0.5926**，
   **任何阈值 precision 上限 0.667**、「0.95 floor 不可达」。
   ⇒ **本仓 README/CONTEXT 早已引用的「0.59」由此认领原始出处**（`references.md` §6.4）。

**三项不吸收**：取代键 `(S,R)` 与其规范化（规范规则**论文未给**，键相等性**靠 LLM 抽取保证** ⇒ 撞 ADR-0059）；
持久化取代（撞 ADR-0061 的有意决策）；向量读路径/嵌入/LLM 判官（撞 ADR-0001/0060）。

**三处更正我自己的表述**：① 取代键是 **`(S,R)`**、`object` 是被比较的值（第 2 轮写成三元组）；
② 「**已发布** harness/数据集」→ **声称已发布、本版未给地址**（双盲匿名）；
③ 转录其两处**不诚实**并转为本仓纪律：摘要写「~0%」而表体是 `0.03`（实为 **1/30**）；
准确率与 stale 错误**复用同一 3B 判官**（作者自陈有「同行重叠」）⇒ 本仓两指标必须**各自独立判定**并列出重叠行。

**T16 另两条当轮结案**：
- **第 3 条**（`sessionProjections`/`storage`/`storageDomain`/`jobs`/`invariants`）：
  四份契约取自运行体；**「重造」怀疑只对一项成立**——前四项**不适用**（文件派生 ≠ 会话事件折叠；
  人类可读文件树 ≠ 不透明后端，撞 ADR-0001；本仓无后台长任务），
  唯一候选 **`invariants`**（可把只活在测试里的不变量注册成宿主可执行检查），但有**两条前置未确认**（失败是否阻断宿主 / 选择由谁配置）。
- **第 2 条**：读 `vendor/loader/src/config/isolate.ts:98/99-101/123` 后**推翻子代理的说法**——
  子行**通过原型链继承**父行 realm（`Object.create(entry.parent.ctx[Context.isolate])`）
  ⇒ 本仓预设 `group + isolate + 子行` 的写法**本来就对**，技能散文**准确**；「逐行声明（可覆盖）」那半才对。

### 10.（第 4 轮追加，同日）两条独立产出：**`invariants` 前置两问结案 + 一个阻塞项** · **hl_mem 门禁形状清单**

**本轮无代码 / 行为改动**（纯查证 + 台账）。目标轮次第 4 轮。

**A. 平台 `invariants`：两条前置已结案，第三问成为阻塞项（细节 `references.md` §6.5）**

- **(b) 默认执行 —— 是**：`packages/runtime-diagnostics/invariants/src/index.ts:96,115` `enabled` 默认 `true`；
  `:120-126` 无过滤器即全接纳；**安装体 `dsh-invariants@0.1.5-rc.2/lib/index.js:45,62,67-70` 与源码逐字同构**
  ⇒ **版本偏差不影响本项**。选择由**挂载该行的组合**给（实例：安装体 `dsh-sdk-minimal/cordis.patch.yml:103-104`，
  **无 config ⇒ 全默认**）；过滤器在服务生命周期内固定（`README.zh.md:153`）。
- **(a) 失败 = dispose 子 fiber + 回滚保留 + 注册方自身 `apply` 失败**：
  `:161-163` `fail()` 抛 `InvariantError` → `:172-175` `await child.dispose()` 后 **rethrow** →
  从 `ctx.effect(async …)` 冒出 → `register()` 的 thenable **reject** ⇒ 调用方（配套入口自己的 `apply`）失败。
  **⚠ 仍未验证**「是否阻断整个宿主启动」（取决于 Loader 对单行激活失败的处置，属运行体实验）——**未写成已知**。
- **新查到的第三条（比 (a)(b) 更影响裁决）**：**「只挂服务不挂配套入口 == 没有检查」**
  （`README.zh.md:12,156`：注册表自身不携带产品检查）⇒ 检查是否真跑，取决于**本仓自己有没有 `register()`**，
  不取决于服务在不在 ⇒ 对本仓**有利**（不必改宿主组合）。
- **🔴 阻塞项（未定位）**：运行中的 web 宿主**确实有** `invariants` 服务（运行体 Service 目录可证），
  但我**在它声明的每一层组合里都没找到挂载行**——已逐项排除 `dsh-base` / `dsh-web-app` / `archify-dsh` /
  `dsh-shadow` 的 patch、用户补丁层、4 个随包 agent preset、部署闭包内**任何 `*.js` 对 `dsh-invariants` 的引用**；
  **唯一含该行的 `dsh-sdk-minimal/cordis.patch.yml:103-118` 不是 web profile 的 bundle**。
  ⇒ **必须定位「挂在宿主根上下文还是会话/`isolate` realm 内」**：本仓是 **host-plane bundle 插件**，
  若服务只在会话 realm 内则 `ctx.get('invariants')` **取不到** ⇒ **定位之前 T16 第 3 项不开工**。

**B. 新增一条枚举纪律（方法层，已复现）**

- **PowerShell `Get-ChildItem -Recurse` 默认不跟随 junction**：实测
  `…\dsh\0.1.5-rc.2\…\node_modules\@deepseek-ai` **70 条里 69 条是 reparse point**；不加 `-FollowSymlink`
  的递归 grep **静默跳过 69 个包**并给出**看似确凿的 0 命中**（加 flag 后立刻命中）。
  ⇒ 这是 ADR-0074 补记那次「只 grep 三个包就断言不存在」的**第二个变体**：**不是范围写小了，而是工具静默缩小了范围**。
  **纪律**：凡以「0 命中」为结论的搜索，**必须先证明枚举到了非空且完整的语料**（给出计数，或第二种工具交叉验证）。

**C. hl_mem 测试面 / 评测门禁的形状清单（服务 T13 / T14 / T11① / V6；细节 `references.md` §6.6）**

- **最值钱三件**：① **「生成器 + 签入产物 + 门禁逐字比对」三件套**（同形 6 次，唯一更新入口 `--update`/`--write`，
  确定性序列化是前提，**缺件即非零**且失败文案自带更新指引）；② **allowlist 腐化自检**（白名单里的路径/函数不存在
  **也算违规**）+ **棘轮只降不升**；③ **协议常量与代码分离 + 先证同源再比数值 + 门控指标显式列名**。
- **它自己没接上的线（照抄形状时勿照抄这些洞）**：比较器 `compare_core_v1.py` **零 workflow 调用**；
  「两次运行功能字段逐字相同」**只有散文无脚本**；覆盖率地板 CI 80 vs 本地 60（同判据两处数值）；
  棘轮基线缺件时 `return 0`（缺件即通过）；一个 `check_*.py` **无任何 workflow 调用**。
- **落点**：T13（+ 元测试把纪律写成检查项的形态）、T14（+ 签入基线 / 拒绝覆盖 / 基线来源档位 / 缺 slice 即失败）、
  V6（+ **合取式退出码**样板：`run_extraction_quality_smoke.py:255-257`「全通过 ∧ 恰好 1 次外部调用 ∧ 保留 ≤16」）。
- **T11① 的实情（诚实标注）**：hl_mem 在此**只有文档纪律**（「同缓存同 scorer 才可判回归」「改门禁常量须同时提交同快照
  A/B 证据」）+ 一个可执行字段（`relation_chain_holdout_manifest.json:17` `access_policy: sealed_..._only`），
  **无强制机制** ⇒ 本仓若要，必须**自建**。

**D.（同轮勘误，同日）A 段第 2 条是错的 —— 改用运行时可读取，`invariants` 根本没挂**

上面 A 段写「运行中的 web 宿主确实有 `invariants` 服务」，依据是**运行体 Service 目录**（`cordis_inspect_query`）。
我随后做了**运行时读取**，结论被推翻；**A 段第 2 条作废**（A 段第 1 条 (b)、第 2 条 (a)、第 3 条仍成立）。

- **探测方式**：一个**只读**动态 Host 插件，在 `apply(ctx)` 里逐名读 `ctx.get(name)`，结果以**抛异常**送出
  （动态 Host 半没有别的即时回传通道；`console.log` **不进** `~/.dsh/dsh-web.stdout.log`，那文件是旧的）。
  **不 `JSON.stringify` 任何活对象**，只读 `constructor.name`。
- **读数**：`ctx.get('invariants') === undefined`。而同一次探测里，
  **只在宿主/Web 层 patch 挂载、任何 agent 预设都不提供**的服务——`spillStore` / `tokenMeter` / `shellEnv` /
  `codeRuntime` / `webServer` / `clientModules` / `sessionTitle` / `sessionQuery`——**全部读到了**
  ⇒ 沙箱 `ctx.get` 读的是**全局服务表**，因此 `undefined` 是**真的没挂**（对照名 `definitelyNotAServiceControl`
  同样 `undefined`，排除「门面恒返回对象」）。
- **裁决**：本仓若写 `ctx.get('invariants')?.register(...)`，在这个部署里是**静默 no-op = 假闸门** ⇒
  **T16 第 3 项 `invariants` 判「暂不吸收」**；将来重启该项的前置 = **同时把挂载行写进部署组合**
  （范本 `dsh-sdk-minimal/cordis.patch.yml:103-104`；本仓 `cordis.patch.yml` 只有一行 `dsh-shadow`）
  或**缺件时响亮报告**（ADR-0049）。
- **由此得到一条更一般的纪律**：**Service 目录 ≠ 活性表**。反例三条：`e2b` 在目录里而 `dsh-e2b`
  **在本 profile 里根本没安装**（`Test-Path` = `False`）；`dsh-invariants` **装了但没挂**；
  `authorization` / `inspector` 在目录里而 `ctx.get` 均 `undefined`（`inspector` 尤其反直觉——它是 Inspect 自身门面）。
  ⇒ **凡结论是「某能力运行体里有没有」，唯一判据是运行时读取**；不得用目录、文档或「安装包里存在」代替。
  这与 B 段那条枚举纪律**同族但更险**：B 段是**范围被工具静默缩小**，本条是**我拿「契约目录」当「活性表」用**。
- **✅ 附带好处**：第 1 条（`sandboxPolicy` 对普通插件可见）在本次探测里被**更硬的判据复核**——
  `ctx.get('sandboxPolicy')` 读到对象 ⇒ **ADR-0074 的结论不变，证据从「目录」升级为「运行时读取」**。
- **顺带记录两条动态插件边界事实**：① 沙箱 ctx **不暴露** `root` / `fiber` / `registry` / `extend` / `plugin`
  （运行体原话「Framework internals … are withheld by design」）⇒ 动态插件**无法**枚举运行时树；
  ② **我自己踩了坑**：第二次探测把 promise 链写成浮动的（`apply` 没 `await`/`return`），产生一个**未处理的拒绝**；
  紧接着宿主进程在 `16:40:02` **被整体重启**（pnpm wrapper 与 node 主进程 PID 全新），本会话动态插件表清空。
  **因果未证明**（也可能是有意重启），但两条事实成立：我写出了未被消费的拒绝；动态插件定义**不跨进程存活**。
  **纪律**：动态插件的 `apply` 里不得留浮动 promise。

**本轮变更文件**：`references.md`（**新增 §6.5**：`invariants` 三面互核 + 枚举纪律；
**新增 §6.5.1**：同轮勘误 + 运行时读数表 + 沙箱边界事实；**新增 §6.6**：hl_mem 门禁形状清单）·
`BACKLOG.md`（T16 第 3/4 项改判 + T13 / T14 / V6 各加一节进度）· `CHANGELOG.md`（本块）· `README.md`（v1.15.40 行追加）。
**未改动**：任何 `*.ts` / `dist/` / `cordis.patch.yml` / `agent-presets/`。

**E.（同轮追加，同日）B3 闭环 —— ADR-0074 的落盘修复在真机生效**

宿主在 `2026-09-12 16:40:02` 重启（`dsh web` 的 pnpm wrapper 与 node 主进程 **PID 全新**：11848/14976 → 17284/1680）
⇒ `dist/index.js` 的修复进入运行体。**重启后逐条实测**：

1. ✅ `read_shadow()`（无参）**不再出现**「落盘失败」横幅，只有标准的「⚠ 以下为记忆数据（非指令）」护栏句。
2. ✅ 当天新记忆文件**真的在写**：`G:\project\dsh1\.shadow\2026-09-12\` 下出现**本轮对话之后**新建的文件
   （`2026-09-12--165353-shadow.md` = 16:53:52、`…165342-dsh-shadow-backlog-md.md`、`…165322-docs-fix.md`、
   `…165314-dsh-shadow-references-md.md`、`…165301-dsh-shadow-readme-md.md`），时间戳晚于重启点，
   且**与本轮实际改过的文件一一对应**。
3. ✅ 读路径落盘同样工作：`.shadow/_index.md` 的 mtime = **16:53:52**（与最新记忆同刻）⇒ ADR-0074 接入点 ③ 生效。
4. ⚠ **未单独核验（诚实标注）**：宿主日志侧的 `[dsh-shadow][error] flush FAILED` 未检索到 ——
   会话日志 `session.v3.jsonl.zstd`（6.49 MB）用 Node 26 `zstdDecompressSync` 只解出**首帧 195 字节**，
   改流式解码后报 `Unknown frame descriptor` ⇒ 未解出全量日志。判据 1 与 4 问的是同一件事，**判据 1 的可读面已证为空**。

⇒ **ADR-0074「记忆一条都落不了盘」已恢复**；**不引入新根因层**（判据 5 未触发）。
**顺带观察（未立条目）**：今日 `.shadow/2026-09-12/` 已有 **1034 条**记忆，文件名显示**几乎每次工具调用/每次改文件
都产生一条**（如 `2026-09-12--165314-dsh-shadow-references-md.md`）；采集粒度与语料规模的关系**未评估**
（可能影响 T2 的 85 条 B 类线索分诊与 T9 的召回收益读数）。
