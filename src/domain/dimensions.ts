/**
 * v2 domain —— 升降维视图（ADR-0026）。
 *
 * 点(atoms, 0D) → 线(Episode, 1D) → 面(按 axis 织, 2D) → 观察意识(nD)。
 * 面轴：session / day / project / **task**（task = 对线做确定性词法聚类成「这件事」）。
 * 纯派生、可重建；降维：面 → 点句柄。不变量：Σ面内点 == 0维点（升维不丢点、降维可回点）。
 */

import type { Episode, ParsedAtom } from "../contract/types.js";
import { deriveEpisodes } from "./views.js";

export type FaceAxis = "session" | "day" | "project" | "task";

export interface Face {
  key: string;
  axis: FaceAxis;
  lines: Episode[];
  points: number;
  decisions: number;
  materials: string[];
  startedAt: string;
  endedAt: string;
}

export interface Consciousness {
  axis: FaceAxis;
  faces: number;
  points: number;
  soulId: string | null;
  topEntries: [string, number][];
  blindSpots: string[];
}

const keyOf = (e: Episode, axis: FaceAxis): string => {
  if (axis === "session") return e.agent || "(无会话)";
  if (axis === "day") return String(e.startedAt || "").slice(0, 10) || "(无日)";
  return e.project || "(无项目)";
};

// 词法聚类用的分词（拉丁词 + CJK 2-gram）与停用词；确定性、无 LLM。
const STOP = new Set([
  "the", "and", "for", "with", "you", "are", "was", "this", "that", "from", "have", "will", "your", "not", "but",
  "用户", "我：", "决定", "动作", "摘要", "目标", "项目", "的", "了", "是", "在", "和", "把", "就", "也", "有", "不",
]);
const tokenizeForCluster = (s: string): string[] => {
  const out: string[] = [];
  for (const m of String(s).toLowerCase().matchAll(/[a-z][a-z0-9_\-]{2,}/g)) out.push(m[0]);
  const cjk = String(s).replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i + 1 < cjk.length; i++) out.push(cjk.slice(i, i + 2));
  return out;
};
const lineTextOf = (e: Episode): string =>
  [e.title, ...e.entries, ...e.materials, ...e.decisions.map((d) => d.text), ...e.actions.map((a) => a.text)].join(" ");

/** 对线做确定性词法聚类 → 「任务面」。贪心：与已有簇标题词重叠率 ≥ 阈值即并入，否则新簇。 */
export const clusterLinesIntoFaces = (lines: Episode[], threshold = 0.18): Face[] => {
  const clusters: { tokens: Set<string>; lines: Episode[]; points: number }[] = [];
  const sorted = [...lines].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  for (const e of sorted) {
    const toks = new Set(tokenizeForCluster(lineTextOf(e)).filter((t) => !STOP.has(t)));
    let best = -1;
    let bestScore = 0;
    if (toks.size) {
      clusters.forEach((c, i) => {
        let inter = 0;
        for (const t of toks) if (c.tokens.has(t)) inter++;
        const score = inter / toks.size;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
    }
    if (best >= 0 && bestScore >= threshold) {
      const c = clusters[best]!;
      c.lines.push(e);
      c.points += e.memoryCount;
      for (const t of toks) c.tokens.add(t);
    } else {
      clusters.push({ tokens: toks, lines: [e], points: e.memoryCount });
    }
  }
  return clusters
    .map((c, i) => {
      const top = [...c.tokens].slice(0, 4).join("/");
      const dec = c.lines.reduce((n, l) => n + l.decisions.length, 0);
      const mats = [...new Set(c.lines.flatMap((l) => l.materials))];
      return {
        key: `任务#${i + 1} · ${top || "未命名"}`,
        axis: "task" as const,
        lines: c.lines,
        points: c.points,
        decisions: dec,
        materials: mats,
        startedAt: c.lines[0]!.startedAt,
        endedAt: c.lines[c.lines.length - 1]!.endedAt,
      };
    })
    .sort((a, b) => b.points - a.points);
};

/** 升维：点 → 线 → 面。纯派生。axis="task" 走词法聚类。 */
export const deriveFaces = (
  atoms: ParsedAtom[],
  axis: FaceAxis = "session",
  gapMinutes = 60,
): { lines: Episode[]; faces: Face[] } => {
  const lines = deriveEpisodes(atoms, gapMinutes);
  if (axis === "task") return { lines, faces: clusterLinesIntoFaces(lines) };
  const map = new Map<string, Face>();
  for (const e of lines) {
    const key = keyOf(e, axis);
    const f = map.get(key) ?? {
      key,
      axis,
      lines: [],
      points: 0,
      decisions: 0,
      materials: [],
      startedAt: e.startedAt,
      endedAt: e.endedAt,
    };
    f.lines.push(e);
    f.points += e.memoryCount;
    f.decisions += e.decisions.length;
    for (const m of e.materials) if (!f.materials.includes(m)) f.materials.push(m);
    if (e.startedAt < f.startedAt) f.startedAt = e.startedAt;
    if (e.endedAt > f.endedAt) f.endedAt = e.endedAt;
    map.set(key, f);
  }
  return { lines, faces: [...map.values()].sort((a, b) => b.points - a.points) };
};

/** 降维：面 → 点句柄（atom rel 列表，可逐条解析回事实）。 */
export const downToPoints = (face: Face): string[] => face.lines.flatMap((l) => l.memoryRefs);

/** 升维到「观察意识」：把所有面收进一个视角（soul 若有则带上）。 */
export const deriveConsciousness = (
  atoms: ParsedAtom[],
  faces: Face[],
  soulId: string | null = null,
): Consciousness => {
  const entryTally = new Map<string, number>();
  for (const a of atoms) {
    const k = a.entry || "(无)";
    entryTally.set(k, (entryTally.get(k) ?? 0) + 1);
  }
  const topEntries = [...entryTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    axis: faces[0]?.axis ?? "session",
    faces: faces.length,
    points: atoms.length,
    soulId,
    topEntries,
    blindSpots: ["意识只覆盖已采集的点；未被采集 / 未发生的现实不在此（不宣称看见整全）。"],
  };
};

/** 守恒校验：所有面内点之和必须等于 0 维点数（升维不丢点）。 */
export const conserved = (atoms: ParsedAtom[], faces: Face[]): boolean =>
  faces.reduce((n, f) => n + f.points, 0) === atoms.length;
