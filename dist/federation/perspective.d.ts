import type { FederatedPerspective } from "./types.js";
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
