/**
 * v2 lab — 51 mode 的注册表、写面与分组。
 *
 * 算法层是从 v1 逐文件移植的 `vendor/`（保留原契约）；这里只做 v2 的入口与写权限闸。
 * 输入字段不再有「v1 字段并集白名单」：逐 mode 的允许字段/必填/类型/枚举在 `schema.ts`（LAB_MODE_SCHEMAS），
 * 由 builder 的实际读取点推导 —— 并集白名单既不知道某 mode 读什么，也会把 builder 直读但 v1 未声明的字段判成非法。
 */

import { LAB_MODES, nearestModes } from "../contract/modes.js";

export type LabMode = (typeof LAB_MODES)[number];

export const LAB_MODE_SET: ReadonlySet<string> = new Set(LAB_MODES);

/** 写型 mode（31）：缺 `write:true` 一律拒绝；只读 mode 收到 write:true 也拒绝。 */
export const LAB_WRITE_MODES: ReadonlySet<string> = new Set([
  // observer continuity / verification (6)
  "observer-config", "observer-boundary", "recall-index", "observer-lineage", "workspace-record", "verification",
  // observer kernel (4)
  "reflection", "identity-advance", "temporal", "offline",
  // validation (2) + federation (1)
  "evidence", "validate", "real-evidence",
  // reality model (2) + world (1)
  "model-observation", "model-claim", "world",
  // simulation/action (2)
  "execute", "feedback",
  // agency (2) / delegation (2)
  "agency-context", "agency-event", "delegation-context", "delegation-event",
  // recall continuity (2)
  "recall-forget", "recall-event",
  // adaptation (3)
  "adapt-context", "adapt-change", "adapt-validation",
  // horizon (4)
  "horizon-context", "horizon-summary", "horizon-event", "horizon-link",
]);

export const LAB_GROUPS: ReadonlyArray<{ name: string; modes: readonly string[] }> = [
  { name: "Observer 内核", modes: ["observer-context", "observer-config", "observer-boundary", "observer-lineage", "continuity-index"] },
  { name: "Reflection / Identity / Temporal", modes: ["reflection", "identity-advance", "temporal", "timeline", "offline"] },
  { name: "Hypothesis / Validation / Evidence", modes: ["evidence", "validate", "verification", "real-evidence", "real-refer", "stability"] },
  { name: "Federation / World / Model", modes: ["federation", "federation-perspective", "federation-diff", "distortion", "world", "world-represent", "world-relation", "model", "model-observation", "model-claim"] },
  { name: "Simulation / Action / Agency", modes: ["simulate", "candidate", "execute", "feedback", "plan", "agency-context", "agency-select", "agency-event"] },
  { name: "Adaptation / Delegation / Horizon", modes: ["adapt-context", "adapt-change", "adapt-validation", "delegation-context", "delegation-check", "delegation-event", "horizon-context", "horizon-summary", "horizon-event", "horizon-link"] },
  { name: "Recall 生命周期", modes: ["recall-forget", "recall-event", "recall-index", "recall-validation"] },
  { name: "Workspace", modes: ["workspace-context", "workspace-record"] },
  { name: "核心派生 / 诊断", modes: ["index"] },
];

export const isLabWriteMode = (m: string): boolean => LAB_WRITE_MODES.has(m);

export const unknownLabMode = (raw: string): string =>
  `未知 lab mode:"${raw}"；最近邻：${nearestModes(raw).join(" / ")}。共 51 个，见 shadow_lab 描述或 docs/v2/LAB.md。`;
