// dsh-shadow —— core/paths.ts：存储根常量（单一来源，避免魔法字符串散落）。
// .shadow = Observer Projection 根(workspace-local)；.dsh-shadow = Workspace World Shadow(world 层)；
// .dsh-observer = Global Observer Continuity 根。三者分层，不可混合。
//
// ADR-0106：投影空间权威布局在 `.shadow/` 下 —— atoms / roles / affaires / indexes。
export const SHADOW_ROOT = ".shadow";
export const WORKSPACE_SHADOW_ROOT = ".dsh-shadow";
export const OBSERVER_GLOBAL_ROOT = ".dsh-observer";

/** Memory Atom 目录（source；五轴在文件头）。 */
export const ATOMS_DIR = "atoms";
/** Role 卡目录（source）。 */
export const ROLES_DIR = "roles";
/** Affaire 容器卡目录（source；成员指针，正文在 atoms）。 */
export const AFFAIRES_DIR = "affaires";
/** 可重建派生索引目录。 */
export const INDEXES_DIR = "indexes";

export const atomsRel = () => `${SHADOW_ROOT}/${ATOMS_DIR}`;
export const rolesRel = () => `${SHADOW_ROOT}/${ROLES_DIR}`;
export const affairesRel = (roleId?: string) =>
  roleId ? `${SHADOW_ROOT}/${AFFAIRES_DIR}/${roleId}` : `${SHADOW_ROOT}/${AFFAIRES_DIR}`;
export const indexesRel = (...parts: string[]) =>
  [SHADOW_ROOT, INDEXES_DIR, ...parts.filter(Boolean)].join("/");

/**
 * **记忆文件判据（唯一一份实现）**：`.md`、非 `_index.md`、非 `_` 前缀。
 *
 * **为什么住在 `core/paths.ts`**（B6，判据收一处）：此前它有**两份**实现 ——
 * 生产侧 `persistence/files.ts` 的 `isMemoryFileName` 自述「唯一一份实现」，而
 * `tools/granularity.lib.ts` 的 `isMemoryName` 自述「同一口径」⇒ 同一句话在两个文件里互相矛盾。
 * 但工具侧**不能** import `persistence/files.ts`：那道门跑在 `npm run build` **之前**
 * （`verify` 的顺序），依赖 `dist/` 会让门自己先坏。
 * ⇒ 判据必须落在**零依赖**的模块上（本文件 import 数为 0，且在 `audit-layers.lib.ts` 的
 * `PURE_MODULES` 白名单里）：生产侧按 `.js` 说明符引它，工具侧按 `.ts` 说明符直接引它，
 * 两侧共用同一份**实现**而不是同一句注释。
 *
 * 边界：`.md` 且非 `_` 前缀 ⇒ `_index.md` 已被前缀规则覆盖（写全两个条件是给读者看的，不是冗余判据）。
 */
export const isMemoryFileName = (name: unknown): boolean => {
  const n = String(name ?? "");
  return n.endsWith(".md") && n !== "_index.md" && !n.startsWith("_");
};
