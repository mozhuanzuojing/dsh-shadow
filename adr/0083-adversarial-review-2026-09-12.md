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
