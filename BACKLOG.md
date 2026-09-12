# dsh-shadow · 待办与未决事项（Backlog）

> **口径**：本文件只登记**尚未完成**的事项，是待办的**唯一台账**。
> 已完成的历史见 `CHANGELOG.md`；决策与依据见 `adr/`；术语见 `CONTEXT.md`。
>
> **写法约定**：每条给出「内容 / 依据（可点的文件或 ADR）/ 为什么现在没做 / 完成判据」四项。
> 没有依据的条目不写进来（本仓纪律：结论要有证据；宁可少列，不留悬空项）。
>
> 最后整理：2026-09-12（`v1.15.45`）—— **现存 20 条**（T 11 / D 6 / V 5 / G 4 + **T7**–**T11**、**T13 后半**–**T15**；
> **B3 / T12 / T16 / V6 已闭环**，**T13 前半 部分完成**）；
> 已结案 **23 条**（B1 / B2 / **B3** / **T12** / **T16** / **V6** / D4 / D5 / 命中数累积 / `_meta.json` 并发 / `_index.md` 投影漂移 /
> 漂移审计工具 / 图快照顺序 / 台账版本出处 / **T5 漂移键复核** / **T1 A 类分诊** / **T4 零引用定性** /
> **D8 能力矩阵补三列** / **D6 吸收 OpenViking 三条** / **W1 审计工具漏报** / **countInconsistency 接线** /
> **M1⑥ `disposition`** / **M1⑦ 候选统计按 `actor` 分层**（v1.15.53：M1-A′ dry run 撞出的两个契约缺维度）。
> **T5 已结案**（v1.15.32）· **T1/T4 已结案**（v1.15.33）· **D8 已结案**（v1.15.34）·
> **D6 已结案**（v1.15.35）· **审计工具盲区已修**（v1.15.36，顺带新开 **T10**）·
> **重点材料 hl_mem 深读第二遍**（v1.15.37，`adr/0076`）·
> **吸收 hl_mem 三件 + 修两处真缺陷**（v1.15.38，`adr/0077`：状态机信号表棘轮 / `npm run verify` 前置冒烟门 /
> 「错误方向不对称」成文；顺带新开 **T12**，并把 **T11②** 与 **V6** 推进为**部分完成**）·
> **hl_mem 第三轮深读（首次本地克隆、一手读源码）**（v1.15.39，`adr/0078`：**三处自我更正** ——
> ① `assert_transition()` 不是写侧守卫（写原语不强制、≥2 处绕过）；② ADR-0004 的协议在生产里是
> **窄面 + 默认只建议**（一个 slot、`observe`）⇒ **实质改写 D3 的对照面**；③ 路径/计数记错；
> 另把「覆盖率台账」改为**磁盘枚举生成**，**新开 T13 / T14 / T15**，并把 **T11①** 推进为「有可照抄形态」）。
> **本地全部材料总台账**（v1.15.39 起，[`MATERIALS.md`](./MATERIALS.md)：DSH 本体 + 6 个外来 repo 的
> 名册/许可/规模/已吸收/未读/优先级；**由磁盘枚举生成**）——首轮四路深读回报后**新开 T16**（平台契约核对与纠错）。
> **本轮新增 B3 + T6**（ADR-0074：写入缺 `sandboxPolicy` ⇒ **记忆一条都落不了盘**；修复已提交，
> 但插件 `dist/` 不热加载 ⇒ 需重启宿主才能在真机复核）。
> **✅ B3 已闭环（v1.15.40 第 4 轮）**：宿主于 2026-09-12 `16:40:02` 重启（PID 全新），重启后逐条实测通过
> （横幅消失 / 当天新记忆文件真的在写且与本轮改过的文件一一对应 / `_index.md` mtime 同步更新）；
> 唯判据 4（宿主日志侧检索）**未单独核验**，原因见该条。**ADR-0074 的修复在真机生效。**
> **v1.15.41：T13 前半落地** —— **结构门 `audit-layers`**（文件级无环 / 纯模块白名单零副作用 + 腐化自检 / 方向禁令），
> 已接进 `npm run verify`（**46/46**）。**关键一改**：原「按目录分层」的草案**实测即被否掉**
> （`core/` 是**混合脊柱**，不是纯函数层）⇒ **换判据对象**，只保留实测为真的三条。详见 T13「进度 A」。
> **注意**：ADR-0074 **不列在本台账的「已结案」里** —— 它从来不是待办项，是本轮**新发现的真缺陷**
> （完整记录见 `CHANGELOG.md` v1.15.31）；本台账只登记它**遗留的两件事**（B3 / T6）。
> **同理**：v1.15.38 修的两处真缺陷（consolidated `time` 两路径分叉 / 时间炸弹测试）**是缺陷不是待办**，
> 其完整记录在 `CHANGELOG.md` v1.15.38 与 `adr/0077`；本台账只登记它**遗留的欠账**（**T12**）。

---

## 〇、已结案（保留结论，便于回溯）

### ✅ **A 段残余 18 条（A2b/A1）逐条分诊**（v1.15.43）—— 1 处真断线（已修）+ 工具口径缺陷（已修）

> 背景：T1/T4 结案后 A 段还剩 **A2b 1 + A1 17 = 18 条**「需人工逐条查」。本轮逐条判完，
> 判据 = 读定义 + 读 JSDoc + 搜生产面调用点 + 查同文件成对谓词 + 查同名第二份实现。

**先修工具口径（本轮新增证据）**：`audit-wiring` 的「测试引用 N」**此前不可采信** ——
`tools/audit-wiring.ts:37` 原写成 `!isProductionPath(...)` 即算「测试」，而 `isProductionPath` 只排除
`node_modules/dist/test/...` ⇒ **`dist/**` 的 `.d.ts` 与 `node_modules/**` 的 `.d.ts` 都被算进「测试引用」**。
实测：`hasNoUpgradeApi` 的「1」全来自 `dist/agency/guards.d.ts`；`apply` 的「230」里 15 来自 `node_modules`。
**已修**：判据改为**只认 `test/` 下的文件**（`dist/`、`node_modules/` 两边都不算），并把口径打进输出行；
修后 `hasNoUpgradeApi`/`renderIntent`/`progresssiveDisclosure` 等的「测试引用」如实变成 **0**。

**逐条结论（汇总）**：**真断线 1** · **配对包装一半 4** · **仅测试/公开面正当 7** · **无法判定 6**。

| 分类 | 符号（文件） |
|---|---|
| **真断线（1，已修）** | `ledgerMismatch`（`tools/toolset-authority.lib.ts:47`）：CLI **import 了却另写内联过滤**（`:99-102`）⇒ 判据分叉隐患（离线棘轮走 lib、CLI 走内联）。`git log -S "ledgerMismatch("` **为空** ⇒ 属「import 了但忘了接线」。**已改为 CLI 直接调 lib 那份**，并加**源码级棘轮** ⑦（`test/toolset-authority.test.ts`：断言 CLI 调它 + `--check` 分支内**不得**再有 `ledgerVerSrc !==` 内联比对） |
| **配对包装一半（4）** | `renderRetrieved`（窄版，生产用带 `__path` 的 `renderKnowledgeRetrieval`）· `assertNoExpansionField` · `assertLifecycleActive` · `assertScopeWithin`（引擎只 import 谓词，包装零消费者）⇒ **一处家族级决定**，不是 N 处缺陷 |
| **仅测试消费 / 公开面（7）** | `sidecarDrift`（JSDoc 明写消费者是棘轮）· `isMetadataMemoryText` · `isExchangeable` · `apply`（**Cordis 宿主入口，零仓库内调用是设计**）· `writeMeta`（文档明示的逃生舱）· `readTemporalGraph` · `readGraph`（world 只写不读，读 API 留公开面） |
| **无法判定（6，全部缺「产品决策」而非代码证据）** | `hasNoUpgradeApi`（恒 `true` 的见证函数，真实测试引用 **0** ⇒ 是「删」还是「补一条源码级棘轮」）· `renderIntent`（`observer/core.ts:31` 只内联渲染 `goal`+`question`，是否改调它）· `renderIdentityModel` · `progressiveDisclosure` + `refineTree`（ADR-0048 成本折叠是否进默认读路径，**同一处决定**）· `relationForProposal`（T7 三选一） |

**同轮记账（不是接线任务）**：
- `isMetadataMemoryText` 的注释/ADR-0066 口径称它「服务不 `parseMemory` 的读路径」，而生产读路径**全走 `parseMemory`**
  （`query/materialize.ts:24-26`、`query/reads.ts:113`）⇒ **该句当前不实**，应改为「文本面孪生，仅由一致性测试锁住」。
- **T10 的实例（新证据）**：`persistence/snapshots.ts:26 readLatestSnapshot` 的生产可达路径只有那两个零引用 reader
  ⇒ ADR-0071 那次「读逻辑收敛」在**当前生产运行时收益为 0**（与 `BACKLOG.md` 自述一致）；工具抓不到这一类（已自曝盲区）。
- 11 个 `assert*` 的「测试引用 1」**全部来自 `dist/*.d.ts`** ⇒ 「给测试用」这半目前不成立，理由应改为「给将来调用方」。

### ✅ 台账「实测」标签比事实强（ADR-0072，v1.15.29）—— **量证·改正默认值·签入离线棘轮**

- **由来**：`npm run audit:drift` 检测 B 第三次产出（`c.kind=*`）——**先判它不是漂移**（生产者/消费者分层），
  顺带实测边界不变量 107 项全满足；但顺「台账诚实性」查下去命中**真问题**。
- **问题**：`verSrc` 默认 `"实测"`（= 本机 `--version` 跑出来的），但 v1.15.10 的 44 条数字**全部来自 winget 目录**
  —— 44 条中 **35 条与权威逐字一致**；`fzf` 台账 0.74.3 / 本机 0.73.1（且来自 scoop）；
  `zoxide` 台账 0.10.0 / `winget list` 已装 0.9.9「可用 0.10.0」（抄的是**「可用」列**）。
- **第二层（第八个「机制存在、没接线」实例）**：`verify:toolset` 传 `expectedVersion: null`
  ⇒ `verDrift` 分支**从未生效** ⇒ 版本误标**不可能被发现**（那个「版本漂移 0」是假读数）。
- **修复**：默认值改为 `"权威核验"` + 新增 `tools/toolset-authority.ts`（真调 winget 且**把台账版本当期望值**，
  并记录本机读数）⇒ 清单 `tools/toolset-authority.json` 签入 + **离线棘轮** `test/toolset-authority.test.ts`（5 组，含**正对照**）。
- **实测**：101 条 —— 台账==权威 **88** · **老化 13**（正常，不判错）· **falseMeasured 0**。
- **自曝**：测试首跑暴露我自己的判据范围错（拿全部 107 条比只覆盖 101 条的清单 ⇒ 6 条假不一致），已修。
- **未验证**：`machineVersion` 是生成时那台机器的留档（测试不重探测，避免机器相关断言恒红）；
  清单**未接入自动门禁**；`"实测"` 标签本轮 0 条被真正启用（本机可检出的条目台账版本都与本机不符）。

### ✅ 图快照读取取到最旧的（ADR-0071，v1.15.28）—— **工具体检 B 第二次真发现·闭环验证**

- **由来**：`npm run audit:drift` 的检测 B 报 `name=graph.json` 跨两个模块；顺查发现三层事实
  （近重复 / write-only / 真实读路径是重建）+ **一个新的顺序 bug**。
- **顺序 bug**：`listDir` 契约 "stable name order"、真机 `localeCompare` 升序，日期目录名
  `YYYY-MM-DD` 字典序=时间序 ⇒ 两个 reader「取第一个」= **取最旧**的快照
  （而 `graph.json` 是可重建派生件 ⇒ 回读更旧的派生件 = ADR-0069 同族）。
- **修复**：新增 `persistence/snapshots.ts` 的 `readLatestSnapshot`（降序取第一份），
  两个 reader **收敛为参数化调用**（不「两处各修一遍」—— 那会保留「多处表达」的分叉结构）。
- **复现**：修复前 `实际返回 day07`；修复后 **6/6**（含③乱序插入仍取最新、⑤无快照→`null`）。
- **闭环**：重跑审计，检测 B **12 键/30 处 → 11 键/28 处**、该键**已消失**。
- **诚实标注**：两 reader **当前零调用**（属 T4）⇒ **运行时收益为 0**，收益是**消除地雷 + 消除重复**。
- **未处理**：快照**无限增长**（每天一份、从不清理）—— 属存储治理，另议题。

### ✅ 投影漂移审计工具（ADR-0070，v1.15.27）—— **造工具·两层标定·首次使用抓到第 7 处**

- **动机**：v1.15.22–26 连续五轮同族缺陷**全靠手工找**（体力）。目标第 (4) 条要的是**能力**。
- **工具**：`tools/audit-drift.ts` —— 检测 A（新鲜度只看进程，精度高）+ 检测 B（判据跨模块表达，线索级）。
- **标定**：夹具 10 组 + **git 历史真缺陷**（`0c4e06b` 旧报 `:41`/`:215`、当前版报 0）。
- **首次使用即产出**：抓到 `observer/judgment.ts:26` **漏 `isConcreteLocator`** —— 对 glob / git ref
  做存在性检查 ⇒ 假冲突 ⇒ 结论假降 `evidence_stale` + 置信假降；实测 **12 条（0.49%）/ 17 处**。已修。
- **锁**：`test/evidence-missing-criterion.test.ts`（含 ③ 反向不变量 + ⑤ **跨消费者一致性**）。
- **未做**：检测 B 的 **12 个键只复核了 1 个**（其余 11 个为未复核线索）；工具未接入自动门禁。

### ✅ `_index.md` 的投影漂移（ADR-0069，v1.15.26）—— **量证·修三层根因·加锁完成**

- **实测**：`_index.md` 停在 09:34:01，之后 **623 条（8.54%）**记忆对索引不可见，而主题召回看得见。
- **三层根因**：① `indexDirty` 是**进程内** Set（看不见别的会话写入）；② `ensureIndexCache` 的
  `if (warm) return`（不重读新文件）；③ 磁盘已删的从不清出缓存（幽灵条目）。
- **修复**：新鲜度问**源**（复用已有的 `shadowSourcesFingerprint`，此前只接给 `nodes.jsonl`）
  + 每次**增量对账**（只 listDir、只为新文件读内容）+ **先采指纹后读源**。
- **锁**：`test/index-freshness.test.ts` 5 组断言（绕过本进程 flush 放文件，模拟别的会话写入）。
- **真机核实**：读 `dsh-fs-local` 的 `listDirectory` 实现 ⇒ `target` 必给、文件给 `size` ⇒ 指纹可判定；
  真语料 **7336 条目 / 62 ms**。
- **未验证**：真机端到端（需重启）；10 万级对账成本；**幽灵条目真机量级未报**（探针被 `_index.md` 说明文字污染）。

### ✅ `_meta.json` 的并发丢更新（ADR-0068，v1.15.25）—— **发现·修根因·加锁完成**

- **由来**：v1.15.24 修命中数累积时**放大**出来的 —— 那段 RMW 从「几乎不执行」变成「每次有命中的召回」。
- **根因**：能力就在 fs 契约里（`FsWriteIntent.replaceIfVersion` / `FsInfo.version` / `FS_STALE_VERSION`），
  而插件**一处都没用**。
- **修复**：① `mutateMeta` 事务（stat → read → mutate → 带守卫写 → 冲突重试 ≤3）；
  ② **先 stat 后 read** 的顺序敏感点；③ `runCompact` 从「覆盖全量」改「应用 compacted delta」
  （**这条与正确性相关**：`compacted` 丢了会让已归档原子重回活跃索引）；④ 无 `stat` 时诚实降级。
- **锁**：`test/meta-concurrency.test.ts` 5 组断言，mock **忠实实现**版本语义（不重蹈 v1.15.15 的坑），
  核心断言「并发 ⇒ 双方更新都保住」。
- **未验证**：真机 `host.fs` 端到端、真并发时序、重试耗尽极端用例；需**再重启一次**才在运行进程生效。

### ✅ 命中数累积触发条件（ADR-0067，v1.15.24）—— **发现·复现·修复完成**

- **缺陷**：`query/query.ts` 累积 `hits`/`confirmedBy` 用的是 `servedDetail`
  （= `tier !== "L0" && render.includes("…")`），而 `tierFor` 对「动作行占比 > 60%」的记忆返回 **L0**
  ⇒ 真语料 **74.3%（5342/7185）** 的记忆**永不可能**被记命中。
- **端到端佐证**：本机 7185 条记忆、`_index.md` 1.8 MB、多次召回后 **`.shadow/_meta.json` 不存在**。
- **修复**：改用 `servedRels`（每条被返回的）；`servedDetail` 继续服务冷却台账。
- **修复前的红**（`test/hit-accumulation.test.ts` ②）：
  `actual: undefined, expected: true`；修复后 4 组断言全过。
- **连带恢复**：`OBSERVED`/`VERIFIED`/`TRUSTED` 三态（此前生产不可达）、`forget` 的 `minHits` 保护。
- **未验证**：需**再重启一次**宿主才能在真机看到 `_meta.json` 出现。


### ✅ B1. 重启 DSH 使插件代码生效 —— **已闭环（2026-09-11 用户重启）**

- **完成判据（全部实测通过）**：
  - `read_shadow({mode:"toolset"})` 返回**台账**：**107 项**（105 `reference` + 2 `provider`）、**17 分类** ✅
  - `read_shadow({mode:"toolset", need:["全文搜索"]})` 返回**能力预检**（`⬜ 全文搜索 → ripgrep`）
    —— 而**不是** `_index.md`；且三条硬边界（预检不是闸门 / 装完本会话不可见 / 缺件只能上报）正常输出 ✅
  - `read_shadow({mode:"toolset", category:"搜索与查找"})` 按分类过滤生效 ✅
- **意义**：`v1.15.13`–`v1.15.22` 十一个版本的插件改动**首次在运行进程里生效**。
  ADR-0057 记录的两种加载行为（host 组合行热加载 / 本插件 `dist/` 不热加载）得到**再次确认**。
- **教训（值得留档）**：`toolset` 那一版（v1.15.13）修的是「机制存在、接线断了」，
  而**验证它需要一次人工重启** —— 这类缺陷的验证成本远高于修复成本。

### ✅ B2. 多粒度检索层的产品方向 —— **按推荐 ① 决策（用户「按推荐」授权）**

- **决定**：**采 ①「按证据改」** —— 形态是「**单索引 + 层级表示 + 路由**」，
  **不做**「多库全量扇出」。
- **依据**：`adr/0060-multi-granularity-retrieval-form.md`（三条选项与实测表）
  + **ADR-0065 的独立先例**（OpenViking 的 `HierarchicalRetriever` 就是「路由 + 目录递归 + 重排」，
  且其层级分数传播 `score_propagation_alpha` **默认 1.0** ⇒ 层级买的是**召回路径**，不是分数平滑）
  + `adr/0065` 记的实测：离题噪声有阈值单库 **0.000** vs 无阈值 **1.000**；扇出即便含互补来源**也不升召回**。
- **现状核对**：该形态**本仓已实现**（v1.15.18 已核实）—— `indexEngine.provider` 单值路由
  + `retrieval/render.ts` 的 `tierFor`（L0/L1/L2）+ `renderByTier` 按预算逐层展开。
  ⇒ ① 的落地 = **确认现有设计即目标形态**，**不需要新建 N 个库**。
- **未做（诚实标注）**：选项 ② 的「装 semble 后用同一工具复测」**仍未做**（本机 `semble`/`zg` 均未安装）。
  它**不阻塞** ① 的决策 —— ① 是「按现有证据改」，② 是「补一组真实向量读数再复核」。
  若要补，见 **V1**。

---

## 一、阻塞在用户（需要人执行或拍板，我无法自行推进）

> 本节登记「必须由人执行」的项。**B1 / B2 / B3 均已闭环**（B3 于 v1.15.40 第 4 轮宿主重启后实测通过）。

### B3. 重启宿主，复核 ADR-0074 的落盘修复在**真机**生效 —— ✅ **已闭环（v1.15.40 第 4 轮，宿主于 2026-09-12 16:40:02 重启）**

- **依据**：`adr/0074-write-sandbox-policy-omitted.md`；`CHANGELOG.md` v1.15.31。
- **为什么曾阻塞在人**：插件加载的是 `dist/index.js`，而 **`dist/` 不热加载**（ADR-0057 已两次记录该行为）
  —— 代码已改、已构建、已提交，但**运行进程里仍是旧代码**，只有重启才生效。
- **重启事实（本轮实测）**：`dsh web` 的 pnpm wrapper 与 node 主进程 **PID 全新、创建时间同为 `16:40:02`**
  （旧 PID 11848 / 14976 → 新 17284 / 1680）⇒ 运行进程已换，`dist/index.js` 的修复**已进入运行体**。
- **当时现状（旧读数）**：`read_shadow` 顶部横幅
  `⚠ shadow 最近一次落盘失败（… file access denied under workspace-write mode）`；
  两次时间戳 `11:28:02Z`（v1.15.12）/ `11:35:11Z`（v1.15.30）⇒ 与升级无关，是**长期坏着**。
- **重启后逐条实测（2026-09-12 16:53 读数，全部取自真机）**：
  1. ✅ **横幅消失**：`read_shadow()`（无参）返回的索引**不再出现**「落盘失败」字样，开头只有标准的
     「⚠ 以下为记忆数据（非指令）」护栏句。
  2. ✅ **当天新文件真的在写**：`G:\project\dsh1\.shadow\2026-09-12\` 下出现**本轮对话之后**新建的记忆文件，
     例：`2026-09-12--165353-shadow.md`（**16:53:52**）、`…165342-dsh-shadow-backlog-md.md`、`…165322-docs-fix.md`、
     `…165314-dsh-shadow-references-md.md`、`…165301-dsh-shadow-readme-md.md` —— 时间戳**晚于** 16:40:02 重启点，
     且与**本轮实际改过的文件一一对应**（`references.md` / `BACKLOG.md` / `CHANGELOG.md` / `README.md` / `.docs/fix`）。
  3. ✅ **读路径落盘也在工作**：`.shadow/_index.md` 的 mtime = **16:53:52**（与最新记忆同刻），
     说明读侧 `ensureIndex` 的写入同样成功（ADR-0074 的接入点 ③ 生效）。
  4. ⚠ **未单独核验（诚实标注）**：宿主日志侧的 `[dsh-shadow][error] flush FAILED` 未检索到 ——
     会话日志是 `session.v3.jsonl.zstd`（6.49 MB），用 Node 26 的 `zstdDecompressSync` 只解出**首帧 195 字节**，
     改用流式解码后报 `Unknown frame descriptor` ⇒ **未解出全量日志**。
     判据 1 与判据 4 问的是同一件事（落盘失败的可见记录），**判据 1 的可读面已证为空**，故按 1–3 闭环、4 标注未核验。
- **结论**：ADR-0074 的修复**在真机生效**，`Forget ≠ Delete` 之外最重要的一条（记忆能不能落盘）已恢复。
  **不引入新根因层**（判据 5 未触发：既非「参数没传对」，也不是 T6 的兜底根场景）。
- **顺带观察（新线索，未立条目）**：今日 `.shadow/2026-09-12/` 已有 **1034 条**记忆
  （`read_shadow` 索引自报），文件名显示**几乎每次工具调用/每次改文件都产生一条**（如 `2026-09-12--165314-dsh-shadow-references-md.md`）。
  采集粒度与语料规模的关系**未评估**（可能影响 T2 的 85 条 B 类线索分诊与 T9 的召回收益读数）⇒ 记在这里，先不立条目。

---

## 二、待分诊（第 8/9/11 轮已分诊一部分，T1 / T2 / T4 未完成）

> 背景：`v1.15.13`–`v1.15.18` 连续挖出**四类同源缺陷**，共同特征是「**机制是对的，
> 断的是谁调用它 / 谁写这个值**」，而**单元测试全绿**。故做了审计工具
> `tools/audit-wiring.ts`（A 类「导出但生产无调用点」、B 类「只被读、无写入点的判断值」）。
> **工具已标定**（`npm run audit:wiring:selftest`，8 组断言全过），但其输出是**线索不是结论**，
> 必须逐条人工分诊 —— 这部分**只做了一小部分**。

### ✅ T1. 审计 A 类线索 —— **已逐条分诊结案（v1.15.33）**

- **结论**：A 段 **33 条**（实跑计数，原记 30）**全部落格**，结果回写 **`adr/0062`「补记（v1.15.33）」**。
  明细表（含每条的 `文件:行号` 证据）见该节，此处只留结论与**两处对本节的更正**。
- **工具盲区**（本节原写「注释 / 间接调用 / 平行 API」三条）：
  **已在 v1.15.36 逐条实测更正并处理** —— **「注释」记错了，真盲区是「字符串」**（方向也从「误报」更正为**漏报**）；
  ②③ 已**分桶**为 A2a / A3（不伪造精度，改为如实分类）；另发现**第 4 类（传递性死代码，未修）** ⇒ 升 **T10**。
  详见 `adr/0062`「补记（v1.15.36）」。A 类精度低**不是「工具差」**，而是本仓**有意导出测试向 API** 与这些结构所致。
- **两处对原文的更正（原文措辞含糊，此处收紧）**：
  1. **`progressiveDisclosure` / `refineTree` 不是「误报」** —— 原文写「误报，但值得记」。
     准确表述：它们**仅测试消费**（`test/knowledge-engine.test.ts:53,59`），
     生产命中只有 `core/knowledge-engine.ts:8` 的**注释** ⇒ 属「**注释造成的假调用点**」，
     按三选一应落**零引用/仅测试消费**这一格，**不是**「有生产调用点」意义上的误报。
  2. **`renderIntent` 不是「生产有调用点」** —— 它是**零引用**；
     `observer/core.ts:20` 用的是 `intentOf`，渲染在 `:31` 内联 ⇒ 见 ADR-0062 §4。
- **本节未列、但本轮新报出的 3 个符号**（原文那批 30 条没有它们）：
  `renderExperience`（**误报**，`query/query.ts:251` 作回调传入）、
  `auditDrift`（**零引用，已删除**）、`countInconsistency`（**真断线，已接线**）。
- **真断线（唯一一处）**：`countInconsistency` —— 清单自洽检查**生产从未执行**。
  已在 `writeFileSync` **之前**接线 + `process.exit(1)` 拒绝坏清单；
  锁见 `test/toolset-authority.test.ts` **⑥ 接线棘轮**（断言「CLI 调了它」，非「函数存在」）。
- **`ChangeSet` 与 D1 的关系（重要，防误读）**：本轮判 `ChangeSet` 为「接口**可达**」
  （`projection-store.ts:85` 的 store 工厂在生产被调用），而 **D1 说「未接线」仍然成立**
  （无生产**实例化点**）。两条不矛盾：一条说接口可达、一条说没人实例化 ⇒ **D1 维持原判**。

### T2. 审计 B 类线索未逐条分诊（**85 条**）

- **依据**：同 T1；`npm run audit:wiring` 输出 B 段（**计数为 2026-09-11 实跑所得**）。
  **`v1.15.22` 起为 85 条**（原 81）：`tools/*.mjs` 切 `.ts` 后工具开始扫自己，
  新增的 4 条**全部来自 `tools/audit-wiring.lib.ts` 自身的字符状态机**
  （`c === "\\"`、`c2 === "*"` 这类**单字符局部别名比较**）—— 正是下面「短局部变量别名」已记录的噪声类型。
  ⇒ **计数变化有解释、已核对，不是新缺陷**（见 ADR-0064）。
- **已知的主要噪声来源**（不必再逐条看）：
  - `typeof x === "object" | "string" | "number"` 形态（`agent=object`、`nested=string`、`v=object`…）；
  - `mode=*`（mode 由**调用方/模型**传入，属外部输入，分支可达）；
  - `code=ENOENT`（Node 错误码，不由本仓生产）；
  - `type=text-delta | finish`（宿主流事件类型，外部输入）；
  - 短局部变量别名（`st=`、`lc=`、`o=`、`s=`、`v=`、`c=`、`m=`）—— 工具无作用域分析，属误报。
- **仍需核实的少数**（第 8 轮已开始）：
  - **`status=archived`** —— 见 T3；
  - `kind=deleted`（`core/change-set.ts`）—— 与 D1 同源（`ChangeSet` 未实例化）；
  - `status=compared` / `status=explored`（`simulation/guard/reality-boundary.ts:5`）——
    需确认是不是**外部数据**（模拟结果的形态）；
  - `kind=metadata` / `kind=session`（`core/lineage-validator.ts:18`）—— 需确认 `AtomKind` 的取值来源。
- **完成判据**：可疑项核准到「外部输入 / 真断线」；真断线进 D 段。

### T3. 已分诊：`pinned` / `archived` 两个「人工权威状态」**无任何入口**（升为 D4）

- **原线索**：审计 B 类报 `status=archived` 无写入者（`core/forget.ts:18`、`core/lifecycle.ts:28`）。
- **分诊中扩展**（第 9 轮）：**`pinned` 同样无写入者** —— 生产代码只写 `pinned: false`
  （`core/memory.ts:74`、`core/writer-materialize.ts:88`、`query/query.ts:401` 三处），
  **`pinned: true` 全仓零处**（三路 grep 核实：字面量、`pinned:`、`pinned =`）。
- **两者的可达性**：
  | 状态 | 读点 | 语义 | 生产可达？ |
  |---|---|---|---|
  | `pinned: true` | `core/lifecycle.ts:27`（→`TRUSTED`）、`core/forget.ts:17`（→**永不被遗忘**） | 「人工显式信任」 | ❌ **恒为 false** |
  | `status: "archived"` | `core/lifecycle.ts:28`（→`ARCHIVED`）、`core/forget.ts:18`（→**立即遗忘**） | 「人工归档」 | ❌ **无写入者** |
- **判定：这是「已文档化但无入口的能力」，不是「接线断了」**。三条依据：
  1. **`_meta.json` 是 Derived Artifact**（ADR-0003：Memory 文件 = source of truth，
     `_meta.json` 可被 `rebuild-index` 重建）⇒ **手工编辑它会被下次重建抹掉**，
     故「人来改 meta」**不是设计上的入口**；
  2. **没有任何命令 / 工具 / 元数据约定能置 `pinned` 或 `archived`**（已查：插件的工具面只有
     `read_shadow` / `recall_shadow` / `shadow_query`，均无写侧动作）；
  3. **实现与设计声明不一致**：`MEMORY.md:90` 明写生命周期「从 meta 信号派生……
     **不做写侧硬状态迁移**、纯按信号推导」，而 `lifecycleOf` 的两条最前置判断
     读的恰恰是**写侧 `rec.status` / `rec.pinned`**。
- **文档承诺（需一并处置）**：
  - `README.md:35` 承诺「生命周期状态机 `NEW → … → ARCHIVED`」；
  - `README.md:177` 承诺「`pinned` 永存」（`status: stale/superseded/archived` 默认排除）；
  - `README.md:178` 承诺生命周期「`NEW → … → SUPERSEDED/ARCHIVED`（pinned→TRUSTED 优先）」；
  - `MEMORY.md:90` / `CHANGELOG.md:1637` 同口径列出 `SUPERSEDED/ARCHIVED`。
- **为什么这不是「顺手接线」就能解决的**：三条路各有代价，见 **D4**（需决策）。
- **完成判据**：见 D4。

#### T3-orig（保留原始线索，便于回溯）

- 第 8 轮审计输出：`status=archived 读于 core/forget.ts:18, core/lifecycle.ts:28`；
  全仓 `"archived"` 只出现在**读侧**与 `retrieval/rank.ts:103` 的**权重表**，生产无写入点。

### ✅ T5. 漂移审计检测 B 的各键 —— **已结案（v1.15.32）**

- **结论**：真仓库 **11 键逐个复核完毕**，各落「正当分层」或「同形不同义」，**新增 1 处真漂移已修**。
  完整逐键表见 **`adr/0070`「补记（v1.15.32）」**。
- **先修了工具自己的漏报**（这是本轮最值得记的一条）：检测 B 的原正则字符集**不含 `?`** ⇒
  `c?.status === "supported"` 只从 `status` 起匹配，键退化成另一个 ⇒ **与不带 `?` 的归不到一起**。
  后果：**判据源自己**（`world/guard/claim-admission.ts:6` 的 `isAdmissibleClaim`）从 B 段**消失**，
  于是「两处各自重写、没用唯一判据源」这件事**没有任何线索指向**。已修（允许并归一 `?.`）+ 回归锁 ⑤b。
- **真漂移**：`c.status=supported` —— 判据源已存在（`isAdmissibleClaim`），却在
  `world/builder/representation-builder.ts:9`（**同文件已 import 该模块**）与 `query/world.ts:42`
  各手写一遍。性质同 **ADR-0063 / D5**（同一条规则多份实现）。已**收敛**到唯一判据源；
  新锁 `test/claim-admission-single-source.test.ts`（含**源码级棘轮**与**正对照**）。键已消失。
- **附带项（本轮已做）**：台账「两级边界」不变量（`reference` 的 `degradesTo` 必须表明
  「不影响插件行为」/ `provider` 必须给确定性退路 + `provides` + `install`）此前只有一次**实测**、
  **无断言** ⇒ 已加为 `test/toolset-catalog.test.ts` 的 **⑧**。
- **B 段小计**：**11 键 / 28 处 → 10 键 / 25 处**。
- **未做（诚实标注）**：② 的棘轮是**源码级正则**而非类型级 —— 换个写法（`"supported" === c.status`、
  经变量间接比较）会漏；它挡的是最可能的回归形态，不是全部。工具仍未接入自动门禁（**V6** 未变）。

#### T5-orig（保留原始线索，便于回溯）


- **依据**：`adr/0070-drift-audit-tool.md`「未做」；`npm run audit:drift` 的 B 段。
- **现状**：真仓库上 B 段报 **11 个键 / 28 处**（`v1.15.28` 修掉 `name=graph.json` 后从 12/30 降下来）。
  本轮（v1.15.29）**复核了第三个**：`c.kind=provider` / `c.kind=reference` —— **判为正当分层**
  （`toolset.ts` **声明** `kind`（`Capability.kind: ToolKind`，类型必填）↔ `toolset-exec.ts` **消费**它），
  并**顺带实测**了它文档化的边界不变量（`toolset.ts:3`「两级台账必须分清」+ `degradesTo` 规定
  reference 填「不影响插件行为」）：**107 项全满足** ⇒ 边界没糊。
  **但那条不变量仍没有棘轮**（本 ADR 只做了实测，未加断言）⇒ 见下「附带项」。
- **已复核 3 个，全部有产出**：`res.status=not_found`（第 7 处真缺陷）、`name=graph.json`（ADR-0071 真漂移）、
  `c.kind=*`（正当分层 + 边界实测）。
- **未复核的 9 个键**：
  `c.status=supported` / `e.kind=user` / `err.code=ENOENT` / `kind=error` /
  `r.status=unavailable` / `type=anti_pattern` / `type=principle` / `v=string`。
- **附带项（本轮实测得出，未做成棘轮）**：台账「两级边界」不变量（reference 的 `degradesTo` 必须表明
  「不影响插件行为」、provider 必须给确定性退路 + `provides` + `install`）当前 107 项全满足，
  但 **`toolset-catalog.test.ts` 未覆盖它** —— 建议补一条棘轮（改动小、价值明确），
  避免以后加条目时把边界写糊。**本轮未做**（属 T5 的收尾工作）。
- **几个看起来值得优先看的**（**未复核，只是排序依据**）：
  - **`err.code=ENOENT`**（`core/semble.ts` + `evidence/zg.ts`）—— 两处都在判「CLI 未安装」，
    口径若不同会撞 ADR-0049「缺件不静默」；
  - **`r.status=unavailable`**（`core/index-engine.ts` + `query/query.ts`）—— provider 不可用处理。
- **经验**：已复核的三个**全部**有产出（2 个真问题 + 1 个正当分层但顺带发现别的）—— 说明检测 B 的
  产出率比预期高，值得把剩余 9 个逐个过一遍。
- **纪律**：B **只答「同一键出现在多个模块」，答不了「两处口径是否一致」** ⇒ **不得据 B 定罪**；
  生产者/消费者分别表达同一判据在分层架构里**可能是正当的**。
- **完成判据**：11 个键各落「正当（给出分层理由）/ 真漂移（给出修复 + 锁）」二选一，结果回写 `adr/0070`。

### ✅ T4. A 类里「生产与测试引用皆为零」的导出符号 —— **已全部定性（v1.15.33）**

- **依据**：A 类逐条核实（`adr/0062`「补记（v1.15.33）」§4 的处置表）+ **ADR-0070/0071**。
- **已处置**：
  - `isCognitiveAtom` —— **已删除**（ADR-0066）。理由不是「死代码」，而是它的规则与
    `validateAtomProjection` **完全重复**，留着会成为**第四份口径**。
  - `readTemporalGraph` / `readGraph` —— **保留 + 改正 + 收敛**（ADR-0071）：
    它们是持久化层的公开读 API；发现并修掉**顺序 bug**（取到最旧的快照），
    两份近重复逻辑收敛到 `persistence/snapshots.ts`。
    **接线与否另议**：`mode:"temporal"` 的真实读路径是 `buildTemporalGraph`（重建），
    **不应**把 reader 接成缓存（会重蹈 ADR-0069 的「缓存与源头脱钩」）。
  - `auditDrift` —— **已删除**（v1.15.33）。全仓零引用（生产+测试+夹具皆无），
    且它**没有任何信息价值**：只是把两个检测器打包成对象，删掉不减少能力。
  - `isExchangeable`（+ 孪生常量 `EXCHANGEABLE_KINDS`）—— **已收敛**（v1.15.33）：
    `isExchangeable` 曾**再手写一遍**同一三元素数组，而 `EXCHANGEABLE_KINDS` 是唯一源。
    与 T5 的 `c.status=supported` **同型**（同一判据多处表达）。
  - `countInconsistency` —— **已接线**（v1.15.33，T1 的真断线项）。
- **各符号最终定性**（逐条落「接线 / 删除 / 保留并注明」）：

  | 符号 | 处置 | 一句话理由 |
  |---|---|---|
  | `auditDrift` | **删除** | 空壳包装，零引用且无信息价值 |
  | `countInconsistency` | **接线** | 有明确用途注释的生成期校验，此前从未执行 |
  | `isExchangeable` / `EXCHANGEABLE_KINDS` | **收敛** | 唯一源已存在却被重写；类型系统管不到内联字面量 |
  | `renderIntent` | **保留并注明** | 完整形态渲染器（`question`/`desired_outcome`/`constraints`），实际读侧在 `observer/core.ts:31` **内联**只取 `goal`；删除会让完整形态失去唯一落点 |
  | `renderIdentityModel` | **保留并注明** | 同上型：渲染 `IdentityModel`（时间线版本模型），而 `read_shadow` 的身份输出走 `soul/identity.ts` 的 `renderIdentity`（**不是同一对象**）⇒ 写完的模型无专属渲染出口 |
  | `relationForProposal` | **保留并注明**（+ 新风险） | 原文已注「留接口」；**本轮新发现它忽略入参** ⇒ 升 **T7** |
  | `writeMeta` | **保留并注明** | `meta.ts:92` 已声明是「明确要覆盖」的逃生舱；生产写 meta 一律走 `mutateMeta`（ADR-0068） |
  | `isMetadataMemoryText` | **保留并注明** | ADR-0066 已决定保留（服务不 `parseMemory` 的读路径） |
  | `hasNoUpgradeApi` | **保留（暂不处置）** | `agency/guards.ts` **唯一**未被 `agency/engine.ts:4` import 的导出（同文件另 15 个都被用）；「遗漏接线」还是「有意保留」**本轮未判定**，且删它要动 invariant 面 |
  | `progressiveDisclosure` / `refineTree` / `renderRetrieved` | **保留并注明** | `adr/0048 ①/②` 的目标能力，实现完整；**是否启用属产品决策**（默认路径可能刻意不做成本折叠）⇒ 见 T1 |
  | 7 个 delegation `assert*` 包装 | **保留并注明** | 「谓词接线、`assert*` 不接线」是**一处决定**，不是 7 处缺陷；按**家族**加注，不逐条删 |

- **四处代码注释已加**（供后续读者不再重复分诊）：
  `delegation/guard/expansion-guard.ts`（家族级）、`core/knowledge-cost.ts`、
  `core/intent.ts`、`identity/timeline.ts`。
- **两个仍未决的产品问题**（**不是「没做」而是「需你拍板」**）：
  ① `progressiveDisclosure` / `refineTree` 该**接线**还是**有意不启用**？
  ② `renderIntent` / `renderIdentityModel` 该**并入某条读路径**还是长期作为备用渲染器？
  ⇒ 这两问都属 `adr/0048` 的目标能力范围，**本轮不擅自决定**。
- **完成判据**：~~余 6 个各落「接线 / 删除 / 保留并注明理由」~~ → **已达成**（上表逐条落格）。

### T6. 兜底根场景仍走**部署 fallback** —— ADR-0074 **明确未覆盖**的那一半

- **依据**：`adr/0074-write-sandbox-policy-omitted.md`「负 / 已知边界」第一条；
  `core/scope.ts` 的 `DEFAULT_SHADOW_ROOT`。
- **现状（本轮实测确认的边界，不是推测）**：ADR-0074 的修法是「写入携带**该会话自己的**策略」，
  而策略只能从 `session` 求得。但 `resolveShadowScope` 在**既无显式 root、又解析不出 session cwd** 时
  会落到兜底根 `~/.dsh-observer/shadow` —— **那一刻没有 session 可问**，`sessionPolicy` 返回 `undefined`，
  门面恒等返回原 fs ⇒ 该场景下写入**仍走部署 fallback**（`process.cwd()` + `workspace-write`）。
  兜底根几乎不可能落在 `process.cwd()` 之下 ⇒ **该路径的写入仍会被围栏拒绝**。
- **为什么这是独立的待办而不是「顺手再修」**：它**不是补一个参数能解决的** —— 需要先回答
  「**兜底根这条路径本身是否该存在**」：
  | 处置 | 代价 / 前提 |
  |---|---|
  | ① 取消兜底根，改为「无 session 就不写」 | 与 `scope.ts:13` 的注释口径冲突（那句写的是「保证**可写**，而非不写」）⇒ 要先改口径，并确认没有依赖该根的历史数据 |
  | ② 保留兜底根，但显式落一条「本写入未受会话授权」的可见信号 | 需定义信号形态（`lastFlushError` 已有前例），并确认不违反 ADR-0049「缺件不静默」 |
  | ③ 维持现状 + 文档写明该场景不受支持 | 最省，但须知这是「已文档化的不可用路径」而非「能用」 |
- **注意（防过度表述）**：本条的**优先级低于 B3** —— B3 是「主路径（会话工作区）全失效」，
  本条是「边角路径（兜底根）未覆盖」。真机上主路径一旦恢复，本条可能长期不被触及。
- **完成判据**：三选一落定；若选 ①②，须附一条能复现该场景的测试（无 session + 无显式 root）。

### T7. `relationForProposal` **忽略入参**（本轮新发现，零引用所以当前无害）

- **依据**：`adr/0062-wiring-audit.md`「补记（v1.15.33）」§5；T4 分诊时顺带发现。
- **现状（读源码核实）**：`temporal/edge.ts:30`
  `export const relationForProposal = (_n: any): TemporalEdge["relation"] => "evolved_into";`
  —— 形参名带下划线前缀 = **有意不用**，恒返回常量。
- **为什么现在无害、将来有害**：它当前是**零引用**（`adr/0062` 补记 §4 已登记「保留并注明」），
  所以不影响任何行为。但**一旦按名字接线**（例如让 `TemporalEdge.relation` 由它决定），
  调用方传什么节点都会被**静默丢弃**、统一成 `evolved_into`。
- **与 `c.status=supported` / `isExchangeable` 那两族的区别（重要，别混为一谈）**：
  那两族的危险是「**口径分叉**」（同一判据多处表达，其中一处漂移）；
  这一处的危险是「**掉参数**」（签名收了参数却不用）。**两种都要修，但测法不同** ——
  口径分叉可加「唯一源」棘轮；掉参数只能靠**行为断言**（传不同节点必须得到不同关系，或明确删掉形参）。
- **现有注释的不完整处**：`temporal/edge.ts:29` 已写「保留：…v0.26 不跑 reflection，留接口」，
  但**没写**「它忽略入参」这一点 ⇒ 本轮已在代码注明。
- **完成判据**：三选一 —— ① 接线并让 relation 真正由入参决定（附行为断言）；
  ② 删除（并确认 `TemporalEdge.relation` 的取值不依赖它）；③ 保留并**改签名去掉未用形参**
  （`(_n: any)` → `()`），使「它不消费输入」在类型层面显式。

### T8. **静默降级** —— ADR-0049 的 7 条候选缺陷 + 2 处开关缺陷（D8 实测产出）

- **依据**：`adr/0073-hl-mem-benchmark.md` §2 行① / §3（D8）；**D8 实测**（逐条读代码，见 `README.md`「默认开关」表的**降级行为**列与表注）。
- **判据**：ADR-0049 的枚举是「`unavailable` 状态 / flush warn / debug trace **三者至少一个**」——
  **`console.log` 不算**。据此，以下 7 条关掉或缺件后**行为退到某处却无任何可见信号**：

  | # | 能力 | 位置 | 静默形态 |
  |---|---|---|---|
  | 1 | `llmRecall` | `core/writer.ts:62,64,73` + `core/writer-llm.ts:37` + `query/reads.ts:94-96` | 回退确定性 `renderRecovery` **无标记**；`label:""`（`writer.ts:70`）使 catch 的日志分支也不触发 ⇒ **连 log 都没有**（最彻底） |
  | 2 | `summary` | `core/writer-materialize.ts:70,72,80,180` + `writer-llm.ts:22,31` | 缺 llm/route/finish 出错**均提前 `return ""`**（不记日志）⇒ 文件里只是「没有摘要」，与「尚未生成」不可区分 |
  | 3 | `recall`（语义 B 档） | `core/writer.ts:94,96` + `query/query.ts:159-164` | `expandTerms → []`，输出与「本来就没配」完全一致。`README.md` 自己写「**静默**退回 A 档」= 文档已承认，但代码未给三条信号中任何一条 |
  | 4 | `queryLog`（**默认开**） | `query/observatory.ts:76`（`catch {}`，注释自陈「写失败静默」） | 观测数据丢失，读侧显示「尚无记录」⇒ 与「从没查过」不可区分。**默认开启项里的静默 ⇒ 优先级最高** |
  | 5 | `recall.cooldownTurns` | `retrieval/ledger.ts:11-13`（读失败静默当空台账）+ `:21-23`（写失败仅 `console.log`） | 冷却**静默失效**；`README.md` 亦自陈「写失败降级为『不去重』」 |
  | 6 | `projectionStore` | `core/projection-store.ts:58,61,171-180` | 缓存读失败/坏行 → 全量重建，零信号。**区别于前五条**：结果**仍正确**（ADR-0049:38 明列「缓存不是真相」），只损失性能 ⇒ **优先级最低** |
  | 7 | `episodes` | `core/writer-materialize.ts:37`（解析失败静默）、`:165-167`（derive 失败仅 log）、**`:173-175`（写 `_index.md` 失败仅 log）** | ③ 最重：`read_shadow()` 无参读到**静默陈旧**的索引 —— 与 **ADR-0069 同族**，而 ADR-0069 只修了「新鲜度问源」，**未给 rebuild 失败加可见信号** |

- **另两处**开关/取默认值缺陷（同轮实测产出，**不是降级问题**）：
  1. **`episodes` 关不掉**：`showInIndex: 0` 被 `core/writer-core.ts:69` 的 `|| 8` 吞掉 ⇒
     `writer-materialize.ts:161` 的 `episodeShow > 0` **恒真（死分支）**；`gapMinutes: 0` 同样被 `|| 60` 吞
     ⇒ 两处 `Math.max(0, …)` 永不生效。**根因**：用 `||` 取默认把「显式 0」与「未传」混为一谈。
  2. **`kg` 被排在「默认」列**却不是 config 键（只是 per-call 参数）⇒ 已在 README 表注⑤标明。
- **已在本轮修掉的同类（第 3 处）**：`knowledgeEngine.enabled` **生产零读取** ——
  `query/reads.ts:141` 无条件建树、`createKnowledgeEngine` 收 `config` 却从不使用（**已删死形参**）。
  ⇒ 原文档声称的「默认关 / `enabled: true` 启用」是**一处不存在的开关**，已在
  `core/types.ts:36` 与 README 表注④就地校正。**这是本轮 D8 唯一的代码改动。**
- **为什么现在没做（诚实标注）**：7 条各需**不同的可见信号形态**（有的该打 warn、有的该在输出里加标记、
  有的该复用已有的 `flushWarn` 横幅），且第 6 条按 ADR-0049 的「缓存不是真相」**可能根本不该报**。
  ⇒ 逐条定形态是**独立工作量**，本轮只做**清点与立账**（D8 的授权范围是「补表 + 记缺陷」）。
- **完成判据**：7 条各落「补可见信号（给形态 + 测试）」或「判定为正当静默（给 ADR-0049 依据）」；
  两处开关缺陷各修（`||` → `??` 或显式 `undefined` 判定）+ 加锁。

### T9. sidecar 的**读路径收益**与**真机规模**均未测（D6 交付后的诚实缺口）

- **依据**：`adr/0075-directory-l0-l1-sidecar.md`「负 / 已知边界」与「未验证」。
- **现状（本 ADR 明确未做）**：
  1. **召回收益未测** —— 本轮只做到「`_index.md` 引用 L0」，**未改检索排序** ⇒
     「sidecar 是否真的改善相关性判断」**没有评测**，**不得表述为已验证**。
     若要接进检索，属**检索层改动**，需先有评测口径（可参考 `adr/0060` 的判别层结论与 `tools/retrieval-eval.ts`）。
  2. **真机规模与耗时未测** —— 每次索引重建为**每个日期目录**写一份 sidecar；
     本仓真语料 **7000+ 条记忆**、日期目录数量级为**数十到数百** ⇒ 写入次数有界，但**未实测**。
  3. **存量回填未做** —— 旧目录的 sidecar 要等各自索引重建才生成；**不做一次性全库回填**
     （避免一次几百次写入 + 一次全量读）。
  4. **L0 抽取质量未评** —— 它只是 L1 的确定性首段（**不含判断**，判断属读侧 ADR-0042/0043）。
- **特别注意（防过度表述）**：`pending` 字段**恒为 0 是构造性的** ——
  sidecar 与 `_index.md` 用**同一份 `recs`** 派生 ⇒ 不可能落后。
  它当前**只在棘轮/构造坏件时有意义**，**不是**「会真实报警的增量检测」。
  若将来出现「增量更新 sidecar」的路径，才需要让它真正承担检测职责。
- **完成判据**：① 给 sidecar 设计一条**可评测**的读路径（或明确决定不接）并记录读数；
  ② 真机报告 sidecar 数与写入耗时；③ 明确「是否回填」并执行或记录不做的理由。

### T10. **传递性死代码**：调用点全在另一段死代码里，工具却说「有接线」（v1.15.36 新发现）

- **依据**：`adr/0062`「补记（v1.15.36）」§4；处理工具盲区①②③时**顺带发现**。
- **实测事实（`grep notRevoked` 全仓核实）**：`notRevoked`（`delegation/guard/revocation-guard.ts:5`）
  **有 2 个调用点**（`:7`、`:8`），故它**不在 A 段**（工具认为它「已接线」）；
  但这 2 个调用点**都在 `assertNotRevoked` 内部**（`:6`），而 `assertNotRevoked` **自己零调用**（落在 A3 桶）。
  ⇒ **`notRevoked` 事实上不可达，工具却报「有接线」**。
- **性质（与前三类不同，需单独记）**：

  | 类 | 形态 | 工具表现 |
  |---|---|---|
  | ① 字符串 | 把**非调用**看成调用 | 漏报 |
  | ② 间接调用 | 把**真调用**看成没有 | 误报 |
  | ③ 平行 API | 把**成对导出的一半**看成断线 | 误报 |
  | **④ 传递性死代码** | **数到了调用点，但那调用点在死代码里** | **漏报（且毫无迹象）** |

- **为什么本轮不修**：这需要**调用图 / 可达性分析**，纯文本判据做不到。
  本工具的设计定位是「**线索发现器**」（原 ADR 已明写），加一张调用图等于换一类工具。
  ⇒ **本轮只登记，不实现**；已把该形态写进工具输出末尾的「判定纪律」，让读者知道这个洞存在。
- **本仓的暴露面（诚实的量）**：真语料里**只找到 1 处**（`notRevoked`）。
  原因是本仓的家族模式是「**谓词接线 / `assert*` 包装仅测试消费**」，
  故大多数谓词**有独立的真调用点**（不是靠 assert 包装才被用）。
  但**同一模式换一处接线就会批量产生**这类不可达 ⇒ 值得记，不必立刻建调用图。
- **完成判据**：三选一 —— ① 引入调用图/可达性分析（明确代价与依赖，属换工具）；
  ② 用「**A3 桶的成员若其内部只调用了某符号，则那些符号标记为『经由断言包装间接使用』**」这一**近似判据**
  给出更粗但可用的信号（文本可做，但会有假阳）；③ 明确接受该盲区并在工具输出里显式声明（本轮已做）。

### T11. 评测纪律：**留出集**与「烧语料前的前置冒烟门」（hl_mem 深读第二遍的产出，`adr/0076`）

- **依据**：`adr/0076-hl-mem-deep-read-2.md` §4 / §5；hl_mem 的 `evaluation/README.md` 与其 `docs/adr/0004` §8。
- **它踩过的坑（量化，非转述）**：v0.30.0 状态实验在**同一份 400-bundle dev** 上反复调参取得 **13/13**，
  却在**独立 held-out-r5 仅通过 3/13**，并产生 **27 条错误 edge / 3 条反例误 supersede** ⇒ 整批撤回。
  它的对策是**三层数据**（开放 calibration / 冻结 validation A / 冻结 validation B，A/B **并行构建、
  不同时间窗与 salt**）、**「不得针对 A 修改后拿 B 当补考」**，以及一条极强的门：
  **「任何 sealed/held-out 语料开始提取前，必须先运行零 LLM 的完整缝合线冒烟；命令失败时不允许烧语料」**。
- **本仓现状（诚实评估）**：
  - 两个审计工具的标定（`audit-wiring.selftest` / `audit-drift.selftest`）用的是**同一份夹具 + git 历史真缺陷** ——
    这是**自证**，**没有留出集**；`tools/retrieval-eval.ts` 也**没有** A/B 冻结集。
  - **但照搬两层 400 案冻结集属过度设计**（本仓无 CI、无 LLM 写入路径、语料是自有记忆、规模小）。
- **本轮只取两条与本仓同形的**（这是本条的**全部**范围，不多做）：
  1. **held-out 与 dev 分离** —— 哪怕各 20 例。判据：审计工具/评测的调参语料与**报告用**语料**不同源**，
     且**报告用那份在调参期间不得被读**。
  2. **「先冒烟，再花代价」的显式门** —— 本仓的对应物是「构建 + 类型门」（已在做），
     缺的是**把它写成一道显式前置**：**跑任何评测/长耗时验证前，先跑 `npx tsc --noEmit` + `npm run build`；
     失败就不跑评测**（避免把一次编译错误伪装成一次评测结论）。
- **为什么记成待办而不是立刻做**：需要先定**用哪份语料当留出集**（本仓语料是**用户自己的真实记忆**，
  把它切成 dev/held-out 涉及**在真实语料上调参**的伦理与可比性问题）—— 那是决策，不是实现。
- **完成判据**：① 定「留出集用什么语料、谁不读它」并落地一处可用留出集的评测；
  ② 前置冒烟门写成脚本或文档中的显式一步。
- **进度（v1.15.38 / ADR-0077 D2）**：**② 已完成** —— 门从「构建 + 类型门（靠人记得跑）」
  升级为**单一命令** `npm run verify` = 工具类型门 + 插件类型门（`tsc --noEmit`）+ 构建 +
  **全部 45 项确定性检查**（43 行为测试 + 2 工具自检），由 `tools/run-tests.ts` 串行驱动。
  **① 仍未做**（待语料决策）。该门**当轮即抓到两处既有失败**（见 T12 与 CHANGELOG v1.15.38）。
- **进度（v1.15.39 / ADR-0078 D3）**：**① 第一次有了可照抄的形态**（此前本仓**连一条 A/B 协议都没有**）。
  hl_mem 的 `docs/research/2026-09-04-p1-extraction-ab-v2-protocol.md`（一手读 `:1-42`）给出五条同形要件：
  ① **预注册**：`:3`「装备就绪、**尚未执行**」—— 判据先于数据写死；
  ② **单变量**：`:7` 两臂共享 prompt/模型/数据/reader/scorer，唯一变量一行；`:22-25` 给出那一行 diff；
  ③ **每臂只跑一次**：`:37`「不得看单题结果后改 prompt、阈值、样本、配置或重跑并沿用 `v2` 名称」；
  ④ **付费前身份 hard gate**：`:39-41`（Git HEAD / 包路径 / 配置 SHA-256 / key 前缀）——防「跑的不是这份代码」；
  ⑤ **无效传播**：`:73-76` 任一臂身份无效 ⇒ **整轮 A/B 无效**（即使另一臂分高也不作因果结论）。
  另有 `c-series-relation-experiment-protocol.md`（子代理回报）的 **dev/sealed 分离 + 题面外置 + 造臂人不得看题面**。
  ⇒ **本条的 ① 现在只差「定用哪份语料当留出集」这一个决策**（伦理问题不变）。
- **进度（v1.15.40 第 3 轮 / `adr/0080` §5，MemStrata）**：**又多了一条「可用测试强制的评测不变式」**——
  **marker-free**：语料里**不得出现任何文本过期标记**（`[OUTDATED]` / `(legacy)` / `deprecated` …），
  否则基线可以**读标签**而不是靠时间机制得分（「silently inflating its score」）。
  它的可执行形态可直接照抄三点：① 不变式**由测试强制**（不靠自觉）；② **按词边界**检测 tell
  （避免 `new` 命中 `renew`）；③ **量化污染**：去掉一个 `[OUTDATED]` 标记后，重排臂掉 **14 点**、纯门控臂掉 **18 点**，
  而时间法只动 **-4** ⇒ **用「对照组掉多少」证明污染真实存在**。（原文见 `adr/0080` §5 引用。）

### T12. **时间炸弹 fixture** —— ✅ **已闭环（v1.15.43）**：22 个文件逐条判定，**只有 1 个真炸弹（2 处断言，已修）**，引爆日 **2027-01-02**

- **依据**：`CHANGELOG.md` v1.15.38 §5；`adr/0077` D4.2。**已引爆的一颗（v1.15.38 已修）**：
  `test/recall-attribution.test.ts` 场景 30 硬编码 `2026-09-05` 而 `stale = ageDaysOf(rel) >= staleDays`（默认 7）
  ⇒ 本地 `2026-09-12` 当天整片塌成 `DECAYING`。已改为**相对今天**。
- **本轮口径修正（先纠自己的数）**：题面记「12 日期 / 354 处 / **8 个文件**」，**实测是 12 日期 / 357 处 / 22 个文件**
  （口径：`test/` 下 `*.ts`，occurrence 级 `[regex]::Matches`；`09-07` 实为 **87**、`09-01` 实为 **12**，其余 10 个吻合）。
- **判定方法（可复现）**：① 逐文件读断言，看是否依赖「今天」与某阈值之差（`ageDays`/`staleDays`/`hotness`/`halfLife`/
  `recency`/`today()`/`Date`）；② **行为探针**：把 `new Date()`/`Date.now()` 钉到假日期后逐文件 import 运行，
  在 **2027-06-01 / 2027-10-01 / 2028-06-01 / 2030-01-01** 各跑一遍（约 60 次，零文件写入）；
  ③ 机制探针直接 import `dist/identity/evaluator.js` 打印 `days/recency/status/reasons`。
- **逐条结论**：**耦合（炸弹）1 个**，其余 **21 个文件全部不耦合**，理由逐文件记在
  `CHANGELOG.md` v1.15.43 的表里。357 处的成分：**路径/文件名 264（74%）** + 记忆正文文本 25（7%）+
  assert 期望串 15（4%）= **304 处（85%）不参与任何阈值运算**；余 53 处（15%）是 fixture 元数据，
  **其中只有 `periodTo` 的默认值这 1 处被「今天」消费 —— 那就是这颗炸弹**。
- **真炸弹（已修）**：`test/recall-attribution.test.ts` 场景 58（`:2153`）与场景 60（`:2196`），**同一根因**：
  `putReflection` 的默认 `period.to = "2026-09-05"`（`:2068`）被 `identity/evaluator.ts:48` 当作 `lastSeen`，
  `recency = exp(-ln2·days/90)`，闸门 `recency >= 0.4` ⇒ **本地日期 ≥ 2027-01-02 时 days=119 →
  recency=0.39992 < 0.4 ⇒ status 由 `accepted` 变 `candidate` ⇒ 不提 v2 / `learned` 不增**。
  实测 bisect：`2026-12-31`/`2027-01-01` **PASS**、`2027-01-02`/`01-03`/`01-10` **FAIL**。
  **修法**：`:2068` 一行 `to: opts.periodTo || today()`（与场景 30 的既有修法同形）。场景 60 此前**被 58 掩盖**
  （文件在 58 先抛错中止），同一行修法一并解决。**修复后 `node test/recall-attribution.test.ts` = ALL PASS ✅**。
- **同轮记账（语义漂移，不是红）**：场景 55/56/57（同样用默认 `periodTo`）在 2027-01-02 之后 reasons 会**多出**
  「时间稳定不足」，但断言只查「重复性不足 / 反证过多 / 无 v2」⇒ 仍绿，**测试名所述闸门不再是唯一拦截者**。
- **未判定（诚实标注）**：① **未做逐日全量 sweep**（理论存在「非单调窗口」：两项 base 分差为 1 时 recency 加成
  可在 0/1 间振荡）——已逐条排除排序类断言（`recall-envelope:188` 两侧 base 相等、`recall-routing-eval` 的
  entry 命中与次优项 base 差 ≥2、`recall-attribution` 全文件无 `indexOf(` 排序断言），故风险未证为 0 但已无已知路径；
  ② `replay-real.ts` / `replay-metrics.ts` 的 `DATE` 默认值（09-07）是否失真需真实语料才能判（它们**不是断言**，不影响红绿）。
- **完成判据**：① 8 文件 → **实测 22 文件逐个判定** ✅；② 耦合的改成相对日期（1 个文件、2 处断言）✅，
  不耦合的给出理由 ✅（见 CHANGELOG 表）；③ 可选棘轮**未做**（需先有长期稳定的结论面；且真实炸弹已修）。


### T13. **结构性门禁**：分层方向 / 复杂度预算 —— 🟡 **前半已落地（v1.15.41）；后半（复杂度预算）仍未做**

- **依据**：`adr/0078-hl-mem-third-read-clone.md` D3（hl_mem 的 `scripts/check_*.py` 共 **11 个**）。
  最可移植的两个是：
  ① **分层方向检查** —— `scripts/check_imports.py:12-19` 用一张 `FORBIDDEN_IMPORTS` 表声明「哪层不许 import 哪层」，
  `:61-83` 用 `ast.parse` 扫**真实导入**，失败 `return 1`。**本仓的对应物是「`core/` 是纯函数、不得 import 基础设施」
  这条纪律** —— 目前**只是散文**（`AGENTS.md` / 各 ADR），没有任何可执行检查。
  ② **复杂度预算只能降** —— `check_complexity_budget.py`（16 KB）+ `complexity_budget.json`；
  hl_mem 的 plans 写「本期每个热点上限**只能下调**」（`2026-08-30-...phase-5-architecture.md:20`，子代理回报）。
- **完成判据**：① 先写一版 `FORBIDDEN_IMPORTS` 表的**草案并实测存量违规数**（若存量违规很多，说明表定错了，先改表）；
  ② 真违规清零后，把它接进 `npm run verify`（v1.15.38 已有单一入口）；③ 复杂度预算**只在该文件当轮变小时才下调**，
  并在测试里锁「不得上调」。

#### ✅ 进度 A（v1.15.41）：**草案实测即被否掉 → 换判据对象 → 三条门落地并接进 `verify`**

- **① 草案实测**（口径：`*.ts` 递归，排除 `dist / node_modules / .git / .docs / agent-presets / docs / _research / test / tools`；
  **193 文件 / 523 条 import 边**）：
  | 草案禁令 | 存量违规 | 例子 |
  |---|---:|---|
  | `core` 不得碰 `node:fs` | 1 | `core/toolset-exec.ts:19`（它是**执行器**，不是纯派生） |
  | `core` 不得碰 `node:child_process` | 1 | 同上 `:18` |
  | `core` 不得 import `persistence` | 4 | `core/judgment.ts:3` / `core/memory.ts:4` / `core/writer-materialize.ts:12,13` |
  | `query` 不得 import `persistence` | 4 | `query/materialize.ts:4,5` / `query/query.ts:6,7`（读路径**本来就要**读落盘文件） |
  ⇒ **`core/` 不是「纯函数层」，是「脊柱」**（`paths`/`types`/`util` 无依赖；`memory`/`writer-materialize`/`toolset-exec` 有副作用）。
  **照搬目录分层 = 当轮就红的门 = 假闸门** ⇒ **改判据对象**（完成判据 ① 的「先改表」即此）。
- **② 换成三条实测为真的判据，并接进 `npm run verify`**：
  ① **文件级依赖图无环**（实测 **0** 个强连通分量 —— 文件级是 DAG）；
  ② **纯模块白名单零副作用**（`core/paths.ts` / `core/types.ts` / `core/util.ts` / `security/scrub.ts` import 数均为 **0**；
  **带腐化自检**：路径不存在即违规 —— 本轮用不存在的 `core/lexicon.ts` 实测到它**真的会报**）；
  ③ **方向禁令**（当前 **0** 违规：`core↛query` / `core↛tools` / `persistence↛query` / `query↛tools` /
  **任何层↛`index.ts`** / 任何层↛`agent-presets`）。
  **明确不判层间环**：实测**存在** `{core, evidence, persistence}` 层间环，成因就是「core 是混合层」，
  **不是**文件级环 ⇒ 写成禁令则门当场就红（又是假闸门）。CLI 会**打印成因**并留档。
- **③ 落地物**：`tools/audit-layers.lib.ts`（纯逻辑；**复用** `audit-wiring.lib.ts#stripComments`，不写第二份注释剥离器）+
  `tools/audit-layers.ts`（CLI，打印**口径**与非零退出）+ `tools/audit-layers.selftest.ts`（**8 组标定测试**，全合成夹具）+
  `package.json` 新增 `audit:layers` / `audit:layers:selftest`，并把 `npm run audit:layers` 接进 `verify`。
  **门禁状态**：`npm run verify` = **46/46**；`npm run audit:layers` 在真仓库**通过**（193 文件 / 523 边 / 0 环 / 0 方向违规 / 0 未解析）。
- **④ 两个当轮自我暴露（留档）**：**(a)** 标定测试当轮抓到我自己的真 bug —— 层边曾写成
  `.map((e) => ({ from: layerOf(e.from), to: layerOf(e.to), ...e }))`，**`...e` 在后把层名覆盖成文件路径**
  ⇒ **方向禁令永不命中、门恒绿**（正是本仓最爱的「机制对了、断的是谁调用它」那一族；没有标定测试，这个门会安静地什么都不查）。
  **(b)** 默认白名单在**合成夹具**上会**正确地**逐条自曝「腐化」⇒ 想要「零违规」的正对照必须显式清空判据表（已写成断言）。
- **⑤ 方法边界（诚实）**：**不用 TypeScript 编译器 API** —— 本仓 `typescript@7.0.2` 是 **native(Corsa) 移植**，
  包根 `.` **只导出 `version`**（连 `ScriptTarget` 都没有），AST API 在 `typescript/unstable/ast` 这类 unstable 子路径
  ⇒ 说明符抽取是**剥注释后的正则**，不是 AST。**已知边界**：字符串里形如 `from "./x"` 的文本会误命中，命中项须人工复核。

#### ⬜ 进度 B（未做）：复杂度预算 + 拆 `core/`

- **复杂度预算**：hl_mem 靠 AST 量「行数 / 参数数 / 函数体行数」+ 棘轮只降不升。本仓无可用 AST（见 ⑤）
  ⇒ 要么用「文件行数 / 导出数」当代理（**弱判据**，须先说明它与哪种风险对应），要么等 `unstable/ast` 稳定。
  **不先定判据就不写表** —— T13 前半的教训正是「表定错了，门就是红的」。
- **拆 `core/`**：这是消掉层间环的唯一办法，属**架构决策**（把 `paths`/`types`/`util` 这类纯模块与
  `memory`/`writer-materialize`/`toolset-exec` 分开），**不是门禁问题**，故作为候选留在此条下。
- **进度 C（v1.15.40 第 4 轮，hl_mem 门禁面深读的形状清单；全文 `references.md` §6.6）**：
  三个可照抄形状 —— ① **「生成器 + 签入产物 + 门禁逐字比对」三件套**（同形 6 次，唯一更新入口 `--update`/`--write`，
  **缺件即非零** + 失败文案自带更新指引）；② **allowlist 腐化自检**（白名单里的路径/函数**不存在也算违规**）
  —— **已在 v1.15.41 落地**（见 ②）；③ **纪律写成元测试**（`test_test_suite_policy.py:20-22`）。
  **照抄形状时不要照抄它自己的洞**（逐条见 §6.6 表）：比较器零调用、棘轮基线缺件即通过、同一判据两处数值。

### T14. **确定性基准门**：签入基线 + compare 子命令 + 「外部调用即失败」 —— ✅ **已落地（v1.15.42）**，但**本部署里回归门恒「不可比」**（见下「活语料结论」）

- **依据**：`adr/0078` D3。hl_mem 的 `docs/benchmark/core-v1.md`（**我一手读完全文**）：
  `:3-8`「deterministic, public, **zero-network** regression gate … **any external model call fails the run**」；
  `:17-19` 冻结容差（`≤0.01` 回归 / HTTP 100% / forbidden 0 / P95 ≤ `max(baseline+150ms, baseline×1.25)`）；
  `:21-22`「**功能字段与 hash 必须跨两跑逐字相同**，只允许延迟字段可变」；基线**签入**
  `benchmarks/release/results/v0.36.1.json` + `compare_core_v1` 比较子命令（`:13-14`）。
- **本仓现状**：`tools/retrieval-eval.ts`（`npm run eval:retrieval`）**只打印读数**，**没有签入基线、没有 compare、没有回归容差**；
  唯一的门是 `npm run verify`（v1.15.38）——那是**编译+测试**门，**不是评测门**。
  ⇒ 于是「这次评测比上次好还是坏」**无法由机器回答**（只能靠我读两串数字）。
- **为什么现在没做**：需要先定**哪些指标进门**（显式清单，而非隐式全量）、**容差取多少**、以及
  「功能字段两跑逐字相同」在 TS 侧的对应物（浮点/时间戳字段必须先剔除，否则必然抖动）。
  另：本仓记忆语料是**用户真实数据**，基线一旦签入就等于把读数写进仓库 ⇒ 需先确认可公开的范围。
- **完成判据**：① 产出一份带 `dataset_sha256 / protocol_sha256 / case_count` 的基线文件（**signin 前先确认可公开**）；
  ② 加 `npm run eval:retrieval:compare`（比对基线，超容差非零退出）；
  ③ 用它给 **T9**（sidecar 读路径收益）与 **T11①** 的评测提供可机器判读的基线。
- **进度（v1.15.40 第 3 轮 / `adr/0080` §3，MemStrata）**：**拿到了一个可直接落地的「破坏性错误」指标**——
  **`stale-fact-error rate`**：分子 = **以被取代值作答的题数**，分母 = **矛盾题数**（该论文 30/20/20/20）。
  四条随指标必须一起抄的纪律（前三条是它**自己踩过的坑**）：
  ① **两 regime 必须同报**：「允许弃答」与「**强制作答（forced-answer）**」——
     论文原文说后者是为了「expose the stale-commitment that **abstention otherwise hides**」；
     只报允许弃答那一列，弃答会把 stale 错误**洗成低准确率**（Table 3：naive_rag 强制后 0.10→0.40、0.30→0.35）。
  ② **必须印分子/分母**：摘要写「**~0%**」而表体是 `0.03`（**实为 1/30**）⇒ 本仓不得只写百分比（「不伪造精度」）。
  ③ **两指标判据必须独立**：它自陈准确率与 stale 错误**复用同一个 3B 判官**，出现「**同行既正确又 stale 错误**」；
     本仓若同时报「正确率」与「错误关链率」，必须各自独立判定并**显式列出重叠行**。
  ④ **分母为 0 要报「不可测」而非 0**（该论文**未定义** zero-denominator；本仓移植时须自己定义）。
- **进度（v1.15.40 第 4 轮：拿到它的**比较器实现**，不只是散文；全文 `references.md` §6.6）**：
  可照抄的四条**比较层**判据：
  ① **协议常量与代码分离**：`benchmarks/release/core_v1_protocol.json`（**9 行**）冻结
  `max_metric_regression` / `required_external_model_calls` / `required_forbidden_hits` / `required_http_success_rate` /
  `baseline_tag` ⇒ 改容差 = 改**数据**并被 diff 审阅，不是改代码。
  ② **先证同源、再比数值**：`compare_core_v1.py:28-30` 先校验 `dataset_sha256` / `protocol_sha256` / `case_count`
  **逐字相等**，任一不等直接失败（防拿换了语料的读数比）。
  ③ **门控指标显式列名**（`:12-19` 6 元组），不是「全部指标」；容差失败信息**同时给实测退化量与允许量**（`:38-41`）；
  ④ **「外部调用必须为 0」在比较层再判一次**（`:43-55`），不只靠运行期守卫。
  另外两条**更硬的形式**（第二套独立实现，`tests/eval/`）：**基线写入拒绝覆盖**（`ci_gate.py:136-139` `FileExistsError`，
  防重刷基线掩盖退化）、**基线带来源档位**（`gate_check.py:36-38` `ci_fixture` 基线不得用于发布决策）、
  **逐 slice 门控且缺 slice 即失败**（`:66-78`）。
  **它自己缺的两件事（本仓必须补，否则同样是假闸门）**：`compare_core_v1.py` **在任何 workflow 里零调用**；
  「两次运行功能字段逐字相同」**只有散文、无脚本**（`docs/benchmark/core-v1.md:21-22`）。

#### ✅ 进度 D（v1.15.42）：**已实现并接线** —— 含一条**本仓特有、必须写下来的结论**

**落地物**：`tools/retrieval-eval.lib.ts`（纯逻辑）· `tools/retrieval-eval.protocol.json`（**冻结协议**：
`gated_metrics` = `recall_mean` / `noise_offtopic_mean` / `avg_returned_mean`，方向 `higher`/`lower`/`exact`，
容差 `0.01`/`0.01`/`0`，`required_external_model_calls: 0`）· `tools/retrieval-eval.baseline.json`（**签入基线**，
`provenance: local_dev_aggregate_only`）· `tools/retrieval-eval.selftest.ts`（**12 组标定测试**）·
`tools/retrieval-eval.ts` 新增 5 个模式（`--json` / `--check-baseline` / `--update-baseline` / `--compare` / `--determinism-check`）。

**逐条兑现完成判据**：① 基线含 `dataset_sha256`（`sha256-utf8-lf-v1`，用**仓库相对路径**⇒ 与机器/盘符无关）+
`protocol_sha256` + `case_count`；② `npm run eval:retrieval:compare`（退出码 **0 通过 / 1 违规 / 3 不可比**）；
③ 给 T9 / T11① 提供可机器判读的读数面。

**同时补掉 hl_mem 自己的两个洞**：**(a)** 比较器**不再零调用** —— `--check-baseline`（完整性：协议自检 / 基线只含聚合面 /
协议同源 / 门控读数齐备）**已接进 `npm run verify`**，标定测试也自动进 `run-tests`；
**(b)** 「两跑功能字段逐字相同」**从散文变成脚本** —— `--determinism-check` 在同一进程跑两遍并逐字节比对，真仓库**通过**。

**「外部调用即失败」**：运行期把 `globalThis.fetch` 换成**抛错桩 + 计数**（hl_mem 同形），
计数进入结果对象并由比较器再判一次（`required_external_model_calls: 0`）。

**🔴 本仓特有的一条（与 hl_mem 的冻结语料根本不同，必须记住）**：
> hl_mem 的语料是**冻结数据集**，所以基线可以用 dataset 哈希钉死。本仓语料是**活的 `.shadow` 记忆**
> （插件每个回合都在写新记忆 —— 实测两次调用之间语料就从 1414 条涨到 1435 条）。
> ⇒ **哈希钉死的基线在本部署里恒「不可比」**（这正是 `--compare` 的实测输出）。
> 故本模块把「不可比」做成**显式的第三种结论**（退出码 3，既不是通过也不是失败），
> 与已吸收的「分母为 0 要报『不可测』而非 0」同一条纪律。
>
> **可执行的判据因此分两层**：
> | 层 | 命令 | 在本部署是否可用 |
> |---|---|---|
> | **确定性**（同输入两跑逐字相同） | `npm run eval:retrieval:determinism` | ✅ **恒可用**（与语料是否变化无关） |
> | **完整性**（协议/基线形状/同源/读数齐备） | `npm run eval:retrieval:check`（**已在 `verify` 里**） | ✅ 恒可用（不依赖语料数值） |
> | **回归**（比基线、超容差即失败） | `npm run eval:retrieval:compare` | ⚠ **只在语料冻结时可用**；本部署的正常结论是「不可比」 |
>
> **要真正启用回归门，唯一路径是「冻结语料」**：把一份 `.shadow` 快照放到别处，
> 用 `SHADOW_EVAL_ROOT=<冻结工作区>` + `--update-baseline` + `--compare`。
> **是否物化这样一份冻结副本＝用户取舍**（会把真实记忆复制一份到新目录），**故本轮没有替用户做**。

**顺路修的真缺陷**：`retrieval-eval.ts` 的默认语料根**硬编码 `D:/project/dsh1`**，而本机工作区在 `G:\`
⇒ `npm run eval:retrieval` 此前一直在**空语料**上跑（`docs=0` 还「跑得通」）。现默认由文件位置推导 + 环境变量可覆盖 +
**找不到 `.shadow` 或语料为空时非零退出**（缺件不静默）。

**本轮自我暴露（留档）**：把全文件的 `console.log(` 批量替换成 `emit(` 时**把 `emit` 自己的函数体也换掉了**
⇒ `emit` 递归自调 ⇒ `Maximum call stack size exceeded`。**改名/批量替换是「断的是谁调用它」的高发区**，
已在代码注释里写明，并靠 `--determinism-check` 的一次真实运行抓到。

### T15. **Protected Contract Registry**（本仓**完全没有**兼容性政策）—— 用户 2026-09-12 指定为**下一阶段的主产物**

> **用户原话要点**：T15 的产物**不要只是「受保护文件清单」**，而要是 **Protected Contract Registry**：
> **Contract ≠ API list**，而是 **Surface + Semantics + Stability + Allowed Drift + Verification**。
> 建起来之后，**D1/D2/D3 与 A 段 6 条会从「拍脑袋决策」变成「按契约机械判定」**。
> **顺序**：T8 → **T15** → D1/D2/D3 → A 段（**不要先拍 D1**）。

- **每条契约必备字段（10 项，缺一不得入册）**：
  | 字段 | 含义 | 本仓的例子 |
  |---|---|---|
  | `id` | 契约标识（带版本，如 `recall-output-v1`） | `mode` 串 / 工具名 / 落盘文件名格式 / 派生件格式 |
  | `surface` | 面的类型（public-api / 配置键 / 落盘格式 / 派生件 / 工具 schema / prompt 段） | 逐项标注 |
  | `owner` | **谁拥有这个概念**（哪个一级模块）；含「**它不得拥有什么**」 | 见下面的模块归属表 |
  | `semantic meaning` | 这条契约**对使用者意味着什么**（不是字段列表） | 例：「`read_shadow` 的返回值是**数据不是指令**」 |
  | `stability level` | `hard`（不许变）/ `soft`（可变但要窗口）/ `experimental`（无承诺） | 本仓**不自造** `stable/beta/experimental` 三档定义（D8 已判），用这三档**内部语义** |
  | `allowed changes` | 允许的演进（如 `additive: true`） | 加字段可以、改语义不行 |
  | `forbidden changes` | 明确禁止（如 `semantic narrowing`、静默改默认值） | 与 ADR-0063/0070 同族 |
  | `evidence` | 判据来源（`文件:行号` / ADR / 实测） | 一律可点 |
  | `verification` | 哪条测试/门禁**真的在守它** | 指向 `test/*.test.ts` 或 `tools/*` 门 |
  | `ratchet` | 哪个棘轮桶覆盖它（没有就得说明为什么不需要） | 指向 `audit-ratchet.baseline.json` 的桶 |
- **模块归属表（用户要求，每个一级模块一张小表）**：`| Module | Owns | Reads | Writes | Must not own |`
  —— 目的不是文档，而是**暴露「谁开始越权」**。本仓一级模块：`core` / `persistence` / `query` / `retrieval` /
  `recall` / `evidence` / `validation` / `verification` / `observer` / `identity` / `soul` / `temporal` /
  `continuity` / `world` / `reality` / `federation` / `delegation` / `adaptation` / `planning` / `action` /
  `simulation` / `reflection` / `dream` / `long-horizon` / `agency` / `security` / `index.ts`。
- **D2 必须细分**（用户第 8 条）：不能统一叫 `drift`，要分 **名称漂移 / 结构漂移 / 语义漂移 / 行为漂移** ——
  否则会把「无害重命名」与「真正兼容性破坏」混在一起。
- **D3 的再框定**（用户第 8 条）：若 T15 明确「**旧的大对象不是 protected、新的细粒度对象才是**」，
  则 D3 不再是兼容性问题，而是 **允许的 breaking internal refactor** —— 这会大幅减少历史包袱。
- **D1 的再框定**：若 `ChangeSet` **没有生产消费者 / 没有验证价值 / 没有外部契约** ⇒ **删**，不为「将来可能有用」保留。

- **依据**：`adr/0078` D4c。本仓的**公开面**是「工具名 + `mode` 串 + 配置键 + 落盘格式」，
  但**没有任何兼容性政策文档**；而 **ADR-0050 做过一次硬切**（v1.13.0 把旧 `mode` 名**直接废止**、并写明
  「非『mode 串永远不变』」）——**那次没有任何弃用窗口**。使用者是真人（用户自己的会话），
  所以「改名/删 mode」的代价目前**全靠 CHANGELOG 的可读性**承担。
- **hl_mem 的形态（可照抄，均为子代理回报 + 我抽查 `compatibility.md` 段落）**：
  ① **先枚举受保护契约面，再定义破坏** —— `docs/compatibility.md:10-12`（稳定契约 = REST/MCP/CLI/配置 schema/
     导入导出/备份格式/插件 API；移除或非兼容改动**必须等下一个 major**）；
  ② **弃用强制前置，且必须点名替代品或明说「无替代」** —— `:20-29`（「whether or not a replacement exists」）；
  ③ **三档稳定性各有变更预算** —— `:33-35`（stable 只在 major、beta 只在 minor 且 changelog 必须带迁移说明、
     experimental **无窗口**但必须**就地可见标注**）；
  ④ **未知版本显式失败，不猜** —— `:74-75`；
  ⑤（相关）**不可逆变更前的恢复集 + 把 rollback 的数据丢失写出来** —— `:62-70`。
- **为什么现在没做**：这是一份**政策**，一旦写下就要**约束以后的自己**（每次删 mode 都得先走弃用期）；
  而本仓目前只有**一个使用者**，硬套 major/minor 三段式可能**形式大于实质**。
  ⇒ 需要先定「本仓的『稳定面』到底是哪几项」——那是决策，不是实现。
- **完成判据**：① 列出本仓的**受保护契约面清单**（工具名/mode 串/配置键/落盘格式/派生件格式，逐项标 stable 或 experimental）；
  ② 给出一条**最小弃用流程**（旧名保留一个版本 + 输出可见提示 + CHANGELOG 写迁移说明），
  并说明**「无替代品」时怎么写**；③ 把清单放进 `README.md`（而非另开一份易漂移的文档）。

### T16. **平台契约核对与纠错**（v1.15.39 新开）—— ✅ **已结案（v1.15.43，四项全闭）**

- **依据**：v1.15.39 深读 DSH 本体（本地克隆 `dsh-w/deepseek-harness`，`cd5ef81481` = **0.1.2-alpha.1**；
  **运行体是 `dsh-web-app@0.1.5-rc.2`**）⇒ 四路回报里**7 条「下游可能理解错」**。已自查 1 条、已裁定 1 条：
  - ✅ **已自查（无缺陷）**：本仓 `index.ts` / `dist/index.js` **无 `export default`**
    ⇒ `unwrapExports` 会「静默丢弃整个命名空间（含 `inject`）」那条缺陷**不适用**（`postmortem/0001:110-111`）。
  - ✅ **已裁定并落 `adr/0074` 补记**：省略 `sandboxPolicy` **合法**（`dsh-fs-sandbox/index.js:158` 用 `??` 回退），
    但**无参 `resolve()` 取服务级根**（`dsh-sandbox-policy/lib/index.js:116-117` `config.workspaceRoot ?? process.cwd()`），
    只有 **`resolve({session})`** 才用 `session.header.cwd`（`:138-142`）⇒ **ADR-0074 结论成立、机制表述已修正**。
- **待办（逐条可核，未做）**：
  1. ✅ **已结案（v1.15.40 第 2 轮，运行体 Service 目录）**：`ctx.sandboxPolicy` **在运行体里是注册服务、
     且对普通插件可见**——平台自身给出两种接入方式：`access.optional = {expression:"ctx.get(\"sandboxPolicy\")",
     requiresUndefinedCheck:true}` 与 `access.hardDependency = {inject:["sandboxPolicy"]}`；
     契约原文「**A session cwd is its workspace-write boundary; the configured root is the fallback for
     agentless calls and sessions without a cwd.**」逐字印证 ADR-0074 补记。
     **并且**：本仓 `core/fs-scope.ts:34-35` **本来就是委派**（`ctx.get("sandboxPolicy")` → `.resolve({session})`），
     **没有重造** —— 上一轮「重造」的判断**是我的误判**（据子代理表述下结论、未读自己的代码），已在 `MATERIALS.md` 更正。
     **本轮改的只有 `core/fs-scope.ts` 的注释**：把「包层 / 部署层」写清（包只读 `config.mode`/`config.workspaceRoot`；
     部署组合 `dsh-base/cordis.patch.yml:208-212` 才把它们配成 `DSH_PERMISSION_MODE` / `process.cwd()`），
     并**留档我的一次范围性错误**（只对三个包 grep `DSH_PERMISSION_MODE` 得 0 命中就断言「不存在」，
     漏了部署组合 ⇒ **grep 之前先写清枚举范围**）。**ADR-0074 正文与旧注释的描述是对的。**
  2. ✅ **已结案（v1.15.40 第 3 轮，读 `vendor/loader/src/config/isolate.ts`）——子代理 B 的说法被推翻**：
     它说「`group` 不继承、**每一行都要各自写 `isolate`**」，据此要复核本仓预设。**源码不支持该说法**：
     `isolate.ts:98` `const newMap = Object.create(entry.parent.ctx[Context.isolate])`（新隔离表**以父表为原型**）、
     `:99-101` 只把**本行自己声明**的 `options.isolate` 键写进新表、`:123` 再 `setPrototypeOf(entry.ctx[Context.isolate], entry.parent.ctx[Context.isolate])`
     ⇒ **未声明 `isolate` 的子行通过原型链继承父行的 realm** ⇒ 服务由子行提供时**落在父 group 的 realm 里**。
     ⇒ **本仓 `agent-presets/projection/agent.cordis.yml:123-125/156-158/193-195`（`cordis:group` + `isolate` + 子行）
     的写法本来就是对的**；`editing-cordis-compositions` 技能那句散文**准确，无需更正**。
     **对的那一半**：「`isolate` 是**逐行** option（每行可各自声明/覆盖）」——`isolate.ts:79` 确实按行读 `entry.options.isolate`。
     ⇒ **教训**：子代理的「应当如何」类结论，**必须回到源码判**（本轮第二次：第一次是「重造 `ctx.sandboxPolicy`」）。
  3. ✅ **已逐条判定（v1.15.40 第 3 轮，四份契约取自运行体）**：四个服务**都存在且可见**，
     但**「本仓在重造」这个怀疑只对其中一项成立，三项不成立**：
     | 服务 | 判定 | 理由（基于运行体契约） |
     |---|---|---|
     | `sessionProjections` | **不适用** | 它是「**投影单元表 + 每会话状态 + 变更通知**」（`register(definition)` / `stateOf(session,key)` / `snapshot` / `cachedSnapshot` / `onChanged`）。本仓的派生是**文件派生**（`.shadow/` → `_index.md`/`_meta.json`），**不是会话事件折叠**；引入它等于**换一套来源**（撞 ADR-0003/0069 的来源纪律） |
     | `storage` / `storageDomain` | **不适用** | 它是**不透明持久化后备**（`mount(form, facility)` / `open(spec)` / `get(name)`）。本仓的记忆**必须是人类可读的 Markdown 文件树**（ADR-0001 的核心取舍）⇒ 用它就是**范畴变更**，不是优化 |
     | `jobs` | **不适用** | 本仓无后台长任务（写入在 `agent/turn-stopping` 一次 flush 内完成）；且平台已有 job 工具面覆盖我自己的长任务 |
     | `invariants` | ⭐ **候选吸收（唯一一项）** | 见下 |
     **`invariants` 契约原文（运行体）**：`register(packageName: string, installer: InvariantInstaller): () => void`；
     `InvariantInstaller = (ctx: Context, fail: InvariantFailure) => void | Promise<void>`；
     `InvariantFailure = (message: string) => never`（**失败是响亮的**）；
     说明原文：「**Enabled installers run in a child fiber; failure disposes that fiber and releases the reservation.**」；
     `access.optional = { expression: "ctx.get(\"invariants\")", requiresUndefinedCheck: true }`。
     **为什么值得**：本仓有一批**只活在测试里**的不变量——生命周期信号可达性（`test/lifecycle-signal-table.test.ts`）、
     判据单一源（`test/claim-admission-single-source.test.ts`）、sidecar 漂移（`sidecarDrift`）、台账自洽
     （`countInconsistency`）——注册进平台后，它们从「我记得跑测试」变成「**宿主可执行**」。
     **两条前置已答（v1.15.40 第 4 轮，源码 + 安装体 + 包 README 三面互核；全文见 `references.md` §6.5）**：
     **(b) 默认执行 —— 是**（`src/index.ts:96,115` `enabled` 默认 `true`；`:120-126` 无过滤器即全接纳；
     安装体 `dsh-invariants@0.1.5-rc.2/lib/index.js:45,62,67-70` **与源码逐字同构** ⇒ 版本偏差不影响本项）。
     选择由**挂载该行的组合**给（实例：安装体 `dsh-sdk-minimal/cordis.patch.yml:103-104`，**无 config ⇒ 全默认**）；
     过滤器在**服务生命周期内固定**，改它要 reload（`README.zh.md:153`）。
     **(a) 失败 = dispose 子 fiber + 回滚保留 + 注册方自身 `apply` 失败**（`:161-163` `fail` 抛 `InvariantError`
     → `:172-175` `child.dispose()` 后 rethrow → 从 `ctx.effect` 冒出 → `register()` 的 thenable reject）。
     ⚠ **「是否阻断整个宿主启动」仍未验证**（取决于 Loader 对单行激活失败的处置，属运行体实验），**不得写成已知**。
     **新查到的第三条（仍然成立，只是本部署连服务都没有）**：**「只挂服务不挂配套入口 == 没有检查」**
     （`README.zh.md:12,156`：「注册表自身不携带产品检查」）⇒ 检查是否真跑，取决于**本仓自己有没有调用 `register()`**，
     不取决于服务在不在。
     **⛔ 已裁定（v1.15.40 第 4 轮，改用运行时读取）：服务在这个部署里根本没挂 ⇒ `invariants` 判「暂不吸收」。**
     我原先写「运行中的 web 宿主确实有 `invariants` 服务」（依据**运行体 Service 目录**）——**这条是错的**。
     随后用**只读动态 Host 插件**做运行时读取：`ctx.get('invariants') === undefined`；
     同一次探测里 `spillStore` / `tokenMeter` / `shellEnv` / `codeRuntime` / `webServer` / `clientModules`
     等**只在宿主/Web 层挂载、任何预设都不提供**的服务**全都读到了** ⇒ 沙箱 `ctx.get` 读的是**全局服务表**，
     故 `undefined` 就是**真的没挂**（对照名 `definitelyNotAServiceControl` 也 `undefined`，排除「假门面恒返回对象」）。
     ⇒ 本仓即使写 `ctx.get('invariants')?.register(...)`，**在这个部署里也是静默 no-op = 假闸门**。
     **要重启该项的前置条件 = 同时把挂载行写进部署组合**
     （`- id: invariants` / `name: '@deepseek-ai/dsh-invariants'`，范本 `dsh-sdk-minimal/cordis.patch.yml:103-104`；
     本仓 `cordis.patch.yml` 只有一行 `dsh-shadow`），或退一步在**缺件时响亮报告**（ADR-0049）。
     **并得到一条更一般的纪律（已落 `references.md` §6.5.1）**：**Service 目录 ≠ 活性表**。反例三条：
     `e2b` 在目录里而 `dsh-e2b` **在本 profile 里根本没安装**；`dsh-invariants` **装了但没挂**；
     `authorization` / `inspector` 在目录里而 `ctx.get` 均 `undefined`（`inspector` 尤其反直觉——它是 Inspect 自身门面）。
     ⇒ 凡结论是「某能力运行体里有没有」，**唯一判据是运行时读取**。
     **✅ 附带好处**：第 1 条（`sandboxPolicy` 可见）在本次探测里**被更硬的判据复核**——
     `ctx.get('sandboxPolicy')` 读到对象 ⇒ **ADR-0074 结论不变、证据从「目录」升级为「运行时读取」**。
  4. ✅ **已逐项核对（v1.15.43，8 个平面，克隆面 vs 运行面 0.1.5-rc.2）** —— 结论：**机制面零漂移，组合/产物面全漂移**。
     **口径**：递归枚举一律 `-FollowSymlink` 并给计数（`[LINKS]` 70 条 / `[DLX]` 239 条；
     bundle patch 的 `invariant` 命中：克隆面 0（语料 118/501/438 行），运行 `dsh-sdk-minimal` 10）；
     profile junction 实际解析目标已用 `Get-Item Target` 验过（loader **1.0.3** / cordis **4.0.2**）。

     | # | 平面 | 结论 | 关键证据 |
     |---|---|---|---|
     | 1 | `isolate` 继承语义 | **一致** | 运行面 `cordis-plugin-loader/src/config/isolate.ts` 与克隆面 `vendor/loader/src/config/isolate.ts` **SHA256 相同**（各 173 行；loader 1.0.2/1.0.3 该文件都同哈希）⇒ 克隆面行号（`:98`/`:99-101`/`:123`）**可直接引用** |
     | 2 | `export default` 丢命名空间（含 `inject`） | **一致** | 运行面 `src/index.ts:192-199` 与克隆面**逐字相同**，`exports = exports.default ?? exports` 仍在（`:194`）；`lib/index.js:746` 亦有 ⇒ postmortem 0001 的结论**对运行面仍成立** |
     | 3 | `ctx.get` vs 属性代理 | **一致** | 运行面 `cordis/src/` **9/9 文件**与克隆面同哈希；`get` 在 `reflect.ts:233-243`、代理陷阱 `:136-171`（ancestor-only 走链 `:155-166`）⇒ `packages/AGENTS.md` 的说法仍准确 |
     | 4 | `dsh-base` 组合行 | **已变** | 克隆 86 id / 运行 84 id；**只在克隆面有**：`tool-str-replace-editor`（克隆 `base:428`）、`tool-subagent-report`（`:376`）；只在运行面有 **0**。`dsh-tool-subagent-report` **包已退役**（双树均无），`str-replace-editor` 包仍在磁盘但**无任何行挂载** |
     | 5 | `dsh-web-app` 组合行 | **已变** | 克隆 85 / 运行 94；**只在运行面有 10**（`open-in-app:65`、`ui-open-in-app:72`、`session-turn-outline:91`、`workspace-files:110`、`file-upload:192`、`resources:217`、`ui-sidebar-right:224`、`ui-sidebar-documentpreview:230`、`ui-sidebar-files:234`、`ui-schedule:306`）；只在克隆面有 1（`tool-str-replace-editor`） |
     | 6 | `dsh-sdk-minimal` 的 `invariants` 装配 | **已变（二次确认）** | 运行面 `:103-104` `- id: invariants` / `name: '@deepseek-ai/dsh-invariants'`；`:106/:109/:112/:115` 为 `dsh-session`/`dsh-agent`/`dsh-scope`/`dsh-agent-loop` 的 `/invariant` 行；**4 个 `*/invariant` 子路径在运行面确实可解析**（非死引用） |
     | 7 | agent preset | **清单一致 / 内容已变** | 两侧同为 4 目录 10 文件；**6 个文件内容不同**（4 个 `agent.cordis.yml` 全不同）。漂移方向：`text:` → `prefix:`+`suffix:` 拆分、新增 `- id: present`、删掉 `tool-subagent-report` 那段注释、`minimal` 删掉 `filesystem` 隔离组与编辑器行 |
     | 8 | 「每个包都发 `./invariant`」 | **已变，且是系统性丢失** | `files` 含 `lib/invariant.js` / `exports` 含 `./invariant`：`dsh-invariants`、`dsh-base`、`dsh-web-app` 三者在 **0.1.1-rc.x = 是 → 0.1.5-rc.x = 否**；`dsh-sdk-minimal` 恒否；而 **`dsh-session`/`dsh-agent`/`dsh-scope`/`dsh-agent-loop` 四个版本全「是」**（`lib/invariant.js` 实在磁盘）⇒ **服务包遵守、bundle 家族与注册表包本身不遵守**，而 `packages/AGENTS.md` 末条仍写 `Every package owns ./invariant` |

     **对下游结论的影响（三条）**：
     ① 以「运行面 loader/cordis 与克隆面同名机制安全」为前提的推论（第 1/2/3 项）**成立，可继续引用克隆面行号**；
     ② 以「bundle id 集合未变」为前提的推论**必须重做**（base −2 / web-app +10−1 / sdk-minimal +16）；
     ③ 以「每个包都发 `./invariant`」为前提的推论**在 0.1.5-rc.2 上不成立** —— 涉及 bundle 包与 `dsh-invariants` 本身时按「无该子路径」处理。
     **未核对（诚实标注）**：运行中会话**实际挂载**的组合（用户 profile patch / 自制预设 / 动态插件）不在本次 8 项内；
     `lib/` 产物未逐行行为比对（选择读 `src/`，因发布物同时带 `src/` 且与克隆面哈希一致）；
     `@deepseek-ai/dsh` CLI 本体与 `dist/` 压缩产物未纳入。
     **口径纠正（我上一轮的一条表述不精确）**：原型链挂在 **isolate 符号表**上（`Object.create(entry.parent.ctx[Context.isolate])`），
     **不是**挂在 `entry.realm` 上（`entry.realm` 是 `LocalRealm` 普通实例）——结论方向对、对象不准，已按此更正。
     **同时保留一条枚举纪律**（方法层，已复现）：**PowerShell `Get-ChildItem -Recurse` 默认不跟随 junction**
     —— 实测该目录 **70 条里 69 条是 reparse point**，不加 `-FollowSymlink` 的递归 grep 会**静默跳过 69 个包**
     并给出**看似确凿的 0 命中**。⇒ 凡以「0 命中」为结论的搜索，**必须先证明枚举到了非空且完整的语料**。
- **为什么现在没做**：① 每条都要**回运行体**核对（文档可能落后），属逐条实测，不是批量替换；
  ② 涉及**改变本仓写入路径**（`core/fs-scope.ts`）与**引入平台服务**，须先有可见性结论，否则会引出新的
  「机制存在但读不到」的假闸门。
- **完成判据**：① 四条待办各自给出「可见/不可见 + 实测命令 + 结论」；② 结论为「可见且应委派」的，落一条 ADR 并改代码；
  ③ 「不可见」的写明理由并**在代码注释里标注为什么不能委派**（防后来者重复尝试）。


---

## 三、决策（D1–D3 待拍板；D4–D6 已按推荐决策）

### D1. `ChangeSet` / `invalidateFor`：接线，还是删除？

- **依据**：`adr/0062-wiring-audit.md` §3。
- **现状**：`core/change-set.ts`（83 行）与 `ShadowProjectionStore.invalidateFor?()`
  **生产中未接线** —— 唯二消费者是两个测试；生产只在**类型位置**提到它；
  实际走的是**粗粒度清空** `invalidateProjection`（`core/writer-materialize.ts:213`）。
- **已明确**：**不是正确性缺陷**（投影缓存是可重建派生，清空后下次读自动重建 ⇒ 粗粒度路径正确）。
  它是 `ADR-0048⑤` 的**未接线优化**。
- **接线的代价（已查明）**：需要**写侧新增变更跟踪** —— 现有 `rebuildIndex` 走 `listMemories`
  全量扫描，**不产出** `ChangeSet`；且伴随真实取舍：清空 = 一次极小写 + 下次全量重建；
  `invalidateFor` = 读全量缓存 + 写回，换下次读更快。
- **当前处置**：已在 `core/change-set.ts` 与 `core/projection-store.ts` 的**代码里显式标注「生产中未接线」**，
  **不臆造接线**。
- **完成判据**：三选一 —— ① 接线（实现写侧变更跟踪 + 性能取舍说明）② 删除（连同测试与 ADR-0048⑤ 的相应条款）
  ③ 维持现状（保留标注，并在 `adr/0062` 注明「已决策维持」）。

### D2. 残余约 9% 引用漂移：是否做「跨项目根注册」？

- **依据**：`adr/0059-reference-drift-detection.md`「负 / 已知边界」。
- **现状**：修掉两处真 bug 后，全库 2530 次路径状引用中仍有 **243 次（9.6%）**不可解析；
  主体是**跨项目相对路径**（如 `scripts\wslc-utils.ps1` 来自 `wslc1` 仓库）—— 相对本工作区根确实不存在。
- **已排除的做法**：**不猜工作区基线** —— 「按名字猜」已被实测证伪两次（ADR-0058 的 9 例包 ID 假阳性；
  第 3 轮按后缀猜路径同样错）。
- **代价**：做「跨项目根注册」需新增一处**配置面 + 来源可信度**设计，不是小改。
- **完成判据**：决定是否做；若做，需先定「哪些根可信、谁有权限加根」（涉及 inv 178 边界）。

### D3. 是否引入 `(subject, relation, object)` 细粒度取代？

> **★★★ 第四个独立样本（v1.15.40 第 2–3 轮，论文层；`MATERIALS.md` §3.2，裁定 `adr/0080`）**：**MemStrata**
> （[arXiv:2606.26511](https://arxiv.org/abs/2606.26511)，2026-06-25，21 页；**已一手读完正文 + Appendix B/C/D + Table 1/2/3**）
> —— **取代键是 `(subject, relation)` 二元组**（`object` 是被比较的值；**我第 2 轮写成三元组，已更正**），
> 机制「If one exists with a *different* object, the new assertion supersedes it ... **No cosine, no LLM judge**」，
> 账本实现只有 `valid_from / valid_to / superseded_by` 三字段（as-of **作者自陈未评测**）。
> **两条对 D3 最有用的读数**：① **`stale-fact-error rate`**（分子=以被取代值作答的矛盾题数，分母=矛盾题数 30/20/20/20）
> 且**允许弃答 / 强制作答两 regime 必须同报**（Table 3：naive_rag forced 0.40/0.35/0.15/0.35 vs 它 0.03/0/0/0）；
> ② **去掉取代层的消融**：演化准确率 **0.99→0.33**（≈naive_rag 0.32），而**条件编造率 0.04→0.25（~6×）**
> ⇒ **这是「错误方向不对称」的另一侧代价**（不取代 ⇒ 编造暴增），本仓此前只有「并存噪音」那一侧。
> **⚠ 它的键相等性靠 LLM 抽取保证**（Appendix C.1：prompt 要求「differ only in the value must produce the SAME
> subject and relation」），且 §7 把 `entity canonicalization, relation typing` 列为**未来工作** ⇒
> **键这一层不可照抄**（与本仓 ADR-0059 写路径无 LLM 冲突）；可照抄的只有**指标与协议**（→ T11①/T14）。
> **⚠ 可复现材料**：声称发布 harness/数据集，但**本版未给地址**（双盲）⇒ 不得写作「已发布」。

> **★★ 对照面已在 v1.15.39 被实质改写（`adr/0078` D6，**首次本地克隆读源码**）**：
> 0076 读到的 `docs/adr/0004` 是**文档层面**的完整协议；**落地形态**是**窄面 + 默认只建议**：
> ① `src/hl_mem/state_latest_wins.py:1` 自述 `narrow ... for config.version`，`:94-95` **非该 slot 一律 `compatible`（不做取代）**；
> ② `src/hl_mem/config/models.py:508-510` 的 `latest_wins_slots: tuple[Literal["config.version"], ...]` **在类型层面锁死只允许一个 slot**，
>   且 `tests/unit/test_config_loader.py:596` 有测试断言「TOML **不能**授权白名单外的 slot」；
> ③ `config/models.py:506` `latest_wins_mode` 默认 **`"observe"`**（只写审计、不执行），
>   而同文件 `provenance/price_target/plan_fulfillment` 三个默认都是 `"enforce"` ⇒ **默认值按破坏性分级**。
> ⇒ **它给出的不是「细粒度取代值得做」，而是「细粒度取代被收窄到一个 slot、且默认只观察，才敢上线」。**
> **这把 D3 的问题改写为**：*要不要为**特定 slot**建确定性取代，其余一律 `compatible`（不做取代）*。
>
> **★ 首要对照材料（v1.15.37 补，`adr/0076`）**：重点材料 hl_mem 的 **`docs/adr/0004`**
> 是一份**完整的确定性取代协议**，与本题**直接对题**，而 ADR-0073 第一遍对标**完全没提到它**。
> 三条对本决策最有用的读数：
> ① 它的坐标是**四元组** `(namespace, canonical_subject, canonical_slot, coordinate_qualifiers)` ——
>   **比三元组更结构化**；且 `conflict_key` 只是该坐标的**派生指纹，不是第五个独立真相**；
>   候选发现**必须 exact-match 坐标**，「FTS、向量、编辑距离或模型判断**不得扩大候选边界**」。
>   **（v1.15.39 已一手核实**：`:100-104` 的查询确为精确坐标匹配、无 FTS/向量；`conflict_key = json.dumps(astuple(coordinate))`。）
> ② 它有一条本仓**尚未成文**的判据：**「并存噪音是可观察问题；错误关链是静默破坏。不能证明时保留多值
>   比制造单一真相安全。」** —— 与 ADR-0049「缺件不静默」**互补**（一个管缺失可见，一个管破坏保守）。
>   ⇒ 若采用细粒度取代，**「宁可并存」不得被当成缺陷**；且它有一个 **`historical_predecessor`** 分支
>   专门处置**乱序到达**（新到的记录描述更早事实 ⇒ 只接前驱，**不反向关闭 current tip**）。
>   **（v1.15.39 已一手核实**：`state_latest_wins.py:183` 的 `current_tip_id` **恒为旧者** ⇒ 该性质成立；
>   且 `:109-114` 的方向**只由 tz-aware 的可信事件时间**决定，**版本量级只用于相等判定**、时间并列即 `needs_review`。）
> ③ 它为**本仓既有裁决**（ADR-0059「不让 LLM 判语义」）提供**独立量化证据**：
>   E1C 70 案 exact **54/70** 且**有 2 个危险反向**；29 个双序案一致率仅 **21/29 = 72.4138%**（顺序敏感）。
> ④ **（v1.15.39 新增）拒判机制**：15 条否决（8 硬 + 7 证据）一律 ⇒ `needs_review`；
>   候选 **≥17 个即拒判**（`LIMIT 17` + `local_snapshot_matches = len(candidates) < 17`）；CAS 失败**抛错**。
>   ⇒ 「证明不了就不关链」在它那里是**代码结构**，不只是原则。
>   **注意措辞**：这是「别家的读数支持我们的判据」，**不是**「我们验证了」。

- **依据**：`adr/0061-supersession-lifecycle-wiring.md`「负 / 已知边界」；
  **`adr/0076-hl-mem-deep-read-2.md`（v1.15.37 补的对照）**。
- **现状**：本仓的取代是 `entry` **单键 + 时间序**（`observer/arbitrate.ts` 的 `newestByEntryOf` + `verdictOf`）——
  粗粒度：**`entry` 不同的跨主题取代测不到**。文献（Temporal Validity, [arXiv:2606.26511](https://arxiv.org/abs/2606.26511)）
  用的是 `(subject, relation, object)` 三元组取代。
- **注意**：引入三元组需要**从记忆文本里稳定抽出 (s, r, o)** —— 那一步一旦交给 LLM，
  就撞 ADR-0059 的裁决（让 LLM 判语义有硬证据反对）。故若做，**抽取规则必须确定性**。
  ⇒ hl_mem 的 ADR-0004 **走的是同一条路**（纯确定性、LLM 最多作离线 challenger），可作**实现路径的对照**。
- **完成判据**：决定做 / 不做；若做，先写清**确定性抽取规则**并单独起 ADR（**并对照 ADR-0004 的
  九项前置 + 八条硬否决 + 六分支是否可直接借用**）。


### ✅ D4. `pinned` / `archived` —— **按推荐 ③ + ① 的窄版本决策（用户「按推荐」授权）**

- **决定**：**采 ③「纠正文档」为主** —— 把两份文档里对不可达状态的承诺改准
  （`README.md` 的 `NEW → … → ARCHIVED` 与「`pinned` 永存」两处 + `MEMORY.md:90` 加勘误）；
  **不采 ①**（把外部权威状态写进 Derived Artifact 与 ADR-0003 冲突）；
  **不采 ②**（「人工归档」没有信号可派，强派生会造语义不符的状态）。
- **① 的窄版本**：若将来产品确实需要「人工钉住 / 归档」，**须先起 ADR 论证状态落在哪一层**
  （必须落进 **source**，例如记忆文件头，而不是可重建的 `_meta.json`）。**本 ADR 不预设它会发生**。
- **依据**：T3 分诊（`adr/0063` §4）；`README.md:35` / `:177` / `:178` / `MEMORY.md:90` 行号已核实。
- **落地**：本轮已改 `README.md` 两处 + `MEMORY.md:90` 加勘误（原文保留，可追溯）。

### ✅ D5. `metadata` 认知门 —— **已落地（ADR-0066）**

- **决定**：**采 ①「换信号」**，并把判据收敛到**唯一判据源** `isSessionMetadataAtom`。
- **依据**：`adr/0063`（分诊）+ **`adr/0066`（信号实验 + 落地 + 实测效果）**。
- **实测（真语料 7089 条，5 个候选判准对照）**：旧判准精度 **9.8%**（判 4744 条，其中 4279 条其实有工作痕迹）；
  文本启发式口径精度 **100%**（判 93 条，0 条有工作痕迹）—— 而它**恰好是仓库里已文档化、从未接线的那一个**。
- **落地效果（真语料 7111 条）**：`metadata` **4137 → 90**；投影可见 **2283 → 6478**（32.8% → **91.1%**）；
  **两条读路径可见性差 67.2% → 8.9%**；残余 `540` 条是**证据门的正当拒绝** + `90` 条是新判准挡的。
- **连带处置**：`isCognitiveAtom` **已删除**（规则与 `validateAtomProjection` 完全重复且零调用点 ——
  删它是为消除「同一条规则三份实现」的病根）；`isMetadataMemoryText` **保留**（服务不 parseMemory 的读路径）。
- **两条实测边界已写进测试**：① `kind=metadata` 与判据是**有向**关系（`task` 分支优先，不影响可见性）；
  ② 两份实现读的**表面不同**（线索头 vs 正文行，真记忆两者都写 ⇒ 真语料不分叉）。

### ✅ D6. 吸收 OpenViking 的三条做法 —— **已实现（ADR-0075，v1.15.35）**

- **决定（用户「按推荐」授权）**：三条**都做**，且都归为 **Projection**（派生可重建，不违反 ADR-0003）。
- **落地**：新增 `core/abstract.ts`（纯函数：`deriveL1` / `deriveL0` / `renderSidecar` / `parseSidecar` /
  `sidecarDrift`）+ 接线 `core/writer-materialize.ts` 的 `rebuildIndex` + 枚举器分类判据收敛。
- **选型（用户 2026-09-11 选定 A）**：sidecar 落 `.shadow/<date>/_abstract.md`，并**教 `listMemories` 跳 `_` 前缀**。
  三条边界：派生件不是 source · 所有输入显式传入（不读时钟/随机/fs）· 命名必须 `_` 前缀。
- **层次**：记忆（source）→ L1（确定性，≤4000）→ L0（**由 L1 抽取**，≤256）→ `_index.md` 的目录摘要段。
  **L0 是 L1 的函数** ⇒ 层间不一致在**构造上**不可能（这正是原 D6 的 ②）。
- **③ 覆盖率自报**：`covered` / `pending` 写成**显式可解析行**，由 `sidecarDrift` **独立重算**（不信自报）。
- **锁**：`test/abstract-sidecar.test.ts` 6 组，含**正对照**（源头落后 / L0 被单独改 / 坏文件 三种坏件全被抓到）
  与端到端（索引重建产出 sidecar + `_index.md` 引用其 L0）。
- **默认开**（与 `projectionStore` 默认关**不同**）：它是派生件、写入次数**有界**（每日期目录一份）、
  且默认关等于**又一次「写好了但从不执行」**（T1/T4 刚清理的那一类）。
- **诚实标注（未做，见 T9）**：
  - **`pending` 恒为 0 是构造性的** —— 本实现里 sidecar 与 `_index.md` 用**同一份 `recs`** 派生 ⇒
    **不可能落后**。故该字段当前**只在构造坏件时有意义**，不是「会真实报警的增量检测」。
  - 真机**规模与耗时未测**；sidecar 的**召回收益未测**（本轮**未改检索排序**）；
    L0 抽取质量未评；**存量回填未做**（旧目录要等各自索引重建）。

#### D6-orig（保留原始线索，便于回溯）

- **三条内容**：① 目录级（日期级）abstract + overview sidecar —— 今天判断相关**必须先读记忆文件**，
  只能靠全局 `_index.md`；OpenViking 是**每层目录都带 L0/L1**（256 / 4000 字符上限）。
  ② 上层由下层确定性派生（它的 L0 从 L1 正文里抽：H1 之后、首个 `##` 之前）—— 消除层间漂移。
  ③ 派生件自报覆盖率与待处理变更（它的 sidecar `freshness`：子项覆盖数 + `pending_child_changes`）。
- **实现的前置**：① 定 sidecar 的落盘位置与命名（**必须隐藏**）；② 定 `_index.md` 与 sidecar 的关系；
  ③ 加漂移棘轮。⇒ 三项均已在 ADR-0075 定案并落地。
- **顺带记一条对 ADR-0060 的精化（已并入 B2 的决策依据）**：OpenViking 的层级分数传播公式是
  `alpha * embedding + (1-alpha) * parent`，而 **`score_propagation_alpha` 默认 `1.0`**
  ⇒ **默认父分权重为 0**。即：**层级买的是「递归下钻扩大候选」，不是「分数平滑」**。

### D7. `hits` 的范围：其它读入口（`shadow_query` / `recall_shadow` / `episode`…）算不算命中？

- **依据**：`adr/0067-hit-accumulation-trigger.md`「备选」表末行（本轮**有意不顺手做**）。
- **现状（实测）**：`hits` / `confirmedBy` **只在主题召回路径累积**（`query/query.ts:397`，
  即 `read_shadow({topic})` 不带 `mode`）。以下入口**都不累积**：
  - `shadow_query`（`mode:"query"`，走 `read_shadow` 的 `shadowQuery` ReadQuery）；
  - `recall_shadow`（→ `mode:"recovery"`，**用户最常用的恢复入口**）；
  - `mode:"episode"` / `"task"` / `"context"` / `"knowledge"`（都走 `materializeAtoms`，不写 meta）。
- **为什么这是决策而不是缺陷**：`hits` 的语义是「召回**命中**数」。把 `shadow_query` 也算进去，
  等于把「**跨类型上下文查询**」也算作记忆命中 —— 那会改变 `hotness` 的含义
  （从「被主题召回」变成「被任何读入口读过」）。**两种语义都自洽，但含义不同**，须拍板。
- **代价对比**：
  | 选项 | 含义 | 风险 |
  |---|---|---|
  | **① 只主题召回算命中**（现状） | `hits` = 「被主题检索命中」 | `recall_shadow` 是常用入口却不算命中 ⇒ retention 的 hotness 对此类使用**视而不见** |
  | **② 所有读入口都算** | `hits` = 「被任何读入口读过」 | 语义面扩大；`shadow_query` 常被**探测性**调用（如本轮我做了多次），会把探测也算成「价值」 |
  | **③ 分两个计数**（`recallHits` / `readHits`） | 语义分开，不混用 | 需要定权（hotness 用哪个？）；`_meta.json` 结构变更 |
- **建议倾向**：**③**（分计数）最不损失信息；若不愿改结构，**①（维持现状）+ 在文档里写明 `hits` 只统计主题召回**。
  **不建议 ②**（会把探测性查询当价值信号）。**决策权在用户**。
- **完成判据**：选定其一；若选 ②/③，须附「`shadow_query` 调用量与实际命中量的比例」实测，
  并同步改 `test/hit-accumulation.test.ts` 的覆盖范围。

### D8. README「默认开关」表缺三列：成熟度 / **降级行为** / **晋级标准**（ADR-0073）

- **依据**：`adr/0073-hl-mem-benchmark.md` §2 行 ① 与 §3（重点材料 `lohr13/hl_mem` 的对标结果）。
- **现状（实测）**：`README.md:113-130` 已有一张 **「默认开关」表**（**16 条能力 × 3 列**：
  能力 / 默认 / 开着会怎样·怎么开），**缺三列**：
  | 缺的列 | 为什么值得补 |
  |---|---|
  | **成熟度**（stable / beta / experimental） | 今天「默认关」的项里混着「稳定但耗 token」与「接口可能变」两类，**读表看不出区别** |
  | **降级行为** | **ADR-0049「缺件不静默」要求降级必须可见**，但该口径目前**散在代码注释与 ADR 正文里**（`core/toolset.ts` 的 `degradesTo`、`routeVerify` 的 `unavailable`、`recall` 的关键词兜底、`evidenceProvider` 的 `fs` 回退…）—— **没有一处能一眼看全**「每个能力关掉 / 缺件时，行为退到哪」 |
  | **晋级标准** | 什么条件下才允许 beta → stable。本仓只在个别 ADR 里零散出现「未验证/待实测」，**不是能力粒度的门** |
- **为什么现在没做**：它**不是新功能**，是把**已有事实**（各能力的稳定度、降级路径、晋级条件）逐条**核实后**填表 ——
  需要先把 16 条能力逐条对着代码定「降级到哪」，属**独立工作量**；且用户本轮授权范围是
  「立 ADR + 记 BACKLOG + 补 CHANGELOG」，**实现不在内**。
- **注意（防过度表述）**：本仓**不是「没有能力矩阵」** —— README 那张表已经是成熟度矩阵的**表头裁剪版**。
  本项的准确表述是「**补三列**」，**不是「新建表」**。这个精度差异来自 ADR-0073 §2 末注的一处自我纠正。
- **完成判据**：`README.md` 的该表补齐三列（16 条能力**逐条核实填实**，**不许留空或写「未知」**）；
  「降级行为」一列须**与代码实际路径一致**（可用 `read_shadow({mode:"toolset"})` 的 `degradesTo` 与
  `README` 的「都没装会怎样」小节**对照校验**）；若有能力当前**降级不可见**（违反 ADR-0049），
  须**单独记为缺陷**而不是在表里写一句敷衍的话。

---

## 四、未验证（需真机条件或需装依赖，代码侧已完成）

### V1. 真机 `semble` / `zg`

- **依据**：`adr/0054`、`adr/0059`、`adr/0060` 各自的「未验证」；本机两者实测均 `ENOENT`（未安装）。
- **影响**：所有与向量/证据检索有关的实测都是**按 ADR-0054 已测性质建模**的，不是真实向量检索。
- **完成判据**：装 `uv tool install semble` 与 `npm i -g @zvec/zvec-grep` 后，
  跑 `npm run eval:retrieval` 与 `survey:"all"`，把真实数据回写 ADR-0060 / 0054。

### V2. 新台账条目的 `probe` 旗标

- **依据**：`adr/0058-toolset-source-expansion.md`「未验证」。
- **现状**：`v1.15.14` 新增的 57 条经 `winget show` **权威核验**（版本、许可证），
  但各条 `probe` 的**版本旗标**（`--version` / `-v` / `version` …）**未逐项在本机真跑过**。
- **兜底**：口径已由「探测失败 ≠ 未安装」兜住（不会误报可用，只会显示「未检出」）。
- **完成判据**：装齐后用 `read_shadow({mode:"toolset", survey:"all"})` 抽查；
  对「已装却未检出」的条目修正旗标。

### V3. `maxMembers: 4` 的运行时拦截行为

- **依据**：`adr/0056` 的「未验证」。
- **现状**：宿主行已配（`cordis.patch.yml` 的 `agent-team`，`maxMembers: 4`），
  且已读包本体核实语义（创建时检查 / 无移除路径 / 失败也占名额）；但**闸门未真机触发过**。
- **完成判据**：真创建第 5 个 teammate，应抛 `TEAM_MEMBER_LIMIT`（**注意：这会永久占满该会话的名额**）。

### V4. 真机 `host.fs` 的 `resolve` 语义

- **依据**：`adr/0059` 与 `test/evidence-absolute-path.test.ts` 的「未验证」。
- **现状**：`fsExists` 的绝对路径/目录修复是用 `node:path` + 真实磁盘模拟验证的，
  未经真机 `host.fs`（`@deepseek-ai/dsh-fs-local` 的 `resolve`/`readText`/`listDir`）。
- **补充**：真实契约已**读源码核实**（`lib/index.js:277/341`：`listDir(不存在)` 抛 `FS_NOT_FOUND`、
  `readText(目录)` 抛 `FS_NOT_REGULAR_FILE`），故修复方向有据；缺的是**真机端到端**。
- **完成判据**：重启后在真会话里触发一次「绝对路径证据」的召回，确认不再报「已过时/证据缺失」。

### V5. 其余测试的 mock 是否还有不忠实

- **依据**：`adr/0059`「测试侧的教训」。
- **现状**：`v1.15.15` 修了两处**不忠实 mock**（`missing-dependency` / `recall-attribution` 的
  `listDir` 对不存在的目录返回 `[]` 而不抛，与真实契约不符），但**未系统排查其余 mock**。
- **教训原文**：**mock 与宿主契约不符时，测的是 mock 不是系统**（本仓 v1.15.2 踩过同类）。
- **完成判据**：审查各测试的 fs mock 是否忠实（尤其 `readText` 空串 / `listDir` 空数组的默认行为）。

### V6. 审计工具未接入任何自动门禁 —— **已部分接入（v1.15.38）**

- **依据**：`adr/0062`「负 / 已知边界」。
- **现状**：本仓无 CI；`tools/audit-wiring.ts` 与 `tools/audit-wiring.selftest.ts` 靠手动跑
  （`npm run audit:wiring` / `audit:wiring:selftest`）。**标定测试本身是绿的**，但没有自动执行。
- **进度（v1.15.38 / ADR-0077 D2）**：**两个自检已进 `npm run verify`** ——
  `tools/run-tests.ts` 同时收 `test/*.test.ts` 与 `tools/*.selftest.ts`（45 项、串行、子进程隔离）。
  **该接入当轮就变现**：`audit-wiring.selftest` 立刻挡下「声明表放进生产面 ⇒ 工具丢掉
  `status=superseded` 真线索」的一次自我回归（ADR-0077 D1 的自曝）。
- **仍未接入（v1.15.38 时）**：`audit:wiring` / `audit:drift` 的**分诊报告本身**（它们是人工分诊工具，
  输出是**线索清单**而非通过/失败，**退出码语义未定义** ⇒ 硬塞进门禁只会制造「噪声导致跳过」）。
- **完成判据**：为两个报告定义**明确的退出码语义**（例如「A 段新增条目数 > 基线」才非零），
  并定一处会执行它的地方（提交前脚本 / hooks / CI），否则工具会随时间失效。

#### ✅ **已闭环（v1.15.45）**：两个报告都有了棘轮退出码，并**已接进 `npm run verify`**

- **判据（新文件 `tools/audit-ratchet.lib.ts`，纯逻辑 + 8 组标定测试）**：
  ① **线索数只能降不能升**（某桶多于基线 ⇒ 退出 1，报文给「旧 → 新」与增量）；
  ② **下降不是违规**（退出 0，但提示 `--update-ratchet` 收紧基线 —— 判紧会让人习惯性绕过这门）；
  ③ **基线里有的桶在观测里消失 ⇒ 违规**（缺件不静默：可能是工具坏了，不是问题没了）；
  ④ **出现新桶 ⇒ 违规**（否则整类新线索会被棘轮漏掉）；
  ⑤ 基线缺失 / 两表皆空 ⇒ 违规（「通过」不能靠没有判据换来）。
- **基线**：`tools/audit-ratchet.baseline.json`（**两个报告共用一份**，分 `wiring` / `drift` 两段；
  当前 `wiring = {a_total 31, a2b 0, a1 17, a2a 3, a3 11, b_keys 103}`、`drift = {drift_keys 10, drift_sites 25}`）。
- **执行处**：`npm run audit:ratchet`（= 两个报告的 `--ratchet` 串联）**已进 `npm run verify`** ⇒ 门禁 **48/48**。
- **同轮踩到并修掉的真缺陷（留档）**：`node tools/audit-wiring.ts --ratchet` **漏了根参数** ⇒
  `ROOT` 取到旗标字符串 `"--ratchet"` ⇒ 扫描目录不存在 ⇒ **0 文件 ⇒ 0 线索 ⇒ 工具「安静地全绿」**，
  而 `--update-ratchet` 会把这个全 0 读数**录成基线**（棘轮从此失去意义）。
  ⇒ 两个 CLI **都加了闸**：**零文件语料直接 `exit 2`**（缺件不静默，ADR-0049）；npm 脚本里显式带上 `.`。
  **教训与 T12/T2 同族**：**「空语料冒充没问题」是这道门唯一的失效模式**。
- **诚实边界**：棘轮只覆盖**计数**，答不了「计数相同但线索换了一批」（需逐条 diff，未做）；
  `audit-drift` 只棘轮 **B 段**（A 段的 `fresh` 计数在块作用域内，要棘轮得先把计数提到顶层，留作后续）。

- **进度（v1.15.40 第 4 轮：拿到一个**可照抄的退出码语义样板**）**：hl_mem 的
  `evaluation/tools/run_extraction_quality_smoke.py:255-257` 用**合取式**表达退出码——
  「全部条目通过 **∧** 恰好 1 次外部调用 **∧** 保留数 ≤ 16」才 `return 0`。
  ⇒ 与本条目要的「分诊报告退出码语义」同构：**把多个必须同时成立的条件写成一条合取**，
  而不是「有输出就算通过」。**它在 hl_mem 里没有对应物**（分诊报告是 hl_mem 没有的机制）⇒ 本仓要**自建**判据，
  可借的只有这个**表达形状**。（另：`benchmarks/release/core_v1.py:102-104,135` 的「外部调用即失败」
  用**抛错桩 + 计数**并以 contextmanager 包住整条链路，是最贴近本仓的一版实现思路；全文见 `references.md` §6.6。）

### V7. **语料健康门**（Corpus Health Gate）—— ✅ **已闭环（v1.15.46）**

- **来源**：用户 2026-09-12 评审第 3 条：V6 只防住「**语料全空**」，防不了 **Partial Corpus** ——
  「正常 31 files / 103 keys」→「工具坏了 7 files / 21 keys」**不是 0**，闸门不响、读数「看起来合理」；
  更危险的是 **V6 的棘轮对「下降」判通过并提示收紧基线** ⇒ **工具坏了会被当成修好了，写进基线**（假绿自我固化）。
- **判据（`tools/corpus-health.lib.ts`，纯逻辑 + 10 组标定测试）**：四档，只有 `NORMAL` 放行
  | 档 | 触发 | 退出码 |
  |---|---|---|
  | `EMPTY` | 0 文件 | 2 |
  | `PARTIAL` | 文件数 < 基线×0.9 · 目录数 < 基线×0.9 · **线索跌 > 20%** · **哨兵文件缺失** | 2 |
  | `UNKNOWN` | 无基线可比 | 2 |
  | `NORMAL` | 在容许带内 | 0（继续跑棘轮） |
  - **哨兵**（`index.ts` / `core/paths.ts` / `core/types.ts` / `core/util.ts` / `security/scrub.ts`）：
    **无基线也能发现「走错目录 / 递归被 junction 静默截断」**（这正是 v1.15.43 踩过的坑）。
  - **`--update-ratchet` 也受闸**：EMPTY/PARTIAL 时**拒绝录基线**（这条是 V7 的关键）。
  - 阈值（0.9 / 0.9 / 0.2）**可注入**，且已在标定测试里用严/松两档证明「判据不在暗处」。
- **覆盖四个语料消费者**：`audit-wiring`、`audit-drift`（带基线+哨兵）、`audit-layers`（自比+哨兵）、
  `retrieval-eval`（协议常量 `min_corpus_files`，**从数据读不从代码读**）。
- **🔴 V7 首次运行就抓到我自己的一处设计缺陷（留档）**：两个工具**共用一个 `corpus` 键**，
  但量的是**不同的语料**（wiring 扫全仓 778 文件含 `dist/`；drift 只扫生产面 193 文件）
  ⇒ drift 录基线时被 wiring 的数字判成「骤降 76%」而**拒绝录制**。
  **修法**：`corpus` 按消费者分开存（`corpus.wiring` / `corpus.drift`）。
  **教训与 V6 同族**：**共享键 + 不同口径 = 必炸**；而这次是**新加的闸自己发现**的（不是人看出来的）。
- **代价（诚实标注）**：**大幅度的合法下降现在必须走「确认 → 重录基线」**（不能静默收紧）。
  这是刻意的：宁可让人确认一次，也不要让工具故障写进基线。
- **未做**：阈值未用「真实故障回放」标定最优值；指纹只覆盖**文件路径集合**（不含内容）。

### V8/V9. **Count Ratchet → Identity Ratchet** —— ⏸ **明确不做（用户 2026-09-12 指定为以后）**

- **问题（用户评审第 5 条）**：现在比的是**计数**。「旧：A=3,B=7,C=10」→「新：A=3,B=7,C=10」**数量完全没变**，
  但**里面换了一批** ⇒ 棘轮不响。
- **方向**：桶值从 `count` 变成 `{ count, fingerprints[] }`（**身份**而非数量）。
- **为什么现在不做**：先有「什么算受保护契约」（**T15**）才谈得上给桶定身份；否则会冻结一堆临时内部形态。

### 🧭 **阶段路线（用户 2026-09-12 确立，按此顺序）**

```text
V1–V5  功能有没有            ✅ 已完成
V6     验证系统会不会假绿      ✅ 已闭环（v1.15.45）
V7     语料是不是可信         ✅ 已闭环（v1.15.46）
T8     静默降级可见化          ← 下一步（判据已定，纯实现）
T15    什么东西是契约          ← 产出 Protected Contract Registry（见 T15）
D1/D2/D3 + A 段 6 条 ⚠ **不要先拍** —— 它们本质都是「哪些东西算受保护契约」，故排在 T15 之后
T2(B段) / T9 / T10 / T7
Contract Freeze Gate          ← 契约冻结（条件见下）
T14    冻结**契约语料**（不是当前实现）→ 真正启用回归门
V8/V9  Identity Ratchet
V/G/T6 真机与外部条件项
```

**Contract Freeze Gate（冻结条件）**：`F 事实台账` + `V 运行验证` + `T15 契约面` + `Ratchet` 四者齐备后，
**核心契约冻结**；此后新功能必须**证明不破坏 Contract** 才能进 `main`。
**T14 的语料快照必须排在冻结之后** —— 否则冻结的是「当前实现」而不是「契约语料」。

### 🧠 **M1–M5 Memory Evolution 泳道**（用户 2026-09-12 确立；与上面 🛡️ 契约泳道**并行**）

> **用户修正了上一轮的表述**：不是「先做治理、暂不做新 Memory 能力」，而是
> **两条泳道并行，但新能力必须围绕一个新核心方向纵向生长，不再横向堆功能**。
> **两条泳道在此交汇**：**M1 的契约条目就是 T15 Registry 的第一条真条目**。

```text
🛡️ Contract Track : T8 → T15(Registry) → D1/D2/D3 → Contract Freeze → T14
🧠 Memory Track   : P1 → M1 → M2 → M3 → M4 → M5
```

### P1. **Proposal → Confirmation → Fact 原语**（**Inference is cheap; facts are expensive.**）—— 🟢 **原语已冻结（v1.15.49，`adr/0082`）；P1①② 已落地并进 `verify`（v1.15.50）**

- **地位**：**Memory Track 第 0 项，先于 M1** —— 它是**所有 Memory Intelligence 能力的共同架构纪律**，M1 只是第一个使用者。
- **落地物（P1①②）**：`core/proposal.ts`（纯函数：严格白名单校验 / `projectFacts` 投影 / **唯一统计入口** `factualOnly` / 候选可见性 `candidateStats`）
  + `test/proposal-firewall.test.ts`（**11 组闸**）+ `tsconfig.json` 显式 include（该模块尚未被 `index.ts` 引用，而测试按约定 import 编译产物）。
  **`npm run verify` = 50/50**。
- **关键实现选择（比字段校验更强）**：**`type:"fact"` 一律拒收、Fact 只由投影派生** ⇒ **Proposal 冒充 Fact 在结构上不可能**（没有写入路径）。
  两条伪装负例都已成闸：`{type:"fact",source:"model-proposal"}`、`{type:"proposal",status:"validated"}`（**且被拒的 proposal 即使有 confirmation 也不得复活**）。
- **机械不变量**：`FACT ⇔ 有效 Confirmation ∧ 指向 Proposal ∧ Proposal 有 inputRefs`；有效动作按 `timestamp` 升序取最后一条、**同刻按 id 升序**（**与插入顺序无关**，已成测试）；`reject`/`revoke` ⇒ 事实消失但**历史保留**。
- **六条硬禁令**：proposal **不得**参与 `Pattern count` / `influenced_decision` / `confidence` / `ratchet baseline` /
  `knowledge fact` / `identity`。**核心不变量：只有 FACT 能改变系统认知统计；CANDIDATE 只能改变「待确认候选」的统计。**
- **proposal 必填**：`source` / `model` / `prompt_version` / `inputRefs[{file,line}]` / `proposedRelation`（缺一不得入库 ⇒ 可回答「模型为什么提这个候选」）。
- **Confirmation = 授权事件**（`{id, proposal, actor, action, timestamp, reason?}`，**actor 无 model**；`action ∈ confirm/reject/revoke`）——
  **Fact 是它的投影** ⇒ 未来 **M4 Memory Revision 直接落在 `revoke` 上**，不需要新机制。
- **候选可见性**（防 **Silent Candidate Graveyard**）：`candidateStats` 输出 `candidates · confirmed · rejected · pendingConfirmation · oldestCandidateDays · acceptance/rejectionRate`；
  **待确认不入分母**、**分母 0 报 `null`（不可测不报 0）**、**`now` 由调用方传入（不读时钟）**；**不进普通召回，但必须可见**。
- **⏭ 下一步（P1③④）**：LLM 产生者（候选层，写入候选视图）· Confirmation 入口（载体**刻意延迟决定**）。
  **M1 真实场景已跑过一轮（M1-A′ dry run，见 `adr/0081` §9）⇒ 载体拿到的是「要求清单」而非「形状」**：
  **F1** 行号必须自动填（手填 ⇒ 退化成 `line: 1`，闸在证据没了）· **F2** key 建议 + 人确认（与 P1 两层同构，不需要第二套机制）·
  **F3** 确认必须看得见证据（否则 `actor:"human"` 是**盲签**）· **F8 ✅ 已做（v1.15.53）** 接受率按 `actor` 分层、总体率只认 human（否则 tool 自确认刷满分）。
  仍未定（不得据 dry run 拍）：**确认是否高频 / 是否要批量 / 是否要 diff**（本次 **0 次真实确认动作**）。
- **待建验证（含负例）**：① proposal 计入 Pattern ⇒ 必须失败（**当前靠 `factualOnly` 约定 + M3 接入时补结构门**）；② 缺 `input_refs` ⇒ 拒收 **✅ 已做**；
  ③ 无 confirmation 的 Fact 进事实视图 ⇒ 必须失败 **✅ 已做**；④ P→C→F lineage 可追 **✅ 已做**；⑤ `pending_age_p90` 为 derived、不写回状态（**留给 M1**）。
  **诚实边界**：`factualOnly` 目前**只是约定**，尚无机械手段阻止未来统计直接吃 `records`（见 `adr/0082` §7.5）。


**核心思想转变**：**Recall 不是 Memory 的终点**。目标是完整生命周期 ——
`发生 → 记录 → 理解 → 形成决策 → 执行 → 观察结果 → 形成经验 → 修正认知 → 再影响未来决策`。

| # | 能力 | 状态 | 现状清点结论（逐条带证据，详见 `adr/0081` §2） |
|---|---|---|---|
| **M1** | **Decision Memory**（决策 → 结果 → 经验） | 🟢 **M1-A 已落地（v1.15.51）+ M1-A′ dry run 已跑（v1.15.52）**：确定性归属 + 接进原语**已被真跑验证**；**还剩 M1③（`key` 的显式入口）· 落盘 · 读路径渲染 · M1⑥/M1⑦（dry run 新发现的两个契约缺维度）** | **已有 50%**（`DecisionEvent`/`DecisionReason` 分离由 ADR-0037 冻结，见 `adr/0037:29-42`）。**M1-A（已做）**：`core/decision-outcome.ts` = 归属规则 `same-key-window/v1`（**确定性 + 保守**：同 key·窗内·取最晚前驱·**并列不归属**）+ `toPrimitiveRecords`（**结果事实只能经 `projectFacts` 产生**，内容来源=观察者、确认=`actor:"tool"` 的**确定性规则**且 `reason` 可审计）+ `pending` 读数（**年龄分布 + 最老 + `pendingAgeP90`**；**年龄只暴露风险、不改变状态**）。**闸 11 组**，`verify` **51/51**。**未做（诚实）**：`key` 由调用方显式传入 ⇒ **「key 从哪来」这条链未接**（M1③）；**无落盘**；**未接读路径** ⇒ 目前**没有生产消费者**（棘轮已按规程重录并说明）。**用户拍板**：`subject` 与 `entry` 并存（**只接受显式提供**）· **不设结算窗口**（永远 `pending`）· 结果来源走**两层**（`adr/0082`）。 |
| **M2** | **Outcome Memory**（记结果 + 评价 + 以后是否继续相信） | ⬜ 待 M1 拍板后 | **不新建对象**：`validation/types.ts:23` 已有完整 outcome 状态机（`validated/observed/rejected/expired`）+ append-only 历史（实测场景 88）；`observer/trace.ts:26` 已有 `outcome{expected,actual}`；`long-horizon` 已有 ActionFeedback。**唯一要做的**：把已有 outcome 形态**接到 Decision 上**（否则就是第二个平行 outcome 概念＝判据分叉）。 |
| **M1⑥** ⭐ | **决策的 `disposition`**（「刻意不做」≠「忘了做」） | ✅ **已结案（v1.15.53）** | **来源 = M1-A′ dry run 的 F6**。**已做**：`DecisionRecord.disposition?: "open" \| "deliberate-deferral"`（缺省 `open` ⇒ 向后兼容）；读数分 `pendingOpen` / `pendingDeferred`，**年龄分布 / 最老 / p90 只统计 `open`**；渲染显式标注「刻意推迟 N（不计入积压）」。闸 `test/decision-outcome.test.ts` ⑫。**仍待用户拍板**：`deliberate-deferral` 是否允许设复查期（到期转回 `open`？）——**未替用户决定**。 |
| **M1⑦** ⭐ | **候选统计按 `actor` 分层**（防 tool 自确认刷分） | ✅ **已结案（v1.15.53）** | **来源 = M1-A′ dry run 的 F8**。**已做**：新增 `byActor`（`human → tool → ci`，只列实际有裁决的）；**总体 `acceptanceRate`/`rejectionRate` 只认 `human`**，无 human 裁决 ⇒ `null`（不可测不报 0）；`revoke` 独立成桶（**不再与 `reject` 合并**，也不再落进 pending）；口径可机械断言 `candidates = confirmed + rejected + revoked + pendingConfirmation`。闸 `test/proposal-firewall.test.ts` ⑫⑬⑭。 |
| **M3** | **Pattern Memory**（从 N 个 Episode 产生经验） | ⬜ | **算法内核已存在**：`reflection/patterns/success-rate.ts`（decision→outcome 相关性，纯统计、确定性标记集、无 AI）+ `decision-outcome.ts`（重复决策/结果 tally）+ `dream/compress.ts`（cross-domain 抽象）。**真缺口**：Pattern 不是一等对象，且 `reflection/types.ts:8` 的结构**没有反例字段** —— 用户 schema 要的 `counter_examples` **必须补**（只报 support 不报反例＝自欺）。 |
| **M4** | **Memory Revision**（记忆自己纠错，保留时间连续性） | ⬜ | **机制已有**：`Forget ≠ Delete`（ADR-0031）、`superseded` 生命周期（`core/lifecycle.ts`、ADR-0061）、append-only 历史、取代的确定性（ADR-0059/0061，`adr/0080` 给了「阈值不可达」的证明）。**真缺口**：`revision` 不是一等对象 —— **没有留下「因哪条证据而改判」的可追溯对象**（裁决只给 verdict/outcome/reflection，不改写原记忆，这是对的）。 |
| **M5** | **Memory Utility**（让系统知道什么值得记） | ⬜ | **只有 `recall_count` 的雏形**（`hits` 累积，见 D7；`queryLog`）+ 衰减（MemoryBank hotness）。`useful_count` / `influenced_decision` / `prevented_duplicate_work` / `caused_rework` **全缺**。**前提是 M1**：没有「决策→结果」就无从判断某条记忆**是否影响了决策**。 |

**明确不做（用户指定）**：现在**不做 KG**、**不做 Soul** —— 先做 **Decision → Outcome → Lesson** 这一条闭环。


---

## 五、已知空白（文献层面就没有答案，需自己实验证明）

> 这三条来自四路调研的**明确空白声明**（作者原话：「查了但没有好答案」）。
> 它们是**可做成原创贡献**的位置，也是**不可引文献充当已证**的位置。

### G1. 「知识带有效期字段」没有对照消融

- **依据**：知识库治理调研的空白第 1 条。
- **现状**：证据只到「过期知识造成伤害」+「确定性取代有效」，**没跨到「必须存 expiry 字段」**。
- **纪律**：落地该字段**需自证**，不能引文献充当已证。
- **进度（v1.15.40 第 3 轮 / `adr/0080` §2，MemStrata 全文）**：**文献缺口的范围被精确化**——
  连一份**专门讲时间有效性**的论文，也**没有对「有效期/双时间字段」做对照消融**：它只对**取代层**做了消融
  （D.1/D.1b），而账本侧自陈「as-of 是 **a capability we build on but do not evaluate here**」，
  且实现里只有 `valid_from / valid_to / superseded_by` 三字段（§4.2）。
  ⇒ **G1 仍然只能自建**，但可借它的**消融形态**：单变量 flag（`retain_all_turns`，**默认关**、写路径其余冻结）、
  **两侧夹逼**（过度合并丢静态召回 vs 不取代丢时间有效性）、以及**同时报代价方向**（不取代 ⇒ 条件编造率 ~6×）。

### G2. CLI / 本地二进制层的「工具数量拐点」无论文

- **依据**：委派×工具台账调研的空白第 1 条。
- **现状**：所有量化拐点测的都是 API / MCP server / skill package（如 [arXiv:2606.30317](https://arxiv.org/abs/2606.30317)
  的「10–15 个工具选择准确率跌破 90%」是**每上下文**的工具 schema 数）。
  **CLI 层没有任何拐点论文** ⇒ 扩目录时**不能引用「20 个工具就够」**，必须自建 micro-eval。

### G3. 「发现缺件 → 请求装 → 宿主放行 → 装完使用」闭环无先例

- **依据**：同上，空白第 2 条。
- **现状**：没有论文把「宿主审批」当作该闭环的**一等公民**来评测。
- **本仓现状**：`ADR-0057` 已实现「能力预检 + 三条硬边界」，且**实测到一个反直觉约束**：
  宿主进程 PATH 是启动时快照 ⇒ **「先装再派」在单会话内收益为零**（装完同进程看不见）。
- **价值**：这个闭环 + 该约束，是文献里没有的实测位置。

### G4. 判别层（重排器）未在本系统验证

- **依据**：`adr/0060` §3「加判别层的优先级高于加库」。
- **现状**：该建议**引自文献**（[arXiv:2606.28367](https://arxiv.org/abs/2606.28367)：强重排器承担流水线绝大部分质量），
  但**本仓无重排器**，故未在本系统验证。
- **纪律**：不得表述为「已验证」。

---

## 附：不在本台账的两类东西

- **本地探测产物**：`_research/`（四路调研的抓取脚本与原始输出、本轮的分诊工具与审计原始输出）
  **有意不纳入版本控制**（`package.json` 的 `files` 白名单不含它，`git` 也未跟踪）。
  它可复现，但属过程材料，不是包的构成。
- **已完成的版本历史**：见 `CHANGELOG.md`（v1.15.13–v1.15.19 逐版记录，含每一条的
  「验证」与「未验证（诚实标注）」）。
