// dsh-shadow —— query/contverify.ts：Observer Continuity + Runtime Verification 读/写 seam。
// 从 query/query.ts 迁出的 v1.0.1/v1.0.2 分支：Global(observer 层)/Workspace(world 层) 双层边界
// （config/boundary/recall-index/lineage 存全局，workspace-record 存工作区），以及只读只报的 verify。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runContVerify(deps,args,ctx)；返回 undefined 表示非本族 mode。
//
// ## P0 修复（v1.22.x）：**写侧失败不再冒充成功**（ADR-0049 规则 2/3 + ADR-0085）
//
// 旧形态：`await writeObserverConfig(fs, obsRoot, c.config)` —— 契约是 `Promise<void>`、内部
// `catch { console.log(...) }`，而下一行**无条件**渲染 `[Observer Config] <style> · <pref> · <proto>`。
// ⇒ 写失败与写成功**逐字相同**：读者据此认为「已配置」，而 `mode:"observer-context"` 下一次读返回空。
// 这不是「降级」，是**冒充成功**（ADR-0049 规则 3）。`console.log` **不算**可见信号（ADR-0085）。
//
// 现在四个写模式（config / boundary / recall-index / lineage）与 workspace-record：
//   ① 写失败 ⇒ 在**同一段输出**里给「未落盘 + 真实原因 + 后果」，并额外经 `deps.noteDegrade`
//      进能力降级台账（下一次读的横幅也带着它，事实是持久的，不是一次性的）；
//   ② **每次都打印实际写入的根**（B10）：`observerGlobalRoot` 未配置时回落 `os.homedir()/.dsh-observer`
//      —— 那在**工作区之外**、不进任何沙箱围栏、也不随工作区走，而旧输出一个字都不提写到哪；
//      回落时显式声明「未配置 ⇒ 使用默认根」，与 `core/scope.ts` 对 `DEFAULT_SHADOW_ROOT` 的处置同一判据。
import { RECALL_PREFIX } from "../core/util.js";
import { WORKSPACE_SHADOW_ROOT } from "../core/paths.js";
import { scrubFinal } from "../security/scrub.js";
import { DEFAULT_OBSERVER_ROOT, writeObserverConfig, writeObserverBoundary, writeRecallIndex, writeLineage, writeWorkspaceRecord } from "../trajectory/continuity/persist.js";
import { buildObserverConfig, buildObserverBoundary, buildRecallIndex, buildLineage, buildWorkspaceRecord, readObserverContext, readWorkspaceContext, readContinuityIndex } from "../trajectory/continuity/engine.js";
import { renderObserverContext as renderContinuityObserverContext, renderWorkspaceContext, renderContinuityIndex } from "../trajectory/continuity/render.js";
import { unwrittenWarn, readCauseWarn } from "./degrade.js";
import { runVerification } from "../epistemic/verification/engine.js";
import { renderRun, renderReport } from "../epistemic/verification/render.js";
import type { PersistOutcome, ReadOutcome } from "../persistence/outcomes.js";
import type { ShadowQueryDeps } from "./types.js";

export interface ContVerifyCtx {
  fs: any;
  ws: string;
  flushWarn: string;
}

const CONT_MODES = new Set([
  "observer-config",
  "observer-boundary",
  "recall-index",
  "observer-lineage",
  "workspace-record",
  "observer-context",
  "workspace-context",
  "continuity-index",
  "verification",
]);

/**
 * **写失败 ⇒ 读者可见的一段**（措辞收在 `query/degrade.ts`；本文件五个写模式共用同一份效果说明）。
 *
 * 为什么必须在这里说、而不是只进台账：本函数**当场**就要渲染成功文案，读者在同一段输出里
 * 看到成功、却在台账（下一次读才渲染）里才看到失败 —— 那就是本 P0 的原形。
 */
const unwritten = (what: string, o: PersistOutcome, root: string, readerMode: string): string =>
  unwrittenWarn(what, o, `上面这段描述的只是**内存中的对象**：\`${root}\` 下并没有它，\`mode:"${readerMode}"\` 下次读到的仍是旧值或空值 —— 请先确认该根可写，勿把「按参数构造成功」当成「已落盘」。`);

/** **读不出来 ⇒ 读者可见的一段**（与「真的还没有」区分；ADR-0049）。 */
const readWarn = (what: string, o: ReadOutcome<any>): string =>
  readCauseWarn(what, o.reason, "下面显示的空/缺**不代表**「真的还没有」，处置不同 —— 先查该根的可读性（EACCES / 只读挂载 / 后端故障）。");

/** 实际写入根的那一行（B10：**每次都打印**；回落时显式声明）。 */
const rootLine = (root: string, fallbackNote?: string): string =>
  `\n> 根：\`${root}\`${fallbackNote ? `\n> ⚠ **${fallbackNote}**` : ""}`;

/** Returns the rendered body for a continuity/verify mode, or undefined if not one of this family. */
export async function runContVerify(deps: ShadowQueryDeps, args: any, ctx: ContVerifyCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!CONT_MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  // v1.0.1 Observer Continuity Storage Boundary：Global(observer 层)/Workspace(world 层) 双层，不可混合。
  // 关系 Constraint ⊃ Context，非 Memory Union；全局只存 config/boundary/recall-index/lineage。
  const configuredRoot = String(deps.config.observerGlobalRoot || "");
  const obsRoot = configuredRoot ? configuredRoot : DEFAULT_OBSERVER_ROOT;
  // 回落必须**可见**（B10）：未配置时写到工作区之外的默认根，输出里必须说明这一点。
  const obsFallback = configuredRoot ? undefined : `未配置 \`observerGlobalRoot\` ⇒ 使用默认根（位于工作区之外，换机/换盘会变）`;
  // 写侧降级同时进**持久**台账（下一次读的横幅也带着它）；本段输出由 `unwrittenWarn` 当场负责。
  const noteWriteFail = (what: string, o: PersistOutcome, readerMode: string) => {
    if (!o.ok) deps.noteDegrade?.("observerContinuity", `${what} 未落盘（${o.reason}）`, `\`mode:"${readerMode}"\` 读到的仍是旧值或空值；勿把「已按参数构造」当成「已落盘」`);
  };
  if (mode === "observer-config") {
    const c = buildObserverConfig(args);
    if (!c.ok || !c.config) return scrubFinal(RECALL_PREFIX + "[ObserverConfig Rejected] " + c.reason + flushWarn);
    const w = await writeObserverConfig(fs, obsRoot, c.config);
    noteWriteFail("observer config", w, "observer-context");
    return scrubFinal(RECALL_PREFIX + `[Observer Config] ${c.config.interactionStyle} · ${c.config.outputPreference} · ${c.config.defaultProtocol}` + rootLine(obsRoot, obsFallback) + unwritten("observer config", w, obsRoot, "observer-context") + flushWarn);
  }
  if (mode === "observer-boundary") {
    const b = buildObserverBoundary(args);
    if (!b.ok || !b.boundary) return scrubFinal(RECALL_PREFIX + "[ObserverBoundary Rejected] " + b.reason + flushWarn);
    const w = await writeObserverBoundary(fs, obsRoot, b.boundary);
    noteWriteFail("observer boundary", w, "observer-context");
    return scrubFinal(RECALL_PREFIX + `[Observer Boundary] planningNoObjective ${b.boundary.planningCannotCreateObjective} · recallNoKnowledge ${b.boundary.recallCannotCreateKnowledge} · adaptNoAuthority ${b.boundary.adaptationCannotIncreaseAuthority}` + rootLine(obsRoot, obsFallback) + unwritten("observer boundary", w, obsRoot, "observer-context") + flushWarn);
  }
  if (mode === "recall-index") {
    const i = buildRecallIndex(args);
    if (!i.ok || !i.index) return scrubFinal(RECALL_PREFIX + "[RecallIndex Rejected] " + i.reason + flushWarn);
    const w = await writeRecallIndex(fs, obsRoot, i.index);
    noteWriteFail("recall-index", w, "continuity-index");
    return scrubFinal(RECALL_PREFIX + renderContinuityIndex(i.index) + rootLine(obsRoot, obsFallback) + unwritten("recall-index", w, obsRoot, "continuity-index") + flushWarn);
  }
  if (mode === "observer-lineage") {
    const l = buildLineage(args);
    if (!l.ok || !l.record) return scrubFinal(RECALL_PREFIX + "[ObserverLineage Rejected] " + l.reason + flushWarn);
    const w = await writeLineage(fs, obsRoot, l.record);
    noteWriteFail("observer lineage", w, "observer-context");
    return scrubFinal(RECALL_PREFIX + `[Observer Lineage] observer ${l.record.observerId} · ref ${l.record.continuityRef}` + rootLine(obsRoot, obsFallback) + unwritten("observer lineage", w, obsRoot, "observer-context") + flushWarn);
  }
  if (mode === "workspace-record") {
    const r = buildWorkspaceRecord(args);
    if (!r.ok || !r.record) return scrubFinal(RECALL_PREFIX + "[WorkspaceRecord Rejected] " + r.reason + flushWarn);
    const w = await writeWorkspaceRecord(fs, ws, r.record);
    noteWriteFail("workspace record", w, "workspace-context");
    // world 层的根由记录自己携带（记录写到 `<workspace>/<WORKSPACE_SHADOW_ROOT>/<kind>/`，不是 ws 参数）。
    const wsRoot = `${r.record.workspace}/${WORKSPACE_SHADOW_ROOT}`;
    return scrubFinal(RECALL_PREFIX + `[Workspace Record] ${r.record.kind} · ${r.record.content} · ws ${r.record.workspace}` + rootLine(wsRoot) + unwritten("workspace record", w, wsRoot, "workspace-context") + flushWarn);
  }
  if (mode === "observer-context") {
    const ctx2 = await readObserverContext(fs, obsRoot);
    // 渲染器只认「值」（`null` = 无）：三态里「读不出来」这一支由下面的 `readWarn` 说 ——
    // 不能让它渲染成与「真的还没有」逐字相同的 `(无)` 而不出声（那正是 B4 要修的那个混淆）。
    const body = { boundary: ctx2.boundary.value, lineage: ctx2.lineage.value, index: ctx2.index.value };
    return scrubFinal(RECALL_PREFIX + renderContinuityObserverContext(body) + rootLine(obsRoot, obsFallback) + readWarn("observer/boundary.json", ctx2.boundary) + readWarn("lineage/continuity.json", ctx2.lineage) + readWarn("recall-index/index.json", ctx2.index) + flushWarn);
  }
  if (mode === "workspace-context") {
    const got = await readWorkspaceContext(fs, String(args?.workspace || ws));
    const wsRoot = `${String(args?.workspace || ws)}/${WORKSPACE_SHADOW_ROOT}`;
    const fail = got.readFailure ? `\n> ⚠ **world 层读不完整**（${got.readFailure}）：上面的列表只基于**读到的部分**。` : "";
    return scrubFinal(RECALL_PREFIX + renderWorkspaceContext(got.rows) + rootLine(wsRoot) + fail + flushWarn);
  }
  if (mode === "continuity-index") {
    const ri = await readContinuityIndex(fs, obsRoot);
    return scrubFinal(RECALL_PREFIX + renderContinuityIndex(ri.value) + rootLine(obsRoot, obsFallback) + readWarn("recall-index/index.json", ri) + flushWarn);
  }
  // v1.0.2 Observer Runtime Verification Foundation：VerificationRun / InvariantCheck / DriftReport。
  // 验证只读只报；Verification≠Optimization（237）/不可改authority(238)/不可改identity(239)/DriftReport≠RealityClaim(240)。
  const v = await runVerification(fs, obsRoot, args);
  if (!v.ok || !v.run || !v.report) return scrubFinal(RECALL_PREFIX + "[Verification Rejected] " + v.reason + flushWarn);
  return scrubFinal(RECALL_PREFIX + renderRun(v.run) + "\n" + renderReport(v.report) + flushWarn);
}
