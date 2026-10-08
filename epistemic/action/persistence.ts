// dsh-shadow —— action/persistence.ts：Action 记录持久化（ActionExecution/Feedback 是事件，进 .shadow/action/）。
//
// **B2 同类补扫（v1.22.x；规格轴复审 (a)-1）**：这两个 `write*` 旧形态是 `Promise<void>` + `catch { console.log }`
// —— 写失败与写成功在调用方眼里**逐字相同**，而它们正是「某个行动发生过」的**唯一留痕**：
// `mode:"execute"` / `"feedback"` 的输出**当场**就渲染 `[Action Execution] …` / `[Action Feedback] …`。
// 同一段输出里既报「已执行 / 已反馈」而磁盘上什么都没有 = 冒充成功（ADR-0049 规则 3；`console.log` 不算信号，ADR-0085）。
// ⇒ 形状收 `persistence/outcomes.ts` 的 `PersistOutcome`（与 `trajectory/recall/persistence/persist.ts`、
// `selfhood/dream/persist.ts` 等同形），由 `query/sim-action.ts` 在**同一段输出**里说明「未落盘 + 真实原因」。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { ActionExecution, ActionFeedback } from "./types.js";
import { today, errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";

export const writeExecution = async (fs: any, ws: string, e: ActionExecution): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 ActionExecution" };
  const rel = `${SHADOW_ROOT}/action/${today()}/exec-${e.id}.json`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(e));
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(err)}` };
  }
};

export const writeFeedback = async (fs: any, ws: string, f: ActionFeedback): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 ActionFeedback" };
  const rel = `${SHADOW_ROOT}/action/${today()}/feedback-${f.executionId}.json`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(f));
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(err)}` };
  }
};
