import type { AgentLike, ShadowConfig, ShadowScope } from "./types.js";
/** 空串视为无效：避免 `"" ?? fallback` 返回空串导致 workspace 解析短路（F1）。 */
export declare function firstNonEmpty(...values: unknown[]): string | undefined;
/** 全局兜底 shadow 根：仅当既无显式 shadowRoot/projectRoot、又解析不出 session cwd 时使用（保证"可写"，而非"不写"）。
 *  命名"~/.dsh-observer/shadow"：Global shadow 是 **Observer Continuity Shadow**（observer 层），不是 Workspace Memory。 */
export declare const DEFAULT_SHADOW_ROOT: string;
/**
 * 解析 shadow 归属 scope：显式 project scope（config shadowRoot / projectRoot）**最高优先**；
 * 其次 session cwd 推导（`agent.session.header.cwd` → session id 的 cwd 缓存）；都无 → **fallback 到 `DEFAULT_SHADOW_ROOT`**（兜底可写，不再 none/不写）。
 * 解析来源唯一，采集/读取共用，杜绝"同址但错项目"（O2）与"读不到写"（F1）。
 */
export declare function resolveShadowScope(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config?: ShadowConfig): ShadowScope;
/** 采集侧与读取侧共用的**单一** workspace 解析；严禁两处各自复制推导，防漂移。 */
export declare function resolveWorkspace(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config?: ShadowConfig): string;
