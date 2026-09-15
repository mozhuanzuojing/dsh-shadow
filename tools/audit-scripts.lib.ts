// dsh-shadow —— tools/audit-scripts.lib.ts：**脚本扩展名门**的纯判据（v1.15.87 立；CLI 与标定测试共用一份）。
//
// 规则（用户 2026-09-15 两句话定的边界）：
//   · 新脚本一律 `.ts`（`node x.ts` 直跑）；
//   · **`.js` / `.mjs` / `.cjs` 一律不许留**（`dist/` 是编译产物，除外）—— 已有的一律改名迁成 `.ts`；
//   · `.py` / `.ps1` 等**其它脚本语言允许保留**（不要求移植：判据是「复审者能不能重放」，不是扩展名）。
//
// 为什么要有门：`AGENTS.md` 这条规则是 v1.15.85 写的，而本仓的判据是
// **「凡『每次都要做一次』的动作，要么写进清单，要么配一道门；靠记性 = 迟早停」** ——
// 同一天就撞到它的代价：`v1.15.86` 一次性迁了 19 个 `.mjs`，而那 19 个文件是**手工盘点**发现的（`Get-ChildItem -Include *.mjs`）。
// 纯函数：输入是**仓库相对 posix 路径**数组，输出是违规数组。不做任何 IO。
export const SCRIPT_FORBIDDEN_EXT = [".js", ".mjs", ".cjs"];

/**
 * 扫描时跳过的目录名（**只跳目录**，不跳同名的文件）：
 *   · `.git` —— 版本库内部，不是本仓的文件；
 *   · `node_modules` —— 依赖，不是本仓的东西（里面成千上万个 `.js` 都是它们的）；
 *   · `dist` —— **tsc 产物**（本仓 195 个 `.js` 就是它）——「不保留**手写** `.js`」的口径里它是例外。
 * ⚠ 与两个审计工具的 `NON_REPO_DIRS`（`.git` / `_research`）**刻意不同**：那个问「哪些目录不属于这个仓库」，
 *   本门问「本机有没有**手写 js/mjs**」⇒ 本门**不排除 `_research/`**（本机草稿区放个 `.mjs` 也应被发现）。
 */
export const SCRIPT_SKIP_DIRS = [".git", "node_modules", "dist"];

/** 文件名是否属于被禁的脚本扩展名（**大小写不敏感**：Windows 上 `.JS` 与 `.js` 是同一类东西）。 */
export const isForbiddenScript = (name: string) =>
  SCRIPT_FORBIDDEN_EXT.some((e) => String(name).toLowerCase().endsWith(e));

/**
 * 完整判据（**唯一一处**）：给出仓库相对路径，返回应报的违规路径（保持输入顺序）。
 * 遍历侧也跳过同样的目录，但那只是**优化** —— 判据以本函数为准（标定测试直接喂合成路径）。
 */
export const findForbiddenScripts = (
  relPaths: string[],
  skipDirs: readonly string[] = SCRIPT_SKIP_DIRS,
): string[] => {
  const skip = new Set(skipDirs);
  return relPaths.filter((p) => {
    const segs = String(p).replace(/\\/g, "/").split("/").filter(Boolean);
    // 只跳**目录段**（最后一段是文件名，永不参与跳过判定）
    if (segs.slice(0, -1).some((s) => skip.has(s))) return false;
    return isForbiddenScript(segs[segs.length - 1] ?? "");
  });
};

/**
 * **零文件语料必须非零退出**（v1.15.45 踩到的同一族：漏根参数 ⇒ ROOT 取到旗标 ⇒ 0 文件 ⇒ **假全绿**）。
 * 本仓另两个 CLI 也实现了它，但**只手工验证过**（要 spawn 子进程）⇒ 这里把它做成**纯判据**，
 * 由 `audit-scripts.selftest.ts` 自动断言（0 文件 ⇒ 2；>0 ⇒ 交给扩展名判据）。
 */
export const corpusVerdict = (fileCount: number): { ok: boolean; code: number; why: string } =>
  fileCount > 0
    ? { ok: true, code: 0, why: "" }
    : { ok: false, code: 2, why: "扫描到 **0 个文件** ⇒ 根参数不对 / 目录读不到；这不是「通过」（ADR-0049）" };