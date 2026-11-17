/**
 * v2 engine —— 线容器物化 + 从线重建（ADR-0026 Phase B/D）。
 *
 * 「让点回到线」：atoms 按 `session + entry + gap` 归并成线，物化 `.shadow/lines/`；
 * 每个点内嵌**完整 atom 正文**（base64），故可 `loadAtomsFromLines` 无损重建——
 * 这是"删热 atom、以线为源"的前提（守恒、可回放）。
 *
 * A+B 双锚：atoms 是证据账本（A）；线是派生/可升为源的一等容器（B）。
 */

import type { ParsedAtom } from "../contract/types.js";
import type { FsPort } from "../store/fs.js";
import type { SignalStore } from "./signals.js";
import { parseAtom } from "../domain/parse.js";
import { appendPoint, lineIdFor, parseLine, renderLineHeader, selectColdLines, shouldExtend, type LinePoint } from "../domain/lines.js";

export interface BuiltLine {
  rel: string;
  text: string;
  points: number;
}

const atOf = (a: ParsedAtom): string => {
  const t = String(a.time || "000000").padEnd(6, "0");
  return `${a.date} ${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
};

const pointTextOf = (a: ParsedAtom): string => {
  const s = String(a.summary || "").trim();
  if (s && s !== "（无摘要）") return s;
  const u = a.userMessages[0];
  if (u) return String(u).replace(/^用户：/, "").slice(0, 80);
  const d = a.decisionEvents[0];
  if (d) return String(d.statement || "").slice(0, 80);
  return a.goal || a.entry || "(无)";
};

/** 点(atom) → 线文件（纯函数）。每点归且仅归一条线；点内嵌完整正文。 */
export const buildLineFiles = (atoms: ParsedAtom[], gapMinutes = 60): BuiltLine[] => {
  const sorted = [...atoms].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const lines: BuiltLine[] = [];
  let curKey = "";
  let curId = "";
  let curText: string | null = null;
  let lastAt = "";
  let seq = 0;
  let points = 0;
  let startAt = "";

  const flush = (): void => {
    if (curText) lines.push({ rel: `.shadow/lines/${curId}.md`, text: curText, points });
  };

  for (const a of sorted) {
    const key = `${a.agent || ""}|${a.entry || ""}`;
    const at = atOf(a);
    const iso = at.replace(" ", "T");
    const extend = curText !== null && curKey === key && shouldExtend(lastAt.replace(" ", "T"), iso, gapMinutes);
    if (!extend) {
      flush();
      curKey = key;
      startAt = iso;
      curId = lineIdFor(a.agent || "", a.entry || "", iso);
      curText = renderLineHeader({ lineId: curId, session: a.agent || "", entry: a.entry || "", startAt });
      seq = 0;
      points = 0;
    }
    seq += 1;
    const p: LinePoint = { seq, at: at.slice(11), kind: a.kind, rel: `.shadow/lines/${curId}.md#${seq}`, text: pointTextOf(a), body: a.body };
    curText = appendPoint(curText, { lineId: curId, session: a.agent || "", entry: a.entry || "", startAt }, p);
    points += 1;
    lastAt = at;
  }
  flush();
  return lines;
};

/** 物化：把线写到 `.shadow/lines/`（幂等：内容不变不写；失败留 Signal）。 */
export const materializeLines = async (
  fs: FsPort,
  ws: string,
  atoms: ParsedAtom[],
  signals?: SignalStore,
  gapMinutes = 60,
): Promise<{ written: number; lines: number; errors: number }> => {
  const built = buildLineFiles(atoms, gapMinutes);
  const base = String(ws).replace(/\\/g, "/").replace(/\/+$/, "");
  let written = 0;
  let errors = 0;
  for (const L of built) {
    const rel = `${base}/${L.rel}`;
    const cur = await fs.readText(rel);
    if (cur.ok && cur.value === L.text) continue;
    const w = await fs.writeText(rel, L.text);
    if (w.ok) written += 1;
    else errors += 1;
  }
  if (errors) signals?.note("lines", "PARTIAL", `${errors} 条线写入失败`, "线容器未更新；atoms 不受影响，可重建。");
  else signals?.clear("lines");
  return { written, lines: built.length, errors };
};

/** 回读：线文件 → 点（降维用）。读 hot `.shadow/lines` + 冷 `.shadow/archive/lines`（归档冷但仍可读）。 */
export const loadLines = async (fs: FsPort, ws: string): Promise<{ rel: string; points: LinePoint[] }[]> => {
  const base = String(ws).replace(/\\/g, "/").replace(/\/+$/, "");
  const out: { rel: string; points: LinePoint[] }[] = [];
  for (const sub of [".shadow/lines", ".shadow/archive/lines"]) {
    const ls = await fs.listDir(`${base}/${sub}`);
    if (!ls.ok) continue;
    for (const f of ls.value) {
      if (!f.name.endsWith(".md")) continue;
      const r = await fs.readText(`${base}/${sub}/${f.name}`);
      if (r.ok) out.push({ rel: `${sub}/${f.name}`, points: parseLine(r.value).points });
    }
  }
  return out;
};

/** 从线无损重建 ParsedAtom（读路径切换 / 迁移校验用）。点 body 是完整 atom 正文。 */
export const loadAtomsFromLines = async (
  fs: FsPort,
  ws: string,
): Promise<{ atoms: ParsedAtom[]; lines: number; errors: string[] }> => {
  const lines = await loadLines(fs, ws);
  const atoms: ParsedAtom[] = [];
  const errors: string[] = [];
  for (const L of lines) {
    for (const p of L.points) {
      if (!p.body) {
        errors.push(`${L.rel}#${p.seq} 无 body（旧线？）`);
        continue;
      }
      try {
        const name = p.rel.split("/").pop() || `point-${p.seq}.md`;
        const parsed = parseAtom(p.body, p.rel, name);
        // line 句柄的 rel 不是 atom 文件名，parse 取不到时间 → 从正文 when(...) 补回 date/time。
        const m = /when\((\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2}):(\d{2})\)/.exec(p.body);
        if (m) {
          parsed.date = m[1]!;
          parsed.time = `${m[2]}${m[3]}${m[4]}`;
        }
        atoms.push(parsed);
      } catch (e) {
        errors.push(`${p.rel}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { atoms, lines: lines.length, errors };
};

/**
 * 读路径并集：atoms(热/新点) ∪ lines(含迁走的老点)，按 rel 去重。
 * 这样「迁移删热 atom」后老点仍从线可见，而 capture 新写的点从 atoms 可见——不丢、不重。
 */
export const unionByRel = (fromLines: ParsedAtom[], fromAtoms: ParsedAtom[]): ParsedAtom[] => {
  const m = new Map<string, ParsedAtom>();
  for (const a of fromAtoms) m.set(a.rel, a); // atoms 优先（rel 唯一）
  for (const a of fromLines) if (!m.has(a.rel)) m.set(a.rel, a);
  return [...m.values()];
};

/** 收集冷线（最后点早于 now-olderThanDays）；archive 与 forget 共用。 */
const collectCold = async (
  fs: FsPort,
  ws: string,
  olderThanDays: number,
  now?: string,
): Promise<{ base: string; cutoff: string; candidates: string[] }> => {
  const base = String(ws).replace(/\\/g, "/").replace(/\/+$/, "");
  const dir = `${base}/.shadow/lines`;
  const ls = await fs.listDir(dir);
  if (!ls.ok) return { base, cutoff: "", candidates: [] };
  const entries: { name: string; text: string }[] = [];
  for (const f of ls.value) {
    if (!f.name.endsWith(".md")) continue;
    const r = await fs.readText(`${dir}/${f.name}`);
    if (r.ok) entries.push({ name: f.name, text: r.value });
  }
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const cutoff = new Date(nowMs - Math.max(0, olderThanDays) * 86_400_000).toISOString();
  return { base, cutoff, candidates: selectColdLines(entries, cutoff) };
};

/**
 * 线级遗忘/保留：把冷线整条移入 `.shadow/.trash/lines-forgotten-<ts>`（不裸删、可回退）。
 * 移动后读路径（loadLines 只读 .shadow/lines + archive）不再加载 → 真正 bound 读规模。opts.apply=false 为 dry-run。
 */
export const forgetColdLines = async (
  fs: FsPort,
  ws: string,
  olderThanDays: number,
  opts: { apply: boolean; now?: string },
): Promise<{ cutoff: string; candidates: string[]; moved: number }> => {
  const { base, cutoff, candidates } = await collectCold(fs, ws, olderThanDays, opts.now);
  let moved = 0;
  if (opts.apply && candidates.length) {
    const nowMs = opts.now ? new Date(opts.now).getTime() : Date.now();
    const ts = new Date(nowMs).toISOString().replace(/[:.]/g, "-");
    const trash = `${base}/.shadow/.trash/lines-forgotten-${ts}`;
    const mk = await fs.mkdirp(trash);
    if (mk.ok) {
      for (const name of candidates) {
        const r = await fs.rename(`${base}/.shadow/lines/${name}`, `${trash}/${name}`);
        if (r.ok) moved += 1;
      }
    }
  }
  return { cutoff, candidates, moved };
};

/** 线级归档：把冷线从 hot `.shadow/lines` 移到 `.shadow/archive/lines`（冷但仍可读；与 forget 不同，不离开读路径）。 */
export const archiveColdLines = async (
  fs: FsPort,
  ws: string,
  olderThanDays: number,
  opts: { apply: boolean; now?: string },
): Promise<{ cutoff: string; candidates: string[]; moved: number }> => {
  const { base, cutoff, candidates } = await collectCold(fs, ws, olderThanDays, opts.now);
  let moved = 0;
  if (opts.apply && candidates.length) {
    const arch = `${base}/.shadow/archive/lines`;
    const mk = await fs.mkdirp(arch);
    if (mk.ok) {
      for (const name of candidates) {
        const r = await fs.rename(`${base}/.shadow/lines/${name}`, `${arch}/${name}`);
        if (r.ok) moved += 1;
      }
    }
  }
  return { cutoff, candidates, moved };
};

// 线解析内存缓存：按「文件集 size 签名」复用——避免每次读都全量读+base64解码+parseAtom。
const lineAtomsCache = new Map<string, { sig: string; res: { atoms: ParsedAtom[]; lines: number; errors: string[] } }>();

export const lineSignature = async (fs: FsPort, ws: string): Promise<string> => {
  const base = String(ws).replace(/\\/g, "/").replace(/\/+$/, "");
  const parts: string[] = [];
  for (const sub of [".shadow/lines", ".shadow/archive/lines"]) {
    const ls = await fs.listDir(`${base}/${sub}`);
    if (!ls.ok) continue;
    for (const f of ls.value) {
      if (!f.name.endsWith(".md")) continue;
      const st = await fs.stat(`${base}/${sub}/${f.name}`);
      parts.push(`${sub}|${f.name}:${st.ok ? st.value.size : "?"}`);
    }
  }
  return parts.sort().join(";");
};

/** loadAtomsFromLines 的缓存版：签名（文件集大小）不变则复用上轮解析结果；变了才重解析。 */
export const loadAtomsFromLinesCached = async (
  fs: FsPort,
  ws: string,
): Promise<{ atoms: ParsedAtom[]; lines: number; errors: string[] }> => {
  const sig = await lineSignature(fs, ws);
  const c = lineAtomsCache.get(ws);
  if (c && c.sig === sig) return c.res;
  const res = await loadAtomsFromLines(fs, ws);
  lineAtomsCache.set(ws, { sig, res });
  return res;
};
