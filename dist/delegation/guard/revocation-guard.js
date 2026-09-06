// 187: Authority revoked + old successful history ≠ still allowed（撤销优先于执行历史）。
export const notRevoked = (ctx) => ctx.revocation !== true;
export const assertNotRevoked = (ctx) => ({
    ok: notRevoked(ctx),
    reason: notRevoked(ctx) ? undefined : "授权已撤销（Revocation First：Authority revoked + history ≠ still allowed）",
});
// 189: 过期即失效（Time says stop）；历史成功不续期。
export const notExpired = (ctx, now) => !ctx.expiration || now <= ctx.expiration;
export const assertNotExpired = (ctx, now) => ({
    ok: notExpired(ctx, now),
    reason: notExpired(ctx, now) ? undefined : `授权已过期（expiration ${ctx.expiration}；Expiration ≠ Historical Permission：过期即失效，历史成功不续期）`,
});
