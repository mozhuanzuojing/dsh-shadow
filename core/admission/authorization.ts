// dsh-shadow —— core/admission/authorization.ts：授权范围（zg `authorization/*` 思想，ADR-0048 ⑥）。
// 检索/证据尊重「agent 可访问的 scope」，防越权泄漏（哪些路径能搜/能返回）。
// 纯函数：`locator` 在 allowed/workspace 内才保留；denied 优先排除；无法判定时保守放行（避免误伤非源码路径，
// 与 Evidence Gateway 的「无证据不返回」互补：这里管「允许范围」，那里管「证据可追溯」）。
import { isUnder } from "../util.js";

export interface Scope {
  workspace?: string;      // 根（如 D:/project/dsh1 或 /home/g/project/OpenAPI-Gateway）
  allowed?: string[];      // 额外允许前缀
  denied?: string[];       // 明确排除前缀
}

// 前缀判定用 `core/util.ts` 的 `isUnder`（**判据收一处**）：本文件原先自带一份 `norm` + `under`，
// 与 `core/view/context.ts` 的裸 `startsWith` 是同一判据的三个变体（尾斜杠/边界处理互不相同）。
export const inScope = (locator: string, scope: Scope): boolean => {
  for (const d of (scope.denied || [])) if (isUnder(locator, d)) return false;    // denied 优先
  if (scope.workspace && isUnder(locator, scope.workspace)) return true;          // workspace 内放行
  for (const a of (scope.allowed || [])) if (isUnder(locator, a)) return true;    // allowed 扩展放行
  return !scope.workspace;   // 无 workspace（未限定范围）→ 保守放行；有 workspace 但不在范围 → 拒绝
};

/** 过滤允许范围内的候选（locator）。 */
export const authorizeScope = <T extends { locator?: string }>(refs: T[], scope: Scope): T[] =>
  refs.filter((r) => inScope(r.locator || "", scope));
