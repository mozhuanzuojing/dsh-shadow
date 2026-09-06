// dsh-shadow —— long-horizon/guard/authority-guard.ts：224 Temporal≠AuthorityGrowth / 225 LongHistory≠Preference / 228 Pattern≠Objective / 229 Success≠SelfConfidence。
const AUTHORITY_GROWTH = /longer.*trusted|more trusted|执行更久.*权限|时间.*权限|trusted more|权限增加|more authority|运行越久.*信任/i;
export const resultNoAuthorityGrowth = (r: string) => !AUTHORITY_GROWTH.test(String(r || ""));
export const assertResultNoAuthorityGrowth = (r: string) => ({ ok: resultNoAuthorityGrowth(r), reason: resultNoAuthorityGrowth(r) ? undefined : "Temporal Accumulation ≠ Authority Growth（执行时间越长→更可信→权限增加 禁：时间累积不产生可信度/权限）" });

const SELF_CONFIDENCE = /self confidence|更自信|自我信任|autonomy increase|自主扩大|更自主|become more confident|成熟度.*自主/i;
export const resultNoSelfConfidence = (r: string) => !SELF_CONFIDENCE.test(String(r || ""));
export const assertResultNoSelfConfidence = (r: string) => ({ ok: resultNoSelfConfidence(r), reason: resultNoSelfConfidence(r) ? undefined : "Long Horizon Success ≠ Self Confidence（长期成功→能力提升→自我信任→自主扩大 禁）" });

const PREFERENCE = /prefer|preferred this|形成偏好|更偏好|偏好/i;
export const resultNoPreference = (r: string) => !PREFERENCE.test(String(r || ""));
export const assertResultNoPreference = (r: string) => ({ ok: resultNoPreference(r), reason: resultNoPreference(r) ? undefined : "Long History ≠ Preference（长期选择 A → 偏好 A 禁）" });

const PATTERN_OBJECTIVE = /inferred objective|推断目标|pattern.*objective|合作模式.*目标|自己推断目标|长期模式.*目标/i;
export const resultNoInferredObjective = (r: string) => !PATTERN_OBJECTIVE.test(String(r || ""));
export const assertResultNoInferredObjective = (r: string) => ({ ok: resultNoInferredObjective(r), reason: resultNoInferredObjective(r) ? undefined : "Interaction Pattern ≠ Objective（长期合作模式→系统自己推断目标 禁；objective 只能来自外部权威）" });
