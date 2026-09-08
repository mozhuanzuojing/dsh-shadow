import { authorizeScope } from "./authorization.js";
import { zgEvidenceProvider } from "../evidence/zg.js";
const toRefs = (matches) => (matches || []).slice(0, 20).map((m) => ({ type: "file", locator: String(m.path || ""), fragment: m.startLine ? { start: Number(m.startLine) } : undefined }));
// zg 思想（ADR-0047）：rank 步——按 query 词在候选中命中数排序（锚定精确标识/路径）。纯函数。
export const rankRefs = (refs, query) => {
    const tokens = String(query || "").toLowerCase().split(/[\s,，。、；:：]+/).filter(Boolean);
    if (!tokens.length)
        return refs;
    const score = (r) => {
        const hay = `${r.locator} ${r.fragment?.start || ""}`.toLowerCase();
        return tokens.filter((t) => hay.includes(t)).length;
    };
    return [...refs].sort((a, b) => score(b) - score(a));
};
/** 工厂：按 config.indexEngine.provider 路由。fs=默认（空候选，走全量内存扫描）；zg=复用 zg provider。 */
export const createIndexEngine = (config, evidenceProvider = zgEvidenceProvider) => {
    const provider = config?.indexEngine?.provider || "fs";
    if (provider === "zg") {
        return {
            async generateCandidates(query, ctx) {
                // 先探测 zg 是否可用（verify 返回 unavailable 时不冒充候选）；否则回退 → 调用方 fs 扫描。
                const ref = { path: "", query, kind: "query" }; // EvidenceRef(core types): 语义查询，path 留空
                const r = await evidenceProvider.verify(ref, ctx);
                if (r.status === "unavailable")
                    return { provider: "zg", unavailable: true, refs: [] };
                const matches = await evidenceProvider.discover(ref, ctx);
                const refs = rankRefs(toRefs(matches), query); // zg 思想：语义发现→词汇级排序锚定
                return { provider: "zg", refs: authorizeScope(refs, { workspace: ctx?.workspace }) }; // ADR-0048⑥ 授权范围
            },
        };
    }
    // fs 默认：不做候选预筛（返回空；调用方走现有全量扫描，行为不变）。
    return { async generateCandidates() { return { provider: "fs", refs: [] }; } };
};
