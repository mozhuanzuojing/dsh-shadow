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
   * `detail` 必须**可诊断**（v1.15.94）：`aborted` 的失败事实在 `reason.failure` 上而不是
   * `reason.message` 上，取错了就恒为空（见 `finishDetailOf` 的注释）。
   */
  onSkip?: (reason: string, detail?: string) => void;
}

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
const finishDetailOf = (reason: any): string => {
  const f = reason?.failure;
  const parts = [String(reason?.message || ""), String(f?.code || ""), String(f?.message || "")];
  return parts.filter((s) => s.trim()).join(" · ").slice(0, 200);
};

/** 调用 LLM 流式接口并收集 text-delta 为一段文本；失败/中止/空路由 → ""。 */
export async function streamText(context: any, route: LlmRoute | undefined, opts: StreamOpts): Promise<string> {
  const llm = context.get("llm");
  // 三条**不进 catch** 的静默路径，现在都出声（见 `onSkip` 的注释）。
  if (!llm) { opts.onSkip?.("llm-service-unavailable", "context.get(\"llm\") 为空"); return ""; }
  if (!route) { opts.onSkip?.("no-route", "既无显式 provider/model，也取不到 agentDefaultModel.currentSelection()"); return ""; }
  const controller = new AbortController();
  // v1.15.94：记下「这次中止是**我们自己**的超时干的」—— 这是「自身超时」与「外部中断」
  // 唯一的判别依据（`opts` 里没有外部 signal），不记就只能在横幅上看到一句无信息量的 aborted。
  let selfTimedOut = false;
  const timer = setTimeout(() => { selfTimedOut = true; controller.abort(); }, opts.timeoutMs);
  try {
    let text = "";
    for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages: opts.messages, system: opts.system, maxTokens: opts.maxTokens, signal: controller.signal })) {
      if (!chunk) continue;
      if (chunk.type === "text-delta" && chunk.text) text += chunk.text;
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
