// dsh-shadow —— 投影模式契约不变量（架构加深 P7）。
// 只被测试引用；运行时插件**不得** import presets/ 或本文件所在平面去读 YAML。
// 本文件放在 test/fixtures，层审计排除 test/ ⇒ 插件源码图不碰它。
//
// 改这里 → preset-projection 与（若有）插件自述测试同红同绿。

/** GUI 卡片约 4 行可见窗口（≈90 字）内必须出现的锚点。 */
export const DESCRIPTION_FRONT_WINDOW = 90;
export const DESCRIPTION_MUST_INCLUDE = "Agent Teams";

/** persona 必须携带的 0.1.7 `team:policy` 执行口径锚点（六个）。 */
export const PERSONA_TEAM_POLICY_ANCHORS = [
  "显式要求",
  "写作用域必须互不重叠",
  "blocked_by",
  "list → get → claim",
  "任务就绪不会",
  "FS_STALE_VERSION",
] as const;

/** 预设行 id 前缀：不得出现（Teams 是唯一委派机制）。 */
export const FORBIDDEN_DELEGATION_ID_PREFIX = "tool-subagent";
export const FORBIDDEN_DELEGATION_IDS = ["tool-agent-team"] as const;

/**
 * persona 必须携带的「宿主原生能力面」锚点（v1.21.5）。
 *
 * 意图：真实浏览器 / 桌面操控要用 **DSH 第一方原生面**，不是第三方 harness。
 * ⚠ 这两个锚点与**当前挂载的 provider** 绑定（浏览器 = chrome-devtools-mcp，桌面 = cua-driver-native）——
 * 换 provider 时本数组与 persona 文本**要一起改**，这正是「上游/配置漂移 → 测试红 → 人裁决」的用意。
 */
export const PERSONA_CAPABILITY_ANCHORS = [
  "宿主原生",
  "chrome-devtools-mcp",
  "cua_driver_native__",
  "不接管已激活会话",
  "browser-harness",
] as const;

/** 插件对外工具名（与 host-probe / 契约面一致）。 */
export const SHADOW_TOOL_NAMES = ["read_shadow", "recall_shadow", "shadow_query"] as const;
