import type { PlanCandidate, PlanEvaluation, PlanningObjective } from "./types.js";
export declare const objectiveIsExternal: (o: PlanningObjective | null | undefined) => boolean;
export declare const assertObjectiveExternal: (o: PlanningObjective | null | undefined) => {
    ok: boolean;
    reason: string;
};
export declare const candidateHasNoScore: (c: PlanCandidate) => boolean;
export declare const assertCandidateNoScore: (c: PlanCandidate) => {
    ok: boolean;
    reason: string;
};
export declare const evaluationIsComparison: (e: PlanEvaluation) => boolean;
export declare const assertEvaluationComparison: (e: PlanEvaluation) => {
    ok: boolean;
    reason: string;
};
export declare const criteriaNotValue: (c: string) => boolean;
export declare const assertCriteriaNotValue: (c: string) => {
    ok: boolean;
    reason: string;
};
