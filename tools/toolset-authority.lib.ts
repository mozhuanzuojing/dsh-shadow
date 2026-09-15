#!/usr/bin/env node
// dsh-shadow —— tools/toolset-authority.lib.ts：台账权威对照的**纯判据**（CLI 与棘轮测试共用同一份）。
//
// 拆出来的理由（与 `audit-wiring.lib.ts` / `audit-drift.lib.ts` 同）：棘轮测试必须验**同一份逻辑**，
// 否则测试过了产品没改、或反之。全部纯函数，不做 IO、不调 winget。

import { verSrcLabel } from "../core/util.ts";

/**
 * 读出一条条目的**出处声明**（v1.15.89 / ADR-0090 —— rtk「甲-3」：**类型化字段是唯一事实源**）。
 *
 * 此前它 `String(note).match(/·\s*(实测|权威核验)\s+([^\s·]+)/)` —— **正则反解散文**：
 *   出处的措辞一改（或有人把弱档写成强档的措辞），判据就**静默返回 null**（被当成「未标」）。
 *   这正是 rtk `discover/report.rs:99-131` 那句注释要防的形态（*"Kept as its own field …
 *   instead of silently going quiet about it"*），也是本仓 ADR-0072 的续。
 * 现在读 `verSrcKind` / `verSrcVersion` 两个**类型化字段**；未知/非法取值一律 `null`（=「未标」），
 *   **不许默认成强档** —— 弱档被折进散文的那条路，从这里被堵死。
 */
export const claimOf = (
  cap: { verSrcKind?: unknown; verSrcVersion?: unknown } | null | undefined,
): { verSrc: string; ver: string } | null => {
  const label = verSrcLabel(cap?.verSrcKind);
  const version = cap?.verSrcVersion;
  if (!label || typeof version !== "string" || !version) return null;
  return { verSrc: label, ver: version };
};

export interface AuthorityRow {
  id: string;
  pkg: string;
  ledgerVerSrc: string;
  ledgerVersion: string;
  authorityVersion: string;
  machineVersion: string | null;
  status: string;
}

/**
 * **「实测」标签是否被本机读数佐证**（ADR-0072 的核心判据）。
 *
 * `"实测"` 的定义（`core/toolset.ts`）：*「在**本机**跑该条目的 `probe`（如 `--version`）拿到版本号」*。
 * ⇒ 一条标 `"实测"` 的记录，**必须**有本机读数，且**与本机读数相符**；
 *    否则该标签就是**比事实强**（本 ADR 修掉的正是这个）。
 *
 * 返回违规行。空数组 = 全部标签都有据。
 */
export const unsubstantiatedMeasured = (rows: AuthorityRow[]): AuthorityRow[] =>
  rows.filter((r) => r.ledgerVerSrc === "实测" && r.machineVersion !== r.ledgerVersion);

/**
 * 台账侧与清单的**不一致行**（版本或出处被改过但没重跑生成器）。
 *
 * 这是**离线棘轮**：不联网也能发现「台账被静默改动」。
 *
 * **范围（v1.15.29 测试暴露的修正）**：只比对**有 `winget` 包**的条目 ——
 * 清单就是按这个范围生成的（101/107）。无 winget 包的 6 条（zg/semble/tmux/viddy/tig/ip）
 * **不在清单里**，若拿它们去比会报出 6 条「清单无此条」的**假不一致**。
 *
 * 注意它**不**把「老化」（台账版本 < winget 现值）算作不一致 —— 那是目录推进的正常现象，
 * 已记录在 `status`/`authorityVersion` 里供人看，不该让测试常红。
 */
export const ledgerMismatch = (
  current: { id: string; verSrcKind?: unknown; verSrcVersion?: unknown; winget?: string }[],
  manifest: AuthorityRow[],
): { id: string; was: string; now: string }[] => {
  const byId = new Map(manifest.map((r) => [r.id, r]));
  const out: { id: string; was: string; now: string }[] = [];
  for (const c of current) {
    if (!c.winget) continue; // 清单范围外（无 winget 包）—— 不参与比对
    const claim = claimOf(c);
    const now = claim ? `${claim.verSrc} ${claim.ver}` : "(未标)";
    const m = byId.get(c.id);
    if (!m) { out.push({ id: c.id, was: "(清单无此条)", now }); continue; }
    const was = `${m.ledgerVerSrc} ${m.ledgerVersion}`;
    if (was !== now) out.push({ id: c.id, was, now });
  }
  return out;
};

/** 清单自洽性：`counts` 必须与 `rows` 实际相符。 */
export const countInconsistency = (manifest: { counts: Record<string, number>; rows: AuthorityRow[] }): string[] => {
  const rows = manifest.rows || [];
  const c = manifest.counts || {};
  const errs: string[] = [];
  const expect: Record<string, number> = {
    total: rows.length,
    ok: rows.filter((r) => r.status === "ok").length,
    aged: rows.filter((r) => r.status === "version-drift").length,
    unavailable: rows.filter((r) => r.status === "unavailable").length,
    notFound: rows.filter((r) => r.status === "not-found").length,
    idMismatch: rows.filter((r) => r.status === "id-mismatch").length,
    falseMeasured: unsubstantiatedMeasured(rows).length,
  };
  for (const [k, v] of Object.entries(expect)) if (c[k] !== v) errs.push(`counts.${k} = ${c[k]}，实际应为 ${v}`);
  return errs;
};
