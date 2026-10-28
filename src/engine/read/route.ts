/**
 * v2 engine/read — 路由：mode 校验 → 载入 → 分派 → 预算/信封。
 *
 * 未知 mode 显式失败；lab mode 显式重定向；所有输出经同一前缀 + 信号 + 信封。
 */

import { err, ok, type Outcome } from "../../contract/outcome.js";
import { CORE_MODES, isCoreMode, isLabMode, nearestModes } from "../../contract/modes.js";
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
  if (raw === "recall") {
    return err("INVALID", "mode:\"recall\" 不是公开 mode；不传 mode、只传 topic 即主题召回。", { mode: raw });
  }
  if (isLabMode(raw)) {
    return err(
      "INVALID",
      `mode:${raw} 已移入可选的 dsh-shadow-lab；请用 shadow_lab({mode:"${raw}", input:{…}})。本版 read_shadow 只接受 10 个核心 mode。`,
      { mode: raw, movedTo: "shadow_lab" },
    );
  }
  return err(
    "INVALID",
    `未知 mode:"${raw}"。read_shadow 只接受 10 个核心 mode：${[...CORE_MODES].join(" / ")}；最近邻：${nearestModes(raw).join(" / ")}。`,
    { mode: raw, suggestions: nearestModes(raw) },
  );
};

const metaOf = (deps: ReadDeps, atoms: ParsedAtom[]): Map<string, AtomMeta> => {
  if (deps.meta) return deps.meta;
  if (!deps.index) return new Map();
  try {
    return deps.index.metaMap();
  } catch (e) {
    deps.signals.note("index.meta", "META_READ", `派生 meta 读取失败（${e instanceof Error ? e.message : String(e)}）`, "本次 hits/lifecycle 按空处理；atoms 仍可读。");
    return new Map();
  }
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
  const started = Date.now();
  const modeRes = normalizeMode(req);
  if (!modeRes.ok) return modeRes;

  const loaded = deps.loadAtoms ? await deps.loadAtoms() : await loadAtoms(deps.fs, deps.ws);
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
  if (!deps.loadAtoms) deps.syncIndex?.(atoms);
  if ("degraded" in loaded.value && loaded.value.degraded) {
    deps.signals.note("index", "DEGRADED", String(loaded.value.degraded), "本次从 atoms 直接读；hits/query-log/lifecycle 可能不生效。");
  } else if (loaded.value.errors.length === 0) {
    deps.signals.clear("index");
  }
  if (loaded.value.errors.length) {
    deps.signals.note(
      "atoms.partial",
      "PARTIAL_READ",
      `${loaded.value.errors.length} 个记忆文件读取失败（首个：${loaded.value.errors[0]!.rel}）`,
      "召回面比实际记忆少；坏件与空件不同，请先修复这些文件。",
    );
  } else {
    deps.signals.clear("atoms.partial");
    deps.signals.clear("index.meta");
  }

  const mode = modeRes.value;
  const meta = metaOf(deps, atoms);
  const depsWithMeta: ReadDeps = { ...deps, meta };
  const rawMax = Number(req.maxTokens ?? deps.config.recall.budget);
  const maxTokens = Number.isFinite(rawMax) ? Math.max(256, Math.min(8000, rawMax)) : deps.config.recall.budget;
  const maxChars = maxTokens * 4;
  const limit = Math.max(1, Math.min(30, Number(req.limit ?? deps.config.recall.limit) || deps.config.recall.limit));

  let out: ModeOutput;
  const lensRequested = !String(req.mode ?? "").trim()
    && (req.soul === true || req.taste === true || req.experience === true || req.judgment === true || req.verifyEvidence === true);
  if (lensRequested) {
    const lens = await lensText(depsWithMeta, req, atoms);
    out = lens !== undefined
      ? { body: lens, matched: atoms.length, returned: atoms.length, dropped: 0, examples: [] }
      : await topicView(depsWithMeta, atoms, req);
  } else if (mode === "index") out = await indexView(depsWithMeta, atoms);
  else if (mode === "recall") out = await topicView(depsWithMeta, atoms, req);
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
  else out = await topicView(depsWithMeta, atoms, req);

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
    limit,
  });
  if (deps.config.telemetry.queryLog) {
    deps.index?.recordQuery(
      mode,
      String(req.topic ?? ""),
      out.returned,
      out.matched,
      Date.now() - started,
      `${deps.clock.today()}T${deps.clock.stamp()}`,
    );
  }
  return ok({ text, mode, matched: out.matched, returned: out.returned, dropped: out.dropped });
};

export const isRecallMode = (mode: string): boolean => RECALL_MODES.has(mode);

