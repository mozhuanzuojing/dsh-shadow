// dsh-shadow v2 — 配置接线 e2e：toolset.enabled / forget.* 不再是「读了但不生效」的占位。
//
// 为什么单独一个文件：这两处在 2.0.0 里是 warnings 占位（配置被读取但不改变行为）。
// 接线后必须证明「配置真的改变了行为」，否则又是 v1 ADR-0062 那种「执行对、入口没接」的假完成。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../../dist/index.js";
import { normalizeConfig } from "../../dist/contract/config.js";

// ① normalizeConfig：toolset / forget 不再报「尚未接线」
const cfg = normalizeConfig({ shadowRoot: "/ws", toolset: { enabled: false }, forget: { staleDays: 30, minHits: 2 } });
assert.deepEqual(cfg.warnings, [], `不再有未接线 warning，实际：${JSON.stringify(cfg.warnings)}`);
assert.equal(cfg.toolset.enabled, false);
assert.equal(cfg.forget.staleDays, 30);
assert.equal(cfg.forget.minHits, 2);

const makeCtx = (): { ctx: any; tools: Map<string, any> } => {
  const tools = new Map<string, any>();
  const services: any = {
    tools: { register: (def: any) => tools.set(def.name, def) },
    systemPrompt: { context: () => {} },
  };
  return {
    tools,
    ctx: {
      get: (k: string) => services[k],
      on: () => () => {},
      inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
    },
  };
};

const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-config-"));
try {
  // ② 默认：shadow_toolset 注册（4 工具）
  const a = makeCtx();
  const cleanupA = apply(a.ctx, { shadowRoot: ws });
  try {
    assert.ok(a.tools.has("shadow_toolset"), "默认应注册 shadow_toolset");
    assert.ok(a.tools.has("read_shadow") && a.tools.has("recall_shadow") && a.tools.has("shadow_query"));
  } finally {
    cleanupA();
  }

  // ③ toolset.enabled:false：不注册台账，其余工具不受影响
  const b = makeCtx();
  const cleanupB = apply(b.ctx, { shadowRoot: ws, toolset: { enabled: false } });
  try {
    assert.ok(!b.tools.has("shadow_toolset"), "toolset.enabled:false 不得注册 shadow_toolset");
    assert.ok(b.tools.has("read_shadow"), "其余 core 工具不受影响");
    assert.equal(b.tools.size, 3, `应只剩 3 个 core 工具，实际 ${[...b.tools.keys()].join(",")}`);
  } finally {
    cleanupB();
  }
} finally {
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ e2e config：toolset.enabled:false 不注册台账（其余 3 工具仍在）· forget/toolset 不再报未接线 warning");
