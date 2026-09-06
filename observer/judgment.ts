// dsh-shadow —— observer/judgment.ts：Judgment（v0.22）。Observer 决定，Evidence 是输入。
// 结构：Claim → Evidence → Judgment。同一 Evidence 在不同 Observer（透镜/身份）下结论不同。
// Judgment 挂在 Observer 下（observerId），Evidence 只是输入；不是 Evidence 决定 Judgment。
import type { EvidenceResult, Identity, Judgment } from "../core/types.js";
import { confidenceOf } from "../retrieval/rank.js";
import { readRel } from "../persistence/files.js";
import { evidencePathsOf, isPathLike } from "../evidence/paths.js";

// claim：记忆里的"断言"（优先用户提示/决策，否则入口标题）；这是要被验证的主张。
export const claimOf = (text: string) => {
  const decision = (String(text || "").match(/^> 用户提示\/决策：(.+)$/m) || [])[1] || "";
  return decision || (String(text || "").match(/^# (.+)$/m) || [])[1] || "（无明确断言）";
};

// 对一条记忆的 claim 下判断：验证证据 → 结论 + 置信 + 理由（由 Observer 视角/决策风格决定 semantics）。
export const judgmentOfClaim = async (
  fs: any,
  ws: string,
  mm: any,
  observer: { observerId: string; lens?: string; identity?: Identity | null },
  verifyEvidence: (ref: any, ctx: any) => Promise<EvidenceResult>,
): Promise<Judgment | null> => {
  const text = await readRel(fs, ws, mm.rel);
  if (!text) return null;
  const claim = claimOf(text);
  const paths = evidencePathsOf(text).filter(isPathLike).slice(0, 6);
  let evidence: EvidenceResult | null = null;
  let conflictCount = 0;
  for (const p of paths) {
    const r = await verifyEvidence({ path: p, kind: "path" }, { fs, ws });
    if (!evidence && r.status !== "unavailable") evidence = r;
    if (r.status === "not_found") conflictCount++;
  }
  const conclusion: Judgment["conclusion"] = conflictCount > 0 ? "evidence_stale" : "evidence_live";
  const confidence = confidenceOf(0, Math.max(0, Math.round((Date.now() - Date.parse(mm.date)) / 86400000)) as number, conflictCount > 0 ? "stale" : "active", {
    hasExperience: /^> 摘要：|^> 概况：/m.test(text),
    hasDecision: /^> 用户提示\/决策：/m.test(text),
  });
  const styles = observer.identity?.decisionStyle;
  const rationale = conflictCount > 0
    ? `证据路径缺失 ${conflictCount} 处，结论降为待验证`
    : `证据在，结论成立${styles?.length ? ` · 视角 ${styles.join("、")}` : ""}${observer.lens ? ` · 透镜 ${observer.lens}` : ""}`;
  return { observerId: observer.observerId, claim, evidence, conclusion, confidence, rationale };
};

export const renderJudgments = (js: Judgment[]) => {
  const lines = ["[Judgments]"];
  if (!js.length) { lines.push("（无可下判断的记忆：需要含「断言」的匹配记忆）"); return lines.join("\n"); }
  for (const j of js.slice(0, 6)) {
    lines.push(`judgment: observer=${j.observerId} · claim=${j.claim.slice(0, 40)}`);
    if (j.evidence) lines.push(`  evidence: ${j.evidence.status} (${j.evidence.source})`);
    lines.push(`  conclusion ${j.conclusion} · conf=${j.confidence.overall.toFixed(2)} · ${j.rationale}`);
  }
  return lines.join("\n");
};
