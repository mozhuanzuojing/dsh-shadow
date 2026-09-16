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
/**
 * **派生索引的写侧精确信号**（T17-B D6 门③）：记下「这个 rel 的内容变了」。
 *
 * 为什么必须有它（`fs-cost-findings.md` Q5 实测）：目录级令牌对**已存在文件的原地改内容**必然漏报
 * （长度变与不变都漏），而 `core/writer-materialize.ts` 的 `patchSummary` **就是**原地改写同一个文件
 * ⇒ 纯粗信号会把这次变更**永远漏掉**（静默陈旧，没有任何信号）。写侧是本进程内唯一知道这件事的地方。
 *
 * 键是 `ws|rel`：同一份记忆在不同工作区是两件事；**随实例销毁**（不做模块级单例，同 `degrade` 台账的纪律）。
 */
export const markDerivedDirty = (core, ws, rel) => {
    if (!ws || !rel)
        return;
    core.derivedDirty.add(`${ws}|${rel}`);
};
/** 取某工作区下**已知变更**的 rel 列表（读侧用；顺序按插入序，调用方不应依赖顺序）。 */
export const dirtyRelsFor = (core, ws) => {
    const prefix = `${ws}|`;
    const out = [];
    for (const k of core.derivedDirty)
        if (k.startsWith(prefix))
            out.push(k.slice(prefix.length));
    return out;
};
/**
 * 消费一批 dirty（**只有成功并入索引之后才允许调**，见 `WriterCore.derivedDirty` 的注释）。
 * 按 `ws|rel` **精确删**：不能整表清空 —— 那会连带丢掉别的 rel 尚未并入的变更。
 */
export const clearDerivedDirty = (core, ws, rels) => {
    for (const rel of rels)
        core.derivedDirty.delete(`${ws}|${rel}`);
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
        derivedDirty: new Set(),
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
