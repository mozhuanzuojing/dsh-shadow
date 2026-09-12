export interface LlmRoute {
    provider: string;
    model: string;
}
export interface StreamOpts {
    /** 日志标签（仅 summarize/recall-expand 调用方传，用于 console.log；其余传空则不记）。 */
    label: string;
    system: string;
    messages: any[];
    maxTokens: number;
    timeoutMs: number;
    /**
     * **跳过/失败原因回传**（T8-A / ADR-0049 可见信号，v1.15.65）。
     *
     * 为什么必须有它：旧契约里「失败 → `""`」，而**唯一**的痕迹是
     * `if (opts.label) console.log(...)` —— 两个后果：
     *   ① `label: ""` 的调用方（`recallSelect` / `knowledgeNavigate`）**连 log 都没有**；
     *   ② 更根本的是 `console.log` **本来就不算** ADR-0049 认可的可见信号，
     *      而 `!llm || !route` 与 `finish.reason.kind === "error"|"aborted"` 两条路径
     *      **从不进 catch** ⇒ 即使有 label 也不会出声。
     * 有了它，调用方才能把「为什么没有结果」记进降级台账、渲染到读者眼前。
     *
     * **无论 `label` 是否为空都会被调用** —— 这正是它与 `label` 的分工差别。
     */
    onSkip?: (reason: string, detail?: string) => void;
}
/** 调用 LLM 流式接口并收集 text-delta 为一段文本；失败/中止/空路由 → ""。 */
export declare function streamText(context: any, route: LlmRoute | undefined, opts: StreamOpts): Promise<string>;
/** 组装一条 DSH LLM 请求消息（与 writer.ts 原实现的 message 形状一致）。 */
export declare function textMessage(id: string, text: string): any;
