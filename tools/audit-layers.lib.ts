// dsh-shadow —— tools/audit-layers.lib.ts：**结构门**的纯逻辑（CLI 与标定测试共用同一份）。
//
// 为什么有这个工具（T13，v1.15.41）：hl_mem 用 AST 做「分层方向」检查，本仓此前**一条结构纪律都没有可执行形态**
// ——「core/ 是纯函数」「层间不许成环」都只是散文。本文件把它们做成**可实测的判据**。
//
// 判据来自**实测**而不是来自目录名（这是本轮最重要的结论）：
//   一份「按目录分层」的草案（core 不得碰 node:fs / 不得 import persistence）在本仓**实测即为红**：
//   `core/toolset-exec.ts:18-19` 真的 import `node:fs` + `node:child_process`（它是**执行器**），
//   `core/judgment.ts` / `core/memory.ts` / `core/writer-materialize.ts` 真的 import `persistence/`。
//   ⇒ **`core/` 不是「纯函数层」，是「脊柱」**（paths/types/util 纯 + memory/writer 有副作用）。
//   故本工具只保留**实测为真**的三类判据（当前基线全绿，接入即是棘轮）：
//     ① **文件级依赖图无环**（实测当前 0 个强连通分量）；
//     ② **纯模块白名单零副作用**（`core/paths.ts` / `core/types.ts` / `core/util.ts` / `security/scrub.ts`
//        当前 import 数为 0）+ **白名单腐化自检**（路径不存在即违规）；
//     ③ **方向禁令**（当前实测 0 违规：core↛query / core↛tools / 任何层↛index.ts / 任何层↛agent-presets /
//        persistence↛query / persistence↛index.ts）。
//   **明确不判**：层间环。实测**存在**一个 `{core, evidence, persistence}` 层间环（成因见上，非文件级环）
//   ⇒ 若把它写成禁令，门**当场就是红的**，那就是**假闸门**（T13「不要造跑不起来的门」）。
//
// 纯函数：输入是 `{path, text}[]`（path 为**仓库相对 posix 路径**），输出是违规数组。不做任何 IO。
import { stripComments } from "./audit-wiring.lib.ts";

/** 收集源码时要跳过的目录（CLI 与测试共用，避免两处各写一份而漂移）。 */
export const SOURCE_EXCLUDED_DIRS = [
  "dist",
  "node_modules",
  ".git",
  ".docs",
  "agent-presets",
  "docs",
  "_research",
];

/** 声明为「纯模块」的文件：不得有**任何** import（本仓当前实测如此）。 */
export const PURE_MODULES = [
  "core/paths.ts",
  "core/types.ts",
  "core/util.ts",
  "security/scrub.ts",
];

/**
 * 方向禁令：`from` 层不得 import `to` 层。
 * 每条的 `why` 必须点名它的**判据来源**，否则后来者无法判断该改代码还是该改表。
 */
export const DIRECTION_RULES = [
  { from: "core", to: "query", why: "读路径不得被 core 依赖（ADR-0003：派生件不是 source）" },
  { from: "core", to: "tools", why: "CLI 是外层" },
  { from: "persistence", to: "query", why: "写侧不得依赖读侧" },
  { from: "query", to: "tools", why: "CLI 是外层" },
];

/** 任何层都不许 import 的层：`(root)` = `index.ts`（Cordis 适配器只许被入口加载）。 */
export const FORBIDDEN_TARGETS_EVERYWHERE = ["(root)", "agent-presets"];

/** 把相对路径解析成层名；根下直接的文件落为 `(root)`。 */
export const layerOf = (relPath: string): string => {
  const seg = relPath.split("/");
  return seg.length === 1 ? "(root)" : seg[0];
};

/** Node 内建模块名（`node:` 前缀可有可无）。 */
const BUILTINS = new Set([
  "fs",
  "path",
  "os",
  "child_process",
  "url",
  "crypto",
  "util",
  "zlib",
  "module",
  "process",
  "assert",
  "stream",
  "events",
]);

/** 归一化一个模块说明符：相对 / 内建 / 包。 */
export const classifySpecifier = (spec: string) => {
  if (spec.startsWith(".")) return "relative";
  const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
  const head = bare.split("/")[0];
  return BUILTINS.has(head) ? "builtin" : "package";
};

/**
 * 抽取模块说明符。**先剥注释**（复用 `audit-wiring.lib.ts#stripComments`，不写第二份剥离器）。
 * 已知边界：不是 AST，字符串里形如 `from "./x"` 的文本会误命中 ⇒ 本工具只做**结构线索**，
 * 命中项一律人工复核（与 `audit-wiring` 同一立场）。
 */
export const extractSpecifiers = (text: string) => {
  const masked = stripComments(text);
  const re = /(?:^|[^\w$.])(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
  const out: { spec: string; line: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    out.push({ spec: m[1], line: masked.slice(0, m.index).split("\n").length });
  }
  return out;
};

/** 相对说明符 → 仓库相对路径（`.js`→`.ts`；补 `.ts`；补 `/index.ts`）。 */
export const resolveRelative = (fromPath: string, spec: string, known: Set<string>): string | undefined => {
  const dir = fromPath.split("/").slice(0, -1).join("/");
  const segs = (dir === "" ? [] : dir.split("/")).concat(spec.split("/"));
  const stack: string[] = [];
  for (const s of segs) {
    if (s === "." || s === "") continue;
    if (s === "..") stack.pop();
    else stack.push(s);
  }
  const base = stack.join("/");
  for (const cand of [base.replace(/\.js$/, ".ts"), `${base}.ts`, `${base}/index.ts`]) {
    if (known.has(cand)) return cand;
  }
  return undefined;
};

/**
 * 建图。`files` 为 `{path, text}[]`，path 是仓库相对 posix 路径。
 * 返回 `{nodes, edges, unresolved, external}`；`external` 只记内建模块（包依赖不进门禁）。
 */
export const buildGraph = (files: { path: string; text: string }[]) => {
  const known = new Set(files.map((f) => f.path));
  const edges: { from: string; to: string; spec: string; line: number; kind: string }[] = [];
  const unresolved: { from: string; spec: string; line: number }[] = [];
  const external = new Map<string, number>();
  for (const f of files) {
    for (const { spec, line } of extractSpecifiers(f.text)) {
      const kind = classifySpecifier(spec);
      if (kind === "relative") {
        const to = resolveRelative(f.path, spec, known);
        if (to === undefined) {
          unresolved.push({ from: f.path, spec, line });
          continue;
        }
        edges.push({ from: f.path, to, spec, line, kind });
      } else if (kind === "builtin") {
        const name = spec.startsWith("node:") ? spec : `node:${spec.split("/")[0]}`;
        external.set(name, (external.get(name) ?? 0) + 1);
        edges.push({ from: f.path, to: name, spec, line, kind });
      } else {
        external.set(spec, (external.get(spec) ?? 0) + 1);
        edges.push({ from: f.path, to: `pkg:${spec}`, spec, line, kind });
      }
    }
  }
  return { nodes: [...known], edges, unresolved, external };
};

/** Tarjan 强连通分量；返回所有 >1 成员的分量（即环）。 */
export const stronglyConnected = (nodes: string[], succ: (n: string) => string[]): string[][] => {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let counter = 0;
  const go = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of succ(v)) {
      if (!index.has(w)) {
        go(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      out.push(comp);
    }
  };
  for (const n of nodes) if (!index.has(n)) go(n);
  return out.filter((c) => c.length > 1);
};

/**
 * 跑全部门禁。返回违规（每条带 `rule` / `why` / `where`）与报告用的统计。
 * `pureModules` / `directionRules` 可注入，便于标定测试用合成夹具驱动同一份判据。
 */
export const auditLayers = (
  files: { path: string; text: string }[],
  options: { pureModules?: string[]; directionRules?: typeof DIRECTION_RULES } = {},
) => {
  const pureModules = options.pureModules ?? PURE_MODULES;
  const directionRules = options.directionRules ?? DIRECTION_RULES;
  const graph = buildGraph(files);
  const known = new Set(graph.nodes);
  const violations: { rule: string; why: string; where: string }[] = [];

  // ① 文件级无环
  const fileSucc = (n: string) => graph.edges.filter((e) => e.from === n && e.kind === "relative").map((e) => e.to);
  const fileCycles = stronglyConnected(graph.nodes, fileSucc);
  for (const c of fileCycles) {
    violations.push({ rule: "文件级依赖图无环", why: "环会让初始化顺序与判据来源都变得不可推理", where: `{ ${c.join(", ")} }` });
  }

  // ② 纯模块白名单（含**腐化自检**：白名单里的路径不存在也算违规）
  for (const p of pureModules) {
    if (!known.has(p)) {
      violations.push({ rule: "纯模块白名单不得腐化", why: "白名单指向不存在的文件 ⇒ 该条判据静默失效", where: p });
      continue;
    }
    const imports = graph.edges.filter((e) => e.from === p);
    for (const e of imports) {
      violations.push({ rule: "纯模块零副作用", why: "纯模块被声明为无依赖（派生可复算的前提）", where: `${p}:${e.line} → ${e.spec}` });
    }
  }

  // ③ 方向禁令（层 → 层）+ 全局禁用目标
  // ⚠ 这里曾写成 `.map((e) => ({ from: layerOf(e.from), to: layerOf(e.to), ...e }))` —— **`...e` 在后会覆盖层名**，
  // 于是 `from` 永远是文件路径、禁令永不命中（门恒绿）。是 `audit-layers.selftest.ts` 的 ③ 当轮抓到的。
  // 现在把「层」与「边」**分成两个字段**，不再靠覆盖顺序。
  const layerEdges = graph.edges
    .filter((e) => e.kind === "relative")
    .map((e) => ({ from: layerOf(e.from), to: layerOf(e.to), edge: e }));
  for (const r of directionRules) {
    for (const x of layerEdges.filter((x) => x.from === r.from && x.to === r.to)) {
      violations.push({ rule: `${r.from} ↛ ${r.to}`, why: r.why, where: `${x.edge.from}:${x.edge.line} → ${x.edge.spec}` });
    }
  }
  for (const target of FORBIDDEN_TARGETS_EVERYWHERE) {
    for (const x of layerEdges.filter((x) => x.to === target && x.from !== target)) {
      violations.push({ rule: `任何层 ↛ ${target}`, why: `${target} 属入口/组合面，不是被依赖面`, where: `${x.edge.from}:${x.edge.line} → ${x.edge.spec}` });
    }
  }

  const layerCycles = stronglyConnected(
    [...new Set(graph.nodes.map(layerOf))],
    (l) => layerEdges.filter((e) => e.from === l && e.to !== l).map((e) => e.to),
  );
  return { violations, fileCycles, layerCycles, unresolved: graph.unresolved, external: graph.external, stats: { files: files.length, edges: graph.edges.length } };
};
