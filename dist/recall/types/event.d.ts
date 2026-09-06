export interface RecallEvent {
    id: string;
    recalledRef: string;
    trigger: {
        type: string;
        sourceRef: string;
    };
    accessibilityBefore: "accessible" | "forgotten" | "latent";
    accessibilityAfter: "accessible" | "recalled";
    lineage: {
        originalRecord: string;
        observationRefs: string[];
        validationRefs: string[];
    };
}
