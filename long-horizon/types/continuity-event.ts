// dsh-shadow —— long-horizon/types/continuity-event.ts：HistoryContinuityEvent + InteractionAdaptationLink。
// 前者记 previous state / current accessibility / lineage（非 self-evolution event）；后者连 History→Recall→Adaptation（禁 History→Identity）。
export interface HistoryContinuityEvent {
  id: string;
  previousAccessibility: string;
  currentAccessibility: string;
  lineage: { historyRef: string; recallRef?: string; adaptationRef?: string };
}

export interface InteractionAdaptationLink {
  historyRef: string;
  recallRef: string;
  adaptationRef: string;
  // 禁 identityRef（History→Identity 禁）
}
