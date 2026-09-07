export interface InvariantCheck {
    invariantId: number;
    boundary: string;
    status: "satisfied" | "violated";
    evidenceRefs: string[];
}
export interface VerificationRun {
    runId: string;
    runtimeVersion: string;
    invariantRange: string;
    observerRef: string;
    startedAt: string;
    completedAt: string;
    checks: InvariantCheck[];
}
export interface DriftReport {
    observedBoundaries: {
        boundary: string;
        drift: boolean;
        evidence: string[];
    }[];
}
