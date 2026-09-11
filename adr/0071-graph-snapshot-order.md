# ADR-0071: 图快照读取取到的是**最旧**的 —— 并把两份近重复的读取逻辑收敛成一处

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：**ADR-0070**（漂移审计工具 —— 本 ADR 是它的检测 B **第二次**产出真发现）、ADR-0062（接线审计工具）、**ADR-0003**（派生物可重建）、**ADR-0017**（TemporalGraph 可重建）、**ADR-0024**（RepresentationGraph 可重建）、ADR-0069（同类：投影与源头脱钩）
- 关联待办：`../BACKLOG.md` 的 **T4**（本 ADR 给其中 2 个符号落了处置）、**T5**
- 版本：`1.15.28`

## Context

上一版造的 `tools/audit-drift.ts`，其检测 B 报出 `name=graph.json` 出现在两个生产模块
（`temporal/persistence.ts` + `world/persistence/persist.ts`）。顺着这条线索查下去，
发现两件事叠在一起 —— **一个是 T4 已记的（write-only），一个是新的（顺序错）**。

### 事实链（全部已核实）

1. **两个 reader 逐字近重复**：`readTemporalGraph` 与 `readGraph` 除了根目录（`temporal` / `world`）
   与返回类型外，**逻辑完全相同**（连 try/catch 与注释位置都一样）。
2. **两者都 write-only**（T4 已记）：生产者存在，**读者零调用**。
   - 生产者：`writeTemporalGraph` ← `query/observer-kernel.ts:46`；`writeGraph` ← `query/world.ts:40`
   - 读者：`readTemporalGraph` / `readGraph` —— 生产与测试引用**皆为零**
3. **真实读路径是「重建」而不是「回读」**：`mode:"temporal"` 走
   `buildTemporalGraph(fs, ws, …)`（读 observation traces 重建）**之后**才
   `writeTemporalGraph` 落一份快照。这与 ADR-0017 checklist ⑥（*`read_shadow({mode:"temporal"})`
   …… 渲染 graph*，由 `buildTemporalGraph` 提供）以及 checklist ①（graph.json 是**可重建**索引）一致。
4. **顺序 bug（新）**：两个 reader 都是「遍历 `listDir` 返回的日期目录，**碰到第一个**含
   `graph.json` 的就 return」。而：
   - `listDir` 契约原文：*"List direct children of a directory in **stable name order**."*
   - 真机实现（已读 `dsh-fs-local` 的 `listDirectory`）：`entries.sort((l, r) => l.name.localeCompare(r.name))` ⇒ **升序**
   - 日期目录名是 `YYYY-MM-DD` ⇒ **字典序 = 时间序**
   ⇒ **「取第一个」= 取最旧的那份快照。**

### 为什么这仍然值得修（即便当前无人调用）

- 它是一枚**地雷**：`read*Graph` 的名字直觉是「拿当前的图」，谁接线就会**静默拿到最旧的**。
- 而 ADR-0017/0024 把 `graph.json` 定义为**可重建的派生快照**（ADR-0003）——
  回读一份**更旧**的派生件，正是本仓这几轮反复修的「**投影与源头脱钩**」那一类
  （ADR-0069 刚修过同一族）。
- 修法极便宜，且顺带**消除近重复**（检测 B 报的那个形态）。

## Decision

### 1. 新增 `persistence/snapshots.ts` 的 `readLatestSnapshot(fs, ws, dirRel, fileName)` —— 顺序纪律**单一来源**

```ts
const dates = entries.filter(isDateDir).map(name).sort((a, b) => b.localeCompare(a)); // **降序**
for (const name of dates) { ... 找到第一个含快照的 ... return JSON.parse(...) }
```

- **降序**：第一个含快照的日期即**最新**（这就是修掉的那个 bug）。
- 跳过缺快照的日期目录（不因中间某天缺失就放弃）。
- 单份快照**解析失败 → 继续找更旧的**（不因一份坏文件就返回 `null`）。
- 一份都没有 / 目录不存在 → **`null`**（不抛、不编造）。

### 2. 两个 reader 收敛为**参数化调用**（消除近重复）

```ts
// temporal/persistence.ts
export const readTemporalGraph = (fs, ws) => readLatestSnapshot<TemporalGraph>(fs, ws, "temporal", "graph.json");
// world/persistence/persist.ts
export const readGraph = (fs, ws) => readLatestSnapshot<RepresentationGraph>(fs, ws, "world", "graph.json");
```

**为什么收敛而不是「两处各修一遍」**：本仓这几轮的教训正是「同一逻辑在多处表达，其中一处会漂移」
（ADR-0063 三份判据、ADR-0070 的双条件漏在第三个消费者）。两处各修一遍会**保留那个结构**，
下次仍可能只修一处。这是检测 B 报出该形态之后的**结构性回应**，不是顺手重构。

### 3. 先复现，再修

`test/graph-snapshot-order.test.ts`（6 组），**修复前先跑**：

```
AssertionError: 应返回**最新**（2026-09-09 / day09）；
  实际返回了 day07 —— 升序列表取第一个 = 最旧
```

修复后 6/6：① temporal 取最新 ② world 取最新 ③ **乱序插入**仍取最新（只看名字序，不依赖插入序）
④ 中间某天缺图仍能取到最新那个有图的 ⑤ **反向不变量**：无任何快照 → `null`（不抛、不编造）
⑥ 往返：写入的快照可读回。

### 4. **闭环验证**：工具报的漂移在修完后**真的消失**

修完重跑 `npm run audit:drift`：

| 读数 | 修复前 | 修复后 |
|---|---|---|
| 检测 B | **12 个键 / 30 处** | **11 个键 / 28 处** |
| `name=graph.json` | 在列（2 个文件） | **已消失** |

⇒ 「检测 → 修复 → 检测确认消失」的**闭环成立**。这也同时证明该键**确实是真漂移**（而非正当的分层表达）。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 只修 `temporal/persistence.ts` 的降序，world 侧照抄一遍 | **保留**「同一逻辑两处表达」的结构 —— 本仓已数轮因此吃亏。收敛成一处才是根因层 |
| 直接删掉两个 reader（它们零调用） | 它们是**持久化层的公开读 API**（生产虽未接线，但写侧已在用同一目录约定）。删除会丢掉「已落盘的快照怎么读回」这一能力；且 T4 要的是「接线/删除/保留并注明理由」——本 ADR 给的是**保留 + 改正 + 收敛**，理由写在此处 |
| 改成「取最新的**且**校验 `generatedAt` 一致」 | `generatedAt` 是内容里的字段，与目录名可能不一致（`writeGraph` 用 `g.generatedAt`、`writeTemporalGraph` 用 `today()`）——加这层校验会把一个确定性问题变成带猜测的问题。目录名是**写入时决定的**，以它为准即可 |
| 把两个 reader 也接进 `mode:"temporal"`（当缓存用） | **ADR-0069 刚教过**：读回派生快照会引入「缓存与源头脱钩」，而 ADR-0017 ⑥ 明确规定该 mode **由 `buildTemporalGraph` 重建**。接线等于主动引入刚修掉的那类风险。**不接** |
| 顺手处理快照**无限增长**（每天一份、从不清理） | 属另一议题（存储治理），本轮不改；已记在测试末尾的「未验证 / 未做」 |

## Consequences

### 正
- **去掉了地雷**：若将来有人接线，拿到的是**最新**快照而不是最旧的。
- **顺序纪律单一来源**：`listDir` 升序这一事实只在 `snapshots.ts` 里被处理一次；
  两个 reader 不再各自持有这段逻辑。
- **闭环验证成立**：修复后检测 B 的 `name=graph.json` 键消失（12→11 键），
  既证明修得对，也**反过来证明该检测 B 报的是真漂移**。
- 顺带把 ADR-0017 ⑥「该 mode 由重建提供」与 ADR-0003「快照是可重建派生」的关系写清楚了 ——
  避免以后有人把 reader 当缓存接进来。

### 负 / 已知边界
- **修的是「若接线则正确」，不是「修一条在跑的路径」** —— 两个 reader **当前生产零调用**（T4），
  故本次改动的**运行时收益为 0**，收益是「消除地雷 + 消除重复」。这一点必须在报告里说清。
- 真机 `listDir` 的排序按**契约 + 真机实现**认定（已读 `dsh-fs-local`），但**未在真机跑这两个 reader**
  （它们零调用，无法触发）。
- **快照无限增长**未处理：`writeTemporalGraph` 每天一份、从不清理。
- 本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，ADR-0057）。
- T4 的 8 个符号里，本 ADR 只落了 2 个；**其余 6 个仍待逐个定性**。

## 自检

- [x] 与 ADR-0003/0017/0024 一致：快照仍被视为**可重建派生**；本 ADR 让「读回」取最新，方向是**强化**。
- [x] 与 ADR-0070 一致：本 ADR 是它的检测 B **第二次**产出真发现，且用同一工具做了闭环验证。
- [x] 与 ADR-0069 一致：同族（投影与源头脱钩）；并**明确拒绝**把 reader 接成缓存（那会重蹈该 ADR 的坑）。
- [x] **先复现再修**：测试 ① 在修复前跑出 `day07`（最旧）的红，修复后 6/6。
- [x] **反向不变量**：⑤ 锁住「无快照 → null（不抛、不编造）」。
- [x] **未夸大**：明确写出「运行时收益为 0（零调用），收益是消除地雷 + 消除重复」。
- [x] **闭环有据**：检测 B 的键数 12→11、`name=graph.json` 消失，是修复有效性的独立证据。
- [x] `npx tsc --noEmit` clean；`npm run build` clean；全套回归 **37/37**。
- [ ] **未验证**：真机跑这两个 reader（零调用，无法触发）；快照无限增长未处理。
- [ ] **未做**：T4 其余 6 个符号的定性；T5 的 11 个 B 键复核。
