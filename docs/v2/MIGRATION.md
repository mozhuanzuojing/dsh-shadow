# dsh-shadow v2 · v1 → v2 迁移

> 面向 v1 使用者与维护者。验收基线见 `PARITY.md`；工具形态见 `LAB.md`；分层见 `ARCHITECTURE.md`。
> 原则：**只增不删、旧存储只读、失败可见、可回滚**。

## 1. 原则

1. `.shadow/atoms/` 与 v1 完全兼容；v2 不重写、不迁移、不删除旧 atom。
2. 旧日期树 `.shadow/<YYYY-MM-DD>/` 与旧 mode 存储**只读**；永不写入、永不删除。
3. `_meta.json` 是 v1 legacy：v2 首次运行一次性导入 SQLite，之后只读、不再写；hits/meta 由 SQLite `meta` 表承担。派生件（`indexes/`、SQLite）可整份重建，重建不读网络。
4. 旧调用不静默落回默认：迁移中的 mode 返回 `MODE_MOVED` 与目标调用示例。
5. v1 配置旧键最多兼容一个 minor，读取时 warn；不做静默语义转换。

## 2. 工具映射

| v1 | v2 | 说明 |
|---|---|---|
| `read_shadow`（62 mode / 133 参数） | `read_shadow`（10 mode / 12 参数） | 日常读取与恢复 |
| 同上 | `shadow_lab`（51 mode / 3 参数） | 研究、边界、写型能力 |
| 同上（`mode:"toolset"`） | `shadow_toolset`（4 参数） | 独立核心工具 |
| `recall_shadow`（query/limit） | `recall_shadow` | `mode:"recovery"` 包装，不变 |
| `shadow_query`（query/scope/limit） | `shadow_query` | `mode:"query"` 包装，不变 |
| — | `shadow_lab` | 新增 |

## 3. 参数映射

**`read_shadow` 12 参数**：`topic` `entry` `mode` `limit` `max_tokens` `debug` `raw` `soul` `taste` `experience` `judgment` `verifyEvidence`。5 核心透镜 = soul/taste/experience/judgment/verifyEvidence；`asOf`/`observer`/`kg` + `identity`/`context`/`project`/`claim` 移入 `shadow_lab.input`。

| v1 | v2 | 处置 |
|---|---|---|
| `topic` / `limit` / `max_tokens` / `debug` / `raw` | 同名 | 保留 |
| `soul` / `taste` / `experience` / `judgment` / `verifyEvidence` | 同名 | 保留（5 个核心读透镜） |
| `entry` | 正式声明 | v1 承诺但未声明；v2 在 episode/decision/task/recovery 一致生效 |
| `identity` / `context` / `project` / `claim` + `asOf` / `observer` / `kg` | `shadow_lab.input` | 移出 `read_shadow`；显式 `PARAM_MOVED`，不静默忽略 |
| 其余 mode 专属参数（from/to/at/…） | `shadow_lab.input.<同名>` | descriptor 校验；未知字段 `INVALID_INPUT` |

**`shadow_toolset`**：`install` `survey` `category` `need`。`install` 是外部副作用，需显式请求与宿主审批。

**`shadow_lab`**：`mode` `input` `write`。写型 mode 必须 `write:true`；不设第二道配置闸。

## 4. mode 映射（62 = 10 + 1 + 51）

**`read_shadow` 10 个核心 mode**

`recovery` · `query` · `episode` · `decision` · `task` · `context` · `knowledge` · `query-log` · `shadow-report` · `shadow-manifest`

**`shadow_lab` 51 个 mode**（分组只用于导航；全集与写面见 `PARITY.md` §5.1）

| 族 | 数量 | v1 mode |
|---|---:|---|
| Observer 内核 | 5 | observer-context / observer-config / observer-boundary / observer-lineage / continuity-index |
| Reflection / Identity / Temporal | 5 | reflection / identity-advance / temporal / timeline / offline |
| Hypothesis / Validation / Evidence | 6 | evidence / validate / verification / real-evidence / real-refer / stability |
| Federation / World / Model | 10 | federation / federation-perspective / federation-diff / distortion / world / world-represent / world-relation / model / model-observation / model-claim |
| Simulation / Action / Agency | 8 | simulate / candidate / execute / feedback / plan / agency-context / agency-select / agency-event |
| Adaptation / Delegation / Horizon | 10 | adapt-context / adapt-change / adapt-validation / delegation-context / delegation-check / delegation-event / horizon-context / horizon-summary / horizon-event / horizon-link |
| Recall 生命周期 | 4 | recall-forget / recall-event / recall-index / recall-validation |
| Workspace | 2 | workspace-context / workspace-record |
| 核心派生 / 诊断 | 1 | index（只读） |

**`shadow_toolset`** 接收原 `mode:"toolset"`，不再作为 mode。

核对：

```powershell
# mode 清单唯一来源：src/contract/modes.ts（10 core + 1 toolset + 51 lab）
```

## 5. `read_shadow` 研究 mode 迁移提示

v1 调用 `read_shadow({ mode: "reflection" })` 时，v2 返回：

```text
MODE_MOVED
mode "reflection" 已迁到 shadow_lab。
改用：shadow_lab({ mode: "<lab-mode>", input: { ... }, write: <按 descriptor> })
写型 mode 必须显式 write: true；只读 mode 传 true 会被拒绝。
```

- 不落回默认召回；不返回空结果冒充成功。
- 未知 mode 返回 `UNKNOWN_MODE` + 最近邻合法 mode。
- 重定向保留一个版本；之后旧 mode 改为 `UNKNOWN_MODE`。

## 6. 配置映射（v1 22 键 → v2 11 键）

| v2 键 | v1 来源 | 说明 |
|---|---|---|
| `shadowRoot` | `shadowRoot` | 不变 |
| `projectRoot` | `projectRoot` | 不变 |
| `capture` | `capture` + `writeConsent` | `capture.mode: "audit"｜"memory"`、`capture.consent` |
| `recall` | `recall` + `summary` + `llmRecall` + `abstracts` + `context` + `knowledgeEngine` + `evidenceProvider(s)` | 召回、摘要、导航、分桶、路径映射、知识检索、证据提供者 |
| `retention` | `retention` | 不变 |
| `forget` | `forget` | 不变 |
| `compact` | `compact` + `episodes` | 收口与 Episode 显示 |
| `index` | `indexEngine` + `derivedIndex` + `projectionStore` + `projectionSpace` | 引擎、派生索引、投影缓存 |
| `telemetry` | `queryLog` | 查询观测 |
| `toolset` | 新增 | 工具集目录/安装策略 |
| `lab` | `observerGlobalRoot` | 研究与观察者面 |

**兼容规则**

- v1 顶层键在 v2 映射到上表新路径；每进程每键 warn 一次：`CONFIG_DEPRECATED: "llmRecall" → "recall.llmRecall"`。
- 兼容只保留**一个 minor**；v2.1 移除旧键解析。
- 旧键与新键同时出现且值冲突 → `CONFIG_CONFLICT`，不猜。
- v1 `knowledgeEngine.enabled` 不是真开关；v2 不迁移该字段，设置了只 warn。

## 7. atoms 兼容

- v2 文件名 `<date>--<HHMMSS>-<entry>--<uid6>.md`；v1 旧名 `<date>--<HHMMSS>-<entry>.md` 继续可读。
- 线索头字段与 v1 一致；未知头字段原样保留；v2 不重写 atom。
- v2 新 atom 只增加可选头字段，v1 读取时忽略未知行；不做批量格式迁移。

## 7.1 迁移工具（v2 Phase 2 已落地）

```powershell
# 默认只读演练：报告 atoms/解析失败/旧日期树/mode 根，不写任何文件
node tools/migrate-v1.ts --from <ws> --dry-run

# 复制到另一个工作区（不删源、不迁旧日期树）
node tools/migrate-v1.ts --from <ws> --to <ws2> --apply

# 原地：备份 .shadow/indexes + _meta.json 后让 v2 重建；atoms 不改
node tools/migrate-v1.ts --from <ws> --in-place
```

- 工具不删除任何 atom / 旧日期树 / v1 mode 存储；`--apply` 只复制 atoms、curated source 与 legacy `_meta.json`。
- 解析失败 >0 ⇒ 非零退出，且不写文件（先修 atom）。

## 8. 派生件重建

```text
# 1) 停宿主（或只读挂载）
# 2) 备份派生件；_meta.json 原样保留（v2 只读导入）
.shadow/indexes/
# 3) 重建：删 indexes/index.sqlite 后下一次读自动重建；无参 read_shadow() 物化 _index.md
rm .shadow/indexes/index.sqlite
# 4) 校验（只读）
shadow_lab({ mode: "index" })
```

- 重建只读 `atoms/`、`roles/`、`affaires/`、`soul/`、`resources/`。
- 重建失败保留旧派生件；不产生半成品。
- SQLite 索引可单独删除；`_meta.json`、旧日期树、v1 mode 存储备份后原样保留、不删除；v2 只读导入。

## 9. 旧存储只读兼容

- v1 日期树 `.shadow/<YYYY-MM-DD>/`：可读、可搜索；**不写入、不删除、不双写**。
- 旧 mode 存储（`shadow/observation/`、`shadow/reflection/` 等）：只读挂载，返回 `legacy: true`。
- 首次读到旧存储时返回一次 `LEGACY_READ_ONLY` 提示；不静默。
- 迁移完成不等于删除旧存储；lab 只写各自 `.shadow/<store>/`，不写 atoms/旧存储。

## 10. 回滚

1. 停宿主 / 禁用 v2 bundle；保留整个 `.shadow/`（v2 只新增，不重写旧 atom）。
2. 切回 `legacy/v1` 或 tag `v1.22.2`，`pnpm install` + `npm run build`。
3. 删除 v2-only 派生（`indexes/shadow-index/`、SQLite 元数据），让 v1 用 `_meta.json` 重建。
4. 启动宿主跑 `read_shadow({mode:"recovery"})` 冒烟；抽 3 条 v1 atom 可读、`.shadow/<date>/` 未改。

回滚风险：v2 写的新 atom 头字段需被 v1 忽略。发布前用固定样本做一次 v1 读取回归。

## 11. 迁移检查清单

- [ ] `npm run verify` 与 `npm run verify:corpus` 均通过。
- [ ] `read_shadow` 10 mode、`shadow_lab` 每族 1 个只读 mode、`shadow_toolset({survey:true})` 冒烟。
- [ ] 写型 mode 缺 `write:true` 返回 `WRITE_REQUIRED`；移出 read_shadow 的参数返回 `PARAM_MOVED`。
- [ ] 旧日期树可读且无写入；`_meta.json` 只导入一次；回滚演练一次。
