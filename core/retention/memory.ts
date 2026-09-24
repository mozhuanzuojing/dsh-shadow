// dsh-shadow —— core/retention/memory.ts：记忆记录塑形（完整线索头）+ meta 注册。从 index.ts 迁出。
// ADR-0106：线索头必含五轴坐标（locus/when/soul/role/intent）；缺轴 ⇒ 不上投影。
import { today } from "../util.js";
import { scrubUnsafe, referencedMaterials } from "../../security/scrub.js";
import { mutateMeta } from "../../persistence/meta.js";
import { materialOfAction } from "./capture-granularity.js";

/** 投影空间五轴（ADR-0106 / X2）。每条 Atom 必须非空。 */
export interface AtomAxes {
  locus: string;
  when: string;
  soul: string;
  role: string;
  intent: string;
}

export const AXIS_KEYS = ["locus", "when", "soul", "role", "intent"] as const;

/** 五轴是否齐全（任一空串 = 缺轴）。 */
export const axesComplete = (a: Partial<AtomAxes> | null | undefined): a is AtomAxes =>
  !!a && AXIS_KEYS.every((k) => String(a[k] || "").trim().length > 0);

/** 渲染坐标行（写进线索头）。 */
export const formatAxesLine = (a: AtomAxes): string =>
  `> 坐标：locus(${scrubUnsafe(a.locus).slice(0, 80)}) · when(${scrubUnsafe(a.when).slice(0, 32)}) · soul(${scrubUnsafe(a.soul).slice(0, 40)}) · role(${scrubUnsafe(a.role).slice(0, 40)}) · intent(${scrubUnsafe(a.intent).slice(0, 80)})`;

/** 从正文解析五轴；缺任一 ⇒ 返回 null（不上投影，不猜）。 */
export const parseAxes = (body: string): AtomAxes | null => {
  const line = (String(body || "").match(/^>\s*坐标：(.+)$/m) || [])[1] || "";
  if (!line) return null;
  const pick = (k: string) => {
    const m = line.match(new RegExp(`${k}\\(([^)]*)\\)`));
    return m ? String(m[1] || "").trim() : "";
  };
  const a: AtomAxes = {
    locus: pick("locus"),
    when: pick("when"),
    soul: pick("soul"),
    role: pick("role"),
    intent: pick("intent"),
  };
  return axesComplete(a) ? a : null;
};

export const buildClueHeader = (entry: string, arr: any[], srcId?: string, extra?: {
  project?: string; agent?: string; goal?: string; foldedMaterials?: string[]; axes?: AtomAxes;
}) => {
  const mats: string[] = [];
  const prompts: string[] = [];
  const userPoints: string[] = [];
  const seen = new Set<string>();
  const addMat = (x: unknown) => {
    const p = scrubUnsafe(String(x || "").trim());
    if (p && !seen.has(p)) { seen.add(p); mats.push(p); }
  };
  for (const e of arr) {
    if (e.kind === "action") {
      const m = materialOfAction(e.text);
      if (m) addMat(m);
    }
    if (e.kind === "user") {
      const raw = scrubUnsafe(e.text.replace(/^用户：/, ""));
      const refs = referencedMaterials(raw);
      for (const r of refs.slice(0, 6)) addMat(r);
      if (e.sub) prompts.push(`「${raw.slice(0, 48)}」〔${e.sub}〕`);
      userPoints.push(`「${raw.slice(0, 48)}」`);
    }
  }
  for (const m of extra?.foldedMaterials || []) addMat(m);
  const acts = arr.filter((x) => x.kind === "action").length;
  const usr = arr.filter((x) => x.kind === "user").length;
  const decs: { text: string; source: string; reason: string }[] = [];
  const stmtSeen = new Set<string>();
  for (const e of arr) {
    let statement = "", source = "", reason = "";
    if (e.kind === "decision") {
      statement = scrubUnsafe(String(e.statement || e.text || "").replace(/^决定 /, "")).trim();
      source = String(e.source === "assistant" ? "assistant" : (e.source || "goal"));
      reason = scrubUnsafe(String(e.reason || "")).trim();
    } else if (e.kind === "user" && e.sub === "decision") {
      statement = scrubUnsafe(String(e.statement || e.text || "").replace(/^用户：/, "")).trim();
      source = "user";
      reason = scrubUnsafe(String(e.reason || "")).trim();
    }
    if (statement && !stmtSeen.has(statement)) {
      stmtSeen.add(statement);
      decs.push({ text: statement.slice(0, 120), source, reason: reason ? reason.slice(0, 120) : "" });
    }
  }
  const decCount = decs.length;
  const kindLabel: Record<string, string> = { action: "动作", user: "用户", assistant: "agent", decision: "决策" };
  const kindsSeen = Array.from(new Set(arr.map((e) => e.kind).filter(Boolean))).map((k) => kindLabel[k] || k).join("·") || "—";
  const evPaths = mats.slice(0, 6).join("、") || "—";
  const lines = ["> 完整线索"];
  // ADR-0106：五轴坐标（缺则调用方应已补默认；此处仍写出，供读侧校验）
  if (extra?.axes && axesComplete(extra.axes)) lines.push(formatAxesLine(extra.axes));
  if (mats.length) lines.push(`> 背景/材料：${mats.slice(0, 8).join("、")}`);
  if (prompts.length) lines.push(`> 用户提示/决策：${prompts.slice(0, 6).join("；")}`);
  if (decs.length) lines.push(`> 决策：${decs.slice(0, 8).map((d) => `〔${d.source}〕${d.text}`).join("；")}`);
  const reasons = decs.filter((d) => d.reason);
  if (reasons.length) lines.push(`> 决策理由：${reasons.slice(0, 6).map((d) => `〔${d.source}〕${d.reason}`).join("；")}`);
  if (userPoints.length) lines.push(`> 用户要点：${userPoints.slice(0, 6).join("；")}`);
  lines.push(`> 证据链：来源(${kindsSeen}) · 日期(${today()}) · 证据(${evPaths})`);
  lines.push(`> 概况：${acts} 动作 · ${usr} 用户消息 · ${decCount} 决策`);
  if (srcId) lines.push(`> 来源会话：${scrubUnsafe(String(srcId))}`);
  if (extra?.project) lines.push(`> 项目：${scrubUnsafe(String(extra.project))}`);
  if (extra?.agent) lines.push(`> Agent：${scrubUnsafe(String(extra.agent))}`);
  if (extra?.goal) lines.push(`> 目标：${scrubUnsafe(String(extra.goal)).slice(0, 80)}`);
  return lines.join("\n") + "\n";
};

/**
 * 登记 `_meta.json` 里的一条。**返回是否登记成功**（v1.15.56）。
 */
export const registerMeta = async (fs: any, ws: string, rel: string, actorId: string | undefined, retentionEnabled: boolean): Promise<boolean> => {
  if (!retentionEnabled) return true;
  try {
    const ok = await mutateMeta(fs, ws, (meta) => {
      if (meta[rel]) return false;
      meta[rel] = { created: today(), lastSeen: 0, hits: 0, status: "active", confidence: 0.5, pinned: false, createdBy: actorId ? String(actorId) : "", confirmedBy: [] };
    });
    if (!ok) console.log(`[dsh-shadow] meta register 未落盘（写失败或坏件）：${rel}`);
    return ok;
  } catch (e: any) {
    console.log("[dsh-shadow] meta register failed:", e && e.message);
    return false;
  }
};
