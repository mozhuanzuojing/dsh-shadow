// dsh-shadow —— long-horizon/types/history-window.ts：HistorySummary（压缩摘要，访问辅助，非事实源）。
// 无 reality 字段；摘要≠事实（History Compression ≠ Reality Simplification）。
export interface HistorySummary {
  id: string;
  sourceRefs: string[];              // ObservationRef[]
  compressionMethod: string;
  accessibility: "available" | "forgotten" | "recalled";
}
