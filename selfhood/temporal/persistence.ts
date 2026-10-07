// dsh-shadow —— selfhood/temporal/persistence.ts：TemporalGraph 持久化（派生索引，可重建）。
//
// 读取收敛到 `persistence/snapshots.ts` 的 `readLatestSnapshot`（ADR-0071）：
// 原先本文件与 `world/persistence/persist.ts` 各有一份**逐字近重复**的读取逻辑，且**同带一个顺序 bug**
// —— 直接取 `listDir` 的**第一个**日期（契约与真机实现都是升序 ⇒ 取到**最旧**的快照）。
// 收敛后顺序纪律只有一处实现，不会再分叉。
//
// B2/B3（v1.22.x）：
//   · 写失败**不再只 `console.log`**：`writeTemporalGraph` 返回 `{ok, reason}`（三态），
//     调用方（`query/observer-kernel.ts` 的 `mode:"temporal"`）在**同一段输出**里说明「未落盘」——
//     否则读者以为 `.shadow/temporal/<date>/graph.json` 已经有这份图，而 `readTemporalGraph` 读到的
//     是旧图或什么都没有（ADR-0049 规则 2/3、ADR-0085）。
//   · 读侧返回 `SnapshotRead<TemporalGraph>`（携带 `value/usedRel/skipped/readFailure`）——
//     在本文件把 `value` 丢掉就等于把「读到的是旧图」这件事又藏回日志里（B3）。
import { SHADOW_ROOT } from "../../core/paths.js";
import { readLatestSnapshot, type SnapshotRead } from "../../persistence/snapshots.js";
import { errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";
import type { TemporalGraph } from "./types.js";
import { today } from "../../core/util.js";

export const writeTemporalGraph = async (fs: any, ws: string, graph: TemporalGraph): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 temporal graph" };
  const rel = `${SHADOW_ROOT}/temporal/${today()}/graph.json`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(graph, null, 2));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
  }
};

/**
 * 读**最新**的一份 temporal 快照（按日期目录降序取第一份；无 → `value:null`）。
 * **原样透传** `SnapshotRead`（不解包）：回退到更旧快照时调用方拿得到 `usedRel`/`skipped`。
 */
export const readTemporalGraph = (fs: any, ws: string): Promise<SnapshotRead<TemporalGraph>> =>
  readLatestSnapshot<TemporalGraph>(fs, ws, "temporal", "graph.json");
