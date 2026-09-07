// dsh-shadow —— core/memory.ts：记忆记录塑形（完整线索头）+ meta 注册。从 index.ts 迁出。
import { today } from "./util.js";
import { scrubUnsafe, referencedMaterials } from "../security/scrub.js";
import { readMeta, writeMeta } from "../persistence/meta.js";

export const buildClueHeader = (entry: string, arr: any[], srcId?: string, extra?: { project?: string; agent?: string; goal?: string }) => {
  const mats: string[] = [];
  const prompts: string[] = [];
  const userPoints: string[] = [];
  const seen = new Set<string>();
  const addMat = (x: unknown) => {
    const p = scrubUnsafe(String(x || "").trim());
    if (p && !seen.has(p)) { seen.add(p); mats.push(p); }
  };
  for (const e of arr) {
    if (e.kind === "action" && /^改\/读 /.test(e.text)) addMat(e.text.replace(/^改\/读 /, "").trim());
    if (e.kind === "user") {
      const raw = scrubUnsafe(e.text.replace(/^用户：/, ""));
      const refs = referencedMaterials(raw);
      for (const r of refs.slice(0, 6)) addMat(r);
      if (e.sub) prompts.push(`「${raw.slice(0, 48)}」〔${e.sub}〕`);
      userPoints.push(`「${raw.slice(0, 48)}」`);
    }
  }
  const acts = arr.filter((x) => x.kind === "action").length;
  const usr = arr.filter((x) => x.kind === "user").length;
  // 决策计数：goal 事件（kind===decision）+ 用户拍板（classifyUser===decision）。二者都是真实决策，
  // 旧实现只数 goal 事件 → 大量真实决策在「概况：0 决策」中丢失（这是"为什么做了很多判断却显示 0 决策"的根因）。
  const decs = arr.filter((x) => x.kind === "decision" || (x.kind === "user" && x.sub === "decision")).length;
  // 决策血缘（可追踪）：把决策从统计字段提升为「决策文本列表」，供后续 Episode/Decision Lineage 派生。
  const decisions: string[] = [];
  for (const e of arr) {
    if (e.kind === "decision") {
      const d = scrubUnsafe(String(e.text || "").replace(/^决定 /, "")).trim();
      if (d && !decisions.includes(d)) decisions.push(d.slice(0, 120));
    } else if (e.kind === "user" && e.sub === "decision") {
      const d = scrubUnsafe(String(e.text || "").replace(/^用户：/, "")).trim();
      if (d && !decisions.includes(d)) decisions.push(d.slice(0, 120));
    }
  }
  const kindLabel: Record<string, string> = { action: "动作", user: "用户", assistant: "agent", decision: "决策" };
  const kindsSeen = Array.from(new Set(arr.map((e) => e.kind).filter(Boolean))).map((k) => kindLabel[k] || k).join("·") || "—";
  const evPaths = mats.slice(0, 6).join("、") || "—";
  const lines = ["> 完整线索"];
  if (mats.length) lines.push(`> 背景/材料：${mats.slice(0, 8).join("、")}`);
  if (prompts.length) lines.push(`> 用户提示/决策：${prompts.slice(0, 6).join("；")}`);
  if (decisions.length) lines.push(`> 决策：${decisions.slice(0, 6).join("；")}`);
  if (userPoints.length) lines.push(`> 用户要点：${userPoints.slice(0, 6).join("；")}`);
  lines.push(`> 证据链：来源(${kindsSeen}) · 日期(${today()}) · 证据(${evPaths})`);
  lines.push(`> 概况：${acts} 动作 · ${usr} 用户消息 · ${decs} 决策`);
  if (srcId) lines.push(`> 来源会话：${scrubUnsafe(String(srcId))}`);
  if (extra?.project) lines.push(`> 项目：${scrubUnsafe(String(extra.project))}`);
  if (extra?.agent) lines.push(`> Agent：${scrubUnsafe(String(extra.agent))}`);
  if (extra?.goal) lines.push(`> 目标：${scrubUnsafe(String(extra.goal)).slice(0, 80)}`);
  return lines.join("\n") + "\n";
};

export const registerMeta = async (fs: any, ws: string, rel: string, actorId: string | undefined, retentionEnabled: boolean) => {
  if (!retentionEnabled) return;
  try {
    const meta = await readMeta(fs, ws);
    if (meta[rel]) return;
    meta[rel] = { created: today(), lastSeen: 0, hits: 0, status: "active", confidence: 0.5, pinned: false, createdBy: actorId ? String(actorId) : "", confirmedBy: [] };
    await writeMeta(fs, ws, meta);
  } catch (e: any) {
    console.log("[dsh-shadow] meta register failed:", e && e.message);
  }
};
