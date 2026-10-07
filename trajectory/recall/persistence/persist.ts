// dsh-shadow —— recall/persistence/persist.ts：Recall 记录持久化（ForgottenRecord + RecallEvent 进 .shadow/recall/）。
//
// B2/B4（v1.22.x）：两个 `write*` 旧形态是 `Promise<void>` + `catch { console.log }` —— 写失败与成功
// 在调用方眼里逐字相同，而这些文件正是同一特性随后会**读回**的唯一载体
//（`readForgottenRecord` → `buildRecallEvent`/`validateRecall`）⇒ 不适用「正当静默」豁免
//（`core/view/projection-store.ts` 那条要求「降级后读者拿到的内容逐字节不变」）。
// 现在返回 `{ok, reason}`，由 `trajectory/recall/engine/recall-continuity.ts` 透传给
// `query/recall.ts`，在**同一段输出**里说明「未落盘 + 真实原因」（ADR-0049 / ADR-0085）。
//
// 读侧同样把「还没有这条遗忘记录」与「读不出来/坏件」分开（`isNotFound`，`JSON.parse` 独立 try）：
// 旧版合并后，一次 EACCES 会让 `buildRecallEvent` 报「Recall 须引用已遗忘记录」——
// 把**读故障**说成**对象不存在**，把排障引向错误方向。
import { SHADOW_ROOT } from "../../../core/paths.js";
import type { ForgottenRecord, RecallEvent } from "../types/index.js";
import { today, isNotFound, errText } from "../../../core/util.js";
import type { PersistOutcome, ReadOutcome } from "../../../persistence/outcomes.js";

/** 写一个 JSON（唯一一份）—— 两个 `write*` 共用，免得失败原因两处各写一遍。 */
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

export const writeForgottenRecord = async (fs: any, ws: string, r: ForgottenRecord): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/recall/${today()}/forgotten-${r.id}.json`, r);

/** 读一条 ForgottenRecord：`ok:true,value:null` = 真的没有（正常）；`ok:false` = 读不出来/坏件。 */
export const readForgottenRecord = async (fs: any, ws: string, id: string): Promise<ReadOutcome<ForgottenRecord>> => {
  const rel = `${SHADOW_ROOT}/recall/${today()}/forgotten-${id}.json`;
  let target: any;
  try {
    target = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
  } catch (e: any) {
    return isNotFound(e) ? { ok: true, value: null } : { ok: false, value: null, reason: `定位 ${rel} 失败：${errText(e)}` };
  }
  let raw = "";
  try {
    raw = await fs.readText(target);
  } catch (e: any) {
    return isNotFound(e) ? { ok: true, value: null } : { ok: false, value: null, reason: `读取 ${rel} 失败：${errText(e)}` };
  }
  if (!raw) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) as ForgottenRecord };
  } catch (e: any) {
    return { ok: false, value: null, reason: `${rel} **坏件**（无法解析）：${errText(e)}` };
  }
};

export const writeRecallEvent = async (fs: any, ws: string, e: RecallEvent): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/recall/${today()}/event-${e.id}.json`, e);
