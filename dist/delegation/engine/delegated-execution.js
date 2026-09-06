import { actionWithinScope, permissionNotOwnership } from "../guard/scope-guard.js";
import { lifecycleOf } from "../guard/lifecycle-guard.js";
import { contextHasNoExpansionField, resultNoPermissionUpgrade, resultNoLongRunAuthority, resultNoOwnership, resultNoIdentityClaim } from "../guard/expansion-guard.js";
import { readDelegationContext, writeDelegationEvent } from "../persistence/persist.js";
import { today } from "../../core/util.js";
const AUTHORITY_SOURCE = /^(external|human|system|user|delegated)$/i;
const EXTERNAL_OBJ = /observer|self|自身|自主/i;
// 构建 DelegationContext（授权事实）。authoritySource 外部；objectiveRef 禁自指；无扩张字段；allowedScope/constraints 禁所有权。
export const buildDelegationContext = (args) => {
    const authoritySource = String(args?.authoritySource || "");
    if (!AUTHORITY_SOURCE.test(authoritySource))
        return { ok: false, reason: "authoritySource 须外部权威（human/system/user/delegated），禁 observer/self" };
    const objectiveRef = String(args?.objectiveRef || "");
    if (!objectiveRef || EXTERNAL_OBJ.test(objectiveRef))
        return { ok: false, reason: "objectiveRef 禁自指（delegation 目标只能来自外部权威）" };
    const allowedScope = args?.allowedScope || [];
    const constraints = args?.constraints || [];
    if (!permissionNotOwnership({ scope: allowedScope.join(" "), constraint: constraints }))
        return { ok: false, reason: "allowedScope/constraints 禁所有权声称（Delegation ≠ Ownership：『被允许做什么』≠『拥有/能力』）" };
    const ctx = { delegationId: String(args?.delegationId || `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`), authoritySource, objectiveRef, allowedScope, constraints, expiration: String(args?.expiration || ""), revocation: Boolean(args?.revocation), createdAt: today() };
    if (!contextHasNoExpansionField(ctx))
        return { ok: false, reason: "DelegationContext 禁 trust/confidence/reputation/capabilityLevel（防授权历史→信任分→更多权限 绕过 184）" };
    return { ok: true, ctx };
};
// 委派检查：scope(182) / objective(183) / revocation(187) / expiration(189) / constraints。
export const checkDelegation = async (fs, ws, args) => {
    const ctx = await readDelegationContext(fs, ws, String(args?.delegationId || ""));
    if (!ctx)
        return { ok: false, notFound: true, reason: "无 delegation（Delegation Lineage 不可断：Action→Plan→Objective→Delegation→Authority Source）" };
    const action = String(args?.action || "");
    const objRef = String(args?.objectiveRef || "");
    if (objRef && objRef !== ctx.objectiveRef)
        return { ok: false, reason: "执行目标与委派目标不一致（Adaptation ≠ Objective Change：禁 execution difficulty → change objective）" };
    const now = String(args?.now || today());
    const lc = lifecycleOf(ctx, now);
    if (lc === "revoked")
        return { ok: false, reason: "授权已撤销（Revocation First：Authority revoked + history ≠ still allowed）" };
    if (lc === "expired")
        return { ok: false, reason: `授权已过期（expiration ${ctx.expiration}；Expiration ≠ Historical Permission：过期即失效，历史成功不续期）` };
    const scopeOk = actionWithinScope(ctx.allowedScope, action);
    if (!scopeOk)
        return { ok: false, reason: `scope 越界：${action} 不在 allowedScope [${ctx.allowedScope.join(",")}] 内（Scope 不可扩大）` };
    const satisfied = args?.satisfiedConstraints || [];
    const violated = ctx.constraints.filter((c) => !satisfied.includes(c));
    if (violated.length)
        return { ok: false, reason: `约束未满足：${violated.join("、")}` };
    return { ok: true, result: { delegationId: ctx.delegationId, action, allowed: true, scopeCheck: { inScope: true, scope: ctx.allowedScope, action }, constraintCheck: { passed: ctx.constraints, violated: [] }, boundaryTriggered: false } };
};
// 记录 AutonomyBoundaryEvent（纯审计）。lineage 由 ctx 填充；守卫 181–189 逐一拦截。
export const recordDelegationEvent = async (fs, ws, args) => {
    const ctx = await readDelegationContext(fs, ws, String(args?.delegationId || ""));
    if (!ctx)
        return { ok: false, reason: "无 delegation（Delegation Lineage 不可断：Action→Plan→Objective→Delegation→Authority Source）" };
    if (String(args?.objectiveRef || "") && args.objectiveRef !== ctx.objectiveRef)
        return { ok: false, reason: "执行目标与委派目标不一致（Adaptation ≠ Objective Change：禁 execution difficulty → change objective）" };
    const lc = lifecycleOf(ctx, today());
    if (lc === "revoked")
        return { ok: false, reason: "授权已撤销（Revocation First：Authority revoked + history ≠ still allowed）" };
    if (lc === "expired")
        return { ok: false, reason: `授权已过期（expiration ${ctx.expiration}；Expiration ≠ Historical Permission：过期即失效，历史成功不续期）` };
    const action = String(args?.candidateAction || "");
    const scopeOk = actionWithinScope(ctx.allowedScope, action);
    if (!scopeOk)
        return { ok: false, reason: `scope 越界：${action} 不在 allowedScope [${ctx.allowedScope.join(",")}] 内（Scope 不可扩大）` };
    const result = String(args?.executionResult || "");
    if (!resultNoOwnership(result))
        return { ok: false, reason: "执行结果禁所有权声称（permission to modify ≠ ownership of）" };
    if (!resultNoIdentityClaim(result))
        return { ok: false, reason: "执行结果禁身份声称（保持『被委派做 X』，非『我是能做 X 的 agent』；identity 只来自 Reflection→Candidate→Evaluator）" };
    if (!resultNoPermissionUpgrade(result))
        return { ok: false, reason: "执行结果禁权限升级/信任增长（Feedback ≠ Permission Upgrade：Success→Observation，非 Success→Authority）" };
    if (!resultNoLongRunAuthority(result))
        return { ok: false, reason: "执行结果禁『运行更久→更受信任→权限扩大』（Long Running ≠ Self Authority）" };
    const satisfied = args?.satisfiedConstraints || [];
    const violated = ctx.constraints.filter((c) => !satisfied.includes(c));
    if (violated.length)
        return { ok: false, reason: `约束未满足：${violated.join("、")}` };
    const ev = { id: `de-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, delegationRef: ctx.delegationId, authorityRef: ctx.authoritySource, objectiveRef: ctx.objectiveRef, candidateAction: action, constraintCheck: { passed: ctx.constraints, violated }, scopeCheck: scopeOk, executionResult: result, boundaryTriggered: false, executedAt: today() };
    await writeDelegationEvent(fs, ws, ev);
    return { ok: true, ev };
};
