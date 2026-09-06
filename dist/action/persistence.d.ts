import type { ActionExecution, ActionFeedback } from "./types.js";
export declare const writeExecution: (fs: any, ws: string, e: ActionExecution) => Promise<void>;
export declare const writeFeedback: (fs: any, ws: string, f: ActionFeedback) => Promise<void>;
