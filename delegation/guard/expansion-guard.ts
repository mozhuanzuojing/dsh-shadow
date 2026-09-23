// dsh-shadow —— delegation/guard/expansion-guard.ts：184 Feedback≠Permission Upgrade + 185 Long Running≠Self Authority + 181/186 结果措辞。
// 只保留谓词；浅 assert* 包装已删（架构加深 P6：删除测试通过）。
import type { DelegationContext } from "../types/context.js";

// API 形状：DelegationContext 禁 trust/confidence/reputation/capabilityLevel（防 184/185 绕过）。
export const contextHasNoExpansionField = (ctx: DelegationContext) =>
  (ctx as any)?.trust === undefined && (ctx as any)?.confidence === undefined &&
  (ctx as any)?.reputation === undefined && (ctx as any)?.capabilityLevel === undefined;

// 184: Feedback ≠ Permission Upgrade（success → more authority 禁）。
const PERMISSION_UPGRADE = /more authority|permission upgrade|更多权限|权限提升|更自主|授权扩大|allowedActions|trust more|信任更多|permission restored|restore permission|恢复权限|重新授权/i;
export const resultNoPermissionUpgrade = (r: string) => !PERMISSION_UPGRADE.test(r || "");

// 185: Long Running ≠ Self Authority（running longer → trusted more → permission expansion 禁）。
const LONG_RUN_AUTHORITY = /running longer|trusted more|运行更久|更受信任|permission expansion|长期执行.*权限/i;
export const resultNoLongRunAuthority = (r: string) => !LONG_RUN_AUTHORITY.test(r || "");

// 181: 执行结果禁所有权声称。
const RESULT_OWNERSHIP = /\bowns?\b|\bowned\b|所有权|拥有|belongs?\s+to/i;
export const resultNoOwnership = (r: string) => !RESULT_OWNERSHIP.test(r || "");

// 186: 执行结果禁身份声称（"I am an agent capable of X" 禁；保持 "I was delegated X"）。
const IDENTITY_CLAIM = /i am an agent|i am capable|i am responsible|我负责|我承担|我是.*(agent|规划者|工程师)/i;
export const resultNoIdentityClaim = (r: string) => !IDENTITY_CLAIM.test(r || "");
