import type { DelegationContext } from "../types/context.js";
import type { AutonomyBoundaryEvent } from "../types/event.js";
export declare const writeDelegationContext: (fs: any, ws: string, ctx: DelegationContext) => Promise<void>;
export declare const readDelegationContext: (fs: any, ws: string, delegationId: string) => Promise<DelegationContext | null>;
export declare const writeDelegationEvent: (fs: any, ws: string, e: AutonomyBoundaryEvent) => Promise<void>;
