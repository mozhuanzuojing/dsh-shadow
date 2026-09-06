// dsh-shadow —— adaptation/types/context.ts：AdaptationContext（为什么允许调整）。
// 必须回答"调整依据是什么"；来源是 Experience + Validation，非 Knowledge/Truth。
export interface AdaptationContext {
  sourceExperience: string;
  validationRefs: string[];
  adaptationScope: string;   // method / strategy / execution_pattern（212）
  createdAt: string;
}
