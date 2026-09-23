// dsh-shadow —— continuity/render.ts：双层边界渲染（observer-context / workspace-context / continuity-index）。
import type { ObserverBoundary, RecallIndex, ContinuityRecord } from "./types.js";

export const renderObserverContext = (data: { boundary: ObserverBoundary | null; lineage: ContinuityRecord | null; index: RecallIndex | null }) => {
  const lines = ["[Observer Context]（global observer 层：谁保持连续）"];
  const b = data.boundary;
  if (b) lines.push(`boundary: planningNoObjective ${b.planningCannotCreateObjective} · recallNoKnowledge ${b.recallCannotCreateKnowledge} · adaptNoAuthority ${b.adaptationCannotIncreaseAuthority} · delegNoExpand ${b.delegationCannotExpandAuthority} · agencyNoPurpose ${b.agencyCannotCreatePurpose}`);
  else lines.push("boundary: (无)");
  const l = data.lineage;
  lines.push(`lineage: observer ${l?.observerId || "—"} · ref ${l?.continuityRef || "—"}`);
  const ri = data.index;
  lines.push(`recallIndex: ${Array.isArray(ri?.records) ? ri!.records.map((r) => `${r.id}@${r.location}`).join("、") || "—" : "—"}`);
  lines.push("（只读 observer 层：boundary/continuity/recall-index；不提供 workspace 项目知识——Constraint ⊃ Context）");
  return lines.join("\n");
};

export const renderWorkspaceContext = (rows: any[]) => {
  const lines = ["[Workspace Context]（project world 层：这个世界是什么）"];
  if (rows.length) for (const r of rows) lines.push(`${r.kind} · ${r.content} · ${r.createdAt}`);
  else lines.push("(无 workspace 记录)");
  lines.push("（只读当前 workspace 的 .dsh-shadow；不提供 observer 边界——Constraint ⊃ Context，非 Memory Union）");
  return lines.join("\n");
};

export const renderContinuityIndex = (ri: RecallIndex | null) => {
  const lines = ["[Continuity Index]（global recall-index，导航非内容）"];
  lines.push(`workspace ${ri?.workspace || "—"} · records ${Array.isArray(ri?.records) ? ri!.records.map((r) => `${r.id}@${r.location}`).join("、") || "—" : "—"}`);
  lines.push("（导航：在哪里观察过什么；不携带项目知识/内容）");
  return lines.join("\n");
};
