import type { TemporalGraph } from "./types.js";
export interface TemporalRange {
    from?: string;
    to?: string;
}
export declare const buildTemporalGraph: (fs: any, ws: string, range?: TemporalRange) => Promise<TemporalGraph>;
