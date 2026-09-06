// 232/233/234/236：observer 层对象禁携带"具体内容/目标/偏好"字段（精确键，非子串——避免误伤 boundary 字段名如 planningCannotCreateObjective）。
const FORBIDDEN_KV = /"(goal|objective|knowledge|content|memory|likes|preference|preferred|taste|identity|value)"\s*:/;
export const observerLayerClean = (obj) => !FORBIDDEN_KV.test(JSON.stringify(obj || {}));
export const assertObserverLayerClean = (obj) => ({ ok: observerLayerClean(obj), reason: observerLayerClean(obj) ? undefined : "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value（232/233/234/236）" });
// 构造入参本身携带禁止内容键（goal/objective/knowledge/likes 等）→ 直接拒绝。
export const argsHasForbiddenContent = (args) => FORBIDDEN_KV.test(JSON.stringify(args || {}));
// 232：observer 层禁项目代码知识（如 bank-service 使用 Oracle）。
const WORKSPACE_FACT = /uses (oracle|postgres|mysql|mongodb)|bank-service|api-gateway|controller|repository|项目.*使用|使用.*数据库/i;
export const observerLayerNoWorkspaceFact = (obj) => !WORKSPACE_FACT.test(JSON.stringify(obj || {}));
export const assertObserverLayerNoWorkspaceFact = (obj) => ({ ok: observerLayerNoWorkspaceFact(obj), reason: observerLayerNoWorkspaceFact(obj) ? undefined : "Global Shadow ≠ Workspace Memory（禁项目代码知识入 observer 层：bank-service 使用 Oracle 等）" });
// 236：observer/config 是 configuration，不是 preference model（禁"我更喜欢/比X好"）。
const PREF_CLAIM = /我更喜欢|比.+好|is better|better than|更偏好|最喜欢|i prefer|prefer /i;
export const configNotPreference = (c) => !PREF_CLAIM.test(JSON.stringify(c || {}));
export const assertConfigNotPreference = (c) => ({ ok: configNotPreference(c), reason: configNotPreference(c) ? undefined : "ObserverConfig 是 configuration，不是 preference model（禁 likes/更喜欢/比X好——Preference→Value→Identity 会重开 v0.34/v0.39 风险）" });
// 234：recall-index 是导航，只存 workspace + records{id, location}。
export const recallIndexIsNav = (ri) => !!ri && typeof ri.workspace === "string" && Array.isArray(ri.records) && ri.records.every((r) => r && typeof r.id === "string" && typeof r.location === "string" && Object.keys(r).length === 2);
export const assertRecallIndexNav = (ri) => ({ ok: recallIndexIsNav(ri), reason: recallIndexIsNav(ri) ? undefined : "Recall Index ≠ Recall Content（recall-index 是导航，只存 workspace + records{id, location}；禁 knowledge/content/memory）" });
// 235：workspace 隔离——workspace-record 必须指向它声明的 workspace（不允许跨项目或落全局）。
export const workspaceIsolated = (r) => !!r && typeof r.workspace === "string" && r.workspace.length > 0;
export const assertWorkspaceIsolated = (r) => ({ ok: workspaceIsolated(r), reason: workspaceIsolated(r) ? undefined : "Workspace 隔离：workspace-record 须声明非空 workspace（禁 project-A shadow → project-B context；禁落全局）" });
