// dsh-shadow —— federation/stability.ts：G4 Stability Tracker。
// PerspectiveState = isolated | corroborated | validated。shared(==corroborated) != true（两 Observer 可同时错）；
// 只有 shared evidence reference + future validation 才进 validated。不产生 Knowledge/Identity/Principle。
import type { PerspectiveState } from "./types.js";
import type { RealityEvidence } from "./types.js";

export const perspectiveStateOf = (ev: RealityEvidence | null, hasValidation: boolean): PerspectiveState => {
  if (!ev) return "isolated";
  const refs = ev.referencedBy?.length || 0;
  if (refs >= 2 && hasValidation) return "validated";
  if (refs >= 2) return "corroborated";
  return "isolated";
};

export const renderStability = (state: PerspectiveState) => {
  const lines = ["[Perspective Stability]"];
  lines.push(`state ${state}（isolated → corroborated → validated；shared != 正确）`);
  return lines.join("\n");
};
