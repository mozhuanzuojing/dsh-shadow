/**
 * v2 domain — 派生视图：Episode / Decision / Task / Context / Recovery。
 *
 * 纪律：只派生、不改写记忆；Reason 不补写；Outcome≠Success；Task status 是启发式观测。
 */

import type {
  ContextRef,
  ContextStatus,
  DecisionLineage,
  Episode,
  ParsedAtom,
  TaskView,
} from "../contract/types.js";
import { atOf, fmtTime } from "../contract/time.js";
import { scrubUnsafe, scrubUnsafeDoc } from "./text.js";
import { fuzzyOverlap } from "./rank.js";

const D = (s: unknown, n = 60): string => scrubUnsafe(String(s ?? "")).slice(0, n);
const uniq = (arr: string[]): string[] => Array.from(new Set(arr.filter(Boolean)));

const epochMin = (date: string, hhmmss: string): number => {
  const t = new Date(`${date}T${fmtTime(hhmmss)}`);
  return Number.isNaN(t.getTime()) ? 0 : Math.floor(t.getTime() / 60000);
};

// ── Episode ──────────────────────────────────────────────

export const deriveEpisodes = (parsed: ParsedAtom[], gapMinutes = 60): Episode[] => {
  const sorted = [...parsed].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const eps: (Episode & { key: string; lastAt: number })[] = [];
  let cur: (Episode & { key: string; lastAt: number }) | null = null;

  const start = (p: ParsedAtom): Episode & { key: string; lastAt: number } => {
    const at = atOf(p.date, p.time);
    const id = `ep-${p.date}--${p.time || "000000"}-${(p.entry || p.project || "task").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 24) || "task"}`;
    return {
      id,
      startedAt: at,
      endedAt: at,
      project: p.project,
      agent: p.agent,
      title: p.goal || p.entry || p.project || "（无标题任务）",
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

  const append = (e: Episode & { key: string; lastAt: number }, p: ParsedAtom): void => {
    const at = atOf(p.date, p.time);
    e.endedAt = at;
    e.memoryCount += 1;
    e.memoryRefs.push(p.rel);
    if (p.entry && !e.entries.includes(p.entry)) e.entries.push(p.entry);
    if (!e.objective && p.goal && p.goal !== e.title) {
      e.objective = p.goal;
      e.title = p.goal;
    }
    for (const d of p.decisions) if (!e.decisions.some((x) => x.text === d)) e.decisions.push({ text: d, rel: p.rel, at });
    for (const a of p.actions) if (!e.actions.some((x) => x.text === a)) e.actions.push({ text: a, rel: p.rel, at });
    for (const m of p.materials) if (!e.materials.includes(m)) e.materials.push(m);
    e.lastAt = epochMin(p.date, p.time);
  };

  for (const p of sorted) {
    const key = `${p.project}|${p.agent}`;
    const ok = cur && cur.key === key && (!cur.lastAt || epochMin(p.date, p.time) - cur.lastAt <= gapMinutes);
    if (ok && cur) append(cur, p);
    else {
      cur = start(p);
      eps.push(cur);
    }
  }
  return eps.map(({ key: _k, lastAt: _l, ...e }) => e);
};

export const renderEpisodes = (eps: Episode[], topic?: string): string => {
  const needle = String(topic ?? "").toLowerCase();
  const filtered = needle
    ? eps.filter((e) => [e.title, e.objective, ...e.entries, ...e.materials, ...e.decisions.map((d) => d.text), ...e.actions.map((a) => a.text)].join(" ").toLowerCase().includes(needle))
    : eps;
  if (!filtered.length) return needle ? `（无匹配 episode：${topic}）` : "（暂无 Episode 派生结果）";
  return filtered
    .map((e) => {
      const seg: string[] = [`## Episode · ${e.title}`];
      seg.push(`- 时间：${e.startedAt} → ${e.endedAt}${e.project ? ` · 项目：${e.project}` : ""}${e.agent ? ` · Agent：${e.agent}` : ""}`);
      if (e.objective && e.objective !== e.title) seg.push(`- 目标：${D(e.objective)}`);
      if (e.entries.length) seg.push(`- 涉及入口：${e.entries.slice(0, 8).join("、")}`);
      if (e.materials.length) seg.push(`- 背景/材料：${e.materials.slice(0, 8).join("、")}`);
      seg.push(`- ${e.memoryCount} 条记忆 · ${e.decisions.length} 决策 · ${e.actions.length} 动作`);
      if (e.decisions.length) {
        seg.push("- 决策链：");
        for (const d of e.decisions.slice(0, 12)) seg.push(`    · ${d.at.slice(5)} ${D(d.text)}`);
      }
      if (e.actions.length) {
        seg.push("- 动作摘要：");
        for (const a of e.actions.slice(0, 10)) seg.push(`    · ${a.at.slice(5)} ${D(a.text)}`);
      }
      seg.push(`- 记忆：${e.memoryRefs.map((r) => r.split("/").slice(-1)[0]).join("、")}`);
      return seg.join("\n");
    })
    .join("\n\n");
};

// ── Decision ─────────────────────────────────────────────

export const deriveDecisions = (
  parsed: ParsedAtom[],
  opts: { topic?: string; entry?: string } = {},
): DecisionLineage => {
  const byEntry: DecisionLineage["byEntry"] = {};
  let count = 0;
  const needle = String(opts.topic || opts.entry || "").toLowerCase();
  for (const p of parsed) {
    const entryOk = needle
      ? p.entry.toLowerCase().includes(needle) || (opts.entry ? p.entry === opts.entry : true)
      : true;
    if (needle && !entryOk) continue;
    for (const ev of p.decisionEvents) {
      const text = ev.statement;
      const at = atOf(p.date, p.time);
      if (needle && !`${text} ${p.entry}`.toLowerCase().includes(needle)) continue;
      const key = p.entry || "(无入口)";
      (byEntry[key] ??= []).push({
        text,
        statement: text,
        reason: ev.reason ?? "",
        source: ev.source ?? "",
        rel: p.rel,
        at,
      });
      count++;
    }
  }
  for (const k of Object.keys(byEntry)) byEntry[k]!.sort((a, b) => a.at.localeCompare(b.at));
  return { byEntry, count };
};

export const renderDecisions = (dl: DecisionLineage): string => {
  if (!dl.count) {
    return "（无决策血缘：当前记忆树未采集到决策 —— 决策来自 goal/changed、用户拍板、assistant 明确决策；Confirmation 不算决策，Reason 不补写）";
  }
  const parts: string[] = [
    `# Decision Lineage · 共 ${dl.count} 条决策`,
    "> Evidence ≠ Interpretation：Reason 只来自原文明确表达；无则显示「未明确」，绝不补写。",
    "",
  ];
  for (const entry of Object.keys(dl.byEntry).sort()) {
    parts.push(`## ${entry}`);
    for (const d of dl.byEntry[entry]!) {
      const reason = d.reason ? `因：${D(d.reason)}` : "因：未明确";
      const src = d.source ? `〔${d.source}〕` : "";
      parts.push(`- ${d.at.slice(5)} ${src}${D(d.text)}  ·  ${reason}  ·  ${d.rel.split("/").slice(-2).join("/")}`);
    }
    parts.push("");
  }
  return scrubUnsafeDoc(parts.join("\n").trim());
};

// ── Task ─────────────────────────────────────────────────

const REMINDER_RE = /注意|提醒|重点|不要|别|小心|切记|别忘了|另外|补充|但是|错误|不对|前提|前提是|关键是|边界|坑|留[^。]{0,5}(神|意)/;
const COMPLETE_RE = /(全部通过|通过|完成|passed|测试通过|执行成功|done|complete|成功)/i;
const ABANDON_RE = /(放弃|停止|搁置|不再做|废弃该|abandon|取消)/i;
const OUTCOME_RE = /(通过|passed|成功|失败|报错|错误|完成|耗时|个测试|tests?|结果|耗时|ms|秒)/i;

export const deriveTasks = (parsed: ParsedAtom[]): TaskView[] => {
  const groups = new Map<string, ParsedAtom[]>();
  for (const p of parsed) {
    const key = p.goal || p.entry || "(无任务)";
    const g = groups.get(key) ?? [];
    g.push(p);
    groups.set(key, g);
  }
  const out: TaskView[] = [];
  for (const [key, atoms] of groups) {
    const sorted = [...atoms].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const first = sorted[0]!;
    const userLines = sorted.flatMap((a) => a.userMessages);
    const trigger = scrubUnsafe((userLines[0] ?? "").slice(0, 80)) || "（无明确触发用户消息）";
    const constraints = uniq(
      sorted.flatMap((a) => a.userMessages.filter((l) => REMINDER_RE.test(l)).map((l) => scrubUnsafe(l.trim()).slice(0, 60))),
    );
    const decisions = sorted.flatMap((a) => {
      const at = atOf(a.date, a.time);
      return a.decisionEvents.map((e) => ({
        text: scrubUnsafe(String(e.statement || "")).slice(0, 80),
        source: String(e.source || ""),
        reason: scrubUnsafe(String(e.reason || "")).slice(0, 80),
        at,
        rel: a.rel,
      }));
    });
    const outcomes = uniq(
      sorted.flatMap((a) => a.thinkLines.filter((l) => OUTCOME_RE.test(l)).map((l) => scrubUnsafe(l.trim()).slice(0, 80))),
    );
    const evidence = uniq(sorted.flatMap((a) => a.materials)).slice(0, 12);
    const memoryRefs = sorted.map((a) => a.rel);
    const all = sorted.flatMap((a) => a.thinkLines).join("\n");
    let status: TaskView["status"] = "active";
    if (ABANDON_RE.test(all)) status = "abandoned";
    else if (COMPLETE_RE.test(all)) status = "completed";
    out.push({
      id: `task-${(key || "task").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "task"}`,
      title: scrubUnsafe((first.goal || first.entry || key).slice(0, 60)),
      objective: key,
      trigger,
      constraints,
      status,
      decisions,
      outcomes,
      evidence,
      memoryRefs,
    });
  }
  return out;
};

export const renderTasks = (tasks: TaskView[], topic?: string): string => {
  const needle = String(topic ?? "").toLowerCase();
  const filtered = needle
    ? tasks.filter((t) => [t.title, t.objective, t.trigger, ...t.constraints, ...t.decisions.map((d) => d.text), ...t.outcomes, ...t.evidence].join(" ").toLowerCase().includes(needle))
    : tasks;
  if (!filtered.length) return needle ? `（无匹配任务：${topic}）` : "（暂无 Task 派生结果）";
  return filtered
    .map((t) => {
      const seg: string[] = [`## Task · ${t.title}`];
      seg.push(`- 状态：${t.status}（启发式观测）`);
      seg.push(`- 生命周期：${t.memoryRefs.length ? t.memoryRefs[0]!.split("/").pop() : "—"}`);
      seg.push(`- 目标：${(t.objective || "—").slice(0, 60)}`);
      seg.push(`- 触发：${t.trigger.slice(0, 60)}`);
      if (t.constraints.length) seg.push(`- 约束：${t.constraints.slice(0, 6).join("、")}`);
      if (t.evidence.length) seg.push(`- 证据/材料：${t.evidence.slice(0, 6).join("、")}`);
      if (t.decisions.length) {
        seg.push(`- 决策链（${t.decisions.length}）：`);
        for (const d of t.decisions.slice(0, 12)) seg.push(`    · ${d.at.slice(5, 16)} ${d.text}〔${d.source || "?"}〕${d.reason ? `，因：${d.reason}` : "，因：未明确"}`);
      }
      if (t.outcomes.length) {
        seg.push("- 观测结果（非成/败判断）：");
        for (const o of t.outcomes.slice(0, 8)) seg.push(`    · ${o.slice(0, 70)}`);
      }
      seg.push(`- 记忆：${t.memoryRefs.map((r) => r.split("/").pop()).join("、")}`);
      return seg.join("\n");
    })
    .join("\n\n");
};

// ── Context（需要外部 verify 回调）──────────────────────

export interface ContextMapping {
  from: string;
  to: string;
  rule?: string;
}

export interface EvidenceStatusResult {
  status: ContextStatus;
  transformed?: string;
  rule?: string;
}

export const deriveContextRefs = async (
  parsed: ParsedAtom[],
  verify: (path: string) => Promise<EvidenceStatusResult>,
  mappings: ContextMapping[] = [],
): Promise<ContextRef[]> => {
  const map = new Map<string, { subject: string; value: string; source: string[]; status: ContextStatus; transformed?: string; rule?: string }>();
  for (const p of parsed) {
    const subject = p.entry || "(无入口)";
    for (const value of uniq([...p.materials, ...evidencePathsOf(p.body)]).slice(0, 12)) {
      if (!isPathLike(value)) continue;
      const key = `${subject}||${value}`;
      let ref = map.get(key);
      if (!ref) {
        ref = { subject, value, source: [], status: "unknown" };
        map.set(key, ref);
      }
      if (!ref.source.includes(p.rel)) ref.source.push(p.rel);
    }
  }
  const refs: ContextRef[] = [];
  for (const ref of map.values()) {
    const mapped = applyMapping(ref.value, mappings);
    const r = await verify(ref.value);
    refs.push({
      subject: ref.subject,
      value: ref.value,
      source: ref.source.join("、"),
      status: r.status,
      transformed: mapped?.transformed,
      rule: mapped?.rule,
    });
  }
  return refs;
};

const applyMapping = (value: string, mappings: ContextMapping[]): { transformed: string; rule: string } | undefined => {
  const v = String(value ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  for (const m of mappings) {
    const f = String(m.from ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (m.from && (v === f || v.startsWith(f + "/"))) {
      const to = String(m.to ?? "").replace(/[/\\]+$/, "");
      return { transformed: to + v.slice(f.length), rule: m.rule || `${m.from} → ${m.to}（转换规则,非事实）` };
    }
  }
  return undefined;
};

const PATH_RE = /(?:[A-Za-z]:[\\/]|\/|\.{1,2}\/)?[A-Za-z0-9_\-./\\]{3,}\.(?:md|ts|js|json|py|yaml|yml|html|css|mjs|sh|ps1|txt|sqlite)\b/g;
const isPathLike = (x: string): boolean => PATH_RE.test(String(x ?? "")) && !/[<>{}*?]/.test(String(x ?? ""));
const evidencePathsOf = (text: string): string[] => [...String(text ?? "").matchAll(PATH_RE)].map((m) => m[0]);

export const renderContextRefs = (refs: ContextRef[], topic?: string): string => {
  const needle = String(topic ?? "").toLowerCase();
  const filtered = needle
    ? refs.filter((r) => `${r.subject} ${r.value} ${r.transformed ?? ""} ${r.rule ?? ""}`.toLowerCase().includes(needle))
    : refs;
  if (!filtered.length) return needle ? `（无匹配 context 引用：${topic}）` : "（暂无 Context 引用）";
  return filtered
    .map((r) => {
      const seg: string[] = [`## ${r.subject}`];
      seg.push(`- 值：${D(r.value, 80)}`);
      seg.push(`- 状态：${r.status}${r.status === "validated" ? "（验证仍有效）" : r.status === "stale" ? "（已过时/证据缺失）" : "（无法验证/zg未装）"}`);
      if (r.transformed) seg.push(`- 转换：${D(r.transformed, 80)}〔${r.rule}〕（Mapping≠Source Fact，非事实）`);
      seg.push(`- 来源（Evidence Pointer）：${r.source || "—"}`);
      return seg.join("\n");
    })
    .join("\n\n");
};

// ── Recovery ─────────────────────────────────────────────

export const bestTask = (tasks: TaskView[], query: string): TaskView | null => {
  const ranked = rankTasks(tasks, query);
  return ranked[0] ?? null;
};

/** 按查询 token 对任务排序（确定性；同分保持原序）。 */
export const rankTasks = (tasks: TaskView[], query: string): TaskView[] => {
  const q = String(query ?? "");
  const chunks = uniq([
    ...tokenizeLoose(q),
    ...q.split(/([a-zA-Z0-9]+|[^a-zA-Z0-9]+)/i).map((s) => s.trim()).filter((s) => s && /[a-zA-Z0-9\u4e00-\u9fff]/.test(s)),
  ]);
  if (!chunks.length) return [...tasks];
  const hayOf = (t: TaskView): string =>
    [t.title, t.objective, t.trigger, ...t.constraints, ...t.decisions.map((d) => d.text), ...t.decisions.map((d) => d.reason), ...t.outcomes, ...t.evidence]
      .join(" ")
      .toLowerCase();
  const exact = tasks.map((t) => {
    const hay = hayOf(t);
    let score = 0;
    for (const tok of chunks) if (hay.includes(tok)) score += 1;
    return { t, score };
  });
  if (exact.some((x) => x.score > 0)) return exact.sort((a, b) => b.score - a.score).map((x) => x.t);
  // 宽松兜底：仅在「所有任务严格分都为 0」时启用 CJK 2-gram 近似（不改变既有排序）。
  return tasks.map((t) => ({ t, score: fuzzyOverlap(q, hayOf(t)) })).sort((a, b) => b.score - a.score).map((x) => x.t);
};

const tokenizeLoose = (s: string): string[] =>
  s.toLowerCase().split(/[\s,，。、;；:：()（）[\]"'`]+/).map((t) => t.trim()).filter(Boolean);

export const renderRecoveryFor = (query: string, t: TaskView | null, refs: ContextRef[]): string => {
  if (!t) {
    return `（未在投影空间中找到可恢复的任务或主题：${query ? D(query) : "空查询"}）\n> 下一步：① 换更短/同义的词再查；② \`read_shadow()\` 无参看 \`.shadow/indexes/_index.md\` 的主题索引与近期记忆；③ 跨「决策/代码/文档」找上下文用 \`shadow_query\`。`;
  }
  const seg: string[] = [];
  seg.push(`# ⤴ 记忆恢复 · ${t.title}`, "");
  seg.push(`- **任务**：${D(t.title, 60)}`);
  seg.push(`- **状态**：${t.status}（启发式观测）`);
  if (t.objective) seg.push(`- **目标**：${D(t.objective, 60)}`);
  if (t.trigger) seg.push(`- **触发**：${D(t.trigger, 60)}`);
  seg.push("");
  if (t.decisions.length) {
    seg.push("## 关键决定");
    for (const d of t.decisions.slice(0, 10)) {
      seg.push(`- ${D(d.text, 44)}〔${d.source || "?"}〕${d.reason ? ` 因：${D(d.reason, 40)}` : " 因：未明确"}`);
    }
    seg.push("");
  }
  if (t.evidence.length) {
    seg.push("## 证据（当前是否仍有效）");
    for (const ev of t.evidence.slice(0, 8)) {
      const ref = refs.find((r) => r.value === ev);
      const st = ref ? ref.status : "unknown";
      seg.push(`- [${st === "validated" ? "✓有效" : st === "stale" ? "⚠已失效" : "?未知"}] ${D(ev, 56)}`);
    }
    seg.push("");
  }
  if (t.outcomes.length) {
    seg.push("## 结果（观测，非判断）");
    for (const o of t.outcomes.slice(0, 6)) seg.push(`- ${D(o, 60)}`);
    seg.push("");
  }
  if (t.constraints.length) {
    seg.push("## 当前注意 / 约束");
    for (const c of t.constraints.slice(0, 6)) seg.push(`- ${D(c, 60)}`);
    seg.push("");
  }
  seg.push("## Active Context（现在继续，要记住什么）");
  seg.push(`- **已完成 / 已决定**：${t.decisions.slice(0, 10).map((d) => D(d.text, 40)).join("、") || "—"}`);
  seg.push(`- **未完成 / 待厘清**：${t.decisions.filter((d) => !d.reason).map((d) => `${D(d.text, 40)}（无明确理由）`).join("、") || "—"}`);
  seg.push(`- **最近决策**：${t.decisions.length ? D(t.decisions[t.decisions.length - 1]!.text, 40) : "—"}`);
  seg.push(`- **入口 / 位置**：${t.evidence[0] ? D(t.evidence[0], 48) : t.memoryRefs[0]?.split("/").slice(-2).join("/") ?? "—"}`);
  seg.push("");
  seg.push("---");
  seg.push("> 以上内容由记忆派生（Task/Decision/Evidence/Outcome），非 LLM 补写；引用前可用 `read_shadow({mode:'context'})` 复核其当前有效性。");
  return seg.join("\n");
};

export const renderRecovery = (query: string, tasks: TaskView[], refs: ContextRef[]): string =>
  renderRecoveryFor(query, bestTask(tasks, query), refs);
