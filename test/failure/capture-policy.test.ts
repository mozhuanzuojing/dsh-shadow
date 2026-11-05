/**
 * 回归：写入策略必须落在「本次写入的工作区」上。
 *
 * 背景（v2.12.1 实机回归）：宿主 `sandboxPolicy.resolve({ session })` 在 session 缺失时
 * 回退到部署默认 `workspace-write` + 部署根（本机是 DSH profile 目录）。v2 把这份策略
 * 原样传给 `fs.writeText/appendText`，于是工作区里的 `.shadow/audit/*.jsonl` 被宿主沙箱判
 * `file access denied under workspace-write mode`，纯动作批永远 pending。
 *
 * 这里用一个模仿宿主沙箱语义的假 fs：`workspace-write` 下目标必须落在策略根内，否则抛错；
 * 未传策略时退回「部署根」（故意设成工作区之外的目录）。
 *
 * 修复后：session 缺失的桶（agent id 不在 capture 的 session 表里）写入策略根 = 本次工作区，
 * audit 流可落盘。
 */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { apply } from "../../dist/index.js";

const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-policy-ws-"));
const deploymentRoot = mkdtempSync(join(tmpdir(), "dsh-shadow-policy-root-"));
const norm = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const under = (p: string, root: string): boolean => norm(p) === norm(root) || norm(p).startsWith(`${norm(root)}/`);

const pathOf = (t: any): string => (typeof t === "string" ? t : String(t?.displayPath ?? t?.targetKey ?? t));

/** 模仿宿主 SandboxedFileSystem：写操作按策略根判围栏。 */
const sandboxedFs = {
  async resolve(p: string) {
    return { displayPath: String(p), targetKey: String(p) };
  },
  async readText(t: any) {
    return readFileSync(pathOf(t), "utf8");
  },
  async writeText(t: any, text: string, _expected?: any, _signal?: any, policy?: any) {
    const p = pathOf(t);
    fence(p, policy);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, "utf8");
    return { size: text.length, mtimeMs: Date.now() };
  },
  async appendText(t: any, text: string, _expected?: any, _signal?: any, policy?: any) {
    const p = pathOf(t);
    fence(p, policy);
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, text, "utf8");
  },
  async listDir(t: any) {
    const dir = pathOf(t);
    return readdirSync(dir, { withFileTypes: true }).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
    }));
  },
  async stat(t: any) {
    const s = statSync(pathOf(t));
    return { size: s.size, mtimeMs: s.mtimeMs };
  },
  async mkdirp(t: any) {
    mkdirSync(pathOf(t), { recursive: true });
  },
};

function fence(p: string, policy: any): void {
  // 与宿主一致：未传策略 → 部署默认（workspace-write + 部署根）
  const pol = policy ?? { mode: "workspace-write", workspaceRoot: deploymentRoot };
  if (pol.mode === "danger-full-access") return;
  if (pol.mode === "read-only" || pol.mode === "readonly") {
    throw new Error(`cannot write "${p}": file access denied under read-only mode`);
  }
  if (!under(p, String(pol.workspaceRoot ?? deploymentRoot))) {
    throw new Error(`cannot write "${p}": file access denied under workspace-write mode`);
  }
}

const handlers = new Map<string, Function>();
const services: any = {
  tools: { register: () => {} },
  systemPrompt: { context: () => {} },
  // agent-x 的 session 不在 capture 的 sessionByAgent 里（模拟未归属事件）
  agents: { get: (id: string) => (id === "agent-x" ? { id, session: { header: { cwd: ws } } } : undefined), currentInitiator: () => null },
  fs: sandboxedFs,
  // 宿主实现同款：session 缺失 → 部署默认根；有 session → 用 session cwd
  sandboxPolicy: {
    resolve: (req: any = {}) => ({ mode: "workspace-write", workspaceRoot: req.session?.header?.cwd ?? deploymentRoot }),
  },
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
  await handlers.get("session/event")!(
    { id: "sess-1", header: { cwd: ws } },
    { type: "user/message", data: { content: [{ type: "text", text: "看一下 audit 流" }] } },
  );
  // 未归属到已知 session 的 agent：bucket = agent-x
  await handlers.get("tools/result")!({ agent: { id: "agent-x" }, name: "read_shadow" });
  await handlers.get("agent/turn-stopping")!({ agent: { id: "agent-x", session: { header: { cwd: ws } } } });

  const auditDir = join(ws, ".shadow", "audit");
  assert.ok(existsSync(auditDir), "audit 目录应创建");
  const auditFiles = readdirSync(auditDir).filter((n) => n.endsWith(".jsonl"));
  assert.equal(auditFiles.length, 1, `audit 流应落 1 个文件，实际 ${auditFiles.join(",")}`);
  const auditText = readFileSync(join(auditDir, auditFiles[0]!), "utf8");
  assert.ok(auditText.includes("调用 read_shadow"), `audit 应记录工具动作：${auditText.slice(0, 120)}`);

  // 同一工作区的 atoms 也必须可写（策略根 = 工作区，不放宽到 danger-full-access）
  await handlers.get("agent/turn-stopping")!({ agent: { id: "sess-1", session: { header: { cwd: ws } } } });
  const atoms = readdirSync(join(ws, ".shadow", "atoms")).filter((n) => n.endsWith(".md"));
  assert.ok(atoms.length >= 1, "atoms 应落盘");
} finally {
  cleanup();
  rmSync(ws, { recursive: true, force: true });
  rmSync(deploymentRoot, { recursive: true, force: true });
}

console.log("✔ capture policy：session 缺失时写入策略根 = 本次工作区（audit 流可落盘）");
