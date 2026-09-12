# ADR-0078: hl_mem **第三轮深读（首次本地克隆、一手读源码）** —— 三处自我更正 + 门禁生态对照

- 状态：**已接受（2026-09-12）**
- 决定日期：2026-09-12
- 方法：用户 2026-09-12 指令「继续深入研究资料」，并在方法选项中选定「**本地克隆 hl_mem 到工作区**」（此前 0073 / 0076 两轮全程 raw 抓取、**从未克隆**）。
  克隆位置 `G:\project\dsh1\hl_mem`（在 `dsh-shadow` 仓库**之外**，避免把 16 MB 外来代码混进本仓历史）。
  版本：**v1.1.7**（HEAD `aa5d068`，983 commits，1025 files / 16.03 MB）。**全程只读**：未运行、未安装、未修改任何文件、未做 git 写操作。
- 关联 ADR：**ADR-0077**（本轮更正其 D1 的一处**对外来机制的描述**；其结论不变）、**ADR-0076**（第二遍深读；本轮更正其 §1 对 ADR-0004 的**落地形态**判断）、**ADR-0073**（第一遍对标；不吸收项判据不变）、
  **ADR-0072**（台账比事实强 —— 本轮在 hl_mem 身上读到同族现象）、**ADR-0070 / 0063**（判据收一处 / 审计工具标定 —— 本轮在 hl_mem 身上读到反例）、
  **ADR-0069**（两条读路径分歧）、**ADR-0049**（缺件不静默）、**ADR-0059**（不把语义裁决交给 LLM）、**ADR-0061**（取代生命周期 —— D3 的对照面本轮被改写）
- 关联待办：`../BACKLOG.md` 的 **D3**（对照面更新）、**T11①**（首次有了可照抄形态）、**T13 / T14 / T15**（本轮新开）
- 版本：`1.15.39`

## Context

0073 与 0076 两轮深读**都在 raw 文件上做**，因此它们的「未读清单」是**手写的散文**。本轮先做一件此前没人做的事：**以磁盘枚举为基准算覆盖率**。

| 项 | 实测（`git ls-files`） |
|---|---|
| 全仓 | **1025 文件 / 16.03 MB** |
| 本轮之前**从未一手阅读**的面 | **901 文件 / 6.67 MB = 87.9% 文件** |
| 另加 `evaluation/` 绝大部分（67 文件中只读过 2 个 README） | 8.15 MB |

而 0073/0076 的清单**漏了整片**：`docs/research/`(7) · `docs/archive/`(21) · `docs/*.md` 顶层(13) · `docs/dev/`(1) · `docs/benchmark/`(1) · `tests/`(384) · `scripts/`(42) · `src/`(352) · `storage/migrations/`(69)。
**根因**：清单是**手写散文**而不是**从磁盘生成的台账** ⇒ 既不完整、也**无法自证完整**。这与本仓「靠自觉不是闸门」是同一族（ADR-0049 / 0077 D2）。

本轮因此改为**一手读源码**，读到的第一件事就是——**前两轮有三处记述不准**。

## Decision

### D1. 三处**自我更正**（本轮最重要的产出）

#### 更正① 「`assert_transition()` 是写侧守卫」——不准确（更正 ADR-0077 D1）

| 层 | 事实（一手） |
|---|---|
| 守卫函数本身 | `src/hl_mem/lifecycle.py:111-118` 是**纯守卫**：`assert_transition(from_status, to_status)`，不在 `ALLOWED_TRANSITIONS` 就抛 `InvalidTransitionError`。矩阵 `:26-45`：7 个状态 / 16 条允许边 |
| **写原语不强制** | `src/hl_mem/storage/claims.py:160-169` 的 `update_status()`，docstring 写「**校验目标状态后**更新」，实际只做 `ClaimStatus(status)` —— **只校验「这个词是不是合法状态名」，不校验转换**，且**不读当前状态** ⇒ 原理上不可能校验转换 |
| 收口靠**调用点自觉** | 全仓 **28 处**调用 `assert_transition` / `assert_episode_transition` / `assert_valid_{policy,derivation}_transition`，跨 **13 个文件** |
| **至少两处完全绕过** | `workers/deduplicate.py:571-575`（治理**回滚**：`WHERE id=?`、无状态前置条件）；`application/conflict_backlog.py:178-186`（**集合式批量修复**） |

⇒ `hl_mem/AGENTS.md`「**所有**状态变更统一经过 `assert_transition()`」作为**全称命题为假**，作为**多数实践为真**（28 处 vs 2 处绕过）。

**更尖锐的一点**：矩阵里 `SUPERSEDED` / `EXPIRED` / `RETRACTED` **是终态（无出边）**，而 `deduplicate.py` 的回滚通道**必须反向走这些边**（把 `superseded` 写回 `active`）⇒ **矩阵不是「可达状态」的完整真相，它只是「正向可达」的真相**。

**对 ADR-0077 的影响**：其 D1 的**结论不受影响**——「本仓不照搬写侧守卫（因为本仓 `lifecycleOf` 是纯函数、无持久状态机）」**依然成立，且现在理由更强**（对方那条所谓「写侧守卫」本身也没在写侧强制）。要更正的是**对外来机制的描述**，已在 `adr/0077` 落补记。

#### 更正② ADR-0004 的协议在**生产**里是「**窄面 + 默认只建议**」，不是通用细粒度取代（更正 ADR-0076 §1）

| 事实 | 证据 |
|---|---|
| 它**自己说**是窄的 | `src/hl_mem/state_latest_wins.py:1`：`ADR-0004 narrow deterministic latest-wins relation for ``config.version`` |
| 只授权**一个** slot | `:94-95`：`canonical_slot != "config.version"` ⇒ 一律 `compatible`（即**不做取代**） |
| **类型层面只允许一个 slot** | `src/hl_mem/config/models.py:508-510`：`latest_wins_slots: tuple[Literal["config.version"], ...]`；且 `tests/unit/test_config_loader.py:596` 有测试断言「TOML **不能**授权白名单外的 slot」 |
| **默认不执行** | `config/models.py:506`：`latest_wins_mode` 默认 **`"observe"`**；`application/latest_wins.py:50` `actionable = mode == "enforce" and ...`、`:69` 非 enforce 直接 `return`（只写审计，`:52` 记 `"suggested"`） |
| **默认值按破坏性分级** | 同一文件 `:501-504`：`provenance_mode` / `price_target_mode` / `plan_fulfillment_mode` **默认都是 `"enforce"`**，只有 `latest_wins_mode` 是 `observe`、`relation_expansion_mode` 是 `off`（`:512-513`） |
| 每次裁决都留痕 | `application/latest_wins.py:22-32`：`schema_version: "state_latest_wins_audit_v1"` + `applied` vs `suggested` |

⇒ 0076 §1 把它读成「一份**完整的**确定性取代协议（四元坐标 + 六分支 + 九前置 + 八硬否决）」在**文档层面**没错，但**落地形态**是：
**一个 slot、默认只观察、全程审计**。**这实质改写了 D3 的对照面**（见 D6）。

#### 更正③ 路径与计数（更正 0073 / 0076 的记法）

- `specs/`（两轮的记法）实际路径是 **`docs/superpowers/specs/`**（11 篇）。
- migration 数：`hl_mem/AGENTS.md` 写「**57 个 SQL migration（001-057）**」，其 `docs/CHANGELOG.md` 写 **60**；**我实测目录 = 60 个 `.sql`（`001_initial` … `060_event_provenance`）+ 9 个 `.py` = 69 个文件**。
  ⇒ **它自己的 agent 指令文件比事实旧了 3 个** —— 与本仓 ADR-0072（台账「实测」标签比事实强）**同族**。本轮只登记为「文档过期」，不放大（它另有「迁移不可变 + CI」纪律兜底）。
  **附带一条方法教训**：同一目录，子代理数出 **8 个 `.py`**、我实测 **9 个**——差额是 `snapshots/__init__.py`。⇒ **计数差异往往不是「谁错了」，而是「枚举口径没写出来」**（是否含包标记文件、是否递归）。这与 D5 同源，故一并记录。

### D2. 一手读到的「确定性取代」真身（**对 D3 直接可用**）

| 机制 | 证据（`src/hl_mem/state_latest_wins.py`） | 观察 |
|---|---|---|
| 版本量级**只用于相等**，不用于排序 | `:106-108` `old_atom == new_atom` ⇒ `duplicate`（同 evidence）或 `corroborates` | **证实** ADR-0004「版本大小不决定时间方向」——现在有代码证据，不再只是散文 |
| 方向**只由可信事件时间**决定 | `:109-114`：要求双方 `event_time_trusted`；`_parse_time` **要求 tz-aware**（`:167`）；**时间相等 ⇒ `needs_review`**（`:112-113`） | 时间戳必须带时区；并列不猜 |
| `historical_predecessor` **绝不移动 current tip** | `:183` `current_tip_id=existing.claim_id` **恒为旧者** | 「乱序到达不反向关链」在代码里成立 |
| 任何否决 ⇒ `needs_review`（**永不破坏性关链**） | `:96-97`；8 条硬否决 `:122-139`（非 observation / 极性 / 关键锚点 / 非原子多载荷 / 证据未接地 / tip 不唯一 / tip 非 active / 链不无环）；7 条证据否决 `:142-158`（含**冻结的产物契约三元组** `("status_report_v1","hl_mem.report-version-v1","hl_mem")`） | **「错误方向不对称」的代码形态**：证明不了就不关链 |
| 候选发现是**精确坐标匹配** | `:100-104`：`conflict_key=? AND namespace_key=? AND canonical_slot=? AND ... json(qualifiers_json)=json(?)`，**无 FTS / 无向量 / 无编辑距离** | 证实 ADR-0004「候选边界不得被模型扩大」 |
| `conflict_key` 是**派生指纹** | `application/latest_wins.py:99` `json.dumps(astuple(coordinate), separators=(",",":"))` | 证实「不是第五个独立真相」 |
| **有界决策：候选过多即拒判** | `:104` `LIMIT 17` + `:127` `local_snapshot_matches = len(candidates) < 17` | 不是「取前 17 个就算」，而是**取不全就拒判** |
| 决策前**实测无环 + 深度** | `:117-122` recursive CTE 沿 `superseded_by_id` 且 `depth<64` + cycle 检测 | 不变量在**决策时**验，不靠假设 |
| **CAS 失败抛错**（fail-closed） | `:77-80` `.applied` 为假 ⇒ `raise RuntimeError("latest-wins compare-and-set failed")` | 与「缺件不静默」同向 |

### D3. hl_mem 的**结构性门禁生态**（本仓完全没有；`verify` 的下一层形态）

| 门 | 证据 |
|---|---|
| **11 个 `scripts/check_*.py`** | 目录清单：`check_imports` / `check_complexity_budget` / `check_docs_consistency` / `check_config_schema_snapshot` / `check_openapi_snapshot` / `check_mcp_snapshot` / `check_ops_report_schema` / `check_provider_plugin_api` / `check_usage_pricing_schema` / `check_actions_pinned` / `check_wheel_contents` |
| **分层是 AST 检查，不是约定** | `scripts/check_imports.py:12-19` `FORBIDDEN_IMPORTS`（`core` 不得 import `ingest/llm/storage/api/workers/recall/application`；`domain` 不得 import 基础设施；…）；`:61-83` 用 `ast.parse` 扫真实导入；失败 `return 1`（`:116-126`） |
| **复杂度预算是脚本 + 数据** | `check_complexity_budget.py`（16 KB）+ `complexity_budget.json`（2.9 KB）；plans 里写「本期每个热点上限**只能下调**」（`2026-08-30-...-phase-5-architecture.md:20`，子代理回报） |
| **确定性零网络基准门** | `docs/benchmark/core-v1.md:3-8`：「deterministic, public, **zero-network** regression gate … Fake extraction and embedding are fixed by the protocol; **any external model call fails the run**」；`:17-19` 冻结容差（≤`0.01` 回归 / HTTP 100% / forbidden 0 / P95 ≤ `max(baseline+150ms, baseline×1.25)`）；`:21-22`：**功能字段与 hash 必须跨两跑逐字相同**，只允许延迟字段变；基线签入 `benchmarks/release/results/v0.36.1.json` + `compare_core_v1` 子命令 |
| **零 LLM 缝合线冒烟** | `src/hl_mem/evaluation/smoke_full_chain.py:402-403`：`if len(checks) != 13: raise RuntimeError(...)` —— **检查项数量本身是断言**（防协议静默缩水）；`:404-412` 四条 seam 全过才算过，否则抛错；`:415` 产出里显式写 `zero_llm: True` |
| **13 条冻结阈值 + 零容忍 + 可满足性审计** | `src/hl_mem/evaluation/state_experiment_thresholds.py:9-23`（含 `supersede_edge_precision >= 1.0`、`counterexample_cross_coordinate_supersede <= 0`）；`:26-106` 还有**阈值可满足性审计**（成对整数边界求交，不可满足即列冲突并给建议） |
| **三层冻结语料已落地**（非散文） | 我实测 `evaluation/datasets/` 含 `v0300_state_dev_*` / `sealed_*` / `sealed_r2_*` / `sealed_r4_*` 的 corpus+gold+manifest（约 3 MB）；`evaluation/datasets/README.md:3` 记「v1 已在 2026-08-22 首次终验**烧毁**，不得再用于调参、重跑或发布判定，也不得人工读取样本内容」（子代理回报，已抽查该目录实况） |
| **预注册 A/B 协议** | `docs/research/2026-09-04-p1-extraction-ab-v2-protocol.md:3`「状态：装备就绪、**尚未执行**」；`:7` 单变量；`:22-25` 两臂唯一差异 = **一行** diff；`:31-37` 冻结 SHA / 样本量（40 题、16 ingest unit）/「每臂只跑一次、不得看单题结果后调参」；`:39-41`「身份 gate 是**付费调用前置硬门**」；`:73-76` 选臂规则（都满足选**更保守**的；任一臂身份无效 ⇒ **整轮无效**）（子代理回报，ADR-0048 未逐条自查） |

### D4. 本轮**不吸收**（含 hl_mem 自己的坏味道）

| 项 | 为什么不吸收 |
|---|---|
| DB 级不变量（触发器 / 部分唯一索引 / CAS） | 本仓是**文件树**、无数据库；对应物（`_meta.json` 的 `replaceIfVersion`）**已有**（ADR-0068）。**但**「先记账后删除」「删前 fail-closed」「写入者身份参与 CAS」三条**顺序纪律**可移植（→ T13/T14 的评估面） |
| 双时间四列（`valid_from/to` + `recorded_from/to`）与 as-of 查询 | 与 0073 结论一致（本仓无 DB、无 as-of 需求）。**但** `docs/architecture.md:351-353` 的**乱序明文规则**（晚到的旧快照被关闭为 backfill、不得覆盖 current tip）**登记为 D3 的对照**（子代理回报） |
| `conflict_cases` 的状态集 | **在 5 处各写一遍**：`OPEN_CASE_STATUSES` 三份（`conflict_backlog.py:18` / `conflict_queries.py:17` / `conflict_invariants.py:11` 私有副本）+ `TERMINAL_CONFLICT_CASE_STATUSES` 两份（`repair_active_claims.py:38` `frozenset` / `conflict_repairs.py:12` `tuple`）。**当前值一致、类型不同** ⇒ **潜伏漂移面**，正是本仓 ADR-0063/0070 要防的形态。**作为反例记录** |
| `schema_migrations` **无 checksum 列** | `database.py:278-281`（只有 `version` + `applied_at`）⇒ 已应用迁移被**改写无法检测**；它靠「不可变 + CI」纪律兜底。**不吸收其无校验**，反过来支持本仓「派生件带校验」的取向 |
| `evaluation/results/` 的分数 | 我实测该目录**只有一个 `README.md`（2130 字节）** ⇒ LongMemEval 43/50 等**只在索引里，原始结果不在仓**。⇒ **一律不引用为已证**（与 0073 起纪律一致） |
| 它的**归档不承担追溯** | `docs/archive/README.md:28`（**我逐字核实**）：「以上 proposal 均不代表仍在排期；**完成状态和最终行为应从 CHANGELOG、能力矩阵和代码判断**」 ⇒ 归档**明确拒绝**维护「提案是否落地 / 为什么被否」。本仓相反：ADR（不可变决策）+ `BACKLOG`（未完成台账）+ `CHANGELOG`（已做什么）三段式 ⇒ **保留本仓做法**（其 `docs/README.md:38-41`「Accepted ADR 不改写决策；新方向使用新 ADR」与本仓 `adr/0077` 用**补记**而非改写的做法**同构**） |
| 它的**手写归档索引已经漂移**（两处，均我核实） | ① `docs/archive/README.md:10-13` 的 Design 段只列 **2** 篇，而 `design/` 实有 **3** 篇（`extraction-pre-filter.md` **漏收**）；② `:43` 称 `plan-lifecycle-research`「**未实施**…不属于当前路线图」，而 `docs/architecture.md:386` 写「`plan.fulfillment_mode=\"enforce\"` is the released default」（E5 确定性臂过 143 条冻结场景）⇒ **索引结论与现行架构文档不一致**（是否同一能力需读该研究全文；子代理读完判为同一闭环）。⇒ **与本仓 ADR-0075 同一族**：v1.15.35 刚把 `listMemories` 的「排除 `_index.md` 这一个名字」改成「`_` 前缀分类」，正因为**手写/逐名枚举必漂移** |

#### D4b. 一条**新的对照透镜**：`schema 继承` ≠ `运行时契约继承`（**两端均一手核实**）

| 侧 | 证据 |
|---|---|
| 设计要求 | `docs/archive/design/audit-log-design.md:183-191`：`emit()`「**It never opens SQLite** … or waits for capacity on the calling thread」；只做 `queue.put_nowait` + 正常 **<1 ms** 返回；**单独一个 daemon writer 线程**持有独立连接、批量 ≤100 条 `executemany`；溢出时丢最新并记 `dropped_queue_full` |
| 实际落地 | `src/hl_mem/observability/audit.py:44`：「Best-effort **synchronous** SQLite audit writer」；`:144` 在**调用路径上**直接 `INSERT INTO audit_log(...)` |
| 同一份设计的**另一半**却逐字落地 | 其 DDL 与 `src/hl_mem/storage/migrations/004_audit_log.sql` 逐字一致（子代理回报，含 partial index 与 `CHECK (json_valid(detail_json))`） |

⇒ **DDL 被逐字照搬，而「调用线程零阻塞 / 队列 / 独立 writer 线程」的运行时契约被静默放弃。**
**为什么这条对本仓有用**：本仓的审计（ADR-0062 / 0070）一直在问「**机制有没有接线**」，
但没有一条在问「**设计契约的哪一半被静默放弃了**」。以后援引任何设计/ADR 作为对照时，
**继承面必须分开记**：schema / 接口签名是一层，**运行时契约（阻塞性、并发、顺序、失败行为）**是另一层。

#### D4c. 归档/发布面里**可吸收**的四条（子代理回报为主，已抽查）

| 可吸收 | 出处 |
|---|---|
| **归档条目带一句「为什么归档 / 现以谁为准」** —— 21 篇里只有 **3** 篇做到 | `docs/archive/README.md:12-13`（「已实现」/「现以 X 为准」两种标签）、`design/extraction-pre-filter.md:3`（「Core 1.0 已移除此能力…本文仅保留决策背景」）、`releases/v0.20.1:5`、`releases/v0.20.2:14`（回滚理由） |
| **退役路径表 + 启动报错**（「提案被否」的唯一**可执行**档案） | `src/hl_mem/config/loader.py:35` `RETIRED_TOML_PATHS`（含被砍的 `relation.auto_apply_confidence` 等） |
| **弃用纪律：强制前置 + 必须点名替代品或明说无替代** | `docs/compatibility.md:20-29`；同文件 `:33-35` 三档稳定性各有变更预算、`:74-75` 未知版本**显式失败不猜**、`:62-70` 不可逆升级前的恢复集五件套 + **rollback 的数据丢失被显式写出** |
| **破坏性动作二次确认 + 读可重试 / 写不可重试** | `docs/delegation.md:89-91`（`reject_candidate` 必须带 `confirm_retraction: true`，否则 `422` fail-closed）、`:130`（「不要对 POST 配置自动重试，尤其不能重试 reject_candidate」） |

⇒ 落到 **T15**（本仓**没有**任何兼容性/弃用政策文档，而它的公开面是**工具名 + mode 串 + 配置键**，且 ADR-0050 做过一次**硬切旧名**）。

### D5. 方法论更正：**覆盖率台账必须由磁盘枚举生成，不由手写清单生成**

落地：`references.md` 增加**磁盘枚举的覆盖率台账**（每面：文件数 / 字节 / 是否一手读过 / 读到什么边界）。
**这样以后任何一轮都不可能再把「未读清单」写成漏掉整片的样子。**

**自曝（我自己在本轮踩的同一个坑）**：做覆盖率检查时两次用了**未标定**的判据——
① 用**字面路径**匹配 ADR 文本，把 0076 明确写过的 `specs/`（它写作 `specs/` 而非 `docs/superpowers/specs`）判成「**未提及**」⇒ **假阴性**；
② `-like "$p\*"` 里 `$p` 用**正斜杠**、而 `FullName` 是**反斜杠** ⇒ 5 个面匹配到 **0 个文件** ⇒ **假阴性**（第一版台账整个是错的）。
两次都不是工具坏，是**判据没标定就用**——与本仓反复记录的那一族同源。

### D6. 对 **D3** 的影响（只改对照面，**不替用户选路**）

0076 给 D3 的对照面是「有一份 26 KB 的完整确定性取代协议」。本轮把落地形态补上后，D3 的真实对照变成：

| | hl_mem 实际落地 | 本仓现状 |
|---|---|---|
| 取代粒度 | **一个 slot**（`config.version`），类型层面锁死 | 单键（同 `entry`）+ 时间序（ADR-0061） |
| 关链权限 | **只给确定性规则；LLM 永久无资格** | 同（ADR-0059） |
| 默认行为 | **`observe`（只建议，不执行）**，全程审计 | 取代是**读时裁决**、不持久化（ADR-0061） |
| 拒判条件 | 15 条否决 ⇒ `needs_review`；候选 ≥17 ⇒ 拒判；时间并列 ⇒ 拒判 | 并列 ⇒ 不取代（严格 `<`） |
| 失败方向 | 证明不了 ⇒ **不关链**；CAS 失败 ⇒ **抛错** | 缺件不静默（ADR-0049）；并列不取代 |

⇒ **它给出的不是「细粒度取代值得做」，而是「细粒度取代被收窄到一个 slot、且默认只观察，才敢上线」。**
这把 D3 的问题从「要不要三元组」改写成「**要不要为特定 slot 建确定性取代，其余一律 `compatible`（不做取代）**」。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 继续 raw 抓取、不克隆 | 用户已选克隆；且 `src/` 352 文件 raw 逐文件抓不现实——而**正是源码读出了三处更正** |
| 把 clone 放进 `dsh-shadow` 仓库内 | 会把 16 MB 外来代码混进本仓历史。放在仓库**外** |
| 直接跑它的测试/基准来复现分数 | ① 要装依赖、写库，超出「读资料」；② 它的 sealed 语料**明文禁止重跑**（`evaluation/datasets/README.md:3`）。**尊重其语料纪律** |
| 采信 subagent 回报直接写进 ADR | 二手。**头部引用逐条自查**（`core-v1.md`、`ab-v2-protocol`、`smoke_full_chain.py`、`state_experiment_thresholds.py`、migrations 计数、`evaluation/results/` 实况），未自查的**在正文标注来源** |
| 把「57 vs 60 migration」放大成它的大缺陷 | 它另有「迁移不可变 + CI」兜底；**只登记为文档过期**，不放大 |
| 因为「守卫没在写侧强制」就否定本仓 ADR-0077 D1 | 不成立：D1 的结论是「**本仓不照搬写侧守卫**」，该结论**被新证据支持得更强**；要更正的是**对外来机制的描述** |
| 顺手按 hl_mem 的 `scripts/check_*.py` 给本仓加 11 个门 | **过度设计**：本仓无 DB schema / OpenAPI / MCP 契约可快照，11 个里多数无对象。只取**有对象**的两类 → T13 / T14 |

## Consequences

### 正

- 三处更正把前两轮的**推断**换成**源码事实**；其中更正②**实质改写 D3 的对照面**（窄面 + 默认 observe + 全程审计）。
- 找到本仓 `verify`（v1.15.38 刚建）的**下一层形态**：确定性**零网络**基准门（外部调用即失败 + 签入基线 + compare 子命令 + 两跑 hash 逐字相同）、**检查项数量本身是断言**的冒烟、**阈值可满足性审计**。
- **覆盖率台账改为磁盘基准** ⇒ 从机制上防止「未读清单漏整片」再次发生。
- **T11①（评测纪律）第一次有了可照抄的形态**：预注册（先写死判据）+ 单变量 + 每臂只跑一次 + 付费前身份 hard gate + 「任一臂身份无效 ⇒ 整轮无效」。

### 负 / 已知边界

- **仍未运行、未安装、未复现任何分数**；`evaluation/results/` 只有索引 ⇒ **公开读数无法核验**。
- `docs/archive/`（21 篇）与 7 篇顶层文档**由子代理读完并回报**；我最吃重的五条**已逐条自查**
  （归档 README 的拒绝条款与索引漏收、`architecture.md:386`、`audit.py:44/144`、`audit-log-design.md:183-191`、
  `migrations` 计数），其余条目**在正文标注为子代理回报**。
- `tests/`（384 文件）与 `src/` 其余 ~344 个文件**未读**。
- 更正①依赖「**28 处调用点**」的 grep 计数；**未逐条核对**每个调用点在上下文里是否另有前置条件（故措辞用「至少两处完全绕过」，不用「只有两处」）。
- hl_mem 是**别家**：其一切读数**不得当作本系统的证据**（0073 起的纪律不变）。

## 自检

- [x] 与 **ADR-0073 / 0076** 一致：不吸收项（LLM 抽取 / 向量库 / 物理删除 / 双时间字段 / 成熟度等级）**判据不变**；本轮只增补与更正。
- [x] 与 **ADR-0077** 一致：其 D1 **结论不变**，仅落补记更正**对外来机制的描述**。
- [x] 与 **ADR-0072** 一致：把 hl_mem「AGENTS.md 57 vs 实测 60」登记为**文档过期**，不把文档读成事实。
- [x] 与 **ADR-0049** 一致：`evaluation/results/` 只有索引 ⇒ 明确写「**公开读数无法核验**」，不转述为已证。
- [x] 与 **ADR-0063 / 0070** 一致：把 hl_mem 的 `OPEN_CASE_STATUSES` 五处重复**作为反例**记录，而不是当作可吸收项。
- [x] **未冒充**：别家读数一律标注「别家」；未自查的 subagent 条目在正文标注来源。
- [x] **未越权**：D3 决策权仍在用户；本轮只更新对照面。
- [x] **自曝**：D5 记下我自己两次「判据未标定」造成的假阴性。
- [x] **新增透镜**：D4b 记下「schema 继承 ≠ 运行时契约继承」（两端一手核实），并说明它对**本仓既有审计取向**的补充。
- [ ] **未做**：`tests/` 通读；真机复现任何分数；T13 / T14 / T15 的实现。
