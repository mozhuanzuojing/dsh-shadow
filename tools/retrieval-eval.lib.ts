// dsh-shadow —— tools/retrieval-eval.lib.ts：**确定性基准门**的纯逻辑（T14；CLI 与标定测试共用同一份）。
//
// 判据来自实测与两份对照材料（`references.md` §6.6 的 hl_mem 门禁形状）：
//   · **协议常量与代码分离**（冻结的容差/门控指标清单放 `retrieval-eval.protocol.json`，改判据=改数据并被 diff 审阅）；
//   · **先证同源、再比数值**（先逐字比 `dataset_sha256` / `protocol_sha256` / `case_count`，再比指标）；
//   · **门控指标显式列名**，不是「全部指标」；
//   · **失败信息同时给实测退化量与允许量**；
//   · **退出码用合取式**（全部条件同时成立才 0）；
//   · **基线写入拒绝覆盖** + **基线带来源档位**；
//   · **缺 slice 即失败**（策略/查询类缺一个就算失败，不是「跳过」）。
//
// **本仓特有的一条（与 hl_mem 不同，必须写下来）**：它的语料是**冻结数据集**，而本仓语料是
// **活的 `.shadow` 记忆**（每个回合都在新增）⇒ **把基线用 dataset 哈希钉死**会让门**每回合都不可比**。
// 故本模块把「可比性」做成**显式的第三种结论**：不可比 ≠ 通过、≠ 失败，而是 `comparable: false` + 原因
// （与 T14 已吸收的「分母为 0 要报『不可测』而非 0」同一条纪律）。
//
// 纯函数：不做 IO（`node:crypto` 的哈希是纯计算），不读时钟、不读随机数。
import { createHash } from "node:crypto";

/** 确定性序列化：键排序、2 空格缩进、尾换行。基准可比的前提。 */
export const stableStringify = (value: unknown): string => {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = walk((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return `${JSON.stringify(walk(value), null, 2)}\n`;
};

/** sha256 十六进制。算法名会被**逐字冻结**进基线与协议（hl_mem 的 `sha256-utf8-lf-v1` 同形）。 */
export const HASH_ALGORITHM = "sha256-utf8-lf-v1";
export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * 语料指纹。**必须与机器无关**：路径用**仓库相对 posix 路径**（绝对路径在不同机器/盘符下不同）。
 * 口径：把 `path\0content\0` 按 path 排序后拼接，再 sha256。
 */
export const datasetHash = (files: { path: string; text: string }[]) => {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const payload = sorted.map((f) => `${f.path}\u0000${f.text}\u0000`).join("");
  return { algorithm: HASH_ALGORITHM, hex: sha256Hex(payload), fileCount: sorted.length };
};

/** 门控指标的方向：`higher` 越大越好，`lower` 越小越好，`exact` 必须逐字相等。 */
export type MetricDirection = "higher" | "lower" | "exact";

// ── T11 ①：**留出集与调参集的分离**（`v1.21.28`）──────────────────────────────
//
// 由来（hl_mem 的代价，量化）：它在**同一份 400-bundle dev** 上反复调参拿到 13/13，
// 而在**独立 held-out-r5 只有 3/13**（另产生 27 条错误 edge / 3 条反例误 supersede）⇒ 整批撤回。
// 它的对策里与本仓同形的两条：**dev/held-out 同源即无效** + **报告用那份在调参期间不得被读**。
//
// 本仓语料是**活的真实记忆**（每回合都在新增）⇒ 用「时间窗切点」分离：
// 切点（协议常量 `holdout_from`）**当天及以后**的记忆算**留出集**，之前的算**调参集**。
// 默认路径 = **调参集**（`dev`）⇒ 留出集在调参期间**根本不会被读**（结构上排除，不靠自觉）。

/** 语料口径：录基线时**必须显式声明**（不许默认成某一个）。 */
export type CorpusRole = "live-workspace" | "frozen-snapshot";
export const CORPUS_ROLES: readonly CorpusRole[] = ["live-workspace", "frozen-snapshot"];

/** 评测阶段：`dev` = 调参（**排除**留出切片）；`holdout` = 报告（**只读**留出切片）。 */
export type EvalPhase = "dev" | "holdout";

/** 切点必须形如 `YYYY-MM-DD`（**判据收一处**：CLI 与标定共用）。 */
export const isDateCut = (s: unknown): boolean => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * 「这条**工作区相对**路径属于留出切片吗」——纯函数。
 *
 * 口径：路径里**第一个** `YYYY-MM-DD` 与切点比**字典序**（本仓日期目录/文件名都是 `YYYY-MM-DD`，
 * 字典序 = 时间序 —— 与 `ADR-0071` 同一处坑的同一口径）；`>= cut` ⇒ 留出。
 * **没有日期 ⇒ 算调参集**（`false`）：宁可留在 dev（不干净但诚实），也**不能**把它算进留出集
 * —— 那等于**谎报有一份可辩护的留出集**。
 */
export const isHoldoutRel = (rel: unknown, cut: unknown): boolean => {
  if (!isDateCut(cut)) return false;
  const m = String(rel ?? "").match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] >= (cut as string) : false;
};

/** 切片健康：**两侧都必须 ≥1** —— 空的留出集 = 没有留出集（而「全过」会照样绿）。 */
export const splitVerdict = (devCount: number, holdoutCount: number): { ok: boolean; reason?: string } => {
  if (devCount >= 1 && holdoutCount >= 1) return { ok: true };
  return { ok: false, reason: `切片不成立：dev=${devCount} / holdout=${holdoutCount}（两侧都须 ≥1；空的留出集不是留出集）` };
};

/** 录制基线时的口径声明校验（缺件不静默：**不许**默认成某一个）。 */
export const corpusRoleVerdict = (role: unknown): { ok: boolean; reason?: string } =>
  CORPUS_ROLES.includes(role as CorpusRole)
    ? { ok: true }
    : { ok: false, reason: `语料口径必须显式声明为 ${CORPUS_ROLES.join(" | ")}：实测 ${JSON.stringify(role)}` };

/** 阶段声明校验（CLI 只允许这两个值；未知值 ⇒ 违规而不是「当作 dev」）。 */
export const phaseVerdict = (phase: unknown): { ok: boolean; reason?: string } =>
  phase === "dev" || phase === "holdout"
    ? { ok: true }
    : { ok: false, reason: `评测阶段只能是 dev | holdout：实测 ${JSON.stringify(phase)}` };


/** 基线里每个策略允许出现的字段（**这也是「基线不得含记忆原文」白名单的一部分**）。 */
export const RESULT_FIELDS = ["recall_mean", "recall_range", "ndcg_mean", "avg_returned_mean", "noise_offtopic_mean"];

/** 顶层允许的标量字段与取值形状（白名单；任何未列出的键 ⇒ 违规）。 */
const SCALAR_FIELDS: Record<string, RegExp | "number" | "numbers"> = {
  baseline_tag: /^[A-Za-z0-9._:-]{1,64}$/,
  provenance: /^(local_dev_aggregate_only|ci_fixture)$/,
  dataset_hash_algorithm: /^sha256-utf8-lf-v1$/,
  protocol_version: /^[A-Za-z0-9._:-]{1,64}$/,
  dataset_sha256: /^[0-9a-f]{64}$/,
  protocol_sha256: /^[0-9a-f]{64}$/,
  case_count: "number",
  on_topic_count: "number",
  off_topic_count: "number",
  docs: "number",
  source_files: "number",
  k: "number",
  max_docs: "number",
  external_model_calls: "number",
  seeds: "numbers",
  // T11 ①（v1.21.28）：**口径声明**（枚举，不含路径/日期/正文 ⇒ 不破坏「只含聚合面」）。
  corpus_role: /^(live-workspace|frozen-snapshot)$/,
  eval_phase: /^(dev|holdout)$/,
};

/**
 * 自检：基线/结果 JSON **只能**是「聚合数字 + 哈希 + 枚举」，不得夹带记忆原文、路径或日期。
 *
 * 为什么需要它：T14 的第一条完成判据写着「**signin 前先确认可公开**」。与其每次都靠人肉审，
 * 不如把「可公开」变成**可机器判定的形状约束** —— 凡出现未在白名单里的键、或形状不符的字符串，一律违规。
 * **已知边界**：它判的是**形状**，不能证明「聚合数字本身不泄露语料」；后者是取舍，不是判据（见 BACKLOG T14）。
 */
export const checkAggregateOnly = (doc: unknown, where: string) => {
  const violations: { rule: string; why: string; where: string }[] = [];
  const push = (rule: string, why: string, at: string) => violations.push({ rule, why, where: at });
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    push("基线形状", "顶层必须是对象", where);
    return violations;
  }
  for (const key of Object.keys(doc as Record<string, unknown>)) {
    if (key === "metrics") continue;
    const rule = SCALAR_FIELDS[key];
    if (rule === undefined) {
      push("基线不得含未白名单字段", `字段「${key}」不在白名单里 ⇒ 可能夹带语料内容`, `${where}.${key}`);
      continue;
    }
    const value = (doc as Record<string, unknown>)[key];
    if (rule === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) push("基线字段形状", `${key} 必须是有限数字`, `${where}.${key}`);
    } else if (rule === "numbers") {
      if (!Array.isArray(value) || value.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
        push("基线字段形状", `${key} 必须是数字数组`, `${where}.${key}`);
      }
    } else if (typeof value !== "string" || !rule.test(value)) {
      push("基线字段形状", `${key} 不匹配允许的形状 ${rule} ⇒ 可能夹带语料内容`, `${where}.${key}`);
    }
  }
  const metrics = (doc as Record<string, unknown>).metrics;
  if (metrics === undefined) {
    push("基线形状", "缺 metrics", where);
    return violations;
  }
  if (metrics === null || typeof metrics !== "object" || Array.isArray(metrics)) {
    push("基线形状", "metrics 必须是对象", `${where}.metrics`);
    return violations;
  }
  for (const strategy of Object.keys(metrics as Record<string, unknown>)) {
    const m = (metrics as Record<string, unknown>)[strategy];
    if (m === null || typeof m !== "object" || Array.isArray(m)) {
      push("基线形状", `${strategy} 的读数必须是对象`, `${where}.metrics.${strategy}`);
      continue;
    }
    for (const field of Object.keys(m as Record<string, unknown>)) {
      if (!RESULT_FIELDS.includes(field)) {
        push("基线不得含未白名单字段", `读数字段「${field}」不在 ${RESULT_FIELDS.join("/")} 里`, `${where}.metrics.${strategy}.${field}`);
        continue;
      }
      const v = (m as Record<string, unknown>)[field];
      if (typeof v !== "number" || !Number.isFinite(v)) push("基线字段形状", `读数必须是有限数字`, `${where}.metrics.${strategy}.${field}`);
    }
  }
  return violations;
};

/** 协议形状（冻结常量）。 */
export interface EvalProtocol {
  readonly protocol_version: string;
  readonly gated_metrics: readonly string[];
  readonly metric_directions: Readonly<Record<string, MetricDirection>>;
  readonly tolerances: Readonly<Record<string, number>>;
  readonly required_external_model_calls: number;
  /** **V7 语料健康门**的下限（协议常量，不是代码硬编码的可调项）。 */
  readonly min_corpus_files: number;
  /**
   * **T11 ① 的留出切点**（协议常量，`v1.21.28`）：`>= 切点` 的记忆算**留出集**。
   * 可选字段：`checkProtocol` 会要求它**存在且合法**（缺件不静默），这里给成可选只是为了让
   * 既有夹具不必一次性全改（判据仍在 `checkProtocol` 里，不在类型里）。
   */
  readonly holdout_from?: string;
  readonly k: number;
  readonly seeds: readonly number[];
  readonly max_docs: number;
  readonly baseline_tag: string;
}

/** 协议自身自检：门控指标必须有方向与容差；清单不得为空（防「门通过只是因为没判据」）。 */
export const checkProtocol = (protocol: EvalProtocol) => {
  const violations: { rule: string; why: string; where: string }[] = [];
  if (!Array.isArray(protocol.gated_metrics) || protocol.gated_metrics.length === 0) {
    violations.push({ rule: "协议不得为空", why: "没有门控指标 ⇒ 门通过没有意义", where: "protocol.gated_metrics" });
  }
  for (const m of protocol.gated_metrics ?? []) {
    if (!RESULT_FIELDS.includes(m)) violations.push({ rule: "门控指标必须在读数面里", why: `${m} 不是已知读数`, where: "protocol.gated_metrics" });
    const dir = protocol.metric_directions?.[m];
    if (dir === undefined) violations.push({ rule: "门控指标必须声明方向", why: `${m} 缺 metric_directions`, where: "protocol.metric_directions" });
    if (typeof protocol.tolerances?.[m] !== "number") violations.push({ rule: "门控指标必须声明容差", why: `${m} 缺 tolerances`, where: "protocol.tolerances" });
  }
  if (protocol.required_external_model_calls !== 0) {
    violations.push({ rule: "零外部调用", why: "本基准是零 LLM / 零网络的确定性基准 ⇒ 该常量必须为 0", where: "protocol.required_external_model_calls" });
  }
  if (!Array.isArray(protocol.seeds) || protocol.seeds.length === 0) {
    violations.push({ rule: "种子不得为空", why: "无种子 ⇒ 查询集不可复现", where: "protocol.seeds" });
  }
  // **V7 语料健康门**：下限必须是协议里的常量（从数据读，不从代码读）。
  // 用索引读取而非接口字段：该常量是运行期数据（JSON），加进接口会强迫所有夹具同步声明。
  const minFiles = (protocol as unknown as Record<string, unknown>).min_corpus_files;
  if (typeof minFiles !== "number" || !Number.isFinite(minFiles) || minFiles <= 0) {
    violations.push({ rule: "语料下限必须声明", why: "缺 min_corpus_files ⇒ PARTIAL 语料无法被识别（V7）", where: "protocol.min_corpus_files" });
  }
  // **T11 ①**：留出切点必须是协议里的常量（改切点＝改数据、被 diff 审阅）——
  // 切点是「预注册」的一部分：**先定切点，再看读数**。缺件 ⇒ 违规（不是「没有留出集也放行」）。
  const cut = (protocol as unknown as Record<string, unknown>).holdout_from;
  if (!isDateCut(cut)) {
    violations.push({
      rule: "留出切点必须声明",
      why: `缺 holdout_from（或不是 YYYY-MM-DD）⇒ 「调参集 / 留出集」无从分离（T11 ①）`,
      where: "protocol.holdout_from",
    });
  }
  return violations;
};

/**
 * **语料绝对下限判据**（协议常量 `min_corpus_files`）—— v1.15.59 从 `retrieval-eval.ts` 的内联块抽出来。
 *
 * 为什么值得单列：它此前写在 CLI 的 `if` 里，**没有任何标定测试**（旧 footer 还误称它走的
 * `corpus-health.classifyCorpus`）。抽出来之后，边界（`== minFiles` 通过 / `< minFiles` 拒绝）
 * 由 `retrieval-eval.selftest.ts` 锁住。
 *
 * ⚠ **与 `corpus-health.classifyCorpus` 不是同一条判据**（不可互相替代）：
 *   · 本函数 = **绝对下限**，拦「工作区指错、但恰好有几十个文件」；
 *   · `classifyCorpus` = **相对基线的容许带**，拦「相对上次骤降」（工具坏了）。
 *   两者拦的是不同故障，故**保留两份是刻意的**；但两份都必须有标定（此前第二份没有）。
 */
export const corpusFloorVerdict = (corpusCount: number, minFiles: number): { ok: boolean; reason?: string } => {
  if (!Number.isFinite(minFiles) || minFiles <= 0) return { ok: true }; // 未设下限 ⇒ 不拦（常量缺失由 checkProtocol 另行兜住）
  if (corpusCount >= minFiles) return { ok: true };
  return { ok: false, reason: `语料过小（PARTIAL）：扫到 ${corpusCount} 条，低于协议常量 min_corpus_files=${minFiles}` };
};

export interface CompareInput {
  readonly candidate: Record<string, any>;
  readonly baseline: Record<string, any>;
  readonly protocol: EvalProtocol;
  readonly candidateProtocolSha256: string;
  readonly baselineProtocolSha256: string;
}

/**
 * 比较器。**先证同源、再比数值**；返回「是否可比」+ 违规清单。
 * 不可比（`comparable: false`）**不算通过**：调用方必须把它当成第三种结论报出来。
 */
export const compareEval = (input: CompareInput) => {
  const { candidate, baseline, protocol } = input;
  const violations: { rule: string; why: string; where: string }[] = [];

  const identityMismatch: string[] = [];
  for (const field of ["case_count", "on_topic_count", "off_topic_count", "dataset_sha256"]) {
    if (candidate[field] !== baseline[field]) identityMismatch.push(field);
  }
  if (input.candidateProtocolSha256 !== input.baselineProtocolSha256) identityMismatch.push("protocol_sha256");

  if (identityMismatch.includes("protocol_sha256")) {
    violations.push({
      rule: "协议同源",
      why: "候选与基线由**不同协议**产生 ⇒ 数值不可比（先统一协议再重录基线）",
      where: `protocol_sha256 ${input.candidateProtocolSha256.slice(0, 8)}… vs ${input.baselineProtocolSha256.slice(0, 8)}…`,
    });
  }

  const datasetChanged = identityMismatch.includes("dataset_sha256") || identityMismatch.includes("case_count");
  if (datasetChanged) {
    return {
      comparable: false,
      reason:
        `语料已变（${identityMismatch.join("/")}）⇒ **不可比**。本仓语料是活的 \`.shadow\` 记忆（每回合都在新增），` +
        `哈希钉死的基线只在「语料冻结」时才有意义 ⇒ 要么在冻结快照上重录基线，要么只看「确定性」这一类判据。`,
      violations,
    };
  }

  const candidateMetrics = candidate.metrics ?? {};
  const baselineMetrics = baseline.metrics ?? {};
  const gated = protocol.gated_metrics;

  for (const strategy of Object.keys(baselineMetrics)) {
    if (candidateMetrics[strategy] === undefined) {
      violations.push({ rule: "缺 slice", why: `基线的策略「${strategy}」在候选里不存在 ⇒ 不得跳过（缺层即失败）`, where: strategy });
    }
  }
  for (const strategy of Object.keys(candidateMetrics)) {
    for (const field of gated) {
      const cand = candidateMetrics[strategy]?.[field];
      const base = baselineMetrics[strategy]?.[field];
      if (typeof cand !== "number" || typeof base !== "number") {
        violations.push({ rule: "缺 slice", why: `策略「${strategy}」的 ${field} 在候选或基线里缺失`, where: `${strategy}.${field}` });
        continue;
      }
      const dir = protocol.metric_directions[field];
      const tol = protocol.tolerances[field] ?? 0;
      const delta = cand - base;
      if (dir === "exact") {
        if (Math.abs(delta) > 0) violations.push({ rule: `${field} 必须逐字相等`, why: `实测 ${cand} vs 基线 ${base}（差 ${delta}）`, where: `${strategy}.${field}` });
      } else if (dir === "higher") {
        if (delta < -tol) violations.push({ rule: `${field} 退化`, why: `实测退化 ${(-delta).toFixed(6)}（允许 ${tol}）：${base} → ${cand}`, where: `${strategy}.${field}` });
      } else if (dir === "lower") {
        if (delta > tol) violations.push({ rule: `${field} 上涨`, why: `实测上涨 ${delta.toFixed(6)}（允许 ${tol}）：${base} → ${cand}`, where: `${strategy}.${field}` });
      }
    }
  }

  if (candidate.external_model_calls !== protocol.required_external_model_calls) {
    violations.push({
      rule: "外部调用即失败",
      why: `本基准要求外部模型调用数 = ${protocol.required_external_model_calls}，实测 ${candidate.external_model_calls}`,
      where: "external_model_calls",
    });
  }

  return { comparable: true, reason: "", violations };
};
