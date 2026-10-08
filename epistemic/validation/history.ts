// dsh-shadow —— validation/history.ts：ValidationTimeline（append-only；Hypothesis immutable）。
// 智慧不是"永远正确"而是"能记住自己什么时候错过"——ValidationEvent[] 支撑 Decision Style / Anti Pattern / Wisdom。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { ValidationOutcome } from "./types.js";
import { today, isNotFound, errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";

export interface ValidationEvent {
  time: string;
  evidenceIds: string[];
  result: ValidationOutcome;
  alternativeWinner: string | null;
  perceptionDelta: string;
}
export interface ValidationTimeline {
  hypothesisId: string;
  events: ValidationEvent[];
}

/**
 * 追加结果：**时间线 + 写侧三态**（B2 同类补扫，v1.22.x；规格轴复审 (a)-1）。
 *
 * 旧契约只返回 `ValidationTimeline` ⇒ 写失败（或「坏件 ⇒ 拒绝覆盖」）与成功在调用方眼里**逐字相同**，
 * 而 `mode:"validate"` 的输出当场就渲染这次验证 —— 同一段输出里既报结论又没留下历史 = 冒充成功
 * （ADR-0049 规则 3）。形状与 `reflection/engine.ts` 的 `{ reflection, persist }` 同族。
 */
export interface ValidationAppend {
  /** **真的落盘**时是「含本次事件」的时间线；没落盘时是**磁盘上的原样**（不把内存里的追加算进去）。 */
  timeline: ValidationTimeline;
  /** `ok:false` ⇒ 本次事件**没有**落盘（原因含真实异常，或「坏件 ⇒ 拒绝覆盖」这条设计内决定）。 */
  persist: PersistOutcome;
}

export const appendValidationEvent = async (fs: any, ws: string, hypothesisId: string, event: Omit<ValidationEvent, "time"> & { time?: string }): Promise<ValidationAppend> => {
  const { timeline: existing, corrupt } = await readTimelineDetailed(fs, ws, hypothesisId);
  if (corrupt) {
    // **拒绝覆盖**：坏件被「1 条新事件」覆盖 ⇒ 整段 append-only 历史**永久销毁**，
    // 而且从外面看只是「历史变短了」。宁可这次不记，也不把历史抹掉（Forget ≠ Delete，ADR-0031）。
    // 这是**设计内**的拒绝，但它同样是「读者以为记下了、其实没有」⇒ 必须经 `persist` 说出口。
    return { timeline: existing, persist: { ok: false, reason: `${hypothesisId}.timeline.json **坏件，已拒绝覆盖**（历史保留原样，请人工修复）` } };
  }
  const next: ValidationTimeline = { ...existing, events: [...existing.events, { time: event.time || today(), evidenceIds: event.evidenceIds || [], result: event.result, alternativeWinner: event.alternativeWinner || null, perceptionDelta: event.perceptionDelta || "" }] };
  const rel = `${SHADOW_ROOT}/validation/${hypothesisId}.timeline.json`;
  if (!fs || !ws) return { timeline: existing, persist: { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 validation timeline" } };
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(next));
    return { timeline: next, persist: { ok: true } };
  } catch (e: any) {
    // 落盘失败 ⇒ 返回**磁盘上的原样**（`existing`）：否则「返回值里有这条事件、磁盘上没有」又是一次冒充。
    return { timeline: existing, persist: { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` } };
  }
};

/**
 * 读时间线，并**区分「还没有」与「读不出」**（本仓纪律 ADR-0049：缺件不静默）。
 *
 * `corrupt: true` ⇒ 文件**存在但不可用**（读失败 / 不是 JSON / 形状不对）。
 * 调用方**不得**把坏件当成空历史去写 —— 那就是用「一条新事件」覆盖掉整段历史。
 */
export const readTimelineDetailed = async (fs: any, ws: string, hypothesisId: string): Promise<{ timeline: ValidationTimeline; corrupt: boolean }> => {
  const empty: ValidationTimeline = { hypothesisId, events: [] };
  let txt = "";
  try {
    const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/validation/${hypothesisId}.timeline.json`, { cwd: ws });
    txt = await fs.readText(t);
  } catch (e: any) {
    // v1.15.94：判据收一处到 `core/util.ts` 的 `isNotFound`（原先本文件自己写了一份正则，
    // 与 `evidence/filesystem.ts` / `federation/reality.ts` 的两份**互不相同**）。
    return { timeline: empty, corrupt: !isNotFound(e) }; // 不存在 ⇒ 正常的新时间线；读失败 ⇒ 坏件
  }
  if (!String(txt ?? "").trim()) return { timeline: empty, corrupt: false }; // 空文件 = 尚无事件
  try {
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.events)) return { timeline: empty, corrupt: true }; // 形状不对 = 坏件
    return { timeline: parsed as ValidationTimeline, corrupt: false };
  } catch {
    return { timeline: empty, corrupt: true }; // 不是 JSON = 坏件
  }
};

export const readTimeline = async (fs: any, ws: string, hypothesisId: string): Promise<ValidationTimeline> =>
  (await readTimelineDetailed(fs, ws, hypothesisId)).timeline;

export const renderTimeline = (tl: ValidationTimeline) => {
  const lines = ["[Validation Timeline]"];
  lines.push(`hypothesis ${tl.hypothesisId} · events ${tl.events.length} (append-only)`);
  for (const e of tl.events) lines.push(`  ${e.time} · ${e.result} · evidence ${e.evidenceIds.length} · alternativeWinner ${e.alternativeWinner || "—"} · ${e.perceptionDelta}`);
  return lines.join("\n");
};
