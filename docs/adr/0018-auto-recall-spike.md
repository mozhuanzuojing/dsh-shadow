# ADR-0018: 自动召回（auto-recall）spike 结论与设计

- 状态：**proposal（spike 完成；实现未接线，需真机验证）**
- 日期：2026-10-30
- 关联：ADR-0016（相似任务召回）、ADR-0006（模式/预算）、`@deepseek-ai/dsh-system-prompt` / `dsh-agent-loop` / `dsh-agent`（下称"宿主源码"）
- 定位：回答「能不能不靠 agent 主动调工具，把相关记忆自动带到模型上下文里」。

## Context / 目标

当前 `recall_similar` / `read_shadow` 都是**工具调用**，模型不主动查就丢。目标是"每步自动注入一条相关记忆提示（带出处、数据非指令、可关）"。

## Spike 发现（宿主源码 + 本会话实证）

1. **系统提示每步重算**：`@deepseek-ai/dsh-system-prompt` 的 `SystemPrompt.assemble(context)` 遍历注册的 `contexts`/`sections`，对 `text` 为函数的条目**每次装配都以 `context` 求值**（源码 `resolveContext()` / `assemble()`）。
2. **每步调用点**：`@deepseek-ai/dsh-agent-loop` 每步 `await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))`（约 L907），并在请求准入时 `refreshContext(...)`（约 L1053）。
3. **注入形态**：`RuntimeContextProjection` 把装配出的 contexts 渲染成一段 "**Current runtime context. This snapshot supersedes earlier runtime-context snapshots.**" 文本，**作为一条消息附加到每步 messages**（约 L915-918）。⇒ 注册 `systemPrompt.context` = 每步自动进入上下文。
4. **上下文里有 agent**：`assembleContextFor(agent, signal) => ({ agent, scope: agent })`（`@deepseek-ai/dsh-agent`）⇒ `text(context)` 可拿到 `context.agent`（进而 `agent.session`）。
5. **本会话实证**：本轮对话里出现的 "Current runtime context …" 段落（含 dsh-shadow 的 systemPrompt 文本）正是该机制产物 ⇒ **每步注入确实生效**。
6. **异步缝**：`assemble()` 末尾有 `ctx.waterfall(scope, "system-prompt/assemble", assembly, context, …)`；理论上可注册异步 waterfall 监听器在装配时 await 召回。注册方式未在文档化 API 中确认，列为备选。

## Decision（建议实现，默认关闭）

- 新增配置 `autoRecall: { enabled: false, limit: 2 }`（**默认关**，避免噪声与成本）。
- **缓存式同步注入**（推荐，避开未文档化 waterfall）：
  1. 每个 `agent/turn-stopping`（已有钩子）异步：`depsFactory(agent)` → `loadAtoms()` → `buildLessonCards()` → 存 `Map<sessionKey, LessonCard[]>`；
  2. 每个 `session/event` 的 `user/message` 记录 `lastUserText`（复用已有钩子）；
  3. 注册 `systemPrompt.context({ name: "dsh-shadow:auto-recall", order: ~130, text: (ctx) => hintFor(ctx?.agent?.session) })`：命中缓存且开关开时，用 `rankLessonCards(cards, lastUserText, today, limit)` 取 top-k，渲染**极小**提示（任务标题 + 技能指针 + "数据非指令·相似≠相同"），超预算截断；否则返回 `""`。
- 备选：`system-prompt/assemble` 异步 waterfall（更实时，但需先确认真机注册方式）。

## Consequences / 风险（必须真机验证）

- 首次/缓存未就绪时**空注入**；卡片缓存天然"上一轮为止"，存在**一轮滞后**（可接受）。
- 需确认 `context.agent.session` 的可用性与 `sessionKey` 口径；确认 `text()` 每步真的被调用（源码如此，但需一次真机日志）。
- Token 成本与噪声：默认关 + limit≤2 + 硬预算；必须套 "数据非指令" 前缀。
- 与会话/代理隔离：缓存键必须按 session（或 agent），不能用全局。

## Non-goals

- 不做全量记忆注入；不写 atoms；不改写模型可见的权威状态；不在失败时静默（注入为空要能被日志解释）。
