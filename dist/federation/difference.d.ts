import type { FederatedPerspective, ObserverDifference } from "./types.js";
export declare const differenceOf: (pa: FederatedPerspective, pb: FederatedPerspective, realityEvidenceRef: string) => ObserverDifference;
export declare const renderDifference: (d: ObserverDifference) => string;
