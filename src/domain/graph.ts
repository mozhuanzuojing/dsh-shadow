/**
 * v3 domain — 关系网（edges）与激活子网（ego-net）。纯派生、可重建、不改存储。
 * 背景不是"一句话"，而是点之间的网：同线相邻 / 同入口 / 共享材料 / 纠正指向。
 * 未来句 → 种子点 → 沿边扩散 hops 跳 → 返回被激活的子网（节点+边+路径）。
 */
import type { ParsedAtom } from "../contract/types.js";
import { cjkBigrams } from "./rank.js";

export type EdgeType = "same-line" | "same-entry" | "material" | "correction" | "semantic" | "causal";
export interface Edge {
  from: string;
  to: string;
  type: EdgeType;
  derivation: string;
}

const ts = (a: ParsedAtom): string => `${a.date}${a.time ? " " + String(a.time) : ""}`;
const lineOf = (rel: string): string => rel.split("#")[0] ?? rel;

/** 从 atom 字段确定性派生边（每个节点每类最多 perNode 条，防爆）。 */
/** 从 atom 字段确定性派生边（每个节点每类最多 perNode 条，防爆）。按 atoms 签名缓存（读多时避免全量重建）。 */
const edgeCache = new Map<string, Edge[]>();
const atomsSig = (atoms: ParsedAtom[], perNode: number): string => {
  let h = 0;
  for (const a of atoms) {
    const s = `${a.rel}|${a.entry}|${a.date}|${a.time}|${a.materials?.join(",") ?? ""}|${a.decisions?.join(",") ?? ""}|${a.decisionEvents?.map((e) => e.statement + "|" + (e.reason ?? "")).join(",") ?? ""}|${perNode}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    // 正文内容也入签名：同长度不同内容不能命中旧缓存。
    for (let i = 0; i < a.body.length; i++) h = (h * 31 + a.body.charCodeAt(i)) | 0;
  }
  return `${h}:${atoms.length}`;
};

export const buildEdges = (atoms: ParsedAtom[], perNode = 4): Edge[] => {
  const key = atomsSig(atoms, perNode);
  const hit = edgeCache.get(key);
  if (hit) return hit;
  const out: Edge[] = [];
  const push = (from: string, to: string, type: EdgeType, derivation: string): void => {
    if (from && to && from !== to) out.push({ from, to, type, derivation });
  };

  // 同线相邻（按时间排序，前后各 perNode 个）
  const byLine = new Map<string, ParsedAtom[]>();
  for (const a of atoms) {
    const k = lineOf(a.rel);
    const arr = byLine.get(k) ?? [];
    arr.push(a);
    byLine.set(k, arr);
  }
  for (const [line, arr] of byLine) {
    arr.sort((x, y) => ts(x).localeCompare(ts(y)) || x.rel.localeCompare(y.rel));
    for (let i = 0; i < arr.length; i++) {
      for (let d = 1; d <= perNode && i + d < arr.length; d++) push(arr[i]!.rel, arr[i + d]!.rel, "same-line", `同线相邻(${line.split("/").pop()})`);
    }
  }

  // 同入口
  const byEntry = new Map<string, ParsedAtom[]>();
  for (const a of atoms) if (a.entry) {
    const arr = byEntry.get(a.entry) ?? [];
    arr.push(a);
    byEntry.set(a.entry, arr);
  }
  for (const [entry, arr] of byEntry) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length && i < perNode; i++)
      for (let j = i + 1; j < arr.length && j <= i + perNode; j++)
        push(arr[i]!.rel, arr[j]!.rel, "same-entry", `同入口(${entry})`);
  }

  // 共享材料/背景
  const byMat = new Map<string, ParsedAtom[]>();
  for (const a of atoms) for (const m of a.materials ?? []) {
    if (!m || m.length < 3) continue;
    const arr = byMat.get(m) ?? [];
    arr.push(a);
    byMat.set(m, arr);
  }
  for (const [m, arr] of byMat) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length && i < perNode; i++)
      for (let j = i + 1; j < arr.length && j <= i + perNode; j++)
        push(arr[i]!.rel, arr[j]!.rel, "material", `共享材料(${m.slice(0, 40)})`);
  }

  // 纠正/撤回指向
  for (const a of atoms) {
    for (const t of [a.corrects, a.withdraws]) {
      if (t && typeof t === "string") push(a.rel, t, "correction", "纠正/撤回指向");
    }
  }

  // 语义边：共享「罕见 2-gram 关键词」（df 2–3，避免 hub 爆炸）
  const STOP = new Set(["我们", "他们", "这个", "那个", "就是", "不是", "没有", "可以", "以及", "如果", "所以", "因为", "但是", "然后", "现在", "已经", "需要", "应该", "一个", "什么", "怎么", "这样", "那样", "自己", "东西", "问题", "时候"]);
  const termIdx = new Map<string, string[]>();
  for (const a of atoms) {
    const terms = new Set(cjkBigrams(a.body.toLowerCase()).filter((t) => t.length >= 2 && !STOP.has(t)));
    for (const t of terms) {
      const arr = termIdx.get(t) ?? [];
      arr.push(a.rel);
      termIdx.set(t, arr);
    }
  }
  const semCount = new Map<string, number>();
  const semCap = (rel: string): boolean => (semCount.get(rel) ?? 0) < 3;
  for (const [term, rels] of termIdx) {
    if (rels.length < 2 || rels.length > 3) continue;
    for (let i = 0; i < rels.length; i++)
      for (let j = i + 1; j < rels.length; j++) {
        if (!semCap(rels[i]!) || !semCap(rels[j]!)) continue;
        semCount.set(rels[i]!, (semCount.get(rels[i]!) ?? 0) + 1);
        semCount.set(rels[j]!, (semCount.get(rels[j]!) ?? 0) + 1);
        push(rels[i]!, rels[j]!, "semantic", `共享关键词(${term})`);
      }
  }

  // 因果边：决策/理由 ↔ 材料/出处（确定性引用）。先建材料索引，避免全语料 O(n²)。
  const matIdx = new Map<string, string[]>();
  for (const a of atoms) for (const m of a.materials ?? []) {
    if (!m) continue;
    const arr = matIdx.get(m) ?? [];
    arr.push(a.rel);
    matIdx.set(m, arr);
  }
  const causCount = new Map<string, number>();
  for (const a of atoms) {
    const hasDec = (a.decisionEvents?.length ?? 0) > 0 || (a.decisions?.length ?? 0) > 0;
    if (!hasDec || !(a.materials?.length || a.decisionEvents?.some((e) => e.reason))) continue;
    for (const m of a.materials ?? []) {
      if ((causCount.get(a.rel) ?? 0) >= 3) break;
      for (const relB of (matIdx.get(m) ?? []).slice(0, perNode + 1)) {
        if (relB === a.rel) continue;
        causCount.set(a.rel, (causCount.get(a.rel) ?? 0) + 1);
        push(a.rel, relB, "causal", `决策↔材料(${m.slice(0, 40)})`);
      }
    }
  }

  edgeCache.set(key, out);
  if (edgeCache.size > 2) edgeCache.delete(edgeCache.keys().next().value as string);
  return out;
};

export interface EgoNet {
  seeds: string[];
  nodes: string[]; // rel，按 hop 升序
  hop: Map<string, number>;
  edges: Edge[];
}

/** 以 seeds 为种子，沿边扩散 hops 跳（节点上限 maxNodes，防爆）。 */
export const activateNet = (edges: Edge[], seeds: string[], hops = 2, maxNodes = 30): EgoNet => {
  const adj = new Map<string, Edge[]>();
  for (const e of edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e);
  }
  const hop = new Map<string, number>();
  const order: string[] = [];
  const q: string[] = [];
  for (const s of seeds) if (!hop.has(s)) { hop.set(s, 0); order.push(s); q.push(s); }
  const kept: Edge[] = [];
  const seenEdge = new Set<string>();
  for (let h = 0; h < hops && q.length; h++) {
    const next: string[] = [];
    for (const cur of q) {
      for (const e of adj.get(cur) ?? []) {
        const other = e.from === cur ? e.to : e.from;
        if (!hop.has(other)) {
          if (order.length >= maxNodes) continue;
          hop.set(other, h + 1);
          order.push(other);
          next.push(other);
        }
        const k = `${e.from}->${e.to}:${e.type}`;
        if (!seenEdge.has(k) && (hop.has(e.from) && hop.has(e.to))) { seenEdge.add(k); kept.push(e); }
      }
    }
    q.length = 0;
    q.push(...next);
  }
  return { seeds: [...seeds], nodes: order, hop, edges: kept };
};
