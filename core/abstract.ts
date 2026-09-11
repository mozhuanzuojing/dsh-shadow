// dsh-shadow —— core/abstract.ts：**目录级 L0/L1 sidecar**（ADR-0065 吸收 OpenViking，D6 落地）。
//
// 由来（`adr/0065-absorbing-openviking.md` 的「可吸收三条」）：
//   ① 目录级（日期级）abstract + overview sidecar —— 今天判断相关**必须先读记忆文件**、
//      只能靠全局 `_index.md`；OpenViking 是**每层目录都带 L0/L1**（256 / 4000 字符上限）。
//   ② **上层由下层确定性派生**（它的 L0 是从 L1 正文里抽的）—— 消除层间漂移。
//   ③ 派生件**自报覆盖率与待处理变更**（`freshness`：子项覆盖数 + `pending_child_changes`）。
//
// 三条的层次：`记忆文件（source）→ L1 overview → L0 abstract →（可选）_index.md 的目录摘要段`。
// **每一层只从它下面那一层派生** —— 这是 ② 的全部内容，也是本模块的**唯一纪律**。
//
// 三条硬边界（写在最前，因为越界会污染 source）：
//   1. **派生件不是 source**（ADR-0003）：sidecar 可整份重建，删掉不丢任何事实。
//   2. **所有输入都必须显式传入** —— 本模块**不读时钟、不读随机数、不读 fs**。
//      这是 ② 可验证的前提：同一批输入必然产出**逐字节相同**的文本（测试 ① 锁住）。
//   3. **命名必须 `_` 前缀** —— `persistence/files.ts` 的 `listMemories` 按 `_` 前缀把
//      「派生物」与「记忆」分开，故 sidecar 不会被当成一条记忆（测试 ⑤ 锁住）。
import { SHADOW_ROOT } from "./paths.js";

/** L0 上限（OpenViking 口径：256 字符）。 */
export const L0_MAX = 256;
/** L1 上限（OpenViking 口径：4000 字符）。 */
export const L1_MAX = 4000;
/** 目录级 sidecar 的文件名（`_` 前缀 = 派生物，见文件头边界 3）。 */
export const SIDECAR_NAME = "_abstract.md";

/** 一条记忆的**最小可派生面**（只取派生 L1 真正需要的字段）。 */
export interface MemoryFace {
  name: string;
  time: string;
  entry: string;
  topics: string[];
}

/** sidecar 的自报覆盖率（对应 OpenViking 的 `freshness`）。 */
export interface SidecarCoverage {
  /** 本目录下被纳入派生的记忆条数。 */
  covered: number;
  /** **未**纳入派生的记忆条数（= 待处理变更）。正常应为 0；非 0 说明 sidecar 落后于源头。 */
  pending: number;
}

/**
 * L1 overview：**从记忆面确定性派生**的目录级概览。
 *
 * 只写**可复核**的事实（条数 / 时间跨度 / 入口与主题清单），**不写判断、不调 LLM**：
 * 判断属读侧（ADR-0042/0043 的「LLM 不能制造关系」），而这里只是把已存在的事实换个粒度呈现。
 * 输入按 `name` 排序后再派生 ⇒ 与 `listDir` 的返回顺序无关（避免「同内容不同文本」）。
 */
export const deriveL1 = (faces: MemoryFace[]): string => {
  if (!faces.length) return "";
  // **排序在这里做，且只在这里做**：caller 的 listDir 顺序不该影响派生物内容。
  const sorted = [...faces].sort((a, b) => a.name.localeCompare(b.name));
  const times = sorted.map((f) => f.time).filter(Boolean).sort();
  const span = times.length ? `${times[0]}–${times[times.length - 1]}` : "—";
  const topics = [...new Set(sorted.flatMap((f) => f.topics))].sort();
  const lines = ["## 概览", `- 记忆 ${sorted.length} 条 · 时刻 ${span}`, `- 主题 ${topics.length} 个：${topics.join("、") || "—"}`, "### 入口"];
  for (const f of sorted) lines.push(`- [${f.time || "------"}] ${f.entry || "(无入口)"} · ${f.name}`);
  return cap(lines.join("\n"), L1_MAX);
};

/**
 * L0 abstract：**从 L1 正文里抽**（不是从记忆文件里另抽一遍）。
 *
 * 这一条是 D6 的 ② 的全部要害：若 L0 也从记忆文件派生，就会出现
 * 「同一条记忆的两层说法不一致」—— 而两层各自看都「没错」，**没有判据能发现**。
 * 从 L1 抽 ⇒ 层间不一致在**构造上**不可能（L0 是 L1 的函数）。
 * 抽法**确定性**：取 L1 的 `## 概览` 之后的正文首段（OpenViking 的「H1 之后、首个 `##` 之前」同法），
 * 剥掉 markdown 记号，按空白折叠，截到 `L0_MAX`。
 */
export const deriveL0 = (l1: string): string => {
  const text = String(l1 || "");
  if (!text) return "";
  const body = text.split("\n").filter((l) => l.trim() && !l.startsWith("#")).join(" ").replace(/\s+/g, " ").trim();
  return cap(body, L0_MAX);
};

/** 截断到 `max` 字符；**只在真的超长时**加省略号（保证 `cap(x) === x` 当 x 未超长）。 */
const cap = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + "…");

/**
 * 渲染 sidecar 全文。
 *
 * **格式故意定成可逆向解析**：`parseSidecar` 要能拿回 `{ l0, l1, coverage }` 以便棘轮
 * 逐项对账（不靠模糊匹配）。`covered` / `pending` 写在**显式行**里，不用散文。
 */
export const renderSidecar = (date: string, l1: string, coverage: SidecarCoverage): string => {
  const l0 = deriveL0(l1);
  return [
    `# ${date} 目录摘要（L0/L1 sidecar）`,
    "",
    "> 本文件是**派生物**（ADR-0003 / ADR-0065），可整份重建；**不是**记忆、不参与 `listMemories`。",
    "> L0 由 L1 **确定性抽取**（层间不会漂移）；L1 由本目录下的记忆**确定性派生**。",
    "",
    "## L0",
    l0 || "（无）",
    "",
    "## L1",
    l1 || "（无）",
    "",
    "## 覆盖率",
    `- covered: ${coverage.covered}`,
    `- pending: ${coverage.pending}`,
    "",
  ].join("\n");
};

/** 从 sidecar 全文取回三段（供棘轮对账）。缺段返回 `undefined`（不抛、不编造）。 */
export const parseSidecar = (text: string): { l0: string; l1: string; coverage: SidecarCoverage } | undefined => {
  const s = String(text || "");
  if (!s.trim()) return undefined;
  const between = (from: string, to?: string): string | undefined => {
    const i = s.indexOf(from);
    if (i < 0) return undefined;
    const start = i + from.length;
    const j = to ? s.indexOf(to, start) : -1;
    return s.slice(start, j < 0 ? undefined : j).trim();
  };
  const l0 = between("## L0", "## L1");
  const l1 = between("## L1", "## 覆盖率");
  const cov = between("## 覆盖率");
  if (l0 === undefined || l1 === undefined || cov === undefined) return undefined;
  const num = (k: string): number | undefined => {
    const m = cov.match(new RegExp(`-\\s*${k}:\\s*(\\d+)`));
    return m ? Number(m[1]) : undefined;
  };
  const covered = num("covered");
  const pending = num("pending");
  if (covered === undefined || pending === undefined) return undefined;
  return { l0: l0 === "（无）" ? "" : l0, l1: l1 === "（无）" ? "" : l1, coverage: { covered, pending } };
};

/**
 * **漂移判据**：把 sidecar 与「当前源」对账，返回不一致的原因清单（空 = 一致）。
 *
 * 这一条对应 D6 的 ③ 与 `toolset-catalog` 的**双向棘轮**同法：
 * 棘轮要能回答「这份摘要是**基于哪几个子项**得出的」，并在源头变了而 sidecar 没跟上时**变红**。
 * 本函数是**纯函数**（拿 `faces` 与 `sidecarText` 两个入参），故棘轮测试不需要真 fs。
 */
export const sidecarDrift = (faces: MemoryFace[], sidecarText: string): string[] => {
  const parsed = parseSidecar(sidecarText);
  if (!parsed) return ["sidecar 无法解析（缺 L0 / L1 / 覆盖率 段）"];
  const errs: string[] = [];
  // ① L1 必须**逐字节**等于「由当前源重新派生」的结果 —— 这是 ②（层间不漂移）的可执行形式。
  const expectL1 = deriveL1(faces);
  if (parsed.l1 !== expectL1) errs.push("L1 与当前源重新派生的结果不一致（sidecar 落后于源头）");
  // ② L0 必须等于「由 sidecar 自己的 L1 抽取」的结果 —— 若不等，说明 L0 被单独改过（层间已漂移）。
  const expectL0 = deriveL0(parsed.l1);
  if (parsed.l0 !== expectL0) errs.push("L0 与 L1 的抽取结果不一致（L0 被单独改过 ⇒ 层间漂移）");
  // ③ 覆盖率必须自洽：covered 等于实际条数、pending 为 0。
  if (parsed.coverage.covered !== faces.length) {
    errs.push(`覆盖率自报 covered=${parsed.coverage.covered}，实际条数 ${faces.length}`);
  }
  if (parsed.coverage.pending !== 0) errs.push(`覆盖率自报 pending=${parsed.coverage.pending}（应为 0）`);
  return errs;
};

/** sidecar 的仓库相对路径（`_` 前缀 ⇒ 不进 `listMemories`）。 */
export const sidecarRel = (date: string): string => `${SHADOW_ROOT}/${date}/${SIDECAR_NAME}`;
