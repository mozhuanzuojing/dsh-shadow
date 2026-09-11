# dsh-shadow · 待办与未决事项（Backlog）

> **口径**：本文件只登记**尚未完成**的事项，是待办的**唯一台账**。
> 已完成的历史见 `CHANGELOG.md`；决策与依据见 `adr/`；术语见 `CONTEXT.md`。
>
> **写法约定**：每条给出「内容 / 依据（可点的文件或 ADR）/ 为什么现在没做 / 完成判据」四项。
> 没有依据的条目不写进来（本仓纪律：结论要有证据；宁可少列，不留悬空项）。
>
> 最后整理：2026-09-11（`v1.15.22`）—— 现存 **22 条**（B 2 / T 4（T3 已结案）/ D 6 / V 6 / G 4）；T1 / T2 / T4 仍未完成。

---

## 一、阻塞在用户（需要人执行或拍板，我无法自行推进）

### B1. 重启 DSH，使插件代码生效

- **内容**：`v1.15.13`–`v1.15.19` 七个版本的插件改动**全部未在运行中的宿主生效**。
- **依据**：`adr/0057-delegation-toolset-seam.md`「运维事实」节 —— 已实测**两种加载行为并存**：
  host 组合行与新装的包**热加载**；本插件的 `dist/` 改动**不热加载**。
- **真机取证（第 5/6/7 轮各验一次）**：运行中进程里 `read_shadow({mode:"toolset", need:[...]})`
  返回的是 `_index.md`（不是台账）；`Tool.listTools` 给出的 `read_shadow` schema
  **含** v1.15.9 的 `install`/`survey`/`category`，**不含** `need`；`mode` 描述里**没有** `toolset`
  ⇒ 运行中的是 **v1.15.12**（正是 `toolset` 未挂上 `readQueries` 的那一版）。
- **为什么没做**：重启会**终止正在协调本目标的会话**，我将无法汇报结果。属「必须由人执行」类。
- **完成判据**：重启后在新会话里 `read_shadow({mode:"toolset"})` 返回**台账**（107 项、17 分类），
  且 `read_shadow({mode:"toolset", need:["全文搜索"]})` 返回**能力预检**（而非索引目录）。

### B2. 多粒度检索层的产品方向（ADR-0060 待裁决）

- **内容**：原设想是「向量库多弄几个，片段超大/大/中/小，**每次找回从这些库中都找一遍**」。
  实测与文献**双重反对**该主张的核心部分，但这是产品方向，须由用户拍板。
- **依据**：`adr/0060-multi-granularity-retrieval-form.md`（含三条选项与实测表）。
- **关键实测**（真 `.shadow` 语料 1500 条、按 ADR-0054 实测性质建模的检索器、同候选预算、3 种子）：
  - 离题噪声：有阈值单库 **0.000** vs 无阈值 **1.000**（扇出只是把噪声**乘以库数**）；
  - 扇出即便含互补来源**也不升召回**（0.347 vs 0.358，落在 ±0.053 种子极差内）；
  - 复现命令：`npm run eval:retrieval`（`tools/retrieval-eval.ts`）。
- **另一条事实**：现有 `indexEngine.provider` 是**单值**，工厂只路由到**一个**来源
  ⇒ 全量扇出**不是加能力，是对现有设计的退步**。
- **三个选项**：① 按证据改（推荐：单索引 + 层级表示 + 路由）② 先装 semble 用同一工具复测再定
  ③ 仍按原设想（本 ADR 记「用户决策，证据反对」）。
- **为什么没做**：属产品决策；且本机 `semble` / `zg` 均未安装，选 ② 需先装。
- **完成判据**：选定其一并落成决策记录（若选 ①/③ 需改 ADR-0060 的状态；若选 ② 需装 semble 后复测）。

---

## 二、待分诊（第 8/9 轮已分诊一部分，T1 / T2 未完成）

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

### T4. A 类里 9 个「生产与测试引用皆为零」的导出符号（本轮从 T1 拆出）

- **依据**：本轮 A 类逐条核实（`_research/triage-a.ts` → `triage-a-out.json`）。
- **清单**（全部只命中定义行；`isExchangeable` 另有 1 处测试引用）：

  | 符号 | 文件 | 所在文件行数 |
  |---|---|---|
  | `hasNoUpgradeApi` | `agency/guards.ts:22` | 56（整文件） |
  | `isCognitiveAtom` | `core/episode.ts:97` | — |
  | `isMetadataMemoryText` | `core/episode.ts:100` | — |
  | `renderIntent` | `core/intent.ts:54` | 61（同文件只有 `intentOf` 在用） |
  | `isExchangeable` | `federation/contract.ts:23` | 31（整文件） |
  | `renderIdentityModel` | `identity/timeline.ts:64` | 73（整文件） |
  | `relationForProposal` | `temporal/edge.ts:30` | 30（整文件） |
  | `readTemporalGraph` | `temporal/persistence.ts:16` | 32（**只写不读**） |
  | `readGraph` | `world/persistence/persist.ts:13` | 29（**只写不读**） |

- **两个子类（性质不同，须分开处置）**：
  - **(a) 成对的读/写不对称**：`readTemporalGraph` / `writeTemporalGraph`、
    `readGraph` / `writeGraph` —— **只写不读**。这是**真线索**：数据落盘但无人读回，
    要么是「读回来做校验」忘了接，要么是「只做审计留痕、本就不读」。**需定性**。
  - **(b) 无关口的认知门 / 渲染器**：`isCognitiveAtom` / `isMetadataMemoryText` 已由 **D5** 覆盖；
    `renderIntent` / `renderIdentityModel` 是「算了但没渲染出去」。
- **为什么没做**：需要**逐个追作者意图**（前瞻 / 遗漏 / 有意公开面）；本轮只交付了
  「生产与测试引用皆为零」这一定量事实，**未逐个定性**。
- **完成判据**：9 个各落「接线 / 删除 / 保留并注明理由」；其中 (a) 两条优先（可能涉及「写了不读」）。

---

## 三、待决策（技术取舍，已有依据，缺拍板）

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

### D4. `pinned` / `archived`：补入口、改派生、还是纠正文档？

- **依据**：T3 的分诊结论（`pinned` 恒 false、`archived` 无写入者；`_meta.json` 是 Derived Artifact；
  `MEMORY.md:90` 声明「纯按信号推导、不做写侧硬状态迁移」与实现的写侧读取**不一致**）。
- **三条路及代价**：

  | 选项 | 做什么 | 代价 / 风险 |
  |---|---|---|
  | **① 补持久入口** | 加命令 / 工具动作置 `pinned` / `archived` | 会把「**外部权威状态**」落在 **Derived Artifact**（`_meta.json`）上 —— 与 ADR-0003「Memory 文件是 source of truth、meta 可重建」**直接冲突**；除非先把该状态**升为 source**（例如落进记忆文件头），那是更大的改动 |
  | **② 改为信号派生** | 删掉两条写侧读取，改由 meta 信号推导 | 与 `MEMORY.md:90` 的声明一致；但「**人工**归档」本质**没有信号可派** —— 强行派生会造出一个语义不符的状态（本仓纪律：不臆造机制） |
  | **③ 纠正文档** | 改 `README.md:35` / `:177` / `:178` / `MEMORY.md:90`，删掉不可达承诺或标注「保留给未来入口」 | 最小改动、最诚实；代价是**丢掉一个已文档化的能力承诺** |

- **建议倾向**：**③ 为主 + ① 的窄版本**——先把文档改准（现状与承诺对齐），
  若产品确实需要「人工钉住/归档」，再单独立项设计**符合 ADR-0003 的持久入口**
  （状态必须落在 source，而不是派生文件）。**不建议 ②**（无信号可派，会造语义不符的状态）。
  这只是建议，**决策权在用户**。
- **完成判据**：选定其一并落地；若选 ③，需同步改 `README.md` 三处（`:35` / `:177` / `:178`）+ `MEMORY.md:90`，
  并在 `adr/0062` 记「T3 已分诊并处置」；若选 ①，需先起 ADR 论证「外部权威状态落在哪一层」。

### D5. `metadata` 认知门该不该继续挡住 **67.2%** 的库？

- **依据**：`adr/0063-cognitive-gate-reachability.md`（含真语料实测表）。
- **现状（实测，非推断）**：`deriveAtomKind` 把 `entry === "shadow"` 当「会话元数据」的代理，
  而 `entry` 的来源是写侧兜底字面量（`core/writer-materialize.ts:175`）——语义是「**没识别出组件**」。
  真语料 6960 条：判 `metadata` 的 **4137 条（59.4%）**，其中 **94.4% 有实质内容**；
  投影路径据此只产出 2283 个节点 ⇒ **主题召回可见 100%，`shadow_query` 只可见 32.8%**。
- **三条路**：

  | 选项 | 做什么 | 代价 / 风险 |
  |---|---|---|
  | **① 换信号** | 不再用 `entry === "shadow"`，改由**内容信号**判会话元数据（如「无动作 + 无材料 + 无决策 + 无目标」） | 需先定**新信号**并证明它在真语料上的判准（可复用本轮三个探针）；会**扩大召回面**，需评估噪声 |
  | **② 保留但收紧** | 承认 `entry === "shadow"` 是弱信号，**只有同时满足其它条件**才判 metadata | 改动最小；但「多弱条件叠加」仍需用真语料标定，否则是拍脑袋 |
  | **③ 维持现状 + 记清代价** | 不改行为，只在文档与召回输出里**显式说明**「投影路径只覆盖 32.8%」 | 零风险；但两个读路径可见性差 67.2% 这一事实会长期存在 |

- **建议倾向**：**先做 ① 的信号实验（用现有探针量判准），再决定 ①/②**；**不建议长期停在 ③**
  —— 同一份语料两条读路径可见性差 3 倍，会让「召回看得见、shadow_query 看不见」变成使用者踩不完的坑。
  **但这涉及召回语义，决策权在用户**（本仓纪律：不静默改已冻结行为）。
- **连带**：`isCognitiveAtom` 与 `isMetadataMemoryText` **生产零调用点**且口径与生效实现不一致
  （实测 4137 vs 110，窄 37 倍）。选定 ①/② 后须**同时决定这两份实现**的去留（删 / 接线 / 保留标注）。
- **完成判据**：选定其一并落地；若选 ①/②，需附**真语料前后对照**（调用同一组探针），
  并同步改 `test/atom-kind-gate.test.ts`（该测试是**决策锁**，D5 落地后必须一起改，否则假红）。
- **另一条附带事实（本轮分诊得出，不需决策）**：`AtomKind` 声明 5 值，
  而唯一生产者只能产出 3 值 —— `session` 与 `artifact` **全仓无生产者**，
  故 `core/lineage-validator.ts:18` 的 `kind === "session"` 分支**永不可达**。已在源码注释标注。

### D6. 是否吸收 OpenViking 的三条做法（ADR-0065）

- **依据**：`adr/0065-absorbing-openviking.md`（一手材料：官方 README + Context Layers + Retrieval 文档）。
- **三条待裁决项**：
  1. **目录级（`entry` 级 / 日期级）abstract + overview sidecar** —— 今天判断相关**必须先读记忆文件**，
     只能靠全局 `_index.md`；OpenViking 是**每层目录都带 L0/L1**。
  2. **上层由下层确定性派生**（它的 L0 是从 L1 正文里抽的）—— 消除层间漂移；本仓三层各自从原文派生。
  3. **派生件自报覆盖率与待处理变更**（它的 sidecar `freshness`：子项覆盖数 + `pending_child_changes`）
     —— 比单一源指纹更能回答「这份摘要是基于哪几个子项得出的」。
- **为什么现在不能顺手做**：这三条都要**新增一类派生文件**，必须先定它在 ADR-0003 下算
  **Projection**（可重建）还是 **source**（事实源）—— 定错就会造出「没有生产者」的死类型，
  或把 source 当投影（ADR-0051 走过一次这个弯路）。
- **顺带记一条对 ADR-0060 的精化（不需决策）**：OpenViking 的层级分数传播公式是
  `alpha * embedding + (1-alpha) * parent`，而 **`score_propagation_alpha` 默认 `1.0`**
  ⇒ **默认父分权重为 0**。即：**层级在它那里买的是「递归下钻扩大候选」，不是「分数平滑」**。
- **完成判据**：三选三（各做 / 各不做）；若做，先起 ADR 定「新派生文件的归类」。

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
