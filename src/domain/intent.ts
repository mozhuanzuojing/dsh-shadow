/**
 * v3 domain — 隐式偏好 → 方向估计（hybrid：规则分类信号 + 稀疏 TF-IDF 质心余弦）。
 *
 * 目的：用户**从不显式说"采纳/否决"**，而靠继续阐述表达意图（"都不要"、"用Y代替X"、
 * "只要…去掉…"、"我的意思是…"）。本模块把多轮**用户话语**估成一个"意图方向"，
 * 并对候选方向给出"偏移最小"的排序；**只排序、不判真假、不替用户裁决、不改写记忆**（守 C1–C7）。
 *
 * 纪律（来自 critical-analyst 压测）：
 * - 纯余弦抓不住「整体否决 / 否定+替换 / 推翻默认」→ 必须**规则先行**：先抽出 {否决集, 替换对, 保留/偏好}，
 *   硬排除否决/被替换项，余弦只在**幸存候选**里排序。
 * - 分数只用于排序，外显必须标「方向假设 · 非采纳」；样本不足或候选全被否 → **fail-closed 返回不可判**，不猜。
 * - 只对用户话建模（调用方只喂 user turn），零依赖、确定性。
 */

export type SignalType =
  | "negateAll"
  | "replace"
  | "narrow"
  | "sync"
  | "overturn"
  | "cite"
  | "softPrefer"
  | "restate";

export interface IntentSignal {
  type: SignalType;
  /** -1 否决 / +1 偏好 / 0 中性提醒 */
  polarity: -1 | 0 | 1;
  /** 归一权重（0..1），用于置信度与 α 提升。 */
  weight: number;
  /** 被排除的词（"不要X" / 被替换的 X）。 */
  excluded: string[];
  /** 偏好的词（"用Y代替" / "更喜欢Y"）。 */
  preferred: string[];
}

export interface DirectionEstimate {
  /** 方向关键词（质心 top 词）。 */
  keywords: string[];
  /** 硬否决/被替换的词（含候选命中即排除）。 */
  excluded: string[];
  /** 偏好词。 */
  preferred: string[];
  signals: IntentSignal[];
  samples: number;
  confidence: "high" | "medium" | "low";
  /** 是否不可判（样本不足 / 整体否决且无偏好 / 候选全否）。 */
  undecidable: boolean;
  reason?: string;
  /** 内部：质心向量与 IDF（供 rankCandidates 复用，不对外展示）。 */
  centroid: Map<string, number>;
  idf: Map<string, number>;
}

export interface CandidateScore {
  candidate: string;
  /** 与方向的余弦相似（仅排序用，非真值）。 */
  score: number;
  /** 偏移 = 1 - score。 */
  deviation: number;
  status: "ok" | "excluded";
  reason?: string;
}

const STOP = new Set([
  "的", "了", "我", "你", "他", "她", "它", "是", "在", "和", "就", "也", "都", "很", "太",
  "这", "那", "个", "一", "下", "上", "要", "把", "被", "对", "与", "或", "而", "已", "还",
  "a", "an", "the", "is", "to", "of", "and", "or", "be", "it", "this", "that", "for", "on",
  "time", "sampled", "while", "preparing", "turn", "step", "available", "skills", "background",
  "subagent", "current", "note", "user", "prefer", "avoid",
]);

/** 清洗抽到的术语：去首尾虚词、丢单字/纯数字/停用词/超长（防噪声进否决集）。 */
const cleanTerm = (t: string): string => {
  const s = String(t ?? "").trim().replace(/^[的地得和与及]+/, "").replace(/[的得了呀呢]$/g, "");
  if (s.length < 2 || s.length > 16) return "";
  if (/^[\d\s.+\-]+$/.test(s)) return "";
  if (/[（）()「」【】"'"'《》]/.test(s)) return "";
  if (STOP.has(s)) return "";
  return s;
};

/** 分词：ASCII 词 + 中文 2-gram（含单字）。确定性、零依赖。 */
export const tokenize = (text: string): string[] => {
  const t = String(text ?? "").toLowerCase();
  const out: string[] = [];
  for (const m of t.matchAll(/[a-z0-9_.+-]+/g)) out.push(m[0]!);
  for (const m of t.matchAll(/[\u4e00-\u9fff]+/g)) {
    const s = m[0]!;
    if (s.length === 1) out.push(s);
    for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  }
  return out.filter((x) => x.length > 0 && !STOP.has(x) && !/^\d+$/.test(x));
};

const uniq = (xs: string[]): string[] => [...new Set(xs.filter((x) => x && x.length <= 24))];
const grab = (text: string, re: RegExp): string[] => {
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    if (m[1]) out.push(m[1].trim());
    if (m[2]) out.push(m[2].trim());
  }
  return out;
};

/** 规则信号抽取（确定性）。只认"用户原话"；不含猜测。 */
export const detectSignals = (text: string): IntentSignal[] => {
  const t = String(text ?? "");
  const signals: IntentSignal[] = [];

  const negateAll = /(都不要|全都不要|整个都不|都别|别做了|都取消|都不用|都不对|全部否)/.test(t);
  if (negateAll) signals.push({ type: "negateAll", polarity: -1, weight: 1, excluded: [], preferred: [] });

  // 替换：用Y代替X / 拿Y替换X
  const repl = grab(t, /(?:用|拿)\s*([^\s，。；,;]{1,20}?)\s*(?:代替|替换|换掉)\s*([^\s，。；,;]{1,20})/g);
  // 改成Y / 换成Y / 改为Y
  const changeTo = grab(t, /(?:改成|换成|改为)\s*([^\s，。；,;]{1,20})/g);
  // 「不要/别/不用」= 排除该选项（硬否决）
  const hardNeg = grab(t, /(?:不要|不用|别用|别再|别)\s*([\u4e00-\u9fffA-Za-z0-9_.+-]{1,16})/g);
  // 「删除/去掉/取消」= 要执行的**移除动作**（不该把该词当排除项，否则会误排除"删除X"这个正确方案）
  const removeAct = grab(t, /(?:删除|删掉|去掉|取消)\s*([\u4e00-\u9fffA-Za-z0-9_.+-]{1,16})/g);
  // 不是X（重述/纠错里的排除，但排除"这个"）
  const notX = grab(t, /不是\s*([\u4e00-\u9fffA-Za-z0-9_.+-]{2,12})/g).filter((x) => !/^这个$/.test(x));

  const excluded = uniq([...repl.filter((_, i) => i % 2 === 1), ...hardNeg, ...notX].filter((x) => !/^(代替|替换|换掉)$/.test(x)).map(cleanTerm).filter(Boolean));
  const preferred = uniq([...repl.filter((_, i) => i % 2 === 0), ...changeTo, ...removeAct].map(cleanTerm).filter(Boolean));

  if (repl.length || changeTo.length)
    signals.push({ type: "replace", polarity: 1, weight: 0.9, excluded, preferred });
  if (hardNeg.length || notX.length || removeAct.length)
    signals.push({ type: "narrow", polarity: -1, weight: 0.8, excluded, preferred: uniq(removeAct.map(cleanTerm).filter(Boolean)) });

  const prefer = grab(t, /(?:更喜欢|偏好|倾向|偏向|可以考虑)\s*([^\s，。；,;]{1,20})/g);
  if (prefer.length) signals.push({ type: "softPrefer", polarity: 1, weight: 0.4, excluded: [], preferred: uniq(prefer) });

  if (/(一并|都改|全局|统一|同样)/.test(t)) signals.push({ type: "sync", polarity: 0, weight: 0.5, excluded: [], preferred: [] });
  if (/(不用你|别用默认|不要默认|不是你选的|推翻)/.test(t)) signals.push({ type: "overturn", polarity: -1, weight: 0.7, excluded: [], preferred: [] });
  if (/(他们错|他们不对|以我为准|我说的算|按我说)/.test(t)) signals.push({ type: "cite", polarity: 0, weight: 0.6, excluded: [], preferred: [] });
  if (/(我的意思|我是说|我指的|不是这个)/.test(t)) signals.push({ type: "restate", polarity: 0, weight: 0.7, excluded: [], preferred: [] });

  return signals;
};

const isCorrection = (sigs: IntentSignal[]): boolean =>
  sigs.some((s) => s.type === "replace" || s.type === "narrow" || s.type === "negateAll" || s.type === "overturn" || s.type === "restate");

const l2 = (m: Map<string, number>): Map<string, number> => {
  let n = 0;
  for (const v of m.values()) n += v * v;
  n = Math.sqrt(n) || 1;
  const o = new Map<string, number>();
  for (const [k, v] of m) o.set(k, v / n);
  return o;
};

const cosine = (a: Map<string, number>, b: Map<string, number>): number => {
  let s = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = big.get(k);
    if (w) s += v * w;
  }
  return s;
};

/**
 * 从多轮**用户话语**估方向。utterances 按时间先后传入（只放 user turn）。
 * α：基线 0.3；遇纠正/否决临时上调（×1.5，上限 0.8），随后每步回落 ×0.9。
 */
export const buildDirection = (utterances: { text: string; at?: string }[], opts?: { minSamples?: number }): DirectionEstimate => {
  const minSamples = Math.max(1, opts?.minSamples ?? 1);
  const tokensByUtt = utterances.map((u) => tokenize(u.text));
  const tfByUtt = tokensByUtt.map((toks) => {
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const N = tfByUtt.filter((m) => m.size > 0).length;
  // IDF（仅非空文档）
  const df = new Map<string, number>();
  for (const m of tfByUtt) if (m.size) for (const k of m.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [k, v] of df) idf.set(k, Math.log((N + 1) / (v + 1)) + 1);

  const allSignals: IntentSignal[] = [];
  const excluded: string[] = [];
  const preferred: string[] = [];
  let negateAllSeen = false;

  let centroid = new Map<string, number>();
  let alpha = 0.3;
  utterances.forEach((u, i) => {
    const sigs = detectSignals(u.text);
    allSignals.push(...sigs);
    for (const s of sigs) {
      excluded.push(...s.excluded);
      preferred.push(...s.preferred);
      if (s.type === "negateAll") negateAllSeen = true;
    }
    if (isCorrection(sigs)) alpha = Math.min(0.8, alpha * 1.5);
    // 归一向量（按原始 utterances 索引对齐，空话语 = 零向量）
    const raw = tfByUtt[i] ?? new Map<string, number>();
    const vec = new Map<string, number>();
    for (const [k, v] of raw) vec.set(k, v * (idf.get(k) ?? 1));
    const x = l2(vec);
    // EMA 合并
    const keys = new Set<string>([...centroid.keys(), ...x.keys()]);
    const next = new Map<string, number>();
    for (const k of keys) next.set(k, (1 - alpha) * (centroid.get(k) ?? 0) + alpha * (x.get(k) ?? 0));
    centroid = l2(next);
    alpha = Math.max(0.1, alpha * 0.9);
  });

  const keywords = [...centroid.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => /^[\u4e00-\u9fff]{2,}$/.test(k) || /^[a-z]{3,}$/.test(k))
    .slice(0, 8);
  const exU = uniq(excluded).filter((x) => x.length >= 2 && !STOP.has(x));
  const pfU = uniq(preferred).filter((x) => x.length >= 2 && !STOP.has(x));

  let undecidable = false;
  let reason: string | undefined;
  if (N === 0) {
    undecidable = true;
    reason = "无用户话语样本";
  } else if (N < minSamples) {
    undecidable = true;
    reason = `样本不足（${N}<${minSamples}）→ 方向不可判，勿猜`;
  } else if (negateAllSeen && pfU.length === 0) {
    undecidable = true;
    reason = "整体否决且无替代方向（方向不可判，勿猜最小分）";
  }

  const confidence: DirectionEstimate["confidence"] = undecidable ? "low" : N >= 3 ? "high" : N >= 2 ? "medium" : "low";
  return { keywords, excluded: exU, preferred: pfU, signals: allSignals, samples: N, confidence, undecidable, reason, centroid, idf };
};

/** 对候选方向排序（偏移最小在前）。命中否决/替换来源 → 硬排除；样本/候选不足 → fail-closed。 */
export const rankCandidates = (dir: DirectionEstimate, candidates: string[]): { undecidable: boolean; reason?: string; ranked: CandidateScore[] } => {
  const mkVec = (text: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const t of tokenize(text)) m.set(t, (m.get(t) ?? 0) + (dir.idf.get(t) ?? 1));
    return l2(m);
  };
  const ranked: CandidateScore[] = [];
  for (const c of candidates) {
    const hit = dir.excluded.find((x) => c.toLowerCase().includes(x.toLowerCase()));
    if (hit) {
      ranked.push({ candidate: c, score: 0, deviation: 1, status: "excluded", reason: `命中否决/被替换项「${hit}」` });
      continue;
    }
    const score = cosine(dir.centroid, mkVec(c));
    ranked.push({ candidate: c, score, deviation: 1 - score, status: "ok" });
  }
  if (dir.undecidable) return { undecidable: true, reason: dir.reason, ranked };
  const survivors = ranked.filter((r) => r.status === "ok");
  if (survivors.length === 0) return { undecidable: true, reason: "候选全部被否决/替换，方向不可判", ranked };
  ranked.sort((a, b) => (a.status === b.status ? b.score - a.score : a.status === "ok" ? -1 : 1));
  return { undecidable: false, ranked };
};
