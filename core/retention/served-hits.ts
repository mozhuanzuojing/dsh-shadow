// dsh-shadow —— core/retention/served-hits.ts：召回已返回 hits 的写入 seam + 已返回 rel 提取（D7=②）。
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
import { today } from "../util.js";
import { mutateMeta } from "../../persistence/meta.js";

/**
 * 把本回合返回的记忆 rel 记一次命中。空数组 / 无 fs 时 no-op。
 * @param turn - 台账回合号（主题召回有冷却时传入；其它入口可传 0）
 * @param observerId - 观察者 agent id（非创建者则进 confirmedBy）
 *
 * ## 为什么这里**不需要**区分「并发没抢到」与「写失败」（B24 消费面③：boolean 够用）
 *
 * 用的是兼容视图 `mutateMeta`（`true` = 落盘成功**或**无需写入），**不是**四态版本，理由三条：
 *   ① **没有可执行的分叉**：本函数只 `await` 那一次事务、**不看**结果，也不改变本次读的输出 ——
 *      `contended` 与 `failed` 在此都只意味着「这一次命中没记上」，**处置完全相同**（都不重试、
 *      都不上报、都不影响返回值：契约是 `Promise<void>`）。四态拿回来也无处可用；
 *   ② **本仓已明文裁定这件事可以丢**：ADR-0068 的「重试耗尽的语义」写着「放弃这一次更新
 *      （**宁可少记一次命中**，也不覆盖别人的写入）并打日志」⇒ `contended` 属**设计内**，不是降级；
 *   ③ **没有可见信号通道，且真写失败不会只剩这一处静默**：本函数签名只收 `(fs, ws, rels, opts)`，
 *      调用点在 8+ 个**读**路径上（`noteServedAtoms`），要带信号得改签名 + 全部调用点，去服务一个
 *      **遥测量**；而 `failed` 是**系统性**的（磁盘满 / EACCES / 坏件），同一条 `_meta.json` 上的
 *      写侧调用点（`registerMeta` 的 `lastMetaError`、`runCompact` 的 degrade 台账）会在同一次
 *      flush 里把信号带上横幅 ⇒ 不会出现「只有命中数静默丢」的盲区。
 * ⚠ 反过来：若将来命中数**变得可执行**（例如据它做裁剪/结算），就必须改调
 * `mutateMetaVersioned` 并把 `contended` 单独带出去 —— 那时「少记一次」不再是免费的。
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
