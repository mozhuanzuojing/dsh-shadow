import type { ObserverBoundary, RecallIndex, ContinuityRecord } from "./types.js";
export declare const renderObserverContext: (data: {
    boundary: ObserverBoundary | null;
    lineage: ContinuityRecord | null;
    index: RecallIndex | null;
}) => string;
export declare const renderWorkspaceContext: (rows: any[]) => string;
export declare const renderContinuityIndex: (ri: RecallIndex | null) => string;
