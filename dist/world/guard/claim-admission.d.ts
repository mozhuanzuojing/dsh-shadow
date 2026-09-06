import type { RealityClaim } from "../../reality/types.js";
import type { RepresentationObject } from "../types.js";
export declare const isAdmissibleClaim: (c: RealityClaim) => boolean;
export interface AdmissionResult {
    ok: boolean;
    reasons: string[];
    object?: RepresentationObject;
}
export declare const createRepresentationFromClaims: (claims: RealityClaim[]) => AdmissionResult;
export declare const renderAdmission: (r: AdmissionResult) => string;
