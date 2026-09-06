import type { RepresentationGraph } from "../types.js";
export declare const writeGraph: (fs: any, ws: string, g: RepresentationGraph) => Promise<void>;
export declare const readGraph: (fs: any, ws: string) => Promise<RepresentationGraph | null>;
