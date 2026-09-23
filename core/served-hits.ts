// dsh-shadow —— core/served-hits.ts：召回已返回 hits 的写入 seam + 已返回 rel 提取（D7=②）。
//
// 语义（用户拍板）：`hits` / `confirmedBy` =「被任何返回 Memory Atom 的读入口读过」。
//   主题召回、recovery、shadow_query、episode/decision/task/… 凡落到具体记忆 rel 的集合都算。
//   探测性 `shadow_query` 也会抬 hotness —— **接受该代价**（不另开 readHits）。
//
// **不计**（调用方负责不传）：纯配置/观测 mode、废止消息、空命中、toolset 巡检。
// debug 诊断拼装本身不另算第二次 —— 只对真正返回给调用方的 Atom rel 调本函数一次。
//
// 纪律：
//   · 生产路径禁止在别处对 `rec.hits++`；
//   · 编排 / ReadQuery **只许**走 `noteServedAtoms`（勿绕门直调 `recordServedHits`）；
//   · `recordServedHits` 留给门内与单测。
// 提取器只收结构形状 —— **禁止本文件 import query/**（audit:layers）。
import { today } from "./util.js";
import { mutateMeta } from "../persistence/meta.js";

/**
 * 把本回合返回的记忆 rel 记一次命中。空数组 / 无 fs 时 no-op。
 * @param turn - 台账回合号（主题召回有冷却时传入；其它入口可传 0）
 * @param observerId - 观察者 agent id（非创建者则进 confirmedBy）
 */
export const recordServedHits = async (
  fs: any,
  ws: string,
  rels: readonly string[],
  opts?: { turn?: number; observerId?: string },
): Promise<void> => {
  const unique = [...new Set(rels.map((r) => String(r || "").trim()).filter(Boolean))];
  if (!fs || !ws || !unique.length) return;
  const turn = typeof opts?.turn === "number" ? opts.turn : 0;
  const observer = opts?.observerId ? String(opts.observerId) : "";
  await mutateMeta(fs, ws, (next) => {
    for (const p of unique) {
      const rec = next[p] || {
        created: today(),
        hits: 0,
        status: "active",
        confidence: 0.5,
        pinned: false,
        createdBy: "",
        confirmedBy: [],
      };
      rec.hits = (rec.hits || 0) + 1;
      if (turn > 0) rec.lastSeen = turn;
      if (observer) {
        const cb = Array.isArray(rec.confirmedBy) ? rec.confirmedBy : [];
        if (observer !== (rec.createdBy || "") && !cb.includes(observer)) {
          cb.push(observer);
          rec.confirmedBy = cb.slice(-10);
        }
      }
      next[p] = rec;
    }
  });
};

/**
 * 生产路径写入门：主题召回传 turn；ReadQuery 不传（与旧 noteAtomHits 一致）。
 */
export const noteServedAtoms = async (
  fs: any,
  ws: string,
  rels: readonly string[],
  opts?: { turn?: number; observerId?: string },
): Promise<void> => {
  await recordServedHits(fs, ws, rels, opts);
};

/** episode / task / recovery：`shown.flatMap(x => x.memoryRefs)`。 */
export const relsFromMemoryRefs = (
  items: readonly { memoryRefs?: readonly string[] | null }[],
): string[] => items.flatMap((it) => (Array.isArray(it.memoryRefs) ? [...it.memoryRefs] : []));

/** decision：已收集的 `{ rel }` 列表。 */
export const relsFromDecisionRels = (
  items: readonly { rel?: string | null }[],
): string[] => items.map((it) => String(it.rel || "").trim()).filter(Boolean);

/** context 的 `r.source` 与 shadow_query 的 `it.source`。 */
export const relsFromSources = (
  items: readonly { source?: string | readonly string[] | null }[],
): string[] => {
  const out: string[] = [];
  for (const it of items) {
    const s = it.source;
    if (Array.isArray(s)) {
      for (const x of s) {
        const t = String(x || "").trim();
        if (t) out.push(t);
      }
    } else {
      const t = String(s || "").trim();
      if (t) out.push(t);
    }
  }
  return out;
};
