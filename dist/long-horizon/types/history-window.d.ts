export interface HistorySummary {
    id: string;
    sourceRefs: string[];
    compressionMethod: string;
    accessibility: "available" | "forgotten" | "recalled";
}
