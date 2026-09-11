# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本；每个条目保留完整决策/边界/验证记录。


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
- **记账未修（父代理裁决为非本轮返工面）**：① `fs.writeText` 只传 2 参（无 `expected` / `signal` / `sandboxPolicy`）—— 已核实组合**确挂 `fs-sandbox`**，但触发条件是「解析不出 session cwd、落到兜底根 `~/.dsh-observer/shadow`」，且写失败**有可见信号**（场景13 测的正是它，`read_shadow` 会暴露「落盘失败」），故非「静默」；② `core/scope.ts` 的 `agent.session.cwd` 是死分支（宿主只有 `header.cwd`）；③ `continuity/engine.ts` 自造 `FsTarget`，违反 dsh-fs 书面契约（key 只能来自 `resolve()`），本地/沙箱后端今天可用；④ 工具名四级兜底里 `exec.tool` / `toolName` / `tool` 在 `ToolExecution` 上不存在，末位 `exec.name` 命中。
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
