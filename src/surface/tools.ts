/**
 * v2 surface — 工具定义与执行。schema 从描述符生成，不手写 128 个参数。
 */

import type { Outcome } from "../contract/outcome.js";
import { params, str, num, bool, type ToolSpec } from "../contract/schema.js";
import { runRead } from "../engine/read/route.js";
import type { ReadDeps, ReadRequest } from "../engine/read/types.js";
import { runToolset } from "../engine/toolset/run.js";
import type { ToolsetDeps } from "../engine/toolset/types.js";
import { renderPlain, renderReadOutcome } from "./format.js";
import type { ExecLike } from "./workspace.js";

export type DepsFactory = (exec: ExecLike | undefined) => Promise<Outcome<ReadDeps>>;

/**
 * 工具集依赖工厂：与读侧 deps 分开 —— 台账不需要工作区/索引，
 * 唯一需要的外部依赖是「宿主审批通道（惰性取，可能没有）」与 exec.agent。
 */
export type ToolsetDepsFactory = (exec: any) => ToolsetDeps;

export interface RegisteredTool extends ToolSpec {
  output: { schema: { type: "string" }; render: (args: unknown, value: string) => { type: "text"; text: string }[] };
  execute: (args: Record<string, unknown>, exec: any) => Promise<string>;
}

const renderText = (_args: unknown, value: string): { type: "text"; text: string }[] => [{ type: "text", text: value }];

const toRequest = (args: Record<string, unknown>): ReadRequest => ({
  mode: typeof args.mode === "string" ? args.mode : undefined,
  topic: typeof args.topic === "string" ? args.topic : undefined,
  entry: typeof args.entry === "string" ? args.entry : undefined,
  scope: Array.isArray(args.scope) ? args.scope.map(String) : undefined,
  limit: typeof args.limit === "number" ? args.limit : undefined,
  maxTokens: typeof args.max_tokens === "number" ? args.max_tokens : undefined,
  debug: args.debug === true,
  raw: args.raw === true,
  soul: args.soul === true,
  taste: args.taste === true,
  experience: args.experience === true,
  judgment: args.judgment === true,
  verifyEvidence: args.verifyEvidence === true,
  facts: args.facts === true,
});

const executeRead = async (depsFactory: DepsFactory, args: Record<string, unknown>, exec: any): Promise<string> => {
  try {
    const d = await depsFactory(exec as ExecLike | undefined);
    if (!d.ok) return renderPlain(`> ⚠ shadow 不可用（${d.error.code}）：${d.error.message}`);
    const r = await runRead(d.value, toRequest(args));
    return renderReadOutcome(r, d.value.signals);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return renderPlain(`> ⚠ shadow 内部错误：${message}\n> 这是失败，不是「没有记忆」；请保留此消息并检查 .shadow/ 与索引。`);
  }
};

export const makeReadTool = (depsFactory: DepsFactory): RegisteredTool => ({
  name: "read_shadow",
  description:
    "读取 agent 的投影记忆空间（.shadow/atoms 与 indexes/）。无参返回索引；带 topic/entry 分层穿透；10 个核心 mode。" +
    "只读、可核查；未知 mode 显式失败。需要精细的跨类型/主题上下文时用 shadow_query，任务恢复用 recall_shadow。",
  parameters: params({
    topic: str("要穿透的主题/入口（路径片段、组件名、决策词）。"),
    entry: str("按入口精确过滤（如 src/auth.ts）。"),
    mode: str("核心 mode：recovery / query / episode / decision / task / context / knowledge / query-log / shadow-report / shadow-manifest。不传=索引或主题召回。", { enum: ["recovery", "query", "episode", "decision", "task", "context", "knowledge", "query-log", "shadow-report", "shadow-manifest"] }),
    limit: num("最多返回条数（默认 10，钳 1..30）。"),
    max_tokens: num("返回预算（粗略 token，默认 1600，钳 256..8000；字符=×4）。"),
    debug: bool("返回召回计数/打分拆解（不改变结果）。"),
    raw: bool("主题召回不套灵魂规避滤，看原文（v2 预留）。"),
    soul: bool("读 curated Soul 投影（.shadow/soul/soul.json）。"),
    taste: bool("读 curated Taste 偏好（.shadow/taste/taste.json）。"),
    experience: bool("从记忆派生结构化 Experience。"),
    judgment: bool("从决策记忆派生 Judgment。"),
    verifyEvidence: bool("用 Evidence Gateway 验证材料路径；缺件报 unavailable，不静默当 verified。"),
    facts: bool("读「项目事实」视图：从用户原话抽的「X 是/=/：<路径>」，逐条带 Evidence 状态（✓verified / ✗not_found / ?unavailable）。"),
  }),
  output: { schema: { type: "string" }, render: renderText },
  execute: async (args, exec) => executeRead(depsFactory, args, exec),
});

export const makeRecallTool = (depsFactory: DepsFactory): RegisteredTool => ({
  name: "recall_shadow",
  description:
    "人类友好的「记忆恢复」入口：给一句自然语言查询，返回任务恢复包（内部 = read_shadow mode:recovery）。" +
    "内容全部来自派生数据，不 LLM 补写；limit 真正生效。",
  parameters: params({
    query: str("自然语言查询（任务/主题/入口，如『上次 auth 问题』）。"),
    limit: num("最多返回的任务数（默认 1）。"),
  }),
  output: { schema: { type: "string" }, render: renderText },
  execute: async (args, exec) =>
    executeRead(depsFactory, { mode: "recovery", topic: String(args.query ?? "").trim(), limit: args.limit }, exec),
});

export const makeQueryTool = (depsFactory: DepsFactory): RegisteredTool => ({
  name: "shadow_query",
  description:
    "跨类型的统一记忆查询：给定 query 与可选 scope（memory/decision/document/concept/resource），返回带 evidence 的 ShadowNode 视图。" +
    "Node 是派生投影，不是事实源。",
  parameters: params({
    query: str("查询词。"),
    scope: { type: "array", description: "限定类型：memory/decision/document/concept/resource。", items: str("类型") },
    limit: num("最多返回条数（默认 8）。"),
  }),
  output: { schema: { type: "string" }, render: renderText },
  execute: async (args, exec) =>
    executeRead(depsFactory, { mode: "query", topic: String(args.query ?? "").trim(), scope: args.scope, limit: args.limit }, exec),
});

/**
 * 工具集台账入口：surface 只做「参数 → engine → 文本」。
 *
 * 为什么**不走**读侧 depsFactory：台账不读 .shadow、不打开索引、不解析工作区；
 * 它只需要「宿主审批通道（惰性取）」与 exec.agent（审批凭据）。
 * 探测/安装/渲染全在 engine/toolset；这里只负责把失败转成可见文本 + Signal。
 */
export const makeToolsetTool = (toolsetFactory?: ToolsetDepsFactory): RegisteredTool => ({
  name: "shadow_toolset",
  description:
    "工具集台账（真实能力目录）：默认只读巡检，只探测插件内接线项；survey:\"all\" 才并行探测全部 reference。" +
    "need 按能力需求预检（只读、不安装）；install 是外部副作用——必须显式指定、先经宿主 allowed-once 审批，" +
    "未授予一律不装并给可复制命令；装后重新探测再报，不凭退出码宣称成功。" +
    "探测失败只说「未检出」，不等于「未安装」（PATH 是宿主进程启动时的快照）。参数优先级：install > need > survey/category。",
  parameters: params({
    survey: str("providers（默认，只探插件内接线项）或 all（并行探测全部条目）。"),
    category: str("只列某个分类（如「搜索与查找」）；未知分类显式失败。"),
    need: { type: "array", description: "按能力需求反查并预检（如 [\"全文搜索\"]）；只读、不安装。", items: str("能力") },
    install: str("显式安装某个条目的 CLI（需宿主 allowed-once 审批；无审批/拒绝/取消一律不装）。"),
  }),
  output: { schema: { type: "string" }, render: renderText },
  execute: async (args, exec) => {
    // 依赖工厂也放进 try：宿主服务未就绪时给可见失败，而不是把异常抛给工具调用栈。
    let deps: ToolsetDeps | undefined;
    try {
      deps = toolsetFactory ? toolsetFactory(exec) : { agent: exec?.agent };
      const r = await runToolset(deps, args);
      if (!r.ok) {
        // 非法输入是可见的「拒绝」（错误文本已说明），不算降级；只有内部失败才留能力降级 Signal。
        if (r.error.code === "INTERNAL") {
          deps.signals?.note("toolset", r.error.code, r.error.message, "本次工具集结果不可用：这是失败，不是「没有工具」。");
        }
        return renderPlain(`> ⚠ shadow_toolset 失败（${r.error.code}）：${r.error.message}`, deps.signals);
      }
      deps.signals?.clear("toolset");
      return renderPlain(r.value, deps.signals);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deps?.signals?.note("toolset", "INTERNAL", message, "本次工具集结果不可用：这是失败，不是「没有工具」。");
      return renderPlain(`> ⚠ shadow_toolset 内部错误：${message}`, deps?.signals);
    }
  },
});

export const makeCoreTools = (depsFactory: DepsFactory, toolsetFactory?: ToolsetDepsFactory): RegisteredTool[] => [
  makeReadTool(depsFactory),
  makeRecallTool(depsFactory),
  makeQueryTool(depsFactory),
  makeToolsetTool(toolsetFactory),
];
