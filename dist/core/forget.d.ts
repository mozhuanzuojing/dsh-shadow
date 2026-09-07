export interface ForgetCfg {
    enabled?: boolean;
    staleDays?: number;
    minHits?: number;
    maxActive?: number;
}
export declare const isForgettable: (rel: string, meta: any, cfg?: ForgetCfg) => boolean;
export declare const oldestBeyond: (records: {
    rel: string;
    date: string;
    time: string;
}[], maxActive: number) => string[];
