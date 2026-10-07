// dsh-shadow —— agency/persistence.ts：Agency 记录持久化（context 快照 + boundary event 进 .shadow/agency/）。
//
// B2（v1.22.x）：两个 `write*` 旧形态是 `Promise<void>` + `catch { console.log }`。
// 这些文件是随后（`mode:"agency-event"` 的 lineage / 跨会话审计）会读回的载体 ⇒ 写失败必须可见。
// 现在返回 `{ok, reason}`；`query/agency.ts`（`mode:"agency-context"`）在其中一段输出里说明「未落盘」。
// `stance/agency/engine.ts#buildAgencyEvent` 也已把 `writeAgencyEvent` 的结果透传（`persist`）
// ⇒ `mode:"agency-event"` 的 event 落盘失败同样可见（v1.22.x **续修**，Lead 授权）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { AgencyContext, AgencyBoundaryEvent } from "./types.js";
import { today, errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";

/** 写一个 JSON（唯一一份）—— 两个 `write*` 共用。 */
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

export const writeAgencyContext = async (fs: any, ws: string, ctx: AgencyContext): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/agency/${today()}/context-${ctx.id}.json`, ctx);

export const writeAgencyEvent = async (fs: any, ws: string, e: AgencyBoundaryEvent): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/agency/${today()}/event-${e.actionCandidate}.json`, e);
