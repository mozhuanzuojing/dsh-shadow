// dsh-shadow —— core/recall.ts：Shadow Usability Layer（v1.5，"记忆恢复"统一入口）。
// 目的：把 read_shadow 的 episode/decision/task/context 派生视图，合成一个【人类友好】的
//      Task Recovery Bundle——用户只给一句自然查询（如"Todo清理"），系统给出"找到历史任务"。
// 原则：一切内容来自派生数据（task/decisions/evidence/outcomes/constraints），绝不 LLM 补写
//      Reason/事实/判断/完成（呼应 ADR-0037/0039）。LLM 只在【意图/排序】参与（外部可选）。
import { scrubUnsafe } from "../security/scrub.js";
import { tokenize } from "./util.js";
import type { TaskView } from "./task.js";
import type { ContextRef } from "./context.js";

const D = (s: string, n = 64) => scrubUnsafe(String(s || "")).slice(0, n);

// 确定性地挑"最相关的任务"（按查询 token 命中 title/objective/decisions/evidence/trigger）。
const bestTask = (tasks: TaskView[], query: string): TaskView | null => {
  const q = String(query || "");
  // 查询拆块（顺带按 中/英 断开，避免 "Todo清理" 被当成一个不匹配的 token）
  const chunks = Array.from(new Set([...tokenize(q), ...q.split(/([a-zA-Z0-9]+|[^a-zA-Z0-9]+)/i).map((s) => s.trim()).filter((s) => s && /[a-zA-Z0-9\u4e00-\u9fff]/.test(s))]));
  if (!chunks.length) return tasks[0] || null;
  let best: TaskView | null = null;
  let bestScore = 0;
  for (const t of tasks) {
    const hay = [t.title, t.objective, t.trigger, ...t.constraints, ...t.decisions.map((d) => d.text), ...t.decisions.map((d) => d.reason), ...t.outcomes, ...t.evidence].join(" ").toLowerCase();
    let score = 0;
    for (const tok of chunks) if (hay.includes(tok)) score += 1;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
};

const statusLabel: Record<string, string> = { active: "进行中", completed: "已完成", abandoned: "已放弃" };

// 恢复包：一段人类可读、全部来自派生数据的 Markdown。
export const renderRecovery = (query: string, tasks: TaskView[], refs: ContextRef[]): string => {
  const t = bestTask(tasks, String(query || ""));
  if (!t) return `（未在记忆树中找到可恢复的任务或主题：${query ? D(query) : "空查询"}）`;
  const seg: string[] = [];
  seg.push(`# ⤴ 记忆恢复 · ${t.title}`);
  seg.push("");
  seg.push(`- **任务**：${D(t.title, 60)}`);
  seg.push(`- **状态**：${statusLabel[t.status] || t.status}（启发式观测${t.statusNote || ""}）`);
  seg.push(`- **时间**：${t.startedAt} → ${t.endedAt}`);
  if (t.objective) seg.push(`- **目标**：${D(t.objective, 60)}`);
  if (t.trigger) seg.push(`- **触发**：${D(t.trigger, 60)}`);
  seg.push("");
  if (t.decisions.length) {
    seg.push("## 关键决定");
    for (const d of t.decisions.slice(0, 10)) seg.push(`- ${D(d.text, 44)}〔${d.source || "?"}〕${d.reason ? ` 因：${D(d.reason, 40)}` : " 因：未明确"}`);
    seg.push("");
  }
  if (t.evidence.length) {
    seg.push("## 证据（当前是否仍有效）");
    for (const ev of t.evidence.slice(0, 8)) {
      const ref = refs.find((r) => r.value === ev);
      const st = ref ? ref.status : "unknown";
      const mark = st === "validated" ? "✓有效" : st === "stale" ? "⚠已失效" : "?未知";
      seg.push(`- [${mark}] ${D(ev, 56)}${ref && ref.transformed ? ` → ${D(ref.transformed, 40)}` : ""}`);
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
  const unresolved = t.decisions.filter((d) => !d.reason).map((d) => D(d.text, 40));
  if (unresolved.length) {
    seg.push("## 未明确理由的决策");
    for (const u of unresolved) seg.push(`- ${u}（无明确理由/未记录）`);
    seg.push("");
  }
  seg.push("---");
  seg.push("> 以上内容由记忆派生（Task/Decision/Evidence/Outcome），非 LLM 补写；引用前可用 `read_shadow({mode:'context'})` 复核其当前有效性。");
  return seg.join("\n");
};
