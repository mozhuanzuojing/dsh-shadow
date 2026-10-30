/**
 * v2 engine — 技能卡物化：把任务卡生成 `.shadow/indexes/skills/<slug>/SKILL.md`。
 *
 * 硬边界（同 engine/derived.ts）：
 *  1. 只写 `.shadow/indexes/**`，绝不写 atoms；
 *  2. 确定性（内容只由 atoms 决定），内容不变不写（幂等）；
 *  3. 失败只留 Signal（`index.skills`），不阻塞读；
 *  4. 有界（本轮回最多写 N 个技能卡）。
 */

import type { ParsedAtom } from "../contract/types.js";
import { buildLessonCards } from "../domain/lessons.js";
import { buildSkillDocs } from "../domain/skills.js";
import type { FsPort } from "../store/fs.js";
import type { SignalStore } from "./signals.js";

export interface SkillsDeps {
  fs: FsPort;
  ws: string;
  signals: SignalStore;
}

export interface SkillsWriteResult {
  total: number;
  written: number;
  unchanged: number;
  failed: number;
  firstError?: { rel: string; code: string; message: string };
  docs: { slug: string; name: string; rel: string }[];
  budget: number;
}

export const DEFAULT_SKILL_BUDGET = 24;

/** 物化技能卡（幂等、有界、失败不抛）。 */
export const materializeSkills = async (deps: SkillsDeps, atoms: ParsedAtom[], budget = DEFAULT_SKILL_BUDGET): Promise<SkillsWriteResult> => {
  const all = buildSkillDocs(buildLessonCards(atoms));
  const n = Math.max(0, Math.min(500, Math.floor(Number(budget) || DEFAULT_SKILL_BUDGET)));
  const docs = all.slice(0, n);
  let written = 0;
  let unchanged = 0;
  let failed = 0;
  let firstError: SkillsWriteResult["firstError"];
  for (const d of docs) {
    const abs = `${deps.ws.replace(/[\\/]+$/, "")}/.shadow/${d.rel}`;
    try {
      const existing = await deps.fs.readText(abs);
      if (existing.ok && existing.value === d.markdown) {
        unchanged += 1;
        continue;
      }
      const w = await deps.fs.writeText(abs, d.markdown);
      if (w.ok) {
        written += 1;
        continue;
      }
      failed += 1;
      firstError ??= { rel: d.rel, code: w.error.code, message: w.error.message };
    } catch (e) {
      failed += 1;
      firstError ??= { rel: d.rel, code: "INTERNAL", message: e instanceof Error ? e.message : String(e) };
    }
  }
  if (failed) {
    deps.signals.note(
      "index.skills",
      firstError?.code ?? "IO",
      `技能卡写入失败 ${failed}/${docs.length} 个（首个：${firstError?.rel ?? "?"}：${firstError?.message ?? "未给出原因"}）`,
      "本次读不受影响；磁盘上的技能卡可能陈旧；atoms 未被修改。",
    );
  } else {
    deps.signals.clear("index.skills");
  }
  return { total: all.length, written, unchanged, failed, firstError, docs: docs.map((d) => ({ slug: d.slug, name: d.name, rel: d.rel })), budget: n };
};

/** 索引里的技能段（列出可审 SKILL.md 指针；截断自报）。 */
export const renderSkillsSection = (r: SkillsWriteResult): string => {
  const lines = ["", "## 技能（可复用流程 · 可审 · 数据非指令）"];
  if (!r.docs.length) {
    lines.push("（暂无技能卡；做过的任务收口后会自动生成）");
    return lines.join("\n");
  }
  for (const d of r.docs) lines.push(`- ${d.name} → \`${d.rel}\``);
  if (r.total > r.docs.length) lines.push("", `> 未展开：技能卡 ${r.total - r.docs.length} 个（本轮上限 ${r.budget}）；按任务卡顺序取前 N，属确定性截断。`);
  lines.push("", "> 技能卡由历史任务卡派生物化到 `indexes/skills/`；可复制到项目的 `.agents/skills/` 供复用；删除 `indexes/` 可整份重建。");
  return lines.join("\n");
};
