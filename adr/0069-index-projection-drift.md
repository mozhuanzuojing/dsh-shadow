# ADR-0069: `_index.md` 的投影漂移 —— 新鲜度必须问源，不能只问进程

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：**ADR-0003**（Memory 文件是 source of truth，`_index.md` 是可重建投影）、**ADR-0046**（缓存是性能特性不是真相，宁可重建也不返回陈旧投影）、**ADR-0066 / ADR-0067**（同类：判据对但**可见性/触发条件**错）、**ADR-0068**（同一「顺序敏感」教训）
- 关联待办：`../BACKLOG.md`
- 版本：`1.15.26`

## Context

D5（ADR-0066）暴露的漂移形态是「**同一份语料，两条读路径可见性不同**」。本轮按同一视角继续查剩余的读路径，
在 `_index.md`（无 `topic` 的 `read_shadow()` 返回的索引）与主题召回之间找到**同型问题**，且这次有**实测数字**。

**实测（真 `.shadow`，7297 条记忆）**：

| 读数 | 值 |
|---|---|
| `_index.md` 最后写入时间 | **09:34:01** |
| 之后写入的记忆 | `09:34:12` / `09:34:31` / `09:52:07` … |
| 这些记忆在 `_index.md` 里出现的次数 | **0**（磁盘上确实存在） |
| **对索引不可见的记忆** | **623 条（8.54%）** |
| 主题召回是否看得见它们 | **看得见**（走 `listMemories`，每次读盘） |

⇒ **投影与源头脱钩**，且差额随每次会话增长。

**根因**（`core/writer-materialize.ts` 的 `ensureIndex`）：

```ts
if (!core.indexDirty.has(ws) && core.indexCacheWarm.has(ws)) return; // 已最新且已预热 → 跳过重建
```

而 `indexDirty` 是**进程内** `Set`，**只反映本进程自己的写入**（`flush` / `patchSummary` 置位）。
记忆文件是 source of truth —— **别的会话 / 子代理写入的记忆，本进程的 dirty 永远看不到**
⇒ 缓存一旦预热，`_index.md` 就**再也不更新**。

**第二层根因**（`ensureIndexCache`）：它第一行是 `if (core.indexCacheWarm.has(ws)) return;`
—— 「每个 workspace 只做**一次**全量读」。所以即便上层决定重建，**也不会重读新文件**，
只是拿旧缓存重渲染（即使重渲染了也看不到新记忆）。

**第三层（同一函数）**：磁盘上已删除的文件**从不清出缓存** ⇒ 投影里会留**幽灵条目**
（本条的真机读数被 `_index.md` 说明文字污染，见「负 / 已知边界」，故未给数字）。

## Decision

### 1. 新鲜度问**源**：用已存在的 `shadowSourcesFingerprint`，不是进程内标记

`core/projection-store.ts` 里早就有 `shadowSourcesFingerprint`（`listDir` 级成本，返回
`.shadow/<date>/*.md` + `.shadow/resources/*.md` 的 `名字:size:version` 排序串），
它的文档注释写明了纪律：*「缓存是**性能特性不是真相**（ADR-0046），宁可重建也不返回陈旧投影」*。

**但它此前只接给了 `nodes.jsonl`**（v1.15.12 修 `shadow_query` 陈旧投影时接的），
**没接给 `_index.md`** ⇒ 这正是本仓反复出现的形态：机制存在，没接到这一处。

⇒ `ensureIndex` 改为：**进程内无变更时，再问一次源**；
源未变（两侧都可判定且一致）才跳过，否则保守重建。

### 2. `ensureIndexCache` 改为**每次对账**（增量，不是一次性）

```ts
const memories = await listMemories(fs, ws);        // 只 listDir（元数据），不读内容 —— 廉价
for (const mm of memories) {
  if (skipForgotten(mm.rel)) { cache.delete(mm.rel); continue; }
  if (cache.has(mm.rel)) continue;                  // 已在缓存 → 不重复读盘
  const text = await readRel(fs, ws, mm.rel);       // 只为**新**文件读内容
  if (text) cache.set(mm.rel, recOf(mm, text));
}
const onDisk = new Set(memories.map(m => m.rel));   // 源头已消失 → 清出投影
for (const rel of [...cache.keys()]) if (!onDisk.has(rel)) cache.delete(rel);
```

**为什么这样同时保住两个目标**：
- 「投影跟得上源头」：每次都看磁盘。
- 「不每回合全量重读」：`listMemories` **只做 `listDir`**（契约原文：*"Returns resolved child
  targets plus cheap metadata only; **never reads file contents**"*），内容读**只为新文件**发生
  ⇒ 代价与「新增文件数」成正比，**与库大小无关**。

### 3. **先采指纹、后读源** —— 与 ADR-0068 同一顺序教训

`rebuildIndex` 在**读源之前**采指纹，落盘成功后才记下：

```
fpBefore = fingerprint()      // ① 先采
... 扫描 / 对账（读源）...      // ② 后读
write(_index.md); record(fpBefore)
```

- 若扫描期间源又变了：记下的是**更旧**的指纹 ⇒ 下次比对必然不等 ⇒ 保守重建（只是多干一次活）。
- 反过来（读完再采）会把这次变化记成「已见过」⇒ 下次比对相等 ⇒ **永久漏掉那次变化**。

### 4. 真机契约核实（决定性）：指纹在真机**可判定**

我一度把「`listDir` 是否给 `size`/`version`」列为未验证项。本轮**读了真机实现**
（`dsh-fs-local` 的 `listDirectory`）：

```js
result.push({
  name: entry.name, type: childInfo?.type ?? "other",
  target: childTarget,                                          // 必给
  ...childInfo ? { version: childInfo.version } : {},            // 可探到就给
  ...childInfo?.type === "file" ? { size: childInfo.size } : {}  // 文件一定给
});
```

且 `FsDirEntry.target: FsTarget` 在 `dsh-fs@0.1.5-rc.2` 的 `types.d.ts` 里是**必填**
（*"Resolved child target for follow-up operations"*）。
⇒ 指纹**不会恒为 `undefined`**，修复后的「源未变则跳过」在真机**成立**，不会退化成每次重建。

**真语料实测**（`_research/fingerprint-real.ts`，用忠实 shim）：

| 读数 | 值 |
|---|---|
| 可判定（非 undefined） | ✅ |
| 条目数 / 指纹长度 | **7336** / 517 KB |
| 稳定性（同源两次相同） | ✅ |
| 成本 | **62 ms**（只做 `listDir`，不读文件内容） |

### 5. 回归锁

`test/index-freshness.test.ts` —— **关键是绕过本进程 flush 直接往 mock fs 放文件**
（那正是「别的会话写入」的等价物；走 flush 会置 `indexDirty`，就测不到要测的分支）：

| # | 断言 | 结果 |
|---|---|---|
| ① | 首次读索引含已存在记忆，并落盘 | ✅ |
| ② | **别的会话写入的新记忆出现在索引里** | ✅ 核心 |
| ③ | 源头删除 ⇒ 索引不留幽灵条目 | ✅ |
| ④ | **源未变 ⇒ 不重写**（性能特性保住） | ✅ |
| ⑤ | 幂等：无源变化时索引内容稳定 | ✅ |

> **④ 一度失败并暴露了一个真问题**：我的 mock 的 `listDir` 条目漏了 `target`（契约必填）
> ⇒ 指纹恒为 `undefined` ⇒ 每次都走「保守重建」⇒ ④ 永远过不了。
> 修 mock 成**忠实契约**后 ④ 过 —— 这正是本仓「mock 与契约不符时测的是 mock」教训的又一次生效，
> 也是它促成了 §4 的真机核实。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 直接去掉 `indexCacheWarm` 短路（每次都全量重建） | 会**退回** v1.15.x 已修的性能问题（每回合 O(N) 次内容读）。本 ADR 的 §2 增量对账才同时满足两个目标 |
| 用文件 mtime 做新鲜度 | 宿主的 `FsTarget`/`FsInfo` 是 opaque 的（`version` 明确写着 *"consumers MUST NOT interpret this token"*）；而且**本仓已有** `shadowSourcesFingerprint`，重复造机制违背本仓纪律 |
| 只修 `ensureIndex` 的条件、不动 `ensureIndexCache` | 不够 —— 即便决定重建，`ensureIndexCache` 的 `if (warm) return` 也不会重读新文件，**两层都得改** |
| 让 `flush` 写完后主动重算指纹 | 只解决本进程；**跨会话**写入仍看不见。必须**读时问源** |
| 把指纹检查放到主题召回路径也做 | 主题召回走 `listMemories`（已每次读盘）⇒ **本来就是新鲜的**，不需要 |
| 记进 BACKLOG 不修 | 后果是「`read_shadow()` 给出的目录/主题索引**静默不完整**」—— 而那是 agent 用来判断「记忆里有什么」的入口，属于「**不可供执行的真相**」，正是本目标要修的东西 |

## Consequences

### 正
- **投影与源头重新挂钩**：`_index.md` 不再随会话增长而漂移（实测 623 条 / 8.54% → 结构性消除）。
- **幽灵条目被清**：磁盘删除的文件不再留在投影里。
- **两个目标同时成立**：每次读索引多一次 `listDir` 级扫描（真语料 **62 ms / 7336 条目**），
  换来「投影不变陈旧」；内容读仍只为新文件发生。
- **真机可判定性已核实**（读 `dsh-fs-local` 实现 + `dsh-fs` 契约），不再是 mock 推断。
- 顺带把「先采指纹后读源」的**顺序敏感点**与 ADR-0068 归到同一教训族，减少未来重犯。

### 负 / 已知边界
- **每次读索引多一次 `listDir` 扫描**（真语料 62 ms）。相对「静默返回不完整索引」是划算的，
  但确实是新的固定开销。
- **无 `version` 的后端存在降级**：指纹里 `version` 记 `?` 时，**同尺寸的内容修改**不会被捕获
  （ADR-0046 已记录的已知降级）。真机 `dsh-fs-local` 会探 `version`，故该降级在本部署不触发。
- **幽灵条目的真机数字未给**：本轮的探针把 `_index.md` 的**说明文字**（`<时刻>-<入口slug>.md`
  这类占位符）也算成了索引条目 ⇒ 「索引有、磁盘没有」那一桶被污染，**故未报数**。
  修复逻辑（对账删条目）已被测试 ③ 覆盖，但**真机幽灵量级未测**。
- **未压测大库**：7297 条 / 62 ms 是当前规模；10 万级时的对账成本未测。
- 本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，ADR-0057）。

## 自检

- [x] 与 ADR-0003 一致：`_index.md` 仍是可重建投影；本 ADR 让**投影跟得上源头**，强化而非削弱该不变量。
- [x] 与 ADR-0046 一致：直接引用其纪律（「缓存是性能特性不是真相」），修法与 v1.15.12 同型。
- [x] 与 ADR-0066/0067 一致：同属「判据/可见性/触发条件错」族，按同一纪律处置（先量证、再修、加锁）。
- [x] 与 ADR-0068 一致：沿用「**先采版本/指纹、后读源**」的顺序敏感点，并在两边都写明理由。
- [x] **未自造机制**：复用已有的 `shadowSourcesFingerprint`（它本来就是为此写的）。
- [x] **先复现再修**：测试 ④ 的失败暴露了不忠实 mock，修完 mock 才通过；真机可判定性另行读实现核实。
- [x] **未夸大**：幽灵条目数字因探针污染**未报**；大库成本未压测，均如实标注。
- [x] `npx tsc --noEmit` clean；`npm run build` clean；全套回归 **35/35**。
- [ ] **未验证**：真机端到端（需重启宿主）；10 万级规模的对账成本；真机幽灵条目量级。
