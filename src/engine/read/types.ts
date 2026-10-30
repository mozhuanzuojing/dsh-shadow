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
  /** 读「相似过往任务」视图（历史任务卡 + 经验，按相关性+新近+重要性召回）。 */
  similar?: boolean;
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
