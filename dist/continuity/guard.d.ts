import type { ObserverConfig, RecallIndex } from "./types.js";
export declare const observerLayerClean: (obj: any) => boolean;
export declare const assertObserverLayerClean: (obj: any) => {
    ok: boolean;
    reason: string;
};
export declare const argsHasForbiddenContent: (args: any) => boolean;
export declare const observerLayerNoWorkspaceFact: (obj: any) => boolean;
export declare const assertObserverLayerNoWorkspaceFact: (obj: any) => {
    ok: boolean;
    reason: string;
};
export declare const configNotPreference: (c: ObserverConfig) => boolean;
export declare const assertConfigNotPreference: (c: ObserverConfig) => {
    ok: boolean;
    reason: string;
};
export declare const recallIndexIsNav: (ri: RecallIndex | any) => any;
export declare const assertRecallIndexNav: (ri: any) => {
    ok: any;
    reason: string;
};
export declare const workspaceIsolated: (r: {
    workspace?: string;
}) => boolean;
export declare const assertWorkspaceIsolated: (r: any) => {
    ok: boolean;
    reason: string;
};
