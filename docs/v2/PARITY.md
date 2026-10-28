# dsh-shadow v2 · Parity 与契约（Phase 0 基线）

> 状态：重写已获批（Phase 0）。本文是 v2 的验收基线：实现与本文冲突时以本文为准；本文与 hard 契约冲突时，先改 ADR 再改本文。
> 证据口径：v1 = v1.22.2（220 产品文件 / 17,640 LOC / 62 mode / 133 参数 / 124 ADR）；行号基于当前工作副本。
> 目标口径：v2 = **4+1 工具 / 21 核心参数 / 10 core mode + 1 toolset + 51 lab mode**（10+1+51=62，无 mode 丢失）。

## 0. 判定词

- **MUST / MUST NOT**：parity 验收硬条件，违反即不通过。
- **SHOULD**：允许偏离，但必须在 `CHANGELOG` 与 ADR 写明理由。
- v1 路径省略仓库根；`file:line` 只用于 v1 证据；v2 模块路径为**拟定**（Phase 1 可调整命名，不得改变本文行为）。

## 1. v2 核心面

### 1.1 工具与参数（21 + lab 3）

| 工具 | 参数（逐个） | 数量 | 覆盖 |
|---|---|---:|---|
| `read_shadow` | `topic` `entry` `mode` `limit` `max_tokens` `debug` `raw` `soul` `taste` `experience` `judgment` `verifyEvidence` | 12 | 10 core mode + 5 core 透镜 |
| `recall_shadow` | `query` `limit` | 2 | `mode:"recovery"` 包装 |
| `shadow_query` | `query` `scope` `limit` | 3 | `mode:"query"` 包装 |
| `shadow_toolset` | `install` `survey` `category` `need` | 4 | 原 `mode:"toolset"` |
| `shadow_lab`（+1） | `mode` `input` `write` | 3 | 51 lab mode |

- **MUST**：`read_shadow.mode` 的 enum 恰为 10 个：`recovery query episode decision task context knowledge query-log shadow-report shadow-manifest`。
- **MUST NOT**：`read_shadow` 再接受任何研究性 mode；命中时返回**显式重定向**（见 §3.2），不得静默落回主题召回。
- **5 个核心读透镜**（非 mode）：`soul` / `taste` / `experience` / `judgment` / `verifyEvidence`；`identity` / `context` / `project` / `claim` 4 个透镜与 `asOf` / `observer` / `kg` 3 个读参数**移入 lab**，经 `shadow_lab.input` 表达，不在 `read_shadow`。
- `entry` 在 v1 是文档已承诺但未声明的参数（`index.ts:182`；`query/reads.ts:118`）；v2 必须正式声明并让 `episode/decision/task/recovery` 一致生效。

### 1.2 10 个 core mode

| mode | 一句话语义 | 主入口 |
|---|---|---|
| `recovery` | Task Recovery Bundle（任务/状态/决策/证据/结果） | `read_shadow` / `recall_shadow` |
| `query` | ShadowNode 跨类型查询（带 evidence） | `read_shadow` / `shadow_query` |
| `episode` | 连续任务 Episode Lineage | `read_shadow` |
| `decision` | 决策血缘（按 entry 聚合） | `read_shadow` |
| `task` | 任务生命周期（ADR-0039） | `read_shadow` |
| `context` | ContextReference（还能不能用） | `read_shadow` |
| `knowledge` | 免向量知识树 + 章节检索 | `read_shadow` |
| `query-log` | Query Observatory 汇总 | `read_shadow` |
| `shadow-report` | Fitness Report（诊断不增强） | `read_shadow` |
| `shadow-manifest` | 记忆树清单/可观测 | `read_shadow` |

## 2. v1 → v2 映射（10 个 core mode）

| mode | v1 实现（file:line） | v2 模块（拟定） | 处置 | 不可变行为 |
|---|---|---|---|---|
| `recovery` | `query/reads.ts:167-199`；`core/view/recall.ts` | `v2/read/modes/recovery.ts` | 合并（复用 bestTask + context refs） | Bundle 段结构；缺灵魂 F2 横幅仅在 `raw!=true`；`raw` 关横幅；命中写 hits |
| `query` | `query/reads.ts:202-258`；`core/view/node.ts` | `v2/read/modes/query.ts` + `v2/kernel/node.ts` | 合并（derive 收口） | scope 枚举；evidence/relations；截断披露；query-log 观测字段与降级留痕 |
| `episode` | `query/reads.ts:107-117`；`core/view/episode.ts:234-289` | `v2/read/modes/episode.ts` + `v2/kernel/parse.ts` | 重写（解析器外提） | 分组键 `project + agent` + `gapMinutes`；title 优先级；memoryRefs；hits |
| `decision` | `query/reads.ts:118-122`；`core/view/episode.ts:304-325` | `v2/read/modes/decision.ts` | 重写（解析器外提） | 按 `byEntry` 聚合；`reason` 绝不补写；source 标签；hits |
| `task` | `query/reads.ts:129-140`；`core/view/task.ts` | `v2/read/modes/task.ts` | 保留 | 生命周期字段；`Outcome≠Success`；不改写记忆 |
| `context` | `query/reads.ts:147-159`；`core/view/context.ts` | `v2/read/modes/context.ts` | 保留 | `subject/value/source/status`（validated/stale/unknown）；`Mapping≠Source Fact` |
| `knowledge` | `query/reads.ts:263-287`；`core/knowledge/*` | `v2/read/modes/knowledge.ts` | 保留 | 免向量树；章节路径引用；LLM 仅选章节，事实仍派生 |
| `query-log` | `query/reads.ts:341-345`；`query/observatory.ts:126-265` | `v2/read/observability/query-log.ts` | 保留（拆存储/聚合/渲染） | total/avg/evidence coverage/type/scope/drift；坏行与读失败披露；「没采集≠读失败」 |
| `shadow-report` | `query/reads.ts:351-360`；`query/observatory.ts:305-391` | `v2/read/observability/report.ts` | 保留 | 四段 + missing types + 「诊断不增强」；报告仍是派生件 |
| `shadow-manifest` | `query/reads.ts:366-369`；`core/manifest.ts` | `v2/read/observability/manifest.ts` | 保留 | manifest 形状；无 manifest 给提示；坏件≠空件 |

## 3. 契约

### 3.1 必须保留的 hard 契约（7）

| # | 契约 | v1 证据 | v2 要求 |
|---|---|---|---|
| H1 | 记忆文件格式：v2 `.shadow/atoms/<YYYY-MM-DD>--<HHMMSS>-<entry>--<uid6>.md`；v1 旧名 `<date>--<HHMMSS>-<entry>.md` 继续可读 | `persistence/files.ts`；`core/retention/memory.ts`；`test/memory-time-single-source.test.ts:93/111/144` | MUST v1 旧文件可读且可反解；v2 新文件 MUST 带 `--<uid6>` 唯一后缀；文件名时间格式不变 |
| H2 | `RECALL_PREFIX`「数据非指令」前缀 | `core/util.ts`；`test/recall-attribution.test.ts:440/478/1056` | MUST 所有读出口以同一前缀开头，逐字不变 |
| H3 | 截断必须自报 | `query/reads.ts` 信封；`retrieval/render.ts:26`；`test/recall-envelope.test.ts` | MUST 四要素：`> 未返回的命中：N 条（命中 M · 本次返回 K）`、`limit=N 上限 M 条`、`> 下一步：`、`> 未返回示例：`；N=M−K；冷却计入 |
| H4 | 数据非指令（护栏） | `security/scrub.ts`；`core/util.ts` | MUST 读侧统一经 `scrubFinal`；不得把记忆文本当指令；注入短语/控制符仍剥离 |
| H5 | 派生件可重建；坏件≠空件 | `persistence/meta.ts`；`test/t8-silent-degradation.test.ts`；`test/manifest.test.ts` | MUST 新 SQLite 仍是派生层；损坏/读失败 MUST 可见；MUST NOT 把坏件渲染成空件 |
| H6 | Forget ≠ Delete | `core/retention/forget.ts:3`；`adr/0031` | MUST 只移出活跃集，文件保留；`_meta.json`→SQLite 后状态/hits 语义不变 |
| H7 | scope 规则 | `core/scope.ts`；`test/fs-sandbox-scope.test.ts` | MUST `shadowRoot/projectRoot` > session cwd > 兜底根；兜底 MUST 可见；读写 MUST 共用同一解析 |

### 3.2 breaking 变更（经 Phase 0 批准）

| # | v1 | v2 | 兼容处理 |
|---|---|---|---|
| B1 | 133 参数 | 21 核心参数（+ lab 3） | **净减 112 = 移除 113 + 新增 `entry` 1**；发布说明 MUST 逐个列出并指向 `shadow_lab`/`shadow_toolset`；旧参数不再被接受（不是静默忽略） |
| B2 | 62 mode 全在 `read_shadow` | 10 core + 1 toolset + 51 lab | `10+1+51=62`；`read_shadow({mode:"<lab>"})` MUST 返回显式重定向到 `shadow_lab`，保留一个版本后再改为未知 mode 失败 |
| B3 | `read_shadow` 承载研究 mode | 不再承载 | 同上；`index` 归 lab；`toolset` 归 `shadow_toolset` |
| B4 | `_meta.json` 元数据 | SQLite `hits`/`meta` 表（派生） | v2 仅一次性导入 legacy `_meta.json`（之后只读、不再写）；`.shadow/atoms` 仍是唯一 source；SQLite 可重建 |
| B5 | 9 个布尔透镜 + `asOf`/`observer`/`kg` 全在 `read_shadow` | 5 个核心透镜（`soul`/`taste`/`experience`/`judgment`/`verifyEvidence`）+ 7 个移入 lab（`identity`/`context`/`project`/`claim` + `asOf`/`observer`/`kg`） | 7 个参数移出 `read_shadow`，经 `shadow_lab.input` 表达；lab 的 51 mode 计数不变 |

## 4. parity 验收

### 4.1 20 查询 × 10 mode 矩阵

> 20 条 fixture / 200 格；不适用的组合标 N/A；Q20 含 report/manifest 两次调用。同一 fixture 在 v1/v2 各跑一次，比较 §4.2 字段。

| # | fixture 输入 | 覆盖 mode | 断言重点 |
|---|---|---|---|
| Q01 | `read_shadow()` 无参 | 默认索引 | 段名/行数披露、预算 |
| Q02 | `topic="<命中>"` | episode/task/query | 排序 rel、计数、标题 |
| Q03 | `topic="<部分词>"` | episode/task | 排序 rel、命中数 |
| Q04 | `topic="<无命中>"` | context/query | 无匹配下一步、近似候选标签 |
| Q05 | `entry="<入口>"` | episode/decision | 过滤一致、rel 列表 |
| Q06 | `entry="<无命中>"` | decision | 空结果语义 |
| Q07 | `mode="recovery", entry="<入口>"` | recovery | entry 过滤、Bundle 段 |
| Q08 | `mode="task", entry="<入口>"` | task | entry 过滤、生命周期字段 |
| Q09 | `raw=true` | recovery | F2 横幅消失、正文不变 |
| Q10 | `debug=true` | query | trace 段、计数自洽 |
| Q11 | `mode="recovery"` 有任务 | recovery | Bundle 段、计数 |
| Q12 | `mode="recovery"` 空 | recovery | 空恢复包提示 |
| Q13 | `mode="task"` | task | 生命周期字段 |
| Q14 | `mode="context"` | context | status 枚举 |
| Q15 | `mode="knowledge"` | knowledge | 章节路径、树形 |
| Q16 | `shadow_query(scope=["memory"])` | query | 类型过滤、evidence |
| Q17 | `shadow_query(scope=["resource"], limit=1)` | query | 截断披露、N=M−K |
| Q18 | `read_shadow(max_tokens=256)` | query/episode | 预算截断、段披露 |
| Q19 | `mode="query-log"` | query-log | total/coverage/drift、坏行 |
| Q20 | `mode="shadow-report"` + `shadow-manifest` | report/manifest | 四段标题、manifest 形状 |

> 5 个核心透镜（`soul`/`taste`/`experience`/`judgment`/`verifyEvidence`）另做 5 条 smoke（不计入 20×10）；`asOf`/`observer`/`kg` 属 lab，不在本矩阵，由 LAB 侧 fixture 覆盖。

### 4.2 比什么 / 不比什么

**MUST 比（逐字或逐值）**

- **排序 rel 列表**：workspace 相对路径、有序；同分 tie-break MUST 与 v1 实测一致（固化为 fixture，不允许 v2 自行改序）。
- **命中/返回计数**：`matched` / `returned`；有冷却/预算时比对 `droppedByCooldown` / `droppedByBudget` / `droppedByLimit`。
- **信封四要素**：§3.1 H3 的四个字面标记；`N=M−K` 恒等式。
- **无匹配下一步**：`> 下一步：` 的四条可执行项；近似候选必须带「近似候选·未验证」；全冷却不得标成近似。
- **section 标题**：H2/H3 标题序列；字面以 v1 fixture 实测为准（已确认：`## Episode · …`、`# Decision Lineage · …`、`# Shadow Query Observatory`、`# Shadow Fitness Report`；其余在 Phase 1 用 v1 输出固化，不凭文档猜）。
- **观测/报告数值**：`total`、`avgCandidate`、`avgReturned`、`evidenceCoverage`、`repeatQueries`/`stableQueries`/`driftQueries`；manifest 的一级键。

**MUST NOT 比**

- 时间戳（`createdAt`/`ts`/文件名时刻，除非文件名格式本身是 H1）。
- 绝对路径（统一归一化为 workspace 相对 rel 后再比）。
- 延迟/耗时、JSON 空白、SQLite 行序、日志行序。
- 非契约措辞微差（同义改写；但 H2/H3 的字面标记不得改）。
- `dist` 产物版本、插件加载顺序。

### 4.3 允许偏差（必须写进 CHANGELOG）

1. **未知 mode 改为显式失败**（v1 静默落回索引/主题召回，违反 `docs/maintainers.md:104/118/130`；见 Phase 0 评审 F-API-01）。
2. **所有 handler 预算生效**：v1 只有主题召回/索引按 `max_tokens` 截断，v2 的 `episode/task/context/knowledge/recovery` 也必须受预算约束并自报。
3. **`recall_shadow.limit` 生效**：v1 实际恒返回 1 个任务；v2 按 `limit` 返回，但默认仍为 1。
4. **`entry` 质量修复**：v1 仅 `decision` 使用 `entry`；v2 在 `episode/task/recovery` 一致过滤，且 `entry` 正式进 schema。
5. **`_meta.json`→SQLite 迁移期**：首次导入前后的 hits/status 只允许导入时延差异；parity fixture MUST 在导入完成后运行。
6. **重定向文案**：v1 无 lab 工具，v2 的「已移至 `shadow_lab`」提示是新文案，不参与 v1 逐字比对。
7. **合成 oracle 的 topic 排序偏差（已实测）**：19 条 topic 查询在 `fixtures/oracle-v1` 上平均 Jaccard **0.890**（阈值 0.85）；`q02`（limit=1，v1 取到不同 top1）、`q07`（shadow 主题，v2 entry/预算归一化后排序变化）、`q10`（决策，v2 不再压平/截断）是已知偏差。只登记、不掩盖；后续若修排序须重录并说明。

## 5. 51 个 lab mode 与 `shadow_lab`

### 5.1 分组（51）

| 族 | v1 mode | 数 | 写 |
|---|---|---:|---:|
| Observer 合成 | `reflection` `identity-advance` `temporal` `offline` | 4 | 4 |
| 假设验证 | `evidence` `validate` `timeline` | 3 | 2 |
| Federation | `federation` `federation-perspective` `federation-diff` `distortion` `stability` `real-evidence` `real-refer` | 7 | 1 |
| Reality Model | `model` `model-claim` `model-observation` | 3 | 2 |
| World | `world` `world-relation` `world-represent` | 3 | 1 |
| Simulation/Action | `simulate` `candidate` `execute` `feedback` | 4 | 2 |
| Planning | `plan` | 1 | 0 |
| Agency | `agency-context` `agency-select` `agency-event` | 3 | 2 |
| Delegation | `delegation-context` `delegation-check` `delegation-event` | 3 | 2 |
| Recall Continuity | `recall-forget` `recall-event` `recall-validation` | 3 | 2 |
| Adaptation | `adapt-context` `adapt-change` `adapt-validation` | 3 | 3 |
| Long Horizon | `horizon-context` `horizon-summary` `horizon-event` `horizon-link` | 4 | 4 |
| Continuity/Verify | `observer-config` `observer-boundary` `observer-context` `observer-lineage` `workspace-record` `workspace-context` `continuity-index` `recall-index` `verification` | 9 | 6 |
| Index provider | `index` | 1 | 0 |
| **合计** | | **51** | **31** |

### 5.2 `shadow_lab({mode,input,write})` 输入约束

- `mode`：闭集 51；未知 → **显式失败** + 最近邻建议；MUST NOT 落回任何默认。
- `input`：object；每个 mode 一份 JSON Schema（registry 持有）；`additionalProperties:false`；必填/类型/枚举不符 → 在任何写之前拒绝；**禁止静默强转**。
- `write`：boolean，默认 `false`；上表「写=1」的 31 个 mode **MUST 显式 `write:true`** 才允许执行；缺失时返回拒绝 + 会写的存储根（`.shadow/<store>/…`），不得部分写、不得先渲染后写失败。
- 只读 mode 收到 `write:true` → 拒绝（不是「忽略」），避免调用方误以为有副作用。
- lab MUST NOT 写 `.shadow/atoms/**`（记忆只经写侧采集）；只允许写各自 `.shadow/<store>/`，且写失败 MUST 同段可见。
- lab 未安装 → 返回显式 `unavailable` + 安装提示；MUST NOT 回退到 core，也不得把空结果说成「没有」。
- lab 的数据迁移只允许显式 `write:true` 操作；v1 存储目录 MUST 可读、MUST NOT 删除。

## 6. v2 不可退让的 10 条行为契约

1. `.shadow/atoms/*.md` 是唯一 source；v2 文件名 MUST 为 `<date>--<HHMMSS>-<entry>--<uid6>.md`，v1 旧名 MUST 继续可读；头字段解析 MUST 与 v1 一致（H1）。
2. 每个读出口 MUST 以 `RECALL_PREFIX` 开头，且「数据非指令」逐字保留（H2/H4）。
3. 截断 MUST 自报四要素，`N=M−K` 恒成立，不得静默丢内容（H3）。
4. 无匹配 MUST 给可执行下一步 + 近似候选（标「未验证」）；全冷却不得标成近似。
5. 坏件 ≠ 空件：读失败/损坏 MUST 可见；不得渲染成「还没有」。
6. 派生件（含新 SQLite 元数据）MUST 可整份重建（命中遥测归零属允许，但 MUST 可见）；写失败 MUST 同段留痕，`console.log` 不算信号。
7. Forget ≠ Delete：只移出活跃集，文件保留；迁移不改语义（H6）。
8. scope 优先级与兜底可见性 MUST 保持，读写共用同一解析（H7）。
9. 未知 mode/枚举/provider MUST 显式失败或显式 `unavailable`；MUST NOT 静默落回默认。
10. 写模式 MUST 显式声明（`shadow_lab write:true` / `shadow_toolset install` 经审批）；写失败 MUST 与成功可区分。

## 附录 A：v1 证据索引（复核用）

- 62 mode 门：`test/recall-envelope.test.ts:104/111`；`CONTEXT.md:92-95`。
- 3 工具名门：`test/host-probe.test.ts:104`；`tools/contract-surface.selftest.ts`。
- 参数/键冻结：`tools/contract-surface.selftest.ts`；`docs/maintainers.md:103/117`。
- 契约登记册：`docs/maintainers.md:98-125`；`adr/0086:57`。
- 记忆格式：`persistence/files.ts`；`core/retention/memory.ts`。
- 信封/前缀：`query/reads.ts`；`retrieval/render.ts:26`；`core/util.ts`。
- 派生/坏件：`persistence/meta.ts`；`test/t8-silent-degradation.test.ts`。
- scope：`core/scope.ts`；`test/fs-sandbox-scope.test.ts`。
- v1 评审：62 mode 清单、import 图、未知 mode 探针见 Phase 0 评审报告。
