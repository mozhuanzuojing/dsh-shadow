# ADR-0025: 投影提为默认——`read_shadow` 无参/主题读以「面」为第一入口，检索点下钻

- 状态：accepted（2026-11-17；依据用户「路 B 激进」持续指令，Phase B 已落地：默认无参/主题读首段给「面」+「下钻：检索点」，`raw:true` 为逃生口）
- 日期：2026-11-17
- 关联：ADR-0024（投影核已进核心）、ADR-0007（信封/预算）、PARITY（默认行为变更需重录）、CONTRACT C1–C7
- 定位：回答「默认读为什么先给面（投影），而不是先给点（检索）」。

## Context

- ADR-0024 已把投影做成 `read_shadow({project:true})`（**opt-in**）；默认（无参 / `topic`）仍返回检索**点列表**。
- 后果：同一工具两条路给不同答案（点 vs 面 + 盲区），agent 得自己选；这与「**Memory 不是中心、Observer 才是中心**」不一致——默认应当是面。
- 约束：改默认行为会动 parity oracle（Q01/Q02 等）与预算；但信封四要素（H2/H3）、C1–C7 不变。

## Decision

- **MUST**：无参 `read_shadow()` **首段给「面」**——对全部活跃 atom 用默认 lens 投影（Episode/Task/Decision/材料 + 盲区），随后**保留**原「索引/近期/主题」段（不删，作为导航与下钻）。
- **MUST**：带 `topic` 的主题读**首段给「匹配的面」**（`lens.what_matters` 以 topic 收窄，盲区披露），随后给「下钻：检索点列表」（保留现有相关度排序）。
- **MUST**：提供显式逃生口 `detail:true` 取「纯检索」旧行为，便于对比与回退。
- **MUST NOT**：改 atom；改 C1–C7；改 H2/H3 信封四要素；不得把「面」冒充「整全」（C7 恒适用）。
- **parity**：默认行为变更 → MUST 重录 oracle 基线，并把差异登记进 `PARITY.md` §4.3 允许偏差。
- **性能**：组装面是确定性派生；MUST 保持在 `max_tokens` 预算内，超限按现有 H3 自报截断。

## Consequences

- 正：默认即投影，与「Observer 是中心」一致；agent 少一次选择（面看全局、点下钻细节）。
- 负：默认输出更长/更贵；parity 需重录；组装面可能盖住「点级相关度」，故必须保留下钻与 `detail:true`。

## Non-goals

- 不删检索；不引向量库；不改原子；本条不做语义 compaction。

## 迁移 / 回退

- 一个版本内 **dual**：默认面 + `detail:true` 旧检索；观察真实使用后再决定是否彻底切换。

## 实施（先方案后码）

- **A**：本条 ADR + parity 差异登记 + oracle 重录方案（不动码）。
- **B**：`engine/read/route.ts` 默认路径接入投影（面首段 + 检索下钻）+ `detail:true` 逃生口 + 测试 + 重录 parity。
- **C**：README / ARCHITECTURE 默认面说明。
