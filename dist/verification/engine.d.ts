import type { VerificationRun, DriftReport } from "./types.js";
export declare const runVerification: (fs: any, root: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    run?: VerificationRun;
    report?: DriftReport;
}>;
