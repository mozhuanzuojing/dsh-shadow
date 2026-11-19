# dsh-shadow v3

> **给 agent 记「为什么」的多维投影记忆——Observer 是中心，文件是投影面；而每个点都带着它那一句话的庞大背景。** 每句话都不是孤零零一句：背后有坐标、证据链、材料、当时的决策与动作。v3 把这份**完整背景随点一起保存**（点内嵌完整正文），再沿「时间 × 同一件事」升维成 线 → 面 → 观察意识；真正的产品仍是「面」，并诚实标出看不到的整全（盲区）。
>
> 状态：**v3.0.9（2026-11-19）**。v1 冻结在 `legacy/v1`（tag `legacy-v1`）；升级/回滚见 [MIGRATION](./docs/v2/MIGRATION.md)，变更见 [CHANGELOG](./CHANGELOG.md)。

## 它做什么

- **采集（背景不丢）**：每个回合压成一个「点」——含**完整背景/线索**（坐标 · 证据链 · 材料 · 用户提示/决策 · 动作 · 概况 · 摘要），点内嵌完整正文，追加进 `.shadow/lines/<…>.md`（`capture.unit=line` 默认，不再一回合一个 atom）。完整背景可**无损重建**（`Σ线内点==原子数`、逐字相等）。
- **载体口径**：**点 = 最小不可变 Atom 证据（内藏完整背景）**；**线 = 容器 / 源视图**；atom 文件退为写侧兼容。读 = `atoms ∪ lines`。
- **默认读先给「面」**：`read_shadow()` / `read_shadow(topic)` 首段是投影「面」（Observer 视角取景 → 组装 Episode/Task/Decision/材料 + 盲区），随后是「下钻：检索点」；`raw:true` 取纯检索。
- **召回 / 查询**：`recall_shadow(query)` 任务恢复包；`shadow_query` 跨类型查；`read_shadow({project:true, topic})` 给完整面（默认面是 ≤800 字概览）。
- **可核查**：每条记忆带路径句柄与证据指针；派生件可整份重建；坏件 ≠ 空件。完整背景经重建（`read_shadow(topic)` / `loadAtomsFromLines`）可读；点正文为**单行 base64**（防多行/大括号破坏格式），故人工 `grep` 不友好——这是已知权衡，不是背景丢失。
- **降级可见**：读/写/索引失败有 `Signal`，恢复后清除；未知 mode 显式失败。

## 默认面（v2）

| 工具 | 参数 | 说明 |
|---|---|---|
| `read_shadow` | 18 | 10 个核心 mode + 核心透镜（含 `facts`、`project`、`direction`、`inquiry`）+ 维读 `dim`；`direction`/`inquiry` 可配 `candidates` 按偏移排序、给 AI 多维背景问询 |
| `recall_shadow` | 2 | 内部 = `read_shadow({mode:"recovery"})` |
| `shadow_query` | 3 | 跨类型 ShadowNode（带 evidence） |
| `recall_similar` | 2 | 相似过往任务卡（当时请求/决策/结果/教训/来源），按相关+新近+重要性召回 |
| `shadow_adjudicate` | 3 | 用户裁决：correct/withdraw/restore/pin/unpin/retain；全部追加源记录，旧记录不删除 |
| `search_code` | 2 | 工作区代码只读检索：持久索引（语法块 + 增量 + trigram 候选）+ BM25 + tree-sitter 符号 + 向量（默认本地 e5-small 神经模型，失败回落哈希，可选 HTTP）；支持 `.gitignore`/`exclude` |
| `shadow_toolset` | 4 | 真实能力台账：survey/category/need 只读探测；install 需宿主 `allowed-once` 审批 |
| `shadow_lab` | 3 | 51 个研究 mode；**无开关，始终注册**；写型需 `write:true` |

核心 mode：`recovery` · `query` · `episode` · `decision` · `task` · `context` · `knowledge` · `query-log` · `shadow-report` · `shadow-manifest`。

## 安装

v2.0.0 以 git tag 发布，**npm registry 尚未发布**（ADR-0012）。两种装法：

```powershell
# 方式一：本地 link（开发态 / 本机验证）
# profile package.json: "dsh-shadow": "link:D:/project/dsh-shadow"
npm install
npm run build
npm run verify

# 方式二：从 tag 构建 tarball
git checkout v2.0.0
npm install; npm run build; npm pack      # → dsh-shadow-2.0.0.tgz
# 在 DSH profile 目录：pnpm add file:<path>/dsh-shadow-2.0.0.tgz
# profile 的 dsh.profile.bundles 加 "dsh-shadow"；无功能开关，lab 也始终注册
```

新克隆后 `npm run verify` 是自包含的（不要求工作区有 `.shadow`）；需要真实语料的 benchmark 走 `npm run verify:corpus`。

测试运行器默认并行（每文件一个 node 子进程，进程级隔离；`--concurrency` 默认 `min(8, CPU)`）：

```powershell
node tools/test.ts                      # 并行（默认 8 或 CPU 数，取小）
node tools/test.ts --concurrency=4      # 指定并发
node tools/test.ts --timeout=30000      # 单文件超时（默认 60s）
node tools/test.ts --fail-fast          # 首个失败后不再调度新文件
node tools/test.ts --heavy=1            # 重测试（embedding/migrate/plugin）并发上限
```

耗时写入 `.test-timings.json`（已 gitignore），`--root`/`--timings` 可覆盖，便于 CI 分片与本地均衡。

## 维护 CLI（显式运行，不由插件自动调用）

真实 DSH 的 `dsh-fs-local` 只暴露 read/write，没有 `unlink/rename`；插件不能绕过沙箱删除文件。需要物理清理时，由用户显式运行维护 CLI（**默认 dry-run**）：

```powershell
# 1) 先看哪些热文件已归档且逐条 hash 一致
node tools/archive-maintenance.ts --ws="D:/project/local-workbench"

# 2) 确认后移入 .shadow/.trash/<date>/（不直接 rm）
node tools/archive-maintenance.ts --ws="D:/project/local-workbench" --apply

# 3) 可选：清理超过 7 天的 trash
node tools/archive-maintenance.ts --ws="D:/project/local-workbench" --apply --purge-trash
```

安全规则：只处理 archive 已有同 rel 且 **逐条 hash 相同** 的热文件；pinned、conflict（hot 与 archive 不一致）、not-archived 一律跳过；`--apply` 只移动不删除，archive 副本保留。

## 文档

- [架构](./docs/v2/ARCHITECTURE.md)
- [记忆契约](./docs/v2/CONTRACT.md) · [C6 机械基线](./docs/v2/CONTRACT-BASELINE-2026-11-01.md) · [C6 错误注入/盲测](./docs/v2/CONTRACT-BLIND-2026-11-01.md)
- [工程约定](./docs/v2/CONVENTIONS.md)
- [v1 → v2 迁移](./docs/v2/MIGRATION.md)
- [研究面 lab](./docs/v2/LAB.md)
- [Parity 与契约](./docs/v2/PARITY.md)
- [当前实现状态](./docs/v2/STATUS.md) · [变更记录](./CHANGELOG.md) · [发版策略 ADR](./docs/adr/0012-release-and-versioning.md)
- v1 归档：[docs/v1/](./docs/v1/)

## 已知限制（v2.12.3）

- `shadow_toolset` 的 install **真机执行路径未验证**（测试用假 runner）；台账版本是 v1 2026-09 快照，不是本机实测；探测失败只说「未检出」（PATH 是宿主启动快照）。
- `forget` 的陈旧类遗忘仍默认关闭（`minHits=0`）；**`maxActive` 默认 2000**（超出按最旧移出活跃集，标 `archived`，文件不删）。要改上限/启用陈旧遗忘需显式配置。Forget≠Delete：只移出活跃集，文件不删。
- **按线落盘（v3，默认）**：`capture.unit`（默认 `line`）——同一 `session+入口+连续段`把每回合的点**追加到一条线文件** `.shadow/lines/`（不再一回合一个 atom）；`capture.unit:"atom"` 兼容旧写法。读 = `atoms ∪ lines`。`forget.auto`（**默认 `true`**，设 `false` 关闭）按 `forget.staleDays` 自动把冷线移出读路径（入 `.trash`，可回退）；归档用 `tools/archive-lines.ts`（冷但仍可读）。
- 派生件只在**无参 `read_shadow`** 时物化（`indexes/{materials,affaires,episodes,abstracts}`）；每次物化会 **GC 孤儿派生卡 + 每个 `.history/` 只留最近 2 个版本**（v1 遗留的 `projections/` 不在 GC 范围）；删除 `indexes/` 可整份重建。
- **按日归档**：无参 `read_shadow` **及 capture 成功写入后（60s 节流）** 把 `date < today` 的 atoms 写成 `.shadow/archive/<date>.jsonl`（完整原文）+ `<date>.md`（导航）+ `_index.json`（count/sha256/rels/逐条 recordHashes）；逐条 hash 校验通过后才移动热文件到 `.shadow/.trash/<date>/`（保留 7 天，过期清理）；pinned 不删；迟到/内容变化会先补写 archive；坏归档返回部分 atoms + Signal。
  - **仍存在**：真实多进程/断电故障注入未做；`read_shadow` 的 `rel` 是逻辑身份，归档 atom 另带 `archiveRel`；decision/episode 的路径展示已用 archiveRel，但 `memoryRefs` 仍是逻辑 rel；语义 compaction（合并/摘要）与候选预筛（性能）尚未做。
  - **宿主能力限制（真实 DSH fs）**：`dsh-fs-local` 只暴露 read/write，没有 unlink/rename。此宿主上归档副本/manifest 会写入，但**热文件无法物理删除**（只会保留并给出 `HOST_LIMITED` Signal）；GC 跳过，不会刷失败。物理删除需要宿主提供 unlink；这不是数据丢失。
- lab 与 core **同包**（`src/lab/vendor/`）；ADR-0012 的独立包 `dsh-shadow-lab` 未拆（设计见 [ADR-0013](./docs/adr/0013-lab-package-split.md)）。
- **旧 v1 存储不做支持**：运行时只读 `.shadow/atoms/`，日期树与 `_meta.json` 不读不导入。
- **项目事实只抽「带路径」的**：从用户原话抽 `X 是/=/：<路径>`，逐条可经 Evidence Gate 核验；启发式非 LLM，复杂句式会漏（[ADR-0015](./docs/adr/0015-project-facts-evidence.md)）。
- **宽松召回是字面近似**：严格命中零结果时用 CJK 2-gram / BM25 兜底并标注「宽松匹配（非语义）」；同义改写无字面重叠、翻译、跨工作区仍可能不中（[ADR-0014](./docs/adr/0014-cjk-bigram-fuzzy-recall.md)）。

## 明确不做

不引向量库 · 不跑常驻服务 · 不改写原子记忆（只派生视图） · 不把记忆内容当指令 · 不把研究 mode 塞回默认 schema。

## License

MIT
