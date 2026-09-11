# ADR-0067: 命中数累积的触发条件错了 —— 74.3% 的记忆永不可能被记命中

- 状态：**已接受（2026-09-11，按用户「按推荐」授权的同类处置落地）**
- 决定日期：2026-09-11
- 关联 ADR：**ADR-0062**（接线审计工具 —— 本 ADR 是它列的缺陷类的**第五个实例**）、ADR-0063 / **ADR-0066**（同类：D5 的认知门判据错）、ADR-0003（`_meta.json` 是 Derived Artifact）、ADR-0031（Forget ≠ Delete）
- 关联待办：`../BACKLOG.md` 的 **D7（本 ADR 新增）**
- 版本：`1.15.24`

## Context

ADR-0066（D5）刚修掉一处「机制对、判据错」的缺陷。本轮用同一视角继续查「**同一策略、只在一处生效**」
这一类，在 `query/query.ts` 找到第五个实例。

**事实链（全部可复现）**：

1. `query/query.ts` 里「给被服务的记忆累加 `hits` / `confirmedBy`」那段，用的是 `servedDetail`。
2. `servedDetail` 的定义（同文件第 370 行）是：
   ```ts
   if (s.tier !== "L0" && render.includes("…")) servedDetail.push(s.mm.rel);
   ```
   即「**渲染里展开了片段**」的那些记忆 —— 它本来是给**冷却台账**用的（第 385–396 行，`detail: true`）。
3. `tierFor`（`retrieval/rank.ts`）对「动作行占比 > 60%」的记忆返回 **L0**。
4. **真语料实测（7185 条）**：`tier` 分布 **L0 5342（74.3%）** / L1 1512（21.0%）/ L2 331（4.6%）
   ⇒ **74.3% 的记忆永不可能命中数 +1**。
5. 即便是 L1/L2，还要该次预算够展开片段（`budgetChars >= out.length + 30`）才进集合。
6. **端到端佐证**：本机 `.shadow/` 有 7185 条记忆、`_index.md` 1.8 MB、多次召回之后，
   **`.shadow/_meta.json` 根本不存在**（`Get-ChildItem -Recurse -Filter _meta.json` 空）。

## Decision

### 1. 累积改为基于 `servedRels`（每条**被返回**的记忆）

```ts
if (servedRels.length) {                 // 原为 servedDetail
  for (const p of servedRels) { ... }    // 原为 servedDetail
}
```

`servedRels` 在同一循环里对**每个真正进入输出的记忆**入栈（`query/query.ts:363`），与「是否展开片段」无关。

### 2. 语义依据：`hits` 的定义是「召回命中数」，不是「展开片段数」

README「记忆遗忘」节原文：召回用 **hotness**（**命中数** × 半衰期衰减）加权。**被返回一条记忆就是一次命中。**
`servedDetail` 的语义（"served as detail"）是**另一件事**，它继续服务冷却台账，两者不该混用。

### 3. 先复现，再修（本仓纪律）

新增 `test/hit-accumulation.test.ts`，**修复前先跑**：

```
✔ ① 前置条件成立：动作行占满 ⇒ tierFor 返回 L0（真语料 74.3% 的记忆是这个形态）
AssertionError: 被返回的记忆必须在 _meta.json 里有记录（hits 是「召回命中数」，与是否展开片段无关）
  actual: undefined, expected: true
```

⇒ **缺陷在 mock 里稳定复现**（不是只靠读码推断）。修复后同一测试 4 组断言全过。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 只把 `tier !== "L0"` 放宽（如改成 L0 也展开片段） | 那是**改渲染预算策略**，会改变每次召回的 token 消耗；本缺陷在**累积条件**，不在渲染。修错了层 |
| 在 `servedDetail` 的定义里加上 L0 | 会让**冷却台账**的「detail」语义被稀释（台账的 detail 指「展开了片段的服务」），是另一处退化 |
| 什么都不做，记进 BACKLOG | 后果是**所有以 hit 为基础的能力全部失效**：hotness 恒为 0、lifecycle 的 `OBSERVED`/`VERIFIED`/`TRUSTED` 三态不可达、`forget` 的 `minHits` 保护从不生效。这不是「未接线的优化」（对比 D1 的 `ChangeSet`），而是**功能静默失效**，属 v1.15.13/15/18 与 D5 的同类，故按同口径修 |
| 两个集合都累积（servedRels 且 servedDetail） | `servedDetail ⊆ servedRels`（都受同一 `!forceL0` 前提约束），并集就是 `servedRels`，多写无意义 |
| 顺手让 `shadow_query` / `recall_shadow` 也累积 hits | **不顺手做**：那是「哪些读入口算命中」的**范围决策**，涉及 `hits` 语义扩大 ⇒ 升为 **D7** |

## Consequences

### 正
- **`hits` 首次真正开始累积**：74.3% 此前永不记命中的记忆现在会记。
- 连带恢复三条**此前实际不可达**的生命周期状态：`OBSERVED`（hits>0）、`VERIFIED`（confirmedBy≥1）、
  `TRUSTED`（confirmedBy≥2）—— 这三条在 `lifecycle-superseded.test.ts` 里有单元测试，
  但**生产里从未触发过**（因为 `_meta.json` 不存在）。这是「单元测试绿、功能仍失效」的又一实例。
- `forget` 的 `minHits` 保护（默认 1）首次真正生效：被返回过的记忆不再被判「低价值」。
  这修正了一处**语义倒挂**：此前「被召回命中的记忆」与「从未被召回的记忆」在 forget 眼里**没有区别**。
- `_meta.json` 现在会真的被创建（此前从未存在），retention / hotness 从「纸面功能」变成可用。

### 负 / 已知边界
- **这是行为变更**：① `_meta.json` 会被创建（Derived Artifact，ADR-0003 允许）；
  ② `forget.enabled` 时被召回过的记忆会受 `minHits` 保护而**不再被 GC** —— 即 forget 的有效删除量会下降。
  这是**符合文档意图**的方向，但属行为变化，在此显式记录。
- 引入一次**额外的 `_meta.json` 写入**（每次有命中的主题召回一次 `readMeta` + `writeMeta`）。
  与原来相比写入**更频繁**（原来几乎不写）。代价：一次小文件读写/召回。
- **只在主题召回路径累积**（`query/query.ts`）。`shadow_query`、`recall_shadow`（mode:"recovery"）、
  `mode:"episode"` 等入口**仍不累积** —— 是否该累积是范围决策，见 **D7**。
- 修的是**触发条件**，不保证 `hits` 语义在其它入口一致；`_meta.json` 的增长未加上限（现状无上限）。

## 自检

- [x] **先复现再修**：测试在修复前跑出 `actual: undefined` 的红，修复后转绿。
- [x] 与 ADR-0003 一致：`_meta.json` 仍是 Derived Artifact，修的是它的**累积触发条件**。
- [x] 与 ADR-0031 一致：Forget ≠ Delete，未改删除语义，只让 `minHits` 保护真正生效。
- [x] 与 ADR-0062/0063/0066 一致：本 ADR 是同一缺陷类的**第五个实例**，按同一口径处置（先量证、再修、加锁）。
- [x] **未顺手扩大范围**：其它读入口是否算命中 ⇒ 立 **D7**，不擅自改。
- [x] 反向不变量已锁：**未返回**的记忆不得被记 hits（不是「凡候选即命中」）。
- [x] `npx tsc --noEmit` clean；全套回归 **33/33**（32 + 新增 1）。
- [ ] **未验证**：本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，见 ADR-0057），
      真机上 `.shadow/_meta.json` 是否如期出现须**再重启一次**后复核。
- [ ] **未做**：`_meta.json` 的增长上限；`hits` 在其它读入口的一致性（D7）。
