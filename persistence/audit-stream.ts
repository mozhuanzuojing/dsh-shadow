// dsh-shadow —— persistence/audit-stream.ts：审计流的**读侧**（v1.19.1 / `adr/0097` T21）。
//
// ## 为什么需要它（T21 的那条缺口）
//
// `adr/0097` 把「只有动作的批」从记忆文件降级成 `.shadow/audit/<date>.jsonl`。写入侧补了「材料折叠进
// 下一条记忆」，但**一个纯动作批之后再无记忆批**时，它的材料就只躺在审计流里、读侧看不见
// （`adr/0097` §5.2）。本模块把审计流**读出来**，让那些材料至少**可见、可查**。
//
// ## 三条硬边界（照 `BACKLOG` T21 的完成判据写）
//
// ① **它永远不会把审计流变成「记忆」**：不进 `_meta.json`、不进索引、不计 hits、不参与召回打分。
//    本模块只做**只读投影**（records + materials），调用方拿到的是显示/取证用的材料清单。
// ② **不注入正常召回答案**：材料只进 `debug` 诊断区（与降级台账同一层）。理由：整个 `adr/0097`
//    就建立在「审计流不是记忆」这条线上，把它塞进召回正文会把那条线抹掉。
// ③ **缺件不静默（ADR-0049）**：目录/文件**不存在** ⇒ `ok:true` 且 `files:0`（=「还没采集」，正常）；
//    其它读失败 ⇒ `ok:false` + `reason`（**不得**退化成「没有材料」）。这与 `query-log` 的 v1.15.94 教训同形。
//
// 另：**不可解析的行会被计数**（`tornLines`）——撕裂行不静默（写侧是「读回→拼接→写回」，
// 进程被杀时最后一行可能被截断）。
import { SHADOW_ROOT } from "../core/paths.js";
import { isNotFound, errText } from "../core/util.js";
import type { AtomEvidenceRef } from "../core/lineage/index.js";

export interface AuditStreamSummary {
  ok: boolean;
  /** 参与读取的 `.jsonl` 文件数（0 = 还没采集）。 */
  files: number;
  /** 可解析的记录数。 */
  records: number;
  /** 不可解析的行数（撕裂/坏件）——**必须可见**，不得当成 0 条记录。 */
  tornLines: number;
  /** 去重后的材料（`materials` 字段 ∪ 从 `改/读 <path>` 文本推断）。 */
  materials: string[];
  /**
   * 材料里**能当线索键**的那些，已升成类型化证据引用（`T27`，`v1.21.34`）。
   * 「能当线索键」= 能给定位符：路径 → `type:"file"`；URL → `type:"url"`。
   */
  evidence: AtomEvidenceRef[];
  /** 给不出定位符的材料（**归不了**）：只登记，**绝不硬塞成 ref**（宁可说不知道，不许错配）。 */
  unattributable: string[];
  /** 归不了的条数（`unattributable` 会被截断）。 */
  unattributableCount: number;
  /** 有记录的日期（升序）。 */
  dates: string[];
  /** 材料清单的截断前的总数（`materials` 会被截到 `MATERIAL_LIMIT`）。 */
  materialCount: number;
  reason?: string;
}

/** 材料清单返回上限（防一条调试行被 8 千条路径刷爆）。只在本模块用 ⇒ 不导出（免给 A1「导出但生产无调用点」添条目）。 */
const MATERIAL_LIMIT = 40;

const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const READ_RE = /^改\/读 (.+)$/;

/** 从一条记录里取材料（字段优先，其次按文本推断 —— 回收来的记录两种都有）。 */
const materialsOfRecord = (rec: any): string[] => {
  const out: string[] = [];
  if (Array.isArray(rec?.materials)) for (const m of rec.materials) if (typeof m === "string" && m.trim()) out.push(m.trim());
  const m = READ_RE.exec(String(rec?.text || ""));
  if (m) out.push(m[1].trim());
  return out;
};

const URL_RE = /^(https?|file):\/\//i;

/**
 * 一条材料能不能当**线索键**（`T27`）：能给出定位符才算。
 * **判据故意窄**（宁可说「归不了」，不许错配）：URL ⇒ `url`；无空白的路径串 ⇒ `file`；其余 ⇒ `undefined`（归不了）。
 * ⚠ 为什么窄：审计记录与记忆之间**本来只有 `agent` + 日期两个弱键**（`BACKLOG` T27 记的就是这个卡点），
 * 拿「猜出来的」键去归并 = 制造错配的证据链，比不归更坏。
 */
const refOfMaterial = (raw: string): AtomEvidenceRef | undefined => {
  const s = raw.trim();
  if (!s) return undefined;
  if (URL_RE.test(s)) return { type: "url", locator: s };
  if (/[\\/]/.test(s) && !/\s/.test(s)) return { type: "file", locator: s };
  return undefined;
};

/**
 * 把材料清单**分成两堆**：能当线索键的（类型化证据引用）与归不了的（无路径）。
 * 纯函数、判据只有这一份 ⇒ 由 `readAuditStream` 调用（标定测试经它走端到端，**不导出**：
 * 本模块与 `MATERIAL_LIMIT` 同一条约定 —— 只在本模块用的东西不导出，免给 A1「导出但生产无调用点」添条目）。
 */
const auditEvidenceSplit = (
  materials: readonly string[],
): { refs: AtomEvidenceRef[]; unattributable: string[]; unattributableCount: number } => {
  const refs: AtomEvidenceRef[] = [];
  const unattributable: string[] = [];
  const seen = new Set<string>();
  let unattributableCount = 0;
  for (const raw of materials) {
    const m = String(raw ?? "").trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    const ref = refOfMaterial(m);
    if (ref) refs.push(ref);
    else {
      unattributableCount++;
      if (unattributable.length < MATERIAL_LIMIT) unattributable.push(m);
    }
  }
  return { refs, unattributable, unattributableCount };
};

/**
 * 读审计流。
 * `dates` 给了就只读那几个日期（`YYYY-MM-DD`）；不给则读 `audit/` 下全部日期文件（按名升序）。
 */
export const readAuditStream = async (fs: any, ws: string, opts: { dates?: string[] } = {}): Promise<AuditStreamSummary> => {
  const empty = (over: Partial<AuditStreamSummary> = {}): AuditStreamSummary => ({
    ok: true,
    files: 0,
    records: 0,
    tornLines: 0,
    materials: [],
    evidence: [],
    unattributable: [],
    unattributableCount: 0,
    dates: [],
    materialCount: 0,
    ...over,
  });
  if (!fs || !ws) return empty({ ok: false, reason: "无 fs 或无工作区" });

  const dir = `${SHADOW_ROOT}/audit`;
  let entries: any[] = [];
  try {
    const target = await fs.resolve(`${ws}/${dir}`, { cwd: ws });
    entries = await fs.listDir(target);
  } catch (e: any) {
    // 目录不存在 = 还没采集（正常）；其它失败 = 真问题，必须说清。
    if (isNotFound(e)) return empty();
    return empty({ ok: false, reason: `读取 ${dir} 失败：${errText(e)}` });
  }

  let names = (entries || [])
    .map((e: any) => String(e?.name || ""))
    .filter((n: string) => DATE_FILE_RE.test(n));
  if (opts.dates && opts.dates.length) {
    const want = new Set(opts.dates.map((d) => `${d}.jsonl`));
    names = names.filter((n) => want.has(n));
  }
  names.sort();

  let records = 0;
  let tornLines = 0;
  const seen = new Set<string>();
  const materials: string[] = [];
  const dates: string[] = [];
  for (const name of names) {
    let text = "";
    try {
      const t = await fs.resolve(`${ws}/${dir}/${name}`, { cwd: ws });
      text = (await fs.readText(t)) || "";
    } catch (e: any) {
      if (isNotFound(e)) continue; // 列目录与读文件之间的竞态：文件刚被删 —— 当空，不算失败
      return empty({ ok: false, reason: `读取 ${dir}/${name} 失败：${errText(e)}` });
    }
    let count = 0;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let rec: any;
      try {
        rec = JSON.parse(line);
      } catch {
        tornLines++; // 撕裂/坏行：计数，不静默
        continue;
      }
      count++;
      records++;
      for (const m of materialsOfRecord(rec)) {
        if (seen.has(m)) continue;
        seen.add(m);
        materials.push(m);
      }
    }
    if (count) dates.push(DATE_FILE_RE.exec(name)![1]);
  }

  const split = auditEvidenceSplit(materials); // 判据一份：材料 → 证据引用 / 归不了
  return {
    ok: true,
    files: names.length,
    records,
    tornLines,
    materials: materials.slice(0, MATERIAL_LIMIT),
    evidence: split.refs.slice(0, MATERIAL_LIMIT),
    unattributable: split.unattributable,
    unattributableCount: split.unattributableCount,
    dates,
    materialCount: materials.length,
  };
};

/**
 * 渲染成一行诊断（`read_shadow({debug:true})` 用；缺件与读失败**分得开**）。
 * `T27` 起多了两段：**能当线索键的条数**（证据面）与**归不了的条数**（显式可见，不静默）。
 */
export const renderAuditStreamDiag = (s: AuditStreamSummary): string => {
  if (!s.ok) return `审计流：**读失败**（${s.reason}）—— 动作回声与材料当前不可见，**别把它当「没有」**`;
  if (!s.records) return "审计流：尚无记录（正常：本工作区还没写入审计流）";
  const mats = s.materials.length ? ` · 材料 ${s.materials.slice(0, 6).join("、")}${s.materialCount > 6 ? ` 等 ${s.materialCount} 个` : ""}` : "";
  const torn = s.tornLines ? ` · ⚠ 不可解析行 ${s.tornLines}` : "";
  const keys = s.evidence?.length
    ? ` · 线索键 ${s.evidence.length} 条（${s.evidence.slice(0, 3).map((r) => `${r.type} ${r.locator}`).join("、")}${s.evidence.length > 3 ? "…" : ""}）`
    : "";
  const un = s.unattributableCount
    ? ` · ⚠ 归不了 ${s.unattributableCount} 条（无路径，如 ${s.unattributable.slice(0, 3).join("、")}）`
    : "";
  return `审计流（系统派生记录，**不进索引/不计 hits**）：${s.files} 个日期文件 / ${s.records} 条动作回声${mats}${keys}${un}${torn}`;
};
