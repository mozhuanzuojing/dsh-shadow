# ADR-0095: 派生索引层 —— `.shadow` 是权威，SQLite 只做「索引 + 状态」（分三期；本 ADR 只冻结边界）

- 状态：**已接受（方向）· 一期未实现**（2026-09-16，用户裁决；本 ADR 只冻结边界与分期，**不写实现**）
- 决定日期：2026-09-16
- 关联 ADR：**ADR-0001**（投影文件树而非向量库 —— 其 Notes 已留口「若日后召回不足，可在 `_index.md` 之上叠一层向量检索作为增强，而不推倒文件树」）· **ADR-0060**（多粒度检索的**形式** = 单索引 + 层级 + 路由；其「产品方向」部分**由本 ADR 承接**）· **ADR-0003**（派生件不是 source）· **ADR-0043**（Shadow Contract）· **ADR-0049 / 0085**（缺件不静默 / 降级台账）· **ADR-0051**（资源卡：源层与派生分离的同款手法）· **ADR-0042**（知识图边界：本 ADR 只做「可查询的关系表」，不碰认知层）
- 关联术语：`../CONTEXT.md`
- 版本：待实现

## Context

### 1. 用户 2026-09-16 的定调（原话）

> **Markdown / `.shadow` 继续做 Source of Truth，SQLite 做 Index + State + Retrieval Cache。**
> 「要参考 OpenClaw 的思路；**但不是把 dsh-shadow 改成「SQLite 记忆库」**。」
> 「这点我甚至认为应该写进 ADR：**SQLite MUST NOT become the authority for memory content.**」

### 2. 现状痛点（用户指出）

读侧每次 `read_shadow` 都要「扫目录 → 解析 → 筛选 → 打分」。当 `.shadow` 从几百条涨到 1 万 / 5 万 / 10 万条时，文件系统**仍可作真相源，但不该继续承担查询引擎的职责**。

### 3. 这次是**载体**问题，不是**形式**问题

- **形式**已由 **ADR-0060** 定死（单索引 + 层级 + 路由；不做无阈值全量扇出），其状态是「已接受（技术判据）· **待用户裁决（产品方向）**」⇒ **本 ADR 承接那个悬置的裁决**。
- **ADR-0001 的 Notes 早就留了口**：「叠一层增强，而不推倒文件树」。本 ADR **不推倒** ADR-0001 —— 它只是把那句「叠一层」的**载体**写明。

### 4. 本仓**早就有派生层**（所以这不是新范式，是换载体 + 把判据收一处）

| 现有派生件 | 权威是 | 失效 / 重建 |
|---|---|---|
| `_index.md` | 记忆文件 | 写侧重建 |
| `_meta.json` | 记忆文件 | 带版本守卫（`persistence/meta.ts` 的 `readMetaVersioned` / `mutateMeta`） |
| `shadow-index/nodes.jsonl`（`projectionStore`，**默认关**） | 记忆文件 | 源指纹不一致即重建（`core/projection-store.ts`） |
| `.shadow/resources/*.md` → `resource` 节点 | **卡片文件本身** | 删掉重派生（ADR-0051） |

⇒ ADR-0003 早就写了「派生件不是 source」。本 ADR 要做的只是**换一个更强壮的载体**，并**不许再造第二份失效判据**。

### 5. 外部样本（一手核实）

**OpenClaw**（本地克隆 `vendor/_src/openclaw`，HEAD `c1c870a`，depth=1）：

| 它的做法 | 原文证据 |
|---|---|
| 文件 + 一个 SQLite 索引 | `docs/concepts/memory-architecture.md:11`「a set of plain files and one SQLite index」 |
| 每个记忆面都可读可编辑（它当卖点写） | `memory-architecture.md:27-29`（规则①「**No hidden state.**」）「Every memory surface is inspectable and editable with a text editor.」 |
| **权威仍在文件** | `docs/concepts/memory-builtin.md:212-215`「Canonical memory remains in `MEMORY.md`, `USER.md`, `memory/*.md`… **only derived state is rebuilt**」 |
| 索引可重建 / 坏了怎么办 | `memory-builtin.md:249`「Stale results? Run `openclaw memory index --force` to rebuild.」；`:259`「### Safe index recovery」 |
| 文件变化即重索引 | `memory-builtin.md:138`「changes to memory files trigger a debounced reindex」（默认 1.5s） |
| 切块入库（400 token / 80 overlap → per-agent SQLite） | `memory-builtin.md:117-119` |
| 检索 = FTS5 + 向量 + 混合 | `memory-builtin.md:17-19` |
| 向量加速**可选**、不可用即回退（用户点名称赞的「增强可选、核心可运行」） | `memory-builtin.md:24`（sqlite-vec **optional**）；`docs/reference/memory-config.md:604`（`store.vector.enabled` 默认 `true`）、`:609`「When sqlite-vec is unavailable, OpenClaw falls back to in-process cosine similarity automatically.」 |
| 清缓存只清「记忆自己的派生表」，不碰会话 / 转录 / 源文件 | `memory-builtin.md:285-288` |
| 它的派生纪律：由 owner 派生 + 显式失效生命周期 | 它的 `AGENTS.md:12`「caches and projections derive from the owner with an explicit invalidation lifecycle」 |

**Codex**（**二手 · 待复核**：取自主分支 raw，非固定 SHA）：`codex-rs/thread-store/src/local/mod.rs:123-129` —— SQLite 是**可查询的元数据索引**，而 **JSONL rollout 才是 durable replay format**。
⇒ ⚠ **这条把原引文的因果反过来了**：不是「SQLite 管状态、日志文件只是附属」，而是「**文本才是权威 / 可重放**，SQLite 是派生索引」——**与本 ADR 的方向一致，且比原引文更强**。

### 6. ⚠ 引用更正（据实记录，防止后来者照错的源）

用户给的 5 条外链**全部真实可达**（未见编造），但有 3 处需更正：

1. **「SQLite index 可以重建」的出处错**：`memory-architecture.md` **全文没有** rebuild / reindex 的说法；原话在 `memory-builtin.md:141 / :249 / :259`。
2. **Codex 那条因果反了**（见 §5）。
3. **trigram 不是默认**：`store.fts.tokenizer` 默认 `unicode61`（`docs/reference/memory-config.md:620-624`），trigram 是可选配置 ⇒ 不能写成「它默认支持 CJK 全文检索」。

## Decision

1. **两层分离（一句话）**：`.shadow/` 下的**文件** = 权威（source of truth）；`.shadow/index.sqlite` = **派生**（可删、可重建），只承载三类：**检索索引 / 元数据 / 运行状态**。
2. **SQLite 永不成为记忆内容的权威**（用户明说要写进 ADR）：删掉 `index.sqlite` 后必须**仅凭文件**重建出等价索引；重建后允许**顺序与浮点**差异，**不允许语义差异**。
3. **模型不得直接写 SQL**：写入口仍是 `WriterCore` / Shadow API（`writeMemory` / `promote` / `supersede` / `verify` …）；索引由**索引器**从文件派生。理由：证据门、provenance、authority、「记忆不是指令」这些护栏全挂在写入口上 —— 绕过它 = 绕过护栏。
4. **分三期；一期只做等价替换，不做能力升级**：
   - **一期**：Node **内置** `node:sqlite` 承载 **元数据 + 关系 + 证据链 + FTS5**。目标：把「扫目录」换成「查索引」，**读侧输出逐字不变**。
   - **二期**：向量增强（embedding + vec 扩展）。**触发条件 = ADR-0060 的判据**（召回不足 **且** 有实测样本）；不满足就不做。
   - **三期**：状态层（session / turn / task / pending / flush / indexing / verification / retrieval cache）迁入；一期只放**幂等、可重建**的状态。
5. **一期载体已实测**（2026-09-16，本机 Node **v26.8.2**）：`node:sqlite` **可用** —— 建表 / JSON 往返 / FTS5 建表与 MATCH 命中 / 事务与 ROLLBACK 原子性 全通过；**`sqlite-vec` 不在内置模块里**（`no such module: vec0`）。
   ⇒ 一期**零新增运行时依赖、零常驻服务**（与 ADR-0001 相容）；二期的 vec 扩展是**另一个决策**，不能顺带做掉。
   ⇒ 探针 `../.docs/fix/2026-09-16/probe-node-sqlite.ts`（产物 `node-sqlite.txt`，可重放）。**未核实**：CJK 分词质量（只测了 2 字 MATCH 命中）、大语料下的重建耗时与查询延迟。
6. **失败必须降级且可见**：SQLite 不可用（模块缺失 / 库损坏 / 锁）时，读侧**回落到现有文件系统路径**并**留降级留痕**（ADR-0049 / 0085）。**不许静默变慢，也不许静默返回空**。
7. **权威口径不变**：索引是**加速**，不是**判据**；任何「查不到」的结论仍必须以**文件**为准。

## Consequences

- **正面**：读侧从「扫全部记忆」变成索引查询；元数据 / 关系 / 证据链从「每次解析 frontmatter」变成列。`.shadow` 继续可读、可编辑、可 diff（本仓卖点，与 OpenClaw `memory-architecture.md:27` 同一取向）。
- **代价**：多一个**派生件的失效判据**要守（倾向复用 `core/projection-store.ts` 的源指纹，别再造一份）；多一种**跨平台风险**（SQLite 锁 / WAL 在 Windows 与 WSL 两侧的行为差异）；`index.sqlite` 必须进 `.gitignore`（**派生件不入版本控制**）。
- **必须守住的边界**：`index.sqlite` **不得**成为任何「唯一一份」数据的居所 —— 一旦某条信息只存在于索引里，重建就会丢它。
- ⚠ **一期开工前必须先回答三个问题**（本 ADR 只冻结边界；**这三点不答就不动工**）：
  1. **等价性怎么证**：拿什么当「改前 vs 改后」的对照？（建议：既有测试套 + 一个「同 query 两路取结果逐字段比对」的探针，且**必须先证明该探针能测出差异** —— 本仓 ADR-0085 §7 的教训：断言通过只证明「我没测到」）
  2. **失效判据**：复用 `projection-store` 的源指纹，还是另立？（按 ADR-0085「判据收一处」**倾向复用**）
  3. **谁建索引**：写侧（`WriterCore` 落盘后同步更新）还是读侧（首次读到即建）？两者对既有约束「**读路径也会写盘**」的影响必须先想清楚。
- **本 ADR 不解决的那个真问题**：**「记忆爆炸」**（每回合都落 `.md`）**不是载体问题** —— 换 SQLite 不会让噪声变少。用户提的「Memory Value Gate（噪声 / episode / durable / decision 分流）」属**写侧策略**，应另立 ADR。

## 与用户提案的两处对照（**必须写清，否则后来者会以为漏了**）

### 一、目录结构：采纳**语义**，本期**不改目录**

用户的示意图把 `.shadow/` 画成 `memories/` · `evidence/` · `soul/` + `index.sqlite`。本 ADR **采纳它表达的语义**（人读层与机器层分开、索引单独一个文件），但**不承诺改目录结构**：

- 现状是 **`.shadow/<日期>/*.md`**（ADR-0001 定的「投影文件树」），`_index.md` / `_meta.json` 与它绑定，`.shadow/resources/` 是 ADR-0051 后加的；
- **改目录 = 全量迁移 + 所有引用路径的代码与测试同时改**，还牵动既有几千条记忆的落点与 `_index.md` 的生成逻辑 ⇒ 属**独立决策**，不该混在「加一个派生索引」里做掉；
- 前置条件（**三条都不具备就不动**）：① 迁移脚本 + **双读兼容期**（新旧路径都能读）；② 回滚方案；③ 与 ADR-0001 的命名口径重新对齐（「投影文件树」这个说法要不要跟着改）。
- 若确认要做，**另立 ADR**。

### 二、表结构：**逐列分类**，因为「派生」二字对每列的含义不同

用户给的 `memory` / `memory_fts` / `memory_embedding` / `evidence_ref` 结构可用，但**每一列必须先回答「能不能从文件重建」**：

| 列（用户给的） | 类别 | 处理 |
|---|---|---|
| `id` · `path` · `type` · `scope` · `created_at` · `provenance` · `status` · `supersedes` · `content_hash` · `evidence_ref.*` | **可由文件确定性派生** | 一期就放进来；`rm index.sqlite` 后重建必须**逐字段等价**（顺序允许不同） |
| `observed_at` · `valid_from` / `valid_until` | 视来源而定 | 文件里写了的 ⇒ 派生；**没写就不许由索引推断**（本仓「不猜字段」） |
| `memory_fts.content` | 派生（正文的切块/副本） | 允许进索引；**正文的权威仍是 `.md`** |
| `memory_embedding.vector` | **派生但不可重建**（要重新调用 embedding 才有） | 二期；且必须接受「重建 = 重算」的代价与外部调用 |
| `importance` · `hits` · `last_retrieved` · `retrieval_count` | **不由文件派生**（运行状态） | **三期**；⚠ 见下 |

⚠ **三期的真正难点（本 ADR 必须先说破）**：这类「运行状态」**今天本身就住在文件里** —— `_meta.json`（`hits`）、`_recall_log.json`（冷却台账）、`query-log/*.jsonl`（观测）。把它们搬进 SQLite，是**一次真实的权威转移**（从「文件是权威」变成「SQLite 是权威」），而不是「多一个缓存」。
⇒ 三期动工前必须先回答：**这些状态丢了会怎样？**（`hits` 丢了只影响冷热排序？`_recall_log.json` 丢了只影响冷却？）**答案必须是「可接受丢」或「另有一份文件权威」二者之一**，否则三期会悄悄破坏本 ADR 的第 2 条决定。

## 明确不做（本期）

- **不引常驻服务**（ADR-0001 仍有效）。
- **不把记忆正文搬进 SQLite**：人类可读的认知资产继续留在 `.md`（用户原话）。
- **一期不上向量**；`sqlite-vec` 实测不在内置模块里（Decision 5）。
- **不因为「有 SQLite 了」就放宽 ADR-0042 / 0043 / 0051 的证据门**。
- **不做认知层 / 知识图**（ADR-0042 的边界，仍「提议 · 暂不实现」）。

## 重新评估条件

- **一期**：若「读侧输出逐字不变 + 重建等价」做不到（例如排序 / 截断上有不可消除的差异），则退回文件系统路径，并在本 ADR 记「试过、失败原因 X」。
- **二期（向量）**：仅当 ADR-0060 的判据满足（有实测样本证明召回不足）**且** 载体与许可单独裁决通过。
- **三期（状态）**：仅当一期稳定运行且**重建等价性**已有回归锁。

## Notes

- 本 ADR **只冻结边界与分期**，不含实现；实现待办见 `BACKLOG.md` 的 **T17**（含五个完成判据）。
- 与 **ADR-0060** 的关系：0060 已把**形式**定死，本 ADR **不改**那部分，只承接它悬置的**产品方向**（已在 `adr/0060` 头部加补记指向本文件）。
- 证据与可重放：`../.docs/fix/2026-09-16/INDEX.md`（含 OpenClaw 核实的 3 份专家报告 + 2 个探针产物）。
- **引用纪律**：本 ADR 里 OpenClaw 的行号都是 **HEAD `c1c870a` 的 depth=1 快照**；上游若改动，按本仓「历史文档 vs 当前态文档」只修**当前态文档**，不动归档层。
