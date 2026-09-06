import type { ForgottenRecord, RecallEvent, RecallValidation } from "../types/index.js";
export declare const buildForgottenRecord: (args: any) => {
    ok: boolean;
    reason?: string;
    record?: ForgottenRecord;
};
export declare const buildRecallEvent: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    ev?: RecallEvent;
}>;
export declare const validateRecall: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    result?: RecallValidation;
}>;
