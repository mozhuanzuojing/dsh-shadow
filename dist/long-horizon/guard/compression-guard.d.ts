import type { HistorySummary } from "../types/index.js";
export declare const summaryNoRealityField: (s: HistorySummary) => boolean;
export declare const assertSummaryNoRealityField: (s: HistorySummary) => {
    ok: boolean;
    reason: string;
};
