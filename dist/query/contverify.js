// dsh-shadow —— query/contverify.ts：Observer Continuity + Runtime Verification 读/写 seam。
// 从 query/query.ts 迁出的 v1.0.1/v1.0.2 分支：Global(observer 层)/Workspace(world 层) 双层边界
// （config/boundary/recall-index/lineage 存全局，workspace-record 存工作区），以及只读只报的 verify。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runContVerify(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { DEFAULT_OBSERVER_ROOT, writeObserverConfig, writeObserverBoundary, writeRecallIndex, writeLineage, writeWorkspaceRecord } from "../continuity/persist.js";
import { buildObserverConfig, buildObserverBoundary, buildRecallIndex, buildLineage, buildWorkspaceRecord, readObserverContext, readWorkspaceContext, readContinuityIndex } from "../continuity/engine.js";
import { renderObserverContext as renderContinuityObserverContext, renderWorkspaceContext, renderContinuityIndex } from "../continuity/render.js";
import { runVerification } from "../verification/engine.js";
import { renderRun, renderReport } from "../verification/render.js";
const CONT_MODES = new Set([
    "observer-config",
    "observer-boundary",
    "recall-index",
    "observer-lineage",
    "workspace-record",
    "observer-context",
    "workspace-context",
    "continuity-index",
    "verify",
]);
/** Returns the rendered body for a continuity/verify mode, or undefined if not one of this family. */
export async function runContVerify(deps, args, ctx) {
    const mode = String(args?.mode || "");
    if (!CONT_MODES.has(mode))
        return undefined;
    const { fs, ws, flushWarn } = ctx;
    // v1.0.1 Observer Continuity Storage Boundary：Global(observer 层)/Workspace(world 层) 双层，不可混合。
    // 关系 Constraint ⊃ Context，非 Memory Union；全局只存 config/boundary/recall-index/lineage。
    const obsRoot = String(deps.config.observerGlobalRoot || "") ? String(deps.config.observerGlobalRoot) : DEFAULT_OBSERVER_ROOT;
    if (mode === "observer-config") {
        const c = buildObserverConfig(args);
        if (!c.ok || !c.config)
            return scrubFinal(RECALL_PREFIX + "[ObserverConfig Rejected] " + c.reason + flushWarn);
        await writeObserverConfig(fs, obsRoot, c.config);
        return scrubFinal(RECALL_PREFIX + `[Observer Config] ${c.config.interactionStyle} · ${c.config.outputPreference} · ${c.config.defaultProtocol}` + flushWarn);
    }
    if (mode === "observer-boundary") {
        const b = buildObserverBoundary(args);
        if (!b.ok || !b.boundary)
            return scrubFinal(RECALL_PREFIX + "[ObserverBoundary Rejected] " + b.reason + flushWarn);
        await writeObserverBoundary(fs, obsRoot, b.boundary);
        return scrubFinal(RECALL_PREFIX + `[Observer Boundary] planningNoObjective ${b.boundary.planningCannotCreateObjective} · recallNoKnowledge ${b.boundary.recallCannotCreateKnowledge} · adaptNoAuthority ${b.boundary.adaptationCannotIncreaseAuthority}` + flushWarn);
    }
    if (mode === "recall-index") {
        const i = buildRecallIndex(args);
        if (!i.ok || !i.index)
            return scrubFinal(RECALL_PREFIX + "[RecallIndex Rejected] " + i.reason + flushWarn);
        await writeRecallIndex(fs, obsRoot, i.index);
        return scrubFinal(RECALL_PREFIX + renderContinuityIndex(i.index) + flushWarn);
    }
    if (mode === "observer-lineage") {
        const l = buildLineage(args);
        if (!l.ok || !l.record)
            return scrubFinal(RECALL_PREFIX + "[ObserverLineage Rejected] " + l.reason + flushWarn);
        await writeLineage(fs, obsRoot, l.record);
        return scrubFinal(RECALL_PREFIX + `[Observer Lineage] observer ${l.record.observerId} · ref ${l.record.continuityRef}` + flushWarn);
    }
    if (mode === "workspace-record") {
        const r = buildWorkspaceRecord(args);
        if (!r.ok || !r.record)
            return scrubFinal(RECALL_PREFIX + "[WorkspaceRecord Rejected] " + r.reason + flushWarn);
        await writeWorkspaceRecord(fs, ws, r.record);
        return scrubFinal(RECALL_PREFIX + `[Workspace Record] ${r.record.kind} · ${r.record.content} · ws ${r.record.workspace}` + flushWarn);
    }
    if (mode === "observer-context") {
        const ctx2 = await readObserverContext(fs, obsRoot);
        return scrubFinal(RECALL_PREFIX + renderContinuityObserverContext(ctx2) + flushWarn);
    }
    if (mode === "workspace-context") {
        const rows = await readWorkspaceContext(fs, String(args?.workspace || ws));
        return scrubFinal(RECALL_PREFIX + renderWorkspaceContext(rows) + flushWarn);
    }
    if (mode === "continuity-index") {
        const ri = await readContinuityIndex(fs, obsRoot);
        return scrubFinal(RECALL_PREFIX + renderContinuityIndex(ri) + flushWarn);
    }
    // v1.0.2 Observer Runtime Verification Foundation：VerificationRun / InvariantCheck / DriftReport。
    // 验证只读只报；Verification≠Optimization（237）/不可改authority(238)/不可改identity(239)/DriftReport≠RealityClaim(240)。
    const v = await runVerification(fs, obsRoot, args);
    if (!v.ok || !v.run || !v.report)
        return scrubFinal(RECALL_PREFIX + "[Verification Rejected] " + v.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderRun(v.run) + "\n" + renderReport(v.report) + flushWarn);
}
