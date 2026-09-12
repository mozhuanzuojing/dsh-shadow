# ADR-0083: 对抗性审查 2026-09-12 —— 三类缺陷、三条新增纪律、以及一份**未修线索台账**

- **状态**：已生效（v1.15.54）
- **触发**：M1-A′ dry run 之后，用户说「review fix all」。第一轮只审了两个新模块（`adr/0082` §8、`adr/0081` §10）；
  第二轮**按缺陷类**全仓扫（而不是按文件扫），三个角度并行：①「报错却仍生效」②「静默丢弃」③「判据分叉」。
- **方法**：三名审查者各自**只读**（不写、不 git、不 build、不跑会写基线的命令），产出**带 `文件:行号` + 原样片段 + 置信度**的报告；
  **每一条我在动手前都自己读过原文核实**（不据别人的报告直接改代码 —— 本仓有过子代理结论错误的先例）。
- **纪律**：报告必须单列「**已排除（追下去发现是对的）**」。三份报告一共排除了 30 余条可疑点并给了理由；
  排除项与命中项**同等重要** —— 没有排除节的审查报告不可用。

---

## 1. 本轮**已修**（每条都有闸）

| # | 缺陷 | 为什么是真缺陷 | 修法 | 闸 |
|---|---|---|---|---|
| 1 | **判据分叉**：正/负结果分类器在**三处**各写一份 | `validation/validate.ts` 与 `dream/compress.ts` 逐字相同，且与 `reflection/patterns/success-rate.ts` **给出不同答案**（实测：`"依赖降低"` 一边 true 一边 false；`"unstable"` 因 `"unstable".includes("stable")` 恰好相反）⇒ **同一份 trace 一处记成功、一处记反例** | 收进 `core/polarity.ts`：词表**并集** + 负向**一票否决**；三个消费方改为 import | `test/review-fixes.test.ts` ① |
| 2 | **`_meta.json` 坏件 ≡ 空件** | `readMetaVersioned` 解析失败返回空快照且不报，`mutateMeta` 随后把**空快照整体写回** ⇒ **一条坏字节把全工作区 pinned/archived/compacted/hits 清零** | `MetaSnapshot.corrupt` 显式标记；`mutateMeta` 遇坏件**直接放弃**（不调 mutate、不写） | `review-fixes` ② |
| 3 | **validation timeline 坏件被覆盖** | 解析失败返回空历史，`appendValidationEvent` 用「1 条新事件」覆盖文件 ⇒ **append-only 历史永久销毁**，从外面看只是「历史变短了」 | 新增 `readTimelineDetailed` 区分「还没有」与「读不出」；坏件**拒绝覆盖**；读路径显式播报 | `review-fixes` ③ |
| 4 | **写失败报成功** | `writeMetaGuarded` 在非冲突错误时 `return true`，而 `true` 的契约是「落盘成功」⇒ `mutateMeta` 判定事务已提交，`hits`/`compacted` 标记**静默不落盘** | 引入三态 `MetaWriteOutcome = "ok" \| "stale" \| "failed"`；`failed` 立刻返回 false（不重试、**绝不报成功**） | 见 §5 线索（未单列闸） |
| 5 | **未知枚举落回默认值** | `disposition` 枚举外的值（如少写一个词的 `"deferred"`）会静默落进 `open` 桶 ⇒ 污染 buckets / 最老 / p90。**这是本轮新加的字段，审查当场指出** | 只有明确的 `open`（含缺省）才算在等；非法值单列 `invalidDisposition` 且**不进任何桶** | `decision-outcome.test.ts` ⑯ |
| 6 | **证据路径漏一道过滤** | `arbitrate`/`judgment`/`core/context` 都有 `isConcreteLocator`，`query/query.ts:220` **漏了** ⇒ glob / git-ref 被当路径去验，必然 `not_found`：同一处证据一处算 `missing=0`、另一处报 not_found | 补 `.filter(isConcreteLocator)` | 未单列闸（需真 host；见 §5） |
| 7 | **测试面从不被类型检查** | `test/*.ts` 不被任何 tsconfig 覆盖，而测试用 `node x.ts` 跑 ⇒ **类型错误在测试里完全不可见**。实测代价：v1.15.52 加必填字段后手写 fixture 少了它，测试**静默变成错的语义**却没报错 | 新增 `tsconfig.test.json` + `npm run typecheck:tests`，**接入 `verify`** | 门禁本身 |

## 2. 由此新增的三条纪律（**要遵守的是这三条**）

1. **坏件 ≠ 空件**（ADR-0049 的延伸）：任何「读→改→写回整份」的路径，**解析失败必须让上层知道**，
   并且**禁止把解析失败后的空对象写回**。「读不出」与「不存在」是两个不同的事实，混同的代价是**静默清零**。
2. **未知枚举不得落回默认值**：枚举字段出现枚举外的值时，**单列并播报**，不得并入任何一个合法桶。
   落回默认值是「缺件不静默」最常见的伪装形态（它让非法输入看起来像一个正常取值）。
3. **判据收一处要说清「怎么收」**：发现同一判据多写一份时，单纯合并**两处都在用的词表/阈值**可能改变语义
   ⇒ 必须写明合并规则（本例 = **并集 + 否决**）并**标注它会改变哪些历史分类**。见 `core/polarity.ts` 头部注释。

## 3. `core/polarity.ts` 的合并规则与**已知语义变化**（诚实标注）

- **规则**：正 = 任一处 POS 命中；负 = 任一处 NEG 命中；**有负即负**。理由：两份词表都是**人工列举的证据清单**（非穷举），
  「一边认为它是正面」本身就是证据 ⇒ 并集；负向是否决票 ⇒ 一票否决。
- **变化**（`validateHypothesis` 侧，**这是修正不是回归，但确实改变口径**）：
  `依赖降低 / solved / 成本下降 / 维护成本下降 / 验收通过` 由「反例」改为「支持」；
  `unstable` 由「支持」（子串误命中 `stable`）改为「反例」。
- **未做**：没有回溯重算历史 ValidationArtifact。**过去的结论仍是按旧分类算出来的**，不做静默改写。

## 4. 证据（可复现）

- `npm run verify` = **52/52**（新增 `test/review-fixes.test.ts`）；闸组数：`proposal-firewall` 14 · `decision-outcome` **16**。
- 棘轮**如实变红 4 处并逐条点名后重录**：`a1 23→24`（`core/util.ts` 的 `hoursBetween`：新导出，唯一消费者是 `core/decision-outcome.ts`）、
  `a2a 3→4`（`isPositiveOutcome` 的再导出形态）、`a_total 37→39`、`b_keys 105→107`（**`outcome=ok` / `outcome=failed`** ——
  正是本轮引入的三态写入判据）。**没有一条是「忘了接线」**，故按 V6/V7 规程记录理由后重录。

## 5. 未修线索（**已逐条带 `文件:行号` 记入 `BACKLOG.md`**，本节不重复）

本轮**只修了 7 类**。审查另外撞出 **约 30 条确证但未修**的问题（多为「受影响面较小」或「需要先决定语义」），
以及**整目录未读**的范围边界（`adaptation/`、`agency/`、`federation/`、`long-horizon/`、`simulation/`、`soul/` 等，
`tools/*.selftest.ts` 全部未读）与 **169 个既存测试类型错误**。

**这些不得被读成「已修」或「不存在」** —— 台账见 `BACKLOG.md`「审查线索」一节。
**本 ADR 不主张审查已穷尽**：三名审查者各自只读了一部分，且**都未做端到端复现**（坏件发生率、真语料影响面均未量化）。

---

## 6. 第三轮（v1.15.55）：修 §5 台账里的**高危条目**，并**修闸自身的两处缺陷**

### 6.1 已修（每条都标了「为什么是真缺陷」）

| 缺陷 | 修法 |
|---|---|
| **flush 顺序反了**：`core/writer-materialize.ts` 先 `pending.delete` / `comps.delete`，**再** `if (!ws \|\| !fs) return` ⇒ 取不到 ws/fs 时**整批记录已被消费掉**：没落盘、也没留痕（`lastFlushError` 未设 ⇒ 读侧 `getFlushWarn()` 恒空） | 把「取工作区 + 会话 fs」提到消费**之前**；取不到 ⇒ **保留 pending** + 设 `lastFlushError` + `console.error` |
| **索引失败后照读陈旧索引**：`rebuildIndex` 吞异常返回 void；`ensureIndex` 无条件 `indexDirty.delete(ws)` ⇒ 一次失败之后**再也不重建**，而调用方照读磁盘旧 `_index.md` | `rebuildIndex` 返回 `boolean`；失败时**不清 dirty**、设 `core.lastIndexError`、`getFlushWarn()` 渲染「索引可能不是最新的」 |
| **FutureEvidence 落盘失败仍播报 `registered`** | `registerFutureEvidence` 返回 `{ evidence, persisted }`；`mode:evidence` 按 `persisted` 改写播报（未落盘时明说「不会被 validate 读到」） |
| **hypothesis 落盘失败仍打印 `hypotheses N`** | `writeHypothesis` 返回 `boolean`；`mode:offline` 数出失败条数并在同一条回复里说明「只有 N−k 条可 validate」 |
| **台账坏件 ≡ 空件**（冷却静默清零 ⇒ 已冷却记忆被重发） | `readLedger` 坏件带 `corrupt: true` + 留痕；形状不对（无 `served`）同样算坏件；`writeLedger` 返回 `boolean` |
| **消息截断 600 字无痕迹**（长消息尾部从未落盘，读的人以为这就是全文） | `core/collect.ts` 截断时显式追加「**已截断**：原文 N 字，此处保留前 600 字」 |

### 6.2 闸自身的缺陷（**本轮真实发生**，比被审对象的问题更该先修）

| 缺陷 | 现象 | 修法 |
|---|---|---|
| **V7 语料闸把 `.git` 当语料** | `git gc` 把 `.git/objects/xx` 松散对象打包 ⇒ 目录数 **428 → 185**，而语料一个字没变（指纹相同）⇒ 报 **PARTIAL** 并拒绝比较。**会把一次 gc 误判成「语料坏了」的闸，会被当成狼来了** | `audit-wiring.ts` / `audit-drift.ts` 的遍历**排除 `.git`** |
| **PARTIAL 拒绝录基线 ⇒ 闸把自己的修正堵死** | 修完遍历口径后仍然 PARTIAL（基线是旧的），而 PARTIAL 又**拒绝 `--update-ratchet`** ⇒ **口径修正永远录不进去**（本轮实测卡住） | 目录数这条判据改为**用文件面定案**：文件面健康时的目录降判为「遍历口径/结构变化」⇒ NORMAL **但必须印出理由**（不静默放过）；同时保留**两档**保护 —— 文件面也掉、或目录掉到 **<10%**（物理上解释不通）照旧 PARTIAL。阈值可注入（`catastrophicDirRatio`） |

**标定**：`tools/corpus-health.selftest.ts` 新增 ⑪（口径变化 ⇒ NORMAL + 印理由 / 真截断 ⇒ PARTIAL / 0.9 边界含）；⑥ 改为测**两档**并把 10% 边界显式化（`3/30` 恰在界内 ⇒ 归入口径变化那一档）。

**⚠ 本轮自己写错并当场改正的一处注释**：我起初把语料指纹描述为「**路径 + 全文**的内容派生值」——
实际是 `sha256(文件**路径**集合)`（`audit-wiring.ts:194` / `audit-drift.ts:125`），**不含内容**。
论点仍成立（同一路径集 ⇒ 没丢文件，正好够用于目录数判定），但**措辞已改准**；
「同路径改了内容」这条边界在输出里另有提示。

### 6.3 仍未修（§5 台账里剩余的中危/待定语义条目原样保留）

`manifest.failures` 恒空 · `_index.md` 不进指纹 · query-log 坏行无计数 · 证据路径上限无披露 ·
`observer/projection.ts` 可见性不一致 · 快照坏件回退更旧 · `reads.ts` 截断只写 log ·
`episode.ts` 缺时刻被默认值掩盖 · zg 报错→not_found · `filesystem.ts` 读失败/不存在不分 ·
缺 locator 当存在 · audit-drift `--json --update-ratchet` 写空表 · toolset-authority 落盘早于标红 ·
`factualOnly`/`candidateStats` 丢 `violations` · 以及 §6.3 的六条**待定语义**。
**未读范围与 169 个测试类型错误同样未变**（见 §5）。

---

## 7. 第四轮（v1.15.56）：继续修**报告面/闸面**会说谎的地方

挑选原则：**报告的诚实性优先于功能** —— 一个报告「失败项 0」而实际有失败的系统，会让人做出错误决定。

| 缺陷 | 为什么是真缺陷 | 修法 |
|---|---|---|
| **`audit-drift --json --update-ratchet` 把空表写进基线** | `driftCounts` 只在**人读分支**（`else`）里赋值 ⇒ 走 `--json` 时保持初始 `{}`，**空 drift 表被写进棘轮基线**，而工具照样打印「已写入棘轮基线（drift 段 + corpus 段）」。下一次 `--ratchet` 会因桶消失报红（故不是静默），但**基线是错的** | B 段分组与计数**提到分支之前**，两条路径共用同一份派生 ⇒ **端到端验证**：`--json --update-ratchet` 现在写出 `drift_keys=11 / drift_sites=28` |
| **`toolset-authority` 坏清单先落盘、后标红** | 顺序是「`writeFileSync` → 再判 `falseMeasured` → 置退出码 1」⇒ **它自己声明「必须为 0」的坏清单已经被签进仓库**，离线棘轮与人读消费的都是那份坏清单 | 与同文件上方 `countInconsistency` 的既有先例一致：**先判后写，拒绝产出坏清单**（`process.exit(1)`） |
| **`registerMeta` 失败只 log** | 记忆文件与索引缓存**已写入** ⇒ 这条记忆在索引/召回里活跃，而 `_meta.json` 里没有它 ⇒ `hits` 永远不计、生命周期恒判 NEW、遗忘判据落回默认值 | 返回 `boolean`；`flush` 据此设 `core.lastMetaError`，`getFlushWarn()` 渲染**独立的一条**⚠（与「落盘失败」分开，因为这是不同的事实） |
| **query-log 坏行无计数** | `catch { /* 单行坏跳过 */ }` 只丢不报 ⇒ `total` / 覆盖率 / drift 统计建立在**被削过的样本**上，读数字的人无从知道丢了几行 | `badLines` 计数 + `badLinesNote` 披露（0 行时**不带**该字段，免得误以为有坏行） |
| **`candidateStats` / `factualOnly` 丢掉 `violations`** | 「唯一统计入口」的消费者拿到**干净的数字**，不知道有记录被拒 —— 「有记录被拒」与「本来就没那些记录」是两件事 | `candidateStats` 露出 `violations: number`；`factualOnly` 写明边界并给出取用路径（`projectFacts(records).violations`） |

**标定**：`test/review-fixes.test.ts` 新增 **⑥**（候选统计的 `violations` 与事实面一致 —— 判据收一处）与 **⑦**（坏行计数 + 披露；无坏行时不带该字段）。

**证据**：`verify` 52/52；`--json --update-ratchet` 写出的 drift 表经**真跑核对**（并已还原基线）；两条棘轮通过。

### 7.1 仍未修（台账剩余，**未缩小承诺**）

`manifest.failures` 恒空（`core/node.ts:49` + `projection-store.ts:70`）· `_index.md` 不进指纹 ·
证据路径上限无披露 · `observer/projection.ts` 可见性不一致 · 快照坏件回退更旧 ·
`reads.ts` 截断只写 log · `episode.ts` 缺时刻被默认值掩盖 · zg 报错 → not_found ·
`filesystem.ts` 读失败/不存在不分 · 缺 locator 当存在 · §6.3 六条**待定语义** ·
**169 个既存测试类型错误** · **整目录未读**（`adaptation/`/`agency/`/`federation/`/`long-horizon/`/`simulation/`/`soul/`，
以及审查者点名「可能是最高危假绿源」的 `tools/*.selftest.ts`）。

---

## 8. 第五轮（v1.15.57）：证据面与报告面 —— 「判不了」不得伪装成「已核实」

挑选原则同第四轮（**报告/证据的诚实性优先**）。这一轮修的是**会直接改变裁决**的两种谎：
**「读不出」被说成「证据仍在」**（还带 0.99 置信度 + fresh），与**「工具报错」被说成「证据不存在」**。

| 缺陷 | 为什么是真缺陷 | 修法 |
|---|---|---|
| **`fsExists` 把「判不了」返回 `true`** | 无 `fs` / 无工作区 / `ref.path` 为空时旧实现 `return true`（注释写「无法判定时视为存在，避免误伤」）⇒ provider 报 **`status:"verified", confidence:0.99, freshness:"fresh"`**：**缺件伪装成已核实**，而且是**最高置信度那一档**。它直接决定召回 `score × 0.5` 与 stale 裁决 —— 依据却是一次「没读到」 | `fsExists` 改**三态** `"exists" \| "missing" \| "undecidable"`；`undecidable` ⇒ `status:"unavailable"`（既有状态，消费方已会打印 reason、不计入 missing），`confidence: 0`、`freshness: "stale"` |
| **「读不出来」被判成「不存在」** | `readText` + `listDir` 都抛时旧实现一律 `return false` ⇒ **EACCES / 后端异常**被当成「证据失效」⇒ `score×0.5 + stale`（**假漂移**） | 只有**明确的不存在**才算 `missing`：判据认**宿主契约自己的标记** `FS_NOT_FOUND`（`dsh-fs-local` 对不存在路径抛这个，不是 `ENOENT`）以及 ENOENT 文本；其余一律 `undecidable` |
| **zg 报错被改写成 `not_found`** | `runZg` 在非 ENOENT / 非超时时返回 `unavailable:false, reason:"error"` ⇒ 落到 `zgVerify` 的 `not_found` 分支 ⇒ **一次工具失败被当成「该证据已失效」**：`arbitrate` 计入 missing、召回 `×0.5 + stale`。语义上我们**没能验证**，不是「验证了它不在」 | `unavailable: true, reason: "error"`；并把 `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`（缓冲太小）单列为 `reason: "output_too_large"` —— 那个此前混在 `error` 里，看起来像「zg 坏了」 |
| **manifest 恒报「失败项 0」** | `deriveShadowNodes` 的 `if (!gate.allowed) continue` **只丢不记**，而 manifest 的唯一诊断通道 `buildManifest("1", nodes)` **从不传第三个参数**（`failures`） ⇒ `renderManifest` 恒报「失败项 0」，而实际有一批原子被挡在投影之外。**报 0 失败比不报更坏**：它让人以为这条路径没有问题 | 新增 `deriveShadowNodeFailures`（与 `deriveShadowNodes` **同源**，同一个 `validateAtomProjection`）；`rebuild(derive, failures)` → `buildManifest(..., failures)`；`loadOrBuildProjection` 增加**惰性** `failures` thunk（只在真正 rebuild 时求值 ⇒ 命中投影缓存时**不多付**一次物化代价）；唯一生产调用点 `query/reads.ts` 接上 |

**标定**：
- `test/evidence-gate.test.ts` 新增**不变量**：`节点数 + 失败数 = 原子数`（没有「凭空少一条」的第三条路），且 `renderManifest` 必须显示真实失败数、**不得**出现「失败项：0」。
- `test/evidence-absolute-path.test.ts` ⑤ 改口径（**判不了 ⇒ `undecidable`**，不再是「视为存在」）、新增 ⑪（provider：判不了 ⇒ `unavailable`/0/stale · 存在 ⇒ `verified`/0.99 · 不存在 ⇒ `not_found`）。

**证据**：`verify` **52/52**；棘轮如实变红 `b_keys 107 → 110`（**+3 正是本轮新增的三态判据** `state=exists` / `state=undecidable` 等），逐条点名后重录。

### 8.1 仍未修

`_index.md` 不进指纹 · 证据路径上限（`.slice(0,12)`）无披露 · `observer/projection.ts` 可见性不一致 ·
快照坏件回退更旧 · `reads.ts` 截断只写 log · `episode.ts` 缺时刻被默认值掩盖 · **§6.3 六条待定语义** ·
**169 个既存测试类型错误** · **整目录未读**（`adaptation/`/`agency/`/`federation/`/`long-horizon/`/`simulation/`/`soul/`，
以及 `tools/*.selftest.ts`）。

---

## 9. 第六轮（v1.15.58）：披露面 4 处 + **标定测试自身的假绿**（审查者点名的「最高危假绿源」）

### 9.1 披露面（「报告不得虚报」这一族）

| 缺陷 | 为什么是真缺陷 | 修法 |
|---|---|---|
| **`shadow_query` 截断不披露** | 检索路径早就有 `truncationNote`（`retrieval/render.ts:26`，借 PageIndex 的 `part/total_parts/has_more`），而 `shadow_query` 只把 `returnedNodes` 写进 query-log、**返回文本里一个字不提** ⇒ 同一份数据**两条读路径披露不一致**：读到「8 条」的人不知道其实命中 30 条 | 用 `allMatched` 算 `droppedByLimit`，附一行「命中 N 个，只返回前 limit 个（**还有 k 个未显示**）」 |
| **证据路径上限无披露** | `arbitrate.ts` 的 `.slice(0, 12)` 让「**前 12 条**都不是缺失」被读成「**全查过了、都没缺失**」 | 导出 `EVIDENCE_PATH_CAP`，`conflictOf` 返回 `droppedByCap`；experience 渲染与 `ev.unverifiedByCap` 都带出「另有 k 条**未核验**」 |
| **快照坏件回退更旧后无声** | `readLatestSnapshot` 某天快照坏就**继续找更旧的**（有意，不因一份坏文件返回 null），但调用方**不知道**自己拿到的是旧图 ⇒ 「读到旧投影」伪装成「投影就是当前状态」 | 跳过的坏件累积到 `skipped`，真正回退时打印「跳过了哪些 / 实际用了哪份」；函数文档写明回退语义 |
| **`observer/projection.ts` 两处可见性失真** | ① 读不出的记忆 `continue` ⇒ 它**既不进 relevant 也不进 excluded**，而 `reality.total` 按全量算 ⇒ 数字对不上却看不出为什么；② `候选相关` 报的是 `rel.slice(0,8)` **之后**的长度 ⇒ 命中 12 条显示「候选相关 8」（**那是上限，不是命中数**） | 新增 `unreadable`（单列 + 渲染「读不出 ≠ 不相关」）与 `relTotal`（报上限**前**的真实命中数 + 「本视图只显示前 N」） |

### 9.2 标定测试自身的假绿（**这比被审对象的问题更该先修**）

审查者此前点名 `tools/*.selftest.ts` 是唯一**从未被审过**的目录、「可能是最高危的假绿源」。逐份读完，抓到**一处致命 + 一处判据零标定**：

| 缺陷 | 为什么是假绿 | 修法 |
|---|---|---|
| **`audit-wiring.selftest.ts` ⑪ 是同义反复（致命）** | 它在测试内**重写了一遍产品侧的分桶 ternary**，再断言「四桶之和 = A 段总数」—— 分桶值由同一段代码赋出，和**必然成立**；各桶断言也逐字复述那几个条件。⇒ **把产品侧改成任何东西，标定测试照样全绿**，它验证的只是自己那份拷贝 | 把分桶判据搬进 lib（`bucketOf`），CLI 与测试**共用同一份**；⑪ 重写为「四桶正例 + **三条反例**（A1/A2b/A3 各一条）」，并加「真仓库 A 段不得为空」。**变异验证**：把 `bucketOf` 的 A1 条件写反 ⇒ 立即 `AssertionError: 零引用 ⇒ A1` |
| **`audit-drift` 判据 ③ 从未被任何夹具触达** | 原 NEG-2 的条件里**没有 `.has(`** ⇒ 它在判据 ② 就被 `continue` 掉，**根本走不到 ③**（收集 `probeVars` 并据此排除的那段）。把它删掉或写成恒空集合，标定测试仍全绿 | 加**差分对** `POS-4` / `NEG-6`：两者形状**只差**「条件里有没有探针赋值的局部名」⇒ 必须给出**相反**结果。**变异验证**：废掉 `probeVars` 的填充 ⇒ 立即 `AssertionError: NEG-6 不得被报出（假阳）` |
| **`isTestPath` 这条判据零覆盖** | 它由 v1.15.43 的**真缺陷**修来（旧写法 `!isProductionPath` 把 `dist/`、`node_modules/` 也算成「测试引用」⇒ A 段那列虚高），却定义在 **CLI** 里 ⇒ 改成 `p.includes("test")`、退回旧写法、或整条删掉，6 个 selftest 全绿 | 搬进 lib，新增 ⑬：正例 + 反例（**明确断言它与旧写法在「产物/依赖」上给出不同答案**） |
| `audit-layers.selftest` ③ 用空判据表断言主方向 | `NO_RULES` 把方向禁令清空 ⇒ 该断言与 `DIRECTION_RULES` **完全无关**，往表里加反向禁令也测不出 | 改用 `{ pureModules: [] }`（只清白名单、**保留真方向表**） |
| `retrieval-eval.selftest` 的恒真断言 | `assert.equal(h1.algorithm, HASH_ALGORITHM)` 而 `datasetHash` 就是把该常量原样放回 ⇒ 恒真（等价 `assert.ok(true)`） | 改为对**字面量** `"sha256-utf8-lf-v1"` 断言 |
| `audit-drift.selftest` 真仓库断言无下限 | `walk` 吞 `readdirSync` 异常并返回已累积结果 ⇒ 取错根/递归没跟随会让 `prod` 变空，此时「0 条线索」**照样通过**（CLI 有 `exit 2` 的闸，标定测试没有） | 补 `assert.ok(prod.length > 0, …)` |
| `corpus-health.selftest` footer 与代码不符 | footer 称 `retrieval-eval` 走本闸，实际它**没调用 `classifyCorpus`**、是第二份内联实现 ⇒ 那句话会让读者**不再去查它** | 改正 footer，并把「同一判据两份实现」记为线索（下节） |

**证据**：`verify` **52/52**；6 个 selftest 全绿；**两处变异测试**（改坏 `bucketOf` / 废掉 `probeVars`）分别立即变红 —— 这是「标定测试真的能失败」的可复核证据。
棘轮如实变红 `b_keys 110 → 113`：**+3 正是本轮新增的标定断言**（`bucket=A1/A2a/A2b`），逐条点名后重录。

### 9.3 新记线索（本轮发现，**未修**）

- **`retrieval-eval.ts:117-120`** 有第二份「语料太小 ⇒ PARTIAL」实现（读协议常量 `min_corpus_files`），与 `classifyCorpus` **判据分叉**且**该份未标定**；
- **`audit-wiring` 与 `audit-drift` 的 `isProductionPath` EXCLUDE 不同**（前者把 `tools/` 当生产面，后者排除）⇒ 两个工具的口径不一致，且**两个 selftest 各自把相反期望锁死**（`audit-wiring.selftest.ts:82` vs `audit-drift.selftest.ts:40`）。**要统一必须先决定 `tools/` 算不算生产面**（改哪边都会破一个棘轮基线）；
- **所有 CLI 接线（退出码语义、`--update-ratchet` 的拒绝分支、两工具共用基线文件却分写段）零自动断言** —— 历史上真实踩过的两类缺陷都在这里，两处 footer 已自认；
- **`toolset-authority.ts` 未接进 `npm run verify`**（只在单独的 `verify:authority`）。

---

## 10. 第七轮（v1.15.59）：把**CLI 接线**这条最高危盲区做成自动断言

### 10.1 先探针，再承诺

上一轮 footer 里写着「CLI 接线要 spawn 子进程才能测」。**这一轮先写了探针**（`.docs/fix/2026-09-12/spawn-probe.ts`）：
本环境 `execFileSync` 管道捕获**可用**、非零退出码**可读**（`SPAWN_OK` / `status=2`）。于是可以做，不必继续记成「未做」。

### 10.2 新增 `tools/cli-wiring.selftest.ts`（5 组，**spawn 真 CLI**）

此前 6 个 selftest **100% 只调纯函数**，而本仓历史上真实踩过的两类缺陷都长在 CLI 接线上：

| # | 断言 | 锁住的真实缺陷 |
|---|---|---|
| ① | `node tools/audit-wiring.ts --ratchet`（**旗标占了 root 位置**）⇒ **exit 2**；drift 同 | v1.15.45：漏 root 参数 ⇒ ROOT 取到旗标 ⇒ 0 文件 ⇒ **静默全绿** |
| ② | 显式给**空语料根** ⇒ 两个 CLI 都 exit 2 | 「0 文件不是没问题」这条闸的另一面 |
| ③ | `--update-ratchet` 在坏语料上 exit 2，**且基线文件逐字节未变** | 「闸不许把坏读数写进基线」的**接线面**：拒绝必须先于 `writeFileSync`。（安全性：测试内先备份、`finally` 还原） |
| ④ | 基线**必须分段**：`wiring` / `drift` 各自独立，且 `corpus.wiring` / `corpus.drift` **分键** | v1.15.45 第二处：两个工具量**不同语料**却共用 `corpus` 键 ⇒ 互相覆盖、判成「骤降 76%」 |
| ⑤ | `run-tests.ts` 确实扫描 `tools/*.selftest.ts` | 防「标定测试没接进门禁」的死文件 |

### 10.3 两处判据收口 / 锁口

| 项 | 处理 |
|---|---|
| **`retrieval-eval` 的第二份语料判据**（`retrieval-eval.ts` 内联块，**零标定**；旧 footer 还误称它走 `classifyCorpus`） | 抽成 `retrieval-eval.lib.ts` 的 **`corpusFloorVerdict`** 并在其 selftest 里补 **⑬**（`==` 通过 / `<` 拒绝且带阈值 / 未设或非法 ⇒ 不拦）。**明确保留两份判据**：一个是**绝对下限**（拦工作区指错），一个是**相对基线容许带**（拦工具坏了）—— 拦的是不同故障 |
| **`isProductionPath` 分叉**（wiring 把 `tools/**` 当生产面，drift 排除它；drift 因此看不见自家这对分叉） | **不擅自统一**（统一会改某一侧的基线口径，须先决定「`tools/` 算不算生产面」）⇒ 本轮把它**锁住**：新增 ⑭ 断言「两份的差异**恰好**是 `tools/` 下的路径」，于是任何一侧被改动都会红，**逼出那个决定**；同时锁住无分歧的部分（两边都必须排除测试面与产物） |

### 10.4 一处**实测修正**上一轮的记录

上一轮把 `toolset-authority.ts --check` 未接进 `verify` 记为「未接进（未说明原因）」。本轮**实测**：
`node tools/toolset-authority.ts --check` 在本机 **>120s**（winget 探测）⇒ 真实原因是**耗时**（它本身确实是只读的、`--check` 不写文件）。
已写进新 selftest 的诚实标注，避免后来者以为是「忘了接线」。

**证据**：`verify` **53/53**（+1 就是新 selftest）；棘轮如实变红 `b_keys 113 → 115`（**+2 = 基线分段断言** `wiring=object` / `drift=object`）后按规程重录。

**仍未修**：`isProductionPath` 口径统一（**等拍板**）· `--update-ratchet` 的**成功**路径未自动化（会改真实基线）· **169 个既存测试类型错误** · §6.3 六条待定语义 · 整目录未读（`adaptation/`/`agency/`/`federation/`/`long-horizon/`/`simulation/`/`soul/`）。

---

## 11. 第八轮（v1.15.60）：把「判据分叉」这条线索**判定掉**，并更正一处我自己的计数错误

### 11.1 `isProductionPath` 同名不同义 —— **判定：不是缺陷，是命名问题**

上一轮把它记成「分叉，**等拍板** `tools/` 算不算生产面」。这一轮**想清楚了，不需要拍板**：

| | `audit-wiring` 的用法 | `audit-drift` 的用法 |
|---|---|---|
| 它问的问题 | 「**谁可能调用这个导出**」（A 段：导出但生产无调用点） | 「**产品模块之间**有没有同一条判据被表达两次」（B 段：判据分叉） |
| `tools/` 该不该算 | **该算** —— CLI 与审计工具是**真实的调用者**；排除它们会让「被 CLI 调用的导出」统统落进「零引用」桶，那是**另一种谎** | **不该算** —— 审计工具不是产品模块；算进来只会让 B 段线索被工具实现塞满 |
| 结论 | 两份**刻意不同** | 同左 |

⇒ 两个工具问的是**两个不同的问题**，共同一个函数名才是真问题。**改法：按用途改名，并把约定锁成断言**：

- `audit-wiring.lib.ts`：`isProductionPath` → **`isCallerCorpusPath`**（并注释说明它含 `tools/`）；
- `audit-drift.lib.ts`：`isProductionPath` → **`isProductModulePath`**（并注释写明**已知副作用**：它因此看不见 `tools/` 内部的分叉 —— 包括这两者的差异本身）；
- `audit-wiring.selftest.ts` ⑭ 从「差异未拍板」改为「**差异是刻意约定**」：断言两份的差异**恰好**是 `tools/`，两侧无分歧的部分（测试面/产物/依赖都必须排除）也一并锁住 ⇒ 任一侧口径漂移即红。

**这条线索的处置方式本身值得记下来**：把「看起来是分叉」的东西**判定成两种不同的问题**，比强行统一更有价值 ——
强行统一会把「谁调用它」和「产品模块间有无重复」两个问题绑死，然后其中一边必然是错的。

### 11.2 更正我自己的一处计数错误（诚实标注）

我在 v1.15.58 / v1.15.59 的 CHANGELOG 与 README 里反复写「**169 个既存测试类型错误**」。
本轮**重新测量**：那 169 是 `npx tsc ... | Measure-Object -Line` 的**总输出行数**（含每条诊断的续行），
**不是诊断条数**。用只匹配 `error TS` 的口径数，实际是 **83 条诊断**。

**教训**：把「输出行数」当成「问题条数」—— 这正是本仓一直在防的那类伪精度（同一个数字，两种口径）。
已在 `BACKLOG` 与本轮 CHANGELOG 更正为 **83**。

---

## 12. 第九轮（v1.15.61）：认识论层的「损坏/失败必须出声」6 处 + 三份从未读过的目录的审查台账

### 12.1 本轮的**一条判定**（推翻我此前的假设）

此前把 `adaptation/` · `agency/` · `continuity/` 记成「整目录未读（可能未接线）」。
审查结论：**三层全部已被生产接线**（`query/adaptation.ts:7-9`、`query/agency.ts:7-9`、`query/contverify.ts:7-9`
→ `query/query.ts:20/23/12`、`:101/107/112` → `index.ts:32`、`index.ts:297`）。
⇒ 那些缺陷按**当前生效**定级，不是「潜在」。**「未读」不等于「未接线」，两者都必须查证而不是假定。**

### 12.2 已修（6 处，全部属「损坏 ≠ 为空 / 写失败 ≠ 成功」这一族）

| # | 缺陷 | 为什么是真缺陷 | 修法 |
|---|---|---|---|
| 1 | `readObservations` 单 `try` 包整个循环 | 第 k 个文件坏 ⇒ **静默返回前 k-1 条**，后续永不读；且目录读失败 ≡ 目录为空。下游 `claimOf` 的 `supported` 判据**就吃 `obs.length`** | `readObservationsDetailed`：单条坏件只丢该条 + **计数** + 留痕 |
| 2 | `readClaims` 同型（**更危险**） | 一份坏 claim ⇒ 静默少返回 ⇒ `mode:"world"` 用**残缺图覆盖**落盘 `graph.json`（**不可逆**） | `readClaimsDetailed` + **坏件时不覆盖落盘图**并在出口披露「有 N 个坏件、本次未覆盖」 |
| 3 | `readRealityEvidence` 同型 | 坏件 ⇒ 静默部分/空列表 ⇒ `mode:"stability"` 报 `isolated` | `readRealityEvidenceDetailed` |
| 4 | 三处写失败渲染成成功 | `registerObservation` / `writeClaim` / `registerRealityEvidence` 只 `console.log` 就返回 ⇒ 「写入被拒」与「已登记」**逐字不可区分** | 返回 `{…, persisted}` / `boolean`；`mode:"model-observation"` / `"model-claim"` / `"real-evidence"` 输出显式「**未落盘**」段 |
| 5 | `referenceEvidence` 把「读不出」压成 `null` | 调用方渲染成「（无 reality evidence X）」⇒ **把工具报错/坏件当成「不存在」**（ADR-0049 的反面） | 返回 `{evidence, reason: "not_found" \| "unreadable"}`；出口分开说 |
| 6 | `world/explain` 两处失真 | ① `Validation History: N supported claim(s)` 数的却是 **claim 条数**（没验证也显示「验证历史」）；② subject 不匹配时**静默换成** `objects[0]` —— 而该函数的用途正是「为什么系统认为**这个**结构存在」 | 标签改为 `basedOnClaims` 并明说「不是验证历史」；回退时**出声** |

### 12.3 顺带修掉的**判据分叉**（同一个默认值两处两答案）

`query/federation.ts:35` 的 `Number(args?.obsConfidence) || 0.5` 与 `federation/perspective.ts:11` 的 `opts.observationConfidence ?? 0.5`：
**显式传 `0`（零确信）被 `||` 静默改成 0.5**。⇒ 默认值收进 `CONFIDENCE_DEFAULT` + `confidenceOfInput`（只认「没传 ⇒ 默认」；显式 `0` 原样保留；非法值归 0 而**不伪装成 0.5**）。

### 12.4 三份审查的台账（**约 60 条**，本节不重复）

第二批（从未读过的目录）的完整线索记入 `BACKLOG.md` §七，按层分组、逐条带 `文件:行号`：
认识论层（`federation/`·`world/`·`reality/`）· `long-horizon/`·`simulation/`·`soul/`·`planning/` · `adaptation/`·`agency/`·`continuity/`，
外加每层的**测试假绿**（含若干「把实现改坏仍全绿」的具体改法）。

**其中三条最该先处理**（我**没有**在今年这轮擅自改，因为都需要先定契约）：
1. **工具 schema 与读点不一致**：`validations` / `visible` / `hidden` / `hiddenA` / `hiddenB` / `distortion` 不在 `index.ts:163-295` 里，
   而四处读点在读它们 ⇒ 要么 Representative 层**恒为空**（host 剥离未声明参数），要么**可由参数声明 `outcome:"validated"` 直接造 `supported`**。
   这是**契约缺陷**，修它要同时想清楚 `additionalProperties` 与「谁有权声明已验证」。
2. **`claimOf` 的 `supported` 只看调用方传入的 `validationOutcomes`**，从不与 `validation/history.ts` 的 ValidationTimeline 交叉核对（全仓无 join）。
3. **`planning` / `sim-action` 的三处守卫永不失败**（被检对象是调用方刚构造的常量、或已把违规字段丢弃后重建的对象）。

**关于报告的可信度**：三名审查者都只读（未写、未 git、未 build、未跑测试），
**「改坏仍通过」类结论是静态推演**，未实跑验证；三份报告共**排除** 40 余条可疑点并给出理由（排除项与命中项同等重要）。
