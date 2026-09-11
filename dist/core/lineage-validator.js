export const validateAtomProjection = (atom) => {
    // ⚠ `kind === "session"` 这一支**永不可达**（ADR-0063 实测）：`AtomKind` 声明了 5 个值
    //   （`core/lineage.ts:14`），而 `deriveAtomKind`（唯一生产者）只能产出 `experience|task|metadata`
    //   —— `session` 与 `artifact` **全仓无生产者**（探针复核：`node _research/measure-path-visibility.ts`）。
    //   保留该分支无害（要么是前瞻、要么是遗漏），但不得据它推论「session 原子被挡住了」。
    //   另：`kind === "metadata"` 这一支**是可达的且当前拦掉 67.2% 的库** —— 见 ADR-0063 与待办 D5。
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
