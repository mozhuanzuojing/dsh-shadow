// dsh-shadow —— identity/types.ts：v0.25 Identity Continuity 领域类型。
// Identity 不是"总结出来的人格"，而是 Observer 在时间轴上的稳定约束；变的是"当前时间切片的自我认识"，不是灵魂。
// Identity ≠ Assertion：confidence 用多维（frequency/recency/consistency/contradiction/overall），保可解释。
import type { ReflectionLearningType } from "../reflection/types.js";

export interface IdentityCore { observerId: string; values: string[]; }
export interface IdentityLearned { text: string; confidence: number; source: string; }
export interface IdentityCurrentModel { decisionStyle: string[]; antiPatterns: string[]; }

export interface IdentityModel {
  version: string;       // "v1", "v2", ...
  at: string;            // 该切片产生日期
  core: IdentityCore;    // 永久锚（curated，不可因反例改变）
  learned: IdentityLearned[];
  currentModel: IdentityCurrentModel;
}

export type IdentityChangeType = "add_principle" | "remove_principle" | "change_decision_style" | "add_boundary";
export interface CandidateProposal { type: IdentityChangeType; content: string; }
// 禁止：proposal 里出现 personality/人格结论（"用户喜欢复杂架构"）——那是"观察语言→猜人格"。
// 允许：重复行为 → 决策规律 → 原则（"在大型系统设计前优先建立验证闭环"）。

export interface IdentityConfidence {
  frequency: number;
  recency: number;
  consistency: number;
  contradiction: number;
  overall: number;
}

export type CandidateIdentityStatus = "candidate" | "accepted" | "rejected";
export interface CandidateIdentityChange {
  id: string;
  observerId: string;
  fromVersion: string;
  proposal: CandidateProposal;
  evidence: { reflections: string[]; traceCount: number };
  confidence: IdentityConfidence;
  status: CandidateIdentityStatus;
  createdAt: string;
}

export type EvaluatorStatus = "accepted" | "candidate" | "rejected";
export interface IdentityChangeDecision { status: EvaluatorStatus; reasons: string[]; chosen: CandidateIdentityChange | null; }

export const proposalTypeOfLearning = (type: ReflectionLearningType): IdentityChangeType | null =>
  type === "principle" ? "add_principle" : type === "anti_pattern" ? "add_boundary" : null;
