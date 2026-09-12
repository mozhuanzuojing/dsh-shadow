import type { ValidationOutcome } from "./types.js";
export interface ValidationEvent {
    time: string;
    evidenceIds: string[];
    result: ValidationOutcome;
    alternativeWinner: string | null;
    perceptionDelta: string;
}
export interface ValidationTimeline {
    hypothesisId: string;
    events: ValidationEvent[];
}
export declare const appendValidationEvent: (fs: any, ws: string, hypothesisId: string, event: Omit<ValidationEvent, "time"> & {
    time?: string;
}) => Promise<ValidationTimeline>;
/**
 * 读时间线，并**区分「还没有」与「读不出」**（本仓纪律 ADR-0049：缺件不静默）。
 *
 * `corrupt: true` ⇒ 文件**存在但不可用**（读失败 / 不是 JSON / 形状不对）。
 * 调用方**不得**把坏件当成空历史去写 —— 那就是用「一条新事件」覆盖掉整段历史。
 */
export declare const readTimelineDetailed: (fs: any, ws: string, hypothesisId: string) => Promise<{
    timeline: ValidationTimeline;
    corrupt: boolean;
}>;
export declare const readTimeline: (fs: any, ws: string, hypothesisId: string) => Promise<ValidationTimeline>;
export declare const renderTimeline: (tl: ValidationTimeline) => string;
