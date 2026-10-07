// dsh-shadow —— 写入必须携带**会话自己的**沙箱策略（ADR-0074）。
//
// 背景（真机实测的缺陷，v1.15.31）：
//   `read_shadow` 长期在顶部挂「⚠ shadow 最近一次落盘失败（… file access denied under
//   workspace-write mode）」—— 记忆一条都落不了盘。根因**不是**目录不存在、**也不是**
//   「解析不出 session cwd 落到兜底根」，而是插件的写入**省略了 `sandboxPolicy` 参数**：
//     `dsh-fs-sandbox.checkedTarget` 取 `sandboxPolicy ?? ctx.sandboxPolicy.resolve()`
//     ⇒ 无 session 时得到**部署 fallback**：mode = DSH_PERMISSION_MODE ?? workspace-write，
//       workspaceRoot = **process.cwd()**（dsh 服务进程的启动目录）
//   而写入目标是**会话工作区** `session.header.cwd`。两者不同时围栏判定失败 ⇒ 抛
//   `cannot write "…": file access denied under workspace-write mode`。
//
// 本测试用**忠实复刻围栏判定**的 mock fs（`mkFencedFs`）复现它：mock 的「服务启动目录」
// `C:/svc` 故意 ≠ 会话工作区 `D:/proj` —— 这正是真机 `dsh web` 从别处启动的形态。
//
// 语义边界（本测试要锁死的不变量）：
//   ① 写入必须带**该会话自己的**策略（mode 与会话一致、root = 会话 cwd）；
//   ② **不越权**：会话是 read-only 时不得被改写成可写（正对照，见 ③）；
//   ③ **不破坏特性探测**：`persistence/meta.ts:50` 用 `typeof fs.stat === "function"` 判分派，
//      门面必须**原样保留「没有 stat」**这件事。
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as mod from "../dist/index.js";
import { scopedFs, sessionPolicy, isPolicyFailure } from "../dist/core/fs-scope.js";
const { apply, name, inject } = mod;

const SVC_CWD = "C:/svc";   // dsh 服务进程的启动目录（= 部署 fallback 的 workspaceRoot）
const CWD = "D:/proj";      // 会话工作区（= session.header.cwd）
const WS = CWD;
const toolRegistry = new Map<string, any>();

const norm = (s: string) => String(s).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const isUnder = (p: string, root: string) => norm(p) === norm(root) || norm(p).startsWith(norm(root) + "/");

/** 忠实复刻 `dsh-fs-sandbox.checkedTarget`（lib/index.js:153-166）的围栏判定。 */
const mkFencedFs = (m: Map<string, string>) => {
  let ver = 0;
  const policies: any[] = []; // 记录每次写入实际生效的策略（断言「带的是谁的策略」）
  const denied: string[] = [];
  return {
    policies,
    denied,
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText(t: any) { return m.get(t.displayPath) ?? ""; },
    async writeText(t: any, c: string, _expected?: any, _signal?: any, sandboxPolicy?: any) {
      const p = sandboxPolicy ?? { mode: "workspace-write", workspaceRoot: SVC_CWD }; // ← 部署 fallback
      policies.push(p);
      if (p.mode === "danger-full-access") { m.set(t.displayPath, c); return { operation: "update", version: `v${++ver}`, before: null, after: c }; }
      if (p.mode === "read-only") {
        const e = `cannot write "${t.displayPath}": file access denied under read-only mode`;
        denied.push(e); throw new Error(e);
      }
      if (!isUnder(t.displayPath, p.workspaceRoot)) {
        const e = `cannot write "${t.displayPath}": file access denied under workspace-write mode`;
        denied.push(e); throw new Error(e);
      }
      m.set(t.displayPath, c);
      return { operation: "update", version: `v${++ver}`, before: null, after: c };
    },
    // 与 `dsh-fs-local.listDirectory` 同形：只为 `shadowSourcesFingerprint` 提供 target/size。
    async listDir(t: any) {
      const base = norm(t.displayPath);
      const names = new Map<string, "file" | "directory">();
      for (const k of m.keys()) {
        const nk = norm(k);
        if (!nk.startsWith(base + "/")) continue;
        const rest = nk.slice(base.length + 1);
        const seg = rest.split("/")[0];
        if (!seg || seg === "_index.md" || seg === "_meta.json") continue;
        names.set(seg, rest.includes("/") ? "directory" : "file");
      }
      return [...names].map(([n, type]) => {
        const childPath = `${t.displayPath.replace(/\/+$/, "")}/${n}`;
        const entry: any = { name: n, type, target: { displayPath: childPath } };
        if (type === "file") entry.size = (m.get(childPath) ?? "").length;
        return entry;
      });
    },
  };
};

/** 忠实复刻 `dsh-sandbox-policy.resolve`（lib/index.js:141-148）：**只有给了 session 才拿会话自己的**。 */
const mkSandboxPolicy = (modeByCwd: (cwd: string) => string) => ({
  resolve: (req: any = {}) => {
    const s = req.session;
    if (!s) return { mode: "workspace-write", workspaceRoot: SVC_CWD }; // 部署 fallback
    const cwd = s?.header?.cwd ?? SVC_CWD;
    return { mode: modeByCwd(cwd), workspaceRoot: cwd, sessionId: s?.id };
  },
});

const mkCtx = (m: Map<string, string>, policySvc: any) => {
  const agentsById = new Map<string, any>();
  const agent = (id: string, cwd = CWD) => { const a = { id, session: { id, header: { cwd } } }; agentsById.set(id, a); return a; };
  const services: any = { fs: mkFencedFs(m), sandboxPolicy: policySvc, agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) }, systemPrompt: { context: () => {} }, tools: { register: (d: any) => toolRegistry.set(d.name, d) }, llm: undefined, agentDefaultModel: undefined };
  const listeners = new Map<string, Function>();
  const ctx: any = { get: (k: string) => services[k], on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); }, inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }) };
  return { m, agentsById, agent, listeners, ctx, services };
};

const flushOf = async (listeners: Map<string, Function>, T: any) =>
  await listeners.get("agent/turn-stopping")!({ agent: T });

/**
 * 一轮交互里的**用户消息**（v1.19.0 / `adr/0097` D1）：有了「线索」这批才落**记忆文件** ——
 * 纯动作批现在走审计流（`.shadow/audit/<date>.jsonl`），而本文件测的是**记忆写入**的沙箱策略接线。
 */
const userMsgOf = (listeners: Map<string, Function>, T: any) =>
  listeners.get("session/event")!(
    { id: T.id, header: { cwd: CWD } },
    { type: "user/message", data: { content: [{ type: "text", text: "把这次改动记下来" }] } },
  );

// ── ① 核心复现：会话 cwd（D:/proj）≠ 服务启动目录（C:/svc）⇒ 记忆必须落盘 ──
{
  const store = new Map<string, string>();
  const { m, agent, listeners, ctx } = mkCtx(store, mkSandboxPolicy(() => "workspace-write"));
  // ⚠ 本场景与遗忘无关 ⇒ 显式关掉 forget（v1.15.85 起默认全开、staleDays 14）：
//   否则 fixture 里的旧日期会被 isForgettable 滤掉，把被测行为一起滤没（T12 重判，v1.15.97）。
apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T1");

  // 采集一条动作，触发 flush
  listeners.get("tools/result")!({ agent: T, name: "build" });
  userMsgOf(listeners, T); // adr/0097 D1：含线索才落记忆文件（纯动作批走审计流）
  await flushOf(listeners, T);

  const written = [...m.keys()].filter((k) => k.includes("/.shadow/atoms/") && k.endsWith(".md"));
  assert.ok(written.length >= 1,
    `会话工作区 ≠ 服务启动目录时，记忆仍必须落盘（旧版省略 sandboxPolicy ⇒ 被围栏拒绝）；` +
    `实际写入 ${JSON.stringify([...m.keys()])}`);
  console.log("✔ ① 会话 cwd ≠ 服务启动目录时记忆成功落盘（旧版在此被围栏拒绝）");
}

// ── ② 写入携带的是**该会话自己的**策略，而不是部署 fallback ──
{
  const store = new Map<string, string>();
  const { m, agent, listeners, ctx, services } = mkCtx(store, mkSandboxPolicy(() => "workspace-write"));
  apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T2");
  listeners.get("tools/result")!({ agent: T, name: "build" });
  userMsgOf(listeners, T); // adr/0097 D1：含线索才落记忆文件（纯动作批走审计流）
  await flushOf(listeners, T);

  const fsMock: any = services.fs;
  const memPolicy = fsMock.policies.find((p: any) => String(p.workspaceRoot).startsWith(CWD));
  assert.ok(memPolicy, `写入必须带上以会话 cwd 为 root 的策略；实际记录 ${JSON.stringify(fsMock.policies)}`);
  assert.equal(memPolicy.mode, "workspace-write", "mode 必须是该会话自己的 mode");
  assert.equal(memPolicy.workspaceRoot, CWD, "workspaceRoot 必须是会话 cwd，而不是服务启动目录");
  assert.equal(memPolicy.sessionId, "T2", "策略应带 sessionId（宿主 resolve 会给）");
  console.log("✔ ② 写入携带的是该会话自己的策略（root = 会话 cwd，非部署 fallback）");
}

// ── ③ 正对照（不越权）：会话是 read-only ⇒ 传下去的必须**仍是 read-only**，写入仍被拒 ──
{
  const store = new Map<string, string>();
  const { m, agent, listeners, ctx, services } = mkCtx(store, mkSandboxPolicy(() => "read-only"));
  apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T3");
  listeners.get("tools/result")!({ agent: T, name: "build" });
  userMsgOf(listeners, T); // adr/0097 D1：含线索才落记忆文件（纯动作批走审计流）
  await flushOf(listeners, T);

  const fsMock: any = services.fs;
  assert.ok(fsMock.policies.length > 0, "只读会话也应尝试写入（由沙箱拒绝，而不是插件自己跳过）");
  assert.ok(fsMock.policies.every((p: any) => p.mode === "read-only"),
    `只读会话不得被改写成可写（门面绝不提权）；实际 ${JSON.stringify(fsMock.policies)}`);
  assert.ok(fsMock.denied.some((e: string) => e.includes("read-only")),
    "只读会话的写入必须仍被拒绝（这正是正确行为）");
  assert.equal([...m.keys()].filter((k) => k.endsWith(".md")).length, 0, "只读会话不得落盘成功");
  console.log("✔ ③ 正对照：read-only 会话仍是 read-only（写入被拒，门面不提权）");
}

// ── ④ danger-full-access 会话 ⇒ 不受 workspaceRoot 约束也能写 ──
{
  const store = new Map<string, string>();
  const { m, agent, listeners, ctx } = mkCtx(store, mkSandboxPolicy(() => "danger-full-access"));
  apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T4");
  listeners.get("tools/result")!({ agent: T, name: "build" });
  userMsgOf(listeners, T); // adr/0097 D1：含线索才落记忆文件（纯动作批走审计流）
  await flushOf(listeners, T);
  assert.ok([...m.keys()].some((k) => k.endsWith(".md")), "danger-full-access 会话必须能落盘");
  console.log("✔ ④ danger-full-access 会话写入成功（与真机当前策略一致）");
}

// ── ⑤ 读路径同样带策略：无参 read_shadow → ensureIndex → `_index.md` 必须落盘 ──
// 读侧也会写（_index.md / query-log / identity timeline…），漏掉它等于只修一半。
{
  const store = new Map<string, string>();
  const { m, agent, listeners, ctx } = mkCtx(store, mkSandboxPolicy(() => "workspace-write"));
  apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T5");
  m.set(`${WS}/.shadow/atoms/2026-09-11--100000-alpha.md`,
    "# alpha\n\n> 完整线索\n> 坐标：locus(ws) · when(2026-09-08 10:00:00) · soul(default) · role(default) · intent(test)\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：proj\n\n- [10:00:00] [alpha] 改/读 alpha.ts\n");
  const rs = toolRegistry.get("read_shadow");
  const out = String(await rs.execute({}, { agent: T }));
  assert.ok(m.has(`${WS}/.shadow/indexes/_index.md`),
    `读路径重建索引时 _index.md 必须落盘（旧版同样被围栏拒绝）；实际 ${JSON.stringify([...m.keys()])}`);
  assert.ok(out.includes("alpha"), "索引内容应含已存在的记忆");
  console.log("✔ ⑤ 读路径（无参 read_shadow → ensureIndex）同样带上会话策略，_index.md 落盘");
}

// ── ⑥ 门面本身的契约（直接单元测，边界比端到端更精确） ──
{
  const seen: any[] = [];
  const raw: any = {
    resolve: async () => ({ targetKey: "t", displayPath: "t" }),
    readText: async () => "x",
    listDir: async () => [],
    writeText: async (_t: any, _c: any, _e: any, _s: any, sp: any) => { seen.push(sp); return { version: "v" }; },
    editText: async (_t: any, _e: any, _x: any, _s: any, sp: any) => { seen.push(sp); return { version: "v" }; },
  };
  const P = { mode: "workspace-write", workspaceRoot: CWD };

  // (a) 无策略 / 无 fs ⇒ 恒等返回（旧宿主上本修复是零变化）
  assert.equal(scopedFs(raw, undefined), raw, "无策略时必须原样返回原 fs（零行为变化）");
  assert.equal(scopedFs(undefined, P), undefined, "无 fs 时必须原样返回 undefined");
  assert.equal(sessionPolicy({ get: () => undefined }, { id: "s" }), undefined, "缺 sandboxPolicy 服务 ⇒ undefined");
  // A17：`resolve` 抛错**不再**与「服务缺失」合并成 `undefined` —— 那是 fail-open 的入口：
  // 消费点对 `undefined` 的处置是「按可写处理」，而解析失败时围栏本可生效、只是读不出参数。
  const failed = sessionPolicy({ get: () => { throw new Error("boom"); } }, { id: "s" });
  assert.ok(isPolicyFailure(failed), `resolve 抛错 ⇒ **失败态**（不得炸穿调用方、也不得与「服务缺失」同形）：${JSON.stringify(failed)}`);
  assert.ok(String(failed.reason).includes("boom"), "失败态必须带**真实原因**（供调用方留痕，不臆造）");
  assert.equal(scopedFs(raw, failed), raw, "失败标记不是策略 ⇒ 门面必须原样返回原 fs（不得把 {failed:true} 当 sandboxPolicy 传给围栏）");
  assert.equal(sessionPolicy({ get: () => ({ resolve: () => P }) }, undefined), undefined, "无 session ⇒ undefined（不猜策略）");

  // (b) 省略第 5 参 ⇒ 补会话策略；显式传入 ⇒ **原样转发，不覆盖**（不越权）
  const f = scopedFs(raw, P);
  await f.writeText({ displayPath: "t" }, "c");
  assert.deepEqual(seen.at(-1), P, "省略 sandboxPolicy 时必须补上会话策略");
  const EXPLICIT = { mode: "read-only", workspaceRoot: CWD };
  await f.writeText({ displayPath: "t" }, "c", undefined, undefined, EXPLICIT);
  assert.deepEqual(seen.at(-1), EXPLICIT, "调用方显式给了策略 ⇒ 不得被覆盖（含 read-only 这种更严的）");
  await f.editText({ displayPath: "t" }, { oldString: "a", newString: "b", replaceAll: false });
  assert.deepEqual(seen.at(-1), P, "editText 是另一个受围栏的操作，必须一并补");

  // (c) **不破坏特性探测**：`persistence/meta.ts:50` 用 `typeof fs.stat === "function"` 判分派。
  const noStat: any = { resolve: raw.resolve, readText: raw.readText, writeText: raw.writeText, listDir: raw.listDir };
  const g = scopedFs(noStat, P);
  assert.equal(typeof g.stat, "undefined", "原 fs 没有 stat ⇒ 门面不得凭空补一个（否则特性探测恒真、改变既有分支）");
  assert.equal(typeof g.listDir, "function", "原 fs 有的方法必须转发");
  const withStat: any = { ...noStat, stat: async () => ({ version: "v" }) };
  assert.equal(typeof scopedFs(withStat, P).stat, "function", "原 fs 有 stat ⇒ 门面必须转发");
  assert.equal(scopedFs(withStat, P).stat === withStat.stat, false, "转发应是包装调用，不是同引用直挂");
  console.log("✔ ⑥ 门面契约：恒等降级 / 补齐省略的策略 / 不覆盖显式策略 / 保留 stat 缺失");
}

// ── ⑦ A17 端到端负对照：`sandboxPolicy.resolve` **抛错**（服务在、解析失败） ──
// 三态里的第三态（`core/fs-scope.ts` 的 `{ failed: true }`）在 ⑥ 只有**单元**断言；这里驱动**真实插件**：
//   `sessionPolicy` 抛错 ⇒ `index.ts` 的 `derivedIndexWritable = false`（保守；原实现与「服务缺失」同形、
//   会被消费点按**可写**处理 = fail-open）⇒ `query/materialize.ts` 把 `{ writable: false }` 交给 sqlite
//   provider ⇒ 守卫②在**任何落盘之前**返回 unavailable（`core/candidate/sqlite.ts`）。
// 两条断言都取**可观察的后果**（不碰私有字段，因为 `derivedIndexWritable` 不是导出面）：
//   ① 不落盘：provider 的 `processPath` 指向一个空临时目录 ⇒ 该目录必须仍然为空；
//   ② 可见：`noteDegrade` → `getFlushWarn()` 横幅，且必须带**真实原因**。
{
  const store = new Map<string, string>();
  const { m, agent, ctx, services } = mkCtx(store, { resolve: () => { throw new Error("boom-policy"); } });
  // 本场景只问「策略解析失败时派生索引写不写」，与写围栏无关 ⇒ 摘掉围栏（等价于「宿主没有 dsh-fs-sandbox」，
  // 见 `core/fs-scope.ts` 对「服务缺失时围栏本身不存在」的说明），避免无关的写入被拒干扰读数。
  services.fs.writeText = async (t: any, c: string) => { m.set(t.displayPath, c); return { operation: "update", version: "v1", before: null, after: c }; };
  // 让守卫①（宿主绝对路径）通过 —— 否则 provider 会在**读到 writable 之前**就以「processPath 不可用」返回，
  // 本场景就成了**假绿**（根本测不到「不可写」这一态）。指向空临时目录：真落盘也只落在那里。
  const tmp = mkdtempSync(join(tmpdir(), "shadow-a17-"));
  services.fs.processPath = () => join(tmp, "index.sqlite");
  apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false }, derivedIndex: { provider: "sqlite" } });
  const T = agent("T7");
  m.set(`${WS}/.shadow/atoms/2026-09-11--100000-alpha.md`,
    "# alpha\n\n> 完整线索\n> 坐标：locus(ws) · when(2026-09-08 10:00:00) · soul(default) · role(default) · intent(test)\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：proj\n\n- [10:00:00] [alpha] 改/读 alpha.ts\n");
  const rs = toolRegistry.get("read_shadow");

  // ② 失败必须**可见**：`sandboxPolicy` 的留痕在 `makeQueryDeps` 里落台账，而 `runReadShadow` 开头就取横幅
  //   ⇒ **本回合**的返回里就该看到它（不是下一回合）。
  const out1 = String(await rs.execute({ topic: "alpha" }, { agent: T }));
  assert.ok(out1.includes("沙箱策略解析失败"), `策略解析失败必须可见（noteDegrade → 横幅），不得静默：\n${out1.slice(-600)}`);
  assert.ok(out1.includes("boom-policy"), `横幅必须带**真实原因**（不臆造、不吞掉）：\n${out1.slice(-600)}`);

  // ① 保守取值：`derivedIndex` 的留痕由**本次读**内部的物化产生，而横幅在本回合**之前**取
  //   （见 `query/reads.ts` 里「横幅是本回合之前取的」那段注释）⇒ 第二次读才看得到它。
  //   这条原因**只有** `writable === false` 才可能产生（守卫②的唯一出口；守卫①已被 processPath 让开）。
  const out2 = String(await rs.execute({ topic: "alpha" }, { agent: T }));
  assert.ok(out2.includes("会话策略只读（read-only）"),
    `解析失败 ⇒ 派生索引必须按**不可写**处理（保守）：这条原因只在 writable=false 时产生；实际：\n${out2.slice(-600)}`);
  assert.ok(out2.includes("alpha"), `回退 fs 后结果不变（不是「因为失败所以读不到」）：\n${out2.slice(-600)}`);
  const left = readdirSync(tmp);
  assert.deepEqual(left, [], `不可写态下**绝不落盘**（连索引文件都不建）；实际残留：${JSON.stringify(left)}`);
  rmSync(tmp, { recursive: true, force: true });
  console.log("✔ ⑦ A17 端到端负对照：sandboxPolicy.resolve 抛错 ⇒ 派生索引按不可写处理（不落盘）+ 降级横幅带真实原因");
}

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机 `host.fs` + 真 `sandboxPolicy` 服务的端到端（需重启宿主）—— mock 按已读源码复刻判定，不是真沙箱；");
console.log("    ⑦ 的「resolve 抛错」形态同样只在 mock 宿主上验过（真机需真服务抛错才能复现）；");
console.log("  · `resolveShadowScope` 落到**兜底根**（`~/.dsh-observer/shadow`）时无 session 可问 ⇒ 仍走部署 fallback，");
console.log("    该场景未被本修复覆盖（无会话就没有「会话策略」这回事）；");
console.log("  · `editText` 只做门面转发断言，插件今天不调用它。");
console.log("ALL PASS ✅");
