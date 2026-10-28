/**
 * v2 engine/read — 路由：mode 校验 → 载入 → 分派 → 预算/信封。
 *
 * 未知 mode 显式失败；lab mode 显式重定向；所有输出经同一前缀 + 信号 + 信封。
 */

import { err, ok, type Outcome } from "../../contract/outcome.js";
import { isCoreMode, isLabMode, nearestModes } from "../../contract/modes.js";
import { SOUL_FILE, TASTE_FILE } from "../../contract/paths.js";
import type { AtomMeta, ParsedAtom } from "../../contract/types.js";
import { tokenize } from "../../domain/text.js";
import { deriveDecisions, deriveTasks, renderDecisions, renderTasks } from "../../domain/views.js";
import { loadAtoms } from "../../store/atoms.js";
import { budgetText, envelope } from "./render.js";
import {
  contextView, decisionView, episodeView, indexView, knowledgeView, manifestView,
  queryLogView, queryView, recoveryView, reportView, taskView, topicView,
} from "./modes.js";
import type { ModeOutput, ReadDeps, ReadRequest, ReadResult } from "./types.js";

const RECALL_MODES = new Set(["recall", "index"]);

const normalizeMode = (req: ReadRequest): Outcome<string> => {
  const raw = String(req.mode ?? "").trim();
  if (!raw) return ok(String(req.topic ?? "").trim() ? "recall" : "index");
  if (isCoreMode(raw)) return ok(raw);
  if (isLabMode(raw)) {
    return err(
      "INVALID",
      `mode:${raw} 已移入可选的 dsh-shadow-lab；请用 shadow_lab({mode:"${raw}", input:{…}})。本版 read_shadow 只接受 10 个核心 mode。`,
      { mode: raw, movedTo: "shadow_lab" },
    );
  }
  return err(
    "INVALID",
    `未知 mode:"${raw}"。read_shadow 只接受 10 个核心 mode：${[...requireCore()].join(" / ")}；最近邻：${nearestModes(raw).join(" / ")}。`,
    { mode: raw, suggestions: nearestModes(raw) },
  );
};

const requireCore = (): readonly string[] => {
  // 避免循环依赖：静态清单与 contract/modes 保持一致由测试守。
  return ["recovery", "query", "episode", "decision", "task", "context", "knowledge", "query-log", "shadow-report", "shadow-manifest"];
};

const metaOf = (deps: ReadDeps, atoms: ParsedAtom[]): Map<string, AtomMeta> => {
  if (deps.meta) return deps.meta;
  const map = new Map<string, AtomMeta>();
  if (!deps.index) return map;
  for (const a of atoms) {
    const m = deps.index.getMeta(a.rel);
    if (m) map.set(a.rel, m);
  }
  return map;
};

const lensText = async (deps: ReadDeps, req: ReadRequest, atoms: ParsedAtom[]): Promise<string | undefined> => {
  if (req.soul) {
    const r = await deps.fs.readText(`${deps.ws}/${SOUL_FILE}`);
    if (!r.ok) return `# Soul\n\n（${r.error.code === "NOT_FOUND" ? "尚未配置 .shadow/soul/soul.json" : `读取失败：${r.error.message}`}）`;
    return `# Soul\n\n\`\`\`json\n${r.value.slice(0, 4000)}\n\`\`\``;
  }
  if (req.taste) {
    const r = await deps.fs.readText(`${deps.ws}/${TASTE_FILE}`);
    if (!r.ok) return `# Taste\n\n（${r.error.code === "NOT_FOUND" ? "尚未配置 .shadow/taste/taste.json" : `读取失败：${r.error.message}`}）`;
    return `# Taste\n\n\`\`\`json\n${r.value.slice(0, 3000)}\n\`\`\``;
  }
  if (req.experience) {
    const tasks = deriveTasks(atoms);
    return `# Experience\n\n${renderTasks(tasks, String(req.topic ?? ""))}`;
  }
  if (req.judgment) {
    const dl = deriveDecisions(atoms, { topic: String(req.topic ?? ""), entry: String(req.entry ?? "") });
    return `# Judgment\n\n${renderDecisions(dl)}`;
  }
  if (req.verifyEvidence) {
    const materials = [...new Set(atoms.flatMap((a) => a.materials))].slice(0, 20);
    if (!materials.length) return "# Evidence\n\n（没有可验证的材料路径）";
    const lines = ["# Evidence Gateway", "> 只报 verified / not_found / unavailable / unknown，不静默 fallback。", ""];
    for (const p of materials) {
      const status = deps.verify ? await deps.verify(p) : "unknown";
      lines.push(`- ${status === "validated" ? "✓ verified" : status === "stale" ? "✗ not_found" : "? unavailable"} · ${p}`);
    }
    return lines.join("\n");
  }
  return undefined;
};

export const runRead = async (deps: ReadDeps, req: ReadRequest): Promise<Outcome<ReadResult>> => {
  const modeRes = normalizeMode(req);
  if (!modeRes.ok) return modeRes;

  const loaded = await loadAtoms(deps.fs, deps.ws);
  if (!loaded.ok) {
    deps.signals.note(
      "atoms",
      loaded.error.code,
      loaded.error.message,
      "本次召回无法读取 `.shadow/atoms`：结果可能是空的，但不代表「没有记忆」；请先修复读权限/路径。",
    );
    return loaded;
  }
  deps.signals.clear("atoms");
  const atoms = loaded.value.atoms;
  deps.syncIndex?.(atoms);
  if (loaded.value.errors.length) {
    deps.signals.note(
      "atoms.partial",
      "PARTIAL_READ",
      `${loaded.value.errors.length} 个记忆文件读取失败（首个：${loaded.value.errors[0]!.rel}）`,
      "召回面比实际记忆少；坏件与空件不同，请先修复这些文件。",
    );
  }

  const mode = modeRes.value;
  const meta = metaOf(deps, atoms);
  const depsWithMeta: ReadDeps = { ...deps, meta };
  const maxChars = Math.max(256, Math.min(8000, Number(req.maxTokens ?? deps.config.recall.budget))) * 4;

  let out: ModeOutput;
  const lensRequested = !String(req.mode ?? "").trim()
    && (req.soul === true || req.taste === true || req.experience === true || req.judgment === true || req.verifyEvidence === true);
  if (lensRequested) {
    const lens = await lensText(depsWithMeta, req, atoms);
    out = lens !== undefined
      ? { body: lens, matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] }
      : topicView(depsWithMeta, atoms, req);
  } else if (mode === "index") out = await indexView(depsWithMeta, atoms);
  else if (mode === "recall") out = topicView(depsWithMeta, atoms, req);
  else if (mode === "recovery") out = await recoveryView(depsWithMeta, atoms, req);
  else if (mode === "episode") out = episodeView(depsWithMeta, atoms, req);
  else if (mode === "decision") out = decisionView(atoms, req);
  else if (mode === "task") out = taskView(atoms, req);
  else if (mode === "context") out = await contextView(depsWithMeta, atoms, req);
  else if (mode === "query") out = queryView(depsWithMeta, atoms, req);
  else if (mode === "knowledge") out = knowledgeView(atoms, req);
  else if (mode === "query-log") out = queryLogView(depsWithMeta);
  else if (mode === "shadow-report") out = reportView(depsWithMeta, atoms);
  else if (mode === "shadow-manifest") out = await manifestView(depsWithMeta, atoms);
  else out = topicView(depsWithMeta, atoms, req);

  const debug = req.debug
    ? `\n\n> debug：mode=${mode} · 原子 ${atoms.length} · tokens ${tokenize(String(req.topic ?? "")).length} · 命中 ${out.matched} · 返回 ${out.returned} · 丢弃 ${out.dropped}`
    : "";
  const body = budgetText(out.body + debug, maxChars);
  const text = envelope({
    body,
    signals: deps.signals.render(),
    matched: out.matched,
    returned: out.returned,
    dropped: out.dropped,
    droppedExamples: out.examples,
    next: out.next,
  });
  return ok({ text, mode, matched: out.matched, returned: out.returned, dropped: out.dropped });
};

export const isRecallMode = (mode: string): boolean => RECALL_MODES.has(mode);
