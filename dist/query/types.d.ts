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
    knowledgeNavigate?: (query: string, candidates: {
        id: string;
        title: string;
        content: string;
    }[]) => Promise<number[]>;
    /** 懒构建索引：read_shadow 无参读索引前调用（flush 只置 dirty，不重建）。
     *  `session` 用于解析**该会话自己的**沙箱策略（ADR-0074）：读侧也会写盘，缺它会被沙箱围栏拒绝。 */
    ensureIndex: (ws: string, session?: any) => Promise<void>;
    /**
     * 宿主审批服务（懒取，可能 undefined）。**只给 `mode:"toolset"` 的显式安装用**：
     * 「一键装」是有后果的动作，必须拿到 `allowed-once` 才执行（ADR-0029.1 inv 178 / ADR-0030 inv 182）。
     * 缺该服务 → 安装一律 fail closed，只输出命令，不代装。
     */
    get approval(): any;
}
