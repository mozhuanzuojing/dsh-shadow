// dsh-shadow —— reality/registry.ts：RealityObservation 注册表（append-only，弱事实，不可篡改）。
import type { RealityObservation } from "./types.js";

export const registerObservation = async (fs: any, ws: string, ro: RealityObservation) => {
  try {
    const rel = `shadow/model/observations/${ro.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(ro));
  } catch (e: any) { console.log("[dsh-shadow] reality observation write failed:", e && e.message); }
  return ro;
};

export const readObservations = async (fs: any, ws: string, subjectRef?: string): Promise<RealityObservation[]> => {
  const out: RealityObservation[] = [];
  try {
    const root = await fs.resolve(`${ws}/shadow/model/observations`, { cwd: ws });
    const files = (await fs.listDir(root).catch(() => [])) || [];
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".json")) continue;
      const p = await fs.resolve(`${ws}/shadow/model/observations/${f.name}`, { cwd: ws });
      const ro = JSON.parse(await fs.readText(p));
      if (subjectRef && ro.subjectRef !== subjectRef) continue;
      out.push(ro);
    }
  } catch { /* 无 model 目录 */ }
  return out;
};
