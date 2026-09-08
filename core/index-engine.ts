// dsh-shadow —— core/index-engine.ts：Index Engine（ADR-0046 Phase 2，候选生成层）。
// 定位：Index Engine 只做「候选生成（Search/检索）」，Context Assembly（裁决/证据/关系/组装）留在 Shadow Core。
// zg 是证据传感器（discover/verify），不是裁决层；zg 未装 → unavailable，绝不静默 fallback 成 verified（证据契约）。
// provider：fs（默认，全量扫描内存，行为不变）| zg（复用 zgEvidenceProvider.discover 做候选）。
import type { EvidenceRef } from "./lineage.js";
import type { EvidenceProvider } from "./types.js";
import { authorizeScope } from "./authorization.js";
import { zgEvidenceProvider } from "../evidence/zg.js";

export interface CandidateResult {
  provider: "fs" | "zg";
  /** zg 未装/不可用 → true；调用方应回退 fs 扫描。绝不把 unavailable 当作 verified。 */
  unavailable?: boolean;
  /** 候选证据（zg: 源文件路径+行号；fs: 空=全量扫描）。 */
  refs: EvidenceRef[];
}

export interface IndexEngine {
  generateCandidates(query: string, ctx: any): Promise<CandidateResult>;
}

const toRefs = (matches: any[]): EvidenceRef[] =>
  (matches || []).slice(0, 20).map((m) => ({ type: "file", locator: String(m.path || ""), fragment: m.startLine ? { start: Number(m.startLine) } : undefined }));

// zg 思想（ADR-0047）：rank 步——按 query 词在候选中命中数排序（锚定精确标识/路径）。纯函数。
export const rankRefs = (refs: EvidenceRef[], query: string): EvidenceRef[] => {
  const tokens = String(query || "").toLowerCase().split(/[\s,，。、；:：]+/).filter(Boolean);
  if (!tokens.length) return refs;
  const score = (r: EvidenceRef) => {
    const hay = `${r.locator} ${r.fragment?.start || ""}`.toLowerCase();
    return tokens.filter((t) => hay.includes(t)).length;
  };
  return [...refs].sort((a, b) => score(b) - score(a));
};

/** 工厂：按 config.indexEngine.provider 路由。fs=默认（空候选，走全量内存扫描）；zg=复用 zg provider。 */
export const createIndexEngine = (config: any, evidenceProvider: EvidenceProvider = zgEvidenceProvider): IndexEngine => {
  const provider = config?.indexEngine?.provider || "fs";
  if (provider === "zg") {
    return {
      async generateCandidates(query, ctx) {
        // 先探测 zg 是否可用（verify 返回 unavailable 时不冒充候选）；否则回退 → 调用方 fs 扫描。
        const ref = { path: "", query, kind: "query" as const }; // EvidenceRef(core types): 语义查询，path 留空
        const r = await evidenceProvider.verify(ref, ctx);
        if (r.status === "unavailable") return { provider: "zg", unavailable: true, refs: [] };
        const matches = await evidenceProvider.discover(ref, ctx);
        const refs = rankRefs(toRefs(matches), query); // zg 思想：语义发现→词汇级排序锚定
        return { provider: "zg", refs: authorizeScope(refs, { workspace: ctx?.workspace }) }; // ADR-0048⑥ 授权范围
      },
    };
  }
  // fs 默认：不做候选预筛（返回空；调用方走现有全量扫描，行为不变）。
  return { async generateCandidates() { return { provider: "fs", refs: [] }; } };
};
