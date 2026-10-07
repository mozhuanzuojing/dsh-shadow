// dsh-shadow —— long-horizon/persistence/persist.ts：长期交互记录持久化（context/summary/event/link 进 .shadow/horizon/）。
//
// B2（v1.22.x）：四个 `write*` 旧形态是 `Promise<void>` + `catch { console.log }`。
// 这些记录是 `mode:"horizon-context"/"horizon-summary"/"horizon-event"/"horizon-link"` 之后会读回的载体
//（History→Recall→Adaptation 的 lineage 靠它们成立）⇒ 写失败必须可见：
// 现在返回 `{ok, reason}`，由 `trajectory/long-horizon/engine/interaction.ts` 透传给 `query/horizon.ts`，
// 在**同一段输出**里说明「未落盘 + 真实原因」（ADR-0049 规则 2/3；ADR-0085：`console.log` 不算信号）。
import { SHADOW_ROOT } from "../../../core/paths.js";
import type { InteractionContext, HistorySummary, HistoryContinuityEvent, InteractionAdaptationLink } from "../types/index.js";
import { today, errText } from "../../../core/util.js";
import type { PersistOutcome } from "../../../persistence/outcomes.js";

/** 写一个 JSON（唯一一份）—— 四个 `write*` 共用。 */
const writeJson = async (fs: any, ws: string, rel: string, body: unknown): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: `无 fs 或无工作区 ⇒ 未写 ${rel}` };
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(body));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
  }
};

export const writeInteractionContext = async (fs: any, ws: string, c: InteractionContext): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/horizon/${today()}/context-${c.id}.json`, c);
export const writeHistorySummary = async (fs: any, ws: string, s: HistorySummary): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/horizon/${today()}/summary-${s.id}.json`, s);
export const writeContinuityEvent = async (fs: any, ws: string, e: HistoryContinuityEvent): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/horizon/${today()}/event-${e.id}.json`, e);
export const writeInteractionAdaptationLink = async (fs: any, ws: string, l: InteractionAdaptationLink): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/horizon/${today()}/link-${l.historyRef}.json`, l);
