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
    /** 索引重建失败（读侧据此提示「你读到的索引可能是旧的」）。与 lastFlushError 分开：这是**读路径**的失败。 */
    lastIndexError: {
        at: number;
        err: string;
    } | undefined;
    /** 元数据（`_meta.json`）登记失败：记忆文件已写入但 meta 没有它 ⇒ hits/生命周期/遗忘判据都看不到。 */
    lastMetaError: {
        at: number;
        err: string;
    } | undefined;
    indexCache: Map<string, Map<string, any>>;
    indexCacheWarm: Set<string>;
    indexDirty: Set<string>;
    /**
     * `_index.md` 构建时**所见源的指纹**（ADR-0069）。
     *
     * 为什么必须有它：`indexDirty` 是**进程内**的 Set，只能反映**本进程**的写入。
     * 而记忆文件是 source of truth，**别的会话 / 子代理写入的记忆本进程的 dirty 永远看不到**
     * ⇒ 一旦缓存预热，`_index.md` 就再也不更新（实测：`_index.md` 停在 09:34:01，
     * 之后 623 条新记忆对索引不可见，而主题召回走 `listMemories` 读盘看得见 —— 两条读路径可见性分歧 8.54%）。
     * ⇒ 新鲜度必须问**源**，不能只问进程。
     */
    indexFingerprint: Map<string, string>;
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
    /** 目录级 L0/L1 sidecar（ADR-0065 / D6，v1.15.35）：默认**开**（派生物，见下）。 */
    abstractCfg: Record<string, any>;
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
