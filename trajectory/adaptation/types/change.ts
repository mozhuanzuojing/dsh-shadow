// dsh-shadow —— adaptation/types/change.ts：AdaptationChange（不叫 LearningChange）。
// 行为策略变化（How I do），不是身份/目标/价值观变化；字段保持窄，validationRequired 恒 true。
export type AdaptationTarget = "method" | "strategy" | "execution_pattern";

export interface AdaptationChange {
  id: string;
  target: AdaptationTarget;
  before: string;
  after: string;
  basedOn: string[];          // ExperienceRef[]（lineage 214）
  sourceExperience: string;   // 来源是 Observation/Experience（209），非 Knowledge
  validationRequired: true;   // 恒 true
  // 明确禁止字段：goal / objective / value / preference / identity / belief / confidenceIncrease
}
