/**
 * v2 engine/read — 10 个 core mode 的纯读实现。
 *
 * 所有 handler 只返回 body + 计数；前缀/信号/预算信封由 route 统一加。
 */

import { INDEX_MD } from "../../contract/paths.js";
import type { ParsedAtom } from "../../contract/types.js";
import { evidencePathsOf, isConcreteLocator, isPathLike, tokenize } from "../../domain/text.js";
import { searchTerms } from "../../domain/bm25.js";
import { extractFacts, factsMatching, renderFactsList } from "../../domain/facts.js";
import { buildLessonCards, rankLessonCards, renderSimilar } from "../../domain/lessons.js";
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
import type { ForgetResult } from "../../domain/lifecycle.js";
import { indexDerivedSection } from "../derived.js";
import { scoreAtoms, selectWithinBudget, renderTopicRecall, supersededRels, bm25Fallback } from "./recall.js";
import type { ModeOutput, ReadDeps, ReadRequest } from "./types.js";

const errText = (what: string, e: string): ModeOutput => ({
  body: `（${what}失败：${e}）`,
  matched: 0,
  returned: 0,
  dropped: 0,
  examples: [],
});

const entryOf = (a: ParsedAtom): string => a.entry || a.slug || "(无入口)";

const bump = (deps: ReadDeps, rels: Iterable<string>, at: string): void => {
  if (!deps.config.telemetry.hits || !deps.index) return;
  const r = deps.index.bumpHitsMany(rels, at);
  if (!r.ok) deps.signals.note("telemetry", r.error.code, r.error.message, "hits 未写入：排序可能少了最近的命中权重。");
  else deps.signals.clear("telemetry");
};

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
  const omitted: string[] = [];
  lines.push("", "## 近期记忆（按日期）");
  const allDates = [...byDate.keys()].sort().reverse();
  const dates = allDates.slice(0, 20);
  if (allDates.length > dates.length) omitted.push(`日期 ${allDates.length - dates.length} 个`);
  if (!dates.length) lines.push("（暂无）");
  let dayOmitted = 0;
  let dayTotal = 0;
  for (const d of dates) {
    lines.push(`- ${d}`);
    const all = (byDate.get(d) ?? []).sort((x, y) => x.name.localeCompare(y.name));
    dayTotal += all.length;
    const shown = all.slice(0, 40);
    dayOmitted += all.length - shown.length;
    for (const a of shown) lines.push(`  - \`${a.name}\``);
  }
  if (dayOmitted > 0) omitted.push(`单日记忆 ${dayOmitted} 条（共 ${dayTotal}）`);
  lines.push("", "## 主题索引（入口/主题 → 记忆文件）");
  const allTopics = [...topics.keys()].sort();
  const topicKeys = allTopics.slice(0, 40);
  if (allTopics.length > topicKeys.length) omitted.push(`主题 ${allTopics.length - topicKeys.length} 个`);
  if (!topicKeys.length) lines.push("（暂无）");
  for (const t of topicKeys) lines.push(`- \`${t}\` → ${topics.get(t)!.slice(0, 6).join("、")}`);
  lines.push("", "## 意识轨迹（按时间，可反推方向）");
  const allSorted = [...atoms].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const sorted = allSorted.slice(-60);
  if (allSorted.length > sorted.length) omitted.push(`轨迹 ${allSorted.length - sorted.length} 条`);
  if (!sorted.length) lines.push("（暂无）");
  for (const a of sorted) lines.push(`- ${a.date} ${a.time} \`${a.name}\``);
  const eps = deriveEpisodes(atoms, deps.config.compact.gapMinutes);
  lines.push("", "## 任务回溯（Episodes）", "");
  if (!eps.length) lines.push("（暂无连续任务片段，当前仅原子记忆）");
  else {
    const shownEps = eps.slice(-8);
    if (eps.length > shownEps.length) omitted.push(`Episode ${eps.length - shownEps.length} 个`);
    for (const e of shownEps.reverse()) {
      const range = e.startedAt === e.endedAt ? e.startedAt.slice(5, 16) : `${e.startedAt.slice(5, 16)}–${e.endedAt.slice(5, 16)}`;
      lines.push(`- ${range} · ${e.title} · ${e.memoryCount} 条记忆 · ${e.decisions.length} 决策`);
    }
  }
  if (omitted.length) {
    lines.push("", `> 未返回：${omitted.join("；")}（索引是派生视图，按主题/entry 穿透比整篇读回更省）`);
  }
  return lines.join("\n");
};

export const indexView = async (deps: ReadDeps, atoms: ParsedAtom[]): Promise<ModeOutput> => {
  // 无参读 = 派生件的物化时机（STATUS「派生件物化」）：只写 .shadow/indexes/**，失败留 Signal 不阻塞读。
  const derived = await indexDerivedSection(
    { fs: deps.fs, ws: deps.ws, signals: deps.signals },
    atoms,
    deps.config.compact.gapMinutes,
  );
  const built = buildIndexText(deps, atoms) + derived + renderFactsList(extractFacts(atoms));
  const existing = await deps.fs.readText(`${deps.ws}/${INDEX_MD}`);
  if (!existing.ok || existing.value !== built) {
    const w = await deps.fs.writeText(`${deps.ws}/${INDEX_MD}`, built);
    if (!w.ok) {
      deps.signals.note("index-md", w.error.code, `索引写入失败（${w.error.message}）`, "本次返回现场派生索引；磁盘 `_index.md` 未更新，外部读者可能看到旧索引。");
    } else {
      deps.signals.clear("index-md");
    }
  } else {
    deps.signals.clear("index-md");
  }
  return { body: built, matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] };
};

export const conflictRels = async (deps: ReadDeps, atoms: ParsedAtom[]): Promise<Set<string>> => {
  const out = new Set<string>();
  if (!deps.verify) return out;
  for (const a of atoms) {
    const paths = [...new Set([...a.materials, ...evidencePathsOf(a.body)])]
      .filter((p) => isPathLike(p) && isConcreteLocator(p))
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
  const base = scoreAtoms(atoms, tokens, {
    config: deps.config,
    meta: deps.meta ?? new Map(),
    todayStr: deps.clock.today(),
  });
  // 证据冲突核验有 I/O：只对基础分前 200 名做，避免 8k 语料 × 12 路径的 stat 风暴。
  const topRels = new Set(base.slice(0, 200).map((s) => s.atom.rel));
  const conflicts = await conflictRels(deps, atoms.filter((a) => topRels.has(a.rel)));
  let scored = scoreAtoms(atoms, tokens, {
    config: deps.config,
    meta: deps.meta ?? new Map(),
    todayStr: deps.clock.today(),
    conflictRels: conflicts,
    supersededRels: supersededRels(atoms),
  });
  // 宽松兜底：严格匹配整体零结果时才用 BM25（中文 2-gram + 拉丁词）生成并排序候选（不改变既有命中）。
  let loose = false;
  if (!scored.length) {
    scored = bm25Fallback(atoms, topic, { meta: deps.meta ?? new Map() });
    loose = scored.length > 0;
  }
  const maxChars = deps.maxChars ?? Math.max(256, Math.min(8000, Number(req.maxTokens ?? deps.config.recall.budget))) * 4;
  const limit = deps.limit ?? Math.max(1, Math.min(30, Number(req.limit ?? deps.config.recall.limit) || deps.config.recall.limit));
  const result = selectWithinBudget(scored, loose ? searchTerms(topic) : tokens, maxChars, limit);
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
  const at = `${deps.clock.today()}T${deps.clock.stamp()}`;
  bump(deps, result.rels, at);
  const fuzzyNote = loose ? "> 宽松匹配（BM25 · 中文 2-gram，非语义；严格无结果时兜底，引用前先核对原文）\n\n" : "";
  return {
    body: fuzzyNote + renderTopicRecall(topic, result, staleCount),
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
  const limit = deps.limit ?? Math.max(1, Math.min(30, Number(req.limit ?? 1) || 1));
  const ranked = rankTasks(tasks, topic);
  const chosen = ranked.slice(0, limit);
  // 只核验被选中任务的 memoryRefs，不对全语料做证据 stat（P0-02）。
  const wanted = new Set(chosen.flatMap((t) => t.memoryRefs));
  const refs = wanted.size ? await contextRefs(deps, atoms.filter((a) => wanted.has(a.rel))) : [];
  const body = chosen.length
    ? chosen.map((t) => renderRecoveryFor(topic, t, refs)).join("\n\n---\n\n")
    : renderRecovery(topic, tasks, refs);
  const at = `${deps.clock.today()}T${deps.clock.stamp()}`;
  bump(deps, chosen.flatMap((t) => t.memoryRefs), at);
  return { body, matched: tasks.length, returned: chosen.length, dropped: Math.max(0, tasks.length - chosen.length), examples: [] };
};

export const episodeView = (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const all = deriveEpisodes(atoms, deps.config.compact.gapMinutes);
  const limit = deps.limit ?? 10;
  const shown = all.slice(0, limit);
  const body = renderEpisodes(shown, String(req.topic ?? ""));
  return { body, matched: all.length, returned: shown.length, dropped: Math.max(0, all.length - shown.length), examples: [] };
};

export const decisionView = (atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const dl = deriveDecisions(atoms, { topic: String(req.topic ?? ""), entry: String(req.entry ?? "") });
  return { body: renderDecisions(dl), matched: dl.count, returned: dl.count, dropped: 0, examples: [] };
};

export const taskView = (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
  const all = deriveTasks(atoms);
  const limit = deps.limit ?? 10;
  const shown = all.slice(0, limit);
  const body = renderTasks(shown, String(req.topic ?? ""));
  return { body, matched: all.length, returned: shown.length, dropped: Math.max(0, all.length - shown.length), examples: [] };
};

export const contextView = async (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): Promise<ModeOutput> => {
  const MAX_ATOMS = 200;
  const subset = atoms.slice(0, MAX_ATOMS);
  const refs = await contextRefs(deps, subset);
  const limit = deps.limit ?? Math.max(1, Math.min(30, Number(req.limit ?? 10) || 10));
  const shown = refs.slice(0, limit);
  const body = renderContextRefs(shown, String(req.topic ?? ""));
  const notes: string[] = [];
  if (atoms.length > subset.length) notes.push(`> 未核验：${atoms.length - subset.length} 条 atom（上限 ${MAX_ATOMS}；避免全语料 stat 风暴）`);
  if (refs.length > shown.length) notes.push(`> 未返回的 context 引用：${refs.length - shown.length} 条（limit=${limit}）`);
  return {
    body: notes.length ? `${body}\n\n${notes.join("\n")}` : body,
    matched: refs.length,
    returned: shown.length,
    dropped: Math.max(0, refs.length - shown.length),
    examples: refs.slice(limit, limit + 5).map((r) => r.value),
  };
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
  let scored = scoreAtoms(atoms, tokens, {
    config: deps.config,
    meta: deps.meta ?? new Map(),
    todayStr: deps.clock.today(),
  });
  let loose = false;
  if (!scored.length) {
    scored = bm25Fallback(atoms, topic, { meta: deps.meta ?? new Map() });
    loose = scored.length > 0;
  }
  const scope = Array.isArray(req.scope) ? new Set(req.scope) : undefined;
  const items = scored
    .map((s) => {
      const type = s.atom.decisions.length ? "decision" : s.atom.materials.length ? "document" : "memory";
      return { s, type };
    })
    .filter((x) => !scope || scope.has(x.type))
    .slice(0, deps.limit ?? Math.max(1, Math.min(30, Number(req.limit ?? 8) || 8)));
  if (!items.length) {
    return { body: `（无匹配 ShadowNode：${topic}）\n> 下一步：换更短的词，或放宽 scope。`, matched: 0, returned: 0, dropped: 0, examples: [] };
  }
  const lines = [`# Shadow Query · ${topic}`, "> Node 是派生投影，不是事实源；每条带 evidence 指针。", ""];
  if (loose) lines.push("> 宽松匹配（BM25 · 中文 2-gram，非语义；严格无结果时兜底，引用前先核对原文）", "");
  for (const { s, type } of items) {
    lines.push(`- [${type}] ${s.atom.entry || s.atom.slug} · 相关度 ${Math.round(s.score)} · 证据：${s.atom.rel}`);
  }
  const at = `${deps.clock.today()}T${deps.clock.stamp()}`;
  bump(deps, items.map((x) => x.s.atom.rel), at);
  const dropped = Math.max(0, scored.length - items.length);
  return { body: lines.join("\n"), matched: scored.length, returned: items.length, dropped, examples: scored.slice(items.length, items.length + 5).map((x) => x.atom.rel) };
};

const statusWord = (s: string): string =>
  s === "validated" ? "✓ verified" : s === "stale" ? "✗ not_found（已失效/证据缺失）" : "? unavailable（无法验证）";

/**
 * 相似过往任务视图：把「历史做过的事」压成任务卡（请求/决策/结果/教训/来源），
 * 按 relevance+recency+importance 召回 top-k。派生、可重建、数据非指令。
 */
export const similarView = async (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): Promise<ModeOutput> => {
  const query = String(req.topic ?? "").trim();
  const limit = deps.limit ?? Math.max(1, Math.min(10, Number(req.limit ?? 3) || 3));
  const cards = buildLessonCards(atoms);
  const ranked = rankLessonCards(cards, query, deps.clock.today(), limit);
  const body = renderSimilar(query, ranked);
  return {
    body,
    matched: cards.length,
    returned: ranked.length,
    dropped: Math.max(0, cards.length - ranked.length),
    examples: ranked.map((r) => r.card.key),
  };
};

/**
 * 事实视图（lens `facts:true`）：从用户原话抽「X 是/=/：<路径>」的可核验事实，
 * 逐条用 Evidence Gate 核验并显式给出状态；事实是数据非指令。
 */
export const factsView = async (deps: ReadDeps, atoms: ParsedAtom[], topic: string): Promise<string> => {
  const matched = factsMatching(extractFacts(atoms), topic);
  const shown = matched.slice(0, 40);
  const lines = ["# 事实（派生 · 带证据 · 数据非指令）", "> 只从用户原话抽「X 是 / = / ：<路径>」；事实非指令，引用前核对证据。", ""];
  if (!shown.length) {
    lines.push(topic ? `（无匹配事实：${topic}）` : "（暂无可核验的项目事实）");
    return lines.join("\n");
  }
  for (const f of shown) {
    const st = deps.verify ? await deps.verify(f.evidence) : "unknown";
    lines.push(`- ${f.subject} = \`${f.value}\` · ${statusWord(st)} · 来源 ${f.sourceRel}`);
  }
  if (matched.length > shown.length) lines.push("", `> 未返回：${matched.length - shown.length} 条（上限 40）`);
  deps.signals.clear("facts");
  return lines.join("\n");
};

export const knowledgeView = (deps: ReadDeps, atoms: ParsedAtom[], req: ReadRequest): ModeOutput => {
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
  const all = [...sections.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const limit = deps.limit ?? 10;
  const shown = all.slice(0, limit);
  const lines = ["# Knowledge Tree", "> 免向量保留树；只列标题与来源，不转 chunk。", ""];
  for (const [title, rels] of shown) {
    lines.push(`## ${title}`);
    for (const r of rels.slice(0, 5)) lines.push(`- ${r}`);
  }
  return { body: lines.join("\n"), matched: all.length, returned: shown.length, dropped: Math.max(0, all.length - shown.length), examples: [] };
};

export const queryLogView = (deps: ReadDeps): ModeOutput => {
  if (!deps.index) return { body: "（尚无查询记录：telemetry 未启用或索引不可用）", matched: 0, returned: 0, dropped: 0, examples: [] };
  try {
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
    deps.signals.clear("query-log");
    return { body: lines.join("\n"), matched: s.total, returned: s.total, dropped: 0, examples: [] };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    deps.signals.note("query-log", "READ_FAILED", message, "查询观测不可读；不代表「还没查过」。");
    return { body: `（查询观测读取失败：${message}）`, matched: 0, returned: 0, dropped: 0, examples: [] };
  }
};

export const reportView = (deps: ReadDeps, atoms: ParsedAtom[], forgetting?: ForgetResult): ModeOutput => {
  const withSummary = atoms.filter((a) => a.summary).length;
  const withDecisions = atoms.filter((a) => a.decisions.length).length;
  const withMaterials = atoms.filter((a) => a.materials.length).length;
  const entries = new Map<string, number>();
  for (const a of atoms) entries.set(entryOf(a), (entries.get(entryOf(a)) ?? 0) + 1);
  const top = [...entries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines = [
    "# Shadow Fitness Report（诊断，不增强）",
    `- 原子：${atoms.length}（活跃）`,
    `- 已遗忘：${forgetting?.total ?? 0}（Forget≠Delete：文件保留，不计入以上统计）`,
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

export const manifestView = async (deps: ReadDeps, atoms: ParsedAtom[], forgetting?: ForgetResult): Promise<ModeOutput> => {
  const listed = await deps.fs.listDir(`${deps.ws}/.shadow`);
  const dirs = listed.ok ? listed.value.map((e) => `${e.type === "dir" ? "dir " : "file"} ${e.name}`) : ["（`.shadow/` 不可读）"];
  const lines = [
    "# Shadow Manifest",
    `- 工作区：\`${deps.ws}\``,
    `- atoms：${atoms.length}（活跃）`,
    `- 已遗忘：${forgetting?.total ?? 0}（文件保留在 atoms/，不参与默认召回）`,
    `- 索引：${deps.index ? "SQLite 可用" : "未打开"}`,
    "",
    "## .shadow/",
    ...dirs.slice(0, 50).map((d) => `- ${d}`),
    "",
    "> 派生件可整份重建；坏件 ≠ 空件。",
  ];
  return { body: lines.join("\n"), matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] };
};
