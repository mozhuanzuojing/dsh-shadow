// dsh-shadow —— recall/types/validation.ts：RecallValidation（Recall ≠ 重新证明）。
// Recall → existing lineage → 原 RealityClaim；绝不 Recall → 新 RealityClaim / 新 hypothesis。
export interface RecallValidation {
  recalledRef: string;
  sourceRef: string;
  mapsExistingLineage: boolean;
  createsNewClaim: boolean;        // 必须 false（Recall 不产生新 RealityClaim）
  epistemicStatusUnchanged: boolean; // 必须是 true（Recall 不提升证据等级，Invariant 205）
}
