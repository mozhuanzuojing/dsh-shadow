import type { ShadowConfig } from "./types.js";
/**
 * 一条**能力降级**留痕（T8-A / ADR-0049）。
 *
 * `effect` 不是可选的：ADR-0049 要的是「**可见**」，而可见的前提是说清**丢了什么** ——
 * 一句「llmRecall failed」对读者没有用，因为他还得自己推断这会导致什么。
 */
export interface DegradeNote {
    at: number;
    /** 能力标识（同时是台账的键，同类覆盖）。 */
    capability: string;
    /** 为什么降级（缺件 / 失败原因）。 */
    reason: string;
    /** 对使用者的**后果**（他读到的东西少了什么 / 可能错在哪）。 */
    effect: string;
}
/**
 * 记一条降级留痕。**这是写台账的唯一入口**（判据收一处）。
 *
 * 为什么参数是 `(core, capability, reason, effect)` 而不是一个对象：调用点大多在
 * `catch`/早退分支里，短签名让「提前 return 之前顺手留痕」这件事足够便宜 ——
 * ADR-0049 失效的真实原因从来不是「不知道要留痕」，而是**留痕比 return 麻烦**。
 */
export declare const noteDegrade: (core: WriterCore, capability: string, reason: string, effect: string) => void;
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
    /**
     * **能力降级台账**（T8-A / ADR-0049，v1.15.65）：某能力退到后备路径时留一条痕，
     * 由 `core/writer.ts` 的 `getFlushWarn()` 渲染成**可见信号**。
     *
     * 为什么要有它：ADR-0049 要求「缺件/失败必须有**至少一条**可见信号（`unavailable` 状态 /
     * flush warn / debug trace）—— `console.log` **不算**」。而本仓此前有多处降级
     * **连 log 都没有**：最彻底的一例是 `streamText` 的 `label: ""` 让它的 catch 分支静默，
     * 于是「LLM 召回没生效」与「本来就没配」在输出里**完全不可区分**。
     *
     * 设计取舍（三条，都是为了不制造新噪音）：
     *   · **按能力覆盖**（`Map` 的键是能力名）—— 同类只留**最新**一条；否则每回合追加会把横幅刷爆，
     *     而「一直坏着」和「刚刚坏」对读者是同一件事，刷屏只会让信号变成噪音（ADR-0049 的反面）。
     *   · 放在 `WriterCore` 而不是模块级单例 —— 它必须随插件实例销毁，否则多会话互相污染。
     *   · **只在降级时写**，`getFlushWarn()` 也只在有记录时才渲染 ⇒ 健康路径的输出**逐字节不变**。
     *     这一点由 `test/t8-silent-degradation.test.ts` 的正/负对照锁住。
     */
    degrade: Map<string, DegradeNote>;
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
