// dsh-shadow —— tools/audit-ratchet.lib.ts：**分诊报告的棘轮**（V6 的判据面；纯逻辑，CLI 与标定测试共用）。
//
// 为什么需要它（V6 原文）：`audit:wiring` / `audit:drift` 是**人工分诊**工具 —— 输出是线索清单，
// **退出码语义未定义** ⇒ 硬塞进门禁只会制造「噪声导致跳过」。本模块把「退出码语义」定下来，判据是：
//
//   ① **线索数只能降不能升**（棘轮）：某桶比基线多 ⇒ **非零退出**（新缺陷/新噪声必须有人看）；
//   ② **降低不是违规，但要提示收紧基线**：少了说明修好了或工具变了 ⇒ 打印提示，退出 0；
//   ③ **基线里有的桶在观测里消失 ⇒ 违规**（缺件不静默：可能是工具坏了，而不是「问题没了」）；
//   ④ 观测里**多出**基线没有的桶 ⇒ 违规（新桶出现必须记账，否则棘轮会漏掉整类线索）。
//
// 与 `retrieval-eval.lib.ts` 的关系：复用它的 `stableStringify`（**判据收一处**：序列化只有一份实现）。
// 纯函数：不做 IO、不读时钟。
import { stableStringify } from "./retrieval-eval.lib.ts";

/** 一个棘轮组的观测/基线形状：键 → 计数。 */
export type Counts = Record<string, number>;

export interface RatchetResult {
  /** 是否通过（通过 = 可退出 0）。 */
  readonly ok: boolean;
  /** 建议退出码：0 通过 / 1 违规。 */
  readonly exitCode: 0 | 1;
  /** 人读报告行（调用方原样打印）。 */
  readonly lines: string[];
  /** 供 `--update` 写回的、收紧后的计数（等于 observed）。 */
  readonly tightened: Counts;
}

/**
 * 比较观测与基线。
 * @param label - 报告名（用于输出，如 `audit-wiring`）。
 * @param observed - 本次实测计数（键必须与基线约定一致）。
 * @param baseline - 签入基线计数；`undefined` 表示尚无基线。
 */
export const ratchetCounts = (label: string, observed: Counts, baseline: Counts | undefined): RatchetResult => {
  const lines: string[] = [];
  const violations: string[] = [];

  if (baseline === undefined) {
    violations.push("基线缺失 ⇒ **缺件不得静默通过**；先用 `--update-ratchet` 录制基线（并提交它）");
    lines.push(`棘轮（${label}）：基线缺失`);
    return { ok: false, exitCode: 1, lines, tightened: observed };
  }

  const keys = new Set([...Object.keys(baseline), ...Object.keys(observed)]);
  if (keys.size === 0) {
    violations.push("观测与基线都是空表 ⇒ 这不是「通过」，是**没有判据**");
  }

  const increased: string[] = [];
  const decreased: string[] = [];
  for (const key of [...keys].sort()) {
    const was = baseline[key];
    const now = observed[key];
    if (was === undefined) {
      violations.push(`新桶「${key}」＝${now}：基线里没有这一桶 ⇒ 先记账再收紧基线（否则这类线索会被棘轮漏掉）`);
      continue;
    }
    if (now === undefined) {
      violations.push(`桶「${key}」在本次观测里**消失**（基线 ${was}）⇒ 缺件不静默：先确认工具是否坏了`);
      continue;
    }
    if (now > was) increased.push(`${key} ${was} → ${now}（+${now - was}）`);
    else if (now < was) decreased.push(`${key} ${was} → ${now}（${now - was}）`);
  }

  for (const x of increased) violations.push(`线索**变多**：${x}`);
  for (const v of violations) lines.push(`  ✗ ${v}`);
  for (const d of decreased) lines.push(`  ↓ 已下降（不是违规，但基线可收紧）：${d}`);

  if (violations.length > 0) {
    lines.unshift(`棘轮（${label}）：失败（${violations.length} 处）`);
    return { ok: false, exitCode: 1, lines, tightened: observed };
  }
  lines.unshift(
    decreased.length > 0
      ? `棘轮（${label}）：通过 ✅（无上升；有 ${decreased.length} 项下降 ⇒ 建议 `+"`--update-ratchet`"+` 收紧基线）`
      : `棘轮（${label}）：通过 ✅（与基线逐桶相等）`,
  );
  return { ok: true, exitCode: 0, lines, tightened: observed };
};

/** 读写基线文件用的稳定序列化（转调 `stableStringify`，键序无关、带尾换行）。 */
export const serializeBaselines = (all: Record<string, Counts>): string => stableStringify(all);
