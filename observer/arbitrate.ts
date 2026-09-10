// dsh-shadow —— observer/arbitrate.ts：Evidence 仲裁（proof 是什么 → 裁决 Verified/Stale/Superseded）。
// zg/fs 是"发现了什么"（discover/verify），这里才是"它意味着什么"（Arbitration）。从 index.ts 迁出。
import { confidenceOf } from "../retrieval/rank.js";
import { ageDaysOf } from "../core/util.js";
import { evidencePathsOf, isPathLike } from "../evidence/paths.js";
import type { GatewayEvidenceRef, EvidenceResult } from "../core/types.js";

export const evidenceOf = (text: string, mm: any, meta: any, stale: boolean) => {
  const body = String(text || "");
  const clue = (body.match(/^> 证据链：(.+)$/m) || [])[1] || "";
  const srcM = clue.match(/来源\(([^)]*)\)/);
  const dateM = clue.match(/日期\(([^)]*)\)/);
  const evM = clue.match(/证据\(([^)]*)\)/);
  const rec = meta && mm?.rel ? (meta[mm.rel] || {}) : {};
  const status = rec.status || (stale ? "stale" : "active");
  const hits = Number(rec.hits) || 0;
  const evidence = evM ? evM[1] : (body.match(/^> 背景\/材料：(.+)$/m) || [])[1] || "";
  const hasExperience = /^> 摘要：|^> 概况：/m.test(body);
  const hasDecision = /^> 用户提示\/决策：/.test(body);
  return {
    kinds: srcM ? srcM[1] : "—",
    date: dateM ? dateM[1] : (mm?.date || ""),
    session: (body.match(/^> 来源会话：(.+)$/m) || [])[1] || "",
    project: (body.match(/^> 项目：(.+)$/m) || [])[1] || "",
    goal: (body.match(/^> 目标：(.+)$/m) || [])[1] || "",
    evidence,
    status,
    stale,
    hits,
    confidence: confidenceOf(hits, ageDaysOf(mm?.rel), status, { hasExperience, hasDecision }),
  };
};

export const provenanceText = (ev: any) => {
  const parts: string[] = [];
  if (ev.kinds && ev.kinds !== "—") parts.push(`来源 ${ev.kinds}`);
  if (ev.date) parts.push(ev.date);
  if (ev.lifecycle) parts.push(`生命周期 ${ev.lifecycle}`);
  parts.push(`状态 ${ev.status}${ev.stale ? "(过时)" : ""}${Number(ev.conflict) > 0 ? `(⚠证据缺${ev.conflict})` : ""}`);
  if (ev.verdict) parts.push(`裁决 ${ev.verdict}`);
  if (ev.outcome) parts.push(`结果 ${ev.outcome}`);
  if (ev.reflection && ev.reflection !== "无后续修正记录") parts.push(`反思 ${ev.reflection}`);
  parts.push(`命中 ${ev.hits}`);
  const c = ev.confidence;
  if (c && typeof c === "object") parts.push(`置信 检索${c.retrieval.toFixed(2)}/证据${c.evidence.toFixed(2)}/经验${c.experience.toFixed(2)}/判断${c.judgment.toFixed(2)}/投影${c.projection.toFixed(2)}（总${c.overall.toFixed(2)}）`);
  else parts.push(`置信 ${Number(c).toFixed(2)}`);
  if (ev.lineage && ev.lineage.length > 1) parts.push(`修正链 ${ev.lineage.map((x: any) => x.date.slice(5)).join("→")}`);
  if (ev.goal) parts.push(`目标 ${ev.goal.slice(0, 24)}`);
  if (ev.project) parts.push(`项目 ${ev.project.slice(0, 16)}`);
  if (ev.evidence && ev.evidence !== "—") parts.push(`证据 ${ev.evidence.slice(0, 60)}`);
  return `（${parts.join(" · ")}）`;
};

// Memory ≠ Evidence 裁决：记忆 "记得什么" vs 证据 "当下是否成立"。由 证据路径存在性 + 同入口更新记忆 派生。
export const newestByEntryOf = (list: any[]) => {
  const m: Record<string, string> = {};
  for (const e of list) { const t = `${e.date} ${e.time}`; if (!m[e.entry] || t > m[e.entry]) m[e.entry] = t; }
  return m;
};

export const verdictOf = (conflictCount: number, entry: string, date: string, time: string, newest: Record<string, string>) => {
  const t = `${date} ${time}`;
  const superseded = !!newest[entry] && t < newest[entry];
  const verdict = superseded ? "superseded" : (conflictCount > 0 ? "stale" : "fresh");
  const outcome = superseded ? "superseded" : (conflictCount > 0 ? "evidence_stale" : "evidence_live");
  const reflection = superseded ? "后续已迭代（存在同入口更新记忆）" : (conflictCount > 0 ? "证据缺失，需重新验证" : "无后续修正记录");
  return { superseded, verdict, outcome, reflection };
};

// Lesson（教训）≠ Summary（摘要）：教训由裁决派生，与"发生了什么"的摘要解耦，给出可迁移的提醒。
export const lessonOf = (v: { superseded: boolean; outcome: string }) =>
  v.superseded ? "同入口已被更新，引用前先查最新记忆" : (v.outcome === "evidence_stale" ? "证据路径缺失，需重新验证后再引用" : "结论仍有效");

// Decision Lineage（ADR-0003 §3-4）：同一 entry 的记忆按时间排成修正确 A→Correction→B→…，保留"为何变化"。
export const lineageOf = (list: { date: string; time: string; decision?: string }[]) => {
  const seen = new Set<string>();
  const chain: { date: string; time: string; decision: string }[] = [];
  for (const e of list) {
    const t = `${e.date} ${e.time}`;
    if (seen.has(t)) continue;
    seen.add(t);
    chain.push({ date: e.date, time: e.time, decision: e.decision || "" });
  }
  return chain.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
};

export const conflictOf = async (fs: any, ws: string, text: string, verifyEvidence: (ref: GatewayEvidenceRef, ctx: any) => Promise<EvidenceResult>) => {
  const paths = evidencePathsOf(text).filter(isPathLike).slice(0, 12);
  if (!paths.length) return { missing: [] as string[] };
  const missing: string[] = [];
  for (const p of paths) {
    const res = await verifyEvidence({ path: p, kind: "path" }, { fs, ws });
    // zg 未装/unavailable → 不当作"缺失"（避免把"证据不可验证"猜成"证据已失效"）。
    if (res.status === "not_found") missing.push(p);
  }
  return { missing };
};
