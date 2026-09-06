import type { ObserverConfig, ObserverBoundary, RecallIndex, ContinuityRecord, WorkspaceRecord } from "./types.js";
export declare const buildObserverConfig: (args: any) => {
    ok: boolean;
    reason?: string;
    config?: ObserverConfig;
};
export declare const buildObserverBoundary: (args: any) => {
    ok: boolean;
    reason?: string;
    boundary?: ObserverBoundary;
};
export declare const buildRecallIndex: (args: any) => {
    ok: boolean;
    reason?: string;
    index?: RecallIndex;
};
export declare const buildLineage: (args: any) => {
    ok: boolean;
    reason?: string;
    record?: ContinuityRecord;
};
export declare const buildWorkspaceRecord: (args: any) => {
    ok: boolean;
    reason?: string;
    record?: WorkspaceRecord;
};
export declare const readObserverContext: (fs: any, root: string) => Promise<{
    boundary: ObserverBoundary;
    lineage: ContinuityRecord;
    index: RecallIndex;
}>;
export declare const readWorkspaceContext: (fs: any, ws: string) => Promise<any[]>;
export declare const readContinuityIndex: (fs: any, root: string) => Promise<RecallIndex>;
