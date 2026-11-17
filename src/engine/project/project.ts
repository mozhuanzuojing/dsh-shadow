/**
 * v2 engine/project —— 最小投影核（Phase B）。
 *
 * 点（ParsedAtom）→ 按 Observer lens 取景 → 组装「面」（Episode / Task / Decision / 材料）→ 声明整全盲区。
 * 只派生、不改写；视野外/零命中/整全边界全部显式披露（承接「缺件不静默」）。
 * 默认读路径（engine/read/route.ts）暂未接入本模块——本刀只立核，不改现行为。
 */

import type { ParsedAtom } from "../../contract/types.js";
import { atOf } from "../../contract/time.js";
import { deriveDecisions, deriveEpisodes, deriveTasks, renderDecisions, renderEpisodes, renderTasks } from "../../domain/views.js";
import { inLens } from "./lens.js";
import { composeDistortion } from "./distortion.js";
import type { ObserverLens, Projection, ProjectionPoint, ProjectOptions } from "./types.js";

const pointOf = (p: ParsedAtom): ProjectionPoint => ({ rel: p.rel, entry: p.entry, at: atOf(p.date, p.time) });

/**
 * 最小投影核（纯函数，无 I/O、无时钟、无随机）。
 * 返回「面 + 纳入/排除点 + 盲区 + 视角声明」，不含任何 I/O 副作用。
 */
export const project = (atoms: ParsedAtom[], lens: ObserverLens, opts: ProjectOptions = {}): Projection => {
  const gap = Number(opts.gapMinutes);
  const gapMinutes = Number.isFinite(gap) ? gap : 60;

  const includedAtoms: ParsedAtom[] = [];
  const included: ProjectionPoint[] = [];
  const excluded: ProjectionPoint[] = [];
  for (const p of atoms) {
    if (inLens(p.entry, lens).included) {
      includedAtoms.push(p);
      included.push(pointOf(p));
    } else {
      excluded.push(pointOf(p));
    }
  }

  // 「面」= 取景后把点组装成这件事的多个侧面：Episode（时间线）/ Task（生命周期）/ Decision（决策链）/ 材料。
  const episodes = deriveEpisodes(includedAtoms, gapMinutes);
  const tasks = deriveTasks(includedAtoms);
  const decisions = deriveDecisions(includedAtoms, { topic: opts.topic });
  const materials = [...new Set(includedAtoms.flatMap((a) => a.materials))].slice(0, 20);
  const sections: string[] = [];
  if (episodes.length) sections.push(renderEpisodes(episodes, opts.topic));
  if (tasks.length) sections.push(renderTasks(tasks, opts.topic));
  if (decisions.count) sections.push(renderDecisions(decisions));
  if (materials.length) sections.push(`## 背景/材料\n${materials.map((m) => `- ${m}`).join("\n")}`);
  const body = sections.join("\n\n") || "（本次视角内没有可组装成面的点）";

  const { blindSpots, note } = composeDistortion({ lens, included, excluded, total: atoms.length });
  const face = `# 面（Projection · ${lens.id}）\n\n${body}\n\n${note}`;
  return { lensId: lens.id, face, included, excluded, blindSpots, distortionNote: note };
};
