// dsh-shadow —— C6 召回路由评测（agent-skills 思路）：正/负样本 + rank-1 棘轮 + 主题键碰撞检测。
// 全确定性（无 LLM、无外部依赖）：这是**回归门槛**，把「当前召回行为」钉住——排序被改动时会红，
// 逼着改动者显式更新期望值，而不是让排序悄悄漂移。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";

const { apply, name, inject } = mod;
const WS = "D:/ws";

const makeHost = (seeds: { rel: string; text: string }[]) => {
  const files = new Map<string, string>();
  for (const s of seeds) files.set(s.rel, s.text);
  const fs = {
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText(target: any) { const v = files.get(target.displayPath); return v === undefined ? "" : v; },
    async writeText(target: any, content: string) { files.set(target.displayPath, content); return { version: "v1" }; },
    async listDir(target: any) {
      const base = String(target.displayPath).replace(/\\/g, "/").replace(/\/+$/, "") + "/";
      const names = new Set<string>();
      for (const k of files.keys()) {
        const nk = k.replace(/\\/g, "/");
        if (!nk.startsWith(base)) continue;
        const first = nk.slice(base.length).split("/")[0];
        if (first !== "_index.md") names.add(first);
      }
      return [...names].map((n) => ({ name: n }));
    },
  };
  const agentsById = new Map<string, any>();
  const A = { id: "A", session: { header: { cwd: WS } } };
  agentsById.set("A", A);
  const registry = new Map<string, any>();
  const services: any = { fs, agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) }, systemPrompt: { context: () => {} }, tools: { register: (def: any) => registry.set(def.name, def) }, llm: undefined, agentDefaultModel: undefined };
  const ctx: any = { get: (k: string) => services[k], on: () => () => {}, inject: (_d: string[], cb: Function) => cb({ get: (k: string) => services[k] }) };
  apply(ctx, { summary: { enabled: false }, recall: {} });
  return { files, read: (args: any) => registry.get("read_shadow").execute(args, { agent: A }) };
};

const mem = (date: string, time: string, slug: string) => `${WS}/.shadow/${date}/${date}--${time}-${slug}.md`;
const memText = (entry: string, line: string) => `# ${entry}\n\n> 完整线索\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [10:00:00] [${entry}] ${line}\n`;

// ── 评测语料：10 条一手记忆，入口键唯一 ──
const CORPUS: { rel: string; entry: string; line: string }[] = [
  { rel: mem("2026-09-01", "100000", "jwt"), entry: "src/auth/JwtFilter.java", line: "JWT 校验：appid/secret 认证与令牌续期" },
  { rel: mem("2026-09-01", "100100", "auth"), entry: "src/auth/AuthFilter.java", line: "登录态与权限过滤（与 JwtFilter 协作）" },
  { rel: mem("2026-09-02", "100000", "openapi"), entry: "docs/api/openapi-gateway.md", line: "OpenAPI 网关接口规范与鉴权头" },
  { rel: mem("2026-09-02", "100100", "cost"), entry: "_reports/2026-09-08-cost-accounting.md", line: "费用核算排查：SAC 成本对账" },
  { rel: mem("2026-09-03", "100000", "todo-page"), entry: "miniprogram/pages/todo/todo.js", line: "Todo 清单页面渲染" },
  { rel: mem("2026-09-03", "100100", "todo-sync"), entry: "cloudfunctions/todoSync/index.js", line: "Todo 同步云函数" },
  { rel: mem("2026-09-04", "100000", "u8"), entry: "src/u8/U8Patch.java", line: "U8 补丁修复与字段映射" },
  { rel: mem("2026-09-04", "100100", "dameng"), entry: "docs/db/dameng.md", line: "达梦数据库连接与驱动配置" },
  { rel: mem("2026-09-05", "100000", "util"), entry: "src/common/Util.java", line: "通用工具类（日期/字符串）" },
  { rel: mem("2026-09-05", "100100", "usage"), entry: "references-agents/usage.md", line: "参考材料的通用说明与用法" },
];
const seeds = CORPUS.map((c) => ({ rel: c.rel, text: memText(c.entry, c.line) }));
const entryOf = new Map(CORPUS.map((c) => [c.rel, c.entry]));

const host = makeHost(seeds);
const rank1 = async (q: string) => {
  const out = String(await host.read({ topic: q, limit: 1, max_tokens: 4096 }));
  const m = /\[(\.shadow\/[^\]]+)\]/.exec(out);
  return m ? entryOf.get(`${WS}/${m[1]}`) ?? m[1] : null;
};
const anyMatch = async (q: string) => !String(await host.read({ topic: q, max_tokens: 4096 })).includes("无匹配");

// ── 正样本：query → 期望 rank-1（一手入口必须赢） ──
const POSITIVE: { q: string; expect: string }[] = [
  { q: "JwtFilter", expect: "src/auth/JwtFilter.java" },
  { q: "openapi-gateway", expect: "docs/api/openapi-gateway.md" },
  { q: "todoSync", expect: "cloudfunctions/todoSync/index.js" },
  { q: "todo.js", expect: "miniprogram/pages/todo/todo.js" },
  { q: "U8Patch", expect: "src/u8/U8Patch.java" },
  { q: "dameng", expect: "docs/db/dameng.md" },
  { q: "cost-accounting", expect: "_reports/2026-09-08-cost-accounting.md" },
];
const gotRank1 = await Promise.all(POSITIVE.map((p) => rank1(p.q)));
const wrong = POSITIVE.filter((p, i) => gotRank1[i] !== p.expect);
assert.equal(wrong.length, 0, `rank-1 错位：${wrong.map((p, i) => `${p.q} → ${gotRank1[POSITIVE.indexOf(p)]}（期望 ${p.expect}）`).join("；")}`);
const accuracy = (POSITIVE.length - wrong.length) / POSITIVE.length;
assert.equal(accuracy, 1, `rank-1 准确率应为 1.0，实际 ${accuracy}`);

// rank-1 棘轮：把当前排序钉住（改动排序必须显式更新这张表）
assert.deepEqual(gotRank1, POSITIVE.map((p) => p.expect), "rank-1 棘轮：排序快照变了，请显式确认");

// ── 负样本：明确**不得**窜位 ──
const NEGATIVE: { q: string; mustNot: string }[] = [
  { q: "JwtFilter", mustNot: "references-agents/usage.md" },        // 代码查询不得窜到通用参考
  { q: "todoSync", mustNot: "miniprogram/pages/todo/todo.js" },     // 云函数 ≠ 页面
  { q: "dameng", mustNot: "src/common/Util.java" },                 // 文档查询不得窜到通用工具类
];
for (const n of NEGATIVE) {
  const got = await rank1(n.q);
  assert.notEqual(got, n.mustNot, `负样本失败：「${n.q}」的 rank-1 不得是 ${n.mustNot}（实际 ${got}）`);
}

// 负样本：完全不相干的查询 → 无匹配（不是硬凑一条）
assert.equal(await anyMatch("完全不存在的主题zzz"), false, "不相干查询应无匹配");
assert.equal(await rank1("完全不存在的主题zzz"), null, "无匹配时不该有 rank-1");

// ── 主题键碰撞检测：同一入口键被不同记忆复用 → 报出来（评估用，不阻断） ──
const collisionsOf = (files: Map<string, string>) => {
  const byEntry = new Map<string, Set<string>>();
  for (const [rel, text] of files) {
    const nrel = rel.replace(/\\/g, "/");
    // 只算「记忆原子」：文件名须是 <日期>--<时刻>（与 persistence/files.ts 的 listMemories 同口径），
    // 排除 _index.md / observer trace / ledger 这类非记忆文件。
    if (!nrel.includes("/.shadow/")) continue;
    const base = nrel.split("/").pop() || "";
    if (!/^\d{4}-\d{2}-\d{2}--\d{6}/.test(base)) continue;
    const e = (String(text).match(/^# (.+)$/m) || [])[1];
    if (!e) continue;
    if (!byEntry.has(e)) byEntry.set(e, new Set());
    byEntry.get(e)!.add(nrel);
  }
  return [...byEntry].filter(([, v]) => v.size > 1).map(([k, v]) => `${k} × ${v.size}`).sort();
};
assert.deepEqual(collisionsOf(host.files), [], "评测语料本身不该有主题键碰撞");

const dupSeeds = seeds.concat([
  { rel: mem("2026-09-06", "100000", "util-again"), text: memText("src/common/Util.java", "同名入口的第二条记忆（不同日期）") },
]);
const dupHost = makeHost(dupSeeds);
assert.deepEqual(collisionsOf(dupHost.files), ["src/common/Util.java × 2"], "应检测出同名入口键碰撞");

console.log(`✔ 召回路由评测：正样本 ${POSITIVE.length}/${POSITIVE.length} rank-1 命中（准确率 ${accuracy}）· 负样本 ${NEGATIVE.length} 条不窜位 · 无匹配 1 条 · 主题键碰撞检测 0/1`);
console.log("ALL PASS ✅");
