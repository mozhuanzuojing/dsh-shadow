// dsh-shadow —— world/persistence/persist.ts：RepresentationGraph 持久化（可重建索引，存 sourceClaims/sourceValidations）。
//
// 读取收敛到 `persistence/snapshots.ts` 的 `readLatestSnapshot`（ADR-0071）：
// 原先本文件与 `temporal/persistence.ts` 各有一份**逐字近重复**的读取逻辑，且**同带一个顺序 bug**
// —— 直接取 `listDir` 的**第一个**日期（契约与真机实现都是升序 ⇒ 取到**最旧**的快照）。
import { SHADOW_ROOT } from "../../core/paths.js";
import { readLatestSnapshot } from "../../persistence/snapshots.js";
import type { RepresentationGraph } from "../types.js";

export const writeGraph = async (fs: any, ws: string, g: RepresentationGraph) => {
  try {
    const rel = `${SHADOW_ROOT}/world/${g.generatedAt}/graph.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(g));
  } catch (e: any) { console.log("[dsh-shadow] world graph write failed:", e && e.message); }
};

/** 读**最新**的一份 world 快照（按日期目录降序取第一份；无 → null）。 */
export const readGraph = (fs: any, ws: string): Promise<RepresentationGraph | null> =>
  readLatestSnapshot<RepresentationGraph>(fs, ws, "world", "graph.json");
