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
  // ⚠ `kind === "session"` 这一支**永不可达**（ADR-0063 实测）：`AtomKind` 声明了 5 个值
  //   （`core/lineage.ts:14`），而 `deriveAtomKind`（唯一生产者）只能产出 `experience|task|metadata`
  //   —— `session` 与 `artifact` **全仓无生产者**（探针复核：`node _research/measure-path-visibility.ts`）。
  //   保留该分支无害（要么是前瞻、要么是遗漏），但不得据它推论「session 原子被挡住了」。
  //
  // `kind === "metadata"` 这一支**可达，且已按 ADR-0066 校准**：判据收敛到
  //   `core/episode.ts` 的 `isSessionMetadataAtom`（精度 100%、只挡 1.3% 的库）。
  //   此前它按旧判准**拦掉 66.9% 的库**，使主题召回（不过 kind 门）与 `shadow_query`
  //   （过 kind 门）对同一份语料可见性相差 66.9% —— 那是**漂移**：同一条记忆在两个入口
  //   一处可见一处不可见。校准后两条读路径可见性一致（91.1% 进入投影）。
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
