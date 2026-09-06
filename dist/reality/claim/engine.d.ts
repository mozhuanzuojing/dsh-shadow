import type { RealityClaim, RealityObservation } from "../types.js";
export declare const OBSERVABLE_PREDICATES: Set<string>;
export declare const isObservablePredicate: (p: string) => boolean;
export declare const claimOf: (opts: {
    observations: RealityObservation[];
    validations?: {
        id: string;
        outcome: string;
    }[];
    id?: string;
}) => RealityClaim | null;
export declare const renderClaim: (c: RealityClaim) => string;
