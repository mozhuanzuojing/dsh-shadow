import type { AdaptationContext, AdaptationChange, AdaptationValidation } from "../types/index.js";
export declare const writeAdaptationContext: (fs: any, ws: string, c: AdaptationContext) => Promise<void>;
export declare const writeAdaptationChange: (fs: any, ws: string, ch: AdaptationChange) => Promise<void>;
export declare const writeAdaptationValidation: (fs: any, ws: string, v: AdaptationValidation) => Promise<void>;
