// dsh-shadow —— T6 ②：兜底根写入「未受会话授权」的**可见信号**（adr/0074 的已知空白）。
// 判据对齐 core/writer/core.ts 的 lastFlushError：非 fallback **一律不置**（否则告警变噪声 ⇒ 被习惯性忽略）。
import assert from "node:assert/strict";
import { noteFallbackScope, resolveShadowScope } from "../dist/core/scope.js";

const empty = new Map<string, string>();

// ① 正对照：**无 session + 无显式 root** ⇒ fallback ⇒ 必须置信号，且话说清「未受会话授权」
{
  const core: any = {};
  const scope = resolveShadowScope(undefined, empty, {});
  assert.equal(scope.scope, "fallback", "无 session 且无显式 root 时应落到兜底根");
  assert.equal(noteFallbackScope(core, scope), true, "落到兜底根 ⇒ 必须置信号（返回 true）");
  assert.ok(core.lastScopeNotice && typeof core.lastScopeNotice.note === "string", "信号应落在 lastScopeNotice 上");
  assert.match(core.lastScopeNotice.note, /未受会话授权/, "信号必须说清「未受会话授权」");
  assert.match(core.lastScopeNotice.note, /兜底根/, "信号必须点名是兜底根");
}

// ② 负对照：**有显式 root** ⇒ 不得置信号、不得写任何东西
{
  const core: any = {};
  const scope = resolveShadowScope(undefined, empty, { shadowRoot: "C:/snb" });
  assert.equal(scope.scope, "explicit");
  assert.equal(noteFallbackScope(core, scope), false, "显式 root 不得置信号");
  assert.equal(core.lastScopeNotice, undefined, "不得写任何东西");
}

// ③ 负对照：**session cwd 可得** ⇒ 同样不得置信号
{
  const core: any = {};
  const scope = resolveShadowScope({ session: { header: { cwd: "D:/project" } } } as any, empty, {});
  assert.equal(scope.scope, "implicit");
  assert.equal(noteFallbackScope(core, scope), false, "session cwd 可得时不得置信号");
}

console.log("✔ T6 ② 兜底根信号：① 无 session 置信号 / ② 显式 root 不置 / ③ session cwd 不置 —— 全部通过");
