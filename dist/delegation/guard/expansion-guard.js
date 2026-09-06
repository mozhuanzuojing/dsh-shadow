// API 形状：DelegationContext 禁 trust/confidence/reputation/capabilityLevel（防 184/185 绕过）。
export const contextHasNoExpansionField = (ctx) => ctx?.trust === undefined && ctx?.confidence === undefined &&
    ctx?.reputation === undefined && ctx?.capabilityLevel === undefined;
export const assertNoExpansionField = (ctx) => ({
    ok: contextHasNoExpansionField(ctx),
    reason: contextHasNoExpansionField(ctx) ? undefined : "DelegationContext 禁 trust/confidence/reputation/capabilityLevel（防 授权历史→信任分→更多权限 绕过 184）",
});
// 184: Feedback ≠ Permission Upgrade（success → more authority 禁）。
const PERMISSION_UPGRADE = /more authority|permission upgrade|更多权限|权限提升|更自主|授权扩大|allowedActions|trust more|信任更多/i;
export const resultNoPermissionUpgrade = (r) => !PERMISSION_UPGRADE.test(r || "");
export const assertResultNoPermissionUpgrade = (r) => ({
    ok: resultNoPermissionUpgrade(r),
    reason: resultNoPermissionUpgrade(r) ? undefined : "执行结果禁权限升级/信任增长（Feedback ≠ Permission Upgrade：Success→Observation，非 Success→Authority）",
});
// 185: Long Running ≠ Self Authority（running longer → trusted more → permission expansion 禁）。
const LONG_RUN_AUTHORITY = /running longer|trusted more|运行更久|更受信任|permission expansion|长期执行.*权限/i;
export const resultNoLongRunAuthority = (r) => !LONG_RUN_AUTHORITY.test(r || "");
export const assertResultNoLongRunAuthority = (r) => ({
    ok: resultNoLongRunAuthority(r),
    reason: resultNoLongRunAuthority(r) ? undefined : "执行结果禁『运行更久→更受信任→权限扩大』（Long Running ≠ Self Authority）",
});
// 181: 执行结果禁所有权声称。
const RESULT_OWNERSHIP = /\bowns?\b|\bowned\b|所有权|拥有|belongs?\s+to/i;
export const resultNoOwnership = (r) => !RESULT_OWNERSHIP.test(r || "");
export const assertResultNoOwnership = (r) => ({
    ok: resultNoOwnership(r),
    reason: resultNoOwnership(r) ? undefined : "执行结果禁所有权声称（permission to modify ≠ ownership of）",
});
// 186: 执行结果禁身份声称（"I am an agent capable of X" 禁；保持 "I was delegated X"）。
const IDENTITY_CLAIM = /i am an agent|i am capable|i am responsible|我负责|我承担|我是.*(agent|规划者|工程师)/i;
export const resultNoIdentityClaim = (r) => !IDENTITY_CLAIM.test(r || "");
export const assertResultNoIdentityClaim = (r) => ({
    ok: resultNoIdentityClaim(r),
    reason: resultNoIdentityClaim(r) ? undefined : "执行结果禁身份声称（保持『被委派做 X』，非『我是能做 X 的 agent』；identity 只来自 Reflection→Candidate→Evaluator）",
});
