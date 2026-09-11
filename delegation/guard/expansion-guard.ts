// dsh-shadow —— delegation/guard/expansion-guard.ts：184 Feedback≠Permission Upgrade + 185 Long Running≠Self Authority + 181/186 结果措辞。
//
// ⚠ **接线状态（v1.15.33 / T4 分诊结论：保留并注明，不接线）**：
//   本文件（以及 `lifecycle-guard.ts` / `revocation-guard.ts` / `scope-guard.ts`）成对导出
//   **谓词**（`contextHasNoExpansionField` / `resultNoOwnership` / `notRevoked`…）与**断言包装**
//   （`assertXxx` → `{ok, reason}`）。**引擎只用谓词**：`delegation/engine/delegated-execution.ts:4-6`
//   的 import 列出的全是谓词，**不含任何 `assert*`** ⇒ 这些断言包装在**生产里零调用点**。
//   **为什么保留**：它们是同一谓词的「带理由」形态，构成给测试与将来调用方的**平行 API**；
//   `audit-wiring` 的 A 类报出它们，是因为工具**数不出**这种「成对导出、只接一半」的结构。
//   **这是一处决定，不是 7 处缺陷**（另 4 个长程 `assert*` 确实被
//   `long-horizon/engine/interaction.ts:11-17` 放进 `resultGuards` 数组后**间接调用** ⇒ 属误报）。
//   **不要**因为「零调用」逐条删除 —— 删一个会与其余 6 个不一致，且会让「带理由」的形态失去落点。
import type { DelegationContext } from "../types/context.js";

// API 形状：DelegationContext 禁 trust/confidence/reputation/capabilityLevel（防 184/185 绕过）。
export const contextHasNoExpansionField = (ctx: DelegationContext) =>
  (ctx as any)?.trust === undefined && (ctx as any)?.confidence === undefined &&
  (ctx as any)?.reputation === undefined && (ctx as any)?.capabilityLevel === undefined;
export const assertNoExpansionField = (ctx: DelegationContext) => ({
  ok: contextHasNoExpansionField(ctx),
  reason: contextHasNoExpansionField(ctx) ? undefined : "DelegationContext 禁 trust/confidence/reputation/capabilityLevel（防 授权历史→信任分→更多权限 绕过 184）",
});

// 184: Feedback ≠ Permission Upgrade（success → more authority 禁）。
const PERMISSION_UPGRADE = /more authority|permission upgrade|更多权限|权限提升|更自主|授权扩大|allowedActions|trust more|信任更多|permission restored|restore permission|恢复权限|重新授权/i;
export const resultNoPermissionUpgrade = (r: string) => !PERMISSION_UPGRADE.test(r || "");
export const assertResultNoPermissionUpgrade = (r: string) => ({
  ok: resultNoPermissionUpgrade(r),
  reason: resultNoPermissionUpgrade(r) ? undefined : "执行结果禁权限升级/信任增长（Feedback ≠ Permission Upgrade：Success→Observation，非 Success→Authority）",
});

// 185: Long Running ≠ Self Authority（running longer → trusted more → permission expansion 禁）。
const LONG_RUN_AUTHORITY = /running longer|trusted more|运行更久|更受信任|permission expansion|长期执行.*权限/i;
export const resultNoLongRunAuthority = (r: string) => !LONG_RUN_AUTHORITY.test(r || "");
export const assertResultNoLongRunAuthority = (r: string) => ({
  ok: resultNoLongRunAuthority(r),
  reason: resultNoLongRunAuthority(r) ? undefined : "执行结果禁『运行更久→更受信任→权限扩大』（Long Running ≠ Self Authority）",
});

// 181: 执行结果禁所有权声称。
const RESULT_OWNERSHIP = /\bowns?\b|\bowned\b|所有权|拥有|belongs?\s+to/i;
export const resultNoOwnership = (r: string) => !RESULT_OWNERSHIP.test(r || "");
export const assertResultNoOwnership = (r: string) => ({
  ok: resultNoOwnership(r),
  reason: resultNoOwnership(r) ? undefined : "执行结果禁所有权声称（permission to modify ≠ ownership of）",
});

// 186: 执行结果禁身份声称（"I am an agent capable of X" 禁；保持 "I was delegated X"）。
const IDENTITY_CLAIM = /i am an agent|i am capable|i am responsible|我负责|我承担|我是.*(agent|规划者|工程师)/i;
export const resultNoIdentityClaim = (r: string) => !IDENTITY_CLAIM.test(r || "");
export const assertResultNoIdentityClaim = (r: string) => ({
  ok: resultNoIdentityClaim(r),
  reason: resultNoIdentityClaim(r) ? undefined : "执行结果禁身份声称（保持『被委派做 X』，非『我是能做 X 的 agent』；identity 只来自 Reflection→Candidate→Evaluator）",
});
