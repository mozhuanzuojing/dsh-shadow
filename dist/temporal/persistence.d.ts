import type { TemporalGraph } from "./types.js";
export declare const writeTemporalGraph: (fs: any, ws: string, graph: TemporalGraph) => Promise<void>;
export declare const readTemporalGraph: (fs: any, ws: string) => Promise<TemporalGraph | null>;
