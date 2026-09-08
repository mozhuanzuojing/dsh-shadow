import type { ParsedMemory } from "./episode.js";
import type { AtomKind, CreatedBy } from "./lineage.js";
export type NodeType = "memory" | "code" | "document" | "decision" | "concept";
export interface ShadowRel {
    type: string;
    target: string;
    source: string;
}
export interface ShadowNode {
    id: string;
    type: NodeType;
    source: string;
    title: string;
    content: string[];
    evidence: string[];
    relations: ShadowRel[];
    kind?: AtomKind;
    createdBy?: CreatedBy;
}
export declare const nodeTypeOf: (p: ParsedMemory) => NodeType;
export declare const deriveShadowNodes: (parsed: ParsedMemory[]) => ShadowNode[];
export declare const matchShadowNodes: (nodes: ShadowNode[], query: string, scope: NodeType[]) => ShadowNode[];
export interface QueryContextItem {
    type: NodeType;
    title: string;
    content: string[];
    evidence: string[];
    source: string;
}
export declare const queryShadow: (nodes: ShadowNode[], query: string, scope: NodeType[], limit?: number) => QueryContextItem[];
export declare const renderContext: (query: string, items: QueryContextItem[]) => string;
