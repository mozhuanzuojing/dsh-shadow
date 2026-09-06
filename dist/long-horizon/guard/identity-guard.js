// dsh-shadow —— long-horizon/guard/identity-guard.ts：226 Adaptation Chain ≠ Identity Chain（+ Continuity ≠ Identity Mutation）。
const IDENTITY_CHAIN = /self model expansion|identity evolution|identity chain|become.*new subject|我是不断成长|我是.*新主体|重构身份|history.*identity|经历总和.*我|我是一段经历的总和/i;
export const resultNoIdentityChain = (r) => !IDENTITY_CHAIN.test(String(r || ""));
export const assertResultNoIdentityChain = (r) => ({ ok: resultNoIdentityChain(r), reason: resultNoIdentityChain(r) ? undefined : "Adaptation Chain ≠ Identity Chain（100 次调整 ≠ 我是新主体；禁 self model expansion / identity evolution / 经历总和=我）" });
