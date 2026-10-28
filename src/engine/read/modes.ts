/**
 * v2 engine/read — 10 个 core mode 的纯读实现。
 *
 * 所有 handler 只返回 body + 计数；前缀/信号/预算信封由 route 统一加。
 */

import { INDEX_MD } from "../../contract/paths.js";
import type { ParsedAtom } from "../../contract/types.js";
import { evidencePathsOf, isConcreteLocator, tokenize } from "../../domain/text.js";
import {
  deriveContextRefs,
  deriveDecisions,
  deriveEpisodes,
  deriveTasks,
  renderContextRefs,
  renderDecisions,
  renderEpisodes,
  renderRecovery,
  renderRecoveryFor,
  renderTasks,
  rankTasks,
} from "../../domain/views.js";
import { scoreAtoms, selectWithinBudget, renderTopicRecall, supersededRels } from "./recall.js";
import type { ModeOutput, ReadDeps, ReadRequest } from "./types.js";

const errText = (what: string, e: string): ModeOutput => ({
  body: `（${what}失败：${e}）`,
  matched: 0,
  returned: 0,
  dropped: 0,
  examples: [],
});

const entryOf = (a: ParsedAtom): string => a.entry || a.slug || "(无入口)";

export const buildIndexText = (deps: ReadDeps, atoms: ParsedAtom[]): string => {
  const today = deps.clock.today();
  const byDate = new Map<string, ParsedAtom[]>();
  const topics = new Map<string, string[]>();
  const todayTopics = new Set<string>();
  for (const a of atoms) {
    const arr = byDate.get(a.date) ?? [];
    arr.push(a);
    byDate.set(a.date, arr);
    const e = entryOf(a);
    const t = topics.get(e) ?? [];
    if (!t.includes(a.rel)) t.push(a.rel);
    topics.set(e, t);
    if (a.date === today) todayTopics.add(e);
  }
  const lines: string[] = [];
  lines.push("# shadow 目录说明与索引", "");
  lines.push("`.shadow/` 是投影空间根（atoms / roles / affaires / indexes）——每条记忆都是 `atoms/` 下的一个文件。");
  lines.push("默认入口：`read_shadow()` 无参读本索引；带 `topic`/`entry` 穿透到具体记忆文件。");
  lines.push("", `工作区：\`${deps.ws}\``, "");
  lines.push("## 今日摘要");
  const todayAtoms = atoms.filter((a) => a.date === today);
  lines.push(todayAtoms.length ? `今日 ${todayAtoms.length} 条记忆${todayTopics.size ? `，主题：${[...todayTopics].slice(0, 10).join("、")}` : ""}。` : "（今日暂无）");
  lines.push("", "## 近期记忆（按日期）");
  const dates = [...byDate.keys()].sort().reverse().slice(0, 20);
  if (!dates.length) lines.push("（暂无）");
  for (const d of dates) {
    lines.push(`- ${d}`);
    for (const a of (byDate.get(d) ?? []).sort((x, y) => x.name.localeCompare(y.name)).slice(0, 40)) {
      lines.push(`  - \`${a.name}\``);
    }
  }
  lines.push("", "## 主题索引（入口/主题 → 记忆文件）");
  const topicKeys = [...topics.keys()].sort().slice(0, 40);
  if (!topicKeys.length) lines.push("（暂无）");
  for (const t of topicKeys) lines.push(`- \`${t}\` → ${topics.get(t)!.slice(0, 6).join("、")}`);
  lines.push("", "## 意识轨迹（按时间，可反推方向）");
  const sorted = [...atoms].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(-60);
  if (!sorted.length) lines.push("（暂无）");
  for (const a of sorted) lines.push(`- ${a.date} ${a.time} \`${a.name}\``);
  const eps = deriveEpisodes(atoms, deps.config.compact.gapMinutes);
  lines.push("", "## 任务回溯（Episodes）", "");
  if (!eps.length) lines.push("（暂无连续任务片段，当前仅原子记忆）");
  else {
    for (const e of eps.slice(-8).reverse()) {
      const range = e.startedAt === e.endedAt ? e.startedAt.slice(5, 16) : `${e.startedAt.slice(5, 16)}–${e.endedAt.slice(5, 16)}`;
      lines.push(`- ${range} · ${e.title} · ${e.memoryCount} 条记忆 · ${e.decisions.length} 决策`);
    }
  }
  return lines.join("\n");
};

export const indexView = async (deps: ReadDeps, atoms: ParsedAtom[]): Promise<ModeOutput> => {
  const cached = await deps.fs.readText(`${deps.ws}/${INDEX_MD}`);
  if (cached.ok) {
    return { body: cached.value, matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] };
  }
  if (cached.error.code !== "NOT_FOUND") {
    deps.signals.note("index-md", cached.error.code, `索引读取失败（${cached.error.message}）`, "本次回退为现场派生索引；磁盘索引可能是旧的");
  }
  return { body: buildIndexText(deps, atoms), matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] };
};

export const conflictRels = async (deps: ReadDeps, atoms: ParsedAtom[]): Promise<Set<string>> => {
  const out = new Set<string>();
  if (!deps.verify) return out;
  for (const a of atoms) {
    const paths = [...new Set([...a.materials, ...evidencePathsOf(a.body)])]
      .filter((p) => isConcreteLocator(p))
      .slice(0, 12);
    for (const p of paths) {
      if ((await deps.verify(p)) === "stale") {
        out.add(a.rel);
        break;
      }
    }
  }
  return out;
};

export const topicView = async (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): Promise<ModeOutput> => {
  const topic = String(req.topic ?? "").trim();
  const tokens = tokenize(topic);
  if (!tokens.length) {
    return { body: `（查询为空）\n> 下一步：给一个主题词，如 \`read_shadow("auth")\`。`, matched: 0, returned: 0, dropped: 0, examples: [] };
  }
  const conflicts = await conflictRels(deps, atoms);
  const scored = scoreAtoms(atoms, tokens, {
    config: deps.config,
    meta: deps.meta ?? new Map(),
    todayStr: deps.clock.today(),
    conflictRels: conflicts,
    supersededRels: supersededRels(atoms),
  });
  const maxChars = Math.max(256, Math.min(8000, Number(req.maxTokens ?? deps.config.recall.budget))) * 4;
  const limit = Math.max(1, Math.min(30, Number(req.limit ?? deps.config.recall.limit)));
  const result = selectWithinBudget(scored, tokens, maxChars, limit);
  if (!result.matched) {
    return {
      body: `（未找到相关记忆：${topic}）\n> 下一步：① 换更短/同义的词再查；② \`read_shadow()\` 无参看索引；③ 跨类型用 \`shadow_query\`。`,
      matched: 0,
      returned: 0,
      dropped: 0,
      examples: [],
    };
  }
  const staleCount = scored.filter((s) => s.stale).length;
  return {
    body: renderTopicRecall(topic, result, staleCount),
    matched: result.matched,
    returned: result.returned,
    dropped: result.dropped,
    examples: result.examples,
    next: "① 提高 max_tokens；② 用更窄的 topic；③ 用 `shadow_query` 跨类型查。",
  };
};

export const recoveryView = async (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): Promise<ModeOutput> => {
  const topic = String(req.topic ?? "").trim();
  const tasks = deriveTasks(atoms);
  const refs = await contextRefs(deps, atoms);
  const limit = Math.max(1, Math.min(30, Number(req.limit ?? 1)));
  const ranked = rankTasks(tasks, topic);
  const chosen = ranked.slice(0, limit);
  const body = chosen.length
    ? chosen.map((t) => renderRecoveryFor(topic, t, refs)).join("\n\n---\n\n")
    : renderRecovery(topic, tasks, refs);
  return { body, matched: tasks.length, returned: chosen.length, dropped: Math.max(0, tasks.length - chosen.length), examples: [] };
};

export const episodeView = (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const eps = deriveEpisodes(atoms, deps.config.compact.gapMinutes);
  const body = renderEpisodes(eps, String(req.topic ?? ""));
  return { body, matched: eps.length, returned: eps.length, dropped: 0, examples: [] };
};

export const decisionView = (atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const dl = deriveDecisions(atoms, { topic: String(req.topic ?? ""), entry: String(req.entry ?? "") });
  return { body: renderDecisions(dl), matched: dl.count, returned: dl.count, dropped: 0, examples: [] };
};

export const taskView = (atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const tasks = deriveTasks(atoms);
  const body = renderTasks(tasks, String(req.topic ?? ""));
  return { body, matched: tasks.length, returned: tasks.length, dropped: 0, examples: [] };
};

export const contextView = async (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): Promise<ModeOutput> => {
  const refs = await contextRefs(deps, atoms);
  const body = renderContextRefs(refs, String(req.topic ?? ""));
  return { body, matched: refs.length, returned: refs.length, dropped: 0, examples: [] };
};

const contextRefs = async (deps: ReadDeps, atoms: ParsedAtom[]) =>
  deriveContextRefs(atoms, async (path) => {
    if (!deps.verify) return { status: "unknown" as const };
    const status = await deps.verify(path);
    return { status };
  });

export const queryView = (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const topic = String(req.topic ?? "").trim();
  const tokens = tokenize(topic);
  if (!tokens.length) return { body: "（查询为空）", matched: 0, returned: 0, dropped: 0, examples: [] };
  const scored = scoreAtoms(atoms, tokens, {
    config: deps.config,
    meta: deps.meta ?? new Map(),
    todayStr: deps.clock.today(),
  });
  const scope = Array.isArray(req.scope) ? new Set(req.scope) : undefined;
  const items = scored
    .map((s) => {
      const type = s.atom.decisions.length ? "decision" : s.atom.materials.length ? "document" : "memory";
      return { s, type };
    })
    .filter((x) => !scope || scope.has(x.type))
    .slice(0, Math.max(1, Math.min(30, Number(req.limit ?? 8))));
  if (!items.length) {
    return { body: `（无匹配 ShadowNode：${topic}）\n> 下一步：换更短的词，或放宽 scope。`, matched: 0, returned: 0, dropped: 0, examples: [] };
  }
  const lines = [`# Shadow Query · ${topic}`, "> Node 是派生投影，不是事实源；每条带 evidence 指针。", ""];
  for (const { s, type } of items) {
    lines.push(`- [${type}] ${s.atom.entry || s.atom.slug} · 相关度 ${Math.round(s.score)} · 证据：${s.atom.rel}`);
  }
  const dropped = Math.max(0, scored.length - items.length);
  return { body: lines.join("\n"), matched: scored.length, returned: items.length, dropped, examples: scored.slice(items.length, items.length + 5).map((x) => x.atom.rel) };
};

export const knowledgeView = (atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const topic = String(req.topic ?? "").toLowerCase();
  const sections = new Map<string, string[]>();
  for (const a of atoms) {
    for (const line of a.body.split("\n")) {
      const m = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      if (!m) continue;
      const title = m[2]!.trim();
      if (topic && !title.toLowerCase().includes(topic)) continue;
      const arr = sections.get(title) ?? [];
      if (!arr.includes(a.rel)) arr.push(a.rel);
      sections.set(title, arr);
    }
  }
  if (!sections.size) return { body: "（暂无知识树章节）", matched: 0, returned: 0, dropped: 0, examples: [] };
  const lines = ["# Knowledge Tree", "> 免向量保留树；只列标题与来源，不转 chunk。", ""];
  for (const [title, rels] of [...sections.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${title}`);
    for (const r of rels.slice(0, 5)) lines.push(`- ${r}`);
  }
  return { body: lines.join("\n"), matched: sections.size, returned: sections.size, dropped: 0, examples: [] };
};

export const queryLogView = (deps: ReadDeps): ModeOutput => {
  if (!deps.index) return { body: "（尚无查询记录：telemetry 未启用或索引不可用）", matched: 0, returned: 0, dropped: 0, examples: [] };
  const s = deps.index.queryLogSummary();
  if (!s.total) return { body: "（尚无查询记录）", matched: 0, returned: 0, dropped: 0, examples: [] };
  const lines = [
    "# Query Observatory",
    `- 查询次数：${s.total}`,
    `- 命中总数：${s.matched}`,
    `- 返回总数：${s.returned}`,
    "",
    "## 最近 10 条",
  ];
  for (const r of s.rows.slice(0, 10)) lines.push(`- ${r.mode} · \`${r.query}\` · 命中 ${r.matched} · 返回 ${r.returned}`);
  return { body: lines.join("\n"), matched: s.total, returned: s.total, dropped: 0, examples: [] };
};

export const reportView = (deps: ReadDeps, atoms: ParsedAtom[]): ModeOutput => {
  const withSummary = atoms.filter((a) => a.summary).length;
  const withDecisions = atoms.filter((a) => a.decisions.length).length;
  const withMaterials = atoms.filter((a) => a.materials.length).length;
  const entries = new Map<string, number>();
  for (const a of atoms) entries.set(entryOf(a), (entries.get(entryOf(a)) ?? 0) + 1);
  const top = [...entries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines = [
    "# Shadow Fitness Report（诊断，不增强）",
    `- 原子：${atoms.length}`,
    `- 有摘要：${withSummary}（${atoms.length ? Math.round((withSummary / atoms.length) * 100) : 0}%）`,
    `- 有决策：${withDecisions}`,
    `- 有材料：${withMaterials}`,
    `- 入口去重：${entries.size}`,
    "",
    "## 入口分布（Top 10）",
    ...top.map(([e, n]) => `- ${e}：${n}`),
    "",
    `> 生成于 ${deps.clock.today()} ${deps.clock.stamp()}；报告是派生件，可删可重建。`,
  ];
  return { body: lines.join("\n"), matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] };
};

export const manifestView = async (deps: ReadDeps, atoms: ParsedAtom[]): Promise<ModeOutput> => {
  const listed = await deps.fs.listDir(`${deps.ws}/.shadow`);
  const dirs = listed.ok ? listed.value.map((e) => `${e.type === "dir" ? "dir " : "file"} ${e.name}`) : ["（`.shadow/` 不可读）"];
  const lines = [
    "# Shadow Manifest",
    `- 工作区：\`${deps.ws}\``,
    `- atoms：${atoms.length}`,
    `- 索引：${deps.index ? "SQLite 可用" : "未打开"}`,
    "",
    "## .shadow/",
    ...dirs.slice(0, 50).map((d) => `- ${d}`),
    "",
    "> 派生件可整份重建；坏件 ≠ 空件。",
  ];
  return { body: lines.join("\n"), matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] };
};
