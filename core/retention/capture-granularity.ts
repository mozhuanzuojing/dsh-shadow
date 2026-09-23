// dsh-shadow —— core/retention/capture-granularity.ts：**记录粒度判据**（v1.19.0 / `adr/0097`）。
//
// ## 问题（实测，见 `adr/0097` §1）
//
// 本仓原先的逻辑是「一批 `pending` → 一个记忆文件」，而捕获取的是**观测层最小粒度**：
// 每次 fs/tool 动作都 `push` 一条 `action`（`core/writer/capture.ts:74,83`）⇒
// 实测 14,342 个记忆文件里 **93.1% 是「0 用户消息 且 0 决策」的纯动作回声**，
// 中位 **439 B**（65.2% < 512 B），而其中 **62.5% 的行是逐条重复的溯源样板**。
//
// ## 判据（`adr/0097` D1）——「**只有 action**」才降级
//
// 一批里**全是 `action`** ⇒ 审计流；**出现任何别的 kind**（`user` / `decision` / `assistant`（思维落点）/
// **以及将来新增的未知 kind**）⇒ 记忆文件。
//
// 为什么判据是「全是 action」而不是「含 user/decision/assistant」：**前者对未知 kind 是保守的** ——
// 将来加一种记录类型时，含它的批会自动留在记忆层，而不是被静默降级进审计流（宁可多留一条记忆，
// 不可误降级丢线索）。空批也落 `audit`（`every` 对空数组为真）——它无可记录正文，不该产生记忆文件。
//
// ## 为什么不需要新增字段就能复核（门用它）
//
// `core/retention/memory.ts:60` 的 `> 证据链：来源(动作·用户·agent·决策)` 已经把「这批里有什么」编码进去了 ——
// 「`来源(动作)` 孤零零一个」就是纯动作回声的充要标记（`tools/granularity-audit.ts`）。
//
// ## 比较点不写字面量
//
// 本仓 `audit:ratchet` 的 `b_keys` 把「比较点里的新字符串字面量」算成新线索（`v1.18.4` 已因此返工一次）
// ⇒ 这里一律用私有常量比较。
import { SHADOW_ROOT } from "../paths.js";
import { sanitizeText, isUnsafe } from "../../security/scrub.js";
import type { Trace } from "../types.js";

/** 唯一的「动作」kind（比较点里不写字面量，见文件头）。 */
const ACTION_KIND = "action";
/** 配置里唯一表示「保留旧行为」的值。 */
const ECHO_MEMORY = "memory";

/**
 * 一批记录是否**只有动作**（= 该落审计流）。
 *
 * ⚠ 改这个判据 = 改「什么算一条记忆」的**产品口径**，不是改实现细节
 * ⇒ 必须同步改 `adr/0097` D1 与粒度门。
 */
export const isAuditBatch = (arr: any[]): boolean => (arr || []).every((e) => String(e?.kind || "") === ACTION_KIND);

/** 配置约定的落点是不是审计流（`adr/0097` D5）：**默认是**；显式 `"memory"` 才回到旧行为。 */
export const echoToAudit = (cfg: any): boolean => cfg?.capture?.echo !== ECHO_MEMORY;

/**
 * 审计流落点：`.shadow/audit/<date>.jsonl`。
 * 它属**系统派生记录**层（同 `.shadow/query-log/`、`shadow-index/`）⇒
 * `persistence/files.ts:50` 只枚举 `^\d{4}-\d{2}-\d{2}$` 的目录，**整个 `audit/` 不会被当成记忆**。
 */
export const auditStreamRel = (date: string): string => `${SHADOW_ROOT}/audit/${date}.jsonl`;

/**
 * 事件 → 可落盘的正文行。
 * **记忆正文与审计流共用这一份归一化**（同 `sanitizeText`、同 `isUnsafe` 判据）——
 * 否则两条路径会各自演化出不同的「什么算一行安全正文」。
 */
export const bodyLinesOf = (traces: Trace[], entry: string): string[] =>
  (traces || []).map((t) => `- [${t.at}] [${t.comp || entry}] ${sanitizeText(t.text)}`).filter((l) => !isUnsafe(l));

/** 审计流的一行（对象形态）：字段 = 原本会进记忆正文的那些 ⇒ **一字不丢**，只是不再各占一个 inode/样板头。 */
const auditRecordOf = (t: Trace, ctx: { agent?: string; project?: string }): Record<string, unknown> => ({
  at: t.at,
  kind: t.kind,
  comp: t.comp,
  text: sanitizeText(t.text),
  source: t.source,
  sub: t.sub,
  agent: ctx.agent,
  project: ctx.project,
});

/** 审计流正文行：一行一条 JSON；不安全行按**同一判据**（`isUnsafe`）丢弃。 */
export const auditLinesOf = (traces: Trace[], ctx: { agent?: string; project?: string }): string[] =>
  (traces || []).map((t) => JSON.stringify(auditRecordOf(t, ctx))).filter((line) => !isUnsafe(line));

/**
 * 从一条 action 的文本里取**材料路径**（`改/读 <path>` → `<path>`）。
 * **判据收一处**：`core/retention/memory.ts` 的「背景/材料」抽取与审计流的材料折叠都走这里，
 * 否则「哪种 action 算材料」会在两处各写一遍。
 */
export const materialOfAction = (text: unknown): string | undefined => {
  const t = String(text || "");
  return /^改\/读 /.test(t) ? t.replace(/^改\/读 /, "").trim() : undefined;
};

/** 一批 action 里的全部材料（去空；去重交给调用方，见 `core/retention/memory.ts` 的 `addMat`）。 */
export const actionMaterials = (arr: any[]): string[] =>
  (arr || [])
    .filter((e) => String(e?.kind || "") === ACTION_KIND)
    .map((e) => materialOfAction(e.text))
    .filter((m): m is string => !!m);
