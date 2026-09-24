// dsh-shadow —— core/space/soft-lens.ts：灵魂规避滤（ADR-0107）。
// 任务无关：只按 soul.observer.what_to_ignore / avoided 藏段；不是 RealityProjection。
// 缺灵魂 ⇒ 原文透传 + missingSoul（F2 横幅由调用方贴）。

export interface SoftLensResult {
  text: string;
  hidden: string[];
  missingSoul: boolean;
  /** 是否有任何规避词生效（有灵魂且 ignore 非空且藏过行）。 */
  applied: boolean;
}

/** 从 soul 取规避词列表（curated observer 透镜）。 */
export const ignoreTermsOf = (soul: any): string[] => {
  if (!soul) return [];
  const ob = soul.observer || soul.observerLens || {};
  const raw = ob.what_to_ignore ?? ob.avoided ?? [];
  return (Array.isArray(raw) ? raw : []).map((x: unknown) => String(x || "").trim()).filter(Boolean);
};

/**
 * 对单份原子正文做规避滤：含规避词的行移入 hidden，其余保留顺序。
 * 空 ignore / 无灵魂 ⇒ 原文；空结果时至少留一行说明。
 */
export const applySoftLens = (body: string, soul: any): SoftLensResult => {
  const missingSoul = !soul;
  const terms = ignoreTermsOf(soul);
  if (missingSoul || !terms.length) {
    return { text: String(body || ""), hidden: [], missingSoul, applied: false };
  }
  const lower = terms.map((t) => t.toLowerCase());
  const visible: string[] = [];
  const hidden: string[] = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    const hay = line.toLowerCase();
    if (lower.some((t) => t && hay.includes(t))) hidden.push(line);
    else visible.push(line);
  }
  const text = visible.join("\n").trim()
    ? visible.join("\n")
    : "（本条正文均被灵魂规避滤藏起；用 `raw: true` 看原文）";
  return { text, hidden, missingSoul: false, applied: hidden.length > 0 };
};

/** F2：缺灵魂时贴在读结果顶部的说明（不静默）。 */
export const missingSoulBanner = (): string =>
  "> ⚠ 还没有灵魂（`.shadow/soul/soul.json`）：默认规避滤为空滤镜，结果未按人设取舍。\n";
