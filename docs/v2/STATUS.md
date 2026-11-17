# dsh-shadow v2 · 实施状态

> 更新：2026-10-28 · 分支 `v2` · 基线 `legacy/v1`（e755b32）
> 这是**当前实现**的状态，不是目标态；目标见 `ARCHITECTURE.md` / `PARITY.md` / `../adr/`。

## 已完成

### Phase B（ADR-0024 路 B）· 投影核 slice 1（2026-11-17）
- 新增 `src/engine/project/`（`types` / `lens` / `distortion` / `project`）：点（`ParsedAtom`）→ Observer lens 取景（取景键 = **入口 entry**）→ 组装「面」（Episode 视图）→ 显式盲区 / 整全边界声明。纯函数、无 I/O、无时钟、无随机。
- **未接线**：默认读路径 `engine/read/route.ts` 一字未改，行为与 v2.12.4 一致；本刀只立核。
- 单测 `test/unit/project.test.ts`（默认全看 / lens 取景 / 视野外披露 / 零命中盲区 / 整全边界）。
- 验证：`npm run verify` → 61/61 测试 · audit-layers 211 files · docs-check ok。
- **slice 2**：`project()` 的「面」从单一 Episode 扩成多侧面（Episode / Task / Decision / 材料）；新增 `test/unit/project-c7.test.ts`，把 C7（纳入 / 排除 / 盲区披露、零命中不编造、证据句柄齐全）落成**可重放验收夹具**。
- **slice 3**：新增 `engine/project/run.ts`（`runProject`）——接线前的完整 seam：读 `soul.json` → lens（缺件 / 坏件**可见降级**为默认视角，绝不静默当作有灵魂）→ 投影；单测 `test/unit/project-run.test.ts` 覆盖「无 soul / 好 soul / 坏 soul」三态。接线时 `route` 只需调用它。
- **slice 4（已接线）**：`project` 透镜回核心（ADR-0024 accepted）：`read_shadow({project:true, topic})` → `runProject` → 面 + 盲区；`schema.test` 参数 13→14、`read.test` 加 `project` 端到端；README / PARITY（B5 等）/ MIGRATION 口径同步。
- **slice 5（Phase C · 坐标落地）**：写侧 `axes.soul` 不再恒 `default`——`capture` 从 `soul.json` 的 `identity` 填实（按 ws 缓存）；缺件回落 `default`（不算降级、不留信号），坏件/读失败回落 `default` 且留可见 `capture.soul` 信号（不静默吞错）。单测 `test/unit/capture-axes.test.ts` 覆盖三态。`role` 轴仍 `default`（暂无稳定来源，保留位）。
- **slice 6（ADR-0025 落地）**：`read_shadow` 无参 / 主题读**默认首段给「面」+「下钻：检索点」**；`raw:true` 为纯检索逃生口；面为 ≤800 字附加概览、不侵蚀检索预算。`read.test` 覆盖默认给面与 raw 逃生口；`parity(topic)` 0.883 不漂移。
- **slice 7（ADR-0026 维读出口）**：`read_shadow({dim})` 按维读——`line`(1维) / `face`(2维·会话轴) / `consciousness`(n维，含盲区)；升维视图 `domain/dimensions.ts` 接上读出口；参数 14→15、schema/read 测试同步。线容器 `engine/lines.ts` 把 `.shadow/lines/` 物化接入无参读（点回到线，A 锚 atoms 保留）。
- **slice 8（任务面）**：`deriveFaces(atoms,"task")` 对线做**确定性词法聚类**成「按这件事」的面（无 LLM）；`read_shadow({dim:"task"})` 可读任务面。真实语料：57 线 → **13 任务面**（vs 会话 16 / 日 6），多点面 12/13、守恒 ✅。写 `.shadow/soul/soul.json`（身份/价值观/边界/Observer lens），capture 的 `soul` 坐标与 `dim:consciousness` 视角随之上线。
- **slice 9（写侧按线落盘）**：新增 `capture.unit`（默认 **line**）——同一 `session + 入口 + 连续段`把每回合的点**追加到一条线文件**（`.shadow/lines/`），**不再一回合一个 atom**；atom 仍可用 `capture.unit:"atom"` 兼容（e2e/failure 的 atom 机制用例显式设之）。单测 `capture-line`（两回合→1 线装 2 点、不写 atom、可从线重建）。读 = atoms ∪ lines。**需重启宿主后，新对话才真正按线落盘。**
- **slice 10（线源收口）**：①**跨重启续线**——`parseLineHeader` + capture 在磁盘 `.shadow/lines` 找同 `session|entry` 且末点距 now ≤ gap 的最近线续写（重启不再把一段对话切成多条线，单测覆盖）；②**索引/文案转线源**——无参索引说明改为「点落在线」，近期列表改列 `a.rel` 句柄（atom 与 line#seq 统一）；③`unionByRel` 按正文去重（旧 materialize 派生线点不与 atom 双计）；④`materializeLines` 仅 `unit=atom` 跑；⑤line 点重建从正文 `when()` 补回 date/time。
- **slice 11（线级归档/遗忘/保留 + 提速）**：①**归档（冷但仍可读）** `archiveColdLines` + `tools/archive-lines.ts`；`loadLines` 读 hot `.shadow/lines` + `.shadow/archive/lines`；②**遗忘** `forgetColdLines` + `tools/forget-lines.ts`（冷线移出读路径入 `.trash`，可回退）；③**自动遗忘默认关**：`forget.auto`（默认 false）+ 写路径 afterFlush 按 `forget.staleDays` 执行；④**线解析缓存** `loadAtomsFromLinesCached`（按文件集 size 签名复用，index 读路径用它，避免全量重解析）。单测 `lines-archive` / `lines-forget` / `lines-cache`。**需重启后 ②③ 的自动/缓存才在插件内生效。**
- **slice 12（review 加固）**：①读路径不再物化线（去 `indexView` 的 `materializeLines`，守 C1/C3）；②`unionByRel` 恢复「**仅 body 与某 atom 相同的派生线点才去重**」→ 修 atom/回滚模式双计；③日归档前**过滤线点**（不入 atom 冷区、不产生 `#seq` 死链 rename）；④归档线**重写句柄**为 `.shadow/archive/lines/…#seq`（守 C2）；⑤`lineLastAt`/capture 续接用**末点正文 `when()` 真实日期**（跨午夜不偏）；⑥`nextSeq`/续接 seq 用**最大点号+1**（抗坏行/缺号，不复用）；⑦ `lineSignature` 用 stat `version`，**stat 缺失强制缓存 miss**（不"新点看不到"）。单测 `lines-edge` 等；verify 绿。

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
- `shadow_lab` 3 参数：`mode` / `input` / `write`；**无开关，始终注册**（ADR-0023）。
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

### 任务卡 → 可审 SKILL.md（2026-10-30 · `adr/0017`）
- 每张任务卡确定性生成 `SKILL.md`（frontmatter name/description + 何时用/步骤/结果/教训/证据/来源），物化到 `.shadow/indexes/skills/<slug>/SKILL.md`（幂等、有界 24、失败留 Signal 不阻塞读）。
- 无参索引列「技能」段；`recall_similar` 每张卡带「技能：indexes/skills/…/SKILL.md」指针；可复制到项目 `.agents/skills/` 复用。
- 测试：`test/unit/skills.test.ts`；`npm run verify` 39/39。
- 边界：启发式提炼（非 LLM）、不含可执行脚本、不进召回/不当指令。

### 代码检索（search_code，2026-10-30 · `adr/0019` 阶段 1）
- 新增 core 工具 `search_code(query, limit)`：遍历工作区代码（跳过点目录/`node_modules`/`dist` 等），按 40 行分块做 **BM25**（标识符+路径+中文 2-gram），返回 `文件:行号` + 片段。
- 只读、不写；预算 1500 文件 / 单文件 200KB / 总 8MB，超限**显式披露**；代码片段声明「数据非指令」。
- 测试：`test/unit/code-search.test.ts`；`npm run verify` **41/41**。
- 未做：tree-sitter 符号图（阶段 2）、embedding 语义（阶段 3）、`.gitignore` 完整解析（当前按常见目录跳过）。

## 未完成（按优先级）

1. **拆 `dsh-shadow-lab` 独立包**：ADR-0013 已给边界与迁移方案；未执行——core 移除 lab 是 breaking，需先定版本（建议 3.0.0）。
2. **perf 门**：`corpus-bench` 目前是手动工具，未进 `verify`；需 1k/8k 预算断言（派生件物化让无参读多了 ≤68 次 I/O，未做基准）。
3. **真实 DSH E2E**：headless / 隔离 `v2web` 已跑通（含 lab、含卸载/恢复回滚）；v2.1.0 的 **toolset 只读探测 + 派生件已真机复测**（2026-10-30，见上）；**仍未真机验**：`shadow_toolset` install 真执行、forget 陈旧类、WSL 远端；日常 `desktop` profile 已写入但**需重启 Electron** 生效。
4. **npm publish**：registry 尚未发布（v2.x 只发 git tag，ADR-0012）；发布后 `pnpm add dsh-shadow` 才成立。
5. **v1→v2 配置映射**：MIGRATION 写了映射表，`contract/config.ts` 尚未实现 v1 键兼容 warn。
6. **自动召回 auto-recall**（`adr/0018`/`adr/0023`）：**已实现 + 真机已验证 + 无开关常开**（`autoRecall.limit` 仍限 1..5）；文件探针显示 `text()` 每步被调用、turn-stopping 后 `cache-refreshed cards=1`、下一轮 `text() injected … hintChars=140`。
7. **代码检索**（`adr/0019`/`0020`/`0021`/`0022`/`0023`）：**阶段 1** `search_code`、**阶段 2** tree-sitter 符号、**阶段 3** 向量检索均已接入且**无开关**；**Cursor 式索引**（语法块 + 增量刷新 + trigram 候选 + BM25）与**本地神经向量**（`Xenova/multilingual-e5-small`，q8；失败回落哈希）已实现。HTTP embedding 仍不可用（网关 500）。

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




