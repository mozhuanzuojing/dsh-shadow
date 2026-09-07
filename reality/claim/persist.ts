// dsh-shadow —— reality/claim/persist.ts：RealityClaim 持久化（append-only，RealityModel immutable history）。
import type { RealityClaim } from "../types.js";

export const writeClaim = async (fs: any, ws: string, c: RealityClaim) => {
  try {
    const rel = `.shadow/model/claims/${c.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(c));
  } catch (e: any) { console.log("[dsh-shadow] reality claim write failed:", e && e.message); }
};

export const readClaims = async (fs: any, ws: string): Promise<RealityClaim[]> => {
  const out: RealityClaim[] = [];
  try {
    const root = await fs.resolve(`${ws}/.shadow/model/claims`, { cwd: ws });
    const files = (await fs.listDir(root).catch(() => [])) || [];
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".json")) continue;
      const p = await fs.resolve(`${ws}/.shadow/model/claims/${f.name}`, { cwd: ws });
      out.push(JSON.parse(await fs.readText(p)));
    }
  } catch { /* 无 claims 目录 */ }
  return out;
};
