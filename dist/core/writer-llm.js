/**
 * 把 `finish` 的 reason 变成**可诊断**的一行（T8-A 补，v1.15.94）。
 *
 * 为什么不能只取 `reason.message`：宿主把 `error` / `aborted` 的失败事实放在 **`reason.failure`**
 * 上（`dsh-llm/lib/types/types.d.ts`：`'aborted': { kind: 'aborted'; failure: LlmFailure }`，
 * `LlmFailure` = `{ message, code, status? }`），而 `message` 只是**部分** reason 才有的字段
 * ⇒ 旧实现 `String(chunk.reason?.message || "")` 对 `aborted` **恒为空串**，
 * 于是横幅上只剩「llm-finish-aborted」，读者无法区分「本插件自己 8 秒超时」与「外部中断」。
 * 现在把 `code` / `message` 一并带出来（`failure` 缺失时退回 `message`，既有 `error` 路径的输出不变）。
 */
const finishDetailOf = (reason) => {
    const f = reason?.failure;
    const parts = [String(reason?.message || ""), String(f?.code || ""), String(f?.message || "")];
    return parts.filter((s) => s.trim()).join(" · ").slice(0, 200);
};
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
    // v1.15.94：记下「这次中止是**我们自己**的超时干的」—— 这是「自身超时」与「外部中断」
    // 唯一的判别依据（`opts` 里没有外部 signal），不记就只能在横幅上看到一句无信息量的 aborted。
    let selfTimedOut = false;
    const timer = setTimeout(() => { selfTimedOut = true; controller.abort(); }, opts.timeoutMs);
    try {
        let text = "";
        for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages: opts.messages, system: opts.system, maxTokens: opts.maxTokens, signal: controller.signal })) {
            if (!chunk)
                continue;
            if (chunk.type === "text-delta" && chunk.text)
                text += chunk.text;
            else if (chunk.type === "finish") {
                if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted") {
                    const detail = [selfTimedOut ? `本插件超时（${opts.timeoutMs}ms）主动中止` : "", finishDetailOf(chunk.reason)].filter(Boolean).join(" · ");
                    opts.onSkip?.(`llm-finish-${chunk.reason.kind}`, detail.slice(0, 200));
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
