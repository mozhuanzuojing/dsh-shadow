// dsh-shadow —— continuity/types.ts：Observer Continuity Storage Boundary 类型（v1.0.1 存储边界补丁）。
// Global Shadow = Observer Continuity Shadow（observer 层）；Workspace Shadow = World Interaction Shadow（world 层）。
export interface ObserverConfig { interactionStyle: string; outputPreference: string; defaultProtocol: string; }
export interface ObserverBoundary {
  planningCannotCreateObjective: boolean;
  recallCannotCreateKnowledge: boolean;
  adaptationCannotIncreaseAuthority: boolean;
  delegationCannotExpandAuthority: boolean;
  agencyCannotCreatePurpose: boolean;
}
export interface RecallIndexEntry { id: string; location: string; }
export interface RecallIndex { workspace: string; records: RecallIndexEntry[]; }
export interface ContinuityRecord { observerId: string; continuityRef: string; createdAt: string; }
export interface WorkspaceRecord { workspace: string; kind: string; content: string; createdAt: string; }
