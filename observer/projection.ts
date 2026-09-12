// dsh-shadow —— observer/projection.ts：RealityProjection（v0.20 G3）。Observer 透镜 → 带取舍的局部上下文。
// RealityProjection 不是"相关排名"，而是"为什么这个视角看到这些/没看到那些"（distortion）。
import { tokenize } from "../core/util.js";
import { readRel } from "../persistence/files.js";
import { experienceOf } from "../core/experience.js";
import { conflictOf } from "./arbitrate.js";
import type { Identity, Intent } from "../core/types.js";

// Observer 透镜 = soul.observer 或注入的 lens；显著 = 任务词命中 × what_matters 加权 − what_to_ignore 排除。
export const projectContext = async (fs: any, ws: string, memories: any[], task: string, soul: any, verifyEvidence: any, lens?: { preferred?: string[]; avoided?: string[] }, identity?: Identity | null, intent?: Intent | null) => {
  const ob = lens || ((soul && soul.observer) || { what_matters: [], what_to_ignore: [] });
  const matters = Array.isArray(ob.preferred ?? ob.what_matters) ? (ob.preferred ?? ob.what_matters) : [];
  const ignore = Array.isArray(ob.avoided ?? ob.what_to_ignore) ? (ob.avoided ?? ob.what_to_ignore) : [];
  const tokens = tokenize(task);
  const rel: any[] = []; const excl: string[] = []; const unc: string[] = []; const experiences: any[] = [];
  const exclReason: Record<string, string> = {};
  const unreadable: string[] = []; // 读不出的记忆（**既不进 relevant 也不进 excluded** —— 必须单列）
  let capDropped = 0;               // 因上限未核验的证据路径（来自 conflictOf）
  for (const mm of memories) {
    const text = await readRel(fs, ws, mm.rel);
    // **读不出 ≠ 不相关**（v1.15.58）：旧实现直接 `continue`，于是这些记忆在
    // 「候选相关 / 不确定 / 排除」三个桶里**都不出现**，而 `reality.total` 仍按全量算 ⇒
    // 数字对不上却看不出为什么；读的人只会以为「就是没有相关记忆」。
    if (!text) { unreadable.push(mm.rel.split("/").pop() as string); continue; }
    const exp = experienceOf(text, mm);
    const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence} ${exp.summary} ${exp.goal}`.toLowerCase();
    const match = tokens.some((t) => hay.includes(t));
    let salience = match ? 1 : 0;
    if (salience === 0) { const n = mm.rel.split("/").pop() as string; excl.push(n); exclReason[n] = "与任务不匹配"; continue; }
    for (const ig of ignore) if (String(exp.situation).toLowerCase().includes(String(ig).toLowerCase())) { salience = 0; const n = mm.rel.split("/").pop() as string; excl.push(n); exclReason[n] = `被观察透镜规避（${ig}）`; break; }
    if (salience === 0) continue;
    for (const m of matters) if (hay.includes(String(m).toLowerCase())) salience += 2;
    const conflict = await conflictOf(fs, ws, text, verifyEvidence);
    capDropped += conflict.droppedByCap ?? 0;
    if (conflict.missing.length) unc.push(mm.rel.split("/").pop() as string);
    if (salience > 0) { rel.push({ salience, exp }); experiences.push(exp); }
  }
  rel.sort((a, b) => b.salience - a.salience);
  const principles = (Array.isArray(soul?.principles) ? soul.principles : []).filter((p: string) => tokens.some((t) => String(p).toLowerCase().includes(t)));
  // **上限前**的相关条数（v1.15.58）：旧实现把 `rel` 砍到 8 之后才报 `候选相关`，
  // 于是命中 12 条时会显示「候选相关 8」—— 那是**上限**，不是**命中数**（伪精度）。
  const relTotal = rel.length;
  const visible = rel.slice(0, 8).map((r) => r.exp.situation);
  const hidden = excl;
  // distortion = "为什么这个视角看到这些/没看到那些"（从透镜偏好 + 决策风格派生，不是 LLM 黑箱）。
  const prefer = Array.isArray(ob.preferred) ? ob.preferred : [];
  const avoid = Array.isArray(ob.avoided) ? ob.avoided : [];
  const distortion = {
    reason: prefer.length || avoid.length
      ? `透镜偏重 ${prefer.join("、") || "—"}，规避 ${avoid.join("、") || "—"}`
      : identity?.decisionStyle?.length
        ? `决策风格 ${identity.decisionStyle.join("、")}`
        : "默认全知视角（无显著透镜/决策风格）",
    byIntent: intent?.goal ? `意图已定：${intent.goal}` : undefined,
  };
  return {
    rel: rel.slice(0, 8), relTotal, unreadable, capDropped,
    experiences, principles, taste: soul?.taste || null, unc, excl, visible, hidden, distortion, excludedReason: exclReason,
    reality: { total: memories.length, task },
  };
};

export const renderProjection = (p: any, task: string, project: string, ctx?: any) => {
  const lines = ["[RealityProjection]"];
  if (ctx) lines.push(`observer ${ctx.observerId} · lens ${ctx.lens || "default"} · intent ${ctx.intent.goal}`);
  lines.push(`scope: project=${project || "?"} · task=${task}`);
  lines.push("relevant:");
  if (p.principles.length) lines.push(`  原则 ${p.principles.join("、")}`);
  if (p.rel.length) {
    for (const r of p.rel.slice(0, 4)) lines.push(`  经验 ${r.exp.situation} → ${r.exp.decision || "—"}${r.exp.lesson ? ` (教训 ${r.exp.lesson.slice(0, 24)})` : ""}`);
  }
  if (p.taste) lines.push(`  偏好 ${JSON.stringify(p.taste)}`);
  // `候选相关` 报**上限前**的真实命中数（旧实现报的是砍完之后的长度 ⇒ 命中 12 条显示 8）。
  const shown = p.rel.length;
  lines.push(`current_state: 候选相关 ${p.relTotal ?? shown}${p.relTotal > shown ? `（本视图只显示前 ${shown}）` : ""} · 不确定 ${p.unc.length} · 排除 ${p.excl.length}${p.unreadable?.length ? ` · **读不出 ${p.unreadable.length}**` : ""}`);
  if (p.unreadable?.length) lines.push(`unreadable: ${p.unreadable.slice(0, 6).join("、")}（读不出 ≠ 不相关：它们**没有**参与任何桶的判定）`);
  if (p.capDropped) lines.push(`> ⚠ 另有 ${p.capDropped} 条具体路径**未核验**（单条上限）：「不确定」只覆盖已核验的那些`);
  if (p.visible?.length) lines.push(`visible: ${p.visible.slice(0, 4).join("、")}`);
  if (p.distortion?.reason) lines.push(`distortion: ${p.distortion.reason}${p.distortion.byIntent ? ` · ${p.distortion.byIntent}` : ""}`);
  if (p.unc.length) lines.push(`uncertainty: ${p.unc.slice(0, 4).join("、")}`);
  if (p.hidden?.length) lines.push(`hidden: ${p.hidden.slice(0, 6).join("、")}`);
  if (p.excl.length) lines.push(`excluded: ${p.excl.slice(0, 6).join("、")}`);
  const er = p.excludedReason;
  if (er && Object.keys(er).length) {
    const k = Object.keys(er).slice(0, 4);
    lines.push(`excluded_reason: ${k.map((x) => `${x}=${er[x]}`).join("；")}`);
  }
  return lines.join("\n");
};
