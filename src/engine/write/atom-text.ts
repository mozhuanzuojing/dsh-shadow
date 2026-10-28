/**
 * v2 engine/write — 一条 atom 的正文构造（纯函数，可单测）。
 */

import type { AtomAxes } from "../../contract/types.js";
import { fmtTime } from "../../contract/time.js";
import { isPathLike } from "../../domain/text.js";

export interface Trace {
  at: string;
  /** 进程内单调序号：flush 只消费快照里见过的 seq，避免并发 push/溢出时误删新事件。 */
  seq: number;
  /** 事件所属本地日期（YYYY-MM-DD）；跨日 flush 时用事件日期，不拿 flush 时刻。 */
  date: string;
  kind: "action" | "user" | "assistant" | "decision";
  text: string;
  comp: string;
  source: "fs" | "tool" | "goal" | "user" | "assistant" | "other";
  statement?: string;
  reason?: string;
}

export interface AtomTextOpts {
  ws: string;
  entry: string;
  date: string;
  time: string;
  agentId: string;
  project: string;
  goal: string;
  summary: "auto" | "off" | "deterministic";
}

const uniq = (arr: string[]): string[] => Array.from(new Set(arr.filter(Boolean)));
const cut = (s: unknown, n: number): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const pathOfAction = (text: string): string => {
  // 只有 fs 动作带路径；工具名（调用 pwsh）不是材料。
  const m = /^改\/读\s+(.+)$/.exec(text.trim());
  return m ? m[1]!.trim() : "";
};

export const primaryEntry = (traces: Trace[], ws: string): string => {
  const tally = new Map<string, number>();
  for (const t of traces) {
    if (t.kind !== "action" || t.source !== "fs") continue;
    const comp = String(t.comp ?? "").trim();
    if (!comp || comp === "shadow" || comp.startsWith(".shadow")) continue;
    tally.set(comp, (tally.get(comp) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (top) return top;
  const base = String(ws).replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() || "";
  return base && base !== ".shadow" ? base : "session";
};

export const projectName = (ws: string): string =>
  String(ws).replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() || "workspace";

export const deterministicSummary = (traces: Trace[], goal: string): string => {
  const user = traces.find((t) => t.kind === "user");
  if (user) return cut(user.text.replace(/^用户：/, ""), 80);
  if (goal) return cut(goal, 80);
  const action = traces.find((t) => t.kind === "action");
  if (action) return cut(action.text, 80);
  const decision = traces.find((t) => t.kind === "decision");
  if (decision) return cut(decision.statement ?? decision.text, 80);
  return "（无摘要）";
};

export const buildAtomText = (traces: Trace[], opts: AtomTextOpts): string => {
  const entries = primaryEntry(traces, opts.ws);
  const entry = opts.entry || entries;
  const actions = traces.filter((t) => t.kind === "action");
  const users = traces.filter((t) => t.kind === "user");
  const decisions = traces.filter((t) => t.kind === "decision");
  const materials = uniq(actions.map((a) => pathOfAction(a.text)).filter((p) => p && !p.startsWith(".shadow") && isPathLike(p))).slice(0, 12);  const axes: AtomAxes = {
    locus: opts.ws,
    when: `${opts.date} ${fmtTime(opts.time)}`,
    soul: "default",
    role: "default",
    intent: opts.goal || "capture",
  };
  const lines: string[] = [`# ${entry}`, "", "> 完整线索"];
  lines.push(`> 坐标：locus(${axes.locus}) · when(${axes.when}) · soul(${axes.soul}) · role(${axes.role}) · intent(${axes.intent})`);
  if (materials.length) lines.push(`> 背景/材料：${materials.join("、")}`);
  if (decisions.length) {
    lines.push(`> 决策：${decisions.slice(0, 8).map((d) => `〔${d.source}〕${cut(d.statement ?? d.text, 120)}`).join("；")}`);
    const reasons = decisions.filter((d) => d.reason);
    if (reasons.length) lines.push(`> 决策理由：${reasons.slice(0, 6).map((d) => `〔${d.source}〕${cut(d.reason, 160)}`).join("；")}`);
  }
  lines.push(`> 证据链：来源(决策·动作·用户) · 日期(${opts.date}) · 证据(${materials.slice(0, 6).join("、") || "—"})`);
  lines.push(`> 概况：${actions.length} 动作 · ${users.length} 用户消息 · ${decisions.length} 决策`);
  if (opts.project) lines.push(`> 项目：${opts.project}`);
  if (opts.goal) lines.push(`> 目标：${cut(opts.goal, 160)}`);
  if (opts.agentId) lines.push(`> Agent：${opts.agentId}`);
  if (opts.summary !== "off") lines.push(`> 摘要：${deterministicSummary(traces, opts.goal)}`);
  lines.push(`> 覆盖：${traces.length} 条事件${materials.length >= 12 ? "（材料已截断到 12 条）" : ""}`);
  lines.push("");
  for (const t of traces) {
    const at = t.at || opts.time;
    lines.push(`- [${at}] [${entry}] ${t.text}`);
  }
  return lines.join("\n") + "\n";
};
