// dsh-shadow —— query/topic-recall.ts：默认主题召回编排（无 mode + 有 topic）。
// 活跃 Memory Atom 集**只**经 materializeAtoms；本模块不复制过滤。
// 政策分家：打分 → topic-score；冷却 → retrieval/cooldown；预算渲染 → retrieval/budget-render；
// hits → noteServedAtoms（servedRels 只来自 renderWithinBudget 返回值）。
import { readAuditStream, renderAuditStreamDiag } from "../persistence/audit-stream.js";
import { today, RECALL_PREFIX, parseAsOf, onByDefault } from "../core/util.js";
import { approxEntries } from "../retrieval/rank.js";
import { noMatchText, truncationNote } from "../retrieval/render.js";
import { tierLossNote } from "../retrieval/loss.js";
import { prepareCooldown, filterCooled, commitDetailCooldown } from "../retrieval/cooldown.js";
import { renderWithinBudget } from "../retrieval/budget-render.js";
import { kgTrace } from "../subject/observer/observer.js";
import { readSoul } from "../subject/soul/soul.js";
import { readIdentity } from "../subject/soul/identity.js";
import { observerContextOf } from "../subject/observer/core.js";
import { readObserverState } from "../subject/observer/state.js";
import { recordObservationTrace } from "../subject/observer/trace.js";
import { scrubFinal } from "../security/scrub.js";
import { noteServedAtoms } from "../core/retention/served-hits.js";
import { scoreTopicCandidates } from "./topic-score.js";
import type { ShadowQueryDeps } from "./types.js";
import type { MaterializedView } from "./materialize.js";
import type { AgentLike } from "../core/types.js";
import type { ParsedMemory } from "../core/view/episode.js";

export interface TopicRecallCtx {
  fs: any;
  ws: string;
  flushWarn: string;
  agent?: AgentLike;
}

/** 默认主题召回。`view` 已物化（含 meta / memories / parsed）。 */
export async function runTopicRecall(
  deps: ShadowQueryDeps,
  args: any,
  ctx: TopicRecallCtx,
  view: MaterializedView,
  topic: string,
  tokensIn: string[],
  maxChars: number,
): Promise<string> {
  const { fs, ws, flushWarn, agent } = ctx;
  const recallCfg = deps.config.recall ?? {};
  const retentionCfg = deps.config.retention ?? {};
  const limit = Math.max(1, Math.min(30, Number(args?.limit) || 10));
  const debugMode = recallCfg.debug === true || Boolean(args?.debug);
  const diag: string[] = [];
  const asOf = parseAsOf(args?.asOf);
  const observerMode = Boolean(args?.observer);
  const meta = view.meta;
  const byRel = new Map<string, ParsedMemory>();
  for (const p of view.parsed || []) if (p?.rel) byRel.set(p.rel, p);

  let memories = Array.isArray(view.memories) ? view.memories.slice() : [];
  if (asOf) memories = memories.filter((m: any) => m.date <= asOf.date);
  if (debugMode) diag.push(`候选 ${memories.length}${asOf ? ` · asOf<=${asOf.date}` : ""}`);
  if (debugMode) diag.push(renderAuditStreamDiag(await readAuditStream(fs, ws)));

  const obsSoul = await readSoul(fs, ws);
  const obsIdentity = await readIdentity(fs, ws, agent?.id);
  const obsState = await readObserverState(fs, ws, obsSoul, args.state);
  const obsCtx = observerContextOf(args, topic, obsIdentity, agent?.id, obsState);

  let tokens = tokensIn.slice();
  if (!tokens.length) tokens = [String(topic).toLowerCase()];

  const { scored, entryList } = await scoreTopicCandidates({
    fs, ws, memories, byRel, meta, tokens, retentionCfg, recallCfg,
    verifyEvidence: deps.verifyEvidence, observerMode, asOf, agentId: agent?.id,
  });
  if (debugMode) {
    diag.push(`命中（打分>0）${scored.length}`);
    const dpr = scored.filter((s) => s.deprioritized).length;
    if (dpr) diag.push(`降权·deprioritize ${dpr} 条（recall.deprioritize）`);
  }
  if (!scored.length) {
    return noMatchText(topic, flushWarn, { approx: approxEntries(topic, entryList.map((e) => e.entry)) })
      + (debugMode ? "\n\n" + diag.join("\n") : "");
  }

  const cooldownTurns = Math.max(0, Number(recallCfg.cooldownTurns) || 0);
  const { ledger, turn } = await prepareCooldown(fs, ws, cooldownTurns, deps.noteDegrade);
  const { available, cooledCount, cooledRels } = filterCooled(scored, ledger, turn, cooldownTurns);
  if (debugMode) {
    for (const rel of cooledRels) diag.push(`降权·cooldown ${rel}`);
    diag.push(`可用（未冷却）${available.length}${cooledCount ? ` · 冷却 ${cooledCount}` : ""}`);
  }
  if (!available.length) {
    const cooledEntries = scored.slice(0, 3).map((s) => s.entry || s.mm.rel);
    return (
      noMatchText(topic, flushWarn, {
        reason: `全部命中都在冷却中（recall.cooldownTurns=${cooldownTurns}，${cooledCount} 条）`,
        approx: cooledEntries,
        approxLabel: "冷却中的命中（是命中，不是近似）",
        steps: `> 下一步：① 等 ${cooldownTurns} 回合后再查（冷却按回合计数）；② 或调低 \`recall.cooldownTurns\`；③ \`read_shadow({debug:true})\` 看完整候选。`,
      }) + (debugMode ? "\n\n" + diag.join("\n") : "")
    );
  }

  const rendered = renderWithinBudget(available, { limit, maxChars, tokens, debug: debugMode });
  const { parts, servedRels, servedDetail, withheld, droppedByLimit, droppedByBudget, diagLines } = rendered;
  if (debugMode) diag.push(...diagLines);

  const returnedSet = new Set(servedRels);
  const envelope = truncationNote({
    matched: scored.length,
    returned: parts.length,
    limit,
    maxChars,
    droppedByLimit,
    droppedByBudget,
    droppedByCooldown: cooledCount,
    dropped: scored.filter((s) => !returnedSet.has(s.mm.rel)).slice(0, 3).map((s) => ({ entry: s.entry, score: Math.round(s.score * 10) / 10 })),
  });

  await commitDetailCooldown(fs, ws, ledger, turn, servedDetail, cooldownTurns, deps.noteDegrade);
  await noteServedAtoms(fs, ws, servedRels, {
    turn,
    observerId: agent?.id ? String(agent.id) : undefined,
  });

  const kgBlock = args?.kg ? await kgTrace(fs, ws, memories, topic) : "";
  const lossNote = onByDefault(recallCfg.lossDisclosure) ? tierLossNote({ withheld, returned: parts.length }) : "";
  const out = scrubFinal(RECALL_PREFIX + (kgBlock ? kgBlock + "\n\n" : "") + (debugMode ? diag.join("\n") + "\n\n" : "") + parts.join("\n\n") + lossNote + envelope + flushWarn);
  await recordObservationTrace(fs, ws, {
    observerId: obsCtx.observerId,
    createdAt: today(),
    realityAnchor: obsCtx.realityAnchor,
    intent: obsCtx.intent,
    projection: { visible: available.slice(0, limit).map((s: any) => s.entry || s.mm?.name || ""), hidden: [], distortion: obsCtx.intent.goal ? [obsCtx.intent.goal] : [] },
    uncertainty: { level: available.length ? 0 : memories.length, reasons: [] },
    metadata: { source: "read_shadow" },
    state: obsCtx.state,
  });
  return out;
}
