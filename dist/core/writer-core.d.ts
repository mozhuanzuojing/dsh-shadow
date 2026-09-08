import type { ShadowConfig } from "./types.js";
export interface WriterCore {
    context: any;
    config: ShadowConfig;
    getAgentById: (id: string | undefined) => any;
    pending: Map<string, any[]>;
    comps: Map<string, string[]>;
    goalByAgent: Map<string, string>;
    cwdBySession: Map<string, string>;
    lastFlushError: {
        at: number;
        err: string;
    } | undefined;
    indexCache: Map<string, Map<string, any>>;
    indexCacheWarm: Set<string>;
    indexDirty: Set<string>;
    MAX_PENDING: number;
    forgetCfg: Record<string, any>;
    compactCfg: Record<string, any>;
    summaryCfg: Record<string, any>;
    recallCfg: Record<string, any>;
    retentionCfg: Record<string, any>;
    episodeCfg: Record<string, any>;
    writeConsent: boolean;
    episodeGap: number;
    episodeShow: number;
}
export declare function createWriterCore(opts: {
    context: any;
    config: ShadowConfig;
    getAgentById: (id: string | undefined) => any;
}): WriterCore;
export declare function routeFor(core: WriterCore, cfg?: any): {
    provider: string;
    model: string;
} | undefined;
