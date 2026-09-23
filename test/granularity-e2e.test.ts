// dsh-shadow —— 记录粒度的**端到端**锁（v1.19.1 / `adr/0097` T22 + T21）。
//
// 为什么必须有它（`BACKLOG` T22）：`test/capture-granularity.test.ts` 只有**单元** + **静态接线守卫**，
// 而本仓有过「写好了但从不执行」的失效形态（`core/types.ts:52` 自陈 `knowledgeEngine.enabled` 生产零读取）。
// 静态守卫只挡「没接线」，挡不住「接了但行为不对」⇒ 这里用假宿主驱动真实的 `flush`，断言**文件系统层面的后果**。
//
// 锁五件事：
//   ① 写侧·**纯动作批** ⇒ 只写 `.shadow/audit/<date>.jsonl`，**不写**记忆文件，且 `listMemories` 查不到；
//   ② 写侧·**含线索批**（assistant 思维落点）⇒ 写记忆文件；审计流不受影响；
//   ③ 控制变量·**逃生口**（`capture.echo:"memory"`）⇒ 纯动作批仍写记忆文件（旧行为可回退）；
//   ④ 读侧（T21）·审计流**可读且材料可见**（这正是 `adr/0097` §5.2 那条缺口）；
//   ⑤ 读侧·**缺件不静默**（ADR-0049）：审计目录读失败 ⇒ `ok:false` + 真实原因；目录为空 ⇒ `ok:true` 且 `records:0`。
import assert from "node:assert/strict";
import { createShadowCollector } from "../dist/core/writer/index.js";
import { listMemories } from "../dist/persistence/files.js";
import { readAuditStream, renderAuditStreamDiag } from "../dist/persistence/audit-stream.js";

const WS = "D:/ws-e2e";
const AGENT = { id: "a1", session: { id: "a1", header: { cwd: WS } } };

interface FsOpts {
  /** `listDir` 抛这个错（非 ENOENT）⇒ 模拟「读失败」而不是「还没有」。 */
  denyList?: boolean;
}
const mkStore = () => new Map<string, string>();
const mkFs = (store: Map<string, string>, opts: FsOpts = {}) => {
  const norm = (p: string) => String(p).replace(/\\/g, "/");
  const enoent = (p: string) => {
    const e: any = new Error(`ENOENT: ${p}`);
    e.code = "ENOENT";
    return e;
  };
  return {
    resolve: async (p: string) => ({ displayPath: norm(p) }),
    readText: async (t: any) => {
      const k = norm(t.displayPath);
      if (!store.has(k)) throw enoent(k);
      return store.get(k)!;
    },
    writeText: async (t: any, c: string) => {
      store.set(norm(t.displayPath), String(c));
      return { version: "v1" };
    },
    listDir: async (t: any) => {
      if (opts.denyList) {
        const e: any = new Error("EACCES: permission denied");
        e.code = "EACCES";
        throw e;
      }
      const base = norm(t.displayPath).replace(/\/+$/, "") + "/";
      // ⚠ 必须**合成目录项**：`listMemories` 先列出 `.shadow/` 下的**日期目录**再往下一层找文件。
      // 只回「文件」的话它会看到 0 个日期目录 —— 那会让「审计流不被收」的断言**假绿**
      // （v1.19.1 实测：本 mock 第一版就是这个错，② 的正对照立刻把它抓出来）。
      const names = new Map<string, string>();
      for (const k of store.keys()) {
        if (!k.startsWith(base)) continue;
        const rest = k.slice(base.length);
        const seg = rest.split("/")[0];
        if (!seg) continue;
        const deeper = rest.includes("/");
        if (!names.has(seg) || deeper) names.set(seg, deeper ? "dir" : "file");
      }
      return [...names.entries()].map(([name, type]) => ({ name, type }));
    },
  };
};

const mkCollector = (fs: any, config: any = {}) =>
  createShadowCollector({
    context: { get: (k: string) => (k === "fs" ? fs : undefined) },
    config: {
      summary: { enabled: false },
      recall: {},
      forget: { enabled: false },
      compact: { enabled: false },
      retention: { enabled: false },
      writeConsent: false,
      ...config,
    },
    getAgentById: () => AGENT,
  });

const auditKeys = (store: Map<string, string>) => [...store.keys()].filter((k) => /\.shadow\/audit\/\d{4}-\d{2}-\d{2}\.jsonl$/.test(k));
const memoryKeys = (store: Map<string, string>) => [...store.keys()].filter((k) => /\.shadow\/\d{4}-\d{2}-\d{2}\/.+\.md$/.test(k) && !/\/_\w+\.md$/.test(k));

// ── ① 写侧·纯动作批 ⇒ 审计流（不写记忆文件）──
{
  const store = mkStore();
  const fs = mkFs(store);
  const c = mkCollector(fs);
  c.push("a1", { kind: "action", text: "改/读 core/x.ts", comp: "core/x.ts", source: "fs" });
  c.push("a1", { kind: "action", text: "调用 edit", comp: "edit", source: "tool" });
  await c.onTurnStopping({ agent: AGENT });

  assert.equal(auditKeys(store).length, 1, `纯动作批必须写审计流；实际写了 ${JSON.stringify([...store.keys()])}`);
  assert.equal(memoryKeys(store).length, 0, `纯动作批**不得**写记忆文件；实际 ${JSON.stringify(memoryKeys(store))}`);
  const lines = store.get(auditKeys(store)[0])!.trim().split("\n");
  assert.equal(lines.length, 2, `两条动作 ⇒ 两行（一行一条 JSON）；实际 ${lines.length}`);
  const rec = JSON.parse(lines[0]);
  for (const k of ["at", "kind", "comp", "text", "source", "agent", "project"]) assert.ok(k in rec, `审计行丢了字段 ${k}`);
  assert.equal(rec.text, "改/读 core/x.ts", "审计行必须保留原文");
  // ② 的判据另一半：审计流**不得**被当成记忆收进语料
  assert.equal((await listMemories(fs, WS)).length, 0, "审计流不得被 listMemories 收成记忆");
  console.log("✔ ① 纯动作批 ⇒ 只写 .shadow/audit/<date>.jsonl（不写记忆文件、listMemories 也不收）");
}

// ── ② 写侧·含线索批 ⇒ 记忆文件 ──
{
  const store = mkStore();
  const fs = mkFs(store);
  const c = mkCollector(fs);
  c.push("a1", { kind: "action", text: "改/读 core/x.ts", comp: "core/x.ts", source: "fs" });
  c.push("a1", { kind: "assistant", text: "我：看一下这个文件。", comp: "", source: "assistant" });
  await c.onTurnStopping({ agent: AGENT });

  assert.equal(memoryKeys(store).length, 1, `含思维落点的批必须写记忆文件；实际 ${JSON.stringify([...store.keys()])}`);
  assert.equal(auditKeys(store).length, 0, `含线索的批**不该**写审计流；实际 ${JSON.stringify(auditKeys(store))}`);
  const mem = store.get(memoryKeys(store)[0])!;
  assert.match(mem, /> 证据链：来源\(动作·agent\)/, `记忆头应记下 kinds：\n${mem.slice(0, 200)}`);
  assert.equal((await listMemories(fs, WS)).length, 1, "记忆文件必须被 listMemories 收进来（正对照）");
  console.log("✔ ② 含线索批 ⇒ 写记忆文件（审计流不动；listMemories 收 1 条）");
}

// ── ③ 控制变量·逃生口 capture.echo:"memory" ⇒ 旧行为 ──
{
  const store = mkStore();
  const fs = mkFs(store);
  const c = mkCollector(fs, { capture: { echo: "memory" } });
  c.push("a1", { kind: "action", text: "改/读 core/x.ts", comp: "core/x.ts", source: "fs" });
  await c.onTurnStopping({ agent: AGENT });

  assert.equal(memoryKeys(store).length, 1, `逃生口下纯动作批仍应写记忆文件；实际 ${JSON.stringify([...store.keys()])}`);
  assert.equal(auditKeys(store).length, 0, "逃生口下不写审计流");
  console.log('✔ ③ 逃生口 capture.echo:"memory" ⇒ 旧行为可回退（纯动作批仍落记忆文件）');
}

// ── ④ 读侧（T21）·审计流可读、材料可见 ──
{
  const store = mkStore();
  const fs = mkFs(store);
  const c = mkCollector(fs);
  c.push("a1", { kind: "action", text: "改/读 core/x.ts", comp: "core/x.ts", source: "fs" });
  c.push("a1", { kind: "action", text: "改/读 query/y.ts", comp: "query/y.ts", source: "fs" });
  await c.onTurnStopping({ agent: AGENT });

  const s = await readAuditStream(fs, WS);
  assert.equal(s.ok, true, `审计流读取应成功：${s.reason}`);
  assert.equal(s.records, 2, `应读到 2 条：${JSON.stringify(s)}`);
  assert.deepEqual(s.materials, ["core/x.ts", "query/y.ts"], `材料必须可见（adr/0097 T21 的那条缺口）：${JSON.stringify(s.materials)}`);
  const diag = renderAuditStreamDiag(s);
  assert.match(diag, /core\/x\.ts/, `诊断行应带出材料：${diag}`);
  assert.match(diag, /不进索引\/不计 hits/, `诊断行必须说清它是系统派生记录（别让读者以为它能召回）：${diag}`);
  console.log("✔ ④ 读侧：审计流可读、材料可见（T21 缺口已闭合到「可见可查」）");
}

// ── ⑤ 读侧·缺件不静默：读失败 vs 还没有，必须分得开 ──
{
  const store = mkStore();
  const failing = mkFs(store, { denyList: true });
  const sFail = await readAuditStream(failing, WS);
  assert.equal(sFail.ok, false, "listDir 读失败必须报 ok:false（不得退化成「没有材料」）");
  assert.match(String(sFail.reason), /EACCES|读取/, `必须带真实原因：${JSON.stringify(sFail)}`);
  assert.match(renderAuditStreamDiag(sFail), /读失败/, `诊断行必须说「读失败」：${renderAuditStreamDiag(sFail)}`);

  const empty = await readAuditStream(mkFs(mkStore()), WS);
  assert.equal(empty.ok, true, "目录为空（还没采集）应是 ok:true —— 与「读失败」分开");
  assert.equal(empty.records, 0, "空审计流 0 条记录");
  assert.match(renderAuditStreamDiag(empty), /尚无记录/, `空与失败必须渲染不同：${renderAuditStreamDiag(empty)}`);
  console.log("✔ ⑤ 读侧：读失败（ok:false + 原因）与「还没采集」（ok:true / 0 条）分得开 —— 缺件不静默");
}

console.log(
  "✔ granularity-e2e：① 纯动作⇒审计流 · ② 含线索⇒记忆 · ③ 逃生口可回退 · ④ 读侧材料可见（T21）· ⑤ 读失败≠还没采集 —— 全部通过（端到端，驱动真实 flush）",
);
