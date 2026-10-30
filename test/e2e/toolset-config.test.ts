// dsh-shadow v2 — 配置 e2e：功能全部启用、无开关；旧 enabled 键只作为未知键告警、不能关功能。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../../dist/index.js";
import { normalizeConfig } from "../../dist/contract/config.js";

// ① normalizeConfig：forget 生效；旧 toolset/lab/autoRecall.enabled 归入未知键（不再有开关）
const cfg = normalizeConfig({ shadowRoot: "/ws", forget: { staleDays: 30, minHits: 2 } });
assert.deepEqual(cfg.warnings, [], `不应有未接线 warning：${JSON.stringify(cfg.warnings)}`);
assert.equal(cfg.forget.staleDays, 30);
assert.equal(cfg.forget.minHits, 2);

const legacy = normalizeConfig({ shadowRoot: "/ws", toolset: { enabled: false }, lab: { enabled: false }, autoRecall: { enabled: false } } as any);
assert.ok(legacy.warnings.some((w) => w.includes("toolset")), "旧 toolset 开关应作为未知键告警");
assert.ok(legacy.warnings.some((w) => w.includes("lab")), "旧 lab 开关应作为未知键告警");

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
  // ② 默认：core 6 + lab 1 全部注册（无开关）
  const a = makeCtx();
  const cleanupA = apply(a.ctx, { shadowRoot: ws });
  try {
    for (const name of ["read_shadow", "recall_shadow", "shadow_query", "recall_similar", "search_code", "shadow_toolset", "shadow_lab"]) {
      assert.ok(a.tools.has(name), `应始终注册 ${name}`);
    }
    assert.equal(a.tools.size, 7, `应为 7 个工具，实际 ${[...a.tools.keys()].join(",")}`);
  } finally {
    cleanupA();
  }

  // ③ 旧配置 enabled:false 不再能关闭任何功能
  const b = makeCtx();
  const cleanupB = apply(b.ctx, { shadowRoot: ws, toolset: { enabled: false }, lab: { enabled: false } } as any);
  try {
    assert.ok(b.tools.has("shadow_toolset"), "旧 toolset.enabled:false 不应再关闭台账");
    assert.ok(b.tools.has("shadow_lab"), "旧 lab.enabled:false 不应再关闭 lab");
    assert.equal(b.tools.size, 7);
  } finally {
    cleanupB();
  }
} finally {
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ e2e config：功能全启用（7 工具）· 旧 enabled 开关只告警、不能关闭功能");
