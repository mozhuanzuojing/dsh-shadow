import type { AgencyContext, AgencySelection, AgencyBoundaryEvent } from "./types.js";
export declare const buildAgencyContext: (args: any) => {
    ok: boolean;
    reason?: string;
    ctx?: AgencyContext;
};
export declare const pickAgencySelection: (args: any) => {
    ok: boolean;
    reject?: string;
    sel?: AgencySelection;
};
export declare const buildAgencyEvent: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    ev?: AgencyBoundaryEvent;
}>;
