// dsh-shadow —— core/scope.ts：shadow 归属 scope 解析（采集/读取共用同一推导，防漂移 F1/O2）。
// 从 index.ts 迁移；类型见 core/types.ts。
import os from "node:os";
import path from "node:path";
import { OBSERVER_GLOBAL_ROOT } from "./paths.js";
import type { AgentLike, ShadowConfig, ShadowScope } from "./types.js";

/** 空串视为无效：避免 `"" ?? fallback` 返回空串导致 workspace 解析短路（F1）。 */
export function firstNonEmpty(...values: unknown[]): string | undefined {
  return values.find((v) => typeof v === "string" && (v as string).trim().length > 0) as string | undefined;
}

/** 全局兜底 shadow 根：仅当既无显式 shadowRoot/projectRoot、又解析不出 session cwd 时使用（保证"可写"，而非"不写"）。
 *  命名"~/.dsh-observer/shadow"：Global shadow 是 **Observer Continuity Shadow**（observer 层），不是 Workspace Memory。 */
export const DEFAULT_SHADOW_ROOT = path.join(os.homedir(), OBSERVER_GLOBAL_ROOT, "shadow");

/**
 * 解析 shadow 归属 scope：显式 project scope（config shadowRoot / projectRoot）**最高优先**；
 * 其次 session cwd 推导（`agent.session.header.cwd` → session id 的 cwd 缓存）；都无 → **fallback 到 `DEFAULT_SHADOW_ROOT`**（兜底可写，不再 none/不写）。
 * 解析来源唯一，采集/读取共用，杜绝"同址但错项目"（O2）与"读不到写"（F1）。
 */
export function resolveShadowScope(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config: ShadowConfig = {}): ShadowScope {
  const explicit = firstNonEmpty(config.shadowRoot, config.projectRoot);
  if (explicit) return { scope: "explicit", ws: explicit };
  // 不再候选 `agent.session.cwd`：宿主 Session 从来没有该字段（只有 `header.cwd`），该候选恒 undefined。
  const implicit = firstNonEmpty(
    agent?.session?.header?.cwd,
    agent?.id ? cwdBySession.get(String(agent.id)) : undefined,
  );
  if (implicit) return { scope: "implicit", ws: implicit };
  return { scope: "fallback", ws: DEFAULT_SHADOW_ROOT };
}

/** 采集侧与读取侧共用的**单一** workspace 解析；严禁两处各自复制推导，防漂移。 */
export function resolveWorkspace(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config: ShadowConfig = {}): string {
  return resolveShadowScope(agent, cwdBySession, config).ws;
}

/**
 * **兜底根场景的可见信号（`T6` ②）**：`resolveShadowScope` 落到 `DEFAULT_SHADOW_ROOT`（**既无显式 root、也解析不出 session cwd**）⇒
 * 该次写入**未受会话授权**（`adr/0074` 的已知空白）。按 `ADR-0049`「缺件不静默」，这件事**必须可见**。
 *
 * 形态对齐 `core/writer/core.ts` 的 `lastFlushError`（置字段 + 由写侧 `console.error` + 读侧提示三件套）。
 * 这里收的是**结构化泛型**而不是 `import` 那个 `WriterCore` 类型：`core/writer/core.ts` 已依赖本文件的判据，
 * 反向 import 会造出 `scope ↔ writer/core` 的循环依赖（判据收一处，依赖方向也要收一处）。
 * 返回 `true` = 确实置了信号（调用方据此打日志）；**非 fallback 一律不写**（否则告警变噪声，会被习惯性忽略）。
 */
export const noteFallbackScope = <T extends { lastScopeNotice?: { at: number; note: string } }>(
  core: T,
  scope: ShadowScope,
): boolean => {
  if (scope.scope !== "fallback") return false;
  core.lastScopeNotice = {
    at: Date.now(),
    note: `写入落在**兜底根** \`${scope.ws}\`（既无显式 shadowRoot/projectRoot，也解析不出 session cwd）：**本次写入未受会话授权** —— 它不受任何会话工作区的沙箱围栏保护，可能被围栏拒绝，也可能写进别的会话读不到的地方`,
  };
  return true;
};
