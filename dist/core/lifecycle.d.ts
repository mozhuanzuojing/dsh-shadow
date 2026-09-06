export declare const sigmoid: (x: number) => number;
export declare const hotnessOf: (hits: number, ageDays: number, halfLife: number) => number;
export declare const lifecycleOf: (rec: any, ageDays: number, conflictCount: number, stale: boolean) => "ARCHIVED" | "DECAYING" | "NEW" | "OBSERVED" | "STALE" | "SUPERSEDED" | "TRUSTED" | "VERIFIED";
