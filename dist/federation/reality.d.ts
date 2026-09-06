import type { RealityEvidence } from "./types.js";
export declare const registerRealityEvidence: (fs: any, ws: string, ev: {
    observedAt?: string;
    source: string;
    observation: string;
    linkedHypothesis?: string[];
}) => Promise<RealityEvidence>;
export declare const referenceEvidence: (fs: any, ws: string, id: string, observerId: string) => Promise<RealityEvidence | null>;
export declare const readRealityEvidence: (fs: any, ws: string) => Promise<RealityEvidence[]>;
export declare const renderRealityEvidence: (ev: RealityEvidence) => string;
