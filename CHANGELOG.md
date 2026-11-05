# CHANGELOG

本文件覆盖每个发版；历史在 git tag（ADR-0012）。迁移步骤见 [docs/v2/MIGRATION.md](./docs/v2/MIGRATION.md)，当前实现状态见 [docs/v2/STATUS.md](./docs/v2/STATUS.md)。

## [Unreleased]

（无）

## [2.12.2] — 2026-11-06

### 修复（实机回归 · DSH 0.2.2-rc.1）

- **写入策略根错误导致 audit 流永久 pending**。`Capture.fsFor(id)` 只在 `capture.sessionByAgent`
  里找 session；事件未归属到已知 session 时 `policyFor(undefined)` 会让宿主
  `sandboxPolicy.resolve()` 回退到部署默认策略（`workspace-write` + 部署根，本机为 DSH profile
  目录），于是工作区里的 `.shadow/audit/*.jsonl` 被宿主 fs 沙箱判
  `cannot write "…": file access denied under workspace-write mode`，纯动作批永远留在 pending，
  可见降级信号 `capture.audit`。
  现在：session 缺失时先兜底用 agent 的 session；仍缺失则以**本次写入的工作区**作为
  `workspace-write` 根（只收紧不放宽，不冒充 `danger-full-access`；`read-only` 仍照旧拒绝）。
- 回归测试 `test/failure/capture-policy.test.ts`：用模仿宿主沙箱语义的假 fs（未传策略 → 部署根）
  复现旧行为；修复前该用例断言失败（audit 文件不落盘），修复后通过。
- 实测（本机 DSH 0.2.2-rc.1）：重载后 `shadow` 降级信号消失，`.shadow/audit/<date>.jsonl`
  持续增长（含 `调用 <tool>` 记录），atoms 同步写入。

## [2.12.1] — 2026-11-02

### 修复（review 发现）

- **维护 CLI：manifest 不可信**。原实现只看 `recordHashes`；若 archive JSONL 被删/坏，CLI 仍会把热文件移走（最后一个副本风险）。现在实际读取每个归档 JSONL，建立 rel→digest，并要求 manifest/archive/hot 三方一致；缺失即 conflict，不移动。
- **维护 CLI：trash 清理前验证 archive**。`--purge-trash` 现在只删除 archive 中仍有同 rel 且 hash 一致的旧 trash；孤儿/不一致 trash 保留并计数 `purgeSkipped`。
- **维护 CLI：移动前二次校验 + 路径校验**。plan 后热文件被改会跳过；非法 rel（非 `.shadow/atoms/` 或含 `..`）不处理。
- **写路径 pinned 漏洞**：`archiveAfterFlush` 只读 DB meta，忽略 Source 置顶记录；现在合并 `pinStateBySource`，pinned 不再被写路径归档移走；`loadAllAtoms` 有错误时直接跳过归档。
- 实测：archive JSONL 删除 fixture → `conflicts=1`、移动 0；孤儿 trash → `purgeSkipped=1`、保留；正常 3 条 fixture 仍可 apply。

## [2.12.0] — 2026-11-02

### 新增（独立维护 CLI）

- 新增 [`tools/archive-maintenance.ts`](./tools/archive-maintenance.ts)：在插件沙箱之外显式清理“已归档但仍留在热区”的 Atom。
- 默认 dry-run；`--apply` 才移动；只处理 archive 存在同 rel 且逐条 hash 一致的 Atom；pinned/conflict/not-archived 跳过；移入 `.shadow/.trash/<date>/`，archive 副本保留；`--purge-trash` 清理过期 trash。
- 使用 `node:fs` 是显式用户操作，不改变插件的 fs/sandbox 边界。
- 测试：3 条归档热文件 dry-run→apply 移走 3 条；修改热文件后 conflict=1、apply 不移动。

## [2.11.2] — 2026-11-02

### 修复

- **宿主无 unlink 时不再报“假失败”**：`FsPort` 增加 `canUnlink`；真实 DSH `dsh-fs-local` 只读/写，没有 unlink/rename。`archiveDays` 改为直接写 manifest 并回读校验、保留热文件 + `warnings`；route 显示 `HOST_LIMITED`，不再报 manifest 失败或反复删不掉。
- **GC 能力感知**：`gcDerivedIndexes` 在 `canUnlink=false` 时直接跳过，不再产生大量“宿主 fs 不支持 unlink”降级错误。
- 新增 `MemoryFs({canUnlink:false})` 归档测试：归档副本可写、热文件保留、0 error、1 warning。
- **真实验收发现**：重启后真实无参读暴露宿主 fs 无 unlink，导致归档/GC 报错；本次为根因修复，物理删除仍受宿主能力限制。

## [2.11.1] — 2026-11-01

### 修复

- **C4 误标“被取代”**：真实语料 entry 常是工作区名（`local-workbench`），按 entry 推断会把所有历史标成被最新会话取代。`supersededBy` 改为 **同 entry + 同 goal**；`goal` 为空时只认显式 `> 纠正：`。实测真实 963 atoms 自动取代映射从大面积误标降为 **0**。
- 契约 C4 同步说明；`contract-errors` 的旧版本测试改为显式相同 goal。

## [2.11.0] — 2026-11-01

### 新增（CONTRACT C4/C5/C6 收口）

- **C5 扩展**：`shadow_adjudicate` 增加 `pin` / `unpin` / `retain`；置顶/保留多值都是 Source 记录（`> 置顶：` / `> 取消置顶：` / `> 保留多值：`），读侧 `pinStateBySource` 叠加到 meta，`retain` 抑制自动取代；同秒动作用 `> 裁决序号：` 保证顺序。
- **C6 错误注入**：`test/unit/contract-errors.test.ts` 覆盖假理由/错路径/旧版本/无证据/伪造历史，5/5 通过；旧版本可纠正、撤回。
- **C6 读者盲测 pilot**：新增 `tools/contract-blind.ts`；10 例真实 Atom 由独立 fresh-context 读者作答、独立判卷，均分 **5.6/8（70%）**，reasonFabricated=0、confabulation=0；材料/工具序列漏召回为主要缺口。报告：[CONTRACT-BLIND-2026-11-01.md](./docs/v2/CONTRACT-BLIND-2026-11-01.md)。
- 契约状态更新：C4/C5 已落地；C6 机械基线+错误注入+10 例盲测 pilot 已建立，**全量 30 例/人工复核仍未做**。

## [2.10.0] — 2026-11-01

### 新增（CONTRACT C4/C5/C6）

- **C4 冲突可见**：`supersededBy` 现在返回「旧 Rel → 新 Rel」；topic/query 渲染显示 `⚠被取代→<newRel>`；显式纠正优先于按 entry 推断；旧项仍保留、只降权。
- **C5 用户裁决入口**：新增核心工具 `shadow_adjudicate`（`correct` / `withdraw` / `restore`）；纠正/撤回只追加 Source Atom（`> 纠正：` / `> 撤回：`），旧 Atom 不删除；`restore` 从 archive/trash 复制回热区。
- **C6 机械基线**：新增 `tools/contract-eval.ts` 与 [C6 基线报告](./docs/v2/CONTRACT-BASELINE-2026-11-01.md)：30 Atom（按 entry 分层，排除 `entry=shadow` 元数据）→ Top-8 命中 24/30、证据句柄 30/30、五要素完整度 2.10/5、编造理由 0。
- 工具数 7 → 8（新增 `shadow_adjudicate`）；`test/e2e/toolset-config` 同步。
- 单测新增 `test/unit/adjudicate.test.ts`（纠正/撤回/恢复/可见标注）。

## [2.9.0] — 2026-11-01

### 新增（记忆契约）

- 新增 [`docs/v2/CONTRACT.md`](./docs/v2/CONTRACT.md)：把 v1 的 Atom/Projection/Evidence/Mutation、Recall Continuity、Epistemic Boundary 翻译成 v2 可验收条款（C1–C6）。
- 明确四条底线：源/投影分离、无 evidence 不返回、Recall≠Observation/Forget≠Delete/无 lineage 不 confabulate、不替用户裁决。
- 增加“成功标准”验收协议：30 任务抽样、5 类错误样本、证据句柄解析率、纠正/撤回；明确 **56/56 只是工程门，不是记忆验收**。
- 记录当前缺口：冲突可见性（superseded 只降权不标注）、用户纠正/撤回入口缺失、pinned 无写入口、抽样验收入口缺失。
- `docs-check` 把 `CONTRACT.md` 纳入必需文档与 30KB 预算。

## [2.8.1] — 2026-10-31

### 修复（真实 HostFs 兼容）

- **宿主 fs 无 rename 时归档失败**：`HostFs.rename` 不再直接返回 `UNAVAILABLE`，退化为 `read → write → 回读校验 → unlink`；`atomicRename` 仍为 `false`（不把 best-effort 宣称成原子）。
- **`.trash` 目录创建**：删除热文件前显式 `mkdirp(.trash/<date>)`，避免宿主 fs 不自动建父目录时移动失败。
- 实测（真实 node:fs 包 HostFs、无 rename）：5 条 atom → archive 1 日、manifest 写入、5 个文件进 `.trash`、`loadAllAtoms` 仍 5 条、0 errors。
- 新增 `host-fs` fallback 单测；`npm run verify` **56/56**。

## [2.8.0] — 2026-10-31

### 新增（测试基础设施 P0）

- **并行隔离测试运行器**：`tools/test.ts` 改为异步 worker pool，仍保持“一文件一 node 子进程”（进程级隔离）；默认 `concurrency=min(8, availableParallelism())`。
- 新增 `--concurrency`、`--timeout`（默认 60s，超时杀进程树并返回 124）、`--fail-fast`、`--heavy`（embedding/migrate/plugin 重测试信号量）、`--root`、`--timings`。
- 每文件 stdout/stderr 缓冲后统一打印，避免 `inherit` 并发交错；耗时写入 `.test-timings.json`（gitignore）。
- 每个 worker 独立 `TMP/TEMP/TMPDIR` 临时根并清理，避免临时文件互相污染。
- 实测：56 个测试文件全量串行 **11.4s** → 8 路并发 **3.2s**（含 runner 自测 2s；不含自测的 55 文件约 **9.5s → 1.5s**）；`unit/test-runner.test.ts` 覆盖并发、失败非零、超时杀进程、耗时文件。

## [2.7.1] — 2026-10-31

### 修复（重启后真机发现）

- **`shadow_query` 证据路径**：输出使用 `archiveRel`（`.shadow/archive/<date>.jsonl#<rel>`）而不是已删除的热文件路径；新增 `test/unit/query-handle.test.ts`。
- **写路径归档 single-flight**：capture `afterFlush` 增加 `archiveInFlight` 互斥；锁被占用（并发读/写归档）不再误报 capability degraded，只跳过本轮，下次重试。
- 真机验证：`read_shadow`/`shadow_query` 返回 `archive` 锁占用 Signal（v2.7.0）；本版修复后需重启复验。

## [2.7.0] — 2026-10-31

### 新增（review P1）

- **`.trash` 保留期**：删热文件改为移入 `.shadow/.trash/<date>/`，默认保留 7 天；每次归档清理过期目录（`purged` 计数）。`trash:false` 可回退直接 unlink。
- **写路径触发归档**：capture 成功写 atom 后触发 `afterFlush`（60s 节流），不再只依赖无参 `read_shadow`。
- **decision/episode 路径句柄**：`EpisodeDecision/EpisodeAction/DecisionEntry/TaskView.decisions` 带 `archiveRel`；渲染优先显示归档句柄。
- 真实 2026-10-31 日切：137 条 10-30 atoms 归档 + 移入 `.trash/2026-10-30`；`.shadow/atoms` 只剩当日 1 条；`loadAllAtoms` 922、IndexCache 第二次 `source=db`。

## [2.6.0] — 2026-10-30

### 修复（review P0）

- **删除前逐条 hash 校验**：旧 archive 的 rel+uid 集合不再被信任；比较 `digestAtom`（规范化 JSON，忽略 `archiveRel`）。迟到 atom/同 uid 内容变化会**先补写 archive**，校验通过后才删热文件；内容变化以当前热版本为准。
- **热文件优先**：`loadAllAtoms` 先 archive 后 hot 覆盖；`IndexCache` 校验 DB 归档行与 manifest `recordHashes` 一致，不一致回退重建。
- **坏归档部分可用**：`loadAllAtoms` 收集坏档为 `errors` 返回热+好归档；`IndexCache` 在部分失败时不 replaceAll（避免丢历史），route 显示 partial Signal。
- **锁/manifest 原子性**：全局 run lock（owner token，只释放自己的）；manifest 先写 `.tmp` 再 `rename`；删除在 manifest 原子替换成功后才发生。
- **pinned 不删**：`archiveDays` 接收 pinned rel 集合；pinned 可归档但不删热文件。
- **路径句柄**：归档 atom 带 `archiveRel`（`.shadow/archive/<date>.jsonl#<rel>`）；`atomDisplay` 优先显示 archiveRel；DB 路径从 `archivedIndex.byRel` enrich。
- 测试新增：迟到 atom、内容变化、热优先、pinned、坏归档部分可用；复现脚本对应 3 个缺陷均通过。

### 已知边界

- decision/episode 的部分路径展示仍未全部切换到 archiveRel；无 `.trash` 保留期；锁/断电未做真实多进程故障注入。

## [2.5.0] — 2026-10-30

### 变更

- **按日归档默认删除热文件**：无参 `read_shadow` 归档 `date < today` 的 atoms 后，校验 JSONL（行数/uid/sha256）、登记 manifest（含 `rels`），再删除对应 `.shadow/atoms/` 热文件；`.shadow/atoms/` 预期只剩当日。
- **冷区重建路径**：新增 `archivedIndex()`（manifest/JSONL 轻量索引）与 `loadAllAtoms()`（热 + 全部归档）；`IndexCache` 的 DB 校验改为“DB names = 热文件 ∪ 归档 rels”，DB 丢失时自动从 archive 重建，坏归档显式失败不静默丢历史。
- **实测**（本机 784 条历史）：删除 784 个热文件；`.shadow/atoms` 906→131（仅当日）；`loadAllAtoms` 重建 915 条（含会话新增）；第二次 `IndexCache.load` 走 `source=db`。
- 测试：`archive.test.ts` 增加 `deleteHot` 后热文件删除、`loadAllAtoms`/`archivedIndex` 重建、重复删除不报错。

## [2.4.0] — 2026-10-30

### 新增

- **按日归档（安全版）**：无参 `read_shadow` 把 `date < today` 的 atoms 写成 `.shadow/archive/<date>.jsonl`（完整原文）+ `<date>.md`（人读导航），回读校验行数/uid/`sha256` 后登记 `_index.json`；带 `.shadow/.archive.lock` 互斥，锁占用/校验失败可见且**不删热文件**。`atoms/` 这一版一个文件都不删；删除热文件留作后续独立步骤。
- **P0 记忆体量治理**（2026-10-30）：
  - **`maxActive` 默认 2000**：活跃集超出后按最旧移出（标 `archived`），**文件不删**（Forget≠Delete）；`minHits=0` 仍表示陈旧类遗忘默认关闭。
  - **派生件 GC**：无参读物化后清理本轮 plan 不再产出的四类派生卡，并把每个 `*.history/` 收敛到最近 2 个版本；v1 遗留 `projections/` 不删。删除量/失败以 Signal 披露。
  - **解析缓存**：`IndexCache` 在文件集合未变时复用已解析 atoms，避免每次 `read_shadow` 重复 `allParsed()`；DB-first 语义不变，atoms 仍是权威。
  - 测试：`test/unit/gc.test.ts`（孤儿卡/history/缺目录/v1 projections 不受影响）。
- **Cursor 式代码索引**（ADR-0021）：`search_code` 使用持久索引 `.shadow/indexes/code/search-index.json`——tree-sitter **语法块**（function/class/interface…，超 1500 字符递归拆）、**增量刷新**（size+mtime 未变不读内容）、**trigram 候选裁剪** + BM25；索引不可写/异常时回退实时扫描。`maxChunks=20000` / `maxBytes=16MB` 兜底。
- **内置本地向量**（ADR-0022 修订）：参考 Cursor 用**真模型**——默认 `Xenova/multilingual-e5-small`（transformers.js + ONNX，q8，中英混合），首次使用自动下载并缓存；无网络/失败自动回落 512 维特征哈希（标注「子词近似、非语义」）；`provider: auto|local|hash|http`。神经索引**异步后台构建**，首次查询不阻塞 BM25/符号。
- **去掉功能开关**（ADR-0023）：`lab.enabled` / `toolset.enabled` / `autoRecall.enabled` / `codeSearch.index.enabled` / `codeSearch.embedding.enabled` 全部删除，功能始终启用；旧键只产生未知键 warning，不能关闭功能。
- **评审修复**：异步向量构建失败改为**可见 + 60s 退避**（不再永远「构建中」）；`auto` 真正按 HTTP→本地神经→哈希逐级降级（`embedder-chain`）；代码索引 `maxFiles` 截断显式披露；符号段复用索引 AST 块（去掉二次解析）；模型缓存移到 `~/.cache/huggingface`。
- **P2 去冗余**：向量索引复用代码索引的 AST 块与 root（去掉二次 walk/解析，embeddings.json 不再存全文）；移除未用的 `onByDefault`；ADR 注明「候选集内 BM25」口径。
- 测试：`test/unit/trigram.test.ts`、`ast-chunk.test.ts`、`code-index.test.ts`（无变化 0 重读 / 改一文件只重读 1 个 / 候选裁剪）、`local-embedder.test.ts`。

## [2.2.0] — 2026-10-30

记忆与代码检索版：相似任务召回、项目事实、技能卡物化、自动召回，以及 `search_code`（BM25 + tree-sitter 符号 + 可选 embedding）。

### 新增

- **`search_code(query, limit)`**：工作区代码只读检索（core 工具 5→6）。
  - BM25（标识符/路径片段 + 中文 2-gram），返回 `文件:行号` + 命中行片段；预算 1500 文件 / 单文件 200KB / 总 8MB，超限显式披露。
  - `.gitignore` 感知（简化实现：`*` `**` `?`、锚定、取反、目录）+ `codeSearch.exclude`；`useGitignore` 默认开。
  - **tree-sitter 符号**（`web-tree-sitter@0.20.8` + `tree-sitter-wasms@0.1.13`）：抽 function/method/class/interface/type/enum/struct/trait/impl/const（带行号），并入 `search_code` 的「符号（定义/入口）」段；依赖缺失/加载失败显式 `不可用`，不影响 BM25。
  - **embedding 语义管线**（`codeSearch.embedding`，默认关）：`.shadow/indexes/code/embeddings.json` 派生索引、内容 hash 复用、`sourceSig`（stat-only：rel+size+mtime）变化重建、进程内缓存；无 provider 时显式 `不可用`。
- **`recall_similar(query, limit)` 与相似任务召回**：任务卡（请求/决策/结果/教训/来源）按相关+新近+重要性召回；`read_shadow` 增加 `facts` 透镜与 `similar` 分支。
- **技能卡物化**：任务卡 → 可审 `indexes/skills/<slug>/SKILL.md`（幂等、有界、只读投影）。
- **`facts` 视图**：从用户原话抽取「X 是/=/：<路径>」项目事实，带证据校验状态。
- **auto-recall（默认关）**：`autoRecall.enabled` 开启后每步在 runtime context 注入极小「可能相关任务」提示（数据非指令、带技能指针、硬预算）；`turn-stopping` 缓存任务卡、`session/event` 记录最后 query；文件探针真机验证通过。

### 行为变化（升级注意）

- **新增运行时依赖**：`web-tree-sitter@0.20.8`（MIT）+ `tree-sitter-wasms@0.1.13`（Unlicense，解包约 52MB）；已提交 `package-lock.json` 与 `THIRD_PARTY_NOTICES.md`。**版本被 wasm ABI 钉死**，升级需同步重建语法。
- `search_code` 默认跳过 `.git`/`node_modules`/`dist`/`asar`/`third_party` 等目录，并尊重工作区根 `.gitignore`；`codeSearch.exclude` 可追加。
- `autoRecall` 与 `codeSearch.embedding` 均**默认关**；embedding 真机依赖 OpenAI 兼容 `/embeddings`（本机 magpie 网关返回 500，语义检索不可用，已如实披露）。

### 验证

- `npm run verify`：**46/46** 测试（新增 code-search / symbols / ignore / embedding / embedder-http / search-code-tool / auto-recall 等）；audit-layers 198 文件；docs-check ADR 20。
- 真机/验收：两真实仓库 6 条查询验收（含 exclude 复验）、embedding 不可用路径、auto-recall 文件探针真机确认；性能实测热查询 **0 次内容读取**（`_reports/embedding-perf-20261030.md`）。

### 已知限制（2.2.0）

- embedding 真机 provider 缺失（网关 `/v1/embeddings` 500）；语义检索未在真机可用。
- `sourceSig` 用 rel+size+mtime：同尺寸且 mtime 被保留的编辑不会触发重建（罕见）。
- 符号抽取对极常见词（如 `tree`）可能轻度误命中；`obj` 仍按构建目录跳过。
- 每次 embedding 查询仍有 stat 遍历（336 文件 ≈16ms，无内容读取）。

## [2.1.0] — 2026-10-28

工程缺口收口版：影子工具集从占位变成真实台账，遗忘契约落地，派生件开始物化，lab 输入契约按 mode 拆开并加固写边界。

### 新增

- **shadow_toolset 真实台账**：107 条能力目录（provider 2 + reference 105 · 17 分类）；`survey`/`category`/`need` 只读探测（默认只探插件内接线项，`survey:"all"` 才全探）；`install` 显式请求 + 宿主 `allowed-once` 审批 + 安装后重探，新增 `no-recipe`/`unverified` 状态，拒绝路径一律给可复制命令。
- **forget / retention / compact 接线**：新增 `domain/lifecycle.ts`；读时裁决状态类（archived/superseded/compacted）、陈旧类（`age>=staleDays && hits<minHits`）与 `maxActive` 上限，移出活跃集并在输出披露「条数/原因/未删除（Forget≠Delete）」；`shadow-manifest`/`shadow-report` 披露活跃 vs 已遗忘。`retention.*` 本已接在召回打分，`compact.gapMinutes` 本已接在 Episode 边界。
- **派生件物化**：无参 `read_shadow` 时物化 `indexes/{materials,affaires,episodes,abstracts}`（确定性：只由 atoms + `compact.gapMinutes` 决定，无时钟/随机；内容不变不写；预算截断在索引输出披露；写失败留 `index.derived` Signal、不阻塞读；atoms 零新增）。
- **lab per-mode JSON Schema**：`src/lab/schema.ts` 覆盖 51/51 mode（200 字段条目 / 134 唯一字段 / 30 必填条目 / 8 枚举 / 4 permissive）；未知字段错误列出**该 mode** 允许集；类型/枚举/必填显式拒绝，不做静默强转。
- **lab 写边界加固**：lab fs 门面对 `.shadow/atoms` 的任何写入一律 `WRITE_DENIED`（不只靠字段校验）；`workspace-record.kind` 锁形态（禁 `../`、路径分隔符、保留目录）。
- `toolset.enabled:false` 不再注册 `shadow_toolset`；`normalizeConfig` 移除 forget/toolset 的「尚未接线」warning。

### 行为变化（升级注意）

- **lab 输入契约收紧**：20 个 mode 现在有必填字段（此前空 input 也能执行）；未知字段只允许该 mode 的字段表。此前被放行但无人读取的 20 个 v1 core 参数（`topic`/`limit`/`asOf`/`observer`/`soul`/`taste`/…）现在 `INVALID_INPUT`；v1 会静默回落的枚举值（offline trigger、horizon-summary accessibility、recall-event accessibilityBefore/After）现在显式拒绝。
- **forget 默认不启用**：`minHits=0` / `maxActive=0` 表示关闭对应判据（v1 的 `minHits=0` 是非法值回落 1）；默认不改变召回面。meta 缺失（只读沙箱/索引不可用）不做陈旧类遗忘。
- **派生件写入**：无参读会写 `indexes/`（首次最多 68 个文件）；派生件无 GC，删除 `indexes/` 可整份重建。
- **工具集安装**：`install` 仍只在显式调用时发生，且必须拿到宿主 `allowed-once`；装后重探未检出时返回 `unverified`（不宣称成功、也不断言失败）。

### 验证

- `npm run verify`：34/34 测试（新增 toolset 4+1、lifecycle/forget 2、derived 1+1、lab-schema 1、lab-write-guard 1、toolset-config 1）；audit-layers 184 文件；docs-check 绿。
- 单测/e2e 均为假 runner / 假 approval / MemoryFs 或临时目录，不真装软件、不碰真实 `.shadow`。

### 已知限制（2.1.0）

- `shadow_toolset` 真机安装路径未验证（测试用假 runner）；台账是 v1 2026-09 快照，不是本机实测；非 Windows 下 winget-only 条目的处置未测。
- lab 与 core 仍同包；拆 `dsh-shadow-lab` 属 breaking，设计与迁移见 ADR-0013（未执行）。
- `model-claim.validations` 恢复可达（v1 已知语义缺口：outcome 由调用方给，未与 `.shadow/validation` 交叉核对），schema 里标 permissive 并写明风险。
- 派生件无 8k 语料 perf 基准；真实只读沙箱下的派生写入未真机验证。

## [2.0.0] — 2026-10-28

v2 重写首发：**atoms 是唯一权威，派生索引可整份重建，降级可见**。core 10 mode 常驻，研究面 51 mode 收进可选 lab。

### 破坏性变更（breaking）

- **工具面拆分**：v1 的 62 mode / 133 参数拆为 core 10 mode + 51 lab mode + 独立 `shadow_toolset`；`read_shadow` 12 参数，研究类 mode 移入 `shadow_lab({mode,input,write})`。旧 mode 调用返回显式 `MODE_MOVED`/`UNKNOWN_MODE`，不静默落回默认。
- **旧存储不在 v2 数据面**：运行时只读 `.shadow/atoms/`；v1 日期树 `.shadow/<YYYY-MM-DD>/`、旧 mode 存储与 `_meta.json` **不读取、不导入**（旧数据不做支持，属明确决策）。需要旧语料时用显式工具 `tools/migrate-v1.ts`（dry-run / copy / in-place，备份后不删旧文件）。
- **配置不静默兼容**：v1 旧键的 warn 兼容尚未实现（见 STATUS 未完成项）；映射表见 MIGRATION。
- **命中/状态从空开始**：v2 不导入 v1 `_meta.json` 的 hits/status。

### 新增

- **core 10 mode**：`recovery` `query` `episode` `decision` `task` `context` `knowledge` `query-log` `shadow-report` `shadow-manifest`；4 工具 schema 合计 2,538 字符。
- **可选 lab**：51 mode / 31 写型 / 9 分组，`lab.enabled:true` 才注册；只读带 `write:true`、未知 mode/字段均显式拒绝；写型只落 `.shadow/<store>/`，**从不写 atoms**。
- **宿主 fs 接入**：生产走 `ctx.get("fs")`（`HostFs` 惰性解析），写入带会话 `sandboxPolicy`；缺 fs 服务显式不挂载，不回退 `node:fs`。
- **DB-first 读**：parsed JSON 入 SQLite，1k warm 7ms/query 26ms、8k warm 67ms/query 106ms（合成语料）；新鲜度默认按文件名集合，`index.verify:"full"` 比 size/mtime。
- **可核查与降级**：每条记忆带路径句柄与证据指针；读/写/索引失败产生 `Signal`（恢复后清除，空 ≠ 失败）；`audit/` 记录动作，`_index.md` 无参读时物化。
- **采集正确性**：atom 唯一命名（`<date>--<HHMMSS>--<workspace>--<uid6>.md`）、同 agent 串行 flush + 快照 seq、失败 pending 保留重试；无工作区拒绝落盘。
- **验收资产**：v1 oracle 冻结语料 + parity（19 查询平均 Jaccard 0.890，阈值 0.85）；`tools/migrate-v1.ts`；`tools/mode-registry.ts`；`npm run verify` 自包含 22/22。

### 移除

- v1 日期树读取路径、`_meta.json` 运行时导入、`LEGACY_READ_ONLY` 相关逻辑（提交 `c09f42e` 已 revert，见 `eaf24ab`/`e9610ad`）。
- v1 的 62-mode 单工具面（拆分见上）。

### 已知限制（2.0.0）

- `shadow_toolset` 显式返回 unavailable（Phase 1 未移植台账；不探测、不编造命令）。
- 派生件只物化 `indexes/_index.md`；材料卡/纪要/Episode/abstracts 仍在读时内存派生。
- `forget`/`retention`/`compact` 配置存在，行为未接。
- lab 为同包 `src/lab/vendor/`（142 文件闭包），ADR-0012 规划的独立包 `dsh-shadow-lab` 未落地；per-mode JSON Schema 未拆分（共享 v1 字段并集白名单）。
- 跨进程 `.shadow/.lock`、`index.provider:"fs"`、query-schema 版本、H3 预算计数未收口。
- **npm registry 未发布**：本版以 git tag `v2.0.0` 发布；`pnpm add dsh-shadow` 需等 registry 发布后成立（安装见 README）。

### 验证

- `npm run verify`：22/22 测试（unit/failure/parity/e2e）+ audit-layers 175 文件 + docs-check。
- 真机验收：DSH 0.2.1-rc.3 下，headless profile（`v2test`）与真实 Web profile（`v2web`，隔离 `DSH_HOME`）均完成真实模型会话：`read_shadow`/`recall_shadow`/`shadow_query`/`shadow_lab` 可用、`shadow_toolset` 显式 unavailable、atoms/audit/index/SQLite 落盘；并完成卸载 → 无工具/无采集 → 恢复 → 工具回归的回滚演练。
- 发版门：`npm run verify:release`（verify + 版本三处 + 构建产物 + npm pack 内容 + tag 指向 + 工作树干净）。

### 安装

```powershell
# 本地 link（开发态 / 本机验证）
# profile package.json: "dsh-shadow": "link:D:/project/dsh-shadow"

# 或从 tag 构建 tarball
git checkout v2.0.0
npm install; npm run build; npm pack   # → dsh-shadow-2.0.0.tgz
# profile 内：pnpm add file:<path>/dsh-shadow-2.0.0.tgz
```
