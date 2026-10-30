# dsh-shadow v2 · 实施状态

> 更新：2026-10-28 · 分支 `v2` · 基线 `legacy/v1`（e755b32）
> 这是**当前实现**的状态，不是目标态；目标见 `ARCHITECTURE.md` / `PARITY.md` / `../adr/`。

## 已完成

### Phase 0 — 冻结与规格
- `legacy/v1` 分支 + tag `legacy-v1` 冻在 e755b32；v1 文档/ADR 归档到 `docs/v1/`。
- v1 oracle：`fixtures/oracle-v1/`（52 合成语料 + 20 查询 × 10 mode = 200 输出，可重放；v1 pin/sha 记录在 manifest）。
- v1 评审报告：`_reports/dsh-shadow-v1-review.html`；计划：`_reports/dsh-shadow-v2-plan.md`。

### Phase 1 — core 骨架
- `src/contract`（outcome/modes/config/paths/time/schema/types）
- `src/domain`（parse/rank/text/collect/views）
- `src/store`（fs port + memory fs、atoms、SQLite index、index cache）
- `src/engine/read`（10 core mode、budget/envelope、signals）
- `src/engine/write`（事件采集、事务化 flush、audit/consent）
- `src/surface`（4 工具 + schema 生成、workspace 解析）
- `src/index.ts` 薄 Cordis adapter（事件接线 + 工具注册 + systemPrompt）

### Phase 2 — 正确性/性能（部分）
- **宿主 fs**：生产走 `ctx.get("fs")`（HostFs），写入带会话 `sandboxPolicy`；缺 fs 服务显式不挂载，不回退 node:fs。只读会话不打开 SQLite。
- 原子唯一命名（`--uid6`）；同秒两会话不覆盖（测试）。
- flush 失败 pending 保留 + 重试 + Signal；同一 agent 串行、快照按 seq 消费（测试）。
- 写侧工作区：session id ≠ agent id 时按 agent cwd 解析；解析不出工作区拒绝落盘并留 Signal（测试）。
- 读 Outcome：目录/单文件读失败可见；空 ≠ 失败（测试）；修好后 sticky 信号清除（测试）。
- 未知 mode 显式错误 + 最近邻；lab mode 显式重定向（测试）。
- Signal 成功清除；query-log/hits 真实记录（e2e）；telemetry 写失败可见、hits 批量单事务。
- 无参读物化 `indexes/_index.md`（内容变化才写；e2e 断言）；截断段有「未返回」披露；材料卡/纪要/Episode/abstracts 尚未物化。
- 采集质量：goal 落 `> 目标：`；工具名不进材料；摘要确定性兜底（测试）。
- recovery 只核验被选中任务的 memoryRefs；context 有 200 atom 核验上限并披露（测试）。
- DB-first 读路径：SQLite 存 parsed JSON；1k warm 7ms/query 26ms；8k warm 67ms/query 106ms（`tools/corpus-bench.ts`）。
- 新鲜度：默认 token（文件名集合）；`index.verify:"full"` 比 size/mtime（测试）。
- 读路径不导入 v1 `_meta.json`（旧 hits/status 不迁移；v2 从空开始）。
- 真实 v1 语料 dry-run：168 atoms / 0 parse failure / 754 旧日期树文件（`tools/migrate-v1.ts`）。
- topic parity：19 查询平均 Jaccard 0.890（阈值 0.85；偏差登记在 PARITY §4.3）。

### Phase 3 — lab（51 mode）
- `src/lab/vendor/` 移植 v1 lab 依赖闭包（142 文件 / 6.4k 行），`src/lab/run.ts` 适配 v2 `FsPort`/Outcome。
- `shadow_lab` 3 参数：`mode` / `input` / `write`；`lab.enabled:true` 才注册。
- 51 mode 全部可执行；31 写型必须 `write:true`；只读带 write / 未知 mode / 未知字段均显式拒绝。
- `npm run lab:modes` 输出 51 / 31 / 9 分组；写型落 `.shadow/<store>/` 并可读回（测试）。
- 输出结构 `{ok, mode, wrote, data:{text}, notes, loss}`；正文统一“数据非指令”前缀。

### Phase 4/5 — 部分
- v2 当前态 7 份文档 + 12 ADR；`docs-check`/`audit-layers`/`verify` 自包含。
- `tools/migrate-v1.ts`：dry-run/copy(--apply)/in-place（备份 indexes + `_meta.json`，不删任何旧数据）。
- 22/22 测试通过；核心 schema 2,538 字符；`read_shadow` 12 参数。

### 真机验收（2026-10-28，DSH 0.2.1-rc.3）
- 临时 profile `v2test`（`@deepseek-ai/dsh-base` + `dsh-headless` + `dsh-shadow` link `D:/project/dsh-shadow`）；`--dump-config` 显示插件 entry。
- 临时工作区 `D:\project\local-workbench\_work\v2-e2e-ws`；新开 headless 会话（`session-8cbfca7f-…`）：
  - `read_shadow()` 被真实调用，返回索引；
  - 采集落 `.shadow/atoms/`（用户消息 + 助手消息两条）、`.shadow/audit/2026-10-28.jsonl`、`indexes/_index.md`、`indexes/index.sqlite`；
  - 第二轮同 session 调 `recall_shadow("DONE")` 返回恢复包（任务/触发/入口），跨轮召回成立。
- 修复的真机问题：Cordis 0.2 未 inject 时读 `ctx.config` 会抛（已 try/catch）；`ctx.get("fs")` 在 apply 时未就绪（HostFs 惰性）；宿主 `stat` 对缺失返回 `undefined`（必须当 NOT_FOUND，否则同秒碰撞 8 次、整批 pending）。
- lab 真机验收：`v2test` profile 的 `lab.enabled:true` 后，新会话真实调用 `shadow_lab({mode:"federation",input:{obsClaim:"alpha 可回滚"}})`，返回 `ok:true` / Federation Packet / `writeModes:31`；同时采集仍落 atoms。

### 真机 Web profile 验收（2026-10-28，隔离 DSH_HOME）
- profile `v2web` = `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + `dsh-shadow`（`link:D:/project/dsh-shadow`），patch 开 `lab.enabled:true`；`--dump-config` 1293 行含 `- id: dsh-shadow`。
- `dsh web --no-open --port 64560` 起真实 Web host（隔离 home `C:\Users\l\.dsh-v2web`），Chrome 经 CDP 打开 token URL；真实模型（magpie `auto/deepseek-v4.1-flash`）四轮：
  - `read_shadow()` 返回索引；5 个 shadow 工具可见（含条件注册的 `shadow_lab`）；
  - `shadow_lab(federation)` → `ok:true`；`shadow_toolset` → 显式 unavailable；
  - `recall_shadow` 返回恢复包、`shadow_query` 命中 2 条；`_index.md` 在读取时刷新；
  - `shadow_lab(observer-config, write:true)` → `wrote:true`，落 `.shadow/lab/observer/observer/config.json`，**不写 atoms**。
- 采集/审计/索引与 headless 一致：10 atoms + `audit/2026-10-28.jsonl`（3 条 action）+ `_index.md` + `index.sqlite`。
- 回滚演练：移除 dependency/bundle/patch → dump-config 无条目 → Web 正常启动、新会话「没有任何 shadow_ 工具」、无新 atom（9.3K tok vs 22.6K）→ 恢复后工具回归（10.9K tok）。
- 证据：`D:\project\local-workbench\_work\v2web\evidence\`（3 截图 + 10 atoms + index/audit + dump-config + README）；报告 `_reports/dsh-shadow-v2-web-acceptance/`。
- 边界：隔离 home 验证，真实 `~/.dsh` 下插件活跃未验；会话工作区落在 DSH 默认工作区（`~/Documents/deepseek-harness/default-workspace`）而非启动目录；`lab.enabled:false` 真机路径未验；WSL 远端与日常 `desktop` profile 未动。
- 坑：bundle 已列而 `node_modules` 缺链接时 `dsh plugin --profile v2web install` 报 `cannot resolve profile bundle "dsh-shadow"`；需先重建链接（见证据 README §5）。

### Phase 5 — 发版 v2.0.0（2026-10-28）
- 版本三处一致：`package.json` `2.0.0` · README 状态行 · `CHANGELOG.md` 首条；`npm run verify:release` 从占位改成真门（verify + 版本 + 构建产物 + `npm pack` 内容 + tag 指向 + 工作树干净）。
- `npm pack`：375 文件 / 259 KB（unpacked 762 KB）；含 dist（其中 lab vendor 284 文件）、docs/v2 6 份、ADR 14；不含 src/test/tools/fixtures。
- 轻量 tag `v2.0.0` 指向发布提交；`legacy-v1` 保留；npm registry 未发布（ADR-0012 另议）。

### Phase 6 — 工程缺口收口（2026-10-28，v2.1.0）
- **shadow_toolset 真实台账**：新增 `src/engine/toolset/`（目录 107 条 = provider 2 + reference 105 · 17 分类；默认只探 provider，`survey:"all"` 全探；`need` 预检只读）。install fail-closed：无审批通道/无 agent/非 `allowed-once` 一律不装并给可复制命令；装后重探再报（新增 `no-recipe`/`unverified` 状态，避免「未执行/未验证」被塞进 failed）。`toolset.enabled:false` 不注册。
- **forget / retention / compact 接线**：新增 `src/domain/lifecycle.ts`；读时统一裁决（状态类 archived/superseded/compacted + 陈旧类 + maxActive），移出活跃集并在输出披露「条数 / 原因 / 未删除」；`shadow-manifest`/`shadow-report` 披露活跃 vs 已遗忘。默认配置不启用陈旧类遗忘（升级不改变召回面）；meta 缺失不做陈旧类遗忘（hits 未知 ≠ 0）。
- **派生件物化**：新增 `src/engine/derived.ts`；无参读物化 `indexes/{materials,affaires,episodes,abstracts}`（确定性、内容不变不写、预算截断披露、写失败留 Signal 不阻塞读、atoms 零新增）。
- **lab per-mode JSON Schema**：新增 `src/lab/schema.ts`，51/51 覆盖（200 字段条目 / 134 唯一字段 / 30 必填条目 / 8 枚举 / 4 permissive）；未知字段列出该 mode 允许集，类型/枚举/必填显式拒绝。
- **lab 写边界加固**：lab fs 门面对 `.shadow/atoms` 写入一律 `WRITE_DENIED`；`workspace-record.kind` 锁形态（禁 `../`、分隔符、保留目录）。
- 验证：`npm run verify` 34/34 测试 · audit-layers 184 文件 · docs-check 绿；v2.1.0 发版（见 CHANGELOG）。
- **未做**：拆 `dsh-shadow-lab` 独立包（core 移除 lab 属 breaking；设计与迁移步骤见 ADR-0013，未执行）。

### 真机复测（2026-10-30，当前 v2.1.0 构建 `d37e9d2`）
- 隔离 Web host（`.dsh-v2web` / profile `v2web` / DSH `0.2.1-rc.5` / magpie）真实模型 2 轮：
  `shadow_toolset({need:[...]})` 能力预检三项均「未检出」，与本机 PATH 实际缺失一致（**非误报**）；
  `shadow_toolset()` 无参只探 2 个 provider，并标注「台账 = v1 快照、非本机实测」；
  无参 `read_shadow()` 派生件物化成功（材料卡 0 · 纪要 1 · Episode 1 · Abstract 3），只写 `indexes/` 不写 atoms；atoms/audit/index.sqlite 均落盘。
- 证据：`D:\project\local-workbench\_work\v2web\evidence\v2.1.0-retest-20261030\`（截图 + atoms/indexes/audit + README）。
- desktop profile：已写入 dependency/bundle + node_modules junction，**待重启 Electron 生效**；CLI 对 desktop 报「managed exclusively by the Electron application」，故组合性改用等价 `v2web` profile 在 CLI `0.2.1-rc.5` 上验证（dump-config exit 0、含 `- id: dsh-shadow`）。

### 行为增强（2026-10-30）— 中文宽松兜底召回
- 根因：`tokenize` 不分中文、`scoreMemory` 用字面子串 ⇒ 「后端入口在哪」对原文「后端工程入口是…」严格 `score=0`、返回未找到。
- 修法（`adr/0014`）：CJK **2-gram / BM25 兜底**，**只在严格匹配整体零结果时启用**；输出显式标注「宽松匹配（字形近似，非语义）」；严格命中路径与排序一字不改，parity 19 条 avg Jaccard 仍 **0.890**。
- 实测（`_work/shadow-fuzzy-demo.ts` 驱动编译产物）：`后端工程入口`=严格命中；`后端入口在哪` / `后端服务入口` / `找一下后端服务的入口`=宽松命中；`完全不存在主题zzz`=未找到。
- 测试：新增 `test/unit/fuzzy-recall.test.ts`；`npm run verify` 35/35。
- 仍不解决：跨工作区（`cwd` 决定 `.shadow`）、agent 不主动调用工具、无字面 2-gram 重叠的同义/翻译。

### 项目事实（facts，2026-10-30 · `adr/0015`）
- 从用户原话抽「X 是/=/：<路径>」→ **派生事实**（不写 atoms、可重建）；`read_shadow()` 索引末尾列出，`read_shadow(topic,{facts:true})` 精确查并逐条经 Evidence Gate 核验（`✓ verified / ✗ not_found / ? unavailable`）。
- `read_shadow` 参数 **12 → 13**（新增 `facts` 透镜）；core mode 仍 10 · core schema 2898 字符（<6000）。
- 测试：`test/unit/facts.test.ts`；`npm run verify` 37/37。
- 边界：只抽**带路径**的事实（精度取舍）；启发式非 LLM，复杂句式会漏；核验只判路径存在性。

### 相似过往任务召回（2026-10-30 · `adr/0016`）
- 新增派生「任务卡」（请求/决策/结果/教训/来源）+ 核心工具 `recall_similar(query, limit)`；按 `relevance(BM25 中文2gram) + recency + importance` 召回相似任务。
- 纯派生、不改 atoms；core 工具 **4 → 5**，core mode 仍 10；不改变 atom 级严格排序（parity 0.890）。
- 测试：`test/unit/similar.test.ts`；`npm run verify` **38/38**。
- 边界：`lessons` 是启发式（非 LLM）；相似=BM25/2-gram，语义近义/翻译仍可能不中；仍需 agent 主动调用（自动召回待真机 spike）。

## 未完成（按优先级）

1. **拆 `dsh-shadow-lab` 独立包**：ADR-0013 已给边界与迁移方案；未执行——core 移除 lab 是 breaking，需先定版本（建议 3.0.0）。
2. **perf 门**：`corpus-bench` 目前是手动工具，未进 `verify`；需 1k/8k 预算断言（派生件物化让无参读多了 ≤68 次 I/O，未做基准）。
3. **真实 DSH E2E**：headless / 隔离 `v2web` 已跑通（含 lab、含卸载/恢复回滚）；v2.1.0 的 **toolset 只读探测 + 派生件已真机复测**（2026-10-30，见上）；**仍未真机验**：`shadow_toolset` install 真执行、forget 陈旧类、WSL 远端；日常 `desktop` profile 已写入但**需重启 Electron** 生效。
4. **npm publish**：registry 尚未发布（v2.x 只发 git tag，ADR-0012）；发布后 `pnpm add dsh-shadow` 才成立。
5. **v1→v2 配置映射**：MIGRATION 写了映射表，`contract/config.ts` 尚未实现 v1 键兼容 warn。

## 关键数字（可重放）

```powershell
npm run verify                 # 34/34 + layers + docs
node tools/corpus-bench.ts 1000
node tools/corpus-bench.ts 8000
node tools/migrate-v1.ts --from fixtures\oracle-v1\corpus --dry-run
node test/parity/topic.test.ts
```

- 核心 schema：`read_shadow` 12 参数；4 工具合计 2,729 字符（toolset 真实台账后）；lab 51 mode 的 input 契约在 `src/lab/schema.ts`。
- 测试：34 文件/检查（unit + failure + parity + e2e）。
- 派生件：无参读最多 68 个派生文件（材料卡 24 · 纪要 8 · Episode 12 · abstract 24），内容不变不写。
- 工具集台账：107 条（provider 2 + reference 105）· 17 分类。
- 真实语料：168 atoms、0 解析失败（只读 dry-run；未 in-place）。
- 8k 合成：query 106ms（目标 ≤300ms）。

## 已知边界

- DB-first 默认按**文件名集合**判断新鲜度；原地改已有 atom 内容用 `index.verify:"full"`（size/mtime）或删 SQLite 重建。
- 读路径会写 telemetry（query-log/hits，默认开；`telemetry.*` 可关）；atoms 与 curated source 不改。
- 合成 oracle 的 topic 排序有 3 条已知偏差（q02/q07/q10），见 PARITY §4.3。




