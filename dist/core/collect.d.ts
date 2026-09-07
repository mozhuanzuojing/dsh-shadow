export declare const extractMessage: (event: any) => {
    kind: string;
    text: any;
};
export declare const goalText: (change: any) => string;
export type DecisionKind = "selection" | "scope" | "anchor" | "";
export declare const decisionClass: (text: unknown) => DecisionKind;
export declare const classifyUser: (text: unknown) => "" | "confirmation" | "decision" | "reminder";
export declare const extractDecisionStatement: (text: unknown) => string[];
export declare const extractReason: (text: unknown) => string;
