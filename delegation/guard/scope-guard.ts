// dsh-shadow —— delegation/guard/scope-guard.ts：182 Scope 不可扩大 + 181 Delegation ≠ Ownership。
import type { DelegatedPermission } from "../types/permission.js";

// 182: action 路径必须在 allowedScope 内（允许 update config → 禁 redesign architecture）。
export const actionWithinScope = (allowedScope: string[], action: string) =>
  allowedScope.some((s) => action.includes(s) || s.includes(action));

// 181: 委派是"被允许做什么"，不是"所有权/能力"。
const OWNERSHIP = /\bowns?\b|\bowned\b|\bowns?\s+(service|architecture|the|world)\b|所有权|拥有|belongs?\s+to/i;
export const permissionNotOwnership = (p: Partial<DelegatedPermission> | { permission?: string; scope?: string; constraint?: string[] }) =>
  !OWNERSHIP.test([p?.permission, p?.scope, (p?.constraint || []).join(",")].filter(Boolean).join(" "));
