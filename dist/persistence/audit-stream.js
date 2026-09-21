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
/** 材料清单返回上限（防一条调试行被 8 千条路径刷爆）。只在本模块用 ⇒ 不导出（免给 A1「导出但生产无调用点」添条目）。 */
const MATERIAL_LIMIT = 40;
const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const READ_RE = /^改\/读 (.+)$/;
/** 从一条记录里取材料（字段优先，其次按文本推断 —— 回收来的记录两种都有）。 */
const materialsOfRecord = (rec) => {
    const out = [];
    if (Array.isArray(rec?.materials))
        for (const m of rec.materials)
            if (typeof m === "string" && m.trim())
                out.push(m.trim());
    const m = READ_RE.exec(String(rec?.text || ""));
    if (m)
        out.push(m[1].trim());
    return out;
};
/**
 * 读审计流。
 * `dates` 给了就只读那几个日期（`YYYY-MM-DD`）；不给则读 `audit/` 下全部日期文件（按名升序）。
 */
export const readAuditStream = async (fs, ws, opts = {}) => {
    const empty = (over = {}) => ({
        ok: true,
        files: 0,
        records: 0,
        tornLines: 0,
        materials: [],
        dates: [],
        materialCount: 0,
        ...over,
    });
    if (!fs || !ws)
        return empty({ ok: false, reason: "无 fs 或无工作区" });
    const dir = `${SHADOW_ROOT}/audit`;
    let entries = [];
    try {
        const target = await fs.resolve(`${ws}/${dir}`, { cwd: ws });
        entries = await fs.listDir(target);
    }
    catch (e) {
        // 目录不存在 = 还没采集（正常）；其它失败 = 真问题，必须说清。
        if (isNotFound(e))
            return empty();
        return empty({ ok: false, reason: `读取 ${dir} 失败：${errText(e)}` });
    }
    let names = (entries || [])
        .map((e) => String(e?.name || ""))
        .filter((n) => DATE_FILE_RE.test(n));
    if (opts.dates && opts.dates.length) {
        const want = new Set(opts.dates.map((d) => `${d}.jsonl`));
        names = names.filter((n) => want.has(n));
    }
    names.sort();
    let records = 0;
    let tornLines = 0;
    const seen = new Set();
    const materials = [];
    const dates = [];
    for (const name of names) {
        let text = "";
        try {
            const t = await fs.resolve(`${ws}/${dir}/${name}`, { cwd: ws });
            text = (await fs.readText(t)) || "";
        }
        catch (e) {
            if (isNotFound(e))
                continue; // 列目录与读文件之间的竞态：文件刚被删 —— 当空，不算失败
            return empty({ ok: false, reason: `读取 ${dir}/${name} 失败：${errText(e)}` });
        }
        let count = 0;
        for (const line of text.split("\n")) {
            if (!line.trim())
                continue;
            let rec;
            try {
                rec = JSON.parse(line);
            }
            catch {
                tornLines++; // 撕裂/坏行：计数，不静默
                continue;
            }
            count++;
            records++;
            for (const m of materialsOfRecord(rec)) {
                if (seen.has(m))
                    continue;
                seen.add(m);
                materials.push(m);
            }
        }
        if (count)
            dates.push(DATE_FILE_RE.exec(name)[1]);
    }
    return {
        ok: true,
        files: names.length,
        records,
        tornLines,
        materials: materials.slice(0, MATERIAL_LIMIT),
        dates,
        materialCount: materials.length,
    };
};
/** 渲染成一行诊断（`read_shadow({debug:true})` 用；缺件与读失败**分得开**）。 */
export const renderAuditStreamDiag = (s) => {
    if (!s.ok)
        return `审计流：**读失败**（${s.reason}）—— 动作回声与材料当前不可见，**别把它当「没有」**`;
    if (!s.records)
        return "审计流：尚无记录（正常：本工作区还没写入审计流）";
    const mats = s.materials.length ? ` · 材料 ${s.materials.slice(0, 6).join("、")}${s.materialCount > 6 ? ` 等 ${s.materialCount} 个` : ""}` : "";
    const torn = s.tornLines ? ` · ⚠ 不可解析行 ${s.tornLines}` : "";
    return `审计流（系统派生记录，**不进索引/不计 hits**）：${s.files} 个日期文件 / ${s.records} 条动作回声${mats}${torn}`;
};
