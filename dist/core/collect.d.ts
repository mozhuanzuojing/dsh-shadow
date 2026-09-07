export declare const extractMessage: (event: any) => {
    kind: string;
    text: any;
};
export declare const goalText: (change: any) => string;
export declare const classifyUser: (text: unknown) => "" | "confirmation" | "decision" | "reminder";
export declare const extractDecisionStatement: (text: unknown) => string[];
export declare const extractReason: (text: unknown) => string;
