#!/usr/bin/env node
// dsh-shadow —— tools/audit-corpus.lib.ts：**语料遍历**的共用一份（v1.15.87 立）。
//
// 为什么单独一个文件：这段 walker 此前在 `audit-wiring.ts` 与 `audit-drift.ts` 里**各有一份**，
// 于是「哪些目录不属于这个仓库」这条判断也**各写一遍** —— 而 v1.15.86 正好撞上了它的代价：
// 把 `_research/` 里 19 个 `.mjs` 改名成 `.ts` 之后，它们第一次进了两个工具的语料，棘轮**如实变红**；
// 修的时候必须**同时改两处**，漏一处就是一处静默的不一致（本仓已有两次同族教训：
// `tools/comparison-points.lib.ts`、`core/util.ts` 的 `numOr`）。
//
// **本集问的问题**：「哪些目录**不属于这个仓库**」= 版本库内部（`.git`）+ 本机草稿（`_research`，已 `.gitignore`）。
// ⚠ 它与 `tools/audit-layers.lib.ts` 的 `SOURCE_EXCLUDED_DIRS` **不是同一个问题**，两份**刻意不同**：
//   那个问「哪些**不是源码**」（还要排 `dist` / `node_modules` / `docs` / `agent-presets` / `.docs`），
//   而 `audit-wiring` / `audit-drift` **故意**把 `dist` / `node_modules` 也走进来再分类
//   （它们的 `isTestPath` 只认 `test/`，就是为此把这两处的 `.d.ts` 显式排除的）。
//   ⇒ `SOURCE_EXCLUDED_DIRS` 由本文件的 `NON_REPO_DIRS` **派生**，`_research` / `.git` 只有本文件这一处。
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 不属于**仓库**的目录名（递归时跳过）。
 * · `.git` —— 版本库内部。**必须排除**：松散对象被打包会让目录数骤降而语料一个字没变
 *   （v1.15.55 的假阳性：`count: 0 / in-pack: 4025` 之后 dirs 428 → 185）。
 * · `_research` —— 本机草稿目录（已进 `.gitignore`）。**它不是产品语料**：v1.15.86 的由来。
 * ⚠ **边界**：按**名字**排除。若哪天 `_research/` 被 `git add`（`git ls-files _research` 非空），
 *   必须把这里删掉 —— 那时它就是产品语料，不再豁免。
 */
export const NON_REPO_DIRS = [".git", "_research"];

/** 递归收集文件名（`match` 只吃**文件名**，不吃路径）与目录数（V7 语料健康用）。 */
export const walkTree = (
  root: string,
  opts: { match: (name: string) => boolean; skip?: Iterable<string> },
): { files: string[]; dirCount: number } => {
  const skip = new Set(opts.skip ?? NON_REPO_DIRS);
  const files: string[] = [];
  let dirCount = 0;
  const walk = (d: string) => {
    let es: any[];
    try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (skip.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { dirCount++; walk(p); }
      else if (opts.match(e.name)) files.push(p);
    }
  };
  walk(root);
  return { files, dirCount };
};