export interface HistoryContinuityEvent {
    id: string;
    previousAccessibility: string;
    currentAccessibility: string;
    lineage: {
        historyRef: string;
        recallRef?: string;
        adaptationRef?: string;
    };
}
export interface InteractionAdaptationLink {
    historyRef: string;
    recallRef: string;
    adaptationRef: string;
}
