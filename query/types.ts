// dsh-shadow —— query/types.ts：read_shadow 查询的依赖注入契约（Phase 5）。
import type { GatewayEvidenceRef, EvidenceResult, RecallCandidate, ShadowConfig } from "../core/types.js";

export interface ShadowQueryDeps {
  fs: any;
  config: ShadowConfig;
  cwdBySession: ReadonlyMap<string, string>;
  /** 动态取落盘失败提示（lastFlushError → flushWarn）。 */
  getFlushWarn: () => string;
  /** 证据验证（经 config.evidenceProvider 路由到 fs/zg/自定义 provider）。 */
  verifyEvidence: (ref: GatewayEvidenceRef, ctx: any) => Promise<EvidenceResult>;
  /** 召回扩词（闭包：recallCfg + llm + routeFor）。 */
  expandTerms: (topic: string) => Promise<string[]>;
  /** recall_shadow 的 LLM 回导航（v1.6）：给候选任务，LLM 选最相关编号；失败返回 []（回退确定性）。 */
  recallSelect?: (query: string, candidates: RecallCandidate[]) => Promise<number[]>;
  /** Knowledge Engine 的 LLM 树上导航（v1.10.0，PageIndex `chat=` 步）：给候选章节，LLM 选编号；失败 []（回退确定性检索）。 */
  knowledgeNavigate?: (query: string, candidates: { id: string; title: string; content: string }[]) => Promise<number[]>;
  /** 懒构建索引：read_shadow 无参读索引前调用（flush 只置 dirty，不重建）。 */
  ensureIndex: (ws: string) => Promise<void>;
}
