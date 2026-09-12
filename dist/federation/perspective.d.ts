import type { FederatedPerspective } from "./types.js";
/**
 * 「没传确信值」时的默认值 —— **唯一来源**（v1.15.61）。
 *
 * 此前同一个默认值写在两处（本文件 `?? 0.5` 与 `query/federation.ts:35` 的 `Number(x) || 0.5`），
 * 而两者对 **`0`** 给出**不同答案**：显式传 `0`（「零确信」）会被 `||` 静默改成 0.5。
 * 默认值只该在「**没传**」时生效 ⇒ 判定用 `undefined` 检查，不靠 falsy。
 */
export declare const CONFIDENCE_DEFAULT = 0.5;
/** 只认「没传 ⇒ 默认」；显式 `0` 原样保留；非法值归 0（**不伪装成 0.5**）。 */
export declare const confidenceOfInput: (v: unknown) => number;
export declare const perspectiveOf: (opts: {
    observerId: string;
    temporalReference?: string;
    observationClaim: string;
    lens?: string;
    visible?: string[];
    hidden?: string[];
    distortion?: string[];
    observationConfidence?: number;
    validationConfidence?: number;
    validationHistoryRef?: string[];
}) => FederatedPerspective;
export declare const renderPerspective: (p: FederatedPerspective) => string;
export declare const perspectiveIsClean: (p: FederatedPerspective) => {
    ok: boolean;
    reasons: string[];
};
