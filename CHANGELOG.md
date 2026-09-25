# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.26] `T6` ② 实现：兜底根写入「未受会话授权」的**可见信号**（含标定）

**代码面；正常路径行为不变**（只在落到兜底根时**多一条可见告知**）。

### 做了什么（4 文件 + 1 标定）
- `core/scope.ts`：新增 `noteFallbackScope(core, scope)` —— **纯函数**，`scope !== "fallback"` 时**一律不写**
  （否则告警变噪声 ⇒ 会被习惯性忽略）。
- `core/writer/core.ts`：加 `lastScopeNotice`（声明 + 初值），形态与 `lastFlushError` 并列。
- `core/writer/materialize.ts`：写侧改用 `resolveShadowScope`（与 `resolveWorkspace` **同源**，见 `scope.ts`），
  落到兜底根时**置信号 + `console.error`**（对齐紧邻的 `lastFlushError` 两件套）。
- `core/writer/index.ts`：读侧出口加 `if (core.lastScopeNotice) parts.push(…)` —— **这就是「可见」的实现**
  （否则等于把 `②` 做回了 `③`）。
- **标定** `test/scope-fallback-notice.test.ts`：① 无 session + 无显式 root ⇒ **置信号**且话说清「未受会话授权」·
  ② 有显式 root ⇒ **不置**且不写任何东西 · ③ session cwd 可得 ⇒ **不置**。

### 决策与留痕
`T6` 的三选一在 `v1.21.24` 定为 **②**（保留兜底根 + 显式可见信号），理由：贴合 `ADR-0049`「缺件不静默」、
不改 `scope.ts`「保证**可写**，而非不写」的口径、形态可对齐 `lastFlushError`（**加法**而非改契约）。本版把决策**执行完**。

### 过程诚实记录（本会话第四次「自身出错」）
本版落盘**连续两次被自己的守卫拦住**（`≠1 拒绝写盘`）：第一次是 `materialize.ts` 的锚点**缩进写错**
（我按 6 空格写，实际 4 空格）；另一条锚点也各拦过一次。**两次都什么都没写** ⇒ 仓库始终干净 ——
这正是「**批量改写必须打印匹配数、≠1 拒绝写盘**」这条纪律的价值所在。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 脚本语言门；唯一验证入口 `npm run verify`。
- **下一批**：`T9` → `T11` → `T13` 后半（须先立 ADR）→ `T17-C` → `T18` → `T21`。
- **仍等你**：`D2` 填可信根（只有人能加）· `6.3 待定语义`（明写「不修，需先拍板」）。
