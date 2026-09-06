// dsh-shadow —— query/types.ts：read_shadow 查询的依赖注入契约（Phase 5）。
import type { EvidenceRef, EvidenceResult, ShadowConfig } from "../core/types.js";

export interface ShadowQueryDeps {
  fs: any;
  config: ShadowConfig;
  cwdBySession: ReadonlyMap<string, string>;
  /** 动态取落盘失败提示（lastFlushError → flushWarn）。 */
  getFlushWarn: () => string;
  /** 证据验证（经 config.evidenceProvider 路由到 fs/zg/自定义 provider）。 */
  verifyEvidence: (ref: EvidenceRef, ctx: any) => Promise<EvidenceResult>;
  /** 召回扩词（闭包：recallCfg + llm + routeFor）。 */
  expandTerms: (topic: string) => Promise<string[]>;
}
