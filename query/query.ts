// dsh-shadow —— query/query.ts：read_shadow 路由（废止检查 + 各 seam 串接）。
// 领域管线已迁出：ReadQuery / family runners / lenses / topic-recall / index-budget。
// 活跃 Memory Atom 集只经 materializeAtoms；hits 只经 core/served-hits。
import type { AgentLike } from "../core/types.js";
import { resolveWorkspace } from "../core/scope.js";
import { tokenize, RECALL_PREFIX } from "../core/util.js";
import { dispatchReadQuery } from "./reads.js";
import { runContVerify } from "./contverify.js";
import { runObserverKernel } from "./observer-kernel.js";
import { runValidation } from "./validation.js";
import { runFederation } from "./federation.js";
import { runRealityModel } from "./reality-model.js";
import { runWorld } from "./world.js";
import { runSimAction } from "./sim-action.js";
import { runPlanning } from "./planning.js";
import { runAgency } from "./agency.js";
import { runDelegation } from "./delegation.js";
import { runRecall } from "./recall.js";
import { runAdaptation } from "./adaptation.js";
import { runHorizon } from "./horizon.js";
import { runBoolLenses, runTopicLenses } from "./lenses.js";
import { runTopicRecall } from "./topic-recall.js";
import { runIndexBudget } from "./index-budget.js";
import { materializeAtoms } from "./materialize.js";
import { scrubFinal } from "../security/scrub.js";
import type { ShadowQueryDeps } from "./types.js";

/** ADR-0050：废止旧名 → 正名。命中则早退，禁止落空进默认召回。 */
const RETIRED_MODES: Record<string, string> = {
  recall: "recovery",
  identity: "identity-advance",
  reality: "real-evidence",
  verify: "verification",
};

export function retiredApiMessage(args: any): string | null {
  const mode = String(args?.mode || "").trim();
  if (mode && RETIRED_MODES[mode]) {
    return `已废止：mode:"${mode}" → 请用 mode:"${RETIRED_MODES[mode]}"（ADR-0050）`;
  }
  if (args && Object.prototype.hasOwnProperty.call(args, "verify")) {
    return `已废止：verify → 请用 verifyEvidence:true（Evidence Gateway）；要跑 VerificationRun 用 mode:"verification"（ADR-0053）`;
  }
  if (args?.recall) {
    return `已废止：args.recall → 请用 mode:"recovery"（或工具 recall_shadow）。语义扩词是宿主 config.recall，勿塞进工具参数`;
  }
  return null;
}

const matOptsFrom = (deps: ShadowQueryDeps, ws: string) => ({
  note: deps.noteDegrade,
  writable: deps.derivedIndexWritable !== false,
  dirtyRels: deps.derivedIndexDirty?.(ws),
  clearDirty: deps.derivedIndexClearDirty
    ? (rels: Iterable<string>) => deps.derivedIndexClearDirty!(ws, rels)
    : undefined,
});

export async function runReadShadow(deps: ShadowQueryDeps, args: any, exec: any): Promise<string> {
  const agent: AgentLike | undefined = exec?.agent;
  const ws = resolveWorkspace(agent, deps.cwdBySession, deps.config);
  if (!ws) return "（无法确定工作区，shadow 不可用）";
  const fs = deps.fs;
  if (!fs) return "（fs 服务不可用）";
  const flushWarn = deps.getFlushWarn();
  const retired = retiredApiMessage(args);
  if (retired) return scrubFinal(RECALL_PREFIX + retired + flushWarn);

  const readCtx = {
    fs, ws, flushWarn, agent,
    writable: deps.derivedIndexWritable !== false,
    dirtyRels: deps.derivedIndexDirty?.(ws),
    clearDirty: deps.derivedIndexClearDirty
      ? (rels: Iterable<string>) => deps.derivedIndexClearDirty!(ws, rels)
      : undefined,
  };

  const viaRead = await dispatchReadQuery(deps, args, exec, readCtx);
  if (viaRead !== undefined) return viaRead;

  const viaObserverKernel = await runObserverKernel(deps, args, { fs, ws, flushWarn, agent });
  if (viaObserverKernel !== undefined) return viaObserverKernel;
  const viaValidation = await runValidation(deps, args, { fs, ws, flushWarn });
  if (viaValidation !== undefined) return viaValidation;
  const viaFederation = await runFederation(deps, args, { fs, ws, flushWarn, agent });
  if (viaFederation !== undefined) return viaFederation;
  const viaRealityModel = await runRealityModel(deps, args, { fs, ws, flushWarn });
  if (viaRealityModel !== undefined) return viaRealityModel;
  const viaWorld = await runWorld(deps, args, { fs, ws, flushWarn });
  if (viaWorld !== undefined) return viaWorld;
  const viaSimAction = await runSimAction(deps, args, { fs, ws, flushWarn });
  if (viaSimAction !== undefined) return viaSimAction;
  const viaPlanning = await runPlanning(deps, args, { fs, ws, flushWarn });
  if (viaPlanning !== undefined) return viaPlanning;
  const viaAgency = await runAgency(deps, args, { fs, ws, flushWarn });
  if (viaAgency !== undefined) return viaAgency;
  const viaDelegation = await runDelegation(deps, args, { fs, ws, flushWarn });
  if (viaDelegation !== undefined) return viaDelegation;
  const viaRecall = await runRecall(deps, args, { fs, ws, flushWarn });
  if (viaRecall !== undefined) return viaRecall;
  const viaAdaptation = await runAdaptation(deps, args, { fs, ws, flushWarn });
  if (viaAdaptation !== undefined) return viaAdaptation;
  const viaHorizon = await runHorizon(deps, args, { fs, ws, flushWarn });
  if (viaHorizon !== undefined) return viaHorizon;
  const viaContVerify = await runContVerify(deps, args, { fs, ws, flushWarn });
  if (viaContVerify !== undefined) return viaContVerify;

  const lensCtx = { fs, ws, flushWarn, agent };
  const viaBool = await runBoolLenses(deps, args, lensCtx);
  if (viaBool !== undefined) return viaBool;

  const topic = String(args?.topic || "").trim();
  const maxTokens = Math.max(256, Math.min(8000, Number(args?.max_tokens) || 1600));
  const maxChars = maxTokens * 4;
  if (!topic) return runIndexBudget(deps, lensCtx, maxChars);

  // 活跃集只物化一次：topic 透镜与默认主题召回共用（forget/compact 只经 keep）。
  const view = await materializeAtoms(fs, ws, deps.config, matOptsFrom(deps, ws));
  let tokens = tokenize(topic);
  if (!tokens.length) tokens = [String(topic).toLowerCase()];
  if (deps.config.recall?.enabled === true && deps.config.recall?.provider && deps.config.recall?.model) {
    const extra = await deps.expandTerms(topic);
    if (extra.length) tokens = Array.from(new Set([...tokens, ...extra]));
  }

  const viaTopicLens = await runTopicLenses(deps, args, lensCtx, view, topic, tokens);
  if (viaTopicLens !== undefined) return viaTopicLens;

  return runTopicRecall(deps, args, lensCtx, view, topic, tokens, maxChars);
}
