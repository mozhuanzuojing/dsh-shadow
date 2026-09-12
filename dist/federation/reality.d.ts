import type { RealityEvidence } from "./types.js";
export declare const registerRealityEvidence: (fs: any, ws: string, ev: {
    observedAt?: string;
    source: string;
    observation: string;
    linkedHypothesis?: string[];
}) => Promise<{
    evidence: RealityEvidence;
    persisted: boolean;
}>;
/**
 * 给一条 reality evidence 追加 `referencedBy`。
 *
 * 返回**带原因的三态**（v1.15.61）：旧版把所有异常压成 `null`，调用方渲染成
 * 「（无 reality evidence X）」—— **把「工具报错/坏件」当成「不存在」**。
 * 一条存在的证据若因缺 `referencedBy` 字段（旧版本/手工编辑）而抛错，读的人会以为它根本没被登记过。
 */
export declare const referenceEvidence: (fs: any, ws: string, id: string, observerId: string) => Promise<{
    evidence: RealityEvidence | null;
    reason?: "not_found" | "unreadable";
}>;
/** 读全部 reality evidence，并**区分「还没有」与「读不出」**（v1.15.61，与 registry/claims 同型）。 */
export declare const readRealityEvidenceDetailed: (fs: any, ws: string) => Promise<{
    evidence: RealityEvidence[];
    corrupt: number;
}>;
export declare const readRealityEvidence: (fs: any, ws: string) => Promise<RealityEvidence[]>;
export declare const renderRealityEvidence: (ev: RealityEvidence) => string;
