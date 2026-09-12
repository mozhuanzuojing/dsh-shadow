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
export async function streamText(context: any, route: LlmRoute | undefined, opts: StreamOpts): Promise<string> {
  const llm = context.get("llm");
  // 三条**不进 catch** 的静默路径，现在都出声（见 `onSkip` 的注释）。
  if (!llm) { opts.onSkip?.("llm-service-unavailable", "context.get(\"llm\") 为空"); return ""; }
  if (!route) { opts.onSkip?.("no-route", "既无显式 provider/model，也取不到 agentDefaultModel.currentSelection()"); return ""; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let text = "";
    for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages: opts.messages, system: opts.system, maxTokens: opts.maxTokens, signal: controller.signal })) {
      if (!chunk) continue;
      if (chunk.type === "text-delta" && chunk.text) text += chunk.text;
      else if (chunk.type === "finish") {
        if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted") {
          opts.onSkip?.(`llm-finish-${chunk.reason.kind}`, String(chunk.reason?.message || "").slice(0, 200));
          return "";
        }
        break;
      }
    }
    return text;
  } catch (e: any) {
    // 保留旧的 label 日志（行为不变），并**额外**回传原因 —— 两者受众不同：
    // console.log 给开发者，onSkip 给**读者**（经降级台账 → flushWarn 横幅）。
    if (opts.label) console.log(`[dsh-shadow] ${opts.label} skipped:`, e && e.message);
    opts.onSkip?.("llm-error", (e && e.message) || String(e));
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** 组装一条 DSH LLM 请求消息（与 writer.ts 原实现的 message 形状一致）。 */
export function textMessage(id: string, text: string): any {
  return { id, role: "user", content: [{ type: "text", text }], source: { kind: "plugin", plugin: "dsh-shadow" } };
}
