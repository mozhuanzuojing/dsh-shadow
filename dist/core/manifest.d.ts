import type { ShadowNode } from "./node.js";
export interface ShadowManifest {
    version: string;
    builtAt: string;
    nodeCount: number;
    sourceCount: number;
    failures: {
        path: string;
        reason: string;
    }[];
}
export declare const manifestRel: () => string;
export declare const buildManifest: (version: string, nodes: ShadowNode[], failures?: {
    path: string;
    reason: string;
}[]) => ShadowManifest;
export declare const writeManifest: (fs: any, ws: string, m: ShadowManifest) => Promise<void>;
export declare const readManifest: (fs: any, ws: string) => Promise<ShadowManifest | null>;
/** 诊断渲染：版本/节点数/来源数/失败项/健康判断。 */
export declare const renderManifest: (m: ShadowManifest | null) => string;
