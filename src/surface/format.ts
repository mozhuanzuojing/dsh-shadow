/**
 * v2 surface — 工具输出格式：统一前缀/信号/错误，不让每个工具各写一遍。
 */

import type { Outcome } from "../contract/outcome.js";
import { RECALL_PREFIX, scrubFinal } from "../domain/text.js";
import type { SignalStore } from "../engine/signals.js";
import type { ReadResult } from "../engine/read/types.js";

export const renderReadOutcome = (r: Outcome<ReadResult>, signals: SignalStore): string => {
  if (r.ok) return scrubFinal(r.value.text);
  const banner = signals.render();
  return scrubFinal(
    `${RECALL_PREFIX}> ⚠ shadow 读取失败（${r.error.code}）：${r.error.message}\n> 这**不是**「没有记忆」；请先修复路径/权限/索引，再重试。${banner}`,
  );
};

export const renderPlain = (text: string, signals?: SignalStore): string =>
  scrubFinal(`${RECALL_PREFIX}${text}${signals?.render() ?? ""}`);
