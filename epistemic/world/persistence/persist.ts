// dsh-shadow —— world/persistence/persist.ts：RepresentationGraph 持久化（可重建索引，存 sourceClaims/sourceValidations）。
//
// 读取收敛到 `persistence/snapshots.ts` 的 `readLatestSnapshot`（ADR-0071）：
// 原先本文件与 `selfhood/temporal/persistence.ts` 各有一份**逐字近重复**的读取逻辑，且**同带一个顺序 bug**
// —— 直接取 `listDir` 的**第一个**日期（契约与真机实现都是升序 ⇒ 取到**最旧**的快照）。
import { SHADOW_ROOT } from "../../../core/paths.js";
import { readLatestSnapshot, type SnapshotRead } from "../../../persistence/snapshots.js";
import type { PersistOutcome } from "../../../persistence/outcomes.js";
import { errText } from "../../../core/util.js";
import type { RepresentationGraph } from "../types.js";

/**
 * 写一份 world 图快照。
 *
 * **B2 同类补扫（v1.22.x；规格轴复审 (a)-1）**：旧形态是 `Promise<void>` + `catch { console.log }` ——
 * `mode:"world"` 的输出当场渲染由这份图派生的 representation，而写失败与成功在读者眼里**逐字相同**
 *（`readGraph` 随后读到的是旧图或什么都没有）。⇒ 返回 `PersistOutcome`，由 `query/world.ts` 上横幅。
 */
export const writeGraph = async (fs: any, ws: string, g: RepresentationGraph): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 world graph" };
  const rel = `${SHADOW_ROOT}/world/${g.generatedAt}/graph.json`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(g));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
  }
};

/**
 * 读**最新**的一份 world 快照（按日期目录降序取第一份；无 → `value: null`）。
 *
 * **B3（v1.22.x）**：返回值**原样透传** `SnapshotRead`（**不解包**）—— 回退到更旧快照时调用方
 * 必须能拿到 `usedRel` / `skipped` / `readFailure`（`console.log` 不算 ADR-0049 认可的可见信号）。
 * ⚠ 与 `selfhood/temporal/persistence.ts` 的 `readTemporalGraph` **两侧必须同解包或同不解包**
 *（否则 `test/graph-snapshot-order.test.ts` 与类型门会同时红）；现在是**都不解包**。
 */
export const readGraph = (fs: any, ws: string): Promise<SnapshotRead<RepresentationGraph>> =>
  readLatestSnapshot<RepresentationGraph>(fs, ws, "world", "graph.json");
