# ADR-0068: `_meta.json` 的读-改-写必须带版本守卫（v1.15.24 的修复放大了这处竞态）

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：**ADR-0067**（本 ADR 处理的是它**连带放大**出来的风险）、ADR-0003（`_meta.json` 是 Derived Artifact）、ADR-0062（接线审计：本 ADR 是同一「先量证再修」纪律的延续）
- 关联待办：`../BACKLOG.md`
- 版本：`1.15.25`

## Context

上一版（v1.15.24 / ADR-0067）修了「命中数累积触发条件错」。那个修复的**副作用**是：

| | 修复前 | 修复后 |
|---|---|---|
| 触发条件 | `servedDetail`（要求「渲染里展开了片段」）⇒ 几乎永空 | `servedRels`（每条被返回的） |
| `_meta.json` 的读-改-写 | **几乎从不执行** | **每次有命中的召回都执行** |

而 `_meta.json` 是**全工作区共享的一个文件**，它的写入全是「**读全量 → 改 → 写回全量**」。
⇒ 修复把一个**理论上的竞态**变成了**常态**：并发（多会话 / teammate / 宿主与子代理同时召回）下**丢更新**。

**三处 RMW 及其写入窗口**（窗口越长越危险）：

| 位置 | 窗口 | 说明 |
|---|---|---|
| `core/memory.ts` `registerMeta` | 短 | 读 → 加一条 → 写 |
| `query/query.ts`（v1.15.24 新改） | 短 | 读 → 累加命中 → 写；**频率最高** |
| `core/writer-materialize.ts` `runCompact` | **长** | 读 meta → **重建索引 + Episode 收口** → 写回**全量** |

**fs 契约本身提供了守卫**（已读 `@deepseek-ai/dsh-fs@0.1.5-rc.2` 的类型定义核实，非推断）：

- `writeText(target, content, expected?: FsWriteIntent, …)`
- `FsWriteIntent = { kind: 'createIfAbsent' } | { kind: 'replaceIfVersion'; version: FsVersion }`
- `FsInfo.version` 的原文注释：*"Opaque freshness token of the target right now."*
  `FsVersion` 的原文注释：*"the freshness token a write/edit guards against."*
- `editText` 文档明写冲突语义：*"the version guard is checked before matching so stale content
  reports `FS_STALE_VERSION`"*；`FsErrorCode` 里确有 **`FS_STALE_VERSION`**。

⇒ **能力就在契约里，而插件一处都没用**（全仓 grep `expected`：与 fs 无关）。

## Decision

### 1. 新增 `persistence/meta.ts` 的事务层：`mutateMeta(fs, ws, mutate, attempts = 3)`

```
for attempt in 1..3:
  snapshot = stat(版本) → readText(内容)      // 先 stat 后 read，见 §2
  keep = mutate(snapshot.meta)
  if keep === false: return true              // 调用方判定无需写入
  if 带守卫写成功: return true
  // FS_STALE_VERSION ⇒ 有别的写入者；重读快照再试（而不是把旧快照盖上去）
give up → log
```

配套：`readMetaVersioned`（带版本快照）、`writeMetaGuarded`（单次带守卫写）、
`readMeta`（纯读侧不变）、`writeMeta`（保留为「明确覆盖」用）。

### 2. **先 `stat` 取版本、再 `readText` 取内容** —— 顺序是安全的那一个

- 若两次调用之间有人写入：我们手上的版本**比内容旧** ⇒ 随后的带守卫写**失败并重试**（不会覆盖）。
- 反过来（先读内容、后取版本）会拿到「**比内容新的版本**」⇒ 守卫通过、**覆盖掉别人的写入** —— 正是要避免的。

⇒ 这是个**顺序敏感**的正确性点，写进代码注释，避免以后有人「顺手调换」而静默引入数据丢失。

### 3. `runCompact` 改为**收集增量标记**，不再用陈旧全量覆盖

原来它拿 `rebuildIndex` 开头读到的 `meta` 全量写回 —— 窗口横跨「重建索引 + Episode 收口」，
期间任何别人的写入都会被**整份覆盖掉**。改为：循环里只 `marks.push(a.rel)`，
最后 `mutateMeta` 在**新鲜快照**上只应用这几个 `status = "compacted"` 标记。
⇒ 从「覆盖全量」变成「应用 delta」，长窗口的丢更新在结构上消失。

### 4. `stat` 不可用时**诚实降级**，不崩

宿主未提供 `stat` ⇒ 版本为 `undefined` ⇒ 退化为**无条件写**（与旧行为完全一致，不更差），
并有测试锁住（`④`）。**不假装有守卫**。

## 复现与锁定（`test/meta-concurrency.test.ts`，5 组断言）

**关键**：mock fs **真的实现** `stat` + `replaceIfVersion` 语义 —— 否则测的是 mock 不是系统
（本仓 v1.15.15 踩过「不忠实 mock」的坑）。测试用「注入一次外部写入」**确定性地**制造版本冲突：

| # | 断言 | 结果 |
|---|---|---|
| ① | 两次 `mutateMeta` 各自落盘且互不覆盖 | ✅ |
| ② | `mutate` 返回 `false` ⇒ 不写（省掉无谓写与版本推进） | ✅ |
| ③ | **并发时冲突被检出并重试 ⇒ 双方更新都保住** | ✅（核心） |
| ④ | 无 `stat` 的宿主：退化为无条件写，不崩、不改语义 | ✅ |
| ⑤ | `readMeta` 纯读语义不变（缺文件 → `{}`） | ✅ |

③ 的读法：注入后若不重试，`other.md` 会被**整份覆盖丢掉**；测试断言它仍在且 `hits === 9`。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 不处理（「命中数少记几次无所谓」） | ① 这是**我自己上一版放大出来的**，不处理＝留下自己造的回归；② `mutateMeta` 的受益者不止命中数 —— `confirmedBy`（置信度）、`status=compacted`（**收口归档正确性**）走同一条路，后者丢了会让已归档原子**重新回到活跃索引**；③ 修复成本低（能力已在契约里） |
| 用 `createIfAbsent` 处理「文件不存在」 | 契约未列出「已存在时 `createIfAbsent` 报什么错」，语义不明确 ⇒ **不引入不确定分支**；只需「有版本就守卫、没版本就无条件」，已覆盖全新文件的场景（首次写会 `stat` 到 `undefined`，无条件写建文件） |
| 加进程内互斥（mutex）防并发 | 只挡同进程；**跨进程/跨会话的写入者挡不住**（宿主与 teammate 可能是不同 Session 但同一进程，读取者却来自不同回合）。版本守卫是契约级的，覆盖面更广 |
| 给 `_meta.json` 加 `maxActive`/上限来减少写入量 | 那是**另一个问题**（文件增长），且默认关（`maxActive: 0`）。不混在本 ADR 里 |
| 把重试做成无限 | 拿不到独占就无限重试会**活锁**。定 3 次，失败则放弃这一次更新（宁可少记一次，也不覆盖别人）并**打日志**（不静默） |

## Consequences

### 正
- **丢更新被结构性消除**：三处 RMW 全部走事务；`runCompact` 从「覆盖全量」变「应用 delta」。
- 恢复了一条**正确性相关**的写入：`status = "compacted"` 不再可能被并发覆盖 ——
  它是「已归档原子移出活跃索引」的依据，丢了会让收口归档**部分失效**。
- 用上了宿主**已经提供**的能力（版本守卫），而不是自造锁。
- **顺序敏感点被显式记录**（先 stat 后 read），避免未来「顺手调换」引发静默数据丢失。
- 无 `stat` 的宿主有测试锁住的**诚实降级**路径。
- 测试的 mock **忠实实现契约**（含 `stat` 与 `FS_STALE_VERSION`），不落进「测 mock」的坑。

### 负 / 已知边界
- **重试可能增加写入次数**：并发高时同一事务可能写 2–3 次（每次都带上失败的那次尝试）。
  代价是几次小文件读写，换取不丢更新。
- **重试耗尽会放弃这一次更新**（连续 3 次冲突）并打日志。语义是「**宁可少记一次命中，也不覆盖别人**」——
  这是有意的方向选择，但意味着**极端并发下计数可能偏低**。
- `readMetaVersioned` 依赖 `fs.stat`；**未在真机 `host.fs` 上端到端验证**（测试是按契约写的 mock）。
- **`writeText` 的守卫语义本轮只读契约核实，未真机触发 `FS_STALE_VERSION`**（mock 里触发了）。
- 长窗口的根本缓解靠 §3 的 delta 化；但 `registerMeta` / `query.ts` 仍有短窗口，靠重试兜底。

## 自检

- [x] 与 ADR-0003 一致：`_meta.json` 仍是 Derived Artifact，改的是**写入的一致性**，不是它的地位。
- [x] 与 ADR-0067 一致：**未回退**命中数修复；处理的是它连带放大的风险（本 ADR 的由来写清了）。
- [x] 与 ADR-0062 一致：同一纪律 —— 结论有量证（读契约核实能力存在）、修复精确到根因层、加回归锁。
- [x] **未自造机制**：用的是宿主已有的 `FsWriteIntent` / `FsInfo.version` / `FS_STALE_VERSION`。
- [x] **未假装**：无 `stat` 时明确降级并有测试锁住；未在真机触发冲突这件事如实标注为未验证。
- [x] 测试 mock **忠实契约**（含版本校验），不重复 v1.15.15 的「不忠实 mock」教训。
- [x] `npx tsc --noEmit` clean；`npm run build` clean；全套回归 **34/34**。
- [ ] **未验证**：真机 `host.fs` 的 `stat` / `replaceIfVersion` 端到端；真并发时序；重试耗尽的极端用例。
- [ ] **未做**：进程内互斥（判断为不必要 —— 版本守卫覆盖面更广）。
