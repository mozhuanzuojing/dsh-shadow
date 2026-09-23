// dsh-shadow —— recall/types/event.ts：RecallEvent（一次忆起）。
// Recall = Access Transition（恢复访问路径），不是 Reality Reconstruction。sourceRef 必须存在（为什么想起来）。
export interface RecallEvent {
  id: string;
  recalledRef: string;                          // 忆起的原记录（须指向已遗忘的 ForgottenRecord）
  trigger: { type: string; sourceRef: string }; // sourceRef 必须存在；type 须外部线索（external cue/conversation/explicit/association）
  accessibilityBefore: "accessible" | "forgotten" | "latent";
  accessibilityAfter: "accessible" | "recalled";
  lineage: { originalRecord: string; observationRefs: string[]; validationRefs: string[] };
}
