// dsh-shadow —— tools/contract-surface.lib.ts：**契约面枚举**的判据（唯一一份实现）。
//
// 为什么收在这里：`adr/0086` 的两族契约 —— `tool-schema-v1`（参数名）与 `config-keys-v1`（配置键）——
// 一直是本仓**唯一没有门**的两个面（README 的受保护契约面里写着「参数名无人枚举」「没有一处枚举键名」）
// ⇒ 删参数 / 删键**不会有任何东西变红**。门在 `tools/contract-surface.selftest.ts`，判据在这里。
//
// 语义（与契约表的 `allowed` / `forbidden changes` 对齐）：
//   · allowed   = **新增**（加参数 / 加键是加法）⇒ 只报告，不判失败
//   · forbidden = **改名 / 删除** ⇒ 冻结清单里的名字不在实际清单里 ⇒ 红（并点名缺哪一个）

export type SurfaceDiff = { missing: string[]; added: string[] };

/** 冻结清单 vs 实际清单的差：`missing` = 被删/改名（禁），`added` = 新增（允许）。 */
export function diffSurface(frozen: readonly string[], actual: readonly string[]): SurfaceDiff {
  const f = new Set(frozen);
  const a = new Set(actual);
  return {
    missing: [...f].filter((k) => !a.has(k)).sort(),
    added: [...a].filter((k) => !f.has(k)).sort(),
  };
}

/**
 * 从 `core/types.ts` 的源文本抽 `export interface ShadowConfig` 的**顶层**键。
 *
 * 为什么不从运行时取：`ShadowConfig` 是**类型**，`tsc` 之后运行时不存在（类型被抹掉）⇒
 * 只能读源码。**必须跳过嵌套对象里的键**（`summary?: { enabled?: … }` 里的 `enabled` 不是顶层键），
 * 否则「19 个顶层键」这句话会随嵌套层增减而漂。做法：按**大括号深度**只取深度 0 的行首 `  name?:`。
 *
 * 抽不到（锚点消失）时返回 `[]` —— 由调用方按「**结构缺失不是通过**」（ADR-0049）判红，不在这里静默。
 */
export function extractConfigKeys(src: string): string[] {
  const norm = src.replace(/\r\n/g, "\n");
  const head = "export interface ShadowConfig {";
  const at = norm.indexOf(head);
  if (at < 0) return [];
  const body = norm.slice(at + head.length);
  const end = body.indexOf("\n}");
  const block = end >= 0 ? body.slice(0, end) : body;
  const keys: string[] = [];
  let depth = 0;
  for (const line of block.split("\n")) {
    if (depth === 0) {
      const m = /^ {2}([A-Za-z_][A-Za-z0-9_]*)\s*\??:/.exec(line);
      if (m) keys.push(m[1]);
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth < 0) break;
  }
  return keys;
}

/** 从工具 schema 的 `parameters` 抽**第一层**参数名（顺序 = 声明序）。 */
export function extractParamNames(parameters: unknown): string[] {
  const props = (parameters as { properties?: Record<string, unknown> } | undefined)?.properties;
  return props && typeof props === "object" ? Object.keys(props) : [];
}
