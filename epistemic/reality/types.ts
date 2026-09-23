// dsh-shadow —— reality/types.ts：v0.30 Reality Model Kernel 类型。
// Reality Model != 世界知识库；是 Observer 群体基于共享证据+验证历史+时间上下文的稳定现实描述层。
// 冻结：无 truth/certainty/fact、无 true/false；RealityClaim 必须保留 lineage（否则就是新 Knowledge）。
export interface RealityObservation {
  id: string;
  observedAt: string;
  subjectRef?: string;
  sourcePerspectives: string[];
  observation: string;            // 弱事实："多个 Observer 指向同一被观察事件"
  temporalContext: string;
  validationRefs: string[];
}

export type RealityClaimStatus = "candidate" | "supported" | "unstable" | "rejected";
export interface RealityConfidence { evidenceStrength: number; repetition: number; temporalConsistency: number; alternativeSurvival: number; }

export interface RealityClaim {
  id: string;
  subjectRef?: string;            // 原始 observation 的 subjectRef（用于 query）
  subject: string;
  predicate: string;
  object: string;
  supportingObservations: string[];
  validationHistory: string[];
  perspectiveRefs: string[];
  temporalContext: string;
  confidence: RealityConfidence;
  status: RealityClaimStatus;
  lineage: { observations: string[]; validations: string[]; perspectives: string[] };  // 必答"为什么系统认为它存在"
}

export interface ObservedEntityCandidate {
  entity: string;
  observation: { exposedApi?: boolean; version?: string; changedVersions?: string[] };  // 只观察属性，不写评估（reliable/should）
}

// 生命周期：candidate → supported → unstable → rejected；**永不 truth**。
export const parseTriple = (text: string): { subject: string; predicate: string; object: string } => {
  // "subject predicate object" 或 "subject 是 predicate" 的极简三元组
  const t = String(text || "").trim();
  const m = t.match(/^(.+?)\s+(是|has|is|为|出现|暴露|具有)\s+(.+)$/);
  if (m) return { subject: m[1], predicate: m[2], object: m[3] };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return { subject: parts[0], predicate: parts[1], object: parts.slice(2).join(" ") };
  return { subject: t, predicate: "observed", object: t };
};
