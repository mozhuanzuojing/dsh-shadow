import { zgEvidenceProvider } from "../evidence/zg.js";
const toRefs = (matches) => (matches || []).slice(0, 20).map((m) => ({ type: "file", locator: String(m.path || ""), fragment: m.startLine ? { start: Number(m.startLine) } : undefined }));
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
                return { provider: "zg", refs: toRefs(matches) };
            },
        };
    }
    // fs 默认：不做候选预筛（返回空；调用方走现有全量扫描，行为不变）。
    return { async generateCandidates() { return { provider: "fs", refs: [] }; } };
};
