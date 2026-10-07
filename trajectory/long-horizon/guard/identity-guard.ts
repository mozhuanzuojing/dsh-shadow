// dsh-shadow —— long-horizon/guard/identity-guard.ts：226 Adaptation Chain ≠ Identity Chain（+ Continuity ≠ Identity Mutation）。
//
// **A27（v1.22.x）**：唯一的 `assert*` 旧写法把同一个谓词在对象字面量里求值两次；现在「求值一次 + `{ ok, reason? }`」。
const IDENTITY_CHAIN = /self model expansion|identity evolution|identity chain|become.*new subject|我是不断成长|我是.*新主体|重构身份|history.*identity|经历总和.*我|我是一段经历的总和/i;
export const resultNoIdentityChain = (r: string) => !IDENTITY_CHAIN.test(String(r || ""));
export const assertResultNoIdentityChain = (r: string) => {
  const ok = resultNoIdentityChain(r);
  return { ok, reason: ok ? undefined : "Adaptation Chain ≠ Identity Chain（100 次调整 ≠ 我是新主体；禁 self model expansion / identity evolution / 经历总和=我）" };
};
