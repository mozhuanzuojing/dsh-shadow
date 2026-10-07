// dsh-shadow —— selfhood/identity/timeline.ts：Identity Timeline（一等对象，time-sliced；不覆盖 soul.json）。
// 核心思想：未来和现在同在，灵魂知道，但体验每一步 → Identity 也是时间切片 Identity(t0)/t1/t2，不是 mutable row。
// 存储：.shadow/identity/<at>-v<N>.json（不可变版本）+ .shadow/identity/timeline.md（索引）。Core 来自 soul.json（curated 稳定锚）。
//
// B18（v1.22.x）：`readIdentityVersions` 旧实现把 `readText` 与 `JSON.parse` 放进**同一个 `try`**
// 且外层 `catch { /* 无 identity 目录 */ }` —— 一份坏件会**跳出整个 for 循环**（后续版本不再读）、
// 且与「目录不存在」不可区分。后果是静默的：`readCurrentIdentity` 随后返回**更旧**的版本，
// `nextVersion` 于是在同一个旧版本号上重复推进 —— **身份演化的序号会静默重号**。
// 现在：`JSON.parse` 独立 try，坏件**计数后 `continue`**，外层只保留「目录读不到」，
// 并把 `skipped`/`readFailure` 交给调用方（`selfhood/identity/evaluator.ts` → `query/observer-kernel.ts`），
// 让 `mode:"identity-advance"` 的输出能说明「本次判定基于被削过的版本历史」（ADR-0049）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { IdentityModel } from "./types.js";
import { readSoul } from "../../subject/soul/soul.js";
import { today, isNotFound, errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";
import { scrubUnsafe } from "../../security/scrub.js";

// 从 soul.json 造 v1（当前数据模型里 identity/principles/boundaries + values/anti_patterns/decision_style）。
export const identityV1Of = async (fs: any, ws: string, agentId?: string): Promise<IdentityModel> => {
  const soul = await readSoul(fs, ws);
  return {
    version: "v1",
    at: today(),
    core: { observerId: soul?.identity?.name || soul?.identity?.role || agentId || "unknown", values: Array.isArray(soul?.values) ? soul.values : [] },
    learned: [],
    currentModel: {
      decisionStyle: Array.isArray(soul?.decision_style) ? soul.decision_style : (Array.isArray(soul?.decisionStyle) ? soul.decisionStyle : []),
      antiPatterns: Array.isArray(soul?.anti_patterns) ? soul.anti_patterns : (Array.isArray(soul?.antiPatterns) ? soul.antiPatterns : []),
    },
  };
};

export const nextVersion = (v: string) => `v${(parseInt(String(v || "v0").replace(/\D/g, ""), 10) || 0) + 1}`;

/** 版本历史的读取结果：`versions` 之外还要带出**被削掉了多少**（B18 —— 静默削样本是这条的病根）。 */
export interface IdentityVersions {
  versions: IdentityModel[];
  /** 读不出/坏件而**跳过**的版本文件数（>0 ⇒ 本次的「当前版本」可能偏旧）。 */
  skipped: number;
  /** **目录级**读不出来（不是「还没有 identity 目录」）的真实原因。 */
  readFailure?: string;
}

export const readIdentityVersions = async (fs: any, ws: string): Promise<IdentityVersions> => {
  const versions: IdentityModel[] = [];
  let skipped = 0;
  if (!fs || !ws) return { versions, skipped, readFailure: "无 fs 或无工作区 ⇒ 读不出 identity 版本" };
  let root: any;
  try {
    root = await fs.resolve(`${ws}/${SHADOW_ROOT}/identity`, { cwd: ws });
  } catch (e: any) {
    // 「目录还不存在」= 全新工作区（正常）；其余 = 事故。
    return isNotFound(e) ? { versions, skipped } : { versions, skipped, readFailure: `定位 .shadow/identity 失败：${errText(e)}` };
  }
  let files: any[] = [];
  try {
    files = (await fs.listDir(root)) || [];
  } catch (e: any) {
    return isNotFound(e) ? { versions, skipped } : { versions, skipped, readFailure: `列举 .shadow/identity 失败：${errText(e)}` };
  }
  for (const f of files) {
    if (!f?.name || !f.name.endsWith(".json")) continue;
    let raw = "";
    try {
      const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/identity/${f.name}`, { cwd: ws });
      raw = await fs.readText(p);
    } catch (e: any) {
      // **单个文件读不出来 ⇒ 跳过并计数**（旧版落在外层 catch ⇒ 整个循环终止、后续版本全丢）。
      skipped += 1;
      continue;
    }
    if (!raw) continue;
    // **`JSON.parse` 独立 try**（B18）：坏件跳过后**继续**读更旧的版本，而不是终止整轮。
    try {
      const m = JSON.parse(raw);
      if (m && m.version) versions.push(m);
      else skipped += 1; // 结构不对（无 version）同样算「读不出有效版本」
    } catch {
      skipped += 1;
    }
  }
  return { versions: versions.sort((a, b) => (parseInt(a.version.replace(/\D/g, "")) || 0) - (parseInt(b.version.replace(/\D/g, "")) || 0)), skipped };
};

export const readCurrentIdentity = async (fs: any, ws: string, agentId?: string): Promise<IdentityModel> => {
  const { versions } = await readIdentityVersions(fs, ws);
  return versions.length ? versions[versions.length - 1] : identityV1Of(fs, ws, agentId);
};

// 写一个不可变版本切片 + 重建 timeline.md 索引（推进 self-model，干净、可回放）。
// B2：返回 `{ok, reason}` —— 旧版只 `console.log`，而调用点（`evaluator.advanceIdentity`）随后
// 无条件返回「version vN」，读者因此以为时间线已推进（ADR-0049 规则 3：绝不冒充成功）。
export const writeIdentityVersion = async (fs: any, ws: string, model: IdentityModel): Promise<PersistOutcome> => {
  const rel = `${SHADOW_ROOT}/identity/${model.at}-${model.version}.json`;
  if (!fs || !ws) return { ok: false, reason: `无 fs 或无工作区 ⇒ 未写 ${rel}` };
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(model, null, 2));
  } catch (e: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
  }
  // 索引是派生件：切片已落盘，索引写失败**也必须说出来**（读者会按索引找版本）。
  try {
    const { versions } = await readIdentityVersions(fs, ws);
    const idx = ["# Identity Timeline", ""].concat(
      versions.map((v) => `- \`${v.version}\` ${v.at} · observer ${v.core.observerId} · learned ${v.learned.length} · core.values ${v.core.values.length}`),
    );
    const ti = await fs.resolve(`${ws}/${SHADOW_ROOT}/identity/timeline.md`, { cwd: ws });
    await fs.writeText(ti, idx.join("\n"));
  } catch (e: any) {
    return { ok: false, reason: `切片已落盘，但 timeline.md 索引写入失败：${errText(e)}` };
  }
  return { ok: true };
};

// 接线（架构加深 P4）：`mode:"identity-advance"` 在 evaluator 块之后调用本函数。
// `args.identity:true` 仍走 soul 形 `renderIdentity` —— IdentityModel ≠ Identity。
export const renderIdentityModel = (m: IdentityModel) => {
  const lines = ["[Identity]"];
  lines.push(`version ${m.version} · at ${m.at}`);
  lines.push(`core observer ${scrubUnsafe(m.core.observerId)} · values ${m.core.values.join("、") || "—"}`);
  if (m.learned.length) lines.push(`learned:`);
  for (const l of m.learned.slice(0, 6)) lines.push(`  ${l.text} (conf ${l.confidence.toFixed(2)} · ${l.source})`);
  if (m.currentModel.decisionStyle.length) lines.push(`decisionStyle ${m.currentModel.decisionStyle.join("、")}`);
  if (m.currentModel.antiPatterns.length) lines.push(`antiPatterns ${m.currentModel.antiPatterns.join("、")}`);
  return lines.join("\n");
};
