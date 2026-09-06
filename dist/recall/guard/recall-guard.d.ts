import type { ForgottenRecord, RecallEvent } from "../types/index.js";
export declare const forgottenHasNoDeletion: (r: ForgottenRecord) => boolean;
export declare const assertForgottenNoDeletion: (r: ForgottenRecord) => {
    ok: boolean;
    reason: string;
};
export declare const triggerIsExternal: (t: {
    type?: string;
    sourceRef?: string;
}) => boolean;
export declare const assertTriggerExternal: (t: {
    type?: string;
    sourceRef?: string;
}) => {
    ok: boolean;
    reason: string;
};
export declare const recallLineageComplete: (ev: RecallEvent) => boolean;
export declare const assertRecallLineage: (ev: RecallEvent) => {
    ok: boolean;
    reason: string;
};
export declare const recallNotObservation: (ev: RecallEvent) => boolean;
export declare const assertRecallNotObservation: (ev: RecallEvent) => {
    ok: boolean;
    reason: string;
};
export declare const recallDoesNotIncreaseCertainty: (status: string) => boolean;
export declare const assertRecallNoStatusIncrease: (status: string) => {
    ok: boolean;
    reason: string;
};
