// dsh-shadow —— tools/contract-surface.selftest.ts：**契约面枚举棘轮**（`adr/0086` 的 tool-schema-v1 / config-keys-v1）。
//
// 为什么有它：这两族的 `verification` 此前一直是「参数名无人枚举」「没有一处枚举键名」
// ⇒ 删参数 / 改名 / 删键**不会有任何东西变红**（README 的受保护契约面里自己写着这条）。
// 本文件把两族各自冻成一份**清单**（不是计数 —— 计数只答「变了没有」，清单能点名「缺了谁」）：
//   · allowed   = 新增（加参数 / 加键）⇒ 只报告
//   · forbidden = 改名 / 删除 ⇒ 红，并点名缺哪一个
// 跑法：node tools/contract-surface.selftest.ts
// 重新生成冻结清单（只有「确属有意新增」时才跑，改完清单要在 `CHANGELOG` 里说清）：
//     SHADOW_PRINT_SURFACE=1 node tools/contract-surface.selftest.ts
// ⚠ 依赖 dist/：先 `npm run build`（`npm run test:all` 会先构建）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as mod from "../dist/index.js";
import { diffSurface, extractConfigKeys, extractParamNames } from "./contract-surface.lib.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// ⚠ 刻意**不**与字面量判等（`=== "1"`）：`audit:ratchet` 的 B 类按「字段=字面量」计线索，
// 那样会新添一条 `SHADOW_PRINT_SURFACE=1` 的线索（+1 即红，而它不是判据、只是个调试开关）。
// 传任意非空值即进入打印模式（`SHADOW_PRINT_SURFACE=1 node tools/contract-surface.selftest.ts`）。
const PRINT = Boolean(process.env.SHADOW_PRINT_SURFACE);
const TOOLS = ["read_shadow", "recall_shadow", "shadow_query"];

// ── mock host：只为把三个工具的 schema 注册出来（与 test/recall-envelope.test.ts 同法）──
const makeRegistry = () => {
  const registry = new Map<string, any>();
  const services: any = {
    fs: {
      async resolve(p: string) { return { targetKey: p, displayPath: p }; },
      async readText() { return ""; },
      async writeText() { return { version: "v1" }; },
      async listDir() { return []; },
    },
    agents: { currentInitiator: () => null, get: () => undefined },
    systemPrompt: { context: () => {} },
    tools: { register: (def: any) => registry.set(def.name, def) },
  };
  const ctx: any = {
    get: (k: string) => services[k],
    on: () => () => {},
    inject: (_deps: string[], cb: (c: any) => void) => cb({ get: (k: string) => services[k] }),
  };
  mod.apply(ctx, { summary: { enabled: false } });
  return registry;
};

// ── 冻结清单（粘贴自 SHADOW_PRINT_SURFACE=1 的输出；顺序 = 声明序）──
const TOOL_PARAM_FROZEN: Record<string, string[]> = {
  "read_shadow": [
    "topic",
    "limit",
    "max_tokens",
    "debug",
    "kg",
    "soul",
    "experience",
    "asOf",
    "observer",
    "project",
    "raw",
    "judgment",
    "claim",
    "taste",
    "verifyEvidence",
    "identity",
    "context",
    "goal",
    "realityAnchor",
    "lens",
    "state",
    "mode",
    "from",
    "to",
    "minCount",
    "minRecency",
    "maxContradiction",
    "halfLifeDays",
    "at",
    "trigger",
    "hypothesisId",
    "observedAt",
    "actualOutcome",
    "observationType",
    "sourceObserverId",
    "obsClaim",
    "visibleA",
    "visibleB",
    "targetObserverId",
    "perceptionOnly",
    "identityContext",
    "temporalReference",
    "obsConfidence",
    "valConfidence",
    "observation",
    "realityId",
    "realEvidenceRef",
    "lensA",
    "lensB",
    "obsClaimB",
    "linkedHypothesis",
    "hasValidation",
    "subject",
    "sourcePerspectives",
    "temporalContext",
    "validationRefs",
    "claimId",
    "relation",
    "evidence",
    "condition",
    "basedOn",
    "proposal",
    "proposedChange",
    "basedOnSimulation",
    "candidateId",
    "environmentChange",
    "executionId",
    "objective",
    "objectiveSource",
    "criteria",
    "constraints",
    "candidates",
    "simulationRefs",
    "observedChanges",
    "successIndicator",
    "unexpectedEffects",
    "objectiveRef",
    "authoritySource",
    "authorityScope",
    "reason",
    "selectedCandidateId",
    "actionCandidate",
    "identityRef",
    "constraintCheck",
    "executionResult",
    "delegationId",
    "allowedScope",
    "expiration",
    "revocation",
    "action",
    "satisfiedConstraints",
    "now",
    "originalRef",
    "forgottenAt",
    "recalledRef",
    "triggerType",
    "sourceRef",
    "observationRefs",
    "status",
    "sourceExperience",
    "adaptationScope",
    "target",
    "changeObserved",
    "validationReferences",
    "sideEffectsObserved",
    "basedOnHistory",
    "sourceRefs",
    "compressionMethod",
    "accessibility",
    "historyRef",
    "previousAccessibility",
    "recallRef",
    "adaptationRef",
    "interactionStyle",
    "outputPreference",
    "defaultProtocol",
    "planningCannotCreateObjective",
    "records",
    "observerId",
    "continuityRef",
    "kind",
    "content",
    "evidenceRefs",
    "runtimeVersion",
    "install",
    "survey",
    "category",
    "need"
  ],
  "recall_shadow": [
    "query",
    "limit"
  ],
  "shadow_query": [
    "query",
    "scope",
    "limit"
  ]
};
const CONFIG_KEY_FROZEN: string[] = [
  "shadowRoot",
  "projectRoot",
  "observerGlobalRoot",
  "summary",
  "recall",
  "retention",
  "episodes",
  "forget",
  "compact",
  "context",
  "llmRecall",
  "writeConsent",
  "capture",
  "queryLog",
  "projectionStore",
  "projectionSpace",
  "indexEngine",
  "derivedIndex",
  "knowledgeEngine",
  "abstracts",
  "evidenceProvider",
  "evidenceProviders"
];

// ── 实际值 ──
const registry = makeRegistry();
const actualParams: Record<string, string[]> = {};
for (const t of TOOLS) {
  const def: any = registry.get(t);
  actualParams[t] = def ? extractParamNames(def.parameters) : [];
}
const configKeys = extractConfigKeys(readFileSync(join(repoRoot, "core", "types.ts"), "utf8"));

if (PRINT) {
  console.log("// 粘贴用（顺序 = 声明序）");
  console.log("const TOOL_PARAM_FROZEN: Record<string, string[]> = " + JSON.stringify(actualParams, null, 2) + ";");
  console.log("const CONFIG_KEY_FROZEN: string[] = " + JSON.stringify(configKeys, null, 2) + ";");
  process.exit(0);
}

// 结构缺失不是通过（ADR-0049）：抽不到 = 判据坏了，不是「没有键 / 没有参数」。
for (const t of TOOLS) {
  assert.ok(actualParams[t].length > 0, `抽不到 ${t} 的参数名（工具没注册 / schema 结构变了）—— 结构缺失不得当成通过`);
}
assert.ok(configKeys.length > 0, "从 core/types.ts 抽不到 ShadowConfig 顶层键（锚点 `export interface ShadowConfig {` 或深度扫描坏了）—— 结构缺失不得当成通过");

// ① tool-schema-v1：参数名冻结（改名 / 删除 = forbidden）
let paramTotal = 0;
for (const t of TOOLS) {
  const d = diffSurface(TOOL_PARAM_FROZEN[t], actualParams[t]);
  assert.equal(
    d.missing.length,
    0,
    `tool-schema-v1（契约表 forbidden = 改名/删除）：${t} 少了这些参数名：${d.missing.join(", ")} —— 要下线请走 README「最小弃用流程」，并同步改本文件`,
  );
  if (d.added.length) console.log(`  · ${t} 新增参数 ${d.added.length} 个（allowed，只报告）：${d.added.join(", ")}`);
  paramTotal += actualParams[t].length;
}
console.log(`✔ ① tool-schema-v1 参数名：read_shadow ${actualParams.read_shadow.length} / recall_shadow ${actualParams.recall_shadow.length} / shadow_query ${actualParams.shadow_query.length}（合计 ${paramTotal}）= 冻结清单，缺 0`);

// ② config-keys-v1：顶层键冻结（删键 / 改名 = forbidden）
const dk = diffSurface(CONFIG_KEY_FROZEN, configKeys);
assert.equal(
  dk.missing.length,
  0,
  `config-keys-v1（契约表 forbidden = 删键）：ShadowConfig 少了这些顶层键：${dk.missing.join(", ")} —— 删键会让既有配置悄悄换行为，请走最小弃用流程`,
);
if (dk.added.length) console.log(`  · 新增顶层键 ${dk.added.length} 个（allowed，只报告）：${dk.added.join(", ")}`);
console.log(`✔ ② config-keys-v1 顶层键：${configKeys.length} 个 = 冻结清单，缺 0`);

// ③ 标定：差集判据本身（相同 ⇒ 不报；缺名 ⇒ missing；多名 ⇒ added）
assert.deepEqual(diffSurface(["a", "b"], ["a", "b"]), { missing: [], added: [] });
assert.deepEqual(diffSurface(["a", "b"], ["a"]), { missing: ["b"], added: [] });
assert.deepEqual(diffSurface(["a"], ["a", "c"]), { missing: [], added: ["c"] });
console.log("✔ ③ 差集判据标定：相同 ⇒ 双侧空；缺名 ⇒ 只进 missing；多名 ⇒ 只进 added");

// ④ 标定：抽取判据不得把**嵌套对象里的键**当顶层键（负控用构造语料，不靠真实文件碰巧）
const synthetic = ["export interface ShadowConfig {", "  a?: string;", "  b?: {", "    inner?: number;", "  };", "  c?: boolean;", "}", "export interface Other {", "  z?: string;", "}"].join("\n");
assert.deepEqual(extractConfigKeys(synthetic), ["a", "b", "c"]);
console.log("✔ ④ 抽取判据标定：嵌套键 inner 与后续接口的 z 均不入选");

console.log("\nALL PASS ✅");
