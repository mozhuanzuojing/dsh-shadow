import type { ActionCandidate, ActionExecution, ActionFeedback } from "./types.js";
export declare const candidateIsClean: (c: ActionCandidate) => boolean;
export declare const assertCandidateClean: (c: ActionCandidate) => {
    ok: boolean;
    reason: string;
};
export declare const executionIsEvent: (e: ActionExecution) => boolean;
export declare const assertExecutionEvent: (e: ActionExecution) => {
    ok: boolean;
    reason: string;
};
export declare const feedbackIsNeutral: (f: ActionFeedback) => boolean;
export declare const renderCandidate: (c: ActionCandidate) => string;
export declare const renderExecution: (e: ActionExecution) => string;
export declare const renderFeedback: (f: ActionFeedback) => string;
