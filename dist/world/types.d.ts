export interface RepresentationObject {
    id: string;
    basedOnClaims: string[];
    temporalScope: string;
    uncertainty: number;
    status: "represented" | "candidate";
}
export interface RelationHypothesis {
    id: string;
    from: string;
    to: string;
    relation: string;
    status: "hypothesis" | "validated" | "rejected";
    evidence: string[];
    uncertainty: number;
}
export interface RepresentationGraph {
    graphVersion: string;
    generatedAt: string;
    sourceClaims: string[];
    sourceValidations: string[];
    objects: RepresentationObject[];
    relations: RelationHypothesis[];
}
export declare const GRAPH_VERSION = "0.31";
