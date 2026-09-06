// dsh-shadow —— federation/reality.ts：G2 Reality Evidence Registry（弱事实，append-only，Observer 只能引用不能拥有）。
import type { RealityEvidence } from "./types.js";
import { today } from "../core/util.js";

export const registerRealityEvidence = async (fs: any, ws: string, ev: { observedAt?: string; source: string; observation: string; linkedHypothesis?: string[] }): Promise<RealityEvidence> => {
  const full: RealityEvidence = {
    id: `re-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    observedAt: ev.observedAt || today(),
    source: ev.source,
    observation: ev.observation,          // 弱事实："某事件在某时间被观察到"
    linkedHypothesis: ev.linkedHypothesis || [],
    referencedBy: [],
    status: "observed",
  };
  try {
    const rel = `shadow/reality/${full.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(full));
  } catch (e: any) { console.log("[dsh-shadow] reality evidence write failed:", e && e.message); }
  return full;
};

export const referenceEvidence = async (fs: any, ws: string, id: string, observerId: string): Promise<RealityEvidence | null> => {
  try {
    const t = await fs.resolve(`${ws}/shadow/reality/${id}.json`, { cwd: ws });
    const ev = JSON.parse(await fs.readText(t));
    // append-only：只追加 referencedBy，不改 observation/observedAt（弱事实不可篡改）
    if (!ev.referencedBy.includes(observerId)) ev.referencedBy.push(observerId);
    await fs.writeText(t, JSON.stringify(ev));
    return ev;
  } catch { return null; }
};

export const readRealityEvidence = async (fs: any, ws: string): Promise<RealityEvidence[]> => {
  const out: RealityEvidence[] = [];
  try {
    const root = await fs.resolve(`${ws}/shadow/reality`, { cwd: ws });
    const files = (await fs.listDir(root).catch(() => [])) || [];
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".json")) continue;
      const p = await fs.resolve(`${ws}/shadow/reality/${f.name}`, { cwd: ws });
      out.push(JSON.parse(await fs.readText(p)));
    }
  } catch { /* 无 reality 目录 */ }
  return out;
};

export const renderRealityEvidence = (ev: RealityEvidence) => {
  const lines = ["[Reality Evidence]"];
  lines.push(`id ${ev.id} · ${ev.observedAt} · source ${ev.source}`);
  lines.push(`observation ${ev.observation}（弱事实：只记录观察到，不解释规律）`);
  lines.push(`linkedHypothesis ${ev.linkedHypothesis.join("、") || "—"} · referencedBy ${ev.referencedBy.join("、") || "—"} status ${ev.status}`);
  return lines.join("\n");
};
