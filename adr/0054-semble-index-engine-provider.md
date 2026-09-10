# ADR-0054: Semble 作为 Index Engine 的第三个候选生成 provider（不进裁决层，v1.15.6）

- 状态：**已接受（2026-09-10）**
- 决定日期：2026-09-10
- 关联 ADR：ADR-0001（不引向量库——本 ADR **承接其 Notes 的口子**，不改其正文）、ADR-0043（Shadow Contract：Atom / Projection / Evidence / Mutation）、ADR-0047/0048（PageIndex / zg 思想，本 ADR 与它们同法）、ADR-0049（缺件不静默）、ADR-0046（Evidence Lineage 计划，Phase 2 Index Engine）
- 关联术语：`../CONTEXT.md`（Index Engine / 候选生成 / Evidence Gateway / 缺件不静默）

## Context

ADR-0001 决定「自建投影文件树，**而非** OpenViking / 向量库」，理由写在 Alternatives 里：OpenViking「语义最强、免维护，但**要额外跑一个重服务（DB / RAG）**，对『agent 缺上下文就去翻』这种低成本诉求**过重**」。其 Consequences 同时承认代价：「**丢失向量 / 语义检索**；主题索引靠文本子串匹配，**对同名跨上下文召回较弱**」。

**该 ADR 的 Notes 明确留了口**：

> 若日后召回不足，可在 `_index.md` 之上**叠一层向量检索**（如 chroma）作为**增强**，而**不推倒文件树**。

现在的候选是 **Semble**（MinishLab/semble，MIT，本地 CLI，`uv tool install semble`，0.5.6）。它与 ADR-0001 当年否掉的方案**同类不同种**：

| 维度 | OpenViking（ADR-0001 否掉） | Semble（本 ADR） |
|------|------------------------------|------------------|
| 形态 | 需常驻的**重服务**（DB + RAG） | **单文件 CLI**，`execFile` 起停 |
| 运行 | 服务 + 存储 + 运维 | 纯 CPU，无 API key、无 GPU、无外部服务 |
| 索引 | 服务侧数据库 | 本地缓存（本机 7 MB，`%LOCALAPPDATA%\semble\Cache`） |
| 语义来源 | 向量库 | **静态** Model2Vec 嵌入（查询期无 transformer 前向）+ BM25 + RRF |

## Decision

### 1. Semble 只接 **Index Engine 的候选生成**层，**不接 Evidence Gateway 的裁决层**

新增 `config.indexEngine.provider = "semble"`（第三个值），与既有 `zg` 分支同形：产候选 → `rankRefs` 词汇级重排 → `authorizeScope` 授权过滤 → **交回 Shadow Core 裁决**。默认值仍是 `fs`（行为不变）。

**为什么不能进裁决层（实测证据）**：Semble **没有「无匹配」信号，也没有阈值参数**。用 4 个中文记忆夹具实测 4 次查询：

| 查询 | #1 | #2 | #3 |
|---|---|---|---|
| 登录无状态的理由 | `auth` **0.009836** | `_index` 0.009677 | `db` 0.009524 |
| 订单索引 migration | `db` **0.009836** | `_index` 0.009677 | `auth` 0.009524 |
| 支付退款（语料里没有） | `db` **0.009836** | `auth` 0.009677 | `_index` 0.009524 |
| 量子纠缠/哈勃常数（无关） | `db` **0.009836** | `auth` 0.009677 | `ui` 0.009524 |

- 分数三元组**逐次完全相同**（`3/305`、`3/310`、`3/315`），只有排序轮转 ⇒ **分数不可跨查询比较**；
- **语料中不存在的话题照样返回最高分** ⇒ **无负信号**；
- `semble search --help` 只有 `-k/--top-k`、`--max-snippet-lines`、`--content`、`--include-text-files` ⇒ **无 `--threshold`/`--min-score`**。

而 ADR-0043 要求「**无证据不返回**」「宁可空，不可编」。**Semble 给不出「空」这个答案**，故它**不能**承担 `verify()`。这与本仓对 zg 的既有定位**逐字同构**：`zg` 是检索层不是裁决层 → **Semble 是检索层，不是裁决层**。

### 2. 语料是**工作区代码**（S1），不是 `.shadow/` 记忆

Semble 的嵌入模型是**代码专用**（`minishlab/potion-code-16M-v2`，tree-sitter 分块）。用它检索 `.shadow/` 的中文散文虽然实测 rank-1 可用（上表第一行命中正确文件），但那是**越出模型训练分布**的用法。本 ADR 只接 **S1：`--content code` 索引工作区**——用语义找回「这条记忆指向的代码」，与 `zg` 同路径。

（中文散文检索质量另有实测记录：**可用但分差极窄**，见本 ADR 的 Consequences。要不要开 S2 是后续独立决策。）

### 3. 缺件不静默（ADR-0049）：`semble` 未装 → `unavailable`，绝不 fallback

`execFile("semble", …)` 抛 `ENOENT` → `{ unavailable: true, reason: "semble_not_installed" }`；超时 → `timeout`。`mode:"index"` 的输出显式标注 `unAvailable(未装，勿当 verified)`。**绝不**静默退回 fs 冒充有候选。

### 4. 必须清洗子进程环境（本机实测的硬约束）

`child_process.execFile` **默认继承父进程 env**。本机 ambient `NO_PROXY` 结尾是 `[::1]`，会让 Semble 的 httpx 在构造 Client 时抛 `InvalidURL: Invalid port ':1]'`（**模型已缓存也照崩**，实测 `exit 1`）。故 provider 在 spawn 时清洗：

> 剔掉 `NO_PROXY`/`no_proxy` 里**带方括号**的条目（通用处理「方括号」这一形状，而非硬编码某一台机器的值）。

### 5. 版本

`1.15.6`（新增可选 provider；不改默认路径、不改 mode 总数、不改召回默认行为）。

## Alternatives Considered

1. **接 Evidence Gateway 的 `verify()`**（复用 `EvidenceProvider` 形状）
   - **否决**：`verify` 必须回答「这条路径是否属实」，而 Semble 只会返回近似命中且无阈值。放进去必然违反 ADR-0049「绝不把缺件/近似说成 verified」——正是上面那组「无关查询也返回最高分」的实测所指。
2. **新增一个 `read_shadow({ mode: "semble" })`**
   - **否决**：本仓有明确纪律——「外部**仍是单一 `read_shadow`**（Query Router 在内部，**别拆 8 个工具炸选择空间**）」，且 mode 已有 61 个。Index Engine 是**既有的**候选生成 seam（ADR-0046 Phase 2），无需新 mode。
3. **改 ADR-0001 正文，把「不引向量库」改写为「不引外部重服务」**
   - **否决（本轮）**：ADR-0001 的 Notes 已留口子，**承接优于改写**；改写会动一条已冻结决策的正文，收益不抵风险。本 ADR 即那条承接件。
4. **同时接 S1（代码）+ S2（`.shadow/` 记忆）**
   - **否决（本轮）**：成本翻倍，且 S2 越出模型分布。先让 S1 跑通。
5. **引入 Semble 的 Python 库 / 常驻 MCP 连接**
   - **否决**：CLI spawn 与 `evidence/zg.ts` 同形，`零`新增运行时依赖与生命周期管理。

## Consequences

### 正
- 补上 ADR-0001 自认的短板（「主题索引靠文本子串匹配，对同名跨上下文召回较弱」），**不推倒文件树**、不改 canonical 事实源。
- 复用既有全部机制：`IndexEngine` 接口、`rankRefs`、`authorizeScope`、`unavailable` 契约、`mode:"index"` 渲染——**新增一个分支，无新 mode、无新工具、无 Store**。
- 边界与 `zg` 完全对称，可被同一套纪律审查。

### 负 / 已知边界
- **引入一个外部 CLI 依赖**（`uv tool install semble`）。未装 → `unavailable`，但**必须由使用方显式开启** `indexEngine.provider: "semble"` 才会遇到。
- **首次使用需下载嵌入模型**（本机已缓存；`uvx --offline` 实测可解析，故冷启动不依赖网络）。
- **中文散文检索虽可用但判别力弱**：上表三次查询的分数**完全相同**，说明该分数在小组语料上不携带跨查询可比的强弱信息。这**正是**把它限制在候选层、不用于置信度的理由；也是 S2 暂缓的依据。
- **Semble 的 `content=code` 默认跳过 `.gitignore` 命中的文件**；若将来要索引被忽略的目录，需 `.sembleignore` 的 `!` 配方（本 ADR 不涉及）。

### 风险
- 若将来有人把 Semble 的 `score` 当置信度用，就重演 ADR-0001 Notes 想避免的事。**缓解**：本 ADR 明确「候选层专用」；`mode:"index"` 的渲染不得输出分数为置信度。

## 自检

- [x] 与 ADR-0001 自洽：**承接其 Notes**（增强层，不推倒文件树），未改其正文。
- [x] 与 ADR-0043 自洽：Semble 不写任何文件（Atom 不受影响）；其索引缓存是**可 `rm -rf` 的 Projection**；`relations` 不变。
- [x] 与 ADR-0049 自洽：未装/超时 → `unavailable` 且**可见**，绝不 fallback 成 verified。
- [x] 与 ADR-0047/0048 自洽：与 zg 同法（检索层 / 裁决层分离）。
- [x] 与「单一 `read_shadow`」纪律自洽：不新增 mode、不新增工具。
- [ ] **未验证**：`--content code` 在大仓库的首次索引耗时；S2（`.shadow/` 语料）未接。
