/**
 * v2 domain —— Observer 透镜的最小公共形状（ADR-0027/0028 收敛）。
 *
 * 「看什么 / 不看什么」是跨 projection（engine/project）与 scope（domain）共用的名词；
 * 收敛到一处避免两套定义漂移。边界/身份等扩展由各自上层类型补充。
 */

export interface Lens {
  whatMatters: string[];
  whatToIgnore: string[];
}
