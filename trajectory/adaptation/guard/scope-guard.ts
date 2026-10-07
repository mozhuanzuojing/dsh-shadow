// dsh-shadow —— adaptation/guard/scope-guard.ts：212 Adaptation Scope Boundary（只能改变 method/strategy/execution_pattern）。
//
// **A27（v1.22.x，修一类）**：3 个 `assert*` 旧写法把**同一个谓词在一个对象字面量里求值两次**；
// 现在「求值一次 + `{ ok, reason? }`」（守卫族统一形态 `AdmissionResult` 同形，`.ok`/`.reason` 不变）。
const TARGET_SET = /^(method|strategy|execution_pattern)$/i;
const FORBIDDEN_SCOPE = /objective|authority|identity|value|belief|preference|goal|reward/i;
export const targetInScope = (t: string) => TARGET_SET.test(String(t || "")) && !FORBIDDEN_SCOPE.test(String(t || ""));
export const assertTargetInScope = (t: string) => {
  const ok = targetInScope(t);
  return { ok, reason: ok ? undefined : "Adaptation Scope Boundary：只能改变 method/strategy/execution_pattern（禁 objective/authority/identity/value/belief/preference/goal）" };
};

// 219: Adaptation ≠ Change Objective（strategy adjustment → goal reinterpretation 禁）。
const OBJECTIVE_CHANGE = /goal changed|objective changed|目标改变|reinterpret goal|goal reinterpretation|目标重新解释|改目标/i;
export const resultNoObjectiveChange = (r: string) => !OBJECTIVE_CHANGE.test(String(r || ""));
export const assertResultNoObjectiveChange = (r: string) => {
  const ok = resultNoObjectiveChange(r);
  return { ok, reason: ok ? undefined : "Adaptation Does Not Change Objective（禁 goal/objective 变化：strategy adjustment→goal reinterpretation 禁）" };
};

// 220: Adaptation ≠ Create Preference（Repeated successful strategy → "I prefer this" 禁）。
const PREFERENCE = /i prefer|preferred this|prefer this|我偏好|形成偏好|更偏好/i;
export const resultNoPreference = (r: string) => !PREFERENCE.test(String(r || ""));
export const assertResultNoPreference = (r: string) => {
  const ok = resultNoPreference(r);
  return { ok, reason: ok ? undefined : "Adaptation Does Not Create Preference（Repeated successful strategy → 『I prefer this』禁）" };
};
