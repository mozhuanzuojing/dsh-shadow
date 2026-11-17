/**
 * v2 engine/project —— distortion（整全盲区的可见化）。
 *
 * 投影永远只看得到「已采集的点」里、这个视角能看到的那些。看不到的部分必须说出来，
 * 否则就是把「面」冒充「整全」。承接 CONTRACT「缺件不静默」。
 */

import type { ObserverLens, ProjectionPoint } from "./types.js";

export interface DistortionInput {
  lens: ObserverLens;
  included: ProjectionPoint[];
  excluded: ProjectionPoint[];
  total: number;
}

/** 计算盲区列表与一句可渲染的「视角声明」。纯函数。 */
export const composeDistortion = (input: DistortionInput): { blindSpots: string[]; note: string } => {
  const { lens, included, excluded, total } = input;
  const blindSpots: string[] = [];

  if (included.length === 0) {
    blindSpots.push(
      `关注点（${lens.whatMatters.join("、") || "全部"}）在已采集的点里没有任何命中：这个视角看不到这部分。`,
    );
  }
  if (excluded.length > 0) {
    blindSpots.push(`视野外还有 ${excluded.length}/${total} 条点未纳入本次面（被忽略或不在关注点内）——面之外仍有整全。`);
  }
  // 整全不可全见：投影只覆盖已采集的点，语料之外不可知。
  blindSpots.push("投影只覆盖已采集的点；未被采集/未发生的现实不在本面内（不宣称看见整全）。");
  if (lens.boundaries.length) blindSpots.push(`观察者边界：${lens.boundaries.join("、")}。`);

  const note =
    `> 投影视角：${lens.id} · 纳入 ${included.length} 点（关注：${lens.whatMatters.join("、") || "全部"}）` +
    (lens.whatToIgnore.length ? ` · 忽略：${lens.whatToIgnore.join("、")}` : "") +
    ` · 视野外 ${excluded.length}/${total} 点。` +
    `\n> 盲区：${blindSpots.join("；")}`;

  return { blindSpots, note };
};
