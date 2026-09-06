import type { AdaptationContext, AdaptationChange, AdaptationValidation } from "../types/index.js";
export declare const buildAdaptationContext: (args: any) => {
    ok: boolean;
    reason?: string;
    ctx?: AdaptationContext;
};
export declare const buildAdaptationChange: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    change?: AdaptationChange;
}>;
export declare const validateAdaptation: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    validation?: AdaptationValidation;
}>;
