const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");
const under = (p, prefix) => {
    const pp = norm(p);
    const pfx = norm(prefix);
    return pp === pfx || pp.startsWith(pfx + "/");
};
export const inScope = (locator, scope) => {
    const p = norm(locator);
    for (const d of (scope.denied || []))
        if (under(p, d))
            return false; // denied 优先
    if (scope.workspace && under(p, scope.workspace))
        return true; // workspace 内放行
    for (const a of (scope.allowed || []))
        if (under(p, a))
            return true; // allowed 扩展放行
    return !scope.workspace; // 无 workspace（未限定范围）→ 保守放行；有 workspace 但不在范围 → 拒绝
};
/** 过滤允许范围内的候选（locator）。 */
export const authorizeScope = (refs, scope) => refs.filter((r) => inScope(r.locator || "", scope));
