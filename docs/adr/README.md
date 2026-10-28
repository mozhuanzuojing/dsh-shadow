# dsh-shadow v2 · ADR 索引

> 当前态决策记录（12 条）。v1 的 124 条 ADR 冻结在 [`../v1/adr/`](../v1/adr/)，不改正文。

| ID | 标题 | 状态 |
|---|---|---|
| [0001](./0001-v2-scope-and-compat.md) | v2 范围与兼容边界 | accepted |
| [0002](./0002-atoms-source-single-derived-index.md) | atoms 唯一权威 + 单一派生索引 | accepted |
| [0003](./0003-transactional-flush-and-atom-identity.md) | 事务化 flush 与原子身份 | accepted |
| [0004](./0004-outcome-reads-and-visible-degradation.md) | Outcome 读模型与可见降级 | accepted |
| [0005](./0005-core-lab-boundary.md) | core / lab 边界与 shadow_lab | accepted |
| [0006](./0006-mode-registry-and-schema-generation.md) | mode registry 与 schema 生成 | accepted |
| [0007](./0007-budget-and-envelope.md) | 预算/信封不变量 | accepted |
| [0008](./0008-capture-quality-and-decisions.md) | 采集质量与决策抽取 | accepted |
| [0009](./0009-data-migration-and-legacy-stores.md) | 数据迁移与旧存储 | accepted |
| [0010](./0010-docs-and-governance-reset.md) | 文档/治理重置与 verify 分层 | accepted |
| [0011](./0011-test-strategy.md) | 测试策略（oracle/parity/failure/perf） | accepted |
| [0012](./0012-release-and-versioning.md) | 发版与版本策略 | accepted |

## 状态枚举

`accepted` · `superseded` · `historical` · `proposal` · `frozen`

新增决策：复制 `0000-template.md` 的六行头，编号递增；不改已接受 ADR 的正文，只用新 ADR supersede。
