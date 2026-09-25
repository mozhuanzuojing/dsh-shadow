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
- 关联 ADR：**ADR-0001**（投影文件树而非向量库 —— 其 Notes 已留口「若日后召回不足，可在 `_index.md` 之上叠一层向量检索作为增强，而不推倒文件树」）· **ADR-0060**（多粒度检索的**形式** = 单索引 + 层级 + 路由；其「产品方向」部分**由本 ADR 承接**）· **ADR-0003**（派生件不是 source）· **ADR-0043**（Shadow Contract）· **ADR-**（缺件不静默 / 降级台账）· **ADR-0051**（资源卡：源层与派生分离的同款手法）· **ADR-0042**（知识图边界：本 ADR 只做「可查询的关系表」，不碰认知层）
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

用户给的 外链**全部真实可达**（未见编造），但有 需更正：

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
6. **失败必须降级且可见**：SQLite 不可用（模块缺失 / 库损坏 / 锁）时，读侧**回落到现有文件系统路径**并**留降级留痕**（ADR-）。**不许静默变慢，也不许静默返回空**。
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
⇒ 三期动工前必须先回答：**这些状态丢了会怎样？**（`hits` 丢了只影响冷热排序？`_recall_log.json` 丢了只影响冷却？）**答案必须是「可接受丢」或「另有一份文件权威」二者之一**，否则三期会悄悄破坏本 ADR 的第 决定。

## 明确不做（本期）

- **不引常驻服务**（ADR-0001 仍有效）。
- **不把记忆正文搬进 SQLite**：人类可读的认知资产继续留在 `.md`（用户原话）。
- **一期不上向量**；`sqlite-vec` 实测不在内置模块里（Decision 5）。
- **不因为「有 SQLite 了」就放宽 ADR- / 0051 的证据门**。
- **不做认知层 / 知识图**（ADR-0042 的边界，仍「提议 · 暂不实现」）。

## 重新评估条件

- **一期**：若「读侧输出逐字不变 + 重建等价」做不到（例如排序 / 截断上有不可消除的差异），则退回文件系统路径，并在本 ADR 记「试过、失败原因 X」。
- **二期（向量）**：仅当 ADR-0060 的判据满足（有实测样本证明召回不足）**且** 载体与许可单独裁决通过。
- **三期（状态）**：仅当一期稳定运行且**重建等价性**已有回归锁。

## Notes

- 本 ADR **只冻结边界与分期**，不含实现；实现待办见 `BACKLOG.md` 的 **T17**（含五个完成判据）。
- 与 **ADR-0060** 的关系：0060 已把**形式**定死，本 ADR **不改**那部分，只承接它悬置的**产品方向**（已在 `adr/0060` 头部加补记指向本文件）。
- 证据与可重放：`../.docs/fix/2026-09-16/INDEX.md`（含 OpenClaw 核实的 专家报告 + 探针产物）。
- **引用纪律**：本 ADR 里 OpenClaw 的行号都是 **HEAD `c1c870a` 的 depth=1 快照**；上游若改动，按本仓「历史文档 vs 当前态文档」只修**当前态文档**，不动归档层。

## 一期前置三问：答案（2026-09-16）

> 做法：不靠推测，先把**现成的接缝**与**真实成本**查出来 —— 结论是一条结构事实改变了整个分期形状。

### 0. 先说那条改变形状的结构事实：**接缝早就有了**

`core/index-engine.ts:22-24` 已有 `IndexEngine` 接口与 `createIndexEngine(config)`（`query/reads.ts:198` 调用），
按 **`config.indexEngine.provider || "fs"`** 路由（`:47`），现有 provider：**`fs`（默认，全量扫描，行为不变）/ `zg` / `semble`**。
其契约（`:12-20`）：`CandidateResult { provider, unavailable?, reason?, refs }`，且注释写死两条 ——
**「zg/semble 未装或不可用 → `unavailable`，调用方应回退 fs 扫描」**（`:14`、`:51`、`:64`）、**「绝不把 `unavailable` 当作 verified」**。

⇒ **一期不是「新起一层」，而是给这个既有接缝加一个 `sqlite` provider。** 附带好处：
`fs` provider **本身就是** 第 决定要的「回落到文件系统路径」；`unavailable + reason` 就是「可见的降级留痕」。
⚠ **一处既有口径不一致，必须顺手钉住**：`core/types.ts:37` 的注释把这条写成「zg(未装→unavailable **不 fallback**)」，
而接口契约（`index-engine.ts:/64`）写的是「**调用方回退 fs 扫描**」。两句含义相反 ⇒ 实现前先按**接口契约**统一措辞
（这一处属「同一件事两个说法」，正是本仓一直在抓的形态）。

### 1. 等价性怎么证

**对照面**：同一 query，`provider:"fs"`（今天）与 `provider:"sqlite"`（一期）两路，**产物逐字段一致**：
① 候选集（节点 id 集合）② 排序 ③ 渲染输出。排序口径今天已确定且确定性 —— `query/topic-recall.ts` 的打分排序
`sorted by (b.score - a.score) || b.mm.date.localeCompare(a.mm.date)`，无随机源。

**三条线一起上**：
- 既有测试套（）先当第一条线 —— 但它**不够**，因为它只覆盖 mock 语料；
- **真实语料对照探针**（一期第一个产物）：语料 = 本机 `.shadow`（实测 **8,记忆文件 / 7,候选节点**），
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
- **写侧信号已存在**：`core/writer/materialize.ts:368` 已有 `invalidateProjection(fsI, ws)`（门在 `projectionStore.enabled === true`）。
  ⚠ 一期要把它从「仅 store 开启时」解耦（或让 sqlite provider 自己挂），否则**索引开着、失效信号不发**。
- **增量更新一期不做（有硬证据）**：`core/change-set.ts` **当时明写**（该文件已于 v1.21.14 按 `D1` 删除，见 `adr/0086` §6）「**ChangeSet 判为无调用点**；生产走的是**粗粒度清空**」
  ⇒ 一期只做「指纹变了 → 整体重建」，**不做增量**（增量要另立机制，属二期以后）。
- ⚠ **两条必须先说清的代价**：① **首次查询会更慢**（要读 8.8k 文件建表）⇒ 要有可见的一次性代价说明，
  否则读的人会以为卡死；② 「读路径也会写盘」**是既有事实**（`index.ts:131` 注释），所以读侧建索引**不新增违规**，
  但**默认值**要选对 —— 若像 `projectionStore` 那样**默认关**，那 8.5–9.9 s 的问题**一点没解决** ⇒ 一期应**默认开**，
  并把「不可用」降级成可见的 `unavailable` + 回退 `fs`（慢但正确）。

### 支撑数据（实测，2026-09-16 本机）

| 读数 | 值 | 来源 |
|---|---|---|
| 记忆文件数 | **8,777**（日期目录） | 磁盘枚举 |
| 候选节点数 | **7,,840** | `.shadow/query-log/2026-09-16.jsonl`（真实查询） |
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
| `SQLite **合法地**返回 ` | → **空**（这是结果，不是错误） |

⚠ 这正是 `v1.15.95` 修掉的那类缺陷的索引版：**error ≠ empty**。第一原则（本文件顶部）在此落地。

### 五、索引健康元数据（**`INDEX_SCHEMA_VERSION` 必须做**）

- **必须**：`schema_version` —— 否则索引器升级后会读到旧索引（现有 `nodes.jsonl` 就缺这个令牌，属继承缺口）。
- 可选（**metadata 而已，别搞成新系统**）：`generation` · `source_count` · `last_rebuild_at` · `last_source_scan`。

### 六、基准：三个数字（真实语料 ≈ **8.8k** 文件）

| # | 场景 | 为什么 |
|---|---|---|
| 1 | **cold rebuild**：8.8k `.md` → SQLite | 「默认开」是否可接受的唯一判据 |
| 2 | **incremental update**： `.md` 变更 → SQLite | 决定「指纹变了就整体重建」够不够用 |
| 3 | **startup**：SQLite 已存在 → ready | **最关键** —— 插件最怕「启动 DSH ⇒ 扫 8, ⇒ 等 /10 秒」；已有索引时应当只是 `open → check schema → ready` |

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

### 八、OpenClaw：**只抄 **

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

**(4) 方法学硬要求：基准必须跑在「语料冻结副本」上（T17-A 实测踩到）**

T17-A 用生产 `fs` 路径跑全量时，**用户真实工作区的 `.shadow/_meta.json` 从 31,827 B 涨到 182,272 B**
（mtime 与那次跑数逐秒吻合）。原因**不是 bug**：**生产读路径本来就会写盘**（召回时累加 `_meta.json` 的 `hits` / `lastSeen`，
`index.ts:131` 的注释写着「读路径也会写盘」）。但后果必须写进 ADR：

- **「只读探针」在语义上做不到** —— 只要走生产读路径，就会写 `_meta.json`；
- ⇒ **每跑一次基准，输入就变一次 ⇒ 前后两次的数字不可比**（这会让「SQLite vs FS」的对比失去意义）；
- ⇒ **铁律**：**所有基准与对照一律跑在 `.shadow` 的「冻结副本」上**（整目录复制到 scratch，让 `fs` 门面指向副本）。
  这也是 T17-B 的验收前提之一 —— 否则性能数字不可复现。
- ⇒ 另记一条**影响面**（据实）：被写的是 `hits` / `lastSeen` 这类**启发式热度**，不是 `pinned` / `archived` 这类人工状态；
  但**无法精确回滚**（没有 13:41 之前的 `_meta.json` 快照）。

### 十二、T17-A 首轮实测的两条结果（2026-09-16，**其中一条修正了本 ADR 前面 Q2 的答案**）

**(1) ⚠ 失效判据「复用源指纹」这条要加条件 —— 因为指纹本身要 ~7 秒**

T17-A 实测（`t17a/run-bench.txt`）：把 `.shadow` 的**冻结副本**建索引时，
`tFingerprint` = **2,,,088 ms**；`incremental.msFingerprintDetect` = **6,908 ms**。
⇒ **`shadowSourcesFingerprint` 今天要对 9,文件做 per-file `listDir` 级枚举 ⇒ 它自己就 ~7 s。**
⇒ **若照搬「每次先算指纹再决定是否重建」，光检查 freshness 就要付 ~7 s，加速就没意义了。**

⇒ **Q2 的答案追加条件**：指纹**只有在它比它要省掉的东西便宜时**才能用。
T17-B 必须先证明「失效判据的检查成本是 **O(1) 级**」——候选做法：用**每个日期目录的 entry 数 / 目录版本令牌**
（而不是逐文件 `name:size:version`）作粗信号，粗信号不一致时才做细比对。**未证明之前不许写成「复用即可」。**

> **数字口径（父代理 2026-09-16 独立复核后补，按本仓「数字要带范围与时刻」的规矩写）**：
> 同一函数、同一台机、同一时刻的两组读数 **不一致**，故本 ADR **不写死任何单一数字**：
> - T17-A 组（`t17a/run-bench.txt`，13:46）：`tFingerprint` = **2,,,088 ms**；`msFingerprintDetect` = **6,908 ms**；
> - 父代理独立复核组（`t17a/parent-verify-fingerprint.txt`，13:54，直接打 `dist/core/projection-store.js`）：
>   **真实工作区 1,791（首跑）/ 2,,,199 ms**；**冻结副本 3,,,,728 ms**。
> ⇒ **结论方向不变**（**秒级，不是 O(1)** ⇒「每次先算指纹再决定重建」照样要先付这笔钱），
> 但**量级应写成「2–7 秒、方差大」**，且**方差成因未查清**（可能与当时并发跑数、文件系统缓存冷热有关）。
> ⇒ 这本身就是一条 T17-B 的验收要求：**先把这笔开销的方差测稳**，再拿它当设计依据。

**(2) 反向实验首轮  造红 —— 探针「尚不完全合格」，且原因要查清**

| 实验 | 造红？ |
|---|---|
| ⑴ 删掉一条记录（漏召回） | ✅ |
| ⑴变体② **文件没被读**（refs 漏一个文件 ⇒ 下游根本没读它，**落点 (a) 的失效形状**） | ✅ |
| ⑵ **改 `scope`**（把一条 decision 的 `kind` 改成 metadata） | ❌ **没测出来** |
| ⑶ 改 `valid_until` | ✅ |
| ⑷ 改排序 | ✅ |
| ⑸ 遗漏一个新文件 | ✅ |

⇒ 按用户 2026-09-16 的规矩「**造不出红 ⇒ 这个探针没资格当验收依据**」，**当前探针不算完全合格**。
⇒ ⑵ 的**两种可能必须先分清**：**(i) 实验选错了对象**（若那条节点本身已被证据门拒收、不在比较宇宙里，
那改它当然测不出差异 —— 这是实验的问题）；**(ii) 探针真对 `scope`/`type` 类变化盲**（这是探针的问题）。
**查清之前，`scope`/`type` 这一类差异不得声称已被覆盖。**

**(3) 首轮正面结果（供对照，别只记风险）**：canonical diff 在 **8,204 vs 8,203** 上只差 ****，
且那 是 **`sr-openclaw`（资源卡）** —— 根因是**原型索引没有把 `.shadow/resources/*.md` 建进去**，
属**原型缺口**、不是语义不可达 ⇒ 补上卡片即可期望等价。
查询路径 **2,753 ms（fs）vs 68 ms（sqlite）**（冻结副本上）；**startup（已有索引 → ready）= 3 ms**（索引 21.5 MB）。

### 十三、T17-A 终态结论（2026-09-16，报告 `t17a/T17A-FINDINGS.md`）

**(1) 正面结果（都跑在语料冻结副本上：9,记忆文件）**
- **canonical diff = 0**：宇宙 `fs 8,204` vs `sqlite 8,204`，** query 差集 0**；干净基线下两路**连顺序都逐位相同**。
- **反向实验  全红**，含两类 silent recall loss：⑴ 删  atom（`onlyFs=1`）、⑴变体② **refs 漏 文件 ⇒ 下游没读**、
  ⑴c 删资源卡、⑵a 改 `kind`（门判拒收）、⑵b 改 decision 输入（`scope` 成对报出）、⑶ 改 `valid_until`、⑷ 改排序、⑸ 新文件未重建。
- **漏斗表**：`source 9,144`｜`candidate 8,,204`｜**`files read 9,147 → 0`**｜**`files parsed 9,144 → 0`**｜
  `derive nodes 8,,204`｜单次查询 `7,357–10,210`（热 `2,602–4,605`）/ **`68 ms`**。
  ⇒ 按用户判据「降到 ~200 才算清楚」：**不是 8,500，是 0**。
- 基准：cold rebuild **8,795 ms**（最冷）/ 含负载 11,276 / 热 14,770–21,224；incremental = 指纹检测 6,984 ms + 单条 upsert **4 ms**；
  **startup 中位 4 ms**。

**(2) 收窄落点：结论是 (c1) —— 不塞进今天的 `IndexEngine`**
- **(b) derive 之后**：**省 ≈ 0**（`msMaterializeAndDerive` 5,983–8,731 ms 里读+解析已付，只剩毫秒级过滤）。
- **(a) `listMemories` 之前**：省 I/O，但 **`IndexEngine.refs` 的域不对** —— 它是 `{type:"file", locator, fragment.start}`
  （`dist/core/index-engine.js:4`），semble 还固定 `--content code`（`dist/core/semble.js:104`）⇒ **表达不了「记忆原子候选」**；
  且**漏  ref = 静默少结果**（⑴变体② 已证）。
- **(c1) 换物化载体**：**`dist/query/materialize.js:9-25` 是唯一一处「读全部 → `parseMemory`」的收敛点**
  ⇒ 把「`listMemories` + `readRel` + `parseMemory`」换成「查 `source` + 查 `atom`」，
  **`deriveShadowNodes` / `validateAtomProjection` / 打分 / 渲染全不动**。
  顺手核实：`query/index-budget.ts` 的**无参** `read_shadow()` 走 `_index.md`（2.25 MB）、**不走 `listMemories`**
  ⇒ 受影响的只是**带 topic 的召回**。
- **T17-A 倾向「先抽 `CandidateProvider` / `CandidateSet` 边界，`IndexEngine` 保持原样（诊断面）」** ——
  这正是用户 2026-09-16 明确允许的**第三种结论**。

**(3) ⚠ 探针「测不出」的 （**下一棒务必别当已验**）**
`deleted` / `superseded` 的**真实生产语义**（本工作区 `pinned`/`archived`/`compacted` **全 0**，`droppedForgettable=0`、
`droppedCompacted=0`，**从未触发**）· **`validity` 的生产语义（全仓 0 命中！⑶ 红的是探针自装的过期判据）** ·
`scope` 若指 workspace scope 则该列无证明力（**二义性需先裁决**）· `asOf` · `deprioritize` / `cooldown` · 并发 ·
**FTS5 `MATCH` 取代 `matchShadowNodes` 的召回等价性（完全未测 —— T17-B 最该先补的一条）** ·
`sqlite-vec` / 向量 · 跨平台锁 / WAL · `scopedFs` 之后是否仍给 `version`。

> ⇒ **对不变量定义本身的一个后果**：`canonical(memory) = { id, scope, type, validity, status }` 里的
> **`validity` 与 `deleted/superseded` 语义今天在生产里根本不存在** ⇒ 拿它们做等价性对照，**比的是常量**。
> T17-B 要么先给这两列**找到真实来源**，要么**把它们从等价判据里暂时移除**（并写明理由）。

---

## 补记（2026-09-16 · **T17-B 实现轮**）—— 正文不动，这里只记「实现后的终态 + 三条新事实 + 一条更正」

> 正文（上面 ）是**冻结时**的边界与判断，**不改**。本补记记的是实现轮里**被实测改写的那几件事**，
> 以及 T17-B 交付的终态。规格全文见 `../.docs/fix/2026-09-16/t17b/DESIGN.md`（D1–D14），证据与可重放见同目录。

### 一、T17-B 落地成了什么（一句话）
**(c1)「换物化载体」落地为一条新边界 `CandidateProvider` / `CandidateSet`（`core/candidate/provider.ts`），
`fs` provider 与今天逐字等价，`sqlite` provider 从 `<ws>/.shadow/index.sqlite` 取候选；
`IndexEngine` 一字未改（仍是诊断/展示面，`adr/0095` §十、T17-A §3.4）。**
换的只是「字段从哪来」（文件 → 索引列）：`parseMemory` 的逐字段**派生输入**落库，
`deriveShadowNodes` / `validateAtomProjection` / 打分 / 渲染**全部原样**（等价性的根就在这里）。
`query/materialize.ts` 是唯一物化收敛点 ⇒ 换载体只动这一处（+ 调用点传降级/写侧信号）。

### 二、三条新事实（都是实测，且**有两件事与本 ADR 前面的写法相反**）

**(1) 插件手里的 `fs` 服务只能写文本 ⇒ SQLite 的落盘必须另走一路（用户 2026-09-16 裁决）**
- 事实：`FileSystem.writeText(target, string)` 是**唯一**的写方法（`@deepseek-ai/dsh-fs` 契约），没有二进制写；
  而 `node:sqlite` 要一个真实文件路径。官方桥是 **`processPath(target)`**（同一契约的抽象方法）。
- 代价（必须写清）：`dsh-fs-sandbox` 的策略围栏**只挂在 `writeText` / `editText` 上**，所以
  `processPath` + `node:fs` 是**全仓唯一一处绕过会话沙箱围栏的写**（`read-only` 也拦不住）。
- 用户裁决：**保持 SQLite 载体**（不换成文本派生文件），接受这一处绕过，并配三道守卫写进实现：
  ① `processPath` 不可用 / 返回非绝对路径 ⇒ `unavailable` 回退 `fs`（**非本地后端该能力不可用**）；
  ② 会话策略 `read-only` ⇒ **不写**、直接 `unavailable`（由 `index.ts` 的 `makeQueryDeps` 传 `derivedIndexWritable`）；
  ③ 只写「由 `resolve` 得到、由 `processPath` 产出」的路径，**不做字符串拼接**；写入用 `tmp → renameSync` 原子发布。
- `core/fs-scope.ts` 只补**一行** `processPath` 转发（且只在真实存在时补，沿用该文件既有纪律）。

**(2) 「复用源指纹」这条要用**另一个**东西 —— 目录级令牌，因为 `listDir` 是急取的**
- 事实（`../.docs/fix/2026-09-16/t17b/fs-cost-findings.md`）：`listDir` **逐子项 `realpath` + `stat`**
  （`dsh-fs-local/lib/index.js:291-302`、`:159`、`:220-229`），属性访问本身只值  ⇒ **没有「便宜的 listDir」**。
- 但**有**便宜的目录级令牌：`fs.stat(dir).version = dev:ino:size:mtimeNs:ctimeNs`，而且
  **`listDir(.shadow)` 条目上的 `version` 与 `stat(该目录)` 逐字相同** ⇒ **一次 `listDir(.shadow)`（）就拿到全部目录令牌**，
  实测 **4.7–5.7 ms**；对照组「文件级全量指纹」= **3.3–3.6 s** ⇒ **660–720×**。
- ⇒ 新鲜度由**三道门**组成（实现位置：`core/candidate/sqlite.ts`）：
  **门① 粗信号**（根 `listDir` 的目录令牌，未变即直接用索引）→ **门② 变化目录细比对**
  （只对被令牌改变的目录做一次 `listDir` + 逐文件 `name:size:version` 比对 ⇒ 逐条 upsert/删）→
  **门③ 写侧精确信号**（`WriterCore.derivedDirty`，键 `ws|rel`；`flush` 与 `patchSummary` 标脏，
  读侧**成功 upsert 之后**才消费）。
- **时序纪律（错了就是静默漏召回）**：**先取目录版本、再 `listDir` 该目录**，并把**先取到的那个版本**落库。
  判据：存下来的版本 == 现在读到的版本 ⇒ 该目录此后一定没有增/删/改名。反过来会存下「比内容新」的版本 ⇒
  新增文件**永远进不了索引**。这与 `persistence/meta.ts:40-43`「先 stat 取版本、再 readText」是同一条纪律。
- ⚠ **登记一条剩余漏洞（不许写成「复用即可」）**：**外部进程**（另一会话 / 子代理 / 手工编辑器）对一个
  **已存在**的记忆文件**原地改内容**时，目录令牌看不见（长度变与不变都看不见，实测）、写侧 dirty 也不知道 ⇒
  索引会陈旧，直到该目录发生增/删/改名。恢复句柄：`derivedIndex.verifySources: "full"`（**逐目录**做文件级比对 ——
  实测代价 = ** `listDir`**（日期目录 + `resources`）、**`readText` 仅 0–**、约 **4.1 s**；
  ⚠ 它**不是**「重读全部 9.5k 个文件」，别按那个口径估成本）、删 `.shadow/index.sqlite`（约 12.1 s 重建）、
  或把 provider 设回 `fs`（约 10.8 s 全量）。
  2026-09-16 取证轮已用**输出层**判据复现该陈旧：外部原地改 `> 决策：` 行后，索引里的 `content` 仍是旧值
  （`outputStale=true`），而 canonical `{id,type,status}` 差集为 0 ⇒ **陈旧只能用输出层判据报，canonical 判据看不见它**。
  （本条与既有 `projectionStore` 的已知降级同型：缓存不是真相 + 给恢复句柄；但本层是**物化载体**，故必须显式登记。）

**(3) `@types/node`（本仓 20.19.43）**没有** `sqlite.d.ts` ⇒ 取模块必须是「动态 import + 计算型说明符」**
- 静态 `import { DatabaseSync } from "node:sqlite"` 会让 `tsc` 报 TS2307；**更严重**的是宿主 Node < 22.5 时
  静态 import 会让**整个插件模块加载失败**（而不是「这一项不可用」）⇒ 加速层把插件搞挂，直接违法第一原则。
- ⇒ 实现用 `const SQLITE_SPEC = "node:sqlite"; await import(SQLITE_SPEC).catch(() => undefined)`，
  且**公开签名里不出现 `DatabaseSync` 类型**（一律 `any` 持有句柄）。

### 三、一条更正（T17-A 记错的前提，防后来者照错的源）
- T17-A 的 `T17A-FINDINGS.md` 写「**FTS5 对 CJK 是按字的**，`MATCH '召回'` 命中」—— **不成立**：
  那是**合成测试串**（`read_shadow 召回 冷却 台账`，CJK 段恰好被空格切成与查询相同的整 token）造成的假象。
  真语料 `fts5vocab`：`用户消息` 是**一个** token，`消息` / `消` / `息` 都不存在；最长 token 46 字；
  `MATCH '召回 冷却'` = **0 命中**。（已在 `T17A-FINDINGS.md` 就地加**标注式更正**，原始读数保留。）
- 由此定下 **D11（FTS5 判据 = 丙）**：`MATCH` = **整 token 相等/前缀**，生产 `matchShadowNodes` = **任意子串 AND**
  （`core/node.ts:89`/`:93`/`:94`），语义层面就不等价 ⇒ 实测 `Σ|S1\S2| = 10,649` 条漏召回（命中密集集 ****，
   条 query 有漏；`q="消息"` 生产  → FTS ****）、**OR 也不是安全超集**（反例）。
  ⇒ **本期不建 `atom_fts`**，sqlite 路**取回全部 atom** 再交生产 `matchShadowNodes` 过滤（不造没有消费者的表 —— §十的教训）。
- 另一处更正：T17-A 的「`listMemories` 1.2–1.5 s vs 指纹 2–7 s = 2–5×」是**测量落在 `realpath` 退化曲线的不同位置**
  造成的假象；同语料同时刻对照的**真实比值 = 1.01×**，长驻进程两侧都应按 **3.3–3.6 s** 计。
  ⇒ 本 ADR §十二(1) 里那句「指纹 ~7 s」的量级仍成立（都是秒级、方差大），但「比值 2–5×」不要再引用。

### 四、D9 的落定：`validity` 移出等价判据（正文那个悬而未决的问题的答案）
- 生产里**没有** `validity` / `valid_until`（全仓 0 命中）⇒ 拿它对照**比的是常量**（正文自己已指出）。
  T17-B 的处置：**canonical 等价判据收窄为 `{ id, type, status }`**（`status` 取自权威 `_meta.json`，
  无记录 ⇒ `unregistered`）；**`validity` 移出判据**，等价性改由**结构**承担 ——
  两路在 `materializeAtoms` 之后跑**同一份** `keep`（`isForgettable` / `isCompacted`）⇒ 「被遗忘/被收口」的差集恒等。
- `deleted` / `superseded`：**有真实来源**（`_meta.json` 的 `status`，`core/forget.ts` 读它），故保留在 `status` 列里；
  但本工作区 `pinned`/`archived`/`compacted` **全 0、从未触发** ⇒ 这两态只能用**夹具**测，
  探针输出必须标注「夹具证据 ≠ 真实语料证据」。

### 五、默认值：**不改**（T17-B 只交付「可开」的加速器 + 等价性证据）
- `derivedIndex.provider` 默认仍是 **`"fs"`**：§七的 T17-C 验证矩阵（`fs` / `sqlite` / unavailable / corrupt /
  schema mismatch / source changed / rebuild / 8.8k cold build / incremental）**全部通过之后**才考虑改默认。
- 四态（`ok` / `unavailable` / `corrupt` / `query-error`）在实现里**可判别**：`ok` **包含合法 **（是结果不是错误）；
  `unavailable` 不删任何东西、不重建；`corrupt` 把坏索引**挪走**（`index.sqlite.corrupt-<ts>`）⇒ 下一次调用整体重建；
  `query-error` 只回退本次。**三态不得合并**（第一原则 + `v1.15.95` 的 `error ≠ empty` 教训）。

### 六、证据与可重放（本轮产物）
| 用途 | 位置 / 命令 |
|---|---|
| 规格（D1–D14，权威） | `../.docs/fix/2026-09-16/t17b/DESIGN.md` |
| 成本结构实测（粗信号 / 目录令牌 / 剩余漏洞的前提） | 同目录 `fs-cost-findings.md`（可重放 `.mts`） |
| FTS5 召回等价性（判据 = 丙） | 同目录 `fts5-recall-equivalence.md`（可重放 `.mts`） |
| 8 组反向实验 / canonical diff / 漏斗 / 三基准 | 同目录 `EVIDENCE-TASK.md` 指定的产物（`t17b-*`） |
| 父代理独立验收（改前基线 + 冻结副本 + 四态） | `node ../.docs/fix/2026-09-16/t17b/probe-parent-verify.mts` |
| 一键验收门（含「§二不改的东西」的断言） | `pwsh -NoProfile -File ../.docs/fix/2026-09-16/t17b/gate-t17b.ps1` |

### 七、T17-B 仍未核实（**下一棒别当已验**）
- **真实流量的漏召回率未测**：本工作区 `query-log` 只有 真实 query 且 AND 命中都是 0 ⇒
  「FTS5 会漏」测的是**机制必然漏 + 给定形态漏多少**，不是「真实流量漏多少」。
- **并发 / 多进程**同时读+写同一份索引（busy / 锁 / WAL）**未测**；跨平台（WSL / 容器）锁行为**未测**。
- **外部进程原地改内容**的**实际发生频率**未测（只知道机制上会陈旧）。
- **`scopedFs` 之后 `version` 可用**已实测（`fs-cost-findings.md` A5：逐条 size/version 与 raw 全等）；
  但**非本地后端**（远程 / 隔离）下 `processPath` 是否可用**未实测** —— 该情形按设计走 `unavailable` 回退 `fs`。
- 既有 read 侧 swallow 带来的**两路差异**（`readRel` 读失败当空 ⇒ `fs` 路静默跳过那条；sqlite 路会返回索引里
  上一次读到的内容）**未改**、只登记：方向是 sqlite 返回**更多**，不是漏（`../.docs/fix/2026-09-16/INDEX.md` §3.5 的同类清单）。

## 补记（v1.18.4）：正文引用的 `openclaw` 行号是**快照时**的 —— 补上 pin 与位移表

**触发**：按「材料访问前先查最新」把材料 `openclaw` 从 `c1c870a4` 更新到 `052d26ee`（工作树一并更新）。
更新后逐条核对本 ADR §2 表里的引用 —— 结论：**正文写在 `c1c870a4` 上时全部命中**；
在 `052d26ee` 上 `docs/concepts/memory-builtin.md` 整体**下移 **（插入点在 `:24` 之后、`:117` 之前）：

| 本 ADR 正文引用（`docs/concepts/memory-builtin.md`） | `c1c870a4`（正文写作时） | `052d26ee`（今天） |
|---|---|---|
| `:17-19` 检索 = FTS5 + 向量 + 混合 | ✔ | ✔ `:17-19`（在插入点**之前**，未动） |
| `:24` sqlite-vec **optional** | ✔ | ✔ `:24`（未动） |
| `:117-119` 切块入库 | ✔ | `:120` |
| `:138` debounced reindex（默认 1.5s） | ✔ | `:141` |
| `:141` 可显式 rebuild | ✔ | `:144` |
| `:212-215` Canonical memory remains… | ✔ | `:215` |
| `:249` Stale results? `index --force` | ✔ | `:252` |
| `:259` `### Safe index recovery` | ✔ | `:262` |
| `:285-288` 清缓存只清派生表 | ✔ | `:288` |

`docs/concepts/memory-architecture.md:11,27` 与 `docs/reference/memory-config.md:604,620` **一字未动**（已复核）。

**为什么不改正文**：本 ADR 的状态是「已接受（方向）· 只冻结边界与分期」，正文的行号是**冻结时**的语义
（口径见 `AGENTS.md`「历史文档 vs 当前态文档」表：冻结 ADR **不改正文，写补记**）。
**本补记确立的读法**：正文里所有 `memory-builtin.md` 行号，一律读作 **`openclaw@c1c870a4`** 的行号；
要按现状引用，用上表右列。

**由此立的一条规则**（已写进 `AGENTS.md`「引用纪律」）：**引外部材料的行号，必须同时写下当时 pin 的 `sha`**。
理由就是这次事故的形状：材料是**外部世界**、它会动，而「这条断言建立在哪个版本上」此前
**没有任何机器或文字能回答**。⚠ `audit:docs` 的检查⑥（v1.18.4 新增的引用越界门）**抓不到这一类** ——
它只判「行号越界」，而**下移 不会越界**。⇒ 这类仍然只能人工回头核（同 `AGENTS.md`「材料」节硬边界 2）。

## 补记（`v1.21.30` · **T17-C 验证矩阵**）—— 逐项证据 + 三个基准数字 + 二进程并发读数

> 正文与前面的补记都不改写；本节记 §七 那份 9 项矩阵**逐项的证据落点**，以及 §六 三个数字的**首次在仓内可重放读数**。
> ⚠ 本轮的产物是**证据与矩阵**，**不是**「把 `sqlite` 设为默认」—— 见本节末的决策。

### 一、9 项矩阵：逐项落点（每项都指到**可跑的**东西，不写「已验证」这四个字了事）

| # | 矩阵项 | 证据落点（可跑） | 本次读数 / 结论 |
|---|---|---|---|
| 1 | `fs` | `test/derived-index.test.ts` ①/①b（canonical diff 的对照面）+ 全仓读路径默认 | 默认 provider，**未被改动** |
| 2 | `sqlite` | 同上 ①/①b（两路逐字段比对） | 与 fs 等价（同文件断言） |
| 3 | `sqlite unavailable` | 同 ②a（拿不到宿主路径）/ ②b（模块缺失 / 会话只读） | note 恰一次 + 回退 fs + 不写盘 |
| 4 | `sqlite corrupt`（表缺失 / 坏件） | `core/candidate/sqlite.ts` 的 `readSchema`（表缺失分支）+ ②c | 归 `corrupt` 态 ⇒ 挪走坏件 + 下次整体重建；**表缺失那条分支未单独断言**（诚实标注） |
| 5 | `schema mismatch` | 同 ②c（`index_meta.schema_version='bogus-0'`） | 归 `corrupt` 态，`reason` 点明 schema 版本不符 ⇒ 本次回退 + 挪走 + 下次重建 ⇒ 回到 `ok` |
| 6 | `source changed` | 同 ⑤（新增被看见 / 删除不留幽灵 / **原地改**靠 dirty 兜住 / `verifySources:"full"` 逃生口） | 四条都有断言 |
| 7 | `rebuild` | 同 ②c 的「下一次读整体重建」+ ⑤ | 重建后 `schema_version` = 当前版本、零留痕 |
| 8 | **`8.8k cold build`** | **本轮新增** `tools/derived-index-bench.ts`（合成语料 · 真临时目录 · 真 provider） | 见下表「三个数字」 |
| 9 | `incremental update` | 同 ⑥/⑦（时序：稳态 1 次 listDir、dirty 2 次；反例：不经 dirty 的新增仍被看见）+ 本轮 bench 的 ③ 步 | 见下表 |

### 二、三个数字（§六 要的那三个）——`node tools/derived-index-bench.ts --atoms 8800`

| 场景 | 读数（本机 2026-09-25，合成语料 **8800** 条） |
|---|---|
| ① **cold rebuild**：8800 `.md` → SQLite | **512.6 ms**（`rows=8800/8800` · 索引 **6884 KB** · 801 B/条） |
| ② **startup**：索引已存在 → ready | **68.9 ms**（同一份索引再取一次） |
| ③ **incremental**：+1 新、原地改 1 | **302.5 ms**（`rows=8801/8801` · 改动能被看见 = true） |

⇒ 「默认开是否可接受」这件事在**量级**上有答案了：冷建不到一秒、启动几十毫秒 —— **不是**「启动 DSH 要等十秒」那种形状。

⚠ **边界（不缩小）**：合成语料**内容分布均匀**（每条入口/主题长度几乎一致），真语料更偏 ⇒
耗时只能当**下界量级**；且是**单次运行、无重复取样**、同一台机器。
⇒ 它回答的是**量级**问题（秒级 vs 分钟级），**不是**一个可比的性能基线。

### 三、二进程并发读数（§补记七 明列的「未测」之一，本次测了**同一台机器**这一半）

- 做法：`tools/derived-index-bench.ts` 的 ④ 步 —— 两个**子进程**同时对同一份 `index.sqlite` 调 `provide`
  （两个都 `writable: true`；其中一个是 writer，每 3 轮新增一条）。
  ⚠ 关键更正（本轮实测踩到）：**`writable: false` 不是「并发读」** —— 守卫②（只读会话）会直接返回 `unavailable`
  （那由 `test/derived-index.test.ts` ②b 覆盖），拿它当并发探针**等于什么都没测**。
- 读数（**两次运行，结论不同，都照记**）：
  | 运行 | reader | writer |
  |---|---|---|
  | 合成 **300** 条 | 12/12 `ok` | **出现 `query-error`**（SQLITE_BUSY 一类） |
  | 合成 **8800** 条 | 12/12 `ok` | 12/12 `ok` |
  ⇒ **并发写会撞锁，但是时序相关的**：撞锁被表达成 `query-error`（本次回退 fs + **可见**），
  **不是崩溃、也不是静默空集**（第一原则 `error ≠ empty` 的形状成立）；
  但它**不能靠单次运行断言** —— 这正是「必须多跑几次才能下结论」的一类。
- **仍未测**：跨平台（WSL / 容器）的锁与 WAL；长时间高并发下的退避策略（当前**无重试**，撞了只回退本次）；撞锁的**频率**。

### 四、决策：**默认仍是 `fs`**（本轮不改）

理由不是「矩阵没过」，而是**矩阵的跨平台那一半没测**：§七 的判据原文是「**全部通过之后**才考虑把 `sqlite` 设为默认」，
而 §补记七 列的四条「未核实」里，本轮只关掉了**同机二进程并发**这一条；
**跨平台锁 / 真实流量漏召回 / 外部进程原地改的实际频率 / 非本地后端下的 `processPath`** 仍未测。
⇒ 按判据原文，**不改默认**。改默认需要：跨平台环境 + 真实流量 query-log 样本。

### 五、本轮的诚实标注

- 上表第 4 项「表缺失」分支**没有单独断言**（与 schema mismatch 共用 `corrupt` 处理路径）。
- 三个数字是**单次运行**，且合成语料均匀 ⇒ 不当性能基线用。
- 并发只测了**同机二进程**；`query-error` 的**分布**（哪几轮、多少次）没有做成断言，只打印。

