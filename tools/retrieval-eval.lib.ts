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
  return violations;
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
