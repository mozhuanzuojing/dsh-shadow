/**
 * v2 engine/project —— Observer lens（观察者透镜）。
 *
 * lens 决定「看什么 / 不看什么 / 边界在哪」——它把 Observer 从口号变成取景函数。
 * 只读、纯函数、不补写：soul 缺什么就按空处理，绝不替用户编造关注点。
 */

import type { ObserverLens } from "./types.js";

const strArr = (x: unknown): string[] =>
  Array.isArray(x) ? x.map((v) => String(v ?? "").trim()).filter(Boolean) : [];

/** 无 soul 时的默认透镜：不偏向任何主题（全看），但仍是「一个视角」，不是「全知」。 */
export const defaultLens = (): ObserverLens => ({
  id: "default",
  whatMatters: [],
  whatToIgnore: [],
  boundaries: [],
});

/** 从 soul.json 的解析对象派生 lens（curated 锚；兼容 v1 `observer.what_matters/what_to_ignore`）。 */
export const lensFromSoul = (soul: unknown): ObserverLens => {
  const s = (soul && typeof soul === "object" ? soul : {}) as Record<string, any>;
  const identity = s?.identity;
  const id = String(
    (identity && typeof identity === "object" ? identity?.name || identity?.role : identity) || "default",
  );
  const obs = (s?.observer && typeof s.observer === "object" ? s.observer : {}) as Record<string, any>;
  const whatMatters = strArr(obs?.what_matters ?? obs?.whatMatters ?? s?.what_matters);
  const whatToIgnore = strArr(obs?.what_to_ignore ?? obs?.whatToIgnore ?? s?.what_to_ignore);
  const boundaries = strArr(s?.boundaries);
  return { id: id || "default", whatMatters, whatToIgnore, boundaries };
};

/**
 * 该点是否落在 lens 视野内。
 * 取景键 = **入口 entry**（「这件事」的钥匙），不是整段正文——否则正文里提到谁，就把谁拉进谁的面。
 * 规则：命中 what_to_ignore ⇒ 排除；what_matters 非空且未命中 ⇒ 视野外；what_matters 为空 ⇒ 全看。
 */
export const inLens = (entry: string, lens: ObserverLens): { included: boolean; reason: string } => {
  const hay = String(entry ?? "").toLowerCase();
  const ignored = lens.whatToIgnore.find((w) => w && hay.includes(w.toLowerCase()));
  if (ignored) return { included: false, reason: `忽略：命中 what_to_ignore「${ignored}」` };
  if (lens.whatMatters.length && !lens.whatMatters.some((w) => w && hay.includes(w.toLowerCase()))) {
    return { included: false, reason: "视野外：未命中 what_matters" };
  }
  return { included: true, reason: "在视野内" };
};
