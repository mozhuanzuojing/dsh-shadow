import { numOr } from "./util.js";
/**
 * 记一条降级留痕。**这是写台账的唯一入口**（判据收一处）。
 *
 * 为什么参数是 `(core, capability, reason, effect)` 而不是一个对象：调用点大多在
 * `catch`/早退分支里，短签名让「提前 return 之前顺手留痕」这件事足够便宜 ——
 * ADR-0049 失效的真实原因从来不是「不知道要留痕」，而是**留痕比 return 麻烦**。
 */
export const noteDegrade = (core, capability, reason, effect) => {
    core.degrade.set(capability, { at: Date.now(), capability, reason, effect });
};
export function createWriterCore(opts) {
    const { context, config, getAgentById } = opts;
    const episodeCfg = config.episodes ?? {};
    return {
        context,
        config,
        getAgentById,
        pending: new Map(),
        comps: new Map(),
        goalByAgent: new Map(),
        cwdBySession: new Map(),
        lastFlushError: undefined,
        lastIndexError: undefined,
        lastMetaError: undefined,
        indexCache: new Map(),
        indexCacheWarm: new Set(),
        indexDirty: new Set(),
        indexFingerprint: new Map(),
        degrade: new Map(),
        MAX_PENDING: 60,
        forgetCfg: config.forget ?? {},
        compactCfg: config.compact ?? {},
        summaryCfg: config.summary ?? {},
        recallCfg: config.recall ?? {},
        retentionCfg: config.retention ?? {},
        episodeCfg,
        writeConsent: config.writeConsent === true,
        // T8-B（v1.15.64）：`|| 60` / `|| 8` 会把**显式 0** 与「未传」混为一谈 ⇒ 改用 `numOr`。
        // `showInIndex: 0` 的含义是「_index.md 不列 Episodes 段」，此前被吞成 8 ⇒
        // `writer-materialize.ts:212` 的 `episodeShow > 0` 恒真 = **死分支**（那个开关不存在）。
        episodeGap: numOr(episodeCfg.gapMinutes, 60),
        episodeShow: numOr(episodeCfg.showInIndex, 8),
        abstractCfg: config.abstracts ?? {},
    };
}
// 路由推导：显式 provider/model，否则取 agentDefaultModel.currentSelection()。与 writer.ts 原实现逐字一致。
export function routeFor(core, cfg = core.summaryCfg) {
    const explicit = cfg.provider && cfg.model ? { provider: cfg.provider, model: cfg.model } : undefined;
    if (explicit)
        return explicit;
    try {
        const sel = core.context.get("agentDefaultModel")?.currentSelection();
        return sel?.provider && sel?.model ? { provider: sel.provider, model: sel.model } : undefined;
    }
    catch {
        return undefined;
    }
}
