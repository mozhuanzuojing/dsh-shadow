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
        indexCache: new Map(),
        indexCacheWarm: new Set(),
        indexDirty: new Set(),
        MAX_PENDING: 60,
        forgetCfg: config.forget ?? {},
        compactCfg: config.compact ?? {},
        summaryCfg: config.summary ?? {},
        recallCfg: config.recall ?? {},
        retentionCfg: config.retention ?? {},
        episodeCfg,
        writeConsent: config.writeConsent === true,
        episodeGap: Math.max(0, Number(episodeCfg.gapMinutes) || 60),
        episodeShow: Math.max(0, Number(episodeCfg.showInIndex) || 8),
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
