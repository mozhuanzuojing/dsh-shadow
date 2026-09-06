import type { RealityClaim } from "../types.js";
export declare const writeClaim: (fs: any, ws: string, c: RealityClaim) => Promise<void>;
export declare const readClaims: (fs: any, ws: string) => Promise<RealityClaim[]>;
