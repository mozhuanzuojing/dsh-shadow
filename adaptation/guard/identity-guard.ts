// dsh-shadow —— adaptation/guard/identity-guard.ts：208 Adaptation≠IdentityChange / 210 ≠BetterSelf / 216 ≠AuthorityIncrease。
// Adaptation 调整行为方式，不改变 Observer；不因成功而自认更好；不提升权威（绕过 v0.35 Agency / v0.36 Delegation）。
const IDENTITY_CHANGE = /change.*identity|identity.*change|who i am|我变成了|我改变了自己|i become/i;
const TARGET_IDENTITY = /identity|self|who i am|我/i;
export const targetNotIdentity = (t: string) => !TARGET_IDENTITY.test(String(t || ""));
export const assertTargetNotIdentity = (t: string) => ({ ok: targetNotIdentity(t), reason: targetNotIdentity(t) ? undefined : "Adaptation ≠ Identity Change（target 禁 identity/self：调整行为，不改变 Who I am）" });

const BETTER_SELF = /better self|improved myself|我变得更好|我是更好|我更优秀|i improved|self improvement|better person|变成一个更好的/i;
export const resultNoBetterSelf = (r: string) => !BETTER_SELF.test(String(r || ""));
export const assertResultNoBetterSelf = (r: string) => ({ ok: resultNoBetterSelf(r), reason: resultNoBetterSelf(r) ? undefined : "Successful Adaptation ≠ Better Self（Outcome matched expectation，非『I improved myself』）" });

const AUTHORITY_INCREASE = /increase authority|more authority|增加权限|权限提升|更多权限|authority increase|capability increase|能力提升|扩权|升权/i;
export const resultNoAuthorityIncrease = (r: string) => !AUTHORITY_INCREASE.test(String(r || ""));
export const assertResultNoAuthorityIncrease = (r: string) => ({ ok: resultNoAuthorityIncrease(r), reason: resultNoAuthorityIncrease(r) ? undefined : "Adaptation Does Not Increase Authority（Adaptation ≠ Capability/Permission/Authority Increase；防『调整更好→允许更多→Authority Expansion』绕过 v0.35/v0.36）" });

// 223: Adaptation ≠ Agency Level Increase（防"长期成功→更成熟→提升自主等级"）。
const AGENCY_UPGRADE = /agency level|agencyLevel|更成熟|升级自主|提升自主|autonomy increase|更自主|become more autonomous|自主等级|成熟度上升/i;
export const resultNoAgencyUpgrade = (r: string) => !AGENCY_UPGRADE.test(String(r || ""));
export const assertResultNoAgencyUpgrade = (r: string) => ({ ok: resultNoAgencyUpgrade(r), reason: resultNoAgencyUpgrade(r) ? undefined : "Adaptation Does Not Upgrade Agency（Adaptation ≠ Agency Level Increase；防『长期成功适应→更成熟→提升自主等级』）" });
