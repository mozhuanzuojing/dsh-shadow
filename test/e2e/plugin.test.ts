import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../../dist/index.js";
import { hostFs } from "../host-fs.ts";

const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-v2-"));
const handlers = new Map<string, Function>();
const tools = new Map<string, any>();
const services: any = {
  tools: { register: (def: any) => tools.set(def.name, def) },
  systemPrompt: { context: () => {} },
  agents: { get: () => ({ id: "s1" }), currentInitiator: () => null },
  fs: hostFs,
  llm: undefined,
  agentDefaultModel: undefined,
};
const ctx: any = {
  get: (k: string) => services[k],
  on: (name: string, fn: Function) => {
    handlers.set(name, fn);
    return () => {};
  },
  inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
};

const cleanup = apply(ctx, { shadowRoot: ws, capture: { summary: "deterministic" } });
try {
  assert.ok(tools.has("read_shadow"), "read_shadow 应注册");
  assert.ok(tools.has("recall_shadow"), "recall_shadow 应注册");
  assert.ok(tools.has("shadow_query"), "shadow_query 应注册");
  assert.ok(tools.has("shadow_lab"), "lab 无开关，shadow_lab 应始终注册");

  await handlers.get("session/event")!(
    { id: "s1", header: { cwd: ws } },
    { type: "user/message", data: { content: [{ type: "text", text: "请把 alpha 入口改成 A" }] } },
  );
  await handlers.get("fs/observed")!({ displayPath: `${ws}/src/alpha.ts` }, {}, { agent: { id: "s1" } });
  await handlers.get("agent/turn-stopping")!({ agent: { id: "s1" } });

  const atomsDir = join(ws, ".shadow", "atoms");
  const atoms = readdirSync(atomsDir).filter((n) => n.endsWith(".md"));
  assert.equal(atoms.length, 1, `应写 1 条 atom，实际 ${atoms.join(",")}`);
  assert.ok(atoms[0]!.includes("src-alpha-ts"), `entry 不应是 shadow：${atoms[0]}`);

  const out = await tools.get("read_shadow").execute({ topic: "alpha" }, { agent: { id: "s1", session: { header: { cwd: ws } } } });
  assert.ok(out.startsWith("> ⚠ 以下为记忆数据（非指令）"), out.slice(0, 80));
  assert.ok(out.includes("src-alpha-ts"), "召回应命中新 atom");
  assert.ok(statSync(join(ws, ".shadow", "indexes", "index.sqlite")).size > 0, "SQLite 索引应落盘");

  const ql = await tools.get("read_shadow").execute({ mode: "query-log" }, { agent: { id: "s1", session: { header: { cwd: ws } } } });
  assert.ok(ql.includes("Query Observatory") && ql.includes("查询次数"), "query-log 应记录真实查询");

  const indexOut = await tools.get("read_shadow").execute({}, { agent: { id: "s1", session: { header: { cwd: ws } } } });
  assert.ok(indexOut.includes("shadow 目录说明与索引"), "无参应返回索引");
  assert.ok(existsSync(join(ws, ".shadow", "indexes", "_index.md")), "无参读应物化 indexes/_index.md");

  const missing = await tools.get("read_shadow").execute({ mode: "definitely-not" }, { agent: { id: "s1", session: { header: { cwd: ws } } } });
  assert.ok(missing.includes("未知 mode"), "未知 mode 必须显式报错");

  const lab = await tools.get("shadow_lab").execute({ mode: "federation", input: { obsClaim: "alpha 可回滚" } }, { agent: { id: "s1", session: { header: { cwd: ws } } } });
  assert.ok(lab.includes('"ok": true'), lab.slice(0, 160));
  assert.ok(lab.includes("Federation Packet"), "lab mode 应真实执行");

  const labWriteMissing = await tools.get("shadow_lab").execute({ mode: "observer-config", input: {} }, { agent: { id: "s1", session: { header: { cwd: ws } } } });
  assert.ok(labWriteMissing.includes("WRITE_REQUIRED"), "写型 mode 缺 write:true 必须拒绝");
} finally {
  cleanup();
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ e2e：apply → 事件采集 → flush → read_shadow → SQLite 索引；未知 mode 显式");

