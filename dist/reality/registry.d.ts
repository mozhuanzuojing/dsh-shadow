import type { RealityObservation } from "./types.js";
/**
 * 登记一条 RealityObservation。返回**本体 + 是否真的落盘**（v1.15.61）。
 * 旧版写失败只 `console.log` 就 `return ro` ⇒ 调用方随后照常渲染 `[Reality Observation] id …`，
 * **「没写下去」被渲染成「已登记」**（ADR-0049：缺件不静默）。
 */
export declare const registerObservation: (fs: any, ws: string, ro: RealityObservation) => Promise<{
    observation: RealityObservation;
    persisted: boolean;
}>;
/**
 * 读 RealityObservation，并**区分「还没有」与「读不出」**（v1.15.61）。
 *
 * 旧实现把整个循环包在一个 `try` 里、外层 `catch {}`：结果是
 *   ① 第 k 个文件解析失败 ⇒ **静默返回前 k-1 条**，后面的文件永不读；
 *   ② 目录读失败与目录为空**不可区分**；
 *   ③ 调用方无法区分「观测只有 2 条」与「10 条里 8 条坏了」——
 *      而下游 `claimOf` 的 `supported` 判据恰恰吃 `obs.length`（ADR-0049 的反面）。
 */
export declare const readObservationsDetailed: (fs: any, ws: string, subjectRef?: string) => Promise<{
    observations: RealityObservation[];
    corrupt: number;
}>;
export declare const readObservations: (fs: any, ws: string, subjectRef?: string) => Promise<RealityObservation[]>;
