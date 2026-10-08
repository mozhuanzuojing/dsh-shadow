// dsh-shadow —— verification/persist.ts：验证记录持久化（run 落 observer 层 verification/，连同 persistence 记录）。
//
// **B2 同类补扫（v1.22.x；规格轴复审 (a)-1）**：旧形态是 `Promise<void>` + `catch { console.log }`
// —— `mode:"verification"` 的输出**当场**渲染 `[Verification Run] …`，而写失败与写成功逐字相同。
// ⇒ 返回 `PersistOutcome`，由 `engine.ts` 消费：**没落盘就不许 `ok:true`**（ADR-0049 规则 3）。
import { errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";

export const writeVerificationRun = async (fs: any, root: string, run: any): Promise<PersistOutcome> => {
  if (!fs || !root) return { ok: false, reason: "无 fs 或无 observer 根 ⇒ 未写 VerificationRun" };
  const rel = `${root}/verification/run-${run.runId}.json`;
  try {
    const t = await fs.resolve(rel, { cwd: root });
    await fs.writeText(t, JSON.stringify(run));
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(err)}` };
  }
};
