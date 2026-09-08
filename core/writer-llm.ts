// dsh-shadow —— core/writer-llm.ts：写侧 LLM 流式调用 seam（v1.16，candidate 2 第一刀）。
// 收敛 writer.ts 中重复 4 次的 LLM stream scaffold（summarizeTurn/expandTerms/recallSelect/knowledgeNavigate 的
// 形状几乎一致：构建消息 → AbortController+超时 → stream 收集 text-delta → finish 中止/出错 → finally clear）。
// 只封装「流式拿回文本」这一件事；调用方各自解析/兜底（行为与 writer.ts 原实现逐字一致）。
// 契约：route 缺失 / llm 缺失 / finish 出错或中止 → 返回 ""（调用方按空值回退），绝不抛异常。
import type { ShadowConfig } from "./types.js";

export interface LlmRoute { provider: string; model: string }

export interface StreamOpts {
  /** 日志标签（仅 summarize/recall-expand 调用方传，用于 console.log；其余传空则不记）。 */
  label: string;
  system: string;
  messages: any[];
  maxTokens: number;
  timeoutMs: number;
}

/** 调用 LLM 流式接口并收集 text-delta 为一段文本；失败/中止/空路由 → ""。 */
export async function streamText(context: any, route: LlmRoute | undefined, opts: StreamOpts): Promise<string> {
  const llm = context.get("llm");
  if (!llm || !route) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let text = "";
    for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages: opts.messages, system: opts.system, maxTokens: opts.maxTokens, signal: controller.signal })) {
      if (!chunk) continue;
      if (chunk.type === "text-delta" && chunk.text) text += chunk.text;
      else if (chunk.type === "finish") {
        if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted") return "";
        break;
      }
    }
    return text;
  } catch (e: any) {
    if (opts.label) console.log(`[dsh-shadow] ${opts.label} skipped:`, e && e.message);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** 组装一条 DSH LLM 请求消息（与 writer.ts 原实现的 message 形状一致）。 */
export function textMessage(id: string, text: string): any {
  return { id, role: "user", content: [{ type: "text", text }], source: { kind: "plugin", plugin: "dsh-shadow" } };
}
