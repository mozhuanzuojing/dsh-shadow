# ADR-0061: 确定性取代的读时裁决接进生命周期（修一处自相矛盾的标签）

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0043（Shadow Contract：Evidence / Mutation）、ADR-0059（引用漂移检测；本 ADR 是其「纠正」侧的补全）、ADR-0060（多粒度检索层形态）
- 关联术语：`../CONTEXT.md`（生命周期 / 裁决 verdict / 取代 superseded）
- 版本：`1.15.18`

## Context

用户目标之一是「**可供 agent 执行的真相**与**纠正漂移**」。ADR-0059 的文献裁决给出关键分野：

| 方向 | 证据 |
|---|---|
| ✅ **确定性取代规则 + 双时间账本** | Temporal Validity（[2606.26511](https://arxiv.org/abs/2606.26511)）：余弦相似度分辨「被推翻的旧事实」与「换个说法」的 **AUROC 仅 0.59（近随机）** → **解法是不靠相似度、用确定性键做取代** |
| ❌ LLM 判断哪条过期 / LLM 自动纠正 | 同上；误纠正率主导 **53–94%** |

本仓**已经有**这个确定性机制：`observer/arbitrate.ts` 的
`newestByEntryOf(list)` + `verdictOf(...)` —— 按**同 `entry` 是否存在更新的记忆**判定 `superseded`，
**无 LLM、无相似度阈值**。且它**是活的**：`query/query.ts:301` 对取代的旧记忆 `score × 0.7` 降权，
并输出 `裁决 superseded`、`结果 superseded`、`反思 后续已迭代`、`修正链`、`lesson`。

### 发现的问题（实测）

同一批代码里还有**三条依赖 `meta.status === "superseded"` 的分支**：
`core/lifecycle.ts` 的 `SUPERSEDED`、`core/forget.ts:18` 的 superseded 遗忘臂、
`retrieval/rank.ts:103` 的 `superseded: 0.15` 权重。

**但生产代码从不写这个值。** 已严格核实（两轮 grep）：

| 写入 `meta.status` 的位置 | 值 |
|---|---|
| `core/memory.ts:74` | `"active"` |
| `query/query.ts:394` | `"active"`（默认） |
| `core/writer-materialize.ts:88` | `"compacted"` |
| **`"superseded"`** | **无生产写入者** —— 唯一来源是 `test/recall-attribution.test.ts:1319` 的**测试夹具手工塞入** |

⇒ 那三条分支在生产中**不可达**（与 ADR-0057 记录的 P0 同类：**机制存在、接线断了**）。

**后果（修前实测，非推断）**：同一条记忆的展示自相矛盾 ——

```
（来源 动作 · 2026-09-05 · 生命周期 NEW · 状态 active · 裁决 superseded · 结果 superseded ·
  反思 后续已迭代（存在同入口更新记忆）…）
```

`生命周期 NEW`（"全新的"）与 `裁决 superseded`（"已被更新版取代"）**互相打架**。

### 根因（顺序，不是缺代码）

`query/query.ts` 里两处相距 6 行：

```ts
293:  ev.lifecycle = lifecycleOf(meta[mm.rel], ageDaysOf(mm.rel), conflict.missing.length, stale);  // 每记忆循环
...
297:  const newest = newestByEntryOf(entryList);        // ← 跨记忆视图
298:  for (const s of scored) {
299:    const v = verdictOf(s.evidence.conflict || 0, s.entry, s.mm.date, s.mm.time, newest);
```

`superseded` 依赖 `newestByEntryOf(entryList)` 这个**跨记忆**视图，只能在**第二个循环**里算；
而 `lifecycle` 在**第一个循环**里就算好了，**之后从不回填**。

## Decision

### 1. `lifecycleOf` 接受**读时裁决**（新增可选参数），由调用方回填

```ts
lifecycleOf(rec, ageDays, conflictCount, stale, superseded?: boolean)
```

- 缺省不传 → **行为完全不变**（向后兼容）。
- `rec.status` 那条**保留**：兼容外部显式标记。

### 2. 优先级：**外部权威状态不被派生判断覆盖**

```
pinned(TRUSTED) > archived(ARCHIVED) > superseded(SUPERSEDED) > STALE > DECAYING > …
```

`pinned` 是人工显式信任、`archived` 是人工归档 —— 属 **External Authority**（inv 178）；
取代是**派生**的读时判断，不该盖掉它们。`superseded` 则优先于 `STALE`/`DECAYING`
（它是最强的「已有更新版本」信号）。

### 3. **不持久化**取代状态

取代是「**相对当前可见记忆集**」的判断：可见集变了（记忆被遗忘/归档/新增），结论就变。
写进 `_meta.json`（派生文件）会随可见集变化而**失效** —— 这正是原本那条分支从未被写入的合理原因。
⇒ 正确做法是**读时回填**，而不是补一个写入者。

### 4. 有意**不接线**的两条，并说明理由

| 位置 | 处置 | 理由 |
|---|---|---|
| `forget.ts:18` 的 superseded 遗忘臂 | **保留，不接线** | 遗忘是「热度/年龄」维度的 GC；取代是「同入口是否有更新」的**结构**判断。用瞬时裁决去决定永久移出活跃集，会随可见集抖动而误删；且 `Forget ≠ Delete` 已保证可追溯 |
| `rank.ts:103` 的 `superseded: 0.15` | **保留，不接线** | 读时降权**已由** `query.ts:301` 的 `×0.7` 承担；再接一条会**重复降权**。该键保留给**外部显式标记** `status` 用 |

两条都保留（外部显式标记仍可用），但**在代码与 ADR 里写明「生产中不可达」**，不留「看起来在工作」的假象。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 补一个写入者，把 `meta.status = "superseded"` 落盘 | 取代**相对可见集**判断；落盘会随可见集变化失效（见 §3） |
| 在 `forget` 里顺带算一次取代 | GC 跑在 meta 上、面向**全量**记忆，没有 `entryList` 视图；且会把结构判断混进热度 GC |
| 在 `rank.ts` 的 status 映射里也接取代 | 与 `query.ts:301` 的 `×0.7` **重复降权**，打分会失真 |
| 只改展示文案（不加参数，直接在 render 里替换） | 治标：生命周期值本身仍错，`mode:"context"`/episode 等其它消费者拿到的还是错值 |
| 删掉那两条不可达分支 | 外部显式标记是合法入口；删了会丢能力。故**保留 + 写明** |

## Consequences

### 正
- **消掉一处自相矛盾的输出**：`生命周期 NEW · 裁决 superseded` → `生命周期 SUPERSEDED · 裁决 superseded`。
- 「纠正漂移」在**唯一有硬证据的形态**（确定性取代）上**闭环**：判定 → 降权 → 报告 → **生命周期一致**。
- 摸清了「取代」三条 meta 分支为何不可达，并**写成结论**（避免以后有人当 bug 反复查）。
- 优先级显式化：外部权威（pinned/archived）不被派生判断覆盖 —— 与 inv 178 同向。

### 负 / 已知边界
- `forget.ts` / `rank.ts` 两条分支**仍是死臂**（有意）；本轮只让「生命周期」这一条消费者接上。
- 取代判定仍是**单键（同 `entry`）+ 时间序**的粗粒度规则：`entry` 不同的跨主题取代**测不到**
  （文献里的 `(subject, relation, object)` 三元组取代是更细的形态，本仓未做 —— 属后续）。
- 该修复在真机需**重启 DSH** 才生效（本插件 `dist/` 改动不热加载，见 ADR-0057）。

## 自检

- [x] 与 ADR-0043 一致：**未新增任何 LLM 造事实/关系路径**；取代全部由确定性规则派生。
- [x] 与 ADR-0059 一致：采用其裁决支持的「确定性取代」，**未**引入被证据反对的 LLM 纠正。
- [x] 与 inv 178 一致：外部权威状态（pinned/archived）优先于派生判断。
- [x] **修前/修后实测对照**齐备（同场景两次运行，标签由 `NEW` → `SUPERSEDED`）。
- [x] 新增 `test/lifecycle-superseded.test.ts`（4 组），并在场景 36 加**集成回归断言**（修前该断言红）。
- [x] 全套回归 **31 个测试文件全过**；既有分支行为未变（④ 组专门验）。
- [ ] **未验证**：真机端到端（需重启 DSH）。
- [ ] **未做**：`(subject, relation, object)` 级细粒度取代（本仓是 `entry` 单键）。
