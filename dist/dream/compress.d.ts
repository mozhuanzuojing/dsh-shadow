import type { DreamPattern, Hypothesis, DreamResult } from "./types.js";
export declare const detectPatterns: (traces: any[]) => DreamPattern[];
export declare const hypothesize: (p: DreamPattern, observerId: string) => Hypothesis;
export declare const offlineCompression: (fs: any, ws: string, window: {
    observerId: string;
    from?: string;
    to?: string;
}) => Promise<DreamResult>;
export declare const buildDreamArtifact: (fs: any, ws: string, window: SleepWindowArg, result: DreamResult) => Promise<{
    id: string;
    observerId: string;
    sleepWindowId: string;
    sourceTemporalGraphVersion: string;
    sourceNodeIds: string[];
    sourceEdgeIds: string[];
    compressionMethod: string;
    patterns: DreamPattern[];
    generatedHypothesisIds: string[];
    createdAt: string;
}>;
interface SleepWindowArg {
    id?: string;
    observerId: string;
    from?: string;
    to?: string;
}
export declare const renderDreamResult: (r: DreamResult) => string;
export {};
