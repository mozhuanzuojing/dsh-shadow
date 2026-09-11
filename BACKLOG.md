# dsh-shadow · 待办与未决事项（Backlog）

> **口径**：本文件只登记**尚未完成**的事项，是待办的**唯一台账**。
> 已完成的历史见 `CHANGELOG.md`；决策与依据见 `adr/`；术语见 `CONTEXT.md`。
>
> **写法约定**：每条给出「内容 / 依据（可点的文件或 ADR）/ 为什么现在没做 / 完成判据」四项。
> 没有依据的条目不写进来（本仓纪律：结论要有证据；宁可少列，不留悬空项）。
>
> 最后整理：2026-09-11（`v1.15.31`）—— **现存 24 条**（T 5 / D 8 / V 6 / G 4 + **B3**）；
> 已结案 **10 条**（B1 / B2 / D4 / D5 / 命中数累积 / `_meta.json` 并发 / `_index.md` 投影漂移 /
> 漂移审计工具 / 图快照顺序 / 台账版本出处）；**D6** 已决策待实现。
> **漂移审计已产出 3 次复核**（`judgment.ts` 双条件缺口、图快照取最旧、台账标签）；T5 余 **9 个键**。
> **本轮新增 B3 + T6**（ADR-0074：写入缺 `sandboxPolicy` ⇒ **记忆一条都落不了盘**；修复已提交，
> 但插件 `dist/` 不热加载 ⇒ 需重启宿主才能在真机复核）。
> **注意**：ADR-0074 **不列在本台账的「已结案」里** —— 它从来不是待办项，是本轮**新发现的真缺陷**
> （完整记录见 `CHANGELOG.md` v1.15.31）；本台账只登记它**遗留的两件事**（B3 / T6）。

---

## 〇、已结案（保留结论，便于回溯）

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

> 本节登记「必须由人执行」的项。B1 已闭环、B2 已决策；**B3** 是本轮新增（需一次宿主重启）。

### B3. 重启宿主，复核 ADR-0074 的落盘修复在**真机**生效

- **依据**：`adr/0074-write-sandbox-policy-omitted.md`；`CHANGELOG.md` v1.15.31。
- **为什么阻塞在人**：插件加载的是 `dist/index.js`，而 **`dist/` 不热加载**（ADR-0057 已两次记录该行为）
  —— 代码已改、已构建、已提交，但**运行进程里仍是旧代码**，只有重启才生效。这一步我无法自行完成。
- **现状（本轮实测的读数）**：`read_shadow` 顶部横幅
  `⚠ shadow 最近一次落盘失败（… file access denied under workspace-write mode）`；
  两次时间戳 `11:28:02Z`（v1.15.12）/ `11:35:11Z`（v1.15.30）⇒ 与升级无关，是**长期坏着**。
- **完成判据（重启后逐条实测，全部通过才算闭环）**：
  1. `read_shadow()` 返回值**不再出现**「落盘失败」横幅（`getFlushWarn()` 为空）；
  2. 会话工作区内出现**当天新写入**的记忆文件（`.shadow/<日期>/<时刻>-<入口>.md`），
     且是**本轮对话之后**新建的（不是旧文件）；
  3. `.shadow/_index.md` 的 mtime 随读取更新（读路径的 `ensureIndex` 也能落盘，即 ADR-0074 的接入点 ③）；
  4. 宿主日志**不再有** `[dsh-shadow][error] flush FAILED: … file access denied`；
  5. 若 1–4 有任一条不过，**不要**再按「参数没传对」猜 —— 先取 `read_shadow` 的横幅原文
     与 `dsh --profile web --dump-config` 的策略段，再定下一层根因（可能是 T6 的兜底根场景）。
- **为什么记在「阻塞在用户」而不是「未验证」**：它与 V1–V6 不同 —— 那些是「需装依赖 / 需特定真机条件」，
  这一条**只是一次重启**，且是**功能全失效**（记忆完全不落盘），优先级高于其余各项。

---

## 二、待分诊（第 8/9/11 轮已分诊一部分，T1 / T2 / T4 未完成）

> 背景：`v1.15.13`–`v1.15.18` 连续挖出**四类同源缺陷**，共同特征是「**机制是对的，
> 断的是谁调用它 / 谁写这个值**」，而**单元测试全绿**。故做了审计工具
> `tools/audit-wiring.ts`（A 类「导出但生产无调用点」、B 类「只被读、无写入点的判断值」）。
> **工具已标定**（`npm run audit:wiring:selftest`，8 组断言全过），但其输出是**线索不是结论**，
> 必须逐条人工分诊 —— 这部分**只做了一小部分**。

### T1. 审计 A 类线索未逐条分诊（30 条）

- **依据**：`adr/0062-wiring-audit.md`「未验证」第 1 条；`npm run audit:wiring` 输出 A 段。
  **计数为 2026-09-11 实跑所得**（`node tools/audit-wiring.ts .`，生产源码 **196** 个）；
  语料随仓库变化，重跑可能不同。**注意**：`v1.15.22` 把 `tools/*.mjs` 切到 `.ts` 后，
  工具开始扫到自己，但 **A 类计数不变（30）**。
- **本轮（v1.15.22）新增的分诊结果**（用 `_research/triage-a.ts` 逐条查生产调用点）：
  - **`progressiveDisclosure` / `refineTree`（`core/knowledge-cost.ts`）、`renderRetrieved`（`core/knowledge-retrieval.ts`）**
    —— 生产里**只有注释提到**它们（`core/knowledge-engine.ts:7-8` 的清单式注释），
    唯一真调用点是测试 ⇒ 属「**注释造成的假调用点**」，实际是**仅测试消费**（误报，但值得记）。
  - **`sembleCandidates`** —— **有生产调用点**（`core/index-engine.ts:10/45`）⇒ 误报。
  - **`apply`（`index.ts`）** —— 命中的是 `core/writer.ts:39` 的**注释**「apply 清理」⇒ 误报。
  - **`assertResultNoAuthorityGrowth` / `assertResultNoSelfConfidence` / `assertResultNoInferredObjective`
    / `assertResultNoIdentityChain`** —— **有生产调用点**：`long-horizon/engine/interaction.ts:6` 导入后
    放进 `resultGuards` 数组并在 `buildContinuityEvent` / `buildInteractionAdaptationLink` 里
    `for (const g of resultGuards)` 逐个调用 ⇒ **误报**（与 `delegation/guard/*` 同类：
    经数组间接调用，工具数不出 `Name(` 形态）。
  - **`hasNoUpgradeApi` / `isCognitiveAtom` / `isMetadataMemoryText` / `renderIntent` /
    `isExchangeable` / `renderIdentityModel` / `relationForProposal` / `readTemporalGraph` / `readGraph`**
    —— **生产与测试引用皆为零**（全仓 grep 各只命中定义行本身，`isExchangeable` 仅多一个测试）。
    这是**新一类线索**：既非「忘了接线」也非「测试面」，而是**导出了但谁都没用的公开面**。
    ⇒ **升为 T4**（见下）。
- **仍待处置**：`ChangeSet`（见 D1）。
- **为什么没做**：逐条核实成本高，且 A 类**精度本身低**（工具无类型分析）。
- **完成判据**：每条落「误报（给出生产使用点）/ 真断线（给出处置）/ 零引用（进 T4）」三选一，
  结果回写 `adr/0062`。

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

### T5. 漂移审计检测 B 的其余 11 个键待人工复核（线索，非结论）

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

### T4. A 类里 8 个「生产与测试引用皆为零」的导出符号（**已落 2 个，余 6 个**）

- **依据**：A 类逐条核实（`_research/triage-a.ts` → `triage-a-out.json`）+ **ADR-0070/0071**。
- **已处置 3 个**：
  - `isCognitiveAtom` —— **已删除**（ADR-0066）。理由不是「死代码」，而是它的规则与
    `validateAtomProjection` **完全重复**，留着会成为**第四份口径**。
  - `readTemporalGraph` / `readGraph` —— **保留 + 改正 + 收敛**（ADR-0071）：
    它们是持久化层的公开读 API；发现并修掉**顺序 bug**（取到最旧的快照），
    两份近重复逻辑收敛到 `persistence/snapshots.ts`。
    **接线与否另议**：`mode:"temporal"` 的真实读路径是 `buildTemporalGraph`（重建），
    **不应**把 reader 接成缓存（会重蹈 ADR-0069 的「缓存与源头脱钩」）。
- **剩余 6 个清单**（全部只命中定义行；`isExchangeable` 另有 1 处测试引用）：

  | 符号 | 文件 | 所在文件行数 |
  |---|---|---|
  | `hasNoUpgradeApi` | `agency/guards.ts:22` | 56（整文件） |
  | `isMetadataMemoryText` | `core/episode.ts` | —（ADR-0066 决定**保留**：服务不 parseMemory 的读路径） |
  | `renderIntent` | `core/intent.ts:54` | 61（同文件只有 `intentOf` 在用） |
  | `isExchangeable` | `federation/contract.ts:23` | 31（整文件） |
  | `renderIdentityModel` | `identity/timeline.ts:64` | 73（整文件） |
  | `relationForProposal` | `temporal/edge.ts:30` | 30（整文件） |

- **其余子类**：`renderIntent` / `renderIdentityModel` / `hasNoUpgradeApi` / `relationForProposal` /
  `isExchangeable` —— 「算了/判了但没渲染或没接出去」，需逐个定性。
- **完成判据**：余 6 个各落「接线 / 删除 / 保留并注明理由」。

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

- **依据**：`adr/0061-supersession-lifecycle-wiring.md`「负 / 已知边界」。
- **现状**：本仓的取代是 `entry` **单键 + 时间序**（`observer/arbitrate.ts` 的 `newestByEntryOf` + `verdictOf`）——
  粗粒度：**`entry` 不同的跨主题取代测不到**。文献（Temporal Validity, [arXiv:2606.26511](https://arxiv.org/abs/2606.26511)）
  用的是 `(subject, relation, object)` 三元组取代。
- **注意**：引入三元组需要**从记忆文本里稳定抽出 (s, r, o)** —— 那一步一旦交给 LLM，
  就撞 ADR-0059 的裁决（让 LLM 判语义有硬证据反对）。故若做，**抽取规则必须确定性**。
- **完成判据**：决定做 / 不做；若做，先写清**确定性抽取规则**并单独起 ADR。

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

### D6. 是否吸收 OpenViking 的三条做法（ADR-0065）—— **已决策：归类为 Projection；实现待后续**

- **决定（用户「按推荐」授权）**：
  1. **归类已定**：三条要新增的**都是 Projection（派生可重建）**，不是 source ——
     目录级 L0/L1 sidecar 由该目录下的记忆**确定性派生**（OpenViking 自己也是这么做的：
     它的 L0 是从 L1 正文里抽的）；覆盖率自报是**派生件的元数据**，不是事实源。
     ⇒ **不违反 ADR-0003**（未把权威状态写进可重建件），也不重蹈 ADR-0051 的「投影当 source」弯路。
  2. **三条都做**（按推荐吸收），但**本轮不实现** —— 它需要新增一类派生文件 + 改 `_index.md` 的定位，
     属独立工作量，**不塞进本轮**。
- **依据**：`adr/0065-absorbing-openviking.md`（一手材料：官方 README + Context Layers + Retrieval 文档）。
- **三条内容**：
  1. **目录级（`entry` 级 / 日期级）abstract + overview sidecar** —— 今天判断相关**必须先读记忆文件**，
     只能靠全局 `_index.md`；OpenViking 是**每层目录都带 L0/L1**（256 / 4000 字符上限）。
  2. **上层由下层确定性派生**（它的 L0 从 L1 正文里抽：H1 之后、首个 `##` 之前）—— 消除层间漂移；
     本仓三层各自从原文派生 ⇒ 存在「同一记忆的两层说法不一致」的可能。
  3. **派生件自报覆盖率与待处理变更**（它的 sidecar `freshness`：子项覆盖数 + `pending_child_changes`）
     —— 比单一源指纹更能回答「这份摘要是基于哪几个子项得出的」。
- **实现的前置（已定，供后续直接动手）**：① 定 sidecar 的落盘位置与命名（**必须隐藏**，不污染
  `listMemories` 的语料）；② 定 `_index.md` 与 sidecar 的关系（谁是目录级 L1 的权威）；
  ③ 加漂移棘轮（sidecar 与源记忆不一致即红，与 `toolset-catalog` 的双向棘轮同法）。
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

### V6. 审计工具未接入任何自动门禁

- **依据**：`adr/0062`「负 / 已知边界」。
- **现状**：本仓无 CI；`tools/audit-wiring.ts` 与 `tools/audit-wiring.selftest.ts` 靠手动跑
  （`npm run audit:wiring` / `audit:wiring:selftest`）。**标定测试本身是绿的**，但没有自动执行。
- **完成判据**：确定一处会执行它的地方（提交前脚本 / hooks / CI），否则工具会随时间失效。

---

## 五、已知空白（文献层面就没有答案，需自己实验证明）

> 这三条来自四路调研的**明确空白声明**（作者原话：「查了但没有好答案」）。
> 它们是**可做成原创贡献**的位置，也是**不可引文献充当已证**的位置。

### G1. 「知识带有效期字段」没有对照消融

- **依据**：知识库治理调研的空白第 1 条。
- **现状**：证据只到「过期知识造成伤害」+「确定性取代有效」，**没跨到「必须存 expiry 字段」**。
- **纪律**：落地该字段**需自证**，不能引文献充当已证。

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
