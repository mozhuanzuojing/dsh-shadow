/**
 * v2 surface — 工具定义与执行。schema 从描述符生成，不手写 128 个参数。
 */

import type { Outcome } from "../contract/outcome.js";
import { params, str, num, bool, type ToolSpec } from "../contract/schema.js";
import { runRead } from "../engine/read/route.js";
import type { ReadDeps, ReadRequest } from "../engine/read/types.js";
import { renderPlain, renderReadOutcome } from "./format.js";
import type { ExecLike } from "./workspace.js";

export type DepsFactory = (exec: ExecLike | undefined) => Promise<Outcome<ReadDeps>>;

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
});

const executeRead = async (depsFactory: DepsFactory, args: Record<string, unknown>, exec: any): Promise<string> => {
  const d = await depsFactory(exec as ExecLike | undefined);
  if (!d.ok) return renderPlain(`> ⚠ shadow 不可用（${d.error.code}）：${d.error.message}`);
  const r = await runRead(d.value, toRequest(args));
  return renderReadOutcome(r, d.value.signals);
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

export const makeToolsetTool = (depsFactory: DepsFactory): RegisteredTool => ({
  name: "shadow_toolset",
  description:
    "工具集台账/能力预检（v2 Phase 1 尚未移植）。当前版本显式报 unavailable，不伪造探测结果；安装需显式请求 + 宿主审批。",
  parameters: params({
    survey: str("providers（默认）或 all。"),
    category: str("只列某个分类。"),
    need: { type: "array", description: "按能力需求反查（如 [\"全文搜索\"]）。", items: str("能力") },
    install: str("显式安装某个条目的 CLI（需宿主 allowed-once 审批）。"),
  }),
  output: { schema: { type: "string" }, render: renderText },
  execute: async (args, exec) => {
    const d = await depsFactory(exec as ExecLike | undefined);
    const sig = d.ok ? d.value.signals : undefined;
    if (args.install) return renderPlain("（shadow_toolset 的安装面在 v2 Phase 1 尚未移植；本版不执行任何安装，也不伪造结果。）", sig);
    return renderPlain("（shadow_toolset 在 v2 Phase 1 尚未移植；本版不探测、不编造命令。用 `need` 的旧行为在 lab 落地前不可用。）", sig);
  },
});

export const makeCoreTools = (depsFactory: DepsFactory): RegisteredTool[] => [
  makeReadTool(depsFactory),
  makeRecallTool(depsFactory),
  makeQueryTool(depsFactory),
  makeToolsetTool(depsFactory),
];
