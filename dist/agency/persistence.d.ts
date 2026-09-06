import type { AgencyContext, AgencyBoundaryEvent } from "./types.js";
export declare const writeAgencyContext: (fs: any, ws: string, ctx: AgencyContext) => Promise<void>;
export declare const writeAgencyEvent: (fs: any, ws: string, e: AgencyBoundaryEvent) => Promise<void>;
