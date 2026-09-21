import type { Trace } from "./types.js";
/**
 * 一批记录是否**只有动作**（= 该落审计流）。
 *
 * ⚠ 改这个判据 = 改「什么算一条记忆」的**产品口径**，不是改实现细节
 * ⇒ 必须同步改 `adr/0097` D1 与粒度门。
 */
export declare const isAuditBatch: (arr: any[]) => boolean;
/** 配置约定的落点是不是审计流（`adr/0097` D5）：**默认是**；显式 `"memory"` 才回到旧行为。 */
export declare const echoToAudit: (cfg: any) => boolean;
/**
 * 审计流落点：`.shadow/audit/<date>.jsonl`。
 * 它属**系统派生记录**层（同 `.shadow/query-log/`、`shadow-index/`）⇒
 * `persistence/files.ts:50` 只枚举 `^\d{4}-\d{2}-\d{2}$` 的目录，**整个 `audit/` 不会被当成记忆**。
 */
export declare const auditStreamRel: (date: string) => string;
/**
 * 事件 → 可落盘的正文行。
 * **记忆正文与审计流共用这一份归一化**（同 `sanitizeText`、同 `isUnsafe` 判据）——
 * 否则两条路径会各自演化出不同的「什么算一行安全正文」。
 */
export declare const bodyLinesOf: (traces: Trace[], entry: string) => string[];
/** 审计流正文行：一行一条 JSON；不安全行按**同一判据**（`isUnsafe`）丢弃。 */
export declare const auditLinesOf: (traces: Trace[], ctx: {
    agent?: string;
    project?: string;
}) => string[];
/**
 * 从一条 action 的文本里取**材料路径**（`改/读 <path>` → `<path>`）。
 * **判据收一处**：`core/memory.ts` 的「背景/材料」抽取与审计流的材料折叠都走这里，
 * 否则「哪种 action 算材料」会在两处各写一遍。
 */
export declare const materialOfAction: (text: unknown) => string | undefined;
/** 一批 action 里的全部材料（去空；去重交给调用方，见 `core/memory.ts` 的 `addMat`）。 */
export declare const actionMaterials: (arr: any[]) => string[];
