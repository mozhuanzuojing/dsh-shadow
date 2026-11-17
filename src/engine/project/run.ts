/**
 * v2 engine/project —— 投影执行 seam（接线前的完整一步）。
 *
 * `runProject` = 读 soul.json → Observer lens（缺件 / 坏件**可见降级**为默认视角，绝不静默当作有灵魂）
 * → 投影。它把「I/O（仅读 soul）+ 纯投影」收在一处：接入 `engine/read/route.ts` 时只需调用本函数。
 *
 * 注意：本模块只读 soul.json，不写、不改 atoms；无时钟、无随机。
 */

import { SOUL_FILE } from "../../contract/paths.js";
import type { ParsedAtom } from "../../contract/types.js";
import type { FsPort } from "../../store/fs.js";
import { defaultLens, lensFromSoul } from "./lens.js";
import { project } from "./project.js";
import type { ObserverLens, Projection } from "./types.js";

export interface ProjectDeps {
  fs: FsPort;
  ws: string;
}

export interface ProjectRequest {
  topic?: string;
}

export interface ProjectRunResult {
  projection: Projection;
  lens: ObserverLens;
  /** 视角来源的可见说明（缺件 / 坏件降级必须能看见）。 */
  soulNote: string;
  /** 是否退回了默认视角（缺件或坏件）。 */
  degraded: boolean;
}

export const runProject = async (
  deps: ProjectDeps,
  req: ProjectRequest,
  atoms: ParsedAtom[],
): Promise<ProjectRunResult> => {
  let lens = defaultLens();
  let soulNote = "未配置 .shadow/soul/soul.json：使用默认视角（不偏向任何主题），并在盲区声明「不宣称看见整全」。";
  let degraded = true;

  const r = await deps.fs.readText(`${deps.ws}/${SOUL_FILE}`);
  if (r.ok) {
    try {
      lens = lensFromSoul(JSON.parse(r.value));
      soulNote = `视角来自 soul.json（id=${lens.id}）。`;
      degraded = false;
    } catch {
      soulNote = "soul.json 解析失败：退回默认视角（可见降级，不静默当作有灵魂）。";
    }
  } else if (r.error.code !== "NOT_FOUND") {
    soulNote = `读取 soul.json 失败（${r.error.code}）：退回默认视角（可见降级）。`;
  }

  const projection = project(atoms, lens, { topic: req.topic });
  return { projection, lens, soulNote, degraded };
};
