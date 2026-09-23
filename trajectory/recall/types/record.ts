// dsh-shadow —— recall/types/record.ts：ForgottenRecord（曾经存在，但当前不可直接访问）。
// 注意：没有 deleted / false / invalid——遗忘不是否定，只是访问状态变化。
export interface ForgottenRecord {
  id: string;
  originalRef: string;       // 原记录引用（Observation/Experience）
  forgottenAt: string;
  reason: string;
  lastAccessibleAt: string;
  validationRefs?: string[]; // 原验证链（遗忘不抹除，配 Invariant 204）
}
