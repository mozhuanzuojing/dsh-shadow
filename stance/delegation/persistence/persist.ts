// dsh-shadow —— delegation/persistence/persist.ts：委派记录持久化（context + boundary event 进 .shadow/delegation/）。
//
// B2（v1.22.x）：两个 `write*` 旧形态是 `Promise<void>` + `catch { console.log }`。
// `delegation-<id>.json` 是 `mode:"delegation-check"/"delegation-event"` **随后会读回**的唯一载体
//（Delegation Lineage 不可断：Action→Plan→Objective→Delegation→Authority Source）⇒ 写失败必须可见。
// 现在返回 `{ok, reason}`；`query/delegation.ts`（`mode:"delegation-context"`）会说明「未落盘」。
// `stance/delegation/engine/delegated-execution.ts` 也已把 `writeDelegationEvent` 的结果透传（`persist`）
// ⇒ `mode:"delegation-event"` 的 event 落盘失败同样可见（v1.22.x **续修**，Lead 授权）。
//
// 读侧（`readDelegationContext`）**已按 B4 家族收紧为三态**（v1.22.x 续修）：旧形态 `catch { return null }`
// 把「还没有这条委派」与「读不出来 / 坏件」合并成同一个 `null` —— 而两者后果相反：
// 前者是判定结论（`checkDelegation` 报「无 delegation，lineage 不可断」），后者是事故（该报「判不了，先修可读性」）。
// 现在判据复用 `core/util.ts#isNotFound`，`JSON.parse` 与 `readText` **分开 try**。
import { SHADOW_ROOT } from "../../../core/paths.js";
import type { DelegationContext } from "../types/context.js";
import type { AutonomyBoundaryEvent } from "../types/event.js";
import { today, isNotFound, errText } from "../../../core/util.js";
import type { PersistOutcome, ReadOutcome } from "../../../persistence/outcomes.js";

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

export const writeDelegationContext = async (fs: any, ws: string, ctx: DelegationContext): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/delegation/${today()}/delegation-${ctx.delegationId}.json`, ctx);

/** 读一份 DelegationContext（**三态**，B4：`ok:true,value:null` = 真的没有；`ok:false` = 读不出来/坏件）。 */
export const readDelegationContext = async (fs: any, ws: string, delegationId: string): Promise<ReadOutcome<DelegationContext>> => {
  const rel = `${SHADOW_ROOT}/delegation/${today()}/delegation-${delegationId}.json`;
  if (!fs || !ws) return { ok: false, value: null, reason: "无 fs 或无工作区 ⇒ 读不出" };
  let target: any;
  try {
    target = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
  } catch (e: any) {
    return isNotFound(e) ? { ok: true, value: null } : { ok: false, value: null, reason: `定位失败：${errText(e)}` };
  }
  let raw = "";
  try {
    raw = await fs.readText(target);
  } catch (e: any) {
    return isNotFound(e) ? { ok: true, value: null } : { ok: false, value: null, reason: `读取失败：${errText(e)}` };
  }
  if (!raw) return { ok: true, value: null };
  // **`JSON.parse` 独立 try**（B4）：坏件要有自己的原因，不能借读失败的说辞。
  try {
    return { ok: true, value: JSON.parse(raw) as DelegationContext };
  } catch (e: any) {
    return { ok: false, value: null, reason: `**坏件**（无法解析）：${errText(e)}` };
  }
};

export const writeDelegationEvent = async (fs: any, ws: string, e: AutonomyBoundaryEvent): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/delegation/${today()}/event-${e.id}.json`, e);
