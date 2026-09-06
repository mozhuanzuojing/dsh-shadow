import type { AgentLike, ShadowConfig, ShadowScope } from "./types.js";
/** 空串视为无效：避免 `"" ?? fallback` 返回空串导致 workspace 解析短路（F1）。 */
export declare function firstNonEmpty(...values: unknown[]): string | undefined;
/**
 * 解析 shadow 归属 scope：显式 project scope（config shadowRoot / projectRoot）**最高优先**；
 * 其次 session cwd 推导（含 session id → cwd 缓存）；否则 none。解析来源唯一，采集/读取共用，
 * 杜绝"同址但错项目"（O2）与"读不到写"（F1）。
 */
export declare function resolveShadowScope(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config?: ShadowConfig): ShadowScope;
/** 采集侧与读取侧共用的**单一** workspace 解析；严禁两处各自复制推导，防漂移。 */
export declare function resolveWorkspace(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config?: ShadowConfig): string;
