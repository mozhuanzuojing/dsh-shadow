/**
 * dsh-shadow —— tools/granularity.lib.ts：**记录粒度**的共享判据（v1.19.1 / `adr/0097`）。
 *
 * ## 为什么要有它（判据收一处）
 *
 * 判「一条记忆文件是不是纯动作回声」这件事，现在有**两个**使用方：
 *   · `tools/granularity-audit.ts` —— 门（只读，进 `verify`）
 *   · `tools/granularity-reclaim.ts` —— 历史回收（会删文件，一次性、`--apply` 才动）
 * 两处必须**逐字同判**，否则回收跑完门还红（或更糟：门绿了而回收漏了一批）。
 * ⇒ 抽到这里。本仓已因「同一判据两份实现」返工过两次（`tools/comparison-points.lib.ts`、`core/util.ts:numOr`）。
 *
 * ## 判据（与生产侧 `core/retention/capture-granularity.ts` 的 `isAuditBatch` 同源）
 *
 * 「`> 证据链：来源(动作)` 里**只有**动作」= 纯动作回声 = 该进审计流，不该是记忆文件。
 */
import { basename } from "node:path";

/** 起点（含）：这一天及之后的日期目录按新判据判；之前**豁免**（历史不改写，除非显式回收）。 */
export const GRANULARITY_FROM = "2026-09-21";

/** 唯一表示「只有动作」的来源串。 */
export const ACTION_ONLY = "动作";

/** 日期目录名。 */
export const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 记忆文件名判据：`.md` 且非 `_` 前缀（与 `persistence/files.ts` 的 `isMemoryFileName` 同一口径）。 */
export const isMemoryName = (name: string): boolean =>
  String(name || "").endsWith(".md") && !String(name || "").startsWith("_");

const SOURCE_RE = /> 证据链：来源\(([^)]*)\)/;

/** 取 `> 证据链：来源(...)` 里的 kinds；没有这一行 ⇒ `null`（**未判定，不猜**）。 */
export const sourceKindsOf = (text: string): string | null => {
  const m = SOURCE_RE.exec(String(text || ""));
  return m ? m[1] : null;
};

/** kinds 是否**只有动作**。 */
export const isPureActionKinds = (kinds: string | null): boolean => kinds === ACTION_ONLY;

/** 一份记忆文件文本 ⇒ 是否「纯动作回声」（无来源行 ⇒ `null` = 未判定）。 */
export const pureActionVerdict = (text: string): boolean | null => {
  const k = sourceKindsOf(text);
  return k === null ? null : isPureActionKinds(k);
};

/** 正文行（`- [HH:MM:SS] [comp] text`）—— 既是审计记录的来源，也是「逐字不丢」不变量的比较对象。 */
export const BODY_LINE_RE = /^- \[([^\]]*)\] \[([^\]]*)\] (.*)$/;

export const bodyLinesOf = (text: string): string[] =>
  String(text || "")
    .split("\n")
    .filter((l) => BODY_LINE_RE.test(l.trimEnd()))
    .map((l) => l.trimEnd());

/** 头部的 `> 背景/材料：A、B、C` ⇒ 材料数组（`—` 与空项丢掉）。 */
export const headerMaterialsOf = (text: string): string[] => {
  const m = /^> 背景\/材料：(.*)$/m.exec(String(text || ""));
  if (!m) return [];
  return m[1]
    .split("、")
    .map((s) => s.trim())
    .filter((s) => s && s !== "—");
};

const headerFieldOf = (text: string, label: string): string | undefined => {
  const m = new RegExp(`^> ${label}：(.*)$`, "m").exec(String(text || ""));
  return m ? m[1].trim() : undefined;
};

/** 动作文本 ⇒ 来源（记忆文件里没写 fs/tool，只能按文本前缀**推断**；回收记录里标 `sourceInferred`）。 */
export const sourceOfActionText = (text: string): string => {
  if (text.startsWith("改/读 ")) return "fs";
  if (text.startsWith("调用 ")) return "tool";
  return "unknown";
};

export interface ReclaimedRecord {
  at: string;
  kind: string;
  comp: string;
  text: string;
  source: string;
  sourceInferred: boolean;
  agent?: string;
  project?: string;
  session?: string;
  materials: string[];
  from: string;
  reclaimed: true;
}

/**
 * 把一份**纯动作记忆文件**拆成审计记录（一行一条）。
 * `from` = 原始 rel（写进记录，删了文件也追得到来源）；`reclaimed: true` = 据实标注「这条是回收来的」。
 */
export const reclaimedRecordsOf = (text: string, rel: string): ReclaimedRecord[] => {
  const agent = headerFieldOf(text, "Agent");
  const project = headerFieldOf(text, "项目");
  const session = headerFieldOf(text, "来源会话");
  const materials = headerMaterialsOf(text);
  const out: ReclaimedRecord[] = [];
  for (const line of bodyLinesOf(text)) {
    const m = BODY_LINE_RE.exec(line);
    if (!m) continue;
    const [, at, comp, body] = m;
    const source = sourceOfActionText(body);
    out.push({
      at,
      kind: "action",
      comp,
      text: body,
      source,
      sourceInferred: source === "unknown" ? false : true,
      agent,
      project,
      session,
      materials,
      from: rel,
      reclaimed: true,
    });
  }
  return out;
};

/** 一条记录 → 原始正文行（用于「逐字不丢」的不变量断言）。 */
export const renderBodyLine = (r: { at: string; comp: string; text: string }): string => `- [${r.at}] [${r.comp}] ${r.text}`;

/**
 * 记忆文件的 rel —— **必须是它真实所在的位置**（`<根>/<目录>/<文件名>`）。
 *
 * ⚠ v1.21.0 一度把它改成恒返回 `.shadow/atoms/<name>`（忽略目录参数），而唯一调用方
 * `tools/granularity-reclaim.ts` 仍在扫**旧日期树** ⇒ 写进审计流的 `from` 变成假来源、
 * 幂等守卫永不命中、`_meta.json` 剪枝恒 0。本函数只回答「这个文件在哪」，**不要**让它承担
 * 「新布局在哪」这类判断（那属于调用方）。
 */
export const relOf = (shadowDirName: string, fileName: string): string => `.shadow/${shadowDirName}/${basename(fileName)}`;

/**
 * 线索头里**自报的日期**：`> 证据链：来源(…) · 日期(YYYY-MM-DD) · 证据(…)`。
 *
 * 用途：文件名不含日期时（如 consolidated 件 `ep-<id>-consolidated.md`）**不猜**、也不算「已判定」——
 * 而是读它自报的日期。缺 ⇒ `""`（调用方归入「未判定」）。
 */
export const declaredDateOf = (text: string): string =>
  (String(text || "").match(/·\s*日期\((\d{4}-\d{2}-\d{2})\)/) || ["", ""])[1] || "";
