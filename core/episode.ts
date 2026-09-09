// dsh-shadow —— core/episode.ts：Episode Lineage + Decision Lineage（v1.1.x 骨架）。
// 背景：记忆是 Event/Turn 级的原子文件（Memory Atom），人类/agent 直接看会是一堆碎片。
// 本模块把「碎片」派生成**关系层**——把同一次连续经历的记忆原子聚合成 Episode，
// 并把「决策」从统计字段提升为可追踪的事件关系（Decision Lineage）。
//
// 设计一致性：
//   - 派生式（Derived Artifact）：Memory 文件是 source of truth，本模块只「读」它们派生出
//     Episode/Decision，不写回记忆文件、不改写侧采集流（与 Experience/Judgment/KG 同模式）。
//   - 纯函数：无 fs/context 依赖，输入是「已读出的记忆文本」，输出纯数据。
//   - 只有读语义：Episode/Decision 是「怎么把这些碎片串起来」的观察，不是新事实源。
//
// 数据流：Events → Trace → Memory Atom → Episode/Decision（派生）→ 可穿透 Recall。

import { scrubUnsafe } from "../security/scrub.js";
import type { AtomKind, AtomLineage, CreatedBy, AtomEvidenceRef } from "./lineage.js";

/** 一条记忆被解析后的字段（供 Episode/Decision 派生）。 */
export interface ParsedMemory {
  rel: string;          // .shadow/<date>/<file>.md
  date: string;         // YYYY-MM-DD
  time: string;         // HHMMSS（文件名里的时刻）
  entry: string;        // # 入口（语义路径/组件）
  project: string;      // > 项目：
  agent: string;        // > Agent：
  goal: string;         // > 目标：
  decisions: string[];  // 这条记忆里的决策语句（goal 事件 + 用户拍板 + assistant 明确决策）
  decisionEvents: DecisionEvent[]; // 富化决策事件（statement + source + reason；reason 只在原文明确时非空）
  userMessages: string[]; // 用户消息（`用户：` 行，供 Task 触发/约束派生）
  materials: string[];  // 背景/材料
  actions: string[];    // 动作行（改/读 + 调用）
  thinkLines: string[]; // 非动作正文行（思维/结论，供"为什么"）
  body: string;         // 完整正文（含线索头），供标题/摘要兜底
  // v1.8.0 Evidence Lineage：从可观察信号派生（无 LLM / event-sourced）。可选=兼容旧 Atom/合成构造。
  kind?: AtomKind;                // memory 二级属性（experience/metadata/session/task/artifact）
  lineage?: AtomLineage;          // 为什么存在/来自哪里（source≠evidence）
}

/** 一次决策事件：发生了一个决定。reason 与 decision 分离——有 Decision ≠ 一定有 Reason（不补写）。 */
export interface DecisionEvent {
  statement: string;    // 决策事实（"保留了 RetryWorker"）
  source: string;       // goal | user | assistant | ""
  reason: string;       // 明确表达的理由；无则 ""（绝不生成）
}

/** Episode：一组属于同一次连续经历的记忆原子。 */
export interface Episode {
  id: string;
  startedAt: string;    // YYYY-MM-DD HH:MM:SS
  endedAt: string;
  project: string;
  agent: string;
  title: string;        // 任务标题（优先 goal，其次首个 entry，再次项目）
  objective: string;    // > 目标：中的目标（可能为空）
  memoryCount: number;
  memoryRefs: string[]; // 参与的记忆 rel 列表
  entries: string[];
  decisions: { text: string; rel: string; at: string }[];
  actions: { text: string; rel: string; at: string }[];
  materials: string[];
}

interface Meta {
  key: string;
  lastAt: number; // epoch 分钟
}

// ── 解析一条记忆 ──
const fieldOf = (text: string, key: string) => (text.match(new RegExp(`^> ${key}：(.+)$`, "m")) || [])[1]?.trim() || "";

const stripPrompt = (s: string) => scrubUnsafe(String(s || "").replace(/〔decision〕|〔reminder〕/g, "").replace(/^「|」$/g, "")).trim();

// ── v1.8.0 Evidence Lineage：派生读侧（纯函数、无 LLM、只读可观察信号）──
// materials → AtomEvidenceRef（type=file，locator=路径）。zg 页/行号、Git commit 未来可在此扩展。
export const materialsToEvidence = (materials: string[]): AtomEvidenceRef[] =>
  materials.map((m) => ({ type: "file", locator: scrubUnsafe(String(m || "")).slice(0, 200) }));

// createdBy：优先决策源（user 早于 agent），其次用户消息→user，材料→tool，兜底 agent。
export const deriveCreatedBy = (p: { decisionEvents: DecisionEvent[]; userMessages: string[]; materials: string[] }): CreatedBy => {
  if (p.decisionEvents.length) return p.decisionEvents.some((e) => e.source === "user") ? "user" : "agent";
  if (p.userMessages.length) return "user";
  if (p.materials.length) return "tool";
  return "agent";
};

// kind：memory 二级属性（非新 type）。决策→experience；todo/plan 内容→task；
// 无材料且为会话元数据入口→metadata；其余→experience。
export const deriveAtomKind = (p: { entry: string; materials: string[]; decisions: string[]; goal: string; userMessages: string[] }): AtomKind => {
  if (p.decisions.length || p.goal) return "experience";
  const text = `${p.entry} ${[...p.materials, ...p.userMessages, p.goal].join(" ")}`.toLowerCase();
  if (/todo|plan|待办|任务|尚未|未完成|next|backlog/.test(text)) return "task";
  if (!p.materials.length && (p.entry === "shadow" || p.userMessages.length)) return "metadata";
  return "experience";
};

// v1.8.0 Gate 覆盖：Atom 是否进入「认知查询/召回」默认集（kind∈metadata|session → 排除）。
export const isCognitiveAtom = (p: { kind?: AtomKind }): boolean => p?.kind !== "metadata" && p?.kind !== "session";

// 读侧（topic 召回路径不 parseMemory）用文本启发式判定「会话元数据」原子：entry=shadow + 有用户要点 + 无材料 + 无决策。
export const isMetadataMemoryText = (text: unknown): boolean => {
  const t = String(text || "");
  const entry = (t.match(/^# (.+)$/m) || [])[1]?.trim() || "";
  if (entry !== "shadow") return false;
  const hasMaterials = /^> 背景\/材料：.+$/m.test(t);
  const hasDecisions = /^> 决策：.+$/m.test(t);
  const hasUser = /^> 用户要点：|^> 用户提示\/决策：/m.test(t);
  return hasUser && !hasMaterials && !hasDecisions;
};

export const deriveLineage = (p: { source?: string; createdBy: CreatedBy; materials: string[]; createdAt: string }): AtomLineage => ({
  source: scrubUnsafe(String(p.source || "")).trim().slice(0, 80) || "unknown",
  createdBy: p.createdBy,
  evidence: materialsToEvidence(p.materials),
  createdAt: p.createdAt,
});

export const parseMemory = (text: string, rel: string, name: string): ParsedMemory => {
  const body = String(text || "");
  const date = (rel.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
  const time = (String(name || "").match(/^\d{4}-\d{2}-\d{2}--(\d{6})/) || [])[1] || "";
  const entry = (body.match(/^# (.+)$/m) || [])[1]?.trim() || "";
  const project = fieldOf(body, "项目");
  const agent = fieldOf(body, "Agent");
  const goal = fieldOf(body, "目标");
  const materials = fieldOf(body, "背景/材料").split(/、/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const decisions: string[] = [];
  const decisionEvents: DecisionEvent[] = [];
  const addDecision = (stmt: unknown, source: string, reason?: unknown) => {
    const s = scrubUnsafe(String(stmt || "")).trim();
    if (!s) return;
    const st = s.slice(0, 80);
    if (!decisions.includes(st)) decisions.push(st);
    if (!decisionEvents.some((e) => e.statement === st)) decisionEvents.push({ statement: st, source, reason: scrubUnsafe(String(reason || "")).trim().slice(0, 120) });
  };
  // ① `> 决策：`（〔source〕statement；...）—— 新决策事实（一等事件，v1.1.1）
  const decLine = fieldOf(body, "决策");
  const hasDecBlock = decLine.trim().length > 0;
  for (const seg of decLine.split(/；|;/)) {
    const s0 = seg.trim(); if (!s0) continue;
    const src = (s0.match(/^〔([^\]]+)〕/) || [])[1] || "goal";
    const stmt = s0.replace(/^〔[^\]]+〕/, "").trim();
    if (stmt) addDecision(stmt, src);
  }
  // ② `> 决策理由：`（〔source〕reason；...）—— 理由按 source 回填（仅明确存在者，不补写）
  const reasonLine = fieldOf(body, "决策理由");
  const reasonsBySource: Record<string, string> = {};
  for (const seg of reasonLine.split(/；|;/)) {
    const s0 = seg.trim(); if (!s0) continue;
    const src = (s0.match(/^〔([^\]]+)〕/) || [])[1] || "goal";
    const reason = s0.replace(/^〔[^\]]+〕/, "").trim();
    if (reason && reason !== "未明确" && reason !== "无" && !reasonsBySource[src]) reasonsBySource[src] = reason;
  }
  // ③ Legacy `> 用户提示/决策：`〔decision〕—— 仅当无 `> 决策：` 块时兼容旧数据；
  //    否则会与①对同一决策重复计数（①是全量 statement，③是 buildClueHeader 截断到 48 字版）。
  const userPrompt = fieldOf(body, "用户提示/决策");
  if (!hasDecBlock) {
    for (const seg of userPrompt.split(/；|;/)) {
      if (/〔decision〕/.test(seg)) {
        const d = stripPrompt(seg);
        if (d) addDecision(d, "user");
      }
    }
  }
  // ④ 正文逐行：goal 事件（决定 …）+ 用户消息 + 动作行 + 思维行
  const userMessages: string[] = [];
  const actions: string[] = [];
  const thinkLines: string[] = [];
  const bodyLines = body.split("\n").map((s) => s.trim()).filter((l) => /^-\s*\[/.test(l));
  for (const l of bodyLines) {
    const m = l.match(/^-\s*\[[^\]]*\]\s*\[[^\]]*\]\s*(.*)$/);
    const txt = m ? m[1] : l;
    if (/^用户：/.test(txt)) {
      userMessages.push(scrubUnsafe(txt.replace(/^用户：/, "")).trim().slice(0, 160));
    } else if (/^决定 /.test(txt)) {
      addDecision(scrubUnsafe(txt.replace(/^决定 /, "")).trim(), "assistant");
    } else if (/改\/读 |调用 /.test(txt)) {
      actions.push(scrubUnsafe(txt).trim());
    } else if (txt && !/^用户：/.test(txt)) {
      thinkLines.push(scrubUnsafe(txt).trim());
    }
  }
  for (const ev of decisionEvents) if (!ev.reason && reasonsBySource[ev.source]) ev.reason = reasonsBySource[ev.source];
  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
  const ns = time.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3");
  const createdAt = `${date} ${ns || "00:00:00"}`;
  const kind = deriveAtomKind({ entry, materials, decisions: uniq(decisions), goal, userMessages: uniq(userMessages) });
  const lineage = deriveLineage({ source: fieldOf(body, "来源会话"), createdBy: deriveCreatedBy({ decisionEvents, userMessages: uniq(userMessages), materials }), materials, createdAt });
  return { rel, date, time, entry, project, agent, goal, decisions: uniq(decisions), decisionEvents, userMessages: uniq(userMessages), materials, actions: uniq(actions), thinkLines: uniq(thinkLines), body, kind, lineage };
};

// ── 时间辅助 ──
const fmt = (hhmmss: string): string => {
  const s = String(hhmmss || "").padEnd(6, "0");
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
};
const epochMin = (date: string, hhmmss: string): number => {
  const t = new Date(`${date}T${fmt(hhmmss) || "00:00:00"}`);
  return Number.isNaN(t.getTime()) ? 0 : Math.floor(t.getTime() / 60000);
};

// ── 派生 Episodes ──
export interface DeriveEpisodesOpts {
  gapMinutes?: number; // 同一 project+agent 内，两次记忆间隔超过 N 分钟则开启新 Episode（默认 60）
}

export const deriveEpisodes = (parsed: ParsedMemory[], opts: DeriveEpisodesOpts = {}): Episode[] => {
  const gapMinutes = Math.max(0, Number(opts.gapMinutes) || 60);
  const sorted = [...parsed].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const eps: (Episode & Meta)[] = [];
  let cur: (Episode & Meta) | null = null;
  const start = (p: ParsedMemory): Episode & Meta => {
    const at = `${p.date} ${fmt(p.time)}`;
    const id = `ep-${p.date}--${p.time || "000000"}-${(p.entry || p.project || "task").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 24) || "task"}`;
    const title = p.goal || p.entry || p.project || "（无标题任务）";
    return {
      id,
      startedAt: at,
      endedAt: at,
      project: p.project,
      agent: p.agent,
      title,
      objective: p.goal,
      memoryCount: 1,
      memoryRefs: [p.rel],
      entries: p.entry ? [p.entry] : [],
      decisions: p.decisions.map((d) => ({ text: d, rel: p.rel, at })),
      actions: p.actions.map((a) => ({ text: a, rel: p.rel, at })),
      materials: [...p.materials],
      key: `${p.project}|${p.agent}`,
      lastAt: epochMin(p.date, p.time),
    };
  };
  const append = (e: Episode & Meta, p: ParsedMemory) => {
    const at = `${p.date} ${fmt(p.time)}`;
    e.endedAt = at;
    e.memoryCount += 1;
    e.memoryRefs.push(p.rel);
    if (p.entry && !e.entries.includes(p.entry)) e.entries.push(p.entry);
    if (!e.objective && p.goal && p.goal !== e.title) { e.objective = p.goal; e.title = p.goal; }
    for (const d of p.decisions) if (!e.decisions.some((x) => x.text === d)) e.decisions.push({ text: d, rel: p.rel, at });
    for (const a of p.actions) if (!e.actions.some((x) => x.text === a)) e.actions.push({ text: a, rel: p.rel, at });
    for (const m of p.materials) if (!e.materials.includes(m)) e.materials.push(m);
    e.lastAt = epochMin(p.date, p.time);
  };
  for (const p of sorted) {
    const key = `${p.project}|${p.agent}`;
    const ok = cur && cur.key === key && (!cur.lastAt || epochMin(p.date, p.time) - cur.lastAt <= gapMinutes);
    if (ok) {
      append(cur!, p);
    } else {
      cur = start(p);
      eps.push(cur);
    }
  }
  // 去掉内部字段
  return eps.map(({ key: _k, lastAt: _l, ...e }) => e);
};

// ── 决策血缘（Decision Lineage）──
export interface DecisionLineageEntry {
  text: string;       // 决策事实（statement）
  statement: string;  // 决策事实
  reason: string;     // 明确理由（无则 ""，绝不补写）
  source: string;     // goal | user | assistant | ""
  rel: string;
  at: string;
}
export interface DecisionLineage {
  byEntry: Record<string, DecisionLineageEntry[]>;
  count: number;
}
export const deriveDecisions = (parsed: ParsedMemory[], opts: { topic?: string; entry?: string } = {}) => {
  const byEntry: Record<string, DecisionLineageEntry[]> = {};
  let count = 0;
  const needle = String(opts?.topic || opts?.entry || "").toLowerCase();
  for (const p of parsed) {
    const el = needle ? (p.entry.toLowerCase().includes(needle) || (opts?.entry ? p.entry === opts.entry : true)) : true;
    if (needle && !el) continue;
    // 优先用富化 decisionEvents（带 reason/source）；旧数据无 events 时回退到 decisions（reason 未知）。
    const events: DecisionEvent[] = p.decisionEvents.length ? p.decisionEvents : p.decisions.map((d) => ({ statement: d, source: "", reason: "" }));
    for (const ev of events) {
      const text = ev.statement;
      const at = `${p.date} ${fmt(p.time)}`;
      if (needle && !`${text} ${p.entry}`.toLowerCase().includes(needle)) continue;
      const key = p.entry || "(无入口)";
      (byEntry[key] = byEntry[key] || []).push({ text, statement: text, reason: ev.reason || "", source: ev.source || "", rel: p.rel, at });
      count++;
    }
  }
  for (const k of Object.keys(byEntry)) byEntry[k].sort((a, b) => a.at.localeCompare(b.at));
  return { byEntry, count };
};

// ── 渲染 ──
const D = (text: string) => (String(text || "").slice(0, 60));

/** _index.md 里的「任务回溯（Episodes）」段（保守：不引号包裹入口名，避免与主题索引撞名）。 */
export const episodesIndexText = (eps: Episode[], limit = 8) => {
  if (!eps.length) return "## 任务回溯（Episodes）\n\n（暂无连续任务片段，当前仅原子记忆）\n";
  const recent = eps.slice(-limit).reverse();
  const lines = ["## 任务回溯（Episodes）", ""];
  lines.push("> 由记忆原子按「项目/会话 + 时间间隔」派生；一次连续任务 = 一个 Episode，记忆碎片在此被串起来。", "> 要展开某个任务：`read_shadow({mode:'episode'})` 或 `read_shadow({topic:'<入口>'})`。", "");
  for (const e of recent) {
    const range = e.startedAt === e.endedAt ? e.startedAt.slice(5, 16) : `${e.startedAt.slice(5, 16)}–${e.endedAt.slice(5, 16)}`;
    lines.push(`- ${range} · ${e.title} · ${e.memoryCount} 条记忆 · ${e.decisions.length} 决策${e.agent ? ` · ${e.agent}` : ""}`);
  }
  return lines.join("\n") + "\n";
};

/** read mode:"episode" 的渲染。 */
export const renderEpisodes = (eps: Episode[], topic?: string) => {
  const needle = String(topic || "").toLowerCase();
  const filtered = needle ? eps.filter((e) => [e.title, e.objective, ...e.entries, ...e.materials, ...e.decisions.map((d) => d.text), ...e.actions.map((a) => a.text)].join(" ").toLowerCase().includes(needle)) : eps;
  if (!filtered.length) return needle ? `（无匹配 episode：${topic}）` : "（暂无 Episode 派生结果）";
  const parts = filtered.map((e) => {
    const seg: string[] = [];
    seg.push(`## Episode · ${e.title}`);
    seg.push(`- 时间：${e.startedAt} → ${e.endedAt}${e.project ? ` · 项目：${e.project}` : ""}${e.agent ? ` · Agent：${e.agent}` : ""}`);
    if (e.objective && e.objective !== e.title) seg.push(`- 目标：${D(e.objective)}`);
    if (e.entries.length) seg.push(`- 涉及入口：${e.entries.slice(0, 8).join("、")}`);
    if (e.materials.length) seg.push(`- 背景/材料：${e.materials.slice(0, 8).join("、")}`);
    seg.push(`- ${e.memoryCount} 条记忆 · ${e.decisions.length} 决策 · ${e.actions.length} 动作`);
    if (e.decisions.length) {
      seg.push(`- 决策链：`);
      for (const d of e.decisions.slice(0, 12)) seg.push(`    · ${d.at.slice(5)} ${D(d.text)}`);
    }
    if (e.actions.length) {
      seg.push(`- 动作摘要：`);
      for (const a of e.actions.slice(0, 10)) seg.push(`    · ${a.at.slice(5)} ${D(a.text)}`);
    }
    seg.push(`- 记忆：${e.memoryRefs.map((r) => r.split("/").slice(-1)[0]).join("、")}`);
    return seg.join("\n");
  });
  return parts.join("\n\n");
};

/** read mode:"decision" 的渲染。 */
export const renderDecisions = (dl: DecisionLineage) => {
  if (!dl.count) return "（无决策血缘：当前记忆树未采集到决策 —— 决策来自 goal/changed、用户拍板、assistant 明确决策；Confirmation 不算决策，Reason 不补写）";
  const parts: string[] = [
    `# Decision Lineage · 共 ${dl.count} 条决策`,
    "> Evidence ≠ Interpretation：Reason 只来自原文明确表达；无则显示「未明确」，绝不补写。",
    "",
  ];
  const entries = Object.keys(dl.byEntry).sort();
  for (const entry of entries) {
    parts.push(`## ${entry}`);
    for (const d of dl.byEntry[entry]) {
      const reason = d.reason ? `因：${D(d.reason)}` : "因：未明确";
      const src = d.source ? `〔${d.source}〕` : "";
      parts.push(`- ${d.at.slice(5)} ${src}${D(d.text)}  ·  ${reason}  ·  ${d.rel.split("/").slice(-2).join("/")}`);
    }
    parts.push("");
  }
  return scrubUnsafe(parts.join("\n").trim());
};
