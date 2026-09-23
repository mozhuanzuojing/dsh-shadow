// dsh-shadow —— query/index-budget.ts：无参 read_shadow → 预算内返回 _index.md。
import { SHADOW_ROOT } from "../core/paths.js";
import { readRel } from "../persistence/files.js";
import { RECALL_PREFIX } from "../core/util.js";
import { renderIndexBudgeted } from "../retrieval/render.js";
import { scrubFinal } from "../security/scrub.js";
import type { ShadowQueryDeps } from "./types.js";
import type { AgentLike } from "../core/types.js";

export async function runIndexBudget(
  deps: ShadowQueryDeps,
  ctx: { fs: any; ws: string; flushWarn: string; agent?: AgentLike },
  maxChars: number,
): Promise<string> {
  const { fs, ws, flushWarn, agent } = ctx;
  await deps.ensureIndex(ws, agent?.session);
  const idx = await readRel(fs, ws, `${SHADOW_ROOT}/_index.md`);
  return scrubFinal(RECALL_PREFIX + (renderIndexBudgeted(idx, maxChars) || "（暂无 shadow 索引）") + flushWarn);
}
