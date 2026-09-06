// dsh-shadow —— long-horizon/types/interaction.ts：InteractionContext（当前长期交互基于什么历史）。
// 只答 "what happened before"，不答 "who I became"；禁 history_count/experience_count/interaction_duration 影响 identity。
export interface InteractionContext {
  id: string;
  basedOnHistory: string[];      // HistoryRef（"what happened before"）
  window: { from: string; to: string };
  recallRefs: string[];
  adaptationRefs: string[];
  createdAt: string;
}
