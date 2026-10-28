/**
 * v2 engine — 派生件物化：材料卡 / 纪要 / Episode / abstract。
 *
 * 现状缺口（docs/v2/STATUS.md「派生件物化」）：此前只有 `indexes/_index.md` 落盘，
 * 其余派生视图只在读时内存计算，外部读者拿不到。本模块把四类派生件**物化到磁盘**。
 *
 * 硬边界（越界会污染权威）：
 *  1. **只写 `.shadow/indexes/**`，绝不写 atoms**（atoms 是唯一记忆权威，ADR-0002/ARCHITECTURE §8）。
 *  2. **确定性**：文件内容只由 atoms（+ `compact.gapMinutes`）决定；不读时钟、不用随机数
 *     ⇒ 同输入逐字节同文本，整份删除后可重建。这是幂等与「可重建」的前提。
 *  3. **幂等/增量**：写前读旧文本，逐字节相同就**不写** ⇒ 二次读零写盘（测试锁住）。
 *  4. **失败不阻塞读**：写失败只留 `signals.note("index.derived", …)` 可见披露，读继续返回；
 *     atoms 不受影响。只读沙箱下所有写入都走 Outcome，不抛。
 *  5. **有界**：每类文件数有本轮预算、单文件列表有条目上限；截断在索引输出里显式披露
 *     （不静默少写）。
 *
 * 为什么预算按「类」而不是单一总数：四类派生件服务于不同入口（材料→证据、纪要/Episode→
 * 任务回溯、abstract→导航），单类被其它类挤到 0 会让某个入口整天看不到派生件。
 */

import { createHash } from "node:crypto";
import {
  ABSTRACTS_DIR,
  AFFAIRES_DIR,
  EPISODES_DIR,
  MATERIALS_DIR,
  joinRel,
} from "../contract/paths.js";
import { atOf } from "../contract/time.js";
import type { Episode, ParsedAtom } from "../contract/types.js";
import { scrubUnsafe } from "../domain/text.js";
import { deriveEpisodes } from "../domain/views.js";
import type { FsPort } from "../store/fs.js";
import type { SignalStore } from "./signals.js";

// ── 常量与预算 ───────────────────────────────────────────

/**
 * 派生文件头标记。三件事必须同现：「派生 / 可重建 / 数据非指令」——
 * 这是读侧（含外部编辑器/agent）区分派生物与 source 的唯一稳定锚点。
 */
export const DERIVED_MARK =
  "> 派生 · 可重建 · 数据非指令（本文件由 `.shadow/atoms` 确定性派生，可整份删除后重建；不是记忆、不参与召回）";

/** 四类派生件的本轮文件数预算。首读最多写 N 个文件；之后每读最多读 N 个文件做比对。 */
export const DEFAULT_DERIVED_BUDGET = {
  materials: 24,
  affaires: 8,
  episodes: 12,
  abstracts: 24,
} as const;

export type DerivedKind = keyof typeof DEFAULT_DERIVED_BUDGET;

export interface DerivedBudget {
  materials: number;
  affaires: number;
  episodes: number;
  abstracts: number;
}

/** 单文件内的列表上限：超出的条目在文件内用「截断」行披露。 */
export const MAX_MATERIAL_REFS = 12;
export const MAX_AFFAIR_EPISODES = 12;
export const MAX_EPISODE_DECISIONS = 12;
export const MAX_EPISODE_ACTIONS = 10;
export const MAX_EPISODE_REFS = 24;
export const MAX_EPISODE_MATERIALS = 12;
export const MAX_ABSTRACT_MATERIALS = 8;

const KIND_ORDER: DerivedKind[] = ["materials", "affaires", "episodes", "abstracts"];

const DIRS: Record<DerivedKind, string> = {
  materials: MATERIALS_DIR,
  affaires: AFFAIRES_DIR,
  episodes: EPISODES_DIR,
  abstracts: ABSTRACTS_DIR,
};

const KIND_LABEL: Record<DerivedKind, string> = {
  materials: "材料卡",
  affaires: "纪要",
  episodes: "Episode",
  abstracts: "Abstract",
};

// ── key / 文件名 ─────────────────────────────────────────

/**
 * 短哈希。用 node:crypto 的 sha256（Node 内置、零运行期依赖），**不用随机数**：
 * 文件名必须由内容唯一决定，否则每次读都会换文件名 ⇒ 幂等与「可重建」同时失效。
 */
const shortHash = (s: string): string => createHash("sha256").update(String(s), "utf8").digest("hex").slice(0, 8);

/** 可用于文件名的可读 slug（保留 ASCII 可读前缀，中文等会被折叠成 `-`）。 */
const safeSlug = (s: string, max = 40): string => {
  const t = String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return t.slice(0, max).replace(/[.-]+$/g, "") || "item";
};

/** `<可读 slug>-<短哈希>`：可读前缀给人看，哈希保证不同 key 不撞名。 */
const fileKey = (raw: string, max = 40): string => `${safeSlug(raw, max)}-${shortHash(raw)}`;

/**
 * 材料 key 归一（**唯一实现**）。
 *
 * 路径类：反斜杠→正斜杠、折叠重复斜杠、去尾斜杠、盘符大写、整体小写 ——
 * Windows 路径大小写不敏感，不归一会让同一份材料裂成两张卡（派生件自己就先烂了）。
 * 非路径类（报题/术语）：折叠空白 + 小写。
 */
export const materialKey = (raw: string): string => {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const pathLike =
    /^[A-Za-z]:[\\/]/.test(s) || s.startsWith("/") || s.startsWith("./") || s.includes("/") || s.includes("\\");
  if (pathLike) {
    const p = s
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase();
    // 盘符在「整体小写」之后再大写：顺序反了会白做（sha 相同但 key 不同 ⇒ 裂卡）。
    return p.replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`);
  }
  return s.replace(/\s+/g, " ").toLowerCase();
};

// ── 纯派生：atoms → 计划（无 I/O，可单测） ────────────────

export interface PlannedDerivedFile {
  kind: DerivedKind;
  /** workspace 相对路径（POSIX 分隔符）：`.shadow/indexes/<kind>/<key>.md`。 */
  rel: string;
  text: string;
}

export interface DerivedPlan {
  files: PlannedDerivedFile[];
  /** 未截断前的候选总数（= 语料里实际有多少张卡/份纪要/个 Episode/条 abstract）。 */
  total: Record<DerivedKind, number>;
  /** 本轮纳入预算的文件数。 */
  picked: Record<DerivedKind, number>;
  budget: DerivedBudget;
}

const atomOrder = (a: ParsedAtom, b: ParsedAtom): number =>
  `${a.date} ${a.time} ${a.rel}`.localeCompare(`${b.date} ${b.time} ${b.rel}`);

const budgetOf = (partial?: Partial<DerivedBudget>): DerivedBudget => {
  const out: DerivedBudget = { ...DEFAULT_DERIVED_BUDGET };
  if (!partial) return out;
  for (const kind of KIND_ORDER) {
    const v = partial[kind];
    // 显式 0 保留（= 本类不物化）；只有 undefined/NaN/非有限值才回落默认。
    if (v === undefined) continue;
    const n = Number(v);
    out[kind] = Number.isFinite(n) ? Math.max(0, Math.min(500, Math.floor(n))) : DEFAULT_DERIVED_BUDGET[kind];
  }
  return out;
};

interface MaterialRef {
  rel: string;
  at: string;
  entry: string;
}

interface MaterialAgg {
  key: string;
  source: string;
  refs: MaterialRef[];
}

/** 按归一 key 聚合材料引用（给定 atoms 已按时间升序 ⇒ refs 天然按首见顺序排列）。 */
const aggregateMaterials = (sorted: ParsedAtom[]): MaterialAgg[] => {
  const map = new Map<string, MaterialAgg>();
  for (const a of sorted) {
    const at = atOf(a.date, a.time);
    for (const raw of a.materials) {
      const key = materialKey(raw);
      if (!key) continue;
      let agg = map.get(key);
      if (!agg) {
        agg = { key, source: String(raw).trim(), refs: [] };
        map.set(key, agg);
      }
      // 同一 atom 重复列出同一材料（v1 旧文件可能）只算一次引用。
      if (!agg.refs.some((r) => r.rel === a.rel)) {
        agg.refs.push({ rel: a.rel, at, entry: a.entry || a.slug || "(无入口)" });
      }
    }
  }
  return [...map.values()];
};

interface AffairAgg {
  key: string;
  project: string;
  agent: string;
  episodes: Episode[];
}

/** 按 `project|agent` 聚合 Episode（= 纪要的归属轴）。 */
const aggregateAffairs = (episodes: Episode[]): AffairAgg[] => {
  const map = new Map<string, AffairAgg>();
  for (const e of episodes) {
    const key = `${e.project || ""}|${e.agent || ""}`;
    let agg = map.get(key);
    if (!agg) {
      agg = { key, project: e.project, agent: e.agent, episodes: [] };
      map.set(key, agg);
    }
    agg.episodes.push(e);
  }
  for (const agg of map.values()) agg.episodes.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  return [...map.values()];
};

const affairLabel = (a: AffairAgg): string =>
  `${a.project || "（未标注项目）"} · ${a.agent || "（未标注 Agent）"}`;

const lastEnded = (a: AffairAgg): string => a.episodes[a.episodes.length - 1]?.endedAt ?? "";

const cut = (s: unknown, n: number): string => scrubUnsafe(String(s ?? "")).replace(/\s+/g, " ").trim().slice(0, n);

// ── 渲染（纯函数；同一输入必须逐字节同文本） ──────────────

const renderMaterialCard = (m: MaterialAgg): string => {
  const first = m.refs[0];
  const last = m.refs[m.refs.length - 1];
  const lines = [
    `# 材料卡：${cut(m.source, 120)}`,
    "",
    DERIVED_MARK,
    `> key：\`${m.key}\``,
    `> 引用：${m.refs.length} 条记忆`,
    `> 首见：${first ? first.at : "—"} · 末见：${last ? last.at : "—"}`,
    "",
    "## 相关记忆",
  ];
  const shown = m.refs.slice(0, MAX_MATERIAL_REFS);
  for (const r of shown) lines.push(`- ${r.at} · ${cut(r.entry, 60)} · \`${r.rel}\``);
  if (m.refs.length > shown.length) {
    lines.push("", `> 截断：仅列前 ${shown.length}/${m.refs.length} 条记忆引用（单文件上限 ${MAX_MATERIAL_REFS}）。`);
  }
  return `${lines.join("\n")}\n`;
};

/**
 * 纪要选择「内容变化才重写」而不是「只追加」。
 *
 * 为什么不只追加：只追加需要外部记住「上次追加到哪一段」，而本层是**无状态派生**
 * （可整份删除重建）。一旦这份外部状态丢失/回滚，就会重复追加，破坏幂等；而派生件
 * 一旦不幂等，二次读写盘、内容漂移都会出现。故每次由 Episode 全集重算、逐字节比对后
 * 才写 —— 少写盘（增量收益）仍在，语义始终是「当前快照」。
 */
const renderAffair = (a: AffairAgg): string => {
  const first = a.episodes[0];
  const last = a.episodes[a.episodes.length - 1];
  const lines = [
    `# 纪要：${affairLabel(a)}`,
    "",
    DERIVED_MARK,
    `> key：\`${a.key}\`（文件名用短哈希，避免项目/Agent 名里的路径字符）`,
    `> Episode：${a.episodes.length} 个 · 跨度 ${first ? first.startedAt : "—"} → ${last ? last.endedAt : "—"}`,
    "",
    "## Episode 纪要",
  ];
  const shown = a.episodes.slice(0, MAX_AFFAIR_EPISODES);
  for (const e of shown) {
    const range = e.startedAt === e.endedAt ? e.startedAt : `${e.startedAt} → ${e.endedAt}`;
    lines.push("", `### ${range} · ${cut(e.title, 80)}`);
    if (e.objective && e.objective !== e.title) lines.push(`- 目标：${cut(e.objective, 100)}`);
    lines.push(`- 规模：${e.memoryCount} 条记忆 · ${e.decisions.length} 决策 · ${e.actions.length} 动作`);
    if (e.decisions.length) lines.push(`- 决策：${e.decisions.slice(0, 6).map((d) => cut(d.text, 80)).join("；")}`);
    if (e.actions.length) lines.push(`- 动作：${e.actions.slice(0, 4).map((x) => cut(x.text, 80)).join("；")}`);
    const refs = e.memoryRefs.slice(0, 8).map((r) => `\`${r.split("/").pop()}\``).join("、");
    lines.push(`- 记忆：${refs || "—"}${e.memoryRefs.length > 8 ? `（共 ${e.memoryRefs.length} 条）` : ""}`);
  }
  if (a.episodes.length > shown.length) {
    lines.push("", `> 截断：仅列前 ${shown.length}/${a.episodes.length} 个 Episode（单文件上限 ${MAX_AFFAIR_EPISODES}）。`);
  }
  return `${lines.join("\n")}\n`;
};

const renderEpisode = (e: Episode): string => {
  const lines = [
    `# Episode：${cut(e.title, 120)}`,
    "",
    DERIVED_MARK,
    `> id：\`${e.id}\``,
    `> 时间：${e.startedAt} → ${e.endedAt}`,
    `> 项目：${e.project || "（未标注）"} · Agent：${e.agent || "（未标注）"}`,
    `> 规模：${e.memoryCount} 条记忆 · ${e.decisions.length} 决策 · ${e.actions.length} 动作`,
  ];
  if (e.objective && e.objective !== e.title) lines.push(`> 目标：${cut(e.objective, 120)}`);
  if (e.entries.length) lines.push(`> 入口：${e.entries.slice(0, 8).map((x) => cut(x, 40)).join("、")}`);
  if (e.decisions.length) {
    lines.push("", "## 决策链");
    const shown = e.decisions.slice(0, MAX_EPISODE_DECISIONS);
    for (const d of shown) lines.push(`- ${d.at} · ${cut(d.text, 120)} · \`${d.rel}\``);
    if (e.decisions.length > shown.length) {
      lines.push(`> 截断：仅列前 ${shown.length}/${e.decisions.length} 条决策（单文件上限 ${MAX_EPISODE_DECISIONS}）。`);
    }
  }
  if (e.actions.length) {
    lines.push("", "## 动作");
    const shown = e.actions.slice(0, MAX_EPISODE_ACTIONS);
    for (const x of shown) lines.push(`- ${x.at} · ${cut(x.text, 120)}`);
    if (e.actions.length > shown.length) {
      lines.push(`> 截断：仅列前 ${shown.length}/${e.actions.length} 条动作（单文件上限 ${MAX_EPISODE_ACTIONS}）。`);
    }
  }
  if (e.materials.length) {
    lines.push("", "## 材料");
    const shown = e.materials.slice(0, MAX_EPISODE_MATERIALS);
    for (const m of shown) lines.push(`- \`${cut(m, 120)}\``);
    if (e.materials.length > shown.length) {
      lines.push(`> 截断：仅列前 ${shown.length}/${e.materials.length} 条材料（单文件上限 ${MAX_EPISODE_MATERIALS}）。`);
    }
  }
  lines.push("", "## 记忆引用");
  const refs = e.memoryRefs.slice(0, MAX_EPISODE_REFS);
  for (const r of refs) lines.push(`- \`${r}\``);
  if (e.memoryRefs.length > refs.length) {
    lines.push(`> 截断：仅列前 ${refs.length}/${e.memoryRefs.length} 条记忆引用（单文件上限 ${MAX_EPISODE_REFS}）。`);
  }
  return `${lines.join("\n")}\n`;
};

const renderAbstract = (a: ParsedAtom): string => {
  const axes = a.axes;
  const summary = a.summary
    ? cut(a.summary, 240)
    : "（未采集摘要 —— 不补写；以 atoms 原文为准）";
  const lines = [
    `# Abstract：${cut(a.entry || a.slug || a.name, 120)}`,
    "",
    DERIVED_MARK,
    `> 原子：\`${a.rel}\``,
    `> 时间：${atOf(a.date, a.time)}`,
    `> 摘要：${summary}`,
    "",
    "## 五轴",
    `- locus：${axes.locus ? cut(axes.locus, 120) : "（未标注）"}`,
    `- when：${axes.when ? cut(axes.when, 80) : "（未标注）"}`,
    `- soul：${axes.soul ? cut(axes.soul, 60) : "（未标注）"}`,
    `- role：${axes.role ? cut(axes.role, 60) : "（未标注）"}`,
    `- intent：${axes.intent ? cut(axes.intent, 120) : "（未标注）"}`,
    "",
    "## 路径句柄",
    `- 记忆文件：\`${a.rel}\``,
    `- 入口：${a.entry ? cut(a.entry, 120) : "（无入口）"}`,
  ];
  if (a.materials.length) {
    const shown = a.materials.slice(0, MAX_ABSTRACT_MATERIALS);
    lines.push(`- 材料：${shown.map((m) => `\`${cut(m, 80)}\``).join("、")}${a.materials.length > shown.length ? `（共 ${a.materials.length} 条）` : ""}`);
  }
  return `${lines.join("\n")}\n`;
};

/** 从 atoms 计划全部派生文件（纯函数）。 */
export const planDerived = (
  atoms: ParsedAtom[],
  opts: { gapMinutes?: number; budget?: Partial<DerivedBudget> } = {},
): DerivedPlan => {
  const budget = budgetOf(opts.budget);
  const sorted = [...atoms].sort(atomOrder);
  const gapMinutes = Number.isFinite(Number(opts.gapMinutes)) ? Math.max(0, Number(opts.gapMinutes)) : 60;
  const episodes = deriveEpisodes(atoms, gapMinutes);

  // 排序即截断优先级（确定性）：引用多的材料先物化；最近活动的纪要/Episode/abstract 先物化。
  const materials = aggregateMaterials(sorted).sort((a, b) => b.refs.length - a.refs.length || a.key.localeCompare(b.key));
  const affairs = aggregateAffairs(episodes).sort((a, b) => lastEnded(b).localeCompare(lastEnded(a)) || a.key.localeCompare(b.key));
  const epSorted = [...episodes].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id));
  const absSorted = [...sorted].sort(
    (a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) || a.rel.localeCompare(b.rel),
  );

  const total: Record<DerivedKind, number> = {
    materials: materials.length,
    affaires: affairs.length,
    episodes: epSorted.length,
    abstracts: absSorted.length,
  };
  const pick = <T>(items: T[], n: number): T[] => items.slice(0, Math.max(0, Math.floor(n)));
  const pickedMaterials = pick(materials, budget.materials);
  const pickedAffairs = pick(affairs, budget.affaires);
  const pickedEpisodes = pick(epSorted, budget.episodes);
  const pickedAbstracts = pick(absSorted, budget.abstracts);
  const picked: Record<DerivedKind, number> = {
    materials: pickedMaterials.length,
    affaires: pickedAffairs.length,
    episodes: pickedEpisodes.length,
    abstracts: pickedAbstracts.length,
  };

  const files: PlannedDerivedFile[] = [];
  for (const m of pickedMaterials) {
    files.push({ kind: "materials", rel: joinRel(DIRS.materials, `${fileKey(m.key)}.md`), text: renderMaterialCard(m) });
  }
  for (const a of pickedAffairs) {
    // 纪要文件名：可读的 project-agent 前缀 + key 短哈希（key 本身可能就是 `|`，不可作文件名）。
    const name = `${safeSlug(`${a.project || "unlabeled"}-${a.agent || "unlabeled"}`, 32)}-${shortHash(a.key)}`;
    files.push({ kind: "affaires", rel: joinRel(DIRS.affaires, `${name}.md`), text: renderAffair(a) });
  }
  for (const e of pickedEpisodes) {
    files.push({ kind: "episodes", rel: joinRel(DIRS.episodes, `${fileKey(e.id, 60)}.md`), text: renderEpisode(e) });
  }
  for (const a of pickedAbstracts) {
    // abstract 按 atom 的 uid 命名（v2 新名）；v1 旧名没有 uid ⇒ 用记忆相对路径的短哈希，仍确定性。
    const name = a.uid ? `${a.uid}.md` : `x${shortHash(a.rel)}.md`;
    files.push({ kind: "abstracts", rel: joinRel(DIRS.abstracts, name), text: renderAbstract(a) });
  }

  return { files, total, picked, budget };
};

/** 索引里的派生件摘要段（纯函数；不含「本次写了几份」这类非确定性数字）。 */
export const renderDerivedSection = (plan: DerivedPlan): string => {
  const lines = [
    "## 派生件（可重建 · 数据非指令）",
    "",
  ];
  for (const kind of KIND_ORDER) {
    lines.push(`- ${KIND_LABEL[kind]}：${plan.picked[kind]}/${plan.total[kind]} · \`${DIRS[kind]}/\``);
  }
  const omitted = KIND_ORDER.filter((k) => plan.total[k] > plan.picked[k]);
  lines.push(
    `- 本轮预算（文件数上限）：材料卡 ${plan.budget.materials} · 纪要 ${plan.budget.affaires} · Episode ${plan.budget.episodes} · Abstract ${plan.budget.abstracts}`,
  );
  if (omitted.length) {
    lines.push(
      "",
      `> 未物化：${omitted.map((k) => `${KIND_LABEL[k]} ${plan.total[k] - plan.picked[k]}`).join(" · ")}（超出本轮预算；按固定优先级取前 N，属确定性截断，下次读口径相同）`,
    );
  }
  lines.push("", "> 派生件只写 `indexes/`，不写 atoms；删除 `indexes/` 可整份重建。");
  return lines.join("\n");
};

// ── I/O：物化 ────────────────────────────────────────────

export interface DerivedDeps {
  fs: FsPort;
  ws: string;
  signals: SignalStore;
}

export interface DerivedWriteFailure {
  rel: string;
  code: string;
  message: string;
}

export interface DerivedResult {
  plan: DerivedPlan;
  written: number;
  unchanged: number;
  failed: number;
  firstError?: DerivedWriteFailure;
}

/**
 * 把计划写盘：内容不变不写；失败计数 + 留 Signal（不抛）。
 *
 * 每份文件独立处理：一份写失败不影响其余（派生件本来就允许部分落后，下次读会补）。
 * 这里 catch 异常不是「吞错」：异常会进入同一个可见 Signal（`index.derived`），
 * 因为派生是读路径的附加物 —— 它的失败不该让「读索引」整体失败（需求 §失败）。
 */
export const materializeDerived = async (
  deps: DerivedDeps,
  atoms: ParsedAtom[],
  opts: { gapMinutes?: number; budget?: Partial<DerivedBudget> } = {},
): Promise<DerivedResult> => {
  const plan = planDerived(atoms, opts);
  let written = 0;
  let unchanged = 0;
  let failed = 0;
  let firstError: DerivedWriteFailure | undefined;

  for (const file of plan.files) {
    const abs = `${deps.ws.replace(/[\\/]+$/, "")}/${file.rel}`;
    try {
      const existing = await deps.fs.readText(abs);
      if (existing.ok && existing.value === file.text) {
        unchanged += 1;
        continue;
      }
      const w = await deps.fs.writeText(abs, file.text);
      if (w.ok) {
        written += 1;
        continue;
      }
      failed += 1;
      firstError ??= { rel: file.rel, code: w.error.code, message: w.error.message };
    } catch (e) {
      failed += 1;
      firstError ??= { rel: file.rel, code: "INTERNAL", message: e instanceof Error ? e.message : String(e) };
    }
  }

  if (failed) {
    deps.signals.note(
      "index.derived",
      firstError?.code ?? "IO",
      `派生件写入失败 ${failed}/${plan.files.length} 个（首个：${firstError?.rel ?? "?"}：${firstError?.message ?? "未给出原因"}）`,
      "本次读返回值不受影响；磁盘上的派生件可能陈旧；atoms 是权威、未被修改。",
    );
  } else {
    deps.signals.clear("index.derived");
  }
  return { plan, written, unchanged, failed, firstError };
};

/**
 * indexView 专用入口：物化 + 渲染索引段。**不抛**——派生失败只留 Signal，
 * 读索引必须继续成功（需求 §失败：写失败不阻塞读）。
 */
export const indexDerivedSection = async (
  deps: DerivedDeps,
  atoms: ParsedAtom[],
  gapMinutes: number,
): Promise<string> => {
  try {
    const result = await materializeDerived(deps, atoms, { gapMinutes });
    return `\n\n${renderDerivedSection(result.plan)}`;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    deps.signals.note(
      "index.derived",
      "INTERNAL",
      `派生件物化异常（${message}）`,
      "本次索引没有派生件段落；读仍返回索引；atoms 未受影响。",
    );
    return "";
  }
};
