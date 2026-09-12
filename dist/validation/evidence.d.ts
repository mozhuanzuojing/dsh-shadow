import type { FutureEvidence } from "./types.js";
import type { Hypothesis } from "../dream/types.js";
/**
 * 写一条 hypothesis。**返回是否真的落盘**（v1.15.55）。
 *
 * 旧版只 `console.log` 就返回 ⇒ 调用方随后照样播报「生成了 N 条假设」，
 * 而磁盘上可能 0 条；之后 `mode:validate` 会回「无 hypothesis」，
 * 使用者看到的是「假设消失了」而不是「当时就没写下去」。
 */
export declare const writeHypothesis: (fs: any, ws: string, h: Hypothesis) => Promise<boolean>;
export declare const readHypothesis: (fs: any, ws: string, id: string) => Promise<Hypothesis | null>;
/**
 * 登记一条 FutureEvidence。返回**证据本体 + 是否真的落盘**（v1.15.55）。
 *
 * 旧版落盘失败也返回 `full` ⇒ 调用方播报 `[Evidence] registered <id>` 当成功，
 * 之后 `mode:validate` 读不到它 ⇒ `applied` 变小、结论从 validated 掉回 observed/rejected，
 * 而且**没有任何地方说明为什么**。
 */
export declare const registerFutureEvidence: (fs: any, ws: string, ev: {
    hypothesisId: string;
    observedAt: string;
    actualOutcome: string;
    observationType: string;
    sourceTraceIds?: string[];
    createdAt?: string;
    id?: string;
}) => Promise<{
    evidence: FutureEvidence;
    persisted: boolean;
}>;
export declare const readFutureEvidence: (fs: any, ws: string, hypothesisId?: string) => Promise<FutureEvidence[]>;
