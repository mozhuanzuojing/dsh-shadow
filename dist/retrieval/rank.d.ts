export declare const scoreMemory: (text: string, rel: string, entry: string, tokens: string[]) => number;
export declare const DEPRIORITIZE_FACTOR = 0.4;
export declare const deprioritizeFactor: (rel: string, entry: string, patterns?: string[]) => number;
export declare const approxEntries: (query: string, entries: string[], k?: number) => string[];
export declare const breakdownOf: (text: string, rel: string, entry: string, tokens: string[], deprioritized?: boolean) => {
    entry: number;
    topic: number;
    path: number;
    body: number;
    deprioritized: boolean;
};
export interface ConfidenceDims {
    retrieval: number;
    evidence: number;
    experience: number;
    judgment: number;
    projection: number;
    overall: number;
}
export declare const confidenceOf: (hits: number, ageDays: number, status: string, opts?: {
    hasExperience?: boolean;
    hasDecision?: boolean;
}) => ConfidenceDims;
export declare const snippetFor: (text: string, tokens: string[]) => string;
export declare const memorySummary: (text: string) => string;
export declare const tierFor: (text: string) => "L0" | "L1" | "L2";
