// dsh-shadow —— temporal/persistence.ts：TemporalGraph 持久化（派生索引，可重建）。
//
// 读取收敛到 `persistence/snapshots.ts` 的 `readLatestSnapshot`（ADR-0071）：
// 原先本文件与 `world/persistence/persist.ts` 各有一份**逐字近重复**的读取逻辑，且**同带一个顺序 bug**
// —— 直接取 `listDir` 的**第一个**日期（契约与真机实现都是升序 ⇒ 取到**最旧**的快照）。
// 收敛后顺序纪律只有一处实现，不会再分叉。
import { SHADOW_ROOT } from "../core/paths.js";
import { readLatestSnapshot } from "../persistence/snapshots.js";
import { today } from "../core/util.js";
export const writeTemporalGraph = async (fs, ws, graph) => {
    try {
        const rel = `${SHADOW_ROOT}/temporal/${today()}/graph.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(graph, null, 2));
    }
    catch (e) {
        console.log("[dsh-shadow] temporal graph write failed:", e && e.message);
    }
};
/** 读**最新**的一份 temporal 快照（按日期目录降序取第一份；无 → null）。 */
export const readTemporalGraph = (fs, ws) => readLatestSnapshot(fs, ws, "temporal", "graph.json");
