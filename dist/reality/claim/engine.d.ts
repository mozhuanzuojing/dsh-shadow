import type { RealityClaim, RealityObservation } from "../types.js";
export declare const claimOf: (opts: {
    observations: RealityObservation[];
    validations?: {
        id: string;
        outcome: string;
    }[];
    id?: string;
}) => RealityClaim | null;
export declare const renderClaim: (c: RealityClaim) => string;
