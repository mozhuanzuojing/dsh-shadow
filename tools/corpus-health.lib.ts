// dsh-shadow —— tools/corpus-health.lib.ts：**语料健康门**（V7；纯逻辑，四个语料消费者共用同一份判据）。
//
// 为什么需要它（用户 2026-09-12 评审的第 3 条，比继续加 audit bucket 更重要）：
//   V6 只防住了「**语料全空**」（zero files → exit 2）。但还有个更危险的兄弟 —— **Partial Corpus**：
//
//     正常：files 210 / findings 103
//     工具坏了：files 7 / findings 21      ← **不是 0**，闸门不会响，读数「看起来合理」
//
//   而 V6 的棘轮对「下降」是**判通过并提示收紧基线**的 ⇒ **工具坏了会被当成修好了，写进基线**。
//   这是「False Green」的第二形态：不是假绿，而是**假绿还会自我固化**。
//
// 判据（四档，只有 NORMAL 才允许 audit → ratchet → baseline）：
//   EMPTY   语料为空（0 文件）                      ⇒ exit 2
//   PARTIAL 语料/线索**骤降**或**哨兵文件缺失**      ⇒ exit 2
//   UNKNOWN 无基线可比（首次运行）                  ⇒ exit 2（缺件不得静默通过）
//   NORMAL  在容许带内                              ⇒ 放行
//
// 纯函数：不做 IO、不读时钟。指纹由调用方传入（同一份 `sha256-utf8-lf-v1` 约定）。

export type CorpusHealth = "EMPTY" | "PARTIAL" | "NORMAL" | "UNKNOWN";

/** 一次语料观测：数量面 + 指纹。`findingsA/B` 是**该工具自己的线索计数**（用于识别「工具坏了」）。 */
export interface CorpusObservation {
  readonly files: number;
  readonly dirs: number;
  readonly findingsA: number;
  readonly findingsB: number;
  readonly fingerprint: string;
}

export interface HealthOptions {
  /** 文件数低于基线的这个比例即判 PARTIAL（默认 0.9）。 */
  readonly minFileRatio?: number;
  /** 目录数低于基线的这个比例即判 PARTIAL（默认 0.9；专门防「递归没跟随 junction / 漏了根」）。 */
  readonly minDirRatio?: number;
  /** 线索数相对基线的**最大容许跌幅**（默认 0.2 = 跌超 20% 判 PARTIAL）。 */
  readonly maxFindingDrop?: number;
}

export interface HealthResult {
  readonly health: CorpusHealth;
  /** 只有 NORMAL 为真。 */
  readonly ok: boolean;
  /** 建议退出码：NORMAL → 0，其余 → 2（与「违规」的 1 区分开）。 */
  readonly exitCode: 0 | 2;
  readonly lines: string[];
}

const ratio = (now: number, was: number): number => (was <= 0 ? 1 : now / was);

/**
 * 判语料健康。
 * @param label - 消费者名（如 `audit-wiring`）。
 * @param observed - 本次观测。
 * @param baseline - 上次录的观测；`undefined` ⇒ UNKNOWN（不得静默放行）。
 * @param missingSentinels - 必读文件里**没被扫到**的那些（哨兵：无基线也能发现「走错了目录」）。
 */
export const classifyCorpus = (
  label: string,
  observed: CorpusObservation,
  baseline: CorpusObservation | undefined,
  missingSentinels: readonly string[] = [],
  options: HealthOptions = {},
): HealthResult => {
  const minFileRatio = options.minFileRatio ?? 0.9;
  const minDirRatio = options.minDirRatio ?? 0.9;
  const maxFindingDrop = options.maxFindingDrop ?? 0.2;
  const lines: string[] = [];
  const say = (s: string) => lines.push(`  ${s}`);

  // ① 空语料（V6 已有的那条，保留）
  if (observed.files === 0) {
    lines.push(`语料健康（${label}）：**EMPTY** ⇒ 拒绝产出读数（0 文件不是「没问题」）`);
    say(`files=${observed.files} dirs=${observed.dirs}`);
    return { health: "EMPTY", ok: false, exitCode: 2, lines };
  }

  // ② 哨兵缺失：**无基线也能发现**「走错了目录 / 递归被静默截断」
  if (missingSentinels.length > 0) {
    lines.push(`语料健康（${label}）：**PARTIAL** ⇒ 哨兵文件缺失（说明扫描范围不对，不是「这些文件没了」）`);
    for (const s of missingSentinels) say(`缺失哨兵：${s}`);
    say(`files=${observed.files} dirs=${observed.dirs}`);
    return { health: "PARTIAL", ok: false, exitCode: 2, lines };
  }

  // ③ 无基线 ⇒ UNKNOWN（缺件不静默）
  if (baseline === undefined) {
    lines.push(`语料健康（${label}）：**UNKNOWN** ⇒ 无基线可比（先用 \`--update-ratchet\` 录基线并提交）`);
    return { health: "UNKNOWN", ok: false, exitCode: 2, lines };
  }

  // ④ 规模骤降（文件 / 目录 / 线索三面）
  const problems: string[] = [];
  if (ratio(observed.files, baseline.files) < minFileRatio) {
    problems.push(`文件数 ${baseline.files} → ${observed.files}（低于 ${(minFileRatio * 100).toFixed(0)}% 容许带）`);
  }
  if (ratio(observed.dirs, baseline.dirs) < minDirRatio) {
    problems.push(`目录数 ${baseline.dirs} → ${observed.dirs}（递归可能没跟随 junction / 漏了根）`);
  }
  const dropA = 1 - ratio(observed.findingsA, baseline.findingsA);
  const dropB = 1 - ratio(observed.findingsB, baseline.findingsB);
  if (baseline.findingsA > 0 && dropA > maxFindingDrop) {
    problems.push(`A 段线索 ${baseline.findingsA} → ${observed.findingsA}（跌 ${(dropA * 100).toFixed(0)}% > ${(maxFindingDrop * 100).toFixed(0)}%）`);
  }
  if (baseline.findingsB > 0 && dropB > maxFindingDrop) {
    problems.push(`B 段线索 ${baseline.findingsB} → ${observed.findingsB}（跌 ${(dropB * 100).toFixed(0)}% > ${(maxFindingDrop * 100).toFixed(0)}%）`);
  }

  if (problems.length > 0) {
    lines.push(`语料健康（${label}）：**PARTIAL** ⇒ 拒绝 ratchet / 拒绝录基线（先确认是「真修好了」还是「工具坏了」）`);
    for (const p of problems) say(p);
    say(`指纹：${baseline.fingerprint.slice(0, 12)}… → ${observed.fingerprint.slice(0, 12)}…`);
    return { health: "PARTIAL", ok: false, exitCode: 2, lines };
  }

  lines.push(
    `语料健康（${label}）：**NORMAL** ✅（files ${observed.files} / dirs ${observed.dirs} / ` +
      `findings ${observed.findingsA}+${observed.findingsB}；指纹 ${observed.fingerprint.slice(0, 12)}…）`,
  );
  if (observed.fingerprint !== baseline.fingerprint) {
    say("⚠ 指纹与基线不同但规模在容许带内 ⇒ 语料内容变了（规模类判据**不**覆盖内容变化）");
  }
  return { health: "NORMAL", ok: true, exitCode: 0, lines };
};
