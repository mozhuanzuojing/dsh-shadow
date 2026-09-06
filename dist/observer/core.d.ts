import type { Identity, ObserverContext, ObserverState } from "../core/types.js";
export declare const observerContextOf: (args: any, topic: string, identity: Identity | null, agentId?: string, state?: ObserverState) => ObserverContext;
export declare const renderObserverContext: (o: ObserverContext) => string;
