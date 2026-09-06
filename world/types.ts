// dsh-shadow —— world/types.ts：v0.31 World Representation Kernel 类型。
// 命名：World Representation Layer（Observer 当前可维护的世界结构表示，不是世界模型副本）。
// 冻结：Representation 是 Reality 的二级结构（永不比 Reality Evidence 更确定）；Relation 恒 hypothesis；Graph 可重建。
export interface RepresentationObject {
  id: string;
  basedOnClaims: string[];   // RealityClaim ids（只接受 supported）
  temporalScope: string;
  uncertainty: number;
  status: "represented" | "candidate";
}

export interface RelationHypothesis {
  id: string;
  from: string;
  to: string;
  relation: string;
  status: "hypothesis" | "validated" | "rejected";  // 恒 hypothesis/validated/rejected，**绝不 fact/reality**
  evidence: string[];        // RealityClaim ids
  uncertainty: number;
}

export interface RepresentationGraph {
  graphVersion: string;
  generatedAt: string;
  sourceClaims: string[];    // RealityClaim ids
  sourceValidations: string[];
  objects: RepresentationObject[];
  relations: RelationHypothesis[];
}

export const GRAPH_VERSION = "0.31";
