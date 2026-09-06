import type { Identity, Intent } from "../core/types.js";
export declare const projectContext: (fs: any, ws: string, memories: any[], task: string, soul: any, verifyEvidence: any, lens?: {
    preferred?: string[];
    avoided?: string[];
}, identity?: Identity | null, intent?: Intent | null) => Promise<{
    rel: any[];
    experiences: any[];
    principles: any;
    taste: any;
    unc: string[];
    excl: string[];
    visible: any[];
    hidden: string[];
    distortion: {
        reason: string;
        byIntent: string;
    };
    excludedReason: Record<string, string>;
    reality: {
        total: number;
        task: string;
    };
}>;
export declare const renderProjection: (p: any, task: string, project: string, ctx?: any) => string;
