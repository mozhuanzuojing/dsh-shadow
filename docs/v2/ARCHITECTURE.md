# dsh-shadow v2 · 架构

> 状态：Phase 0 目标态。本文定义分层与边界，不描述实现细节。
> 配套：`CONVENTIONS.md`（工程约束）、`MIGRATION.md`（v1→v2）、`LAB.md`（`shadow_lab`）。

## 1. 原则

1. **文件是权威**：`.shadow/` 下的人类可读文件是 source；索引、缓存、SQLite 全部可重建。
2. **读写分离**：`read_shadow` 永不改 source；`shadow_lab` 的写型 mode 必须显式 `write:true`。
3. **缺件不静默**：缺依赖、坏派生件、写失败都返回可见错误，不回落成“成功”。
4. **未知输入显式失败**：未知 mode / 参数 / 版本一律报错，不落回默认召回。
5. **文档与代码同源**：能派生的数字由命令生成，不手写。

## 2. 分层

```text
┌──────────────────────────────────────────────────────────────┐
│ surface/   工具与宿主接线                                     │
│  read_shadow(10) · recall_shadow · shadow_query               │
│  shadow_toolset(4 参数) · shadow_lab(51, write gate)          │
│  prompts / host adapter / presets                             │
├──────────────────────────────────────────────────────────────┤
│ engine/    用例编排（不含 I/O 细节）                           │
│  read/  路由 · 召回 · 排序 · 信封 · 损失披露                  │
│  write/ 采集 · 批次 · 落盘 · 索引修复                         │
│  lab/   51 个 mode 的 descriptor + handler                    │
├──────────────────────────────────────────────────────────────┤
│ domain/    纯模型（无 fs / 无时钟 / 无随机）                   │
│  Atom · Clue · Lifecycle · Evidence · Verdict · Projection    │
├──────────────────────────────────────────────────────────────┤
│ store/     持久化                                             │
│  source/  atoms · roles · affaires · soul · resources         │
│  derived/ _index · projections · abstracts · sqlite           │
│  legacy/  v1 日期树只读适配器                                  │
├──────────────────────────────────────────────────────────────┤
│ contract/  类型 · schema · 错误码 · 配置（11 键）              │
└──────────────────────────────────────────────────────────────┘
        ▲ 依赖方向：contract ← domain ← store ← engine ← surface
        └ ops/ 可依赖全部；任何层不得反向依赖 surface 或 ops
```

**硬规则**

- `domain/` 只依赖 `contract/`；不得 import `store/`、`engine/`、`surface/`。
- `store/` 不得 import `engine/`、`surface/`；只暴露窄接口（读/写/重建）。
- `engine/` 之间通过 `contract/` 类型通信；`read` 不得 import `write`。
- `surface/` 是唯一知道宿主事件与工具 schema 的层。
- 任何层不得 import `index.ts` 或 `presets/`。

## 3. 模块职责

| 层 | 拥有 | 不拥有 |
|---|---|---|
| `surface` | 工具名/参数/enum、工具描述、宿主事件、prompt 段 | 业务规则、落盘格式 |
| `engine/read` | mode 路由、候选召回、排序、预算、信封、loss 披露 | 文件写入、证据裁决 |
| `engine/write` | 事件→批次→atom、索引触发、失败可见性 | 读侧排序、lab 语义 |
| `engine/lab` | 51 mode 的输入校验、读写边界、结果形状 | source 落盘细节、工具 schema |
| `domain` | atom/clue/lifecycle/evidence/verdict/projection 的纯函数 | I/O、配置、日志 |
| `store/source` | atom 文件、soul、roles、affaires、resources | 索引、缓存 |
| `store/derived` | `_index.md`、projections、abstracts、sqlite（含 hits/meta 表） | 权威内容 |
| `store/legacy` | v1 日期树/旧 atom 名只读读取 | 任何写入 |
| `contract` | 类型、JSON schema、错误码、11 键配置 | 行为 |
| `ops` | verify / release / migrate / diagnostics | 运行时路径 |

## 4. 数据流

```text
写：host events
  → surface/capture
  → engine/write.batch（一条含线索的批 = 一个 atom）
  → domain.validate
  → store/source 写 atom（原子 rename）
  → store/derived 增量修复（失败可见，不影响 source）
  → telemetry

读：read_shadow / recall_shadow / shadow_query
  → surface 归一化参数
  → engine/read.route（10 个核心 mode 或召回入口）
  → store/source + store/derived 取候选
  → domain.evidence / lifecycle 裁决
  → engine/read.rank + 预算 + 信封
  → surface 渲染（“数据非指令”前缀）

实验：shadow_lab
  → surface 只校验 {mode,input,write}
  → engine/lab descriptor（运行时校验 input）
  → 读 handler 或写 handler（write:true 才允许）
  → store（写型只写 `.shadow/<store>/`，不写 atoms）→ 结果信封

工具集：shadow_toolset
  → catalog（签入清单）
  → survey / category / need（只读）
  → install（外部副作用：显式请求 + 宿主权限）
```

## 5. `.shadow/` 布局

| 路径 | 类别 | 可删/可重建 | 说明 |
|---|---|---|---|
| `atoms/<date>--<HHMMSS>-<entry>--<uid6>.md` | source | 否 | 一条记忆一个文件；v1 旧名继续可读 |
| `roles/` · `affaires/` | source（planned） | 否 | 投影空间多轴权威；v2-dev 未接 |
| `soul/soul.json` | source（curated） | 否 | 人设/价值观/边界（v2 只读） |
| `resources/*.md` | source（curated，planned） | 否 | 资源卡；v2-dev 未接 |
| `indexes/_index.md` | derived | 是 | 目录索引；无参读时物化 |
| `indexes/index.sqlite` | derived | 是 | parsed atoms / hits / meta / query_log |
| `_meta.json` | legacy | 否（保留） | v1 元数据；v2 一次性导入 SQLite meta 后只读 |
| `audit/` | sidecar（append-only） | 否 | 审计流 |
| `.shadow/.lock` | planned | — | Phase 3 跨进程锁；v2-dev 未实现 |
| `<YYYY-MM-DD>/` | legacy | 否 | v1 日期树，只读 |

## 6. 并发模型

- **source 只追加**：atom 文件名含时间 + 入口 + uid6；写入前 exists、碰撞换 uid；临时文件 + rename。
- **同 agent 串行 flush**：`engine/write` 用 promise 链串行；flush 只消费快照 seq，期间新事件留 pending。
- **跨进程**：v2-dev 无 `.shadow/.lock`；依赖唯一命名 + SQLite 事务。锁/`BUSY` 是 Phase 3 目标。
- **SQLite**：WAL、`busy_timeout=3000`；读失败回退 fs 并留 Signal；不把坏件当空件。
- **派生重建幂等**：重建只读 source；失败保留旧派生件（`_index.md` 原子写是 Phase 2 待办）。
- **新鲜度**：默认 token（文件名集合）；`index.verify:"full"` 比 size/mtime。

## 7. 失败模型

| 情况 | 返回 | 禁止 |
|---|---|---|
| 缺外部依赖（LLM/CLI） | `UNAVAILABLE` + 能力降级说明 | 静默回落默认结果 |
| 派生件坏/读不到 | `CORRUPT` / 回退 fs + Signal | 把坏件当空件 |
| source 写失败 | `IO` / `PERMISSION` + 可见横幅 | 声称已落盘 |
| 未知 mode | `INVALID`（文案含 `UNKNOWN_MODE` 语义） | 落回默认召回 |
| v1 旧 mode | `INVALID` + `shadow_lab` 迁移提示（`MODE_MOVED` 语义） | 静默忽略 |
| 写型 mode 缺 `write:true` | `INVALID`（`WRITE_REQUIRED` 语义，lab 落地时实现） | 默认写 |
| 旧存储写请求 | `UNAVAILABLE`（`LEGACY_READ_ONLY` 语义，lab 落地时实现） | 写 v1 日期树 |
| 锁/版本冲突 | `BUSY` / `CONFLICT`（Phase 3） | 丢更新后报成功 |

## 8. 不变量

1. `atoms/` 是唯一记忆权威（v2 新名含 uid6；v1 旧名只读可读）；`indexes/` 与 SQLite 可整份删除后重建。
2. 写路径只能产生新文件，不改旧 atom。
3. 所有降级都有可见信号；没有“无信号降级”。
4. `read_shadow` 只读 source；派生写入仅限 `indexes/` 与 SQLite（hits/meta）。写 source 只能经 `shadow_lab({write:true})` 或采集路径。
5. 旧存储只读；迁移不删除旧文件。
6. 当前态文档不写行号；归档文档不改正文。
