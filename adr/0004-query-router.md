# ADR-0004 · v0.14 Phase 5：query/router + apply 接线收敛

> 时间：2026-09-06 ｜ 状态：迁移表（可直接执行）
> 前置：ADR-0003（Core Refactor 分阶段）。领域逻辑已全部拆出（index.ts 1432→642）。
> 目标：把最后的两个巨型关注点拆出——`read_shadow` 的 query/router（单函数，~350 行）+ apply 接线收敛，使 index.ts 成为 ~200 行 Cordis Adapter。

## 1. 目标目录

```
query/
├── query.ts        # read_shadow 执行主体（多模式分派 + 召回管线）
├── router.ts       # 外部工具注册的薄壳（可选；也可直接在 index.ts 里 register 调 runReadShadow）
```

## 2. read_shadow execute 的完整依赖（迁移表）

> 现状：execute 闭包直接引用 index.ts 里的几十个本地 const/服务。Phase 5 把它们收敛进一个 `ShadowQueryDeps` 对象传入 `runReadShadow`。

### 2a. 服务（从 context.get）

| 依赖 | 来源 | 注入 |
|---|---|---|
| `fs` | `context.get("fs")` | deps.fs |
| `agents` | `context.get("agents")` | deps.agents |
| `llm` | `context.get("llm")`（expandTerms/summarizeTurn 用） | deps.llm |
| `agentDefaultModel` | `context.get("agentDefaultModel")`（routeFor 用） | deps.agentDefaultModel |

### 2b. 配置 / 状态

| 依赖 | 来源 | 注入 |
|---|---|---|
| `config` | apply 的 config | deps.config（含 evidenceProvider/evidenceProviders） |
| `recallCfg` | `config.recall ?? {}` | deps.recallCfg |
| `retentionCfg` | `config.retention ?? {}` | deps.retentionCfg |
| `summaryCfg` | `config.summary ?? {}` | deps.summaryCfg |
| `writeConsent` | `config.writeConsent === true` | deps.writeConsent |
| `cwdBySession` | apply 的 cwdBySession map | deps.cwdBySession |
| `lastFlushError` | apply 的 lastFlushError | deps.getFlushWarn()（func 动态取，传引用而非快照） |

### 2c. 已从 index.ts 迁出的模块函数（直接 import 进 query/router）

> query/router 可**直接 import** 这些模块函数（它们是模块级导出，无需注入）：
`resolveWorkspace`(core/scope)、`readRel/listMemories`(persistence/files)、`readMeta/writeMeta`(persistence/meta)、`readLedger/writeLedger`(retrieval/ledger)、`tokenize/ageDaysOf/RECALL_PREFIX`(core/util)、`scoreMemory/breakdownOf/confidenceOf/snippetFor/memorySummary/tierFor`(retrieval/rank)、`renderByTier/noMatchText`(retrieval/render)、`evidenceOf/provenanceText/newestByEntryOf/verdictOf/conflictOf`(observer/arbitrate)、`evidencePathsOf/isPathLike`(evidence/paths)、`lifecycleOf/hotnessOf/sigmoid`(core/lifecycle)、`kgTrace`(observer/observer)、`readSoul/soulText`(soul/soul)、`tasteOf/renderTaste`(soul/taste)、`experienceOf/renderExperience`(core/experience)、`judgmentOf/renderJudgment`(core/judgment)、`projectContext/renderProjection`(observer/projection)、`scrubFinal`(security/scrub)、`builtinEvidenceProviders/routeVerify`(evidence/gateway)、`fsEvidenceProvider`(evidence/filesystem)、`zgEvidenceProvider`(evidence/zg)。

### 2d. 仍需从 index 注入的闭包型依赖（不能在局 module 定义）

| 依赖 | 现状（index 闭包） | 注入方式 |
|---|---|---|
| `verifyEvidence` | `(ref, ctx) => routeVerify(ref, ctx, config.evidenceProvider \|\| "fs", config.evidenceProviders)` | deps.verifyEvidence（函数） |
| `expandTerms` | 用 `recallCfg`/`context.get("llm")`/`routeFor`/clearTimeout | deps.expandTerms（函数） |
| `routeFor` | 用 `summaryCfg`/`agentDefaultModel` | deps.routeFor（函数） |
| `summarizeTurn` | 用 `summaryCfg`/`context.get("llm")`/`routeFor` | deps.summarizeTurn（函数） |

### 2e. 协议

```ts
// query/types.ts
export interface ShadowQueryDeps {
  fs: any; agents: any; llm?: any; agentDefaultModel?: any;
  config: any; recallCfg: any; retentionCfg: any; summaryCfg: any; writeConsent: boolean;
  cwdBySession: ReadonlyMap<string, string>;
  getFlushWarn: () => string;                 // 动态取 lastFlushError → flushWarn
  verifyEvidence: (ref: any, ctx: any) => Promise<any>;
  expandTerms: (topic: string) => Promise<string[]>;
  routeFor: (cfg?: any) => { provider: string; model: string } | undefined;
  summarizeTurn: (agent: any, body: unknown) => Promise<string>;
}
export async function runReadShadow(deps: ShadowQueryDeps, args: any, exec: any): Promise<string> { ... }
```

## 3. index.ts（Adaper）收敛

```ts
// index.ts —— Cordis Adapter：config 解析 + 事件接线 + 工具注册 + systemPrompt。
// 领域函数从各模块 import；只有闭包型依赖在此构造并注入。

const verifyEvidence = (ref: any, ctx: any) => routeVerify(ref, ctx, config.evidenceProvider || "fs", config.evidenceProviders);
const expandTerms = async (topic: string) => { ... 保留在 index（闭包 llm/routeFor/recallCfg） ... };
const routeFor = ...; const summarizeTurn = ...;

const queryDeps: ShadowQueryDeps = { fs: context.get("fs"), agents: context.get("agents"), llm: context.get("llm"), agentDefaultModel: context.get("agentDefaultModel"), config, recallCfg, retentionCfg, summaryCfg, writeConsent, cwdBySession, getFlushWarn: () => flushWarn, verifyEvidence, expandTerms, routeFor, summarizeTurn };

context.inject(["tools"], (toolsCtx) => {
  toolsService.register({
    name: "read_shadow", description: "...", parameters: {...}, output: {...},
    execute: (args: any, exec: any) => runReadShadow(queryDeps, args, exec),
  });
});
```

## 4. query/query.ts 骨架

```ts
import { ... } from "../core/...", "../security/...", "../retrieval/...", "../observer/...", "../soul/...", "../evidence/...";
import type { ShadowQueryDeps } from "./types.js";

export async function runReadShadow(deps: ShadowQueryDeps, args: any, exec: any): Promise<string> {
  // ── 原 execute 全部逻辑原样搬移；把引用改为 deps.xxx 或直接 import 的模块函数 ──
  // 1. ws = resolveWorkspace(exec.agent, deps.cwdBySession, deps.config)
  // 2. flushWarn = deps.getFlushWarn()
  // 3. soul/taste/observer/project/judgment/experience/verify/recall 各分支（原样）
  // 4. 召回管线：memories/tokenize/expandTerms(闭包于 deps)/score/verdict/conflict/render/ledger/meta
  // ... 全部从 old execute 搬入，仅壳位换 deps 引用 ...
}
```

## 5. 执行与验收（保持行为不变）

- 步骤：① 建 `query/types.ts`（ShadowQueryDeps）→ ② 建 `query/query.ts`（把 index.ts 的 read_shadow execute 全体搬入，闭包引用改 `deps.*`/import）→ ③ index.ts 构造 `queryDeps` + `execute` 改调 `runReadShadow(queryDeps, args, exec)`。
- 每步：`tsc` + `node --check` + 全量 mock 1–42 全绿。
- 验收：`index.ts` ~200 LOC；`read_shadow` 外部行为不变；mock 全绿。
- 关键：**不要**把 `read_shadow` 拆成 8 个 DSH 工具（保持单一工具，内部 Router）。

## 6. 取舍 / 排除
- query/query.ts 保留多模式分派的 `if (args.xxx)`（不改读侧 API）；进一步改为内部 Query Router 对象是可选项，非本题必要。
- apply 状态（pending/comps）留在 index.ts 的 flush/push（采集侧）；本 ADR 只收敛**读侧 query**。写侧 flush/push 的收敛见后续（若需要，另行一个 ADR）。
