import type { DelegationContext, AutonomyBoundaryEvent } from "../types/index.js";
export declare const buildDelegationContext: (args: any) => {
    ok: boolean;
    reason?: string;
    ctx?: DelegationContext;
};
export declare const checkDelegation: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    notFound?: boolean;
    reason?: string;
    result?: any;
}>;
export declare const recordDelegationEvent: (fs: any, ws: string, args: any) => Promise<{
    ok: boolean;
    reason?: string;
    ev?: AutonomyBoundaryEvent;
}>;
