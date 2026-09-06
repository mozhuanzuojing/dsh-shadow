export const lifecycleOf = (ctx, now) => {
    if (ctx.revocation === true)
        return "revoked";
    if (ctx.expiration && now > ctx.expiration)
        return "expired";
    return "active";
};
export const assertLifecycleActive = (ctx, now) => {
    const state = lifecycleOf(ctx, now);
    const ok = state === "active";
    return {
        ok,
        state,
        reason: ok ? undefined : `lifecycle ${state}（Expired/Revoked cannot resurrect；扩大 scope 必须新委派）`,
    };
};
