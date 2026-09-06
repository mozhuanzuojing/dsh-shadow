import type { InteractionContext, HistorySummary, HistoryContinuityEvent, InteractionAdaptationLink } from "../types/index.js";
export declare const buildInteractionContext: (args: any) => {
    ok: boolean;
    reason?: string;
    ctx?: InteractionContext;
};
export declare const buildHistorySummary: (args: any) => {
    ok: boolean;
    reason?: string;
    summary?: HistorySummary;
};
export declare const buildContinuityEvent: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    event?: HistoryContinuityEvent;
}>;
export declare const buildInteractionAdaptationLink: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    link?: InteractionAdaptationLink;
}>;
