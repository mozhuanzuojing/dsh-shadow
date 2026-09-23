// dsh-shadow —— query/lenses.ts：布尔透镜分支（soul/taste/identity/context + topic 侧 project/…）。
// 从 query/query.ts 迁出，使路由只串 seam、不堆领域渲染。
import { readRel } from "../persistence/files.js";
import { tokenize, today, RECALL_PREFIX } from "../core/util.js";
import { approxEntries } from "../retrieval/rank.js";
import { noMatchText } from "../retrieval/render.js";
import { evidencePathsOf, isPathLike, isConcreteLocator } from "../evidence/paths.js";
import { unavailableHint } from "../core/toolset.js";
import { readSoul, soulText } from "../soul/soul.js";
import { readIdentity, renderIdentity } from "../soul/identity.js";
import { observerContextOf, renderObserverContext } from "../observer/core.js";
import { readObserverState } from "../observer/state.js";
import { recordObservationTrace } from "../observer/trace.js";
import { tasteOf, renderTaste } from "../soul/taste.js";
import { experienceOf, renderExperience } from "../core/experience.js";
import { judgmentOf, renderJudgment } from "../core/judgment.js";
import { projectContext, renderProjection } from "../observer/projection.js";
import { judgmentOfClaim, renderJudgments, claimOf } from "../observer/judgment.js";
import { newestByEntryOf, verdictOf, conflictOf, lessonOf, EVIDENCE_PATH_CAP } from "../observer/arbitrate.js";
import { scrubFinal } from "../security/scrub.js";
import type { ShadowQueryDeps } from "./types.js";
import type { MaterializedView } from "./materialize.js";
import type { AgentLike } from "../core/types.js";

export interface LensCtx {
  fs: any;
  ws: string;
  flushWarn: string;
  agent?: AgentLike;
}

/** 无 topic 也可答的透镜：soul / taste / identity / context。命中返回字符串，否则 undefined。 */
export async function runBoolLenses(deps: ShadowQueryDeps, args: any, ctx: LensCtx): Promise<string | undefined> {
  const { fs, ws, flushWarn, agent } = ctx;
  if (args?.soul) {
    const soul = await readSoul(fs, ws);
    if (!soul) return scrubFinal(RECALL_PREFIX + "（无 Soul 配置：可在 .shadow/soul/soul.json 定义 身份/价值观/原则/品味/边界）" + flushWarn);
    return scrubFinal(RECALL_PREFIX + soulText(soul) + flushWarn);
  }
  if (args?.taste) {
    const soul = await readSoul(fs, ws);
    const t = await tasteOf(fs, ws, soul);
    return scrubFinal(RECALL_PREFIX + renderTaste(t) + flushWarn);
  }
  // soul 形 Identity（curated 锚）；学到的一半见 mode:"identity-advance" + renderIdentityModel。
  if (args?.identity) {
    const identity = await readIdentity(fs, ws, agent?.id);
    return scrubFinal(RECALL_PREFIX + renderIdentity(identity) + flushWarn);
  }
  if (args?.context) {
    const identity = await readIdentity(fs, ws, agent?.id);
    const soul = await readSoul(fs, ws);
    const state = await readObserverState(fs, ws, soul, args.state);
    const c = observerContextOf(args, String(args?.topic || "").trim(), identity, agent?.id, state);
    return scrubFinal(RECALL_PREFIX + renderObserverContext(c) + flushWarn);
  }
  return undefined;
}

/**
 * 需要活跃 Memory Atom 集的透镜（project / judgment / claim / verifyEvidence / experience）。
 * `view` 必须已由 `materializeAtoms` 物化（forget/compact 只经那一处 keep）。
 */
export async function runTopicLenses(
  deps: ShadowQueryDeps,
  args: any,
  ctx: LensCtx,
  view: MaterializedView,
  topic: string,
  tokens: string[],
): Promise<string | undefined> {
  const { fs, ws, flushWarn, agent } = ctx;
  const memories = view.memories;

  if (args?.project) {
    const soul = await readSoul(fs, ws);
    const identity = await readIdentity(fs, ws, agent?.id);
    const state = await readObserverState(fs, ws, soul, args.state);
    const c = observerContextOf(args, topic, identity, agent?.id, state);
    const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
    const task = `${c.intent.goal} ${c.intent.question}`.trim() || topic;
    const p = await projectContext(fs, ws, memories, task, soul, deps.verifyEvidence, identity.observerLens || args.lens, identity, c.intent);
    await recordObservationTrace(fs, ws, {
      observerId: c.observerId,
      createdAt: today(),
      realityAnchor: c.realityAnchor,
      intent: c.intent,
      projection: { visible: p.visible || [], hidden: p.hidden || [], distortion: p.distortion?.reason ? [p.distortion.reason] : [] },
      uncertainty: { level: p.unc.length, reasons: p.unc.slice(0, 3) },
      metadata: { source: "projection" },
      state: c.state,
    });
    return scrubFinal(RECALL_PREFIX + renderProjection(p, topic, project, c) + flushWarn);
  }
  if (args?.judgment) {
    const js = await judgmentOf(fs, ws, memories, topic);
    return scrubFinal(RECALL_PREFIX + renderJudgment(js) + flushWarn);
  }
  if (args?.claim) {
    const identity = await readIdentity(fs, ws, agent?.id);
    const c = observerContextOf(args, topic, identity, agent?.id);
    const tok = tokenize(topic);
    const js: any[] = [];
    for (const mm of memories) {
      let matched = !topic;
      if (!matched) {
        const text = await readRel(fs, ws, mm.rel);
        matched = !!text && tok.some((t) => `${claimOf(text)} ${mm.rel}`.toLowerCase().includes(t));
      }
      if (!matched) continue;
      const j = await judgmentOfClaim(fs, ws, mm, { observerId: c.observerId, lens: c.lens, identity }, deps.verifyEvidence);
      if (j) js.push(j);
    }
    return scrubFinal(RECALL_PREFIX + renderJudgments(js) + flushWarn);
  }
  if (args?.verifyEvidence) {
    const texts: any[] = [];
    for (const mm of memories) {
      const text = await readRel(fs, ws, mm.rel);
      if (!text) continue;
      const exp = experienceOf(text, mm);
      const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t))) texts.push(text);
    }
    const rows: string[] = [];
    const vctx = { fs, ws };
    let unavailableRef: { provider?: string; reason?: string } | undefined;
    for (const text of texts.slice(0, 3)) {
      for (const p of evidencePathsOf(text).filter(isPathLike).filter(isConcreteLocator).slice(0, 6)) {
        const r = await deps.verifyEvidence({ path: p, kind: "path" }, vctx);
        if (r.status === "unavailable" && !unavailableRef) unavailableRef = { provider: r.source, reason: r.provenance?.reason };
        const why = r.provenance?.reason ? ` · reason=${r.provenance.reason}` : "";
        rows.push(`${r.status}  ${p}  (provider=${r.source} · freshness=${r.freshness} · conf=${r.confidence.toFixed(2)}${why})`);
      }
    }
    const hint = unavailableRef ? unavailableHint(unavailableRef.provider, unavailableRef.reason) : undefined;
    const body = rows.length ? "\n" + rows.join("\n") : "\n（无可验证证据路径）";
    return scrubFinal(RECALL_PREFIX + "[Evidence Verify]" + body + (hint ? "\n" + hint : "") + flushWarn);
  }
  if (args?.experience) {
    const matched: any[] = [];
    const entryList: any[] = [];
    for (const mm of memories) {
      const text = await readRel(fs, ws, mm.rel);
      if (!text) continue;
      const exp = experienceOf(text, mm);
      entryList.push({ entry: exp.situation, date: mm.date, time: mm.time });
      const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t))) matched.push({ exp, mm, text });
    }
    if (!matched.length) {
      return noMatchText(topic, flushWarn, {
        approx: approxEntries(topic, entryList.map((e) => e.entry)),
        reason: "Experience 视图（情境/问题/决策/证据）无匹配项",
      });
    }
    const newest = newestByEntryOf(entryList);
    const exps: any[] = [];
    let capDropped = 0;
    for (const { exp, mm, text } of matched) {
      const conflict = await conflictOf(fs, ws, text, deps.verifyEvidence);
      capDropped += conflict.droppedByCap ?? 0;
      const v = verdictOf(conflict.missing.length, exp.situation, mm.date, mm.time, newest);
      exp.verdict = v.verdict; exp.outcome = v.outcome; exp.reflection = v.reflection; exp.lesson = lessonOf(v);
      exps.push(exp);
    }
    const capNote = capDropped > 0
      ? `\n\n> ⚠ 另有 **${capDropped}** 条具体路径**未核验**（单条上限 ${EVIDENCE_PATH_CAP} 条）：上面的裁决只覆盖已核验的那些，**不代表**全部证据都在。\n`
      : "";
    return scrubFinal(RECALL_PREFIX + exps.map(renderExperience).join("\n\n") + capNote + flushWarn);
  }
  return undefined;
}
