// dsh-shadow —— core/resource.ts：Resource Card（源层文件）→ ShadowNode(type:"resource") 投影。
// 定位（ADR-0043 Shadow Contract）：
//   - Resource Card = **source**：由 tool/agent 写入的普通文件（`.shadow/resources/<name>.md`），不是派生数据。
//   - `resource` 节点 = **Projection**：从卡片确定性派生，可重建（删掉重派生即可），不覆盖卡片。
//   - Evidence：卡片必须给出 `source`（链接/路径）才允许上投影；无证据的卡片保留在磁盘上但不进认知查询。
// 纪律：纯函数、无 LLM、不猜字段、不补写。解析不出来的卡片 = 不上投影（不是猜一个）。
import { SHADOW_ROOT } from "./paths.js";
import { slug, today, stamp } from "./util.js";
import { scrubUnsafe } from "../security/scrub.js";
import type { ShadowNode, ShadowRel } from "./node.js";
import type { AtomEvidenceRef } from "./lineage.js";
import { validateAtomProjection } from "./lineage-validator.js";

/** 资源卡目录（相对工作区；位于 shadowRoot 内，写入受既有安全边界约束）。 */
export const RESOURCE_DIR = `${SHADOW_ROOT}/resources`;

/** 固有层字段别名（中英都收，值原样保留）。 */
const FIELD_ALIAS: Record<string, string> = {
  source: "source", url: "source", 来源: "source", 链接: "source", 地址: "source",
  type: "type", 类型: "type", 类别: "type",
  authority: "authority", 权威性: "authority", 出处: "authority",
  activity: "activity", 活跃度: "activity",
  risk: "risk", 风险: "risk",
  summary: "summary", 一句话: "summary", 说明: "summary", 简介: "summary",
  date: "date", 日期: "date", 入库日期: "date",
};

/** 投影层字段别名（按问题各存一份）。 */
const PROJECTION_ALIAS: Record<string, string> = {
  date: "date", 日期: "date",
  relevance: "relevance", 相关性: "relevance",
  novelty: "novelty", 新颖性: "novelty",
  usability: "usability", 可用性: "usability",
  inspiration: "inspiration", 启发度: "inspiration",
  reusability: "reusability", 可复用性: "reusability",
  citation: "citation", 引用证据: "citation",
  conclusion: "conclusion", 结论: "conclusion",
};

const LINE_RE = /^[-*]\s*([^:：]+)[:：]\s*(.*)$/;
const HEAD_RE = /^(#{1,6})\s+(.+)$/;

/** 解析出的一句投影（`## 投影 @ <问题>` 段）。 */
export interface ResourceProjection {
  forQuestion: string;
  date: string;
  scores: Record<string, string>;
  citation: string;
  conclusion: string;
}

/** 一张资源卡：固有层字段 + 若干「按问题」的投影。 */
export interface ResourceCard {
  rel: string;                        // 卡片文件相对路径（= 节点的 source）
  name: string;
  fields: Record<string, string>;
  projections: ResourceProjection[];
}

/** 非 ASCII 名字的 slug 会退化成 "mem"，用短哈希兜底避免同名碰撞。 */
const shortHash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
};

export const resourceIdOf = (name: string) => {
  const s = slug(name);
  return s === "mem" ? `sr-${shortHash(name)}` : `sr-${s}`;
};

/** 解析一张资源卡。失败（无标题 / 无 source）返回 null —— 不上投影，把卡片留在磁盘上。 */
export const parseResourceCard = (text: string, rel: string): ResourceCard | null => {
  const lines = String(text || "").split(/\r?\n/);
  const fields: Record<string, string> = {};
  const projections: ResourceProjection[] = [];
  let name = "";
  let cur: ResourceProjection | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(HEAD_RE);
    if (h) {
      const level = h[1].length;
      const title = h[2].trim();
      if (level === 1) { name = name || title; cur = null; continue; }
      // 二级及以下标题里带「投影」= 开一段按问题的投影；其它标题只当作正文分隔，不改状态
      if (/投影/.test(title)) {
        const at = title.split(/@|＠/)[1];
        cur = { forQuestion: (at || title.replace(/^.*?投影\s*/, "")).trim(), date: "", scores: {}, citation: "", conclusion: "" };
        projections.push(cur);
      }
      continue;
    }
    const m = line.match(LINE_RE);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = scrubUnsafe(m[2].trim()).slice(0, 200);
    if (!value) continue;
    if (cur) {
      const alias = PROJECTION_ALIAS[key] || PROJECTION_ALIAS[m[1].trim()];
      if (!alias) continue;
      if (alias === "date") cur.date = value;
      else if (alias === "citation") cur.citation = value;
      else if (alias === "conclusion") cur.conclusion = value;
      else cur.scores[alias] = value;
    } else {
      const alias = FIELD_ALIAS[key] || FIELD_ALIAS[m[1].trim()];
      if (!alias) continue;
      fields[alias] = value;
    }
  }

  if (!name || !fields.source) return null;
  return { rel, name: scrubUnsafe(name).slice(0, 80), fields, projections };
};

/** 读 `.shadow/resources/*.md`（目录不存在 / 读失败 = 没有资源卡，不是错误）。 */
export const listResourceCards = async (fs: any, ws: string): Promise<ResourceCard[]> => {
  const out: ResourceCard[] = [];
  if (!fs || !ws) return out;
  try {
    const root = await fs.resolve(`${ws}/${RESOURCE_DIR}`, { cwd: ws });
    const files = (await fs.listDir(root)) || [];
    for (const f of files) {
      const n = f && f.name;
      if (!n || !String(n).endsWith(".md")) continue;
      const abs = await fs.resolve(`${ws}/${RESOURCE_DIR}/${n}`, { cwd: ws });
      const txt = await fs.readText(abs).catch(() => "");
      const card = parseResourceCard(String(txt || ""), `${RESOURCE_DIR}/${n}`);
      if (card) out.push(card);
    }
  } catch { /* 目录不存在 / 不可读：等价于「没有资源卡」 */ }
  return out;
};

/** 卡片 → 节点用的 lineage（event-sourced：只记录卡片里写着的事实，不推断）。 */
export const resourceLineage = (card: ResourceCard) => {
  const locator = card.fields.source;
  const kind: AtomEvidenceRef["type"] = /^https?:\/\//i.test(locator) ? "url" : "file";
  return {
    source: card.rel,
    createdBy: "tool" as const,
    evidence: [{ type: kind, locator } as AtomEvidenceRef],
    createdAt: `${card.fields.date || today()} 00:00:00`,
  };
};

/**
 * 资源卡 → ShadowNode(type:"resource")。
 * 过 validateAtomProjection：无 source 证据的判定在 parseResourceCard 已挡一层，这里仍走同一道门（口径单一）。
 */
export const deriveResourceNodes = (cards: ResourceCard[]): ShadowNode[] => {
  const nodes: ShadowNode[] = [];
  for (const card of cards || []) {
    const lineage = resourceLineage(card);
    const gate = validateAtomProjection({ type: "resource", lineage });
    if (!gate.allowed) continue;
    const content: string[] = [];
    if (card.fields.type) content.push(`类型：${card.fields.type}`);
    if (card.fields.authority) content.push(`权威性：${card.fields.authority}`);
    if (card.fields.activity) content.push(`活跃度：${card.fields.activity}`);
    if (card.fields.risk) content.push(`风险：${card.fields.risk}`);
    if (card.fields.summary) content.push(`一句话：${card.fields.summary}`);
    for (const p of card.projections) {
      const scores = Object.entries(p.scores).map(([k, v]) => `${k}=${v}`).join(" ");
      const head = `投影 @ ${p.forQuestion || "（未写问题）"}${p.date ? `（${p.date}）` : ""}`;
      content.push(`${head}：${scores || "—"}`);
      if (p.citation) content.push(`引用证据：${p.citation}`);
      if (p.conclusion) content.push(`结论：${p.conclusion}`);
    }
    const evidence = lineage.evidence.map((e) => scrubUnsafe(String(e.locator || "")).slice(0, 120));
    const relations: ShadowRel[] = evidence.map((ev) => ({ type: "references", target: ev, source: "resource-card" }));
    nodes.push({
      id: resourceIdOf(card.name),
      type: "resource",
      source: card.rel,
      title: card.name,
      content: content.map((x) => scrubUnsafe(String(x || "")).slice(0, 120)).slice(0, 10),
      evidence,
      relations,
      createdBy: lineage.createdBy,
    });
  }
  return nodes;
};

/** 供调试/测试：把「目录 → 节点」一步走完（不做缓存）。 */
export const deriveResourceNodesFromDir = async (fs: any, ws: string): Promise<ShadowNode[]> =>
  deriveResourceNodes(await listResourceCards(fs, ws));

/** 派生的投影时间戳（仅用于清单/调试，不写回卡片）。 */
export const resourceDerivedAt = () => `${today()}--${stamp().replace(/:/g, "")}`;
