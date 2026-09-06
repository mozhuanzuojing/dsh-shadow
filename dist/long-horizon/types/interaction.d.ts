export interface InteractionContext {
    id: string;
    basedOnHistory: string[];
    window: {
        from: string;
        to: string;
    };
    recallRefs: string[];
    adaptationRefs: string[];
    createdAt: string;
}
