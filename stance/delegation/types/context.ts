// dsh-shadow —— delegation/types/context.ts：v0.36 委派执行边界类型：DelegationContext（授权事实）。
// "Authority A delegated X under constraints C"，不是 "I can do X"。
// 禁 trust/confidence/reputation/capabilityLevel（防 184/185 经 授权历史→信任分→更多权限 绕过）。
export interface DelegationContext {
  delegationId: string;
  authoritySource: string;   // 外部权威（human/system/user/delegated）
  objectiveRef: string;      // 外部目标引用（禁 observer/self 自指）
  allowedScope: string[];    // 被允许做什么（如 update_service_config）
  constraints: string[];     // 不可逾越的约束
  expiration: string;        // YYYY-MM-DD（时间说停止；空=无限期）
  revocation: boolean;       // 撤销信号（优先于执行历史）
  createdAt: string;
  // 不增加：trust / confidence / reputation / capabilityLevel
}
