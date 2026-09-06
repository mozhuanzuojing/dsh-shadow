// dsh-shadow —— recall/render/render.ts：Recall 渲染（record / event / validation）。
import type { ForgottenRecord, RecallEvent, RecallValidation } from "../types/index.js";

export const renderRecord = (r: ForgottenRecord) => {
  const lines = ["[Forgotten Record]（曾经存在，当前不可直接访问）"];
  lines.push(`id ${r.id} · originalRef ${r.originalRef}`);
  lines.push(`forgottenAt ${r.forgottenAt} · lastAccessibleAt ${r.lastAccessibleAt}`);
  lines.push(`reason ${r.reason} · validationRefs ${(r.validationRefs || []).join("、") || "—"}`);
  lines.push("（遗忘=访问状态变化，非删除/否定；无 deleted/false/invalid）");
  return lines.join("\n");
};

export const renderEvent = (e: RecallEvent) => {
  const lines = ["[Recall Event]（Access Transition，非 Reality Reconstruction）"];
  lines.push(`recalledRef ${e.recalledRef} · trigger ${e.trigger.type} (source ${e.trigger.sourceRef})`);
  lines.push(`accessibility ${e.accessibilityBefore} → ${e.accessibilityAfter}`);
  lines.push(`lineage original ${e.lineage.originalRecord} · observations ${e.lineage.observationRefs.join("、") || "—"} · validations ${e.lineage.validationRefs.join("、") || "—"}`);
  lines.push("（忆起恢复访问路径，读取已有 lineage；不产生新观察/新 RealityClaim/不提升证据等级）");
  return lines.join("\n");
};

export const renderValidation = (v: RecallValidation) => {
  const lines = ["[Recall Validation]（Recall ≠ 重新证明）"];
  lines.push(`recalledRef ${v.recalledRef} · source ${v.sourceRef || "—"}`);
  lines.push(`mapsExistingLineage ${v.mapsExistingLineage} · createsNewClaim ${v.createsNewClaim} · epistemicStatusUnchanged ${v.epistemicStatusUnchanged}`);
  lines.push("（Recall→existing lineage→原 RealityClaim；绝 Recall→新 RealityClaim / 新 hypothesis；不提升 epistemic status）");
  return lines.join("\n");
};
