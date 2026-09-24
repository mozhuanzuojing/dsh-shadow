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
