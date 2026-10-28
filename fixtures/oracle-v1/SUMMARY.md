# dsh-shadow v1 oracle · SUMMARY

- v1 基线：`D:\project\local-workbench\_work\dsh-shadow` · commit `e755b32407a0d5f236c6e5c34ca2235fdf58ca57` · version `1.22.2`
- 冻结时钟：`2026-09-06 12:00:00`（本地时间；语料日期 2026-09-01…09-05）
- 语料：52 个文件（30 atoms + 20 evidence + `_meta.json` + `query-log`）/ sha256 `03db4d590c9f356c33552e5c5dfd01696bb18183ab3220262ea32edb25cd02ed`
- 语料夹具：`D:\project\dsh-shadow\fixtures\oracle-v1\corpus`（逐文件同路径、同内容；manifest `corpus_root = "fixtures/oracle-v1/corpus"`）
- 运行：**200** 条（20 查询 × 10 mode）· ok **200** · error **0** · skipped 0
- 输出目录：`D:\project\dsh-shadow\fixtures\oracle-v1`

## 重放命令
```powershell
cd D:\project\local-workbench\_work\phase0\oracle
node run-oracle.ts            # 覆盖生成夹具
node run-oracle.ts --repro    # 额外跑第二遍并逐条比对（写入 manifest.repro）
```

## 每条 mode 的读数

| mode | runs | ok | error | 平均字符 | 最小 | 最大 | 无匹配 | 截断披露 | 分层省略 | F2横幅 | 降级横幅 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `topic` | 20 | 20 | 0 | 1738 | 262 | 4901 | 1 | 5 | 6 | 18 | 0 |
| `recovery` | 20 | 20 | 0 | 663 | 257 | 901 | 0 | 0 | 0 | 20 | 0 |
| `episode` | 20 | 20 | 0 | 1378 | 79 | 7623 | 3 | 0 | 0 | 0 | 0 |
| `decision` | 20 | 20 | 0 | 604 | 150 | 2864 | 0 | 0 | 0 | 0 | 0 |
| `task` | 20 | 20 | 0 | 1141 | 73 | 8172 | 3 | 0 | 0 | 0 | 0 |
| `context` | 20 | 20 | 0 | 920 | 80 | 7464 | 5 | 0 | 0 | 0 | 0 |
| `query` | 20 | 20 | 0 | 608 | 90 | 1572 | 0 | 0 | 0 | 0 | 0 |
| `knowledge` | 20 | 20 | 0 | 502 | 130 | 1742 | 0 | 0 | 0 | 0 | 0 |
| `query-log` | 20 | 20 | 0 | 433 | 430 | 440 | 0 | 0 | 0 | 0 | 0 |
| `shadow-manifest` | 20 | 20 | 0 | 91 | 91 | 91 | 0 | 0 | 0 | 0 | 0 |

## 关键读数（v1 真实行为）

- 无匹配输出：**12/200**（6%）—— 例：topic/q19、episode/q13、episode/q16
- 截断披露：**5/200** —— 例：topic/q01、topic/q02、topic/q07、topic/q10、topic/q20
- F2 缺灵魂横幅：**38/200**（本 oracle 未放 soul.json，默认工作区形态）
- 含 `<WS>` 占位：**1/200**（topic/q20；无参索引的「工作区」行）
- 含 `<ISO8601>` 占位：**15/200**（冻结时钟派生的 ISO 统一占位，避免生成机时区进入夹具）
- 总输出：161550 字符 / 200 条

## 稳定性（哪些字段可以逐字节比）

- **稳定**：`text`（规范化后）、`text_sha256`、`observed.*`、`query.args`、`corpus.sha256`。
- **易变（不参与 parity）**：`manifest.generated_at_utc`、`manifest.repro`、输出文件写入顺序、临时目录名。
- 规范化规则：临时工作区根（\ / 两种形态、JSON 转义形态）→ <WS>；ISO8601 时间戳 → <ISO8601>（冻结时钟下仍可确定，但统一占位以免受生成机时区影响）；CRLF → LF；不做其他改写。
- 本次自检：所有输出均无临时根/盘符/未占位的 ISO 残留（写盘前 `assertClean` 检查）；`<WS>` 1 条、`<ISO8601>` 15 条。

## 可重放性（--repro）
- 第二次全量运行与第一次逐条比较：**完全一致**（200 条，差异 0 条）

## v2 parity 建议比较字段

1. `text` 逐字节（同一规范化后）；`text_sha256` 作为快速校验。
2. `observed.recall_prefix_present`（护栏前缀必须存在）。
3. `observed.no_match` / `observed.truncation_disclosed` / `observed.tier_loss_disclosed`（**不得静默丢内容**）。
4. `observed.f2_missing_soul_banner`（缺灵魂的可见性口径）。
5. `observed.atom_refs`（返回的句柄集合与顺序），`observed.headings`（骨架）。
6. `observed.envelope_lines`（截断信封四要素/下一步）。
7. **占位符口径**：`<WS>` / `<ISO8601>` 是 oracle 的规范化占位，不是 v1 原文；v2 必须用同一规范化后再比。
8. **有意差异**：`decision` 的换行被 v1 bug 压平（见上「已知 v1 行为」）。若 v2 修复，逐字节 parity 会红——这是**预期差异**，应在 v2 侧显式登记，而不是把 v1 的 bug 复制过去。
9. 不建议比较：`manifest.generated_at_utc`、`manifest.repro`、输出文件写入顺序、临时目录名。

> ⚠ **v2 oracle 必须复现两件事**，否则 `text` 不能逐字节比：① 冻结时钟 `2026-09-06 12:00:00`（本地）；② 同一套规范化（`<WS>` / `<ISO8601>`）。置信度数字、`最老 <ISO8601>`、今日摘要都依赖冻结时钟。

## 失败 / 跳过 / 已知 v1 行为

- 无 error、无 skip。
- decision 模式的换行被 v1 `renderDecisions` 里的 `scrubUnsafe`（单行口径）压平：输出里 `# Decision Lineage…> Evidence…## …` 连成一行。这是 v1 真实缺陷（fixtures 保留原样）；v2 若修复，需在 parity 白名单里显式接受该差异。
- episode / task / context / knowledge 忽略 max_tokens 与 limit：q20-index 分别输出约 7.6k / 8.1k / 7.4k / 1.7k 字符且无截断披露（仅 topic / 无参索引有预算与披露）。
- 无参索引的格式行里 `<date>--<HHMMSS>` 被 v1 的 scrub 当成标签清掉（显示为 `格式：`.shadow/atoms/ -- -<入口slug>.md``），属 v1 真实渲染。
- recovery 的 `limit` 参数只存在于工具 schema，handler 不读取（`query/reads.ts` 的 recovery 分支）；fixtures 中 q02 的 limit 对 recovery 无影响。
- shadow-manifest：v1 的 manifest 由 projectionStore（默认关）生成 ⇒ 全部 20 条为「尚未构建投影索引」空态。
- query-log：预置 3 条固定观测记录，覆盖「同查询稳定 / 不同查询」两条聚合分支。
- 未覆盖：族 mode（agency/delegation/adaptation/horizon/federation/validation/world/model/sim-action/observer-kernel 等）、LLM 相关（summary/recall 扩词/llmRecall/knowledgeNavigate）——它们默认关，且本 oracle 不提供 llm 服务。
- 时区：冻结时钟使用**本地** 2026-09-06 12:00:00；`today()` 恒为该日。manifest 记录生成机时区，仅作环境信息。

> 本 SUMMARY 同时写到两处（同一份字节，canonical = oracle 脚本目录）：
> · `D:\project\local-workbench\_work\phase0\oracle\SUMMARY.md`
> · `D:\project\dsh-shadow\fixtures\oracle-v1\SUMMARY.md`（随夹具分发）

