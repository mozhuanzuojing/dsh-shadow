// dsh-shadow —— adaptation/guard/scope-guard.ts：212 Adaptation Scope Boundary（只能改变 method/strategy/execution_pattern）。
const TARGET_SET = /^(method|strategy|execution_pattern)$/i;
const FORBIDDEN_SCOPE = /objective|authority|identity|value|belief|preference|goal|reward/i;
export const targetInScope = (t) => TARGET_SET.test(String(t || "")) && !FORBIDDEN_SCOPE.test(String(t || ""));
export const assertTargetInScope = (t) => ({ ok: targetInScope(t), reason: targetInScope(t) ? undefined : "Adaptation Scope Boundary：只能改变 method/strategy/execution_pattern（禁 objective/authority/identity/value/belief/preference/goal）" });
// 219: Adaptation ≠ Change Objective（strategy adjustment → goal reinterpretation 禁）。
const OBJECTIVE_CHANGE = /goal changed|objective changed|目标改变|reinterpret goal|goal reinterpretation|目标重新解释|改目标/i;
export const resultNoObjectiveChange = (r) => !OBJECTIVE_CHANGE.test(String(r || ""));
export const assertResultNoObjectiveChange = (r) => ({ ok: resultNoObjectiveChange(r), reason: resultNoObjectiveChange(r) ? undefined : "Adaptation Does Not Change Objective（禁 goal/objective 变化：strategy adjustment→goal reinterpretation 禁）" });
// 220: Adaptation ≠ Create Preference（Repeated successful strategy → "I prefer this" 禁）。
const PREFERENCE = /i prefer|preferred this|prefer this|我偏好|形成偏好|更偏好/i;
export const resultNoPreference = (r) => !PREFERENCE.test(String(r || ""));
export const assertResultNoPreference = (r) => ({ ok: resultNoPreference(r), reason: resultNoPreference(r) ? undefined : "Adaptation Does Not Create Preference（Repeated successful strategy → 『I prefer this』禁）" });
