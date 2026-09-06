import type { ForgottenRecord, RecallEvent } from "../types/index.js";
export declare const writeForgottenRecord: (fs: any, ws: string, r: ForgottenRecord) => Promise<void>;
export declare const readForgottenRecord: (fs: any, ws: string, id: string) => Promise<ForgottenRecord | null>;
export declare const writeRecallEvent: (fs: any, ws: string, e: RecallEvent) => Promise<void>;
