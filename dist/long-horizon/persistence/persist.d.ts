import type { InteractionContext, HistorySummary, HistoryContinuityEvent, InteractionAdaptationLink } from "../types/index.js";
export declare const writeInteractionContext: (fs: any, ws: string, c: InteractionContext) => Promise<void>;
export declare const writeHistorySummary: (fs: any, ws: string, s: HistorySummary) => Promise<void>;
export declare const writeContinuityEvent: (fs: any, ws: string, e: HistoryContinuityEvent) => Promise<void>;
export declare const writeInteractionAdaptationLink: (fs: any, ws: string, l: InteractionAdaptationLink) => Promise<void>;
