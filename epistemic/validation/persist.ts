// dsh-shadow —— validation/persist.ts：ValidationArtifact 持久化（.shadow/validation/<id>.json，不覆盖 Hypothesis）。
//
// **B2 同类补扫（v1.22.x；规格轴复审 (a)-1）**：旧形态是 `Promise<void>` + `catch { console.log }` ——
// `mode:"validate"` 的输出当场渲染 `[Validation] …`，而这份 artifact 是「这次验证的结论快照」的**唯一载体**
//（`toArtifact` 的 `hypothesisProjectionSnapshot`/`currentRealitySnapshot` 都只在这里）。写失败必须能说出口。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { ValidationArtifact } from "./types.js";
import { errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";

export const writeValidation = async (fs: any, ws: string, va: ValidationArtifact): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 ValidationArtifact" };
  const rel = `${SHADOW_ROOT}/validation/${va.id}.json`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(va));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
  }
};
