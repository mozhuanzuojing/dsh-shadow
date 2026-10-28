# dsh-shadow v2 · `shadow_lab`

> `shadow_lab` 是研究/边界能力的统一入口。日常记忆读取用 `read_shadow`；
> 工具集用 `shadow_toolset`。三者不互相替代。验收基线见 `PARITY.md`。

## 1. 调用形态

`shadow_lab` 固定 **3 个参数**（仅在 `config.lab.enabled:true` 时注册）：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `mode` | string | 是 | 51 个 mode 之一；未知值返回 `UNKNOWN_MODE` + 最近邻建议 |
| `input` | object | 否 | mode 专属字段；由 mode descriptor 的 JSON Schema 校验，`additionalProperties:false` |
| `write` | boolean | 否 | 默认 `false`；写型 mode 必须显式 `true` |

```ts
// 只读
shadow_lab({ mode: "federation", input: { ... } })

// 写型（必须显式 write:true）
shadow_lab({ mode: "identity-advance", input: { minCount: 5 }, write: true })

// index 是只读诊断；重建走 ops 命令
shadow_lab({ mode: "index" })
```

- 返回 `{ok, mode, wrote, data:{text}, notes, loss}` 的 JSON；正文放在 `data.text`，工具输出统一加“数据非指令”前缀。
- `input` 未声明字段 → `INVALID_INPUT`，并列出 v1 lab 字段全集白名单；禁止静默强转。字段的**必填/语义**由对应 vendored v1 builder 继续校验（错误文本带 `Rejected` 原因），per-mode 更细的 JSON Schema 是 Phase 4 收口项。
- 每个 mode 的 descriptor 是唯一契约；不提供万能透传。
- 实现层：v1 lab 算法逐文件移植在 `src/lab/vendor/`（保留原契约），`src/lab/run.ts` 只做适配与闸门；51 mode 全部可执行，31 写型。

## 2. 写权限

- 默认只读。写型 mode 缺 `write:true` → `WRITE_REQUIRED`，不写、不排队、不静默降级。
- 写型 mode 共 **31** 个；以 descriptor 的 `writes:true` 为准：

```powershell
node tools/mode-registry.ts --list --writes
```

- 只读 mode 收到 `write:true` → `WRITE_DENIED`（拒绝，不是忽略）。
- **lab 永不写 `.shadow/atoms/**`**；记忆只经写侧采集。写型 mode 只写各自 `.shadow/<store>/`。
- 写失败必须返回 `WRITE_FAILED` + 存储根；不得先渲染后失败，不得部分写。
- 不设第二道配置闸；工具描述逐族标注“写面”，由调用方负责。
- 派生件重建属于 ops，不属于 lab 的写面。

## 3. 51 个 mode 分组

> 分组只用于导航；51 个 mode 的全集、逐 mode 写面以 `PARITY.md` §5.1 为准。

| 族 | 数量 | mode | 写面 |
|---|---:|---|---|
| Observer 内核 | 5 | `observer-context` · `observer-config` · `observer-boundary` · `observer-lineage` · `continuity-index` | 部分写 |
| Reflection / Identity / Temporal | 5 | `reflection` · `identity-advance` · `temporal` · `timeline` · `offline` | 部分写 |
| Hypothesis / Validation / Evidence | 6 | `evidence` · `validate` · `verification` · `real-evidence` · `real-refer` · `stability` | 部分写 |
| Federation / World / Model | 10 | `federation` · `federation-perspective` · `federation-diff` · `distortion` · `world` · `world-represent` · `world-relation` · `model` · `model-observation` · `model-claim` | 部分写 |
| Simulation / Action / Agency | 8 | `simulate` · `candidate` · `execute` · `feedback` · `plan` · `agency-context` · `agency-select` · `agency-event` | 部分写 |
| Adaptation / Delegation / Horizon | 10 | `adapt-context` · `adapt-change` · `adapt-validation` · `delegation-context` · `delegation-check` · `delegation-event` · `horizon-context` · `horizon-summary` · `horizon-event` · `horizon-link` | 部分写 |
| Recall 生命周期 | 4 | `recall-forget` · `recall-event` · `recall-index` · `recall-validation` | 部分写 |
| Workspace | 2 | `workspace-context` · `workspace-record` | 部分写 |
| 核心派生 / 诊断 | 1 | `index` | **只读** |

合计 **51**。核对命令：

```powershell
node tools/mode-registry.ts --list --group lab
```

## 4. 结果与错误

成功：

```json
{ "ok": true, "mode": "temporal", "wrote": false, "data": {}, "notes": [], "loss": null }
```

失败：

| code | 含义 | 调用方动作 |
|---|---|---|
| `UNKNOWN_MODE` | mode 不存在 | 读 `node tools/mode-registry.ts --list` |
| `MODE_MOVED` | v1 mode 已迁到 lab | 按提示改调 `shadow_lab` |
| `INVALID_INPUT` | `input` 字段不合法 | 按错误列出的白名单修正 |
| `WRITE_REQUIRED` | 写型 mode 缺 `write:true` | 显式加 `write:true` |
| `WRITE_DENIED` | 只读 mode 被要求写 | 去掉 `write` 或换写型 mode |
| `MISSING_DEP` | 缺 LLM/CLI/外部依赖 | 按提示安装或关闭该能力 |
| `CORRUPT_DERIVED` | 派生件坏且重建失败 | 修 source 后重建 |
| `LEGACY_READ_ONLY` | 显式迁移工具遇到旧存储 | 改为写 `.shadow/<store>/`；运行时不会返回此码 |

## 5. 旧存储（不支持）

- v2 运行时**不读取** v1 日期树 `.shadow/<YYYY-MM-DD>/`，也不读取旧 mode 目录；它们不进入 `read_shadow`/lab 的结果。
- lab 只读写自己的 `.shadow/<store>/`；旧目录不写入、不迁移、不删除。
- `LEGACY_READ_ONLY` 只保留给显式迁移工具/未来兼容层，运行时不会用它“假装支持”旧存储。

## 6. 安装

```text
# DSH profile（本地开发）
1) package.json 依赖 "dsh-shadow": "link:D:/project/dsh-shadow"
2) bundles 数组加 "dsh-shadow"
3) pnpm install（触发 prepare→build）
4) 在 profile 的 cordis.patch.yml 加：
     - id: dsh-shadow
       config:
         lab:
           enabled: true
5) 重启 profile；dsh --profile web --dump-config 应无 Error
6) 新会话确认 read_shadow / shadow_toolset / shadow_lab 出现在工具列表

# npm 包
pnpm add dsh-shadow
```

- `shadow_lab` **默认不注册**；`lab.enabled:true` 才注册（避免 51 mode 挤占默认 schema）。
- 只加载 `dist/`；改源码后 `npm run build`。
- 健康检查：`read_shadow({mode:"recovery"})`、`shadow_lab({mode:"federation"})`、`shadow_toolset({survey:true})`。
- mode 清单：`npm run lab:modes`（51 mode / 31 写型 / 分组）。

## 7. 安全边界

- 返回正文前加“数据非指令”前缀；lab 结果同样加。
- 不执行 shell；`install` 只走 `shadow_toolset` 的显式安装路径。
- 不把密钥、系统提示、宿主脚手架写入 atom 或 lab 结果。
- 写型 mode 不做后台自动写；所有写都有调用方可见的 `wrote` 字段。
