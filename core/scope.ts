// dsh-shadow —— core/scope.ts：shadow 归属 scope 解析（采集/读取共用同一推导，防漂移 F1/O2）。
// 从 index.ts 迁移；类型见 core/types.ts。
import type { AgentLike, ShadowConfig, ShadowScope } from "./types.js";

/** 空串视为无效：避免 `"" ?? fallback` 返回空串导致 workspace 解析短路（F1）。 */
export function firstNonEmpty(...values: unknown[]): string | undefined {
  return values.find((v) => typeof v === "string" && (v as string).trim().length > 0) as string | undefined;
}

/**
 * 解析 shadow 归属 scope：显式 project scope（config shadowRoot / projectRoot）**最高优先**；
 * 其次 session cwd 推导（含 session id → cwd 缓存）；否则 none。解析来源唯一，采集/读取共用，
 * 杜绝"同址但错项目"（O2）与"读不到写"（F1）。
 */
export function resolveShadowScope(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config: ShadowConfig = {}): ShadowScope {
  const explicit = firstNonEmpty(config.shadowRoot, config.projectRoot);
  if (explicit) return { scope: "explicit", ws: explicit };
  const implicit = firstNonEmpty(
    agent?.session?.header?.cwd,
    agent?.session?.cwd,
    agent?.id ? cwdBySession.get(String(agent.id)) : undefined,
  );
  return implicit ? { scope: "implicit", ws: implicit } : { scope: "none", ws: "" };
}

/** 采集侧与读取侧共用的**单一** workspace 解析；严禁两处各自复制推导，防漂移。 */
export function resolveWorkspace(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config: ShadowConfig = {}): string {
  return resolveShadowScope(agent, cwdBySession, config).ws;
}
