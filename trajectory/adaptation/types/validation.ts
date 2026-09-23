// dsh-shadow —— adaptation/types/validation.ts：AdaptationValidation（弱语义）。
// 记录 change happened + 现实反馈；不是 change was correct（Correct 进入价值判断）。
export interface AdaptationValidation {
  changeObserved: boolean;
  validationReferences: string[];
  sideEffectsObserved: string[];
  // 禁止 changeWasCorrect / correct（正确性判断）
}
