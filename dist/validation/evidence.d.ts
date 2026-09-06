import type { FutureEvidence } from "./types.js";
import type { Hypothesis } from "../dream/types.js";
export declare const writeHypothesis: (fs: any, ws: string, h: Hypothesis) => Promise<void>;
export declare const readHypothesis: (fs: any, ws: string, id: string) => Promise<Hypothesis | null>;
export declare const registerFutureEvidence: (fs: any, ws: string, ev: {
    hypothesisId: string;
    observedAt: string;
    actualOutcome: string;
    observationType: string;
    sourceTraceIds?: string[];
    createdAt?: string;
    id?: string;
}) => Promise<FutureEvidence>;
export declare const readFutureEvidence: (fs: any, ws: string, hypothesisId?: string) => Promise<FutureEvidence[]>;
