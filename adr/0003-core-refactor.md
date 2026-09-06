# ADR-0003 · v0.14 Core Refactor（领域内核拆分）

> 时间：2026-09-06 ｜ 状态：提案（待执行） ｜ 版本：v0.14
> 前置：ADR-0001（文件树）/ ADR-0002（Experience+Evidence）。**本次不是加功能，是把已长出的领域内核从 `index.ts` 拆出去。**

## 1. 背景 / 判断

`index.ts` 已是 **1432 LOC / 106 个顶层名** 的 god object：scope/config/采集/安全/持久化/索引/召回/排序/生命周期/证据/KG/Soul/Experience/Observer/Projection/Judgment/Taste/工具注册/提示 全挤在一个文件。多个 bounded context 被压扁。
- 概念架构 8.5/10、工程结构 6/10、数据模型 6.5/10、可扩展性 5.5/10。
- 继续往 `index.ts` 加（如 zg）会不可维护。**下一步正确动作 = Core Refactor，不是 Feature。**

## 2. 目标目录（每模块单一职责）

```
dsh-shadow/
├── index.ts                 # Cordis Adapter（薄）：config 解析 + 事件 wire + 工具注册 + systemPrompt
├── core/
│   ├── types.ts             # 所有 DTO/接口（ShadowConfig/AgentLike/Evidence*/Trace/Memory/Experience...）
│   ├── scope.ts             # resolveShadowScope/resolveWorkspace/firstNonEmpty
│   ├── trace.ts             # Trace（中间层：raw events → Trace）
│   ├── memory.ts            # Memory（从 Trace 成型记忆记录 + 完整线索头）
│   ├── experience.ts        # Experience 领域对象（situation/problem/intent/decision/action/evidence/outcome/reflection/lesson/confidence/provenance/scope）
│   ├── judgment.ts          # Judgment（情境→决策→reason）
│   ├── lifecycle.ts         # age/hotness/lifecycle 派生
│   └── arbitrate.ts         # Shadow Evidence Arbitration（EvidenceResult → Verified/Stale/Superseded）
├── evidence/
│   ├── gateway.ts           # EvidenceProvider 抽象 + verifyEvidence 路由
│   ├── filesystem.ts        # FsExistenceProvider（只答"还在不在"）
│   └── zg.ts                # ZgEvidenceProvider（内容/semantic/exact 验证）
├── observer/
│   ├── observer.ts          # Observation Window（asOf 时间锚定 + 当时可知/[后验]）
│   └── projection.ts        # Projection → LocalContext（relevant/current_state/uncertainty/excluded）
├── soul/
│   ├── soul.ts              # Soul Kernel（identity/values/principles/boundaries + Observer Lens）
│   └── taste.ts             # Taste（curated 偏好）
├── retrieval/
│   ├── discover.ts          # 候选发现（listMemories/tokenize/topicsInText）
│   ├── rank.ts              # 排序（scoreMemory/breakdown/confidence/expandTerms/tier/memorySummary）
│   ├── render.ts            # 渲染（renderByTier/provenanceText/RECALL_PREFIX/noMatchText）
│   └── ledger.ts            # recall ledger/cooldown（readLedger/writeLedger）
├── persistence/
│   ├── files.ts             # 读写记忆文件（readRel/listMemories）
│   ├── meta.ts              # _meta.json / _recall_log.json（Derived Artifacts）
│   └── index-view.ts        # _index.md（Derived 物化视图：rebuildIndex/buildIndexText/buildClueHeader）
├── security/
│   └── scrub.ts             # sanitize/scrub/stripSystemScaffold/injection（只改 Presentation）
└── query/
    ├── router.ts            # read_shadow 的 Query Router（外部仍单一 read_shadow 工具）
    ├── recall.ts / experience.ts / observer.ts / projection.ts / judgment.ts / soul.ts / verify.ts  # 各模式
```

## 3. 核心语义修正（本次必须一并做）

| # | 现状 | 修正 | 优先级 |
|---|---|---|---|
| 1 | Evidence = 路径存在性 | 拆成 `existence`（FsExistenceProvider，只答"还在不在"）与 `content/semantic`（zg 验证"是否仍支持记忆"）；FS provider **改名 FsExistenceProvider** | P0 |
| 2 | Experience.lesson ← 摘要 | 拆成 `summary/reflection/lesson` 三字段（Summary ≠ Lesson） | P1 |
| 3 | confidence 单一 | 拆 `confidence.retrieval/evidence/experience/judgment/projection` | P1 |
| 4 | superseded = 同 entry 更新 | 升级为 **decision lineage**（A→Correction→B→Correction→A'），保留"为何变化" | P1 |
| 5 | 无 Trace | 新增 **Trace** 中间层：World/DSH Events → Trace → Memory → Experience | P1 |
| 6 | read_shadow 万能 | 内部分 `ShadowQuery → RecallQuery/ExperienceQuery/ObserverQuery/ProjectionQuery/JudgmentQuery/SoulQuery`；**外部仍单一 `read_shadow` 工具** | P1 |
| 7 | `_index.md/`_meta.json`/`_recall_log.json` 当库 | 降级为 **Derived Artifacts**；Memory 文件 = source of truth；坏了 `rebuild-index` 重建 | P2 |
| 8 | 安全 scrub 全流程 | **scrub 只改 Presentation，不改 Canonical Evidence**（原始证据 immutable） | P2 |
| 9 | asOf = YYYY-MM-DD | 升级 `asOf { timestamp, timezone }`（Observer v2，P2） | P2 |
| 10 | Soul 像配置文件 | 概念命名：Soul Kernel 下再分 `Identity/Values/Principles/Taste/Boundaries` + **Observer Lens**（Soul 的工程化投影，非"灵魂数据库"） | P2 |

## 4. 迁移表（真实 index.ts 函数 → 模块）

> 以当前 `index.ts` 顶层名为准（1432 行 / 106 个名字）。`[]` 内为原文件位置逻辑。

### index.ts（Adapter，保留，变薄）
`config` 解析、`context`、`MAX_PENDING`、`apply()` 的 config/事件 wire/工具注册/systePrompt/cleanup；导出 `resolveShadowScope/resolveWorkspace/firstNonEmpty` → 移到 core/scope.ts（index.ts 只 re-export）。

### core/
- **types.ts**（新建）：`ShadowConfig`、`AgentLike`、`EvidenceRef/EvidenceMatch/EvidenceResult/EvidenceProvider`、`Trace`、`MemoryRecord`、`Experience`、`Judgment`、`ProjectionResult`、`Taste`。
- **scope.ts**：`resolveShadowScope`、`resolveWorkspace`、`firstNonEmpty`。
- **trace.ts**（新建）：Trace（ray events → Trace 的归一化，含 userSignal/action/evidenceRefs）。
- **memory.ts**：`push`、`primaryComp`、`extractMessage`、`goalText`、`classifyUser`、`buildClueHeader`、`flush`（采集+压成 Memory Record 部分）。
- **experience.ts**：`experienceOf`、`renderExperience`。
- **judgment.ts**：`judgmentOf`、`renderJudgment`。
- **lifecycle.ts**：`ageDaysOf`、`sigmoid`、`hotnessOf`、`lifecycleOf`。
- **arbitrate.ts**：`verdictOf`、`newestByEntryOf`（+ superseded→lineage 升级后的仲裁逻辑）。

### evidence/
- **gateway.ts**：`verifyEvidence`、`evidenceProviderName`、`builtinEvidenceProviders`、EvidenceProvider 抽象。
- **filesystem.ts**：`fsEvidenceProvider`、`fsExists`（= **FsExistenceProvider**）。
- **zg.ts**：`zgEvidenceProvider`、`runZg`、`parseZgMatches`、`zgVerify`。

### observer/
- **observer.ts**：`evidenceOf`、`provenanceText`、`conflictOf`（→ 调 evidence gateway）、asOf/observer 分支逻辑。
- **projection.ts**：`projectContext`、`renderProjection`。

### soul/
- **soul.ts**：`readSoul`、`soulText`。
- **taste.ts**：`tasteOf`、`renderTaste`。

### retrieval/
- **discover.ts**：`listMemories`、`tokenize`、`topicsInText`。
- **rank.ts**：`scoreMemory`、`breakdownOf`、`confidenceOf`、`expandTerms`、`snippetFor`、`tierFor`、`memorySummary`。
- **render.ts**：`renderByTier`、`RECALL_PREFIX`、`noMatchText`。
- **ledger.ts**：`readLedger`、`writeLedger`。

### persistence/
- **files.ts**：`readRel`、`listMemories`。
- **meta.ts**：`readMeta`、`writeMeta`、`registerMeta`、`readLedger`、`writeLedger`、`ageDaysOf`。
- **index-view.ts**：`rebuildIndex`、`buildIndexText`、`topicsInText`、`buildClueHeader`。

### security/scrub.ts
`SECRET_PATTERNS`、`UNSAFE_CONTROL`、`sanitizeText`、`isUnsafe`、`scrubUnsafe`、`SYSTEM_TAG_NAMES`、`SYSTEM_TAG_RE`、`SYSTEM_TAG_RESIDUE_RE`、`stripSystemScaffold`、`SYSTEM_SCAFFOLD_MARKERS`、`isScaffoldBlock`、`INJECTION_PHRASES`、`scrubFinal`、`referencedMaterials`。

### query/
- **router.ts**：read_shadow execute 的 mode 分派（soul/taste/recall/observer/verify/project/judgment/experience）。
- **recall.ts**：recall 主体（候选/排序/预算/冷却/裁决）。
- **experience.ts / observer.ts / projection.ts / judgment.ts / soul.ts / verify.ts**：各 mode 的 execute 逻辑。

### 事件（留在 index.ts 或 core/memory.ts 接线）
`context.on("fs/observed")`、`"tools/result"`、`"goal/changed"`、`"session/event"`、`"agent/turn-stopping"`、`"session/flush"` → `memory.ts`（采集源）注册，index.ts 只负责 `on()` 绑定。

## 5. 执行策略（分阶段，测试保持绿）

> 目的：重构**保持行为不变**（mock 场景 1–42 全绿作为回归护栏），分阶段落地，每阶段可独立验收。

- **Phase 1**：建 `core/types.ts` + `core/scope.ts` + `security/scrub.ts`（纯搬移，无行为变化）；`index.ts` 改为 import。跑 mock 1–42 全绿。
- **Phase 2**：拆 `persistence/`（files/meta/index-view）与 `retrieval/`（discover/rank/render/ledger）。
- **Phase 3**：拆 `evidence/`（gateway/filesystem/zg）与 `observer/`（observer/projection）+ `core/arbitrate.ts`。
- **Phase 4**：拆 `core/`（memory/experience/judgment/lifecycle）+ `soul/` + `query/`（router + 各 mode）。
- **Phase 5**：`index.ts` 缩到 Cordis Adapter（~200 LOC）；`index.ts` 只 re-export core/scope。
- 每阶段：`tsc` + `node --check` + 全量 mock（场景 1–42）+（若已 live 复验的）写侧再验。
- **验收**：`index.ts` 目标 ~200 LOC；无重复；mock 全绿；read_shadow 外部行为不变。

## 6. 取舍 / 排除
- **不做**：把 read_shadow 拆成 8 个 DSH 工具（会炸 Agent 工具选择空间）——保持单一 `read_shadow`，内部分 Router。
- **不做**：自动推断 Observer（research 级）——保留"curated + 可证伪"边界，明确不宣称"你的灵魂就是这样"。
- **不做**：更多 Memory 类型（Fact/Episodic/Semantic/Procedural/Normative 仅在概念层注明，不作新存储）。
