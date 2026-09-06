export declare const isHypotheticalCondition: (c: string) => boolean;
export declare const isFactLike: (c: string) => boolean;
export declare const assertAssumption: (c: string) => {
    ok: boolean;
    reason?: string;
};
export declare const assertNotFactLike: (c: string) => {
    ok: boolean;
    reason?: string;
};
export declare const assertAssumptionAndNotFact: (c: string) => {
    ok: boolean;
    reason?: string;
};
