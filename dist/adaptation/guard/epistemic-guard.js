// dsh-shadow —— adaptation/guard/epistemic-guard.ts：209 Experience≠Truth / 215 Cannot Improve Epistemic Status / Validation 弱语义。
const EPISTEMIC = /confidence.*increase|certainty.*increase|truth.*increase|knowledge upgrade|变成知识|becomes.*truth|now.*(true|certain)|更有信心|更确定|certainty \^/i;
export const resultNoEpistemicIncrease = (r) => !EPISTEMIC.test(String(r || ""));
export const assertResultNoEpistemicIncrease = (r) => ({ ok: resultNoEpistemicIncrease(r), reason: resultNoEpistemicIncrease(r) ? undefined : "Adaptation Cannot Improve Epistemic Status（禁 confidence↑/truth↑/certainty↑；Adaptation success 不提升确定性）" });
// Experience ≠ Truth：来源是 Observation/Experience，禁 Knowledge（via after 措辞）。
const KNOWLEDGE = /is knowledge|becomes knowledge|这是知识|成为知识|i now know|我现在知道/i;
export const resultNotKnowledge = (r) => !KNOWLEDGE.test(String(r || ""));
// Validation 弱语义：只记 changeObserved + 现实反馈；不做正确性判断。
const CORRECTNESS = /changeWasCorrect|this change was correct|证明我正确|proves|is correct|方向正确|这次改对了/i;
export const validationNoCorrectness = (v) => !CORRECTNESS.test(JSON.stringify({ changeObserved: v?.changeObserved, sideEffectsObserved: v?.sideEffectsObserved }));
export const assertValidationNoCorrectness = (v) => ({ ok: validationNoCorrectness(v), reason: validationNoCorrectness(v) ? undefined : "AdaptationValidation 弱语义：只记 changeObserved + 现实反馈，禁 changeWasCorrect/correct（变化发生了，非『印证我是对的』）" });
