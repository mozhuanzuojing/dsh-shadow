// dsh-shadow —— tools/materials-root.lib.ts：**材料面的「根 + 排除表」**（唯一一份，`adr/0111`）。
//
// 为什么收一份：`materials-ledger.ts`（出清单）与 `materials-freshness.ts`（查新鲜度）**都要**回答
// 「哪些目录是材料」。两份各写一遍的下场本仓已记过两次（`tools/comparison-points.lib.ts` 的两个正则、
// `core/util.ts:numOr` 的默认值回落）⇒ 收在这里，两侧 import。
//
// 两条都由**实测**倒推（2026-10-07），不是洁癖：
//   ① **不许有写死的默认根**。两个工具原来的默认值都是 `D:\project\dsh1\vendor\_src`，而本机
//      **`D:` 整盘已不存在**；又因为它们**都不在 `verify` 里**，这个死根被当成「当前态」摆了很多版
//      （`MATERIALS.md` §1.1 那份 24 行的表就是它的输出）⇒ 改成**缺件即拒**（ADR-0049）。
//   ② **口径 =「根 + 排除」**。只给根、不给排除，把根指到工作区会得 **14 行**，其中 **6 项不是材料**
//      （`.docs` · `.shadow` · `bin` · `node_modules` · `scripts` · `vendor`）⇒ 排除表是口径的一部分，
//      必须与根一起打印出来（否则下一个人拿到的仍是一份「看起来权威」的错清单）。
//
// ⚠ 本 lib 是 **CLI 面**：缺根时**直接 exit 2**（判据与报文都收在这一处，免两个工具各写一遍）。

/** 环境变量名（两个工具共用；`references.md` §14 的「枚举根 + 枚举时刻」判据要求它可被显式声明）。 */
export const MATERIALS_ROOT_ENV = "SHADOW_MATERIALS_ROOT";

/** 非材料目录：**全部点目录** + 下面这张表。 */
export const EXCLUDED_DIRS = new Set(["bin", "node_modules", "scripts", "vendor", "dist", "test", "tools"]);

/** 材料目录判据（枚举、口径打印、自检共用 —— 只此一份）。 */
export const isMaterialDir = (name: string): boolean => !name.startsWith(".") && !EXCLUDED_DIRS.has(name);

/** 口径行（两个工具的输出头共用同一句）。 */
export const exclusionLine = (): string =>
  `排除目录：**全部点目录** + ${[...EXCLUDED_DIRS].sort().join(" · ")}` +
  "（口径 =「根 + 排除」，缺后一半时指到工作区根会得 14 行、其中 6 项不是材料）；";

/**
 * 解析枚举根：把候选值（位置参数 / 环境变量）校验成**非空**。
 * 刻意**不提供**默认根 —— 写死的绝对路径会在换盘后**静默变死**。
 */
export const requireMaterialsRoot = (candidate: string | undefined, usage: string): string => {
  const root = (candidate ?? "").trim();
  if (root) return root;
  console.error(`✗ 缺枚举根：${usage}`);
  console.error(`  ⇒ 刻意**不提供**默认根：写死的路径会在换盘后静默变死（实测 2026-10-07 —— ` +
    `原默认根 \`D:\\project\\dsh1\\vendor\\_src\` 的 \`D:\` 盘已不存在）。`);
  console.error(`     可用环境变量 ${MATERIALS_ROOT_ENV} 显式声明。`);
  process.exit(2);
};
