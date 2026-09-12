// dsh-shadow —— core/decision-outcome.ts：**M1 的确定性结果归属**（决策 → 结果；ADR-0081，走 ADR-0082 的原语）。
//
// 本模块只做「**确定性规则**」这一条事实写入路径（另一条是「显式外部来源」，由调用方直接构造 proposal + confirmation）：
//
//   规则 `same-key-window/v1`：一个观察结果归属某决策 ⇔
//     ① **同一归属键**（key，**由调用方显式传入** —— 本模块**不推断**，与 ADR-0037「Reason 绝不生成」同一纪律）；
//     ② 观察时间 ≥ 决策时间，且 **lag ≤ windowDays**；
//     ③ 在满足 ①② 的决策里取 **最晚的前驱**（确定性）；
//     ④ 若最晚前驱**并列**（同 key 同 at）⇒ **不归属**，记为 `ambiguous`（**保守**：宁可少归属，不可错归属）。
//
// 三条硬纪律（都来自已冻结的契约）：
//   · **不读时钟**：`now` 由调用方传入 ⇒ 读数可复现；
//   · **年龄只暴露风险，不改变状态**：`pending` 不设结算窗口，年龄读数**不写回**任何状态；
//   · **只有事实能进统计**：本模块产出的 `Proposal`/`Confirmation` 必须经 `core/proposal.ts` 的
//     `projectFacts` 才算事实 —— 调用方**不得**把 `Attribution` 直接当事实用（`Attribution` 是**候选层**的东西）。
//
// 另：**一个决策可以有多个结果事实**（多个观察都归属它）—— 本模块**不挑选「那个」结果**（挑选＝判断）。
import type { Proposal, ProposalInputRef, Confirmation } from "./proposal.js";

/** 归属键的**来源**。本模块只接受显式键；没有键的决策/观察一律不参与归属。 */
export const ATTRIBUTION_RULE = "same-key-window/v1";

/** 决策侧（由调用方从 `ObservationTrace.decision` 等来源**显式**整理出来；本模块不解析 trace）。 */
export interface DecisionRecord {
  readonly id: string;
  /** 归属键：**显式**给出的 entry/subject（本模块绝不从文本推断）。 */
  readonly key: string;
  readonly at: string;
  readonly action: string;
  readonly rationale?: string;
  /**
   * 决策的**处置状态**（M1-A′ dry run 的 F6）。
   *
   * `"open"`（默认，缺省即此）= 在等结果；`"deliberate-deferral"` = **刻意不做 / 刻意推迟**。
   * **为什么必须有这个维度**：没有它，「刻意不做」与「忘了做」在数据上**完全同形**，
   * 年龄读数会把两者一起报成「积压」—— 那不是算错，是**缺维度**。缺省为 `open` ⇒ 向后兼容。
   */
  readonly disposition?: "open" | "deliberate-deferral";
}

/** 观察侧：一条「实际发生了什么」的外部观察（来源必须是 user/tool/ci，**不得是模型**）。 */
export interface OutcomeObservation {
  readonly id: string;
  readonly key: string;
  readonly at: string;
  readonly actual: string;
  readonly source: "user" | "tool" | "ci";
  /** 可审计的输入引用（进 proposal 的 `inputRefs`，**必填非空**）。 */
  readonly inputRefs: readonly ProposalInputRef[];
}

/** 归属结果（**候选层**：还不是事实）。 */
export interface Attribution {
  readonly decision: string;
  readonly observation: string;
  readonly key: string;
  readonly rule: string;
  readonly windowDays: number;
  /** 整日粒度（**会丢分辨率**：同日晚 5 小时与晚 5 分钟都算 0d）—— 与 `lagHours` 并用。 */
  readonly lagDays: number;
  /** 小时粒度（F7）：支撑「结算得多快」这类读数；`floor` 取整，不插值。 */
  readonly lagHours: number;
}

export interface AttributionResult {
  readonly attributions: readonly Attribution[];
  /** 并列最晚前驱 ⇒ **不归属**，但要**可见**（ADR-0049：缺件不静默）。 */
  readonly ambiguous: readonly { observation: string; key: string; candidates: readonly string[] }[];
  /** 没有任何在窗内决策的观察（同样**可见**，不是静默丢弃）。 */
  readonly unattributed: readonly { observation: string; key: string }[];
  /**
   * **实际参与归属的决策 id**（有键的那些）。读数层必须用这个集合，
   * **不得自己再判断一次「有没有键」** —— 否则 `unkeyed:"include-as-unkeyed"` 模式下两处口径分叉。
   */
  readonly considered: readonly string[];
}

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};
const days = (a: string, b: string): number | null => {
  const x = ms(a);
  const y = ms(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.floor((y - x) / 86_400_000);
};
const hours = (a: string, b: string): number | null => {
  const x = ms(a);
  const y = ms(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.floor((y - x) / 3_600_000);
};

/**
 * 按 `same-key-window/v1` 归属。**纯函数、不看时钟、不读文件**。
 * @param windowDays - 时间窗（天）。由调用方给出（走 config，**不是这里的硬编码魔数**）。
 */
export const attributeOutcomes = (input: {
  readonly decisions: readonly DecisionRecord[];
  readonly observations: readonly OutcomeObservation[];
  readonly windowDays: number;
  /** 归属键缺失时的处理：`skip`（默认，保守）或 `include-as-unkeyed`（键为空串也参与比对）。 */
  readonly unkeyed?: "skip" | "include-as-unkeyed";
}): AttributionResult => {
  const lenient = input.unkeyed === "include-as-unkeyed";
  const hasKey = (k: string | undefined): k is string => lenient || (typeof k === "string" && k.trim().length > 0);

  const decisions = input.decisions.filter((d) => hasKey(d.key));
  const attributions: Attribution[] = [];
  const ambiguous: { observation: string; key: string; candidates: readonly string[] }[] = [];
  const unattributed: { observation: string; key: string }[] = [];

  // 观察按 (at, id) 排序 ⇒ 输出与输入顺序无关
  const observations = [...input.observations].sort((a, b) =>
    a.at === b.at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.at < b.at ? -1 : 1,
  );

  for (const o of observations) {
    if (!hasKey(o.key)) {
      unattributed.push({ observation: o.id, key: o.key });
      continue;
    }
    // 候选 = 同 key、观察时刻不早于决策、且 lag 在窗内
    const candidates = decisions.filter((d) => {
      if (d.key !== o.key) return false;
      const lag = days(d.at, o.at);
      return lag !== null && lag >= 0 && lag <= input.windowDays;
    });
    if (candidates.length === 0) {
      unattributed.push({ observation: o.id, key: o.key });
      continue;
    }
    // 取**最晚前驱**；并列 ⇒ 不归属（保守，且可见）
    const latest = candidates.reduce((a, b) => (a.at > b.at ? a : b));
    const tied = candidates.filter((c) => c.at === latest.at);
    if (tied.length > 1) {
      ambiguous.push({ observation: o.id, key: o.key, candidates: tied.map((c) => c.id).sort() });
      continue;
    }
    const lag = days(latest.at, o.at);
    const lagHours = hours(latest.at, o.at);
    if (lag === null || lagHours === null) {
      unattributed.push({ observation: o.id, key: o.key });
      continue;
    }
    attributions.push({
      decision: latest.id,
      observation: o.id,
      key: o.key,
      rule: ATTRIBUTION_RULE,
      windowDays: input.windowDays,
      lagDays: lag,
      lagHours,
    });
  }

  attributions.sort((a, b) => (a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0));
  ambiguous.sort((a, b) => (a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0));
  unattributed.sort((a, b) => (a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0));
  return {
    attributions,
    ambiguous,
    unattributed,
    considered: decisions.map((d) => d.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  };
};

/**
 * 把归属结果变成**原语记录**（Proposal + Confirmation）—— 这是「接线」的关键：
 * **M1 的结果事实必须经 `projectFacts` 产生，本模块不返回事实。**
 *
 * - `Proposal.source` = **观察的来源**（user/tool/ci；内容是他们给的）；
 * - `Confirmation.actor` = `"tool"`（**确定性规则**这条写入路径），`reason` 写明规则与数字 ⇒ **可审计**。
 *
 * `missing`：归属里引用了、但调用方**没传**对应观察的 id（调用方传错参数时**不猜**：
 * 跳过会让事实凭空少一条，所以必须**报出来**，由调用方决定怎么处理）。
 */
export const toPrimitiveRecords = (result: AttributionResult, observations: readonly OutcomeObservation[]) => {
  const byId = new Map(observations.map((o) => [o.id, o]));
  const proposals: Proposal[] = [];
  const confirmations: Confirmation[] = [];
  const missing: string[] = [];
  for (const a of result.attributions) {
    const o = byId.get(a.observation);
    if (o === undefined) {
      missing.push(a.observation);
      continue;
    }
    const pid = `outcome-${a.decision}-${a.observation}`;
    proposals.push({
      type: "proposal",
      id: pid,
      kind: "outcome",
      source: o.source,
      inputRefs: o.inputRefs,
      proposedRelation: o.actual,
      subject: a.key,
      createdAt: o.at,
    });
    confirmations.push({
      type: "confirmation",
      id: `confirm-${pid}`,
      proposal: pid,
      actor: "tool",
      action: "confirm",
      timestamp: o.at,
      reason: `rule:${a.rule} key=${a.key} lag=${a.lagDays}d(${a.lagHours}h) window=${a.windowDays}d`,
    });
  }
  return { proposals, confirmations, missing: missing.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
};

/** 结果结算读数（**`pending` 不设窗口**；年龄只暴露风险，**不写回状态**）。 */
export interface OutcomeReadout {
  readonly decisions: number;
  readonly settled: number;
  readonly pending: number;
  /** 在等结果的决策（`disposition:"open"`，缺省即此）。 */
  readonly pendingOpen: number;
  /** **刻意不做/刻意推迟**的决策（F6）—— 它们的年龄**不算积压风险**，故与 `open` 分开报。 */
  readonly pendingDeferred: number;
  /** 未参与本次归属的决策（没有归属键，或**不在本次 `result` 的决策集内**）⇒ 不判断，也不计入 pending。 */
  readonly unconsidered: number;
  /** `at` 无法解析 ⇒ 年龄**不可测**的条数（**缺件不静默**，ADR-0049）。 */
  readonly unmeasurable: number;
  readonly ambiguous: number;
  readonly unattributed: number;
  readonly buckets: { readonly lt7: number; readonly d7to30: number; readonly d30to90: number; readonly ge90: number };
  readonly oldest: { readonly id: string; readonly at: string; readonly ageDays: number } | null;
  /** 派生指标：待结算（**仅 `open`**）年龄的 p90（nearest-rank）。无 ⇒ `null`（**不可测，不报 0**）。 */
  readonly pendingAgeP90: number | null;
};

/** nearest-rank p90（确定性；不插值 —— 插值会造出不存在的年龄）。 */
export const p90 = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(0.9 * sorted.length) - 1);
  return sorted[idx];
};

/**
 * 结算读数。`now` **由调用方传入**（不读时钟 ⇒ 可复现）。
 * **注意**：本函数**不修改任何状态** —— 年龄只用于暴露「正常等待 / 长期积压 / 刻意推迟」。
 *
 * 口径（F6）：年龄分布、最老、p90 **只统计 `disposition:"open"`**；
 * `deliberate-deferral` 单独计数 —— 「刻意不做」不是积压，混在一起报就是**误导**。
 */
export const outcomeReadout = (
  input: {
    readonly decisions: readonly DecisionRecord[];
    readonly result: AttributionResult;
  },
  now: string,
): OutcomeReadout => {
  const settledIds = new Set(input.result.attributions.map((a) => a.decision));
  // 「有没有键」的判定**只用 attribution 给出的 `considered`**，本层不重判（避免口径分叉）。
  // 注：若调用方拿**子集**算的 result 配**全集** decisions，这里会把差额算成 `unconsidered` —— 那是**故意叫响的**
  // （不猜、不静默），正常调用下 `unconsidered` 只等于「无键」的条数。
  const considered = new Set(input.result.considered);
  const unconsidered = input.decisions.filter((d) => !considered.has(d.id)).length;
  const pendingRecords = input.decisions.filter((d) => considered.has(d.id) && !settledIds.has(d.id));

  const open = pendingRecords.filter((d) => d.disposition !== "deliberate-deferral");
  let unmeasurable = 0;
  const ages: number[] = [];
  for (const d of open) {
    const age = days(d.at, now);
    if (age === null) unmeasurable += 1;
    else ages.push(Math.max(0, age));
  }
  const oldest =
    open
      .map((d) => ({ id: d.id, at: d.at, ageDays: days(d.at, now) }))
      .filter((x): x is { id: string; at: string; ageDays: number } => x.ageDays !== null)
      .map((x) => ({ id: x.id, at: x.at, ageDays: Math.max(0, x.ageDays) }))
      .sort((a, b) => b.ageDays - a.ageDays || (a.id < b.id ? -1 : 1))[0] ?? null;

  return {
    decisions: input.decisions.length,
    settled: settledIds.size,
    pending: pendingRecords.length,
    pendingOpen: open.length,
    pendingDeferred: pendingRecords.length - open.length,
    unconsidered,
    unmeasurable,
    ambiguous: input.result.ambiguous.length,
    unattributed: input.result.unattributed.length,
    buckets: {
      lt7: ages.filter((a) => a < 7).length,
      d7to30: ages.filter((a) => a >= 7 && a < 30).length,
      d30to90: ages.filter((a) => a >= 30 && a < 90).length,
      ge90: ages.filter((a) => a >= 90).length,
    },
    oldest,
    pendingAgeP90: p90(ages),
  };
};

/** 渲染成一行（供读路径复用；**不含任何判断**，只有数字与「未观察到」）。 */
export const renderOutcomeReadout = (r: OutcomeReadout): string => {
  const parts = [
    `决策 ${r.decisions}`,
    `已结算 ${r.settled}`,
    `待结算 ${r.pending}`,
    `（<7d ${r.buckets.lt7} · 7–30d ${r.buckets.d7to30} · 30–90d ${r.buckets.d30to90} · ≥90d ${r.buckets.ge90}）`,
    `p90 ${r.pendingAgeP90 === null ? "不可测" : `${r.pendingAgeP90}d`}`,
  ];
  if (r.oldest !== null) parts.push(`最老 ${r.oldest.at}（${r.oldest.ageDays}d）`);
  if (r.pendingDeferred > 0) parts.push(`刻意推迟 ${r.pendingDeferred}（不计入积压）`);
  if (r.unconsidered > 0) parts.push(`未参与归属 ${r.unconsidered}（无键或不在本次 result 内）`);
  if (r.unmeasurable > 0) parts.push(`年龄不可测 ${r.unmeasurable}`);
  if (r.ambiguous > 0) parts.push(`歧义 ${r.ambiguous}`);
  if (r.unattributed > 0) parts.push(`未归属 ${r.unattributed}`);
  return parts.join(" · ");
};
