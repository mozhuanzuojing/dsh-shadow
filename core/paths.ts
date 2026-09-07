// dsh-shadow —— core/paths.ts：存储根常量（单一来源，避免魔法字符串散落）。
// .shadow = Observer Projection 根(workspace-local)；.dsh-shadow = Workspace World Shadow(world 层)；
// .dsh-observer = Global Observer Continuity 根。三者分层，不可混合。
export const SHADOW_ROOT = ".shadow";
export const WORKSPACE_SHADOW_ROOT = ".dsh-shadow";
export const OBSERVER_GLOBAL_ROOT = ".dsh-observer";
