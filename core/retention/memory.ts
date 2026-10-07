// dsh-shadow —— core/retention/memory.ts：记忆记录塑形（完整线索头）+ meta 注册。从 index.ts 迁出。
// ADR-0106：线索头必含五轴坐标（locus/when/soul/role/intent）；缺轴 ⇒ 不上投影。
import { today } from "../util.js";
import { scrubUnsafe, referencedMaterials } from "../../security/scrub.js";
import { metaOutcomeNotice, mutateMetaVersioned } from "../../persistence/meta.js";
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
 * 登记 `_meta.json` 里的一条。**返回「要不要报『未登记』」**（v1.15.56；B24 收口后语义写死在这里）。
 *
 * ## 为什么这一处**必须**区分「并发没抢到」与「写失败」（B24 消费面①）
 *
 * 返回值不是内部读数：`core/writer/materialize.ts` 拿它设 `core.lastMetaError`，而那是一条
 * **给读者看的横幅**（`getFlushWarn()` 在每个读路径上渲染：「元数据未登记 ⇒ hits/生命周期/遗忘判据
 * 都看不到这条记忆」）。四态在这里的含义**不同**（判据在 `persistence/meta.ts` 的 `metaOutcomeNotice` 一处）：
 *   · `ok` / `noop` ⇒ 登记状态成立。`noop` 是**常态**：同一个 rel 只在首写时登记一次，
 *     之后每次 flush 的 mutate 都因 `meta[rel]` 已存在而返回 `false`（旧 boolean 把它与 `ok` 都算 `true`，对）；
 *   · `contended` ⇒ **本次没写进去，但会自愈**：`meta[rel]` 仍不存在 ⇒ 下一次写同一条记忆时
 *     这段 mutate 会重新登记它（本函数是幂等的）。它**不是**登记失败 ⇒ 返回 `true`：
 *     否则正常并发（多会话/teammate 同时 flush）就会给读者挂上「hits/生命周期都看不到这条记忆」的横幅
 *     —— ADR-0049 的可见信号被**误报**成系统故障，而 ADR-0068 明文接受「竞争下放弃这一次、下次再记」；
 *   · `failed`（含坏件不写回）⇒ **要人管**：磁盘满 / EACCES / `_meta.json` 坏件。
 *     返回 `false` ⇒ 调用方设 `lastMetaError` 上横幅 —— v1.15.56 立的信号**保持不变**。
 *
 * ⚠ 四个结局里只有 `failed` 需要人管，故对外**仍是 `boolean`**（B24 的四态在**本函数内**被消费完；
 * `persistence/meta.ts` 的 `mutateMetaVersioned` 类型注释写着「要区分就调它」——这里就是「要」的那一处）。
 */
export const registerMeta = async (fs: any, ws: string, rel: string, actorId: string | undefined, retentionEnabled: boolean): Promise<boolean> => {
  if (!retentionEnabled) return true;
  try {
    const outcome = await mutateMetaVersioned(fs, ws, (meta) => {
      if (meta[rel]) return false;
      meta[rel] = { created: today(), lastSeen: 0, hits: 0, status: "active", confidence: 0.5, pinned: false, createdBy: actorId ? String(actorId) : "", confirmedBy: [] };
    });
    const notice = metaOutcomeNotice(outcome);
    // `contended` 只留一行日志（时间性、自愈）；**只有 `needsHuman` 才让调用方上报**（见上）。
    if (notice && !notice.needsHuman) console.log(`[dsh-shadow] meta register 并发未抢到（下一条记忆的 flush 会重新登记）：${rel}`);
    return !notice?.needsHuman;
  } catch (e: any) {
    console.log("[dsh-shadow] meta register failed:", e && e.message);
    return false;
  }
};
