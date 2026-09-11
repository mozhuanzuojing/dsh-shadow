import type { RepresentationGraph } from "../types.js";
export declare const writeGraph: (fs: any, ws: string, g: RepresentationGraph) => Promise<void>;
/** 读**最新**的一份 world 快照（按日期目录降序取第一份；无 → null）。 */
export declare const readGraph: (fs: any, ws: string) => Promise<RepresentationGraph | null>;
