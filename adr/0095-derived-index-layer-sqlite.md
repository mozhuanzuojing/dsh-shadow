# ADR-0095: 派生索引层 —— `.shadow` 是权威，SQLite 只做「索引 + 状态」（分三期；本 ADR 只冻结边界）

> ## ⛔ 第一原则（2026-09-16 用户定调，**放在最顶部**）
>
> **`index acceleration MUST NEVER become a new source of truth or a new data-loss path.`**
>
> 由来：就在本 ADR 定稿的同一天，仓里查出一处**数据丢失级**缺陷（`v1.15.95`）——
> `persistence/meta.ts` 把**读失败**当成**文件不存在** ⇒ `corrupt` 恒 false ⇒「坏件不写回」的闸门失效 ⇒
> 空快照整体写回 ⇒ **全工作区 `pinned` / `hits` 清零且报成功**。**加速层若重犯这一类，后果比慢得多严重。**
> ⇒ 索引层的**第一验收目标不是性能，而是「不新增真相、不新增丢数据的路径」**。

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
  ⇒ **这三问已全部作答**，见本文末尾「§ 一期前置三问：答案（2026-09-16）」。
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

## 一期前置三问：答案（2026-09-16）

> 做法：不靠推测，先把**现成的接缝**与**真实成本**查出来 —— 结论是一条结构事实改变了整个分期形状。

### 0. 先说那条改变形状的结构事实：**接缝早就有了**

`core/index-engine.ts:22-24` 已有 `IndexEngine` 接口与 `createIndexEngine(config)`（`query/reads.ts:198` 调用），
按 **`config.indexEngine.provider || "fs"`** 路由（`:47`），现有 provider：**`fs`（默认，全量扫描，行为不变）/ `zg` / `semble`**。
其契约（`:12-20`）：`CandidateResult { provider, unavailable?, reason?, refs }`，且注释写死两条 ——
**「zg/semble 未装或不可用 → `unavailable`，调用方应回退 fs 扫描」**（`:14`、`:51`、`:64`）、**「绝不把 `unavailable` 当作 verified」**。

⇒ **一期不是「新起一层」，而是给这个既有接缝加一个 `sqlite` provider。** 附带好处：
`fs` provider **本身就是** 第 6 条决定要的「回落到文件系统路径」；`unavailable + reason` 就是「可见的降级留痕」。
⚠ **一处既有口径不一致，必须顺手钉住**：`core/types.ts:37` 的注释把这条写成「zg(未装→unavailable **不 fallback**)」，
而接口契约（`index-engine.ts:14/51/64`）写的是「**调用方回退 fs 扫描**」。两句含义相反 ⇒ 实现前先按**接口契约**统一措辞
（这一处属「同一件事两个说法」，正是本仓一直在抓的形态）。

### 1. 等价性怎么证

**对照面**：同一 query，`provider:"fs"`（今天）与 `provider:"sqlite"`（一期）两路，**产物逐字段一致**：
① 候选集（节点 id 集合）② 排序 ③ 渲染输出。排序口径今天已确定且确定性 —— `query/query.ts:329`
`sorted by (b.score - a.score) || b.mm.date.localeCompare(a.mm.date)`，无随机源。

**三条线一起上**：
- 既有测试套（60 项）先当第一条线 —— 但它**不够**，因为它只覆盖 mock 语料；
- **真实语料对照探针**（一期第一个产物）：语料 = 本机 `.shadow`（实测 **8,777 个记忆文件 / 7,819 个候选节点**），
  query 集从 `.shadow/query-log/*.jsonl` 取样（已有真实查询）；探针输出「两路的候选集差集 + 排名逐位对比」；
- ⚠ **必须先证明探针能测出差异**：故意让 `sqlite` provider 少返回一个 ref、或把两路排名人为错开一位，
  探针**必须变红**。这条直接抄 `ADR-0085` §7 的教训（「断言通过只证明我没测到」）——它在 v1.15.94 那一轮
  又应验了一次（宽松桩让两条路径从未在真实语义下跑过）。

### 2. 失效判据：**复用**源指纹，但要补一个版本令牌

**复用** `core/projection-store.ts` 的 `shadowSourcesFingerprint`（`:151-169`），理由：它是仓内**唯一一份**源指纹，
且已把两条纪律写死（`:142-148`）：**只覆盖权威源**（`.shadow/<date>/*.md` + `.shadow/resources/*.md`），
**刻意排除** `_meta.json` / `_index.md` / `query-log/` / `shadow-index/`（否则「读一次就失效」自激，缓存永不命中）。
另立一份 = 违反「判据收一处」。

**但要补一处（诚实记为既有缺口）**：现有指纹只由 `name:size:version` 拼成（`:164`），**没有索引器 / 表结构版本** ⇒
**索引器升级后指纹不变 ⇒ 会读到旧索引**。⇒ 一期指纹 = **源指纹 + `INDEX_SCHEMA_VERSION`（常量）**。
（同一缺口在现有 `nodes.jsonl` 上**已经存在** —— 这不是新问题，是继承来的。）

### 3. 谁建索引：**读侧惰性建 + 写侧失效信号 + 读侧指纹校验**（照抄既有三段式）

- **既有三段式**：`loadOrBuildProjection`（`projection-store.ts:178-188`）已经就是这三步，连边界都写好了：
  未提供指纹 → 旧行为（命中即用）；指纹一致 → 用缓存；**不一致或任一侧不可判定 → 保守重建**；
  且明写「**缓存是性能特性不是真相**（ADR-0046），宁可重建也不返回陈旧投影」。一期**照这个形状做**，不新造生命周期。
- **写侧信号已存在**：`core/writer-materialize.ts:368` 已有 `invalidateProjection(fsI, ws)`（门在 `projectionStore.enabled === true`）。
  ⚠ 一期要把它从「仅 store 开启时」解耦（或让 sqlite provider 自己挂），否则**索引开着、失效信号不发**。
- **增量更新一期不做（有硬证据）**：`core/change-set.ts:8` 明写「**ChangeSet 判为无调用点**；生产走的是**粗粒度清空**」
  ⇒ 一期只做「指纹变了 → 整体重建」，**不做增量**（增量要另立机制，属二期以后）。
- ⚠ **两条必须先说清的代价**：① **首次查询会更慢**（要读 8.8k 文件建表）⇒ 要有可见的一次性代价说明，
  否则读的人会以为卡死；② 「读路径也会写盘」**是既有事实**（`index.ts:131` 注释），所以读侧建索引**不新增违规**，
  但**默认值**要选对 —— 若像 `projectionStore` 那样**默认关**，那 8.5–9.9 s 的问题**一点没解决** ⇒ 一期应**默认开**，
  并把「不可用」降级成可见的 `unavailable` + 回退 `fs`（慢但正确）。

### 支撑数据（实测，2026-09-16 本机）

| 读数 | 值 | 来源 |
|---|---|---|
| 记忆文件数 | **8,777**（8 个日期目录） | 磁盘枚举 |
| 候选节点数 | **7,819 / 7,840** | `.shadow/query-log/2026-09-16.jsonl`（真实查询） |
| 单次查询耗时 | **9,904 ms / 8,516 ms** | 同上（`projectionCached: false` ⇒ **稳态**，不是冷启动） |
| 一期载体 | `node:sqlite` 可用（FTS5 / 事务通过）；**`sqlite-vec` 不在内置模块** | `probe-node-sqlite.ts` |

⇒ 「几百条 → 1 万 / 5 万 / 10 万」的担忧**不是预演**：**今天 7.8k 节点就已经是 8.5–9.9 秒/次**。

### 结论（一期开工清单）

1. 统一 `indexEngine` 那处**措辞矛盾**（`types.ts:37` vs `index-engine.ts:14`），再动代码。
2. 加 `provider:"sqlite"` + 指纹带 `INDEX_SCHEMA_VERSION` + 写侧失效信号解耦 + **默认开**。
3. 先写**真实语料对照探针**并**证明它能测出差异**，再写 provider（否则「等价」无从谈起）。
4. 用真实语料标定**重建成本**（8.8k 文件建表要多久）—— 这是「默认开」是否可接受的唯一判据。

> ⚠ 本节（前置三问的答案）保留原文以便追溯；它上面的「开工清单」已被下面 **T17-A/B/C** 细化并取代。

## T17 的边界、不变量与分期（用户 2026-09-16 定调）

### 一、硬边界：**一期只做两件事**

```
IndexEngine
    ├── fs      （default，行为不变）
    ├── zg
    ├── semble
    └── sqlite  ← T17 只加这一个
```

一期 = `fs provider` + **`sqlite provider`**，而 SQLite **只做「加速候选生成」**。**明确不做**（写在这里，防止顺手扩大）：
`sqlite-vec` · `embedding` · `hybrid ranking` · 新 retrieval 算法 · memory schema 重构 · `.md → sqlite` **迁移** · 新 Memory API。

⇒ 也**不是**「把 SQLite 当存储迁移项目」——它是 `IndexEngine` 的**一个新 provider**。

### 二、数据流必须保持（否则无法证明「只改性能、不改语义」）

```
.shadow/*.md ──(source of truth)──▶ SQLite Index ──(candidate generation)──▶ IndexEngine
                                                                                │
                                                                                ▼
                                                            现有 read_shadow ──▶ 现有 ranking /
                                                                            evidence / temporal /
                                                                            projection
```

**反例（明令禁止）**：`.shadow → SQLite → 新的 retrieval → 新的 ranking`。走成那样，就再也说不清「语义没变」。

### 三、不变量（**直接写进 ADR**）

> **For identical `.shadow` state and identical query parameters, the `sqlite` and `fs` providers MUST produce
> semantically equivalent candidate sets.**

`Equivalent(A, B)` 的定义（**不要求 byte-for-byte** —— SQLite 的排序实现可能不同）：

```
canonical(memory) = { id, scope, type, validity, status }

canonical(fsCandidates) == canonical(sqliteCandidates)
```

- 比较对象 = **`IndexEngine` 的候选生成结果**，**不要一上来比较最终 LLM context**。
- **排序若属于上层 ranking，就不在 provider 层比较**（那是 `query/query.ts` 的职责）。
- 需要覆盖的对照面：`memory id` · `scope` · `type` · `validity` · `deleted/superseded` ·
  `ordering`（在 provider 层有定义时）· `limit` · 空结果 · `not found` · 坏文件 · 新文件 · 改过的文件 · 删掉的文件。

### 四、失败模型：**继承 `failure ≠ absence`（`v1.15.95` 的教训）**

四种状态**必须完全不同**，任何两种都不得合并：

| 状态 | 行为 |
|---|---|
| `SQLite unavailable` | → **回退 `fs`**（慢但正确），并留可见的 `unavailable` + reason |
| `SQLite corrupt` | → 回退 `fs` / **重建** |
| `SQLite query error` | → **回退 `fs`** |
| `SQLite **合法地**返回 0 行` | → **空**（这是结果，不是错误） |

⚠ 这正是 `v1.15.95` 修掉的那类缺陷的索引版：**error ≠ empty**。第一原则（本文件顶部）在此落地。

### 五、索引健康元数据（**`INDEX_SCHEMA_VERSION` 必须做**）

- **必须**：`schema_version` —— 否则索引器升级后会读到旧索引（现有 `nodes.jsonl` 就缺这个令牌，属继承缺口）。
- 可选（**metadata 而已，别搞成新系统**）：`generation` · `source_count` · `last_rebuild_at` · `last_source_scan`。

### 六、基准：三个数字（真实语料 ≈ **8.8k** 文件）

| # | 场景 | 为什么 |
|---|---|---|
| 1 | **cold rebuild**：8.8k `.md` → SQLite | 「默认开」是否可接受的唯一判据 |
| 2 | **incremental update**：1 个 `.md` 变更 → SQLite | 决定「指纹变了就整体重建」够不够用 |
| 3 | **startup**：SQLite 已存在 → ready | **最关键** —— 插件最怕「启动 DSH ⇒ 扫 8,800 文件 ⇒ 等 2/5/10 秒」；已有索引时应当只是 `open → check schema → ready` |

### 七、分期 **T17-A / T17-B / T17-C**

- **T17-A（只做 probe / benchmark / canonical diff —— ⚠ 不改生产代码）**
  1. **真实语料对照探针**：同一批 query 走 `fs` 与 `sqlite` 两路 ⇒ **canonical diff**。
     目标**不是**证明「SQLite 更快」，而是证明「**在相同语义约束下能产生等价候选集**」。
  2. **反向实验（先造红，再相信探针）**：人为删除 sqlite 一条记录 ⇒ 必须红；改 `scope` ⇒ 红；改 `valid_until` ⇒ 红；
     改排序 ⇒ 红；**遗漏新文件** ⇒ 红。
     > **如果这些都造不出红，这个探针就没资格作为 T17 的验收依据。**（比 schema 本身更重要。）
  3. 三个基准数字（上表）。
- **T17-B**：实现 `SQLiteIndexProvider`，**只接 `IndexEngine`**（不动 ranking / evidence / temporal / projection）。
- **T17-C**：验证矩阵 —— `fs` · `sqlite` · `sqlite unavailable` · `sqlite corrupt` · `schema mismatch` ·
  `source changed` · `rebuild` · `8.8k cold build` · `incremental update`。
  **全部通过之后，才考虑把 `sqlite` 设为默认。**

### 八、OpenClaw：**只抄 30%**

- **值得借**：`Markdown = canonical memory` · `SQLite = derived index` · `FTS5 = lexical retrieval` ·
  `vector = optional` · `index rebuild = mandatory` · `fallback = filesystem`。
- **不要借**：它的**整套 memory semantics**。本仓已有自己的 `Evidence` / `Temporal` / `Scope` / `Authority` /
  `Projection` / `Identity` / `Verification` —— 整套搬过来**会破坏已经冻结的语义**。

### 九、本阶段的取向：**不扩大 Cognitive Layer，先把底层夯实**

```
v1.15.95 ──▶ ADR-0095 ──▶ T17 ──▶ IndexEngine ──▶ fs / sqlite
```

一旦候选生成层做到「**便宜、确定、可重建、可降级**」，上面的 Experience / Reflection / Identity / Evidence /
Temporal / Agency / Long Horizon 才有一个共同地基 —— **这比现在再加十个 `read_shadow(mode=…)` 值得。**

### 十、⚠ 开工前必须钉住的一条（父代理 2026-09-16 查出）：**「候选预筛」目前没有消费者**

**事实（可复核）**：
- `createIndexEngine(...)` 在全仓的**唯一调用点** = `query/reads.ts:198`，只服务 `mode:"index"`；
  而 `:201` 只是把 `r.refs` **打印成一行行列表**。
- 真正的召回路径（默认 `read_shadow` / `shadow_query`）走 `listMemories` + `deriveShadowNodes` + 打分，
  **完全不读 `refs`**。

⇒ **今天的 `IndexEngine` 是「诊断 / 展示面」，不是「加速面」**。**只加一个 `sqlite` provider，效果等于
「`read_shadow({mode:"index"})` 的打印变了」，召回一点没快。**

⇒ **因此一期必须多包含一步：把候选预筛接进真正的召回路径。** 而「收窄落在哪一层」**本身要先定**，至少三选一：

| 落点 | 可行性 / 代价 | 是否可能改变语义 |
|---|---|---|
| (a) `listMemories` **之前**（refs 决定读哪些文件） | 最省 I/O（今天 8.8k 文件的读与解析是主要成本） | ⚠ **最危险**：任何漏召回 = **静默少结果** |
| (b) `deriveShadowNodes` **之后、打分之前** | 安全，但省得少（读文件与解析的开销已经付过） | 低 |
| (c) 其它落点 | 由 T17-A 取证后给出（须带 `文件:行号`） | 待定 |

⇒ **T17-A 的第一件事因此改为「先定收窄落点」**，再谈等价性 —— 否则 diff 比的是「真实路径」与「一条没有消费者的旁路」，
证明不了任何东西。且**落点选 (a) 时，「漏召回」必须成为反向实验里的第一组**。

### 十一、T17-A 要额外证明的两件事 + 一个被明确允许的第三种结论（用户 2026-09-16 追加）

**(1) 最危险的失败不是「查错一条」，而是「少给一条」= silent recall loss**

```
SQLite 少给一个候选 → derive 正常 → ranking 正常 → evidence 正常 → 答案正常生成 → 用户根本不知道少了一条
```

⇒ 若落点选 **(a)**，**「漏召回」必须是反向实验的第一组**；探针要在「**只少一条候选**」时就变红。
反例如要覆盖两种漏法：① sqlite 少返回一条本就该进候选的记忆；② sqlite 返回了、但下游按 refs 读文件时**该文件没被读**。

**(2) 报告必须带「漏斗表」（`FS` vs `SQLite` 并排），尤其 `files read` / `files parsed`**

| 指标 | FS | SQLite |
|---|---|---|
| source files | 8,800 | 8,800 |
| candidate N | | |
| **files read** | | |
| **files parsed** | | |
| derive nodes | | |
| ranking input | | |
| final context | | |

**判据**：若 `files read` 只从 8,800 降到 ~8,500 ⇒ **基本没解决核心问题**；
若能降到 ~200 ⇒ 架构收益清清楚楚。**数字必须实测并写清怎么数的（在读文件那一层计数），不许估。**

**(3) 被明确允许的第三种结论：抽象本身要改，就改抽象（不许为完成 T17-B 硬塞）**

若探针证明**现有 `IndexEngine` 抽象不适合承载这个优化**（它现在是展示面、`refs` 无消费者），
那么正确结论是「**先抽一个 `CandidateProvider` / `CandidateSet` 边界**」，而**不是**把优化硬塞进现在的接口。
用户 2026-09-16 原话：「**如果探针得出第三种结果，也不要为了完成 T17-B 强行塞进现在的 `IndexEngine`。**」

目标契约形状（用户画的）：

```
FS provider ──▶ candidates ──▶ same canonical candidate universe
                                        │
                                        ▼
                      deriveShadowNodes → validateAtomProjection → ranking
```

> 名称校正：生产里的校验函数是 **`validateAtomProjection`**（`core/resource.ts` 等引用它）；
> 口头称 "validateAgentProjection" 时以代码为准。**在 ADR/契约里写错符号名 = 给后来者埋一个假引用。**
