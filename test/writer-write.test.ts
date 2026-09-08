// dsh-shadow —— candidate 2：写侧 capture/materialize seam 组合回归测试。
// 用 mock fs 驱动 createShadowCollector 的 flush 落盘路径（此前写路径无测试覆盖）。
// 断言：push 累积 → onTurnStopping flush → 记忆文件落盘（含主入口 + 用户消息），无失败警告。
import assert from "node:assert/strict";
import { createShadowCollector } from "../dist/core/writer.js";

const files = new Map<string, string>();
const fs = {
  resolve: async (p: string) => p,
  writeText: async (p: string, text: string) => { files.set(p, text); },
  readText: async (p: string) => files.get(p) || "",
};
const context = { get: (k: string) => (k === "fs" ? fs : undefined) };
const config = {
  summary: { enabled: false },   // 避免触发 llm
  writeConsent: false,           // 不要求显式措辞 → 直接落盘
  forget: {},
  compact: {},
  retention: { enabled: false }, // registerMeta 早退，不读写 meta
};
const collector = createShadowCollector({ context, config, getAgentById: (id: string | undefined) => ({ id }) });

collector.push("agent1", { kind: "action", text: "改/读 spec/u8.md", comp: "spec/u8.md", source: "fs" });
collector.push("agent1", { kind: "user", text: "用户：记住这条用户消息", comp: "", source: "user" });
await collector.onTurnStopping({ agent: { id: "agent1" } });

assert.ok(files.size >= 1, "flush 应落盘 ≥1 个记忆文件");
const [rel, text] = [...files.entries()][0];
assert.ok(rel.includes(".shadow/"), "落盘路径应位于 .shadow/ 下（当前 .shadow/ fallback）");
assert.ok(text.length > 0, "记忆文件内容非空");
assert.ok(text.includes("spec/u8.md"), "文件内容含主入口（primaryComp=语义 comp）");
assert.ok(text.includes("用户"), "文件内容含用户消息");
assert.equal(collector.getFlushWarn(), "", "无落盘失败警告");

// 再推一条，onSessionFlush 兜底也在 pending 时落盘
collector.push("agent1", { kind: "action", text: "调用 read", comp: "read", source: "tool" });
await collector.onSessionFlush();
assert.ok(files.size >= 2, "onSessionFlush 兜底应再落盘 ≥1 文件");

console.log("✔ 场景 Writer-Write-1：capture/materialize seam 组合下 push→onTurnStopping/onSessionFlush→flush 落盘（candidate 2 深模块可测）");
console.log("ALL PASS ✅");
