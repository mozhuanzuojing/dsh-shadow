# ADR-0011: 测试策略（oracle / parity / failure / perf）

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0003、ADR-0004、ADR-0007
- 定位：重写期间怎么证明没退化。

## Context

v1 的 13.2k 行测试里约 1,000 条 assert 依赖输出措辞；唯一评测不 import 生产检索；写侧 P0 无测试。

## Decision

- **oracle**：v1 冻结在 `fixtures/oracle-v1`（52 个合成语料文件 + 20 查询 × 10 mode = 200 输出）；可重放。
- **parity**：v2 在同一语料上跑 topic 查询，比较 atom rel 集合；阈值 0.85，已知偏差登记在 PARITY。
- **failure injection**：写失败保留 pending、同秒两会话不覆盖、读失败显式、部分读失败可见。
- **e2e**：真实临时目录 + fake Cordis ctx 跑 apply→采集→flush→read→SQLite。
- **perf**（Phase 2 后补）：1k/8k 合成语料，flush ≤12 FS ops、8k topic ≤300ms。
- 断言优先结构化字段/计数；措辞只锁 hard 契约（前缀、四要素、无匹配下一步）。

## Consequences

- 重构有可重放基线；已知偏差必须显式写。
- 不再用「全绿」掩盖没有判别对象的门。

## Non-goals

不追求 100% 行覆盖；不为每个 mode 做逐字快照。
