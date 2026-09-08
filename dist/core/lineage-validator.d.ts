import type { NodeType, AtomKind, AtomLineage, AtomProjectionVerdict } from "./lineage.js";
export interface AtomLike {
    type: NodeType;
    kind?: AtomKind;
    lineage?: AtomLineage;
}
export declare const validateAtomProjection: (atom: AtomLike) => AtomProjectionVerdict;
