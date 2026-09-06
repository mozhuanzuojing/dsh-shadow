export declare const resultNoEpistemicIncrease: (r: string) => boolean;
export declare const assertResultNoEpistemicIncrease: (r: string) => {
    ok: boolean;
    reason: string;
};
export declare const resultNotKnowledge: (r: string) => boolean;
export declare const validationNoCorrectness: (v: {
    changeObserved?: boolean;
    validationReferences?: string[];
    sideEffectsObserved?: string[];
}) => boolean;
export declare const assertValidationNoCorrectness: (v: any) => {
    ok: boolean;
    reason: string;
};
