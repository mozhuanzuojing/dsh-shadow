import type { RelationHypothesis } from "../types.js";
export declare const FORBIDDEN_RELATION_STATUS: Set<string>;
export declare const relationHypothesisOf: (opts: {
    from: string;
    to: string;
    relation: string;
    evidence?: string[];
}) => RelationHypothesis;
export declare const isRelationHypothesis: (r: RelationHypothesis) => boolean;
export declare const renderRelation: (r: RelationHypothesis) => string;
