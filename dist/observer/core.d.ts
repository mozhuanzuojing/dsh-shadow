import type { Identity, ObserverContext } from "../core/types.js";
export declare const observerContextOf: (args: any, topic: string, identity: Identity | null, agentId?: string) => ObserverContext;
export declare const renderObserverContext: (o: ObserverContext) => string;
