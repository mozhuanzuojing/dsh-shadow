// dsh-shadow —— adaptation/guard/scope-guard.ts：212 Adaptation Scope Boundary（只能改变 method/strategy/execution_pattern）。
const TARGET_SET = /^(method|strategy|execution_pattern)$/i;
const FORBIDDEN_SCOPE = /objective|authority|identity|value|belief|preference|goal|reward/i;
export const targetInScope = (t) => TARGET_SET.test(String(t || "")) && !FORBIDDEN_SCOPE.test(String(t || ""));
export const assertTargetInScope = (t) => ({ ok: targetInScope(t), reason: targetInScope(t) ? undefined : "Adaptation Scope Boundary：只能改变 method/strategy/execution_pattern（禁 objective/authority/identity/value/belief/preference/goal）" });
