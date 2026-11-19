/**
 * v2 engine/read — 读请求/依赖/输出类型。
 */

import type { NormalizedConfig } from "../../contract/config.js";
import type { Outcome } from "../../contract/outcome.js";
import type { AtomMeta, ContextStatus } from "../../contract/types.js";
import type { Clock } from "../../contract/time.js";
import type { LoadAtomsResult } from "../../store/atoms.js";
import type { IndexDb } from "../../store/index-db.js";
import type { FsPort } from "../../store/fs.js";
import type { SignalStore } from "../signals.js";

export interface ReadDeps {
  fs: FsPort;
  ws: string;
  config: NormalizedConfig;
  clock: Clock;
  signals: SignalStore;
  index?: IndexDb;
  meta?: Map<string, AtomMeta>;
  verify?: (path: string) => Promise<ContextStatus>;
  /** route 归一化后的 limit/maxChars；handler 只读这份，避免各自再解析 req。 */
  limit?: number;
  maxChars?: number;
  /** DB-first 加载器；未提供时回退 fs 全量读。 */
  loadAtoms?: () => Promise<Outcome<LoadAtomsResult>>;
  /** 读时把已载入原子并入派生索引；失败由实现方留 Signal，不阻塞读。 */
  syncIndex?: (atoms: import("../../contract/types.js").ParsedAtom[]) => void;
}

export interface ReadRequest {
  mode?: string;
  topic?: string;
  entry?: string;
  scope?: string[];
  limit?: number;
  maxTokens?: number;
  debug?: boolean;
  raw?: boolean;
  soul?: boolean;
  taste?: boolean;
  experience?: boolean;
  judgment?: boolean;
  verifyEvidence?: boolean;
  /** 读「项目事实」视图（从用户原话抽取的可核验 X=路径，带 Evidence 状态）。 */
  facts?: boolean;
  /** 投影视图（ADR-0024）：点 → 按 Observer lens 取景 → 组装「面」+ 显式盲区。 */
  project?: boolean;
  /** 读「相似过往任务」视图（历史任务卡 + 经验，按相关性+新近+重要性召回）。 */
  similar?: boolean;
  /** 按维读取（ADR-0026）：line / face / consciousness。 */
  dim?: string;
  /** 隐式偏好方向估计（hybrid 规则信号+稀疏 TF-IDF 质心）：返回「方向假设·非采纳」+ 可选候选排序。 */
  direction?: boolean;
  /** 候选方向文本（配合 direction：按偏移最小排序，仅排序用、非采纳）。 */
  candidates?: string[];
  /** 对 AI 的问询（ADR-0030）：组装多维背景 + 问题，供 AI 推出「0 偏移方向」；插件只组装证据与问题、不裁决。 */
  inquiry?: boolean;
  /** 大背景组装（query 聚合）：未来句 → 命中点归并成线 + 相关决策/口味 + 证据句柄。 */
  background?: boolean;
}

export interface ModeOutput {
  body: string;
  matched: number;
  returned: number;
  dropped: number;
  examples: string[];
  next?: string;
}

export interface ReadResult {
  text: string;
  mode: string;
  matched: number;
  returned: number;
  dropped: number;
}
