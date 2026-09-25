/**
 * dsh-shadow —— tools/trusted-roots.lib.ts：「**可信根注册表**」的读取、校验与解析。
 *
 * 设计见 **`adr/0108`**（跨项目根注册）。三条写死的纪律：
 *   ① **只有人能加根** —— `addedBy` 只接受 `"human"`；**agent 不得自行写入**。
 *      理由：agent 若能自己加根，就等于可以自己把「未判定」变成「已判定」⇒ **被判者自己控制证据面**。
 *   ② **坏件不得静默**（ADR-0049）：文件存在但字段不合规 ⇒ **逐条报出问题**，且**该条不入表**。
 *      （文件**不存在** = 未注册任何根 = 默认态，**不是**错误。）
 *   ③ **唯一命中才算**：多根同时命中 ⇒ 仍**不判**（`ADR-0059`：不猜）。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export type TrustedRoot = {
  root: string;
  label: string;
  addedBy: string;
  addedAt: string;
  reason: string;
  /** 允许解析的**前缀**（如 `scripts/`）；缺省 = 整个根。**收窄优先**。 */
  scope?: string;
};

export type RootLoad = { roots: TrustedRoot[]; problems: string[] };

/** 注册表相对路径（**进版本控制、不进发布面** —— 与 `tools/*.json` 同类）。 */
export const TRUSTED_ROOTS_REL = "tools/trusted-roots.json";

const REQUIRED = ["root", "label", "addedBy", "addedAt", "reason"] as const;

/** 读并**校验**注册表。返回可用条目 + 问题清单（问题**不静默** —— 由调用方打出来）。 */
export const loadTrustedRoots = (ROOT: string): RootLoad => {
  const p = join(ROOT, TRUSTED_ROOTS_REL);
  if (!existsSync(p)) return { roots: [], problems: [] };

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(p, "utf8"));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { roots: [], problems: [`\`${TRUSTED_ROOTS_REL}\` 读不动 / 不是合法 JSON：${msg}`] };
  }

  const arr = Array.isArray(data) ? data : (data as { roots?: unknown } | null)?.roots;
  if (!Array.isArray(arr)) {
    return { roots: [], problems: [`\`${TRUSTED_ROOTS_REL}\` 顶层应为数组，或形如 \`{ "roots": [...] }\``] };
  }

  const roots: TrustedRoot[] = [];
  const problems: string[] = [];
  arr.forEach((raw: unknown, i: number) => {
    const at = `根 #${i + 1}`;
    if (!raw || typeof raw !== "object") {
      problems.push(`${at} 不是对象 ⇒ 不入表`);
      return;
    }
    const r = raw as Record<string, unknown>;
    let err = false;
    for (const k of REQUIRED) {
      if (typeof r[k] !== "string" || !(r[k] as string).trim()) {
        problems.push(`${at} 缺字段 / 为空：\`${k}\` ⇒ 不入表（每条都必须能回答「谁、何时、为什么」）`);
        err = true;
      }
    }
    // ① 授权：只接受 human
    if (r.addedBy !== "human") {
      problems.push(
        `${at}（${String(r.label ?? "?")}）\`addedBy\` = ${JSON.stringify(r.addedBy)} ⇒ **只接受 \`human\`**` +
          `（adr/0108 §2.3：agent 不得自行加根，否则被判者自己控制证据面）⇒ 不入表`,
      );
      err = true;
    }
    // 通配 scope 等于没注册
    if (typeof r.scope === "string" && r.scope.trim() === "*") {
      problems.push(`${at}（${String(r.label ?? "?")}）\`scope: "*"\` ⇒ 等于没注册 ⇒ 不入表`);
      err = true;
    }
    if (err) return;
    roots.push({
      root: String(r.root),
      label: String(r.label),
      addedBy: String(r.addedBy),
      addedAt: String(r.addedAt),
      reason: String(r.reason),
      ...(typeof r.scope === "string" && r.scope.trim() ? { scope: String(r.scope) } : {}),
    });
  });

  return { roots, problems };
};

export type RootResolution = {
  /** 唯一命中时给出绝对路径；否则 null。 */
  hit: string | null;
  /** 多根同时命中 ⇒ 点名（**不猜**）。 */
  ambiguous: string[];
  /** 根不可用（不存在 / 不是目录）⇒ 点名（回落「未判定」，**不得**伪装成「找不到」）。 */
  unavailable: string[];
};

/**
 * 在**已注册根**上解析一个目标。规则（`adr/0108` §2.2）：
 * - `scope` 存在且目标不在其前缀内 ⇒ **该根不参与**（收窄优先）；
 * - 根不可用 ⇒ 记 `unavailable`（**点名根**）；
 * - **唯一**命中 ⇒ 返回它；**多根命中** ⇒ `ambiguous`（**仍不判**）。
 */
export const resolveAgainstTrustedRoots = (
  target: string,
  roots: TrustedRoot[],
  ROOT: string,
): RootResolution => {
  const hits: { path: string; label: string }[] = [];
  const unavailable: string[] = [];

  for (const r of roots) {
    if (r.scope && !target.startsWith(r.scope)) continue;
    const base = isAbsolute(r.root) ? r.root : resolve(ROOT, r.root);
    let isDir = false;
    try {
      isDir = statSync(base).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      unavailable.push(r.label);
      continue;
    }
    const p = join(base, target);
    if (existsSync(p)) hits.push({ path: p, label: r.label });
  }

  if (hits.length === 1) return { hit: hits[0].path, ambiguous: [], unavailable };
  if (hits.length > 1) return { hit: null, ambiguous: hits.map((h) => h.label), unavailable };
  return { hit: null, ambiguous: [], unavailable };
};
