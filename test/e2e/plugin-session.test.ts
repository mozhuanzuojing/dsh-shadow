import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../../dist/index.js";
import { hostFs } from "../host-fs.ts";

const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-v2-session-"));
const handlers = new Map<string, Function>();
const tools = new Map<string, any>();
const agents = new Map<string, any>([["s1", { id: "a1", session: { header: { cwd: ws } } }]]);
const services: any = {
  tools: { register: (def: any) => tools.set(def.name, def) },
  systemPrompt: { context: () => {} },
  agents: { get: (id: string) => agents.get(id), currentInitiator: () => null },
  fs: hostFs,
};
const ctx: any = {
  get: (k: string) => services[k],
  on: (name: string, fn: Function) => { handlers.set(name, fn); return () => {}; },
  inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
};

// 关键：不配 shadowRoot；session id = s1，agent id = a1，二者不同
const cleanup = apply(ctx, {});
try {
  await handlers.get("session/event")!({ id: "s1", header: { cwd: ws } }, { type: "user/message", data: { content: [{ type: "text", text: "请改 alpha 入口" }] } });
  await handlers.get("fs/observed")!({ displayPath: `${ws}/src/alpha.ts` }, {}, { agent: { id: "a1" } });
  await handlers.get("agent/turn-stopping")!({ agent: { id: "a1" } });

  const atomsDir = join(ws, ".shadow", "atoms");
  const atoms = readdirSync(atomsDir).filter((n) => n.endsWith(".md"));
  assert.equal(atoms.length, 1, `无 shadowRoot 时也必须写会话 cwd；实际 ${atoms.join(",")}`);
  assert.ok(atoms[0]!.includes("src-alpha-ts"));

  const out = await tools.get("read_shadow").execute({ topic: "alpha" }, { agent: { id: "a1", session: { header: { cwd: ws } } } });
  assert.ok(out.includes("src-alpha-ts"), "读侧应读同一工作区");
} finally {
  cleanup();
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ e2e session：session id ≠ agent id、无 shadowRoot → 写/读同一会话 cwd");

