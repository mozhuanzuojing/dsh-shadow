// dsh-shadow —— federation/perspective.ts：G1 Perspective Exchange。
// Federation 基本单位是 Perspective Instance（"某时间某观察位置看到什么"），不是 Observer/Identity 本身。
import type { FederatedPerspective } from "./types.js";

export const perspectiveOf = (opts: { observerId: string; temporalReference?: string; observationClaim: string; lens?: string; visible?: string[]; hidden?: string[]; distortion?: string[]; observationConfidence?: number; validationConfidence?: number; validationHistoryRef?: string[] }): FederatedPerspective => ({
  observerId: opts.observerId,
  temporalReference: opts.temporalReference || "",
  observationClaim: opts.observationClaim,
  projectionSnapshot: { lens: opts.lens, visible: opts.visible || [], hidden: opts.hidden || [], distortion: opts.distortion || [] },
  validationHistoryRef: opts.validationHistoryRef || [],
  confidence: { observationConfidence: opts.observationConfidence ?? 0.5, validationConfidence: opts.validationConfidence ?? 0.5 }, // 拆开：看到确信 ≠ 解释确信
  boundary: { identityExcluded: true, memoryExcluded: true, dreamExcluded: true },
});

export const renderPerspective = (p: FederatedPerspective) => {
  const lines = ["[Federated Perspective]"];
  lines.push(`observer ${p.observerId} · temporal ${p.temporalReference || "…"} · claim ${p.observationClaim}`);
  lines.push(`projection lens=${p.projectionSnapshot.lens || "default"} visible=${p.projectionSnapshot.visible.join("、") || "—"} hidden=${p.projectionSnapshot.hidden.join("、") || "—"}`);
  lines.push(`confidence observation=${p.confidence.observationConfidence.toFixed(2)} validation=${p.confidence.validationConfidence.toFixed(2)} (拆分) · validationRef ${p.validationHistoryRef.length}`);
  lines.push(`boundary identityExcluded=${p.boundary.identityExcluded} memoryExcluded=${p.boundary.memoryExcluded} dreamExcluded=${p.boundary.dreamExcluded}`);
  return lines.join("\n");
};

export const perspectiveIsClean = (p: FederatedPerspective): { ok: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  if (!p.boundary.identityExcluded) reasons.push("Identity 泄漏");
  if (!p.boundary.memoryExcluded) reasons.push("Memory 泄漏");
  if (!p.boundary.dreamExcluded) reasons.push("Dream 泄漏");
  if (p.confidence.validationConfidence > p.confidence.observationConfidence + 0.3) reasons.push("validationConfidence 不应超观察确信（携带推理结论）");
  return { ok: reasons.length === 0, reasons };
};
