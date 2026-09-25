// dsh-shadow —— tools/audit-complexity.lib.ts：**复杂度预算门**的纯判据（`T13` 后半；CLI 与标定测试共用一份）。
//
// 判据对象（为什么是这两个代理、各自对应哪种风险 —— 见 `adr/0109`）：
//   · **文件行数**：代理「单文件过长 ⇒ 接手成本」。对应 `AGENTS.md` 自己的约定「文件小而专注（200–400 行典型，≤800）」。
//   · **热点棘轮**：行数 ≥ 阈值的文件进基线，**只能下调**；上涨即红（照抄 hl_mem 的 `complexity_budget.json` 形态）。
//
// ⚠ **不用 AST**：本仓 `typescript@7.0.2` 是 native(Corsa) 移植，包根只导出 `version`
//   （同 `audit-layers` 的方法边界）⇒ 判据只能是「行数」这类文本量，**不能**是「圈复杂度 / 参数数 / 函数体行数」。
//   这是**能力边界**，不是取舍：写不了就不假装能判。
//
// ⚠ **范围 = 产品面**（`index.ts` + 源码目录），**不扫** `test/` 与 `tools/`：
//   `test/recall-attribution.test.ts` 有 **4546** 行、`tools/retrieval-eval.ts` **629** 行 ——
//   把它们纳进来的门**当天就是红的**（`T13` 前半的教训：**表定错了，门就是红的 ⇒ 假闸门**）。
//   排除是**明确边界**（数字已量、写在 `adr/0109`），不是漏掉。
//
// 纯函数：不做 IO、不读时钟。

export type FileMetric = { rel: string; lines: number };

const byLinesDesc = (a: FileMetric, b: FileMetric): number => b.lines - a.lines || a.rel.localeCompare(b.rel);

/** 硬上限：**任何**产品面文件不得超过 `cap` 行（`cap` 是协议常量，不是随手写的数）。 */
export const hardCapVerdict = (files: FileMetric[], cap: number): { ok: boolean; over: FileMetric[] } => {
  const over = files.filter((f) => f.lines > cap).sort(byLinesDesc);
  return { ok: over.length === 0, over };
};

/**
 * **扫到的文件数**健康判据：明显骤降 ⇒ 拒绝出读数。
 *
 * 为什么必须有：本门的默认结论是「合规」（没有超限文件）。若根目录写错 / 遍历坏了，
 * 扫到 0 个文件也是「没有超限文件」⇒ **假绿**。这与 `eval` 的 `min_corpus_files`、`audit-wiring` 的
 * 「生产语料为空 ⇒ 拒出 0 线索读数」同一条纪律（ADR-0049：缺件不静默）。
 */
export const scanHealthVerdict = (
  scannedNow: number,
  scannedBaseline: number | undefined,
  minRatio = 0.9,
): { ok: boolean; note: string } => {
  if (scannedBaseline === undefined) return { ok: true, note: "首次录基线（无基线可比）" };
  if (!Number.isFinite(scannedBaseline) || scannedBaseline <= 0) return { ok: true, note: `基线里的文件数异常（${scannedBaseline}）⇒ 不据此拦截` };
  if (scannedNow >= Math.floor(scannedBaseline * minRatio)) return { ok: true, note: `扫到 ${scannedNow} 个文件（基线 ${scannedBaseline}）` };
  return {
    ok: false,
    note: `扫到 ${scannedNow} 个文件，**低于**基线 ${scannedBaseline} 的 ${Math.round(minRatio * 100)}% ⇒ 疑似根目录/遍历坏了，拒绝出「全部合规」的读数`,
  };
};

export type HotspotVerdict = {
  /** **违规**：已记录的热点行数上涨。 */
  risen: FileMetric[];
  /** **新热点**：首次跨过阈值 ⇒ 打印 + 提示重录基线（不算违规：拦住架构演进＝假闸门）。 */
  fresh: FileMetric[];
  /** 退出热点的（降到阈值以下 / 已删）⇒ 打印 + 提示收紧基线（不算违规：降下去是好事）。 */
  gone: string[];
};

/**
 * 热点棘轮：**已记录的热点只能降**。
 *
 * 三分类是刻意的（与 `audit-wiring` 的棘轮**不同**）：
 *   · `risen`（上涨）= 退化信号 ⇒ **违规**；
 *   · `fresh`（新热点）= 正常演进 ⇒ 记账，不算违规（否则每加一个大文件就红）；
 *   · `gone`（退出热点）= 改善/文件消失 ⇒ 提示收紧基线，不算违规。
 *   两处「不算违规」都**必须打印**：不打印就等于静默放过（ADR-0049）。
 */
export const hotspotVerdict = (
  files: FileMetric[],
  baseline: Record<string, number> | undefined,
  threshold: number,
): HotspotVerdict => {
  const base = baseline ?? {};
  const now = new Map<string, number>();
  for (const f of files) if (f.lines >= threshold) now.set(f.rel, f.lines);
  const risen: FileMetric[] = [];
  const fresh: FileMetric[] = [];
  for (const [rel, lines] of now) {
    const was = base[rel];
    if (was === undefined) fresh.push({ rel, lines });
    else if (lines > was) risen.push({ rel, lines });
  }
  const gone = Object.keys(base).filter((rel) => !now.has(rel)).sort();
  return { risen: risen.sort(byLinesDesc), fresh: fresh.sort(byLinesDesc), gone };
};
