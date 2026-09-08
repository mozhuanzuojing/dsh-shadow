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
}
/** 调用 LLM 流式接口并收集 text-delta 为一段文本；失败/中止/空路由 → ""。 */
export declare function streamText(context: any, route: LlmRoute | undefined, opts: StreamOpts): Promise<string>;
/** 组装一条 DSH LLM 请求消息（与 writer.ts 原实现的 message 形状一致）。 */
export declare function textMessage(id: string, text: string): any;
