import type { DelegationContext, AutonomyBoundaryEvent } from "../types/index.js";
export interface DelegationCheckResult {
    delegationId: string;
    action: string;
    allowed: boolean;
    scopeCheck: {
        inScope: boolean;
        scope: string[];
        action: string;
    };
    constraintCheck: {
        passed: string[];
        violated: string[];
    };
    boundaryTriggered: boolean;
    reason?: string;
}
export declare const renderContext: (ctx: DelegationContext) => string;
export declare const renderCheck: (c: DelegationCheckResult) => string;
export declare const renderEvent: (e: AutonomyBoundaryEvent) => string;
