import type { RealityClaim } from "../types.js";
/** 写一条 RealityClaim。返回**是否真的落盘**（v1.15.61，旧版只 log 就返回 void）。 */
export declare const writeClaim: (fs: any, ws: string, c: RealityClaim) => Promise<boolean>;
/**
 * 读 RealityClaim，并**区分「还没有」与「读不出」**（v1.15.61）。
 *
 * 旧实现的整个循环在一个 `try` 里 ⇒ 第 k 个文件坏就**静默返回前 k-1 条**（后续永不读）。
 * 这在本文件尤其危险：`mode:"world"` 会把**由残缺 claims 建出的图写回** `graph.json`，
 * 于是一份坏 claim 能让落盘图被更小的图**覆盖**（不可逆）。故单条坏件只丢这一条并**计数**。
 */
export declare const readClaimsDetailed: (fs: any, ws: string) => Promise<{
    claims: RealityClaim[];
    corrupt: number;
}>;
export declare const readClaims: (fs: any, ws: string) => Promise<RealityClaim[]>;
