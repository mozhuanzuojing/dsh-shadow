// dsh-shadow —— validation/persist.ts：ValidationArtifact 持久化（shadow/validation/<id>.json，不覆盖 Hypothesis）。
import type { ValidationArtifact } from "./types.js";

export const writeValidation = async (fs: any, ws: string, va: ValidationArtifact) => {
  try {
    const rel = `shadow/validation/${va.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(va));
  } catch (e: any) { console.log("[dsh-shadow] validation write failed:", e && e.message); }
};
