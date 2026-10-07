// dsh-shadow —— adaptation/persistence/persist.ts：Adaptation 记录持久化（context/change/validation 进 .shadow/adapt/）。
//
// B2（v1.22.x）：三个 `write*` 旧形态是 `Promise<void>` + `catch { console.log }`。
// 这些文件是 `mode:"adapt-change"/"adapt-validation"` 随后（以及跨会话）会读回的载体，
// 而调用点 `trajectory/adaptation/engine/adaptation.ts` 当时**无条件**渲染「AdaptationChange 已构造」
// ⇒ 写失败冒充成功（ADR-0049 规则 3）。现在返回 `{ok, reason}`，引擎把结果透传给
// `query/adaptation.ts`，由它在**同一段输出**里说明「未落盘 + 真实原因」（ADR-0085：`console.log` 不算信号）。
import { SHADOW_ROOT } from "../../../core/paths.js";
import type { AdaptationContext, AdaptationChange, AdaptationValidation } from "../types/index.js";
import { today, errText } from "../../../core/util.js";
import type { PersistOutcome } from "../../../persistence/outcomes.js";

/** 写一个 JSON（唯一一份）—— 三个 `write*` 共用。 */
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

export const writeAdaptationContext = async (fs: any, ws: string, c: AdaptationContext): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/adapt/${today()}/context-${c.sourceExperience}.json`, c);
export const writeAdaptationChange = async (fs: any, ws: string, ch: AdaptationChange): Promise<PersistOutcome> =>
  writeJson(fs, ws, `${SHADOW_ROOT}/adapt/${today()}/change-${ch.id}.json`, ch);
export const writeAdaptationValidation = async (fs: any, ws: string, v: AdaptationValidation): Promise<PersistOutcome> =>
  // 文件名带 `Date.now()`：每次验证一份**不可变**记录（不覆盖上一条）。
  writeJson(fs, ws, `${SHADOW_ROOT}/adapt/${today()}/validation-${Date.now()}.json`, v);
