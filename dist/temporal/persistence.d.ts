import type { TemporalGraph } from "./types.js";
export declare const writeTemporalGraph: (fs: any, ws: string, graph: TemporalGraph) => Promise<void>;
/** 读**最新**的一份 temporal 快照（按日期目录降序取第一份；无 → null）。 */
export declare const readTemporalGraph: (fs: any, ws: string) => Promise<TemporalGraph | null>;
