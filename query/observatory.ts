// dsh-shadow —— query/observatory.ts：Shadow Query Observatory（Phase 1A.5）。
// 目的：观察真实查询模式，先不固化 nodes.jsonl。只旁路记录/汇总，不改查询真相路径。
// 契约：
//   - 观测是「系统派生记录」：写 .shadow/query-log/<date>.jsonl，rm -rf query-log 不影响任何 Atom；
//   - 只在 shadow_query（mode:"query"）入口打点，不进 derive 真相路径；
//   - 写失败静默（best-effort），绝不改变 query 的返回值；
//   - query/title 做轻量 scrub（密钥打码 + 剔除控制/双向字符），防敏感检索词与注入残留回显。
import { SHADOW_ROOT } from "../core/paths.js";
import { today } from "../core/util.js";
import { nodeTypeOf } from "../core/node.js";
import type { ParsedMemory } from "../core/episode.js";
import { sanitizeText, scrubUnsafe } from "../security/scrub.js";

/** 一条查询观测记录（旁路、可重建）。
 * candidateNodes = 本次派生的全部 ShadowNode；returnedNodes = scope+query 过滤后返回条数。
 * relationCount = 返回节点携带的 relations 数（回答「relations 是否够」）；
 * nodeTypes = 返回节点的类型分布（回答「Node 类型是否够」）；
 * nodeTitles = 返回节点 title 列表（回答「同一查询的 Node 是否稳定」）。
 */
export interface QueryObservation {
  date: string;           // YYYY-MM-DD（决定写入 query-log/<date>.jsonl）
  ts: string;             // HH:mm:ss
  query: string;          // scrub 后
  scope: string[];
  limit: number;
  candidateNodes: number;
  returnedNodes: number;
  evidenceCount: number;  // 返回节点里唯一 evidence 数
  evidenceNodes: number;  // 返回节点中带 evidence 的个数（evidence 完整率）
  relationCount: number;  // 返回节点 relations 总数
  relationNodes: number;  // 返回节点中带 relations 的个数
  nodeTypes: Record<string, number>;
  nodeTitles: string[];
  latencyMs: number;
  // v1.8.0：Evidence Density 按 type/kind/createdBy 维度统计（返回节点里带 evidence 的比例）。
  evidenceByType?: Record<string, { total: number; ev: number }>;
  evidenceByKind?: Record<string, { total: number; ev: number }>;
  evidenceByCreatedBy?: Record<string, { total: number; ev: number }>;
}

const scrubQuery = (s: string) => scrubUnsafe(sanitizeText(s)).slice(0, 200);
const tidy = (s: string) => scrubUnsafe(s).slice(0, 60);

// v1.8.0：从返回节点算出 Evidence Density 的三维分布（type/kind/createdBy 各自的 total/ev）。
export const evidenceBreakdownOf = (nodes: any[]): { byType: Record<string, { total: number; ev: number }>; byKind: Record<string, { total: number; ev: number }>; byCreatedBy: Record<string, { total: number; ev: number }> } => {
  const inc = (m: Record<string, { total: number; ev: number }>, k: string, hasEv: boolean) => {
    m[k] = m[k] || { total: 0, ev: 0 };
    m[k].total++;
    if (hasEv) m[k].ev++;
  };
  const byType: Record<string, { total: number; ev: number }> = {};
  const byKind: Record<string, { total: number; ev: number }> = {};
  const byCreatedBy: Record<string, { total: number; ev: number }> = {};
  for (const n of nodes) {
    const hasEv = Array.isArray(n.evidence) && n.evidence.length > 0;
    inc(byType, String(n.type || "memory"), hasEv);
    if (n.kind) inc(byKind, String(n.kind), hasEv);
    if (n.createdBy) inc(byCreatedBy, String(n.createdBy), hasEv);
  }
  return { byType, byKind, byCreatedBy };
};

const logRel = (date: string) => `${SHADOW_ROOT}/query-log/${date}.jsonl`;

export const recordQueryObservation = async (fs: any, ws: string, cfg: any, obs: QueryObservation): Promise<void> => {
  // 默认开启（本阶段就是要观察真实查询）；显式 queryLog.enabled=false 才关。观测是旁路，写失败静默。
  if (!fs || !ws) return;
  if (cfg?.queryLog && cfg.queryLog.enabled === false) return;
  try {
    const rel = logRel(obs.date);
    const target = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    const prev = (await fs.readText(target)) || "";
    const line = JSON.stringify({ ...obs, query: scrubQuery(obs.query), nodeTitles: (obs.nodeTitles || []).map(tidy) });
    await fs.writeText(target, prev.endsWith("\n") || !prev.length ? prev + line + "\n" : prev + "\n" + line + "\n");
  } catch { /* best-effort：观测层失败不冒泡 */ }
};

/** 汇总所有 query-log（跨日期），供 read_shadow({mode:"query-log"}) 展示。 */
export const summarizeQueryLog = async (fs: any, ws: string): Promise<any> => {
  const obs: any[] = [];
  try {
    const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/query-log`, { cwd: ws });
    const files = await fs.listDir(root);
    for (const f of files) {
      if (!f?.name || !String(f.name).endsWith(".jsonl")) continue;
      const target = await fs.resolve(`${ws}/${SHADOW_ROOT}/query-log/${f.name}`, { cwd: ws });
      const text = (await fs.readText(target)) || "";
      for (const line of String(text).split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try { obs.push(JSON.parse(t)); } catch { /* 单行坏跳过 */ }
      }
    }
  } catch { /* query-log 目录不存在（尚未采集） */ }
  return aggregateObservations(obs);
};

const aggregateObservations = (obs: any[]) => {
  const total = obs.length;
  if (!total) return { total: 0, avgLatency: 0 };
  const sum = (k: string) => obs.reduce((a, o) => a + (Number(o[k]) || 0), 0);
  const avg = (k: string) => sum(k) / total;
  const typeDist: Record<string, number> = {};
  const scopeDist: Record<string, number> = {};
  // v1.8.0：Evidence Density 三维聚合（跨观测累加）。
  const evByType: Record<string, { total: number; ev: number }> = {};
  const evByKind: Record<string, { total: number; ev: number }> = {};
  const evByCreatedBy: Record<string, { total: number; ev: number }> = {};
  const merge = (dst: Record<string, { total: number; ev: number }>, src?: Record<string, { total: number; ev: number }>) => {
    for (const [k, v] of Object.entries(src || {})) {
      dst[k] = dst[k] || { total: 0, ev: 0 };
      dst[k].total += Number(v.total) || 0;
      dst[k].ev += Number(v.ev) || 0;
    }
  };
  let evSum = 0, evNodeSum = 0, relSum = 0, relNodeSum = 0;
  const byQuery = new Map<string, any[]>();
  for (const o of obs) {
    for (const [t, c] of Object.entries(o.nodeTypes || {})) typeDist[t] = (typeDist[t] || 0) + (Number(c) || 0);
    const key = (o.scope || []).join(",") || "*";
    scopeDist[key] = (scopeDist[key] || 0) + 1;
    evSum += Number(o.evidenceCount) || 0;
    evNodeSum += Number(o.evidenceNodes) || 0;
    relSum += Number(o.relationCount) || 0;
    relNodeSum += Number(o.relationNodes) || 0;
    merge(evByType, o.evidenceByType);
    merge(evByKind, o.evidenceByKind);
    merge(evByCreatedBy, o.evidenceByCreatedBy);
    const q = String(o.query || "");
    if (!byQuery.has(q)) byQuery.set(q, []);
    byQuery.get(q)!.push(o);
  }
  let repeatQueries = 0, stableQueries = 0, driftQueries = 0;
  const drift: any[] = [];
  for (const [q, list] of byQuery) {
    if (list.length < 2) continue;
    repeatQueries++;
    const keys = list.map((o) => JSON.stringify(o.nodeTitles || []));
    if (new Set(keys).size === 1) stableQueries++;
    else { driftQueries++; if (drift.length < 20) drift.push({ query: q, seen: list.length, distinctResultSets: new Set(keys).size }); }
  }
  const retSum = sum("returnedNodes");
  return {
    total,
    avgCandidate: Math.round(avg("candidateNodes") * 10) / 10,
    avgReturned: Math.round(avg("returnedNodes") * 10) / 10,
    avgEvidence: Math.round(avg("evidenceCount") * 10) / 10,
    evidenceCoverage: retSum ? Math.round((evNodeSum / retSum) * 100) : 0,   // 返回节点里带 evidence 的比例
    avgRelation: Math.round(avg("relationCount") * 10) / 10,
    relationCoverage: retSum ? Math.round((relNodeSum / retSum) * 100) : 0,  // 返回节点里带 relations 的比例
    typeDist,
    scopeDist,
    repeatQueries, stableQueries, driftQueries,
    drift,
    avgLatency: Math.round(avg("latencyMs")),
    evByType, evByKind, evByCreatedBy,   // v1.8.0 Evidence Density 三维
  };
};

// 渲染一个「维度 → 覆盖率」段（total/ev → %；ev 为 0 的维度显示 0%）。
const renderDim = (label: string, m: Record<string, { total: number; ev: number }>): string | null => {
  const entries = Object.entries(m);
  if (!entries.length) return null;
  const parts = entries.map(([k, v]) => `${k} ${v.total ? Math.round((v.ev / v.total) * 100) : 0}%`).join(" · ");
  return `- ${label}：${parts}`;
};

export const renderQueryLogSummary = (s: any, topic: string): string => {
  if (!s || !s.total) return `（Query Observatory：尚无 shadow_query 记录。调用几次 shadow_query 后这里会给出命中/证据/关系/类型分布与 Node 稳定性。${topic ? ` topic=${topic}` : ""}）`;
  const lines: string[] = [`# Shadow Query Observatory · ${topic || "全部"}`, ""];
  lines.push(`总查询 ${s.total} · 平均候选节点 ${s.avgCandidate} → 返回 ${s.avgReturned} · 平均证据 ${s.avgEvidence} · 平均关系 ${s.avgRelation} · 平均延迟 ${s.avgLatency}ms`);
  lines.push(`- evidence 完整率：${s.evidenceCoverage}%（返回节点中带证据比例）`);
  lines.push(`- relation 覆盖：${s.relationCoverage}%（返回节点中带 relations 比例）`);
  if (s.typeDist && Object.keys(s.typeDist).length) lines.push(`- 返回节点类型分布：${Object.entries(s.typeDist).map(([t, c]) => `${t}×${c}`).join("、")}`);
  if (s.scopeDist && Object.keys(s.scopeDist).length) lines.push(`- scope 使用：${Object.entries(s.scopeDist).map(([k, c]) => `${k || "*"}×${c}`).join("、")}`);
  lines.push(`- 重复查询 ${s.repeatQueries}（Node 稳定 ${s.stableQueries} · 漂移 ${s.driftQueries}）：稳定=同一查询每次返回的 nodeTitles 一致；漂移=不一致（说明 Node 派生不稳定）`);
  if (s.drift && s.drift.length) {
    lines.push("");
    lines.push("## Node 漂移的重复查询");
    for (const d of s.drift) lines.push(`- "${d.query}" 见过 ${d.seen} 次 · 不同的结果集 ${d.distinctResultSets} 个`);
  }
  lines.push("");
  lines.push("> Query Observatory 为系统派生记录（.shadow/query-log/），rm -rf 不影响任何 Atom；仅观察，不改 nodes 结构。");
  return lines.join("\n");
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1A.6 Shadow Fitness Report：把 query-log 变成「是否升级索引层」的客观依据。
// 输入 .shadow/query-log/*.jsonl（+ 扫记忆原子做 missing-types 启发式），输出 shadow-report.md。
// 只做「诊断」，不做「变强」；判定是启发式（best-effort、无 LLM、不下结论），标注依据。
// ─────────────────────────────────────────────────────────────────────────────
/** Evidence Density 健康阈值：dsh-shadow 坚持「宁可少回答，不要无证据上下文」。 */
export const EVIDENCE_HEALTHY = 90; // 有证据返回节点 / 总返回节点 %

// 约束型 / 任务型语言标记（启发式，用来推测「内容被归错类型」）。只作呈现，不替数据作决定。
const CONSTRAINT_RE = /禁止|严禁|不得|不能|不允许|必须|永不|不可|切勿|务必|只允许|前提|约束|dependency rule/;
const TASK_RE = /待办|todo|尚未|未完成|下一步|继续做|还需要|要做|未闭环|还剩/;

const nodeText = (p: ParsedMemory) =>
  [p.entry, p.goal, ...(p.decisions || []), ...(p.actions || []), ...(p.thinkLines || []), ...(p.userMessages || []), ...(p.materials || [])].join(" ");

/** 从记忆原子扫描「约束型/任务型」内容，推测可能缺失的 Node 类型（如 constraint/task）。 */
export const missingTypesOf = (parsed: ParsedMemory[]): { type: string; count: number; currentTypes: Record<string, number> }[] => {
  const markers: Record<string, { re: RegExp; count: number; byType: Record<string, number> }> = {
    constraint: { re: CONSTRAINT_RE, count: 0, byType: {} },
    task: { re: TASK_RE, count: 0, byType: {} },
  };
  for (const p of parsed || []) {
    const t = nodeTypeOf(p);
    const text = nodeText(p);
    for (const name of Object.keys(markers)) {
      const m = markers[name];
      if (m.re.test(text)) { m.count++; m.byType[t] = (m.byType[t] || 0) + 1; }
    }
  }
  const out: { type: string; count: number; currentTypes: Record<string, number> }[] = [];
  for (const name of Object.keys(markers)) {
    const m = markers[name];
    if (m.count >= 3) out.push({ type: name, count: m.count, currentTypes: m.byType }); // ≥3 次才提示，避免单例噪声
  }
  return out;
};

/** 从 query-log 聚合 + 记忆扫描，构造健身报告数据。 */
export const buildFitnessReport = (agg: any, parsed: ParsedMemory[]) => {
  const missing = missingTypesOf(parsed);
  const evidenceDensity = agg.evidenceCoverage || 0;
  const repeat = agg.repeatQueries || 0;
  const driftQ = agg.driftQueries || 0;
  // 判定为「观察/建议」，非结论。
  const observations: string[] = [];
  if (agg.total > 0) {
    if (evidenceDensity >= EVIDENCE_HEALTHY) observations.push(`证据覆盖 ${evidenceDensity}%：多数返回节点带证据，符合「无证据不返回」契约。`);
    else observations.push(`证据覆盖 ${evidenceDensity}%（低于 ${EVIDENCE_HEALTHY}%）：存在无证据上下文被返回，健康度需关注。`);
    if (repeat > 0) {
      if (driftQ === 0) observations.push(`重复查询 ${repeat} 次 Node 全部稳定：派生规则可靠，暂无索引层压力。`);
      else observations.push(`重复查询 ${repeat} 次中有 ${driftQ} 次漂移：Node 派生可能不稳定，先别上索引，查派生规则。`);
    } else observations.push("重复查询为 0：样本不足，先积累重复查询再评稳定性。");
    for (const m of missing) observations.push(`检测到「${m.type}」型内容 ${m.count} 处，当前归类 [${Object.entries(m.currentTypes).map(([t, c]) => `${t}×${c}`).join("、")}]：如真实查询反复需要，再考虑补 ${m.type} 类型。`);
  }
  return { date: today(), agg, evidenceDensity, missing, observations, evByType: agg.evByType, evByKind: agg.evByKind, evByCreatedBy: agg.evByCreatedBy };
};

export const renderFitnessReport = (r: any): string => {
  if (!r.agg || !r.agg.total) {
    return `# Shadow Fitness Report\n\n> 生成：${r.date} · 依据：.shadow/query-log/*.jsonl（系统派生，rm -rf 可重建）\n\n**无查询样本**：尚无 shadow_query 记录。先跑一轮真实工程任务，再回来生成报告。\n\n> 只诊断、不增强；判定为启发式观察，非结论。`;
  }
  const a = r.agg;
  const lines: string[] = [
    `# Shadow Fitness Report`,
    ``,
    `> 生成：${r.date} · 依据：.shadow/query-log/*.jsonl（系统派生，rm -rf 可重建）`,
    ``,
    `## Query Summary`,
    `- 总查询 ${a.total} · 平均候选节点 ${a.avgCandidate} → 返回 ${a.avgReturned} · 平均延迟 ${a.avgLatency}ms`,
    `- scope 使用：${Object.entries(a.scopeDist || {}).map(([k, c]) => `${k || "*"}×${c}`).join("、") || "—"}`,
    ``,
    `## Evidence Density（核心指标：dsh-shadow vs 普通 RAG）`,
    `- 有证据节点 / 总返回节点 = **${r.evidenceDensity}%**（阈值 ${EVIDENCE_HEALTHY}%）`,
    `- 平均每条返回节点证据数：${a.avgEvidence}`,
    ...(renderDim("按 type", r.evByType) ? [renderDim("按 type", r.evByType)] : []),
    ...(renderDim("按 kind（metadata 已排除）", r.evByKind) ? [renderDim("按 kind（metadata 已排除）", r.evByKind)] : []),
    ...(renderDim("按 createdBy", r.evByCreatedBy) ? [renderDim("按 createdBy", r.evByCreatedBy)] : []),
    ``,
    `## Stability（Node 是否稳定）`,
    `- 重复查询 ${a.repeatQueries} · 稳定 ${a.stableQueries} · 漂移 ${a.driftQueries}`,
    ...(a.drift && a.drift.length ? ["- 漂移查询：", ...a.drift.map((d: any) => `  - "${d.query}" 见过 ${d.seen} 次 · 不同结果集 ${d.distinctResultSets}`)] : []),
    ``,
    `## Node Distribution（返回节点类型分布）`,
    `- ${Object.entries(a.typeDist || {}).map(([t, c]) => `${t} ${c}`).join(" · ") || "—"}`,
    ``,
    `## Potential Missing Types`,
    ...(r.missing && r.missing.length
      ? r.missing.map((m: any) => `- **candidate: ${m.type}** — 「${m.type}」型内容 ${m.count} 处，当前归类 [${Object.entries(m.currentTypes).map(([t, c]) => `${t}×${c}`).join("、")}]。如真实查询反复需要，再补该类型（不提前设计）。`)
      : ["- 未检测到明显的缺失类型（约束/任务标记 < 3 处）。"]),
    ``,
    `## 观察与建议`,
    ...(r.observations && r.observations.length ? r.observations.map((o: string) => `- ${o}`) : []),
    ``,
    `> 只诊断、不增强；判定为启发式观察，非结论。`,
  ];
  return lines.join("\n");
};

/** 把报告写成 .shadow/shadow-report.md（系统派生记录，rm -rf 可重建）。 */
export const writeShadowReport = async (fs: any, ws: string, text: string): Promise<void> => {
  if (!fs || !ws) return;
  try {
    const rel = `${SHADOW_ROOT}/shadow-report.md`;
    const target = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(target, text);
  } catch { /* best-effort：报告落盘失败不冒泡 */ }
};
