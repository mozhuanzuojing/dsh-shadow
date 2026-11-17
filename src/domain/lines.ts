/**
 * v2 domain —— 线容器（ADR-0026 Phase B/D 原语）。
 *
 * 一条线 = 一个文件，线内按序存「点」；每个点带 #seq 句柄 + rel 句柄 + **完整正文(body, base64)**。
 * 点（事实）不可变；线只追加。纯函数、无 I/O（Buffer 为 Node 全局，非 I/O）。
 *
 * 线格式（人可读、可 grep、可 diff；body 为单行 base64，避免多行/大括号破坏格式）：
 *   - [点#1 15:22:17 user] 摘要行 {{rel=.shadow/atoms/…}} {{b64=<base64(完整atom正文)>}}
 */

export interface LinePoint {
  seq: number;
  at: string;
  kind: string;
  /** 点的证据句柄（atom rel）。 */
  rel: string;
  /** 摘要/短文本（人读）。 */
  text: string;
  /** 完整 atom 正文（供读路径从线重建 ParsedAtom）。可选（旧线可能无）。 */
  body?: string;
}

export interface LineHeader {
  lineId: string;
  session: string;
  entry: string;
  startAt: string;
}

const oneLine = (s: unknown): string => String(s ?? "").replace(/\r?\n/g, " ").replace(/[{}]/g, "").trim();
const toB64 = (s: unknown): string => Buffer.from(String(s ?? ""), "utf8").toString("base64");

export const renderLineHeader = (h: LineHeader): string =>
  [
    `# 线 ${oneLine(h.lineId)}`,
    `> 坐标：session(${oneLine(h.session)}) · entry(${oneLine(h.entry)}) · 起(${oneLine(h.startAt)})`,
    `> 完整线索（线 = 点沿时间 / 同一件事的连续段；点在线内带 #seq 句柄）`,
    "",
  ].join("\n");

/** 渲染单个点行（供 append / 追加使用）。 */
export const renderPointLine = (p: LinePoint): string =>
  `- [点#${p.seq} ${oneLine(p.at)} ${oneLine(p.kind)}] ${oneLine(p.text)} {{rel=${oneLine(p.rel)}}} {{b64=${toB64(p.body ?? p.text ?? "")}}}`;

/** 把点追加到线文本末尾；lineText=null 时新建线。返回新文本。 */
export const appendPoint = (lineText: string | null, h: LineHeader, p: LinePoint): string => {
  const base = lineText ?? renderLineHeader(h);
  return `${base.replace(/\s+$/, "")}\n${renderPointLine(p)}\n`;
};

/** 解析线文本 → 点列表（含完整正文 body；供重建 / 降维 / 迁移）。 */
export const parseLine = (text: string): { points: LinePoint[] } => {
  const points: LinePoint[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^- \[点#(\d+) (\S+) ([^\]]+)\] (.*?) \{\{rel=(.*?)\}\}(?: \{\{b64=([A-Za-z0-9+/=]*)\}\})?$/.exec(line);
    if (m) {
      const t = m[4] ?? "";
      const body = m[6] ? Buffer.from(m[6], "base64").toString("utf8") : t;
      points.push({ seq: Number(m[1]), at: m[2]!, kind: m[3]!, text: t, rel: m[5]!, body });
    }
  }
  return { points };
};

/** 下一个点的 seq。 */
export const nextSeq = (text: string | null): number => (text ? parseLine(text).points.length + 1 : 1);

/** 解析线头（session/entry/startAt/lineId），供「重启后续接」按坐标匹配磁盘上的线。 */
export const parseLineHeader = (text: string): LineHeader | undefined => {
  const idm = /^# 线 (.+)$/m.exec(String(text ?? ""));
  const m = /session\(([^)]*)\) · entry\(([^)]*)\) · 起\(([^)]*)\)/.exec(String(text ?? ""));
  if (!m) return undefined;
  return { lineId: idm?.[1] ?? "", session: m[1]!, entry: m[2]!, startAt: m[3]! };
};

/** 线的「最后点时刻」(ISO)；无点/无头 → undefined。用于按龄归档/遗忘。 */
export const lineLastAt = (text: string): string | undefined => {
  const h = parseLineHeader(text);
  const pts = parseLine(text).points;
  if (!h || !pts.length) return undefined;
  return `${h.startAt.slice(0, 10)}T${pts[pts.length - 1]!.at}`;
};

/** 选出「最后点早于 cutoff」的冷线（按文件名）。cutoff 为 ISO 时间。 */
export const selectColdLines = (entries: { name: string; text: string }[], cutoffIso: string): string[] => {
  const cut = new Date(cutoffIso).getTime();
  if (!Number.isFinite(cut)) return [];
  return entries
    .filter((e) => {
      const la = lineLastAt(e.text);
      const t = la ? new Date(la).getTime() : NaN;
      return Number.isFinite(t) && t < cut;
    })
    .map((e) => e.name);
};

/** 线是否续接：同一 session/entry 且时间间隔 ≤ gap（闭合则另起一条线）。 */
export const shouldExtend = (lastAt: string, nowAt: string, gapMinutes = 60): boolean => {
  const a = new Date(lastAt).getTime();
  const b = new Date(nowAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return b >= a && b - a <= gapMinutes * 60_000;
};

/** 由 session / entry / 起始时刻派生线文件名（含时分秒消歧，避免同日同 session/entry 的多段线同名覆盖）。 */
export const lineIdFor = (session: string, entry: string, startAt: string): string => {
  const slug = (s: string): string => oneLine(s).replace(/[^A-Za-z0-9\-_]+/g, "-").slice(0, 40) || "x";
  const s = oneLine(startAt);
  const day = s.slice(0, 10) || "0000-00-00";
  const clock = (s.slice(11, 19) || "").replace(/:/g, "") || "000000";
  return `${day}--${clock}--${slug(session)}--${slug(entry)}`;
};
