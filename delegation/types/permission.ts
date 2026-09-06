// dsh-shadow —— delegation/types/permission.ts：DelegatedPermission（不叫 Capability）。
// 表达"被允许做什么"，不是"我具备什么能力"。
export interface DelegatedPermission {
  permission: string;        // "update_service_config"
  source: string;            // "human_admin"
  scope: string;             // "service-A"
  constraint: string[];
}
