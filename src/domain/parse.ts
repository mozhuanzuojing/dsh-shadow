/**
 * v2 domain — v1/v2 atom 解析（唯一实现）。
 *
 * 兼容 v1 头字段与旧文件名；解析失败不抛，返回 kind:"unknown" + 空字段，
 * 调用方据 parsed 失败数决定是否发 Signal（不把坏件当空件）。
 */

import { parseAtomName } from "../contract/paths.js";
import type { AtomAxes, AtomKind, DecisionEvent, ParsedAtom } from "../contract/types.js";
import { scrubUnsafe } from "./text.js";
import { classifyTurn } from "./turn.js";

const fieldOf = (text: string, name: string): string => {
  const re = new RegExp(`^> ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}：(.+)$`, "m");
  const m = re.exec(text);
  return m ? m[1]!.trim() : "";
};

const parseAxes = (text: string): AtomAxes => {
  const axes: AtomAxes = { locus: "", when: "", soul: "", role: "", intent: "" };
  for (const m of text.matchAll(/(locus|when|soul|role|intent)\(([^)]*)\)/g)) {
    const k = m[1] as keyof AtomAxes;
    axes[k] = String(m[2] ?? "").trim();
  }
  return axes;
};

const uniq = (arr: string[]): string[] => Array.from(new Set(arr.filter(Boolean)));

const splitSemi = (line: string): string[] => line.split(/；|;/).map((x) => x.trim()).filter(Boolean);

const sourceOf = (seg: string): string => (seg.match(/^〔([^\]]+)〕/) ?? [])[1] ?? "goal";

const stripSource = (seg: string): string => seg.replace(/^〔[^\]]+〕/, "").trim();

/** 从正文行抽 `- [HH:MM:SS] [entry] …` 的文本部分。 */
const bodyTextOf = (line: string): string => {
  const m = line.match(/^-\s*\[[^\]]*\]\s*\[[^\]]*\]\s*(.*)$/);
  return (m ? m[1]! : line).trim();
};

export const parseAtom = (text: string, rel: string, name: string): ParsedAtom => {
  const parts = parseAtomName(name);
  const body = String(text ?? "");
  const date = parts?.date ?? (rel.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? "";
  const time = parts?.time ?? "";
  const entry = (body.match(/^# (.+)$/m) ?? [])[1]?.trim() ?? "";
  const project = fieldOf(body, "项目");
  const agent = fieldOf(body, "Agent");
  const goal = fieldOf(body, "目标");
  const summary = (body.match(/^> 摘要：(.+)$/m) ?? [])[1]?.trim() ?? "";
  const corrects = fieldOf(body, "纠正") || undefined;
  const withdraws = fieldOf(body, "撤回") || undefined;
  const pins = fieldOf(body, "置顶") || undefined;
  const unpins = fieldOf(body, "取消置顶") || undefined;
  const retains = fieldOf(body, "保留多值") || undefined;
  const seqRaw = fieldOf(body, "裁决序号");
  const adjudicationSeq = seqRaw && Number.isFinite(Number(seqRaw)) ? Number(seqRaw) : undefined;
  const axes = parseAxes(body);

  const materials = fieldOf(body, "背景/材料")
    .split(/、/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  const info = fieldOf(body, "信息")
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  const decisions: string[] = [];
  const decisionEvents: DecisionEvent[] = [];
  const addDecision = (stmt: unknown, source: string, reason?: unknown): void => {
    const s = scrubUnsafe(String(stmt ?? "")).trim();
    if (!s) return;
    const st = s.slice(0, 120);
    if (!decisions.includes(st)) decisions.push(st);
    if (!decisionEvents.some((e) => e.statement === st)) {
      decisionEvents.push({
        statement: st,
        source,
        reason: scrubUnsafe(String(reason ?? "")).trim().slice(0, 160) || undefined,
      });
    }
  };

  for (const seg of splitSemi(fieldOf(body, "决策"))) {
    const stmt = stripSource(seg);
    if (stmt) addDecision(stmt, sourceOf(seg));
  }

  const reasonsBySource: Record<string, string> = {};
  for (const seg of splitSemi(fieldOf(body, "决策理由"))) {
    const src = sourceOf(seg);
    const reason = stripSource(seg);
    if (reason && reason !== "未明确" && reason !== "无" && !reasonsBySource[src]) {
      reasonsBySource[src] = reason;
    }
  }

  const userMessages: string[] = [];
  const actions: string[] = [];
  const thinkLines: string[] = [];
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => /^-\s*\[/.test(l));
  for (const line of lines) {
    const txt = bodyTextOf(line);
    if (/^用户：/.test(txt)) {
      userMessages.push(scrubUnsafe(txt.replace(/^用户：/, "")).trim().slice(0, 160));
    } else if (/^决定 /.test(txt)) {
      addDecision(scrubUnsafe(txt.replace(/^决定 /, "")).trim(), "assistant");
    } else if (/改\/读 |调用 /.test(txt)) {
      actions.push(scrubUnsafe(txt).trim());
    } else if (txt) {
      thinkLines.push(scrubUnsafe(txt).trim());
    }
  }

  for (const ev of decisionEvents) {
    if (!ev.reason && reasonsBySource[ev.source]) ev.reason = reasonsBySource[ev.source];
  }
  // 历史回填（读时派生，不写存储）：信息从背景型原话补；单决策可用"因为/由于"行补 reason。
  // 材料不从正文任意路径补（会把"文档里提到的路径"误当材料，污染材料卡）——材料覆盖靠未来采集。
  const bgInfo = userMessages.filter((u) => classifyTurn(u) === "background").slice(0, 6);
  const allInfo = uniq([...info, ...bgInfo]).slice(0, 12);
  if (decisionEvents.length === 1 && !decisionEvents[0]!.reason) {
    const rl = userMessages.find((u) => /(因为|由于)/.test(u));
    if (rl) decisionEvents[0]!.reason = rl.slice(0, 160);
  }

  const kind: AtomKind = /-consolidated\.md$/.test(name)
    ? "consolidated"
    : /--ep-/.test(name)
      ? "consolidated"
      : body.trim()
        ? "memory"
        : "unknown";

  return {
    rel,
    name,
    date,
    time,
    slug: parts?.slug ?? "",
    uid: parts?.uid,
    entry,
    project,
    agent,
    goal,
    summary,
    axes,
    materials,
    info: allInfo,
    decisions: uniq(decisions),
    decisionEvents,
    userMessages: uniq(userMessages),
    actions: uniq(actions),
    thinkLines: uniq(thinkLines),
    body,
    ...(corrects ? { corrects } : {}),
    ...(withdraws ? { withdraws } : {}),
    ...(pins ? { pins } : {}),
    ...(unpins ? { unpins } : {}),
    ...(retains ? { retains } : {}),
    ...(adjudicationSeq !== undefined ? { adjudicationSeq } : {}),
    kind,
  };
};
