/** 调用 LLM 流式接口并收集 text-delta 为一段文本；失败/中止/空路由 → ""。 */
export async function streamText(context, route, opts) {
    const llm = context.get("llm");
    // 三条**不进 catch** 的静默路径，现在都出声（见 `onSkip` 的注释）。
    if (!llm) {
        opts.onSkip?.("llm-service-unavailable", "context.get(\"llm\") 为空");
        return "";
    }
    if (!route) {
        opts.onSkip?.("no-route", "既无显式 provider/model，也取不到 agentDefaultModel.currentSelection()");
        return "";
    }
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
                if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted") {
                    opts.onSkip?.(`llm-finish-${chunk.reason.kind}`, String(chunk.reason?.message || "").slice(0, 200));
                    return "";
                }
                break;
            }
        }
        return text;
    }
    catch (e) {
        // 保留旧的 label 日志（行为不变），并**额外**回传原因 —— 两者受众不同：
        // console.log 给开发者，onSkip 给**读者**（经降级台账 → flushWarn 横幅）。
        if (opts.label)
            console.log(`[dsh-shadow] ${opts.label} skipped:`, e && e.message);
        opts.onSkip?.("llm-error", (e && e.message) || String(e));
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
