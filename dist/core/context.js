// dsh-shadow —— core/context.ts：Context Recovery 视图（ADR-0040，派生式）。
// 把记忆里引用的【证据路径】派生成 ContextReference：subject/value/source(来源)/status。
// - P0 Candidate + Revalidate：Memory → Candidate → Validation（fs 复核）→ Current Context；禁 Memory→Truth 直通。
// - P1 Evidence Pointer：source = 引用它的 MemoryAtom 列表（"为什么知道这个"）。
// - P2 Transformation Trace：Mapping ≠ Source Fact（如 D:\ → /mnt/d/，rule=windows_wsl_mapping），
//   转换视图标注规则、非事实。仍只读/派生，未改写事实源。
import { scrubUnsafe } from "../security/scrub.js";
import { evidencePathsOf, isPathLike, isConcreteLocator } from "../evidence/paths.js";
const applyMapping = (value, mappings) => {
    for (const m of mappings || []) {
        const f = String(m.from || "").replace(/[/\\]+$/, "");
        const v = String(value || "").replace(/[/\\]+$/, "");
        if (m.from && value.replace(/\\/g, "/").startsWith(f.replace(/\\/g, "/"))) {
            const to = String(m.to || "").replace(/[/\\]+$/, "");
            const tail = String(value).slice(String(m.from).length);
            return { transformed: to + tail, rule: m.rule || `${m.from} → ${m.to}（转换规则,非事实）` };
        }
    }
    return undefined;
};
// 从一条记忆抽取引用的证据路径（去重、限流）。
// v1.15.15（ADR-0059）：加 `isConcreteLocator` —— 通配符与 git ref 不是可检查的具体路径，
// 拿它们验存在性必然判缺失，会在 mode:"context" 里报成「已过时/证据缺失」（假漂移）。
const refPathsOf = (p) => {
    const fromBody = evidencePathsOf(p.body || "");
    const fromMats = (p.materials || []).filter((x) => isPathLike(x));
    return Array.from(new Set([...fromBody, ...fromMats]))
        .filter((x) => isPathLike(x) && isConcreteLocator(x) && !!x)
        .slice(0, 12);
};
export const deriveContextReferences = async (parsed, verifyEvidence, fsCtx, mappings = []) => {
    const map = new Map();
    for (const p of parsed) {
        const subject = p.entry || "(无入口)";
        for (const value of refPathsOf(p)) {
            const key = `${subject}||${value}`;
            let ref = map.get(key);
            if (!ref) {
                ref = { subject, value, source: [], status: "unknown" };
                map.set(key, ref);
            }
            if (!ref.source.includes(p.rel))
                ref.source.push(p.rel);
        }
    }
    const refs = [...map.values()];
    for (const ref of refs) {
        // P2 转换痕迹
        const tr = applyMapping(ref.value, mappings);
        if (tr) {
            ref.transformed = tr.transformed;
            ref.rule = tr.rule;
        }
        // P0 复核（fs/zg Evidence Gateway；zg 未装 → unknown，绝不静默 fallback 成 validated）
        try {
            const res = await verifyEvidence({ path: ref.value, kind: "path" }, fsCtx);
            ref.status = res.status === "verified" ? "validated" : res.status === "not_found" ? "stale" : res.status === "unavailable" ? "unknown" : "unknown";
        }
        catch {
            ref.status = "unknown";
        }
    }
    return refs;
};
const D = (s) => scrubUnsafe(String(s || "")).slice(0, 80);
export const renderContextRefs = (refs, topic) => {
    const needle = String(topic || "").toLowerCase();
    const filtered = needle
        ? refs.filter((r) => `${r.subject} ${r.value} ${r.transformed || ""} ${r.rule || ""}`.toLowerCase().includes(needle))
        : refs;
    if (!filtered.length)
        return needle ? `（无匹配 context 引用：${topic}）` : "（暂无 Context 引用）";
    const parts = filtered.map((r) => {
        const seg = [];
        seg.push(`## ${r.subject}`);
        seg.push(`- 值：${D(r.value)}`);
        seg.push(`- 状态：${r.status}${r.status === "validated" ? "（验证仍有效）" : r.status === "stale" ? "（已过时/证据缺失）" : "（无法验证/zg未装）"}`);
        if (r.transformed)
            seg.push(`- 转换：${D(r.transformed)}〔${r.rule}〕（Mapping≠Source Fact，非事实）`);
        seg.push(`- 来源（Evidence Pointer）：${r.source.map((rel) => rel.split("/").slice(-1)[0]).join("、") || "—"}`);
        return seg.join("\n");
    });
    return parts.join("\n\n");
};
