import type { RealityObservation } from "./types.js";
export declare const observationOf: (opts: {
    observedAt?: string;
    subjectRef?: string;
    sourcePerspectives: string[];
    observation: string;
    temporalContext?: string;
    validationRefs?: string[];
}) => RealityObservation;
export declare const renderObservation: (ro: RealityObservation) => string;
