// dsh-shadow —— selfhood/dream/persist.ts：DreamArtifact 持久化（.shadow/dream/<date>/dream.json，非 memory）。
//
// B2（v1.22.x）：旧形态是 `Promise<void>` + `catch { console.log }` —— 写失败与成功在调用方眼里相同，
// 而 `mode:"offline"` 的输出**当场**就要渲染 dream 结果（`query/observer-kernel.ts`）。
// 同一段输出里既报「dream 生成了」又什么都没落盘 = 冒充成功（ADR-0049 规则 3）。
// 现在返回 `{ok, reason}`，由 observer-kernel 在**同一段输出**里说明「未落盘 + 真实原因」。
// 判据与同文件的 `writeHypothesis`（返回 boolean）同向：**写侧必须把结果交给调用方**。
import { SHADOW_ROOT } from "../../core/paths.js";
import { today, errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";

export const writeDream = async (fs: any, ws: string, artifact: any): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 dream" };
  const rel = `${SHADOW_ROOT}/dream/${today()}/dream.json`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(artifact, null, 2));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
  }
};
