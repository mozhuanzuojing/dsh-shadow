import type { Identity } from "../core/types.js";
export declare const readIdentity: (fs: any, ws: string, fallbackId?: string) => Promise<Identity>;
export declare const renderIdentity: (i: Identity) => string;
