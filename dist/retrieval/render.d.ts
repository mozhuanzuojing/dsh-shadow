export declare const approxNote: (approx?: string[], label?: string) => string;
export declare const NO_MATCH_STEPS = "> \u4E0B\u4E00\u6B65\uFF1A\u2460 \u6362\u66F4\u77ED/\u540C\u4E49\u7684\u8BCD\u518D\u67E5\uFF08\u53EA\u7559\u7EC4\u4EF6\u540D\u3001\u6587\u4EF6\u540D\u7247\u6BB5\uFF09\uFF1B\u2461 `read_shadow()` \u65E0\u53C2\u770B `.shadow/_index.md` \u7684\u4E3B\u9898\u7D22\u5F15\u4E0E\u8FD1\u671F\u8BB0\u5FC6\uFF1B\u2462 \u8DE8\u300C\u51B3\u7B56/\u4EE3\u7801/\u6587\u6863\u300D\u627E\u4E0A\u4E0B\u6587\u7528 `shadow_query`\uFF1B\u2463 \u6309\u4EFB\u52A1\u6062\u590D\u7528 `recall_shadow`\u3002";
export declare const noMatchText: (topic: string, warn: string, opts?: {
    approx?: string[];
    reason?: string;
    steps?: string;
    approxLabel?: string;
}) => string;
export declare const truncationNote: (o: {
    matched: number;
    returned: number;
    limit: number;
    maxChars: number;
    droppedByLimit: number;
    droppedByBudget: number;
    droppedByCooldown: number;
    dropped: {
        entry: string;
        score: number;
    }[];
}) => string;
export declare const renderByTier: (s: any, budgetChars: number, forceL0?: boolean, tokens?: string[]) => string;
