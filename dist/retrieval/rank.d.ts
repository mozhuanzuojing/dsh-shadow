export declare const scoreMemory: (text: string, rel: string, entry: string, tokens: string[]) => number;
export declare const breakdownOf: (text: string, rel: string, entry: string, tokens: string[]) => {
    entry: number;
    topic: number;
    path: number;
    body: number;
};
export declare const confidenceOf: (hits: number, ageDays: number, status: string) => number;
export declare const snippetFor: (text: string, tokens: string[]) => string;
export declare const memorySummary: (text: string) => string;
export declare const tierFor: (text: string) => "L0" | "L1" | "L2";
