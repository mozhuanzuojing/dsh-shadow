import type { InteractionContext, HistorySummary, HistoryContinuityEvent, InteractionAdaptationLink } from "../types/index.js";
export declare const renderContext: (ctx: InteractionContext) => string;
export declare const renderSummary: (s: HistorySummary) => string;
export declare const renderEvent: (e: HistoryContinuityEvent) => string;
export declare const renderLink: (l: InteractionAdaptationLink) => string;
