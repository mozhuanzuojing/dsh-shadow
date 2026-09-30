// dsh-shadow —— core/materials/card.ts：材料卡（adr/0110 §2.3，**主轴**）—— 纯逻辑部分。
//
// 材料卡是**进化层**：`背景/材料` 从「一行路径字符串」长成资产 —— 记「它对哪些事重要」·
// 「我们从它那里得到过什么结论（逐圈追加）」·「读到的是第几版」·「哪些结论互相冲突」。
// 落点 `.shadow/indexes/materials/<key>.md`（**派生**，可重建 ⇒ 不占 source 位，adr/0106 §2.2）。
//
// **平衡三律**（adr/0110 §2.4）在本文件里是**可测的纯函数**，不是散文：
//   ① 新证据：没有新的证据指针、且不是在开新圈（新结论）⇒ **不写**（`skip: "no-new-evidence"`）
//   ② 不矛盾：声明冲突（`contradicts`）时，旧圈**一条都不删**，只多一行 `> 矛盾：` ⇒ 冲突可见，不静默覆盖
//   ③ 可回退：**开新圈**前必须交出「上一圈」的快照（`history`），由调用方落 `history/<圈号>.md`（归档、只追加）
//   第四重（§2.5）：**未 `confirmed` 的结论不得进「重要在哪」**，只能作为候选留在圈里。
//
// ⚠ 本文件**不做 I/O**（读卡/写盘在 `./store.ts`）⇒ 三律可以在无 fs 的测试里逐条钉住。
import { createHash } from "node:crypto";

/** 一圈结论（螺旋的一圈）。 */
export interface MaterialRing {
  ring: number;
  at: string;                 // `YYYY-MM-DD HHMMSS`
  affaire: string;            // 这件事的指针（`项目|Agent` 或纪要 id）
  statement: string;          // 结论（来自这条记忆的决策行；**不 LLM 补写**）
  evidence: string[];         // 支撑它的原子指针（`.shadow/atoms/<名>`）
  status: "candidate" | "confirmed";   // 未 confirmed ⇒ 只作候选（§2.5）
  contradicts?: number[];     // 它声明与哪几圈冲突（§2.4 律 2）
}

export interface MaterialCard {
  key: string;                // 规范化 key（`normalizeMaterialKey`，**唯一实现**）
  source: string;             // 原始引用写法（首次出现；供人读，不参与判等）
  version: string;            // 源指纹（读到的是第几版；空 = 未记）
  affaires: string[];         // 「它对哪些事重要」（**只收 confirmed 圈**的 affaire）
  rings: MaterialRing[];
}

/** 卡文件名的**唯一实现**：key → 安全文件名。带短哈希 ⇒ 不同 key 不会撞名。 */
export const materialFileName = (key: string): string => {
  const safe = String(key || "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-40);
  const h = createHash("md5").update(String(key || ""), "utf8").digest("hex").slice(0, 8);
  return `${safe || "material"}-${h}.md`;
};

/**
 * 材料 key 的**规范化（唯一实现）**。判据（adr/0110 §2.0 的代价那一段）：
 *   · 路径类（含盘符 / 前导斜杠 / 含分隔符）：反斜杠归一成正斜杠 · 折叠重复斜杠 · 去尾斜杠 ·
 *     盘符大写 · **整体小写**（Windows 路径大小写不敏感 ⇒ 只有小写才能让同一份材料不裂成两张卡）。
 *   · 非路径类（报题 / DOI / 术语）：折叠空白 · 小写 · `doi:` 前缀归一。
 * ⚠ **别在别处再写一遍**：一裂卡，主轴自己就碎了（并卡要人工介入）。
 */
export const normalizeMaterialKey = (raw: string): string => {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // ⚠ **前缀先判**：DOI / arXiv / ISBN 的正文里本来就带 `/`，若先按「含斜杠 ⇒ 路径」判，
  // 它们会被当路径处理 ⇒ 前缀归一（`DOI: ` → `doi:`）永不生效（实测踩过：`DOI: 10.1000/XYZ`）。
  if (/^(doi|arxiv|isbn)\s*:/i.test(s)) {
    return s.replace(/^([a-z]+)\s*:\s*/i, (_m, k: string) => `${k.toLowerCase()}:`).replace(/\s+/g, " ").toLowerCase();
  }
  const pathLike = /^[A-Za-z]:[\\/]/.test(s) || s.startsWith("/") || s.startsWith("./") || s.includes("/") || s.includes("\\");
  if (pathLike) {
    let p = s.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    p = p.replace(/^([a-z]):/i, (_m, d: string) => `${d.toUpperCase()}:`);
    return p.toLowerCase();
  }
  // 其余非路径类（报题 / 术语）：折叠空白 + 小写
  return s.replace(/\s+/g, " ").toLowerCase();
};

export const emptyCard = (key: string, source = key): MaterialCard => ({ key, source, version: "", affaires: [], rings: [] });

/** 卡全文（**派生视图**：原文说了算；这份文本可被重建）。 */
export const renderCard = (card: MaterialCard): string => {
  const lines = [
    `# 材料卡：${card.source || card.key}`,
    "",
    "> 类型：材料卡（**派生 · 可重建**；adr/0110 §2.3 —— 螺旋的主轴）",
    `> key：\`${card.key}\``,
    `> 读到的版本：${card.version || "（未记）"}`,
    `> 重要在哪：${card.affaires.length ? card.affaires.join(" · ") : "（还没有已确认的结论）"}`,
    `> 圈数：${card.rings.length}`,
    "",
    "## 结论圈",
    "",
  ];
  if (!card.rings.length) lines.push("（还没有结论圈）", "");
  for (const r of card.rings) {
    lines.push(`### 圈 ${r.ring} · ${r.at} · ${r.affaire || "（无 affaire）"}`);
    lines.push(`- 结论（${r.status}）：${r.statement}`);
    lines.push(`- 证据：${r.evidence.length ? r.evidence.join("、") : "（无）"}`);
    if (r.contradicts?.length) {
      lines.push(`> 矛盾：本圈与圈 ${r.contradicts.join("、")} **冲突** —— 两圈都保留（**不静默覆盖**，adr/0110 §2.4 律 2）`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

const FIELD = (text: string, name: string): string =>
  (String(text || "").match(new RegExp(`^>\\s*${name}：(.+)$`, "m")) || [])[1]?.trim() ?? "";

/** 解析卡（**宽松**：读不出就当空卡 ⇒ 由下一圈重建，不静默丢证据：宁可从原子重算）。 */
export const parseCard = (text: string, key: string): MaterialCard => {
  const card = emptyCard(key, FIELD(text, "key") ? key : key);
  const src = (String(text || "").match(/^# 材料卡：(.+)$/m) || [])[1]?.trim();
  if (src) card.source = src;
  const ver = FIELD(text, "读到的版本");
  if (ver && ver !== "（未记）") card.version = ver;
  const imp = FIELD(text, "重要在哪");
  if (imp && imp !== "（还没有已确认的结论）") card.affaires = imp.split("·").map((s) => s.trim()).filter(Boolean);
  const blocks = String(text || "").split(/^### 圈 /m).slice(1);
  for (const b of blocks) {
    const head = b.split("\n")[0] ?? "";
    const m = head.match(/^(\d+)\s*·\s*([^·]*)\s*·\s*(.*)$/);
    if (!m) continue;
    const stmt = (b.match(/^- 结论（(candidate|confirmed)）：(.*)$/m) || []) as unknown as string[];
    const ev = (b.match(/^- 证据：(.*)$/m) || [])[1] ?? "";
    const con = (b.match(/^> 矛盾：本圈与圈 ([\d、]+) /m) || [])[1] ?? "";
    card.rings.push({
      ring: Number(m[1]),
      at: (m[2] ?? "").trim(),
      affaire: (m[3] ?? "").trim() === "（无 affaire）" ? "" : (m[3] ?? "").trim(),
      statement: (stmt[2] ?? "").trim(),
      status: (stmt[1] as "candidate" | "confirmed") ?? "candidate",
      evidence: ev && ev !== "（无）" ? ev.split("、").map((s) => s.trim()).filter(Boolean) : [],
      ...(con ? { contradicts: con.split("、").map(Number).filter((n) => Number.isFinite(n)) } : {}),
    });
  }
  return card;
};

export interface EvidenceInput {
  affaire: string;
  atomRel: string;
  at: string;
  decisions: string[];
  /** 声明冲突（adr/0110 §2.4 律 2）：本圈的结论与哪几圈冲突。**由调用方声明**，不从文本猜。 */
  contradicts?: number[];
  /** 是否已确认（§2.5 闸门）：未确认 ⇒ 只作候选、且不进「重要在哪」。 */
  confirmed?: boolean;
}

export type Plan =
  | { ok: true; changed: boolean; card: MaterialCard; history: string | null; reason: string }
  | { ok: false; changed: false; card: MaterialCard; history: null; reason: string };

/**
 * 把一条证据并进卡（**平衡三律的机器判据全在这里**）。
 * - 有新的**决策**（结论）⇒ **开新圈**：先交 `history`（上一圈的快照，落 `history/<圈号>.md`）。
 * - 只有新的**证据指针**（无新结论）⇒ 并进**最后已确认圈**（或新建候选圈）：圈内证据**只增不减**。
 * - 两者都没有 ⇒ **不写**（律 1：没有新证据就不写）。
 */
export const applyEvidence = (card: MaterialCard, input: EvidenceInput): Plan => {
  const atom = String(input.atomRel || "");
  const allEvidence = new Set(card.rings.flatMap((r) => r.evidence));
  const decisions = (input.decisions || []).map((d) => String(d).trim()).filter(Boolean);
  const last = card.rings[card.rings.length - 1];
  const newDecision = decisions.find((d) => !card.rings.some((r) => r.statement === d)) ?? "";
  const newEvidence = atom && !allEvidence.has(atom);

  // 律 1：既没有新结论、也没有新证据 ⇒ 不写（这就是「不无脑追加」）
  if (!newDecision && !newEvidence) {
    return { ok: false, changed: false, card, history: null, reason: "no-new-evidence：既无新结论也无新证据 ⇒ 不写（律 1）" };
  }

  if (newDecision) {
    // 开新圈（律 3：先交出上一圈的快照；调用方落 history/<圈号>.md）
    const ring: MaterialRing = {
      ring: (last?.ring ?? 0) + 1,
      at: input.at,
      affaire: input.affaire,
      statement: newDecision,
      evidence: atom ? [atom] : [],
      status: input.confirmed ? "confirmed" : "candidate",
      ...(input.contradicts?.length ? { contradicts: [...input.contradicts] } : {}),
    };
    const next: MaterialCard = {
      ...card,
      rings: [...card.rings, ring],
      // §2.5 闸门：**只有 confirmed 圈**的 affaire 才进「它对哪些事重要」
      affaires: input.confirmed && input.affaire && !card.affaires.includes(input.affaire)
        ? [...card.affaires, input.affaire]
        : card.affaires,
    };
    return {
      ok: true, changed: true, card: next,
      history: last ? renderCard(card) : null,   // 第一圈无历史可留
      reason: `开圈 ${ring.ring}（${ring.status}）`,
    };
  }

  // 只多了一条证据 ⇒ 并进最后圈；**圈内证据只增不减**（改结论必须开新圈）
  if (!last) {
    // 从没结论却先有证据：建一个候选圈，结论留空（不 LLM 补写）
    const ring: MaterialRing = { ring: 1, at: input.at, affaire: input.affaire, statement: "（尚未有结论）", evidence: [atom], status: "candidate" };
    return { ok: true, changed: true, card: { ...card, rings: [ring] }, history: null, reason: "建候选圈（只有证据、无结论）" };
  }
  const next: MaterialCard = {
    ...card,
    rings: card.rings.map((r, i) => (i === card.rings.length - 1 ? { ...r, evidence: [...r.evidence, atom] } : r)),
  };
  return { ok: true, changed: true, card: next, history: null, reason: `并证入圈 ${last.ring}` };
};

/** 并卡（同一份材料因 key 不规范裂成两张时的人为收口）：把 `from` 的圈并进 `to`，**证据一条不丢**。 */
export const mergeCards = (to: MaterialCard, from: MaterialCard, at: string): MaterialCard => {
  const base = to.rings.length ? to.rings[to.rings.length - 1].ring : 0;
  const moved = from.rings.map((r, i) => ({
    ...r,
    ring: base + i + 1,
    at: r.at || at,
    evidence: [...r.evidence],
    statement: `${r.statement}（并卡自 \`${from.key}\`）`,
  }));
  return {
    ...to,
    affaires: [...new Set([...to.affaires, ...from.affaires])],
    rings: [...to.rings, ...moved],
  };
};
