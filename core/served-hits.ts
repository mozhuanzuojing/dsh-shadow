// dsh-shadow —— core/served-hits.ts：召回已返回 hits 的**唯一写入 seam**（D7=②，架构加深 P3）。
//
// 语义（用户拍板）：`hits` / `confirmedBy` =「被任何返回 Memory Atom 的读入口读过」。
//   主题召回、recovery、shadow_query、episode/decision/task/… 凡落到具体记忆 rel 的集合都算。
//   探测性 `shadow_query` 也会抬 hotness —— **接受该代价**（不另开 readHits）。
//
// **不计**（调用方负责不传）：纯配置/观测 mode、废止消息、空命中、toolset 巡检。
// debug 诊断拼装本身不另算第二次 —— 只对真正返回给调用方的 Atom rel 调本函数一次。
//
// 纪律：生产路径禁止在别处对 `rec.hits++`；一律走 `recordServedHits`（判据收一处）。
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
