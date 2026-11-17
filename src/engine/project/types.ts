/**
 * v2 engine/project —— 投影核（Phase B 最小实现）类型。
 *
 * 本体见 ADR-0024《Observer 为中心的投影核心（路 B）》：
 *   整全（Observer 视角 + 盲区）→ 面（Projection）→ 点（Atom）。
 * 本模块只做纯派生：无 I/O、无时钟、无随机。
 */

/** 观察者透镜：谁在看、关注什么、忽略什么、边界在哪（来自 soul 或默认）。 */
export interface ObserverLens {
  id: string;
  whatMatters: string[];
  whatToIgnore: string[];
  boundaries: string[];
}

/** 一个被取景/排除的记忆点。 */
export interface ProjectionPoint {
  rel: string;
  entry: string;
  at: string;
}

/** 投影结果：面 + 纳入/排除的点 + 整全盲区 + 视角声明。 */
export interface Projection {
  lensId: string;
  face: string;
  included: ProjectionPoint[];
  excluded: ProjectionPoint[];
  blindSpots: string[];
  distortionNote: string;
}

export interface ProjectOptions {
  /** 组装面时按主题收窄（可选）。 */
  topic?: string;
  /** Episode 聚合间隔（分钟），默认 60。 */
  gapMinutes?: number;
}
