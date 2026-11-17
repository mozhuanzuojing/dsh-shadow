/**
 * v2 domain —— scope 轴聚合（ADR-0028 Phase B 内核）。
 *
 * 会话 ⊂ 工作区 ⊂ 用户。user 层：把各工作区的点按工作区打标签 `ws::rel` 后统一升维成
 * 面 / 观察意识；降维句柄带 workspace 定位（可回落对应工作区取原文）。纯函数、无 I/O。
 *
 * 不复制原文（ADR-0028）：这里只做内存聚合视图；持久化由上层（userRoot）只存派生摘要。
 */

import type { ParsedAtom } from "../contract/types.js";
import { deriveConsciousness, deriveFaces, type Consciousness, type Face, type FaceAxis } from "./dimensions.js";

export interface WorkspaceSlice {
  ws: string;
  atoms: ParsedAtom[];
}

const normWs = (ws: string): string => String(ws).replace(/\\/g, "/").replace(/\/+$/, "");
export const tagRel = (ws: string, rel: string): string => `${normWs(ws)}::${rel}`;

/** user 层聚合：跨工作区把点打标后升维成面/意识。守恒：Σ面内点 == 全部点。 */
export const userScope = (
  slices: WorkspaceSlice[],
  axis: FaceAxis = "session",
): { faces: Face[]; consciousness: Consciousness; points: number } => {
  const all: ParsedAtom[] = [];
  for (const s of slices) for (const a of s.atoms) all.push({ ...a, rel: tagRel(s.ws, a.rel) });
  const { faces } = deriveFaces(all, axis);
  const consciousness = deriveConsciousness(all, faces, "(user)");
  return { faces, consciousness, points: all.length };
};

/** 从 user 面的点句柄拆出 (workspace, atomRel)，用于降维回工作区取原文。 */
export const splitScopeHandle = (handle: string): { ws: string; rel: string } => {
  const i = String(handle).indexOf("::");
  return i < 0 ? { ws: "", rel: String(handle) } : { ws: handle.slice(0, i), rel: handle.slice(i + 2) };
};

/** 面级隐私/视野过滤（ADR-0028）：按 observer 的 whatMatters/whatToIgnore 过滤面，被过滤项显式返回（不静默）。 */
export interface ScopeLens {
  whatMatters: string[];
  whatToIgnore: string[];
}
export const filterFacesByLens = (faces: Face[], lens: ScopeLens): { kept: Face[]; excluded: { key: string; reason: string }[] } => {
  const kept: Face[] = [];
  const excluded: { key: string; reason: string }[] = [];
  for (const f of faces) {
    const texts = f.lines.flatMap((l) => [l.title, ...l.entries]).map((s) => String(s ?? "").toLowerCase());
    const ig = lens.whatToIgnore.find((w) => w && texts.some((t) => t.includes(w.toLowerCase())));
    if (ig) {
      excluded.push({ key: f.key, reason: `命中 what_to_ignore「${ig}」` });
      continue;
    }
    if (lens.whatMatters.length && !texts.some((t) => lens.whatMatters.some((w) => w && t.includes(w.toLowerCase())))) {
      excluded.push({ key: f.key, reason: "视野外（未命中 what_matters）" });
      continue;
    }
    kept.push(f);
  }
  return { kept, excluded };
};

/** 渲染 user 级摘要 markdown（只派生摘要，不含原文；原文仍留各工作区）。纯函数。 */
export const renderUserSummary = (
  agg: { faces: Face[]; consciousness: Consciousness; points: number },
  opts: { roots: string[]; generatedAt: string; lim?: number; excluded?: { key: string; reason: string }[] },
): string => {
  const lim = opts.lim ?? 20;
  const seg: string[] = [
    `# 用户级记忆（user scope · 跨 ${opts.roots.length} 个工作区）`,
    `> 生成：${opts.generatedAt} · 根：${opts.roots.join("、")}`,
    `> 只聚合派生摘要（面 / 意识），原文仍在各工作区（ADR-0028）。`,
    "",
    "## 观察意识",
    `- 面 ${agg.consciousness.faces} · 点 ${agg.consciousness.points} · 灵魂 ${agg.consciousness.soulId ?? "无"}`,
    ...agg.consciousness.blindSpots.map((b) => `- 盲区：${b}`),
    "",
    `## 面（${agg.faces.length}）`,
  ];
  for (const f of agg.faces.slice(0, lim)) {
    const down = f.lines.flatMap((l) => l.memoryRefs);
    seg.push(`### ${String(f.key).slice(0, 50)}`);
    seg.push(`- ${f.lines.length} 线 · ${f.points} 点 · ${f.decisions} 决策`);
    seg.push(`- 降维句柄：${down.slice(0, 3).join("、")}${down.length > 3 ? "…" : ""}`);
    seg.push("");
  }
  if (opts.excluded?.length) {
    seg.push(`## 已过滤（隐私 / 视野外，${opts.excluded.length}）`);
    for (const e of opts.excluded.slice(0, lim)) seg.push(`- ${String(e.key).slice(0, 40)}：${e.reason}`);
    seg.push("");
  }
  return seg.join("\n");
};
