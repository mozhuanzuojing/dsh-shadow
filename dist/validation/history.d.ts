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
export declare const readTimeline: (fs: any, ws: string, hypothesisId: string) => Promise<ValidationTimeline>;
export declare const renderTimeline: (tl: ValidationTimeline) => string;
