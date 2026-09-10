import type { AtomEvidenceRef } from "./lineage.js";
import type { EvidenceProvider } from "./types.js";
export interface CandidateResult {
    provider: "fs" | "zg" | "semble";
    /** zg/semble 未装或不可用 → true；调用方应回退 fs 扫描。绝不把 unavailable 当作 verified。 */
    unavailable?: boolean;
    /** 候选证据（zg/semble: 源文件路径+行号；fs: 空=全量扫描）。 */
    refs: AtomEvidenceRef[];
}
export interface IndexEngine {
    generateCandidates(query: string, ctx: any): Promise<CandidateResult>;
}
export declare const rankRefs: (refs: AtomEvidenceRef[], query: string) => AtomEvidenceRef[];
/** 工厂：按 config.indexEngine.provider 路由。
 *  fs=默认（空候选，走全量内存扫描）；zg=复用 zg provider；semble=本地语义检索（ADR-0054，第三形参供测试注入）。 */
export declare const createIndexEngine: (config: any, evidenceProvider?: EvidenceProvider, sembleRun?: (query: string, ctx: any) => Promise<{
    unavailable?: boolean;
    refs: AtomEvidenceRef[];
}>) => IndexEngine;
