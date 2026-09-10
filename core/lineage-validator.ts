// dsh-shadow —— core/lineage-validator.ts：Lineage Validation Layer（ADR-0046 Phase C，v1.8.0 核心）。
// 职责：判断「一个 Atom 是否允许成为 ShadowNode」。纯函数，无 LLM / 无 fs。
// 规则（来自 ADR-0044/0045）：
//   - memory kind∈{metadata,session} → reject projection（不进入默认认知查询）。
//   - decision 无 lineage.evidence → reject context（但 Atom 保留：决策发生过 ≠ 决策可信）。
//   - resource 无 evidence（卡片里的 source 链接/路径）→ reject context（卡片保留：收进库 ≠ 有出处）。
//   - 其余 → allowed。
// 关键：reject 不是删除，Atom 仍然存在；只影响「是否进入 shadow_query context / 认知查询」。
import type { NodeType, AtomKind, AtomLineage, AtomProjectionVerdict } from "./lineage.js";

export interface AtomLike {
  type: NodeType;
  kind?: AtomKind;
  lineage?: AtomLineage;
}

export const validateAtomProjection = (atom: AtomLike): AtomProjectionVerdict => {
  if (atom.type === "memory" && (atom.kind === "metadata" || atom.kind === "session")) {
    return { allowed: false, reason: `memory kind=${atom.kind} 不进入默认认知查询（Atom 保留）` };
  }
  if (atom.type === "decision" && (!atom.lineage || atom.lineage.evidence.length === 0)) {
    return { allowed: false, reason: "decision 无 evidence 不进入 context（Atom 保留；决策发生过≠可靠）" };
  }
  if (atom.type === "resource") {
    const ev = (atom.lineage && atom.lineage.evidence) || [];
    if (!ev.some((e) => String((e && e.locator) || "").trim())) {
      return { allowed: false, reason: "resource 无 evidence（source 链接/路径）不进入 context（卡片保留；收进库≠有出处）" };
    }
  }
  return { allowed: true };
};
