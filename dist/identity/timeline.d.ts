import type { IdentityModel } from "./types.js";
export declare const identityV1Of: (fs: any, ws: string, agentId?: string) => Promise<IdentityModel>;
export declare const nextVersion: (v: string) => string;
export declare const readIdentityVersions: (fs: any, ws: string) => Promise<IdentityModel[]>;
export declare const readCurrentIdentity: (fs: any, ws: string, agentId?: string) => Promise<IdentityModel>;
export declare const writeIdentityVersion: (fs: any, ws: string, model: IdentityModel) => Promise<void>;
export declare const renderIdentityModel: (m: IdentityModel) => string;
