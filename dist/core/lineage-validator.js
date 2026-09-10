export const validateAtomProjection = (atom) => {
    if (atom.type === "memory" && (atom.kind === "metadata" || atom.kind === "session")) {
        return { allowed: false, reason: `memory kind=${atom.kind} 不进入默认认知查询（Atom 保留）` };
    }
    if (atom.type === "decision" && (!atom.lineage || atom.lineage.evidence.length === 0)) {
        return { allowed: false, reason: "decision 无 evidence 不进入 context（Atom 保留；决策发生过≠可靠）" };
    }
    if (atom.type === "resource" && (!atom.lineage || atom.lineage.evidence.length === 0)) {
        return { allowed: false, reason: "resource 无 evidence（source 链接/路径）不进入 context（卡片保留；收进库≠有出处）" };
    }
    return { allowed: true };
};
