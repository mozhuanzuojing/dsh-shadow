import type { PerspectiveState } from "./types.js";
import type { RealityEvidence } from "./types.js";
export declare const perspectiveStateOf: (ev: RealityEvidence | null, hasValidation: boolean) => PerspectiveState;
export declare const renderStability: (state: PerspectiveState) => string;
