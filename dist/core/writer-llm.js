/** 调用 LLM 流式接口并收集 text-delta 为一段文本；失败/中止/空路由 → ""。 */
export async function streamText(context, route, opts) {
    const llm = context.get("llm");
    if (!llm || !route)
        return "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
        let text = "";
        for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages: opts.messages, system: opts.system, maxTokens: opts.maxTokens, signal: controller.signal })) {
            if (!chunk)
                continue;
            if (chunk.type === "text-delta" && chunk.text)
                text += chunk.text;
            else if (chunk.type === "finish") {
                if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted")
                    return "";
                break;
            }
        }
        return text;
    }
    catch (e) {
        if (opts.label)
            console.log(`[dsh-shadow] ${opts.label} skipped:`, e && e.message);
        return "";
    }
    finally {
        clearTimeout(timer);
    }
}
/** 组装一条 DSH LLM 请求消息（与 writer.ts 原实现的 message 形状一致）。 */
export function textMessage(id, text) {
    return { id, role: "user", content: [{ type: "text", text }], source: { kind: "plugin", plugin: "dsh-shadow" } };
}
