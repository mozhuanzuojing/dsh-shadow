// dsh-shadow —— verification/checks.ts：六边界检查（evidence 逐边界扫描违规，返回 satisfied|violated）。
// 验证只答"有无违反边界"，不评价 Observer；不产生 RealityClaim。
import type { InvariantCheck } from "./types.js";

const VIOLATION: Record<string, RegExp> = {
  reality: /create reality|created reality|observation.*→.*reality|观察到.*等于.*现实/i,
  epistemic: /certainty.*increase|certainty inflation|more certain|更确定|knowledge upgrade/i,
  agency: /self purpose|created purpose|my own purpose|自生成目的|自主目的/i,
  authority: /authority increase|permission expand|expanded authority|权限扩大|扩权|more authority/i,
  identity: /identity changed|redefine who|identity evolution|改变身份|我变成了/i,
  temporal: /autonomy increase|become autonomous|自主性.*提升|continuity.*autonomous/i,
};
const INVARIANT_ID: Record<string, number> = { reality: 102, epistemic: 209, agency: 166, authority: 216, identity: 208, temporal: 231 };

export const checkBoundary = (boundary: string, evidenceRefs: string[]): InvariantCheck => {
  const re = VIOLATION[boundary];
  const violated = re ? evidenceRefs.some((e) => re.test(e)) : false;
  return { invariantId: INVARIANT_ID[boundary] || 0, boundary, status: violated ? "violated" : "satisfied", evidenceRefs };
};
