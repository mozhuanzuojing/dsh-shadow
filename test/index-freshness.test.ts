// dsh-shadow —— `_index.md` 必须跟得上源头（ADR-0069）。
//
// 背景（实测的投影漂移，第六处「机制存在、没接到这一处」）：
// `ensureIndex` 的原条件是 `if (!core.indexDirty.has(ws) && core.indexCacheWarm.has(ws)) return;`
// 而 `indexDirty` 是**进程内** Set —— 只反映**本进程**的写入。记忆文件是 source of truth，
// **别的会话 / 子代理写入的记忆，本进程的 dirty 永远看不到** ⇒ 缓存一旦预热，`_index.md` 再也不更新。
// 真机实测：`_index.md` 停在 09:34:01，之后写入的 **623 条（8.54%）**记忆对索引不可见，
// 而主题召回走 `listMemories`（每次读盘）**看得见** ⇒ 同一份语料两条读路径可见性分歧。
//
// 测试要点：**必须绕过本进程的 flush** 直接往 mock fs 里放文件 —— 这正是「别的会话写入」的等价物。
// 走 flush 的话会置 indexDirty，测不到要测的那个分支（那是本仓反复记过的「测不到目标的测试」）。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
const { apply, name, inject } = mod;

const WS = "D:/ws";
const toolRegistry = new Map<string, any>();
const idxWrites: string[] = []; // 记录 _index.md 的写入次数与内容（用于「无变化不重写」断言）

const mkFs = (m: Map<string, string>) => ({
  async resolve(path: string) { return { targetKey: path, displayPath: path }; },
  async readText(t: any) { return m.get(t.displayPath) ?? ""; },
  async writeText(t: any, c: string) {
    if (String(t.displayPath).endsWith("_index.md")) idxWrites.push(c);
    m.set(t.displayPath, c);
    return { version: `v${idxWrites.length}` };
  },
  /**
   * **忠实实现 `FsDirEntry` 契约**（这是本测试能测到目标分支的前提）：
   * 真实契约里 `target: FsTarget` 是**必填**（*"Resolved child target for follow-up operations"*）、
   * `size?: number` 可选、`version?: FsVersion` 可选。`shadowSourcesFingerprint` 正是用
   * `e.target` 递归 listDir、用 `f.size`/`f.version` 拼指纹。
   * 若这里漏掉 `target`，指纹会恒为 `undefined` ⇒ 每次都走「保守重建」⇒ **④「源未变不重写」永远测不过**
   * （而那是性能特性，必须保住）。本仓纪律：mock 与宿主契约不符时，测的是 mock 不是系统。
   */
  async listDir(t: any) {
    const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/";
    const names = new Map<string, "file" | "directory">();
    for (const k of m.keys()) {
      const nk = k.replace(/\\/g, "/");
      if (!nk.startsWith(prefix)) continue;
      const rest = nk.slice(prefix.length);
      const seg = rest.split("/")[0];
      if (!seg || seg === "_index.md") continue;
      names.set(seg, rest.includes("/") ? "directory" : "file");
    }
    return [...names].map(([n, type]) => {
      const childPath = `${base}/${n}`;
      const entry: any = { name: n, type, target: { displayPath: childPath } };
      if (type === "file") entry.size = (m.get(childPath) ?? "").length;
      return entry;
    });
  },
});

const mkCtx = (m: Map<string, string>) => {
  const agentsById = new Map<string, any>();
  const agent = (id: string, cwd = WS) => { const a = { id, session: { header: { cwd } } }; agentsById.set(id, a); return a; };
  const services = { fs: mkFs(m), agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) }, systemPrompt: { context: () => {} }, tools: { register: (d: any) => toolRegistry.set(d.name, d) }, llm: undefined, agentDefaultModel: undefined };
  const listeners = new Map<string, Function>();
  const ctx: any = { get: (k: string) => (services as any)[k], on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); }, inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => (services as any)[k] }) };
  return { m, agentsById, agent, listeners, ctx, services };
};

const mem = (entry: string, line: string) =>
  `# ${entry}\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n\n- [10:00:00] [${entry}] ${line}\n`;

const store = new Map<string, string>();
const { m, agent, ctx } = mkCtx(store);
const P = { name, inject, apply };
P.apply(ctx, { summary: { enabled: false }, recall: {} });
const T = agent("T1");
const rs = toolRegistry.get("read_shadow");
assert.ok(rs, "read_shadow 应已注册");

// ── ① 首次读索引：预热缓存 + 落盘 _index.md ──
m.set(`${WS}/.shadow/2026-09-10/2026-09-10--100000-alpha.md`, mem("alpha", "改/读 alpha.ts"));
const out1 = String(await rs.execute({}, { agent: T }));
assert.ok(out1.includes("alpha"), "首次读索引应含已存在的记忆");
const writesAfter1 = idxWrites.length;
assert.ok(writesAfter1 >= 1, "首次读索引应落盘 _index.md");
console.log(`✔ ① 首次读索引：含 alpha，落盘 ${writesAfter1} 次`);

// ── ② **核心**：别的会话写入新记忆（**不经过本进程 flush**）⇒ 必须出现在索引里 ──
// 这正是「indexDirty 是进程内 Set」看不见的那一类写入。
m.set(`${WS}/.shadow/2026-09-11/2026-09-11--090000-beta.md`, mem("beta", "改/读 beta.ts"));
const out2 = String(await rs.execute({}, { agent: T }));
assert.ok(out2.includes("beta"),
  "**别的会话写入的记忆必须出现在 _index.md**（旧实现在缓存预热后永远看不到它）");
console.log("✔ ② 别的会话写入的新记忆（绕过本进程 flush）已出现在索引里 —— 漂移被消除");

// ── ③ 源头删除 ⇒ 索引里不得留幽灵条目 ──
m.delete(`${WS}/.shadow/2026-09-10/2026-09-10--100000-alpha.md`);
const out3 = String(await rs.execute({}, { agent: T }));
assert.ok(!out3.includes("alpha"), "源头已删除的记忆不得仍出现在索引里（幽灵条目）");
assert.ok(out3.includes("beta"), "未删除的记忆仍应在索引里");
console.log("✔ ③ 源头删除 ⇒ 索引不再含幽灵条目（beta 仍在）");

// ── ④ 源未变 ⇒ 不白重写（性能特性必须保住：否则退化成「每次读都全量重建」） ──
const writesBefore4 = idxWrites.length;
const out4 = String(await rs.execute({}, { agent: T }));
assert.equal(idxWrites.length, writesBefore4, "源未变时不得重写 _index.md（避免每次读都全量重建）");
assert.ok(out4.includes("beta"), "跳过重建时返回的仍是已落盘的索引内容");
console.log("✔ ④ 源未变 ⇒ 不重写（保住了「不是每次读都全量重建」的性能特性）");

// ── ⑤ 不变量：索引内容随源**收敛**（两次连续读的索引内容一致 = 幂等） ──
const before5 = idxWrites[idxWrites.length - 1];
await rs.execute({}, { agent: T });
const after5 = idxWrites[idxWrites.length - 1];
assert.equal(after5, before5, "无源变化时索引内容必须稳定（幂等）");
console.log("✔ ⑤ 幂等：无源变化时索引内容稳定");

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机 `host.fs` 的 `listDir` 是否给 `size`/`version`（指纹可判定性）—— mock 给了最小形状；");
console.log("  · 大库下的对账成本（每次一次 listDir 扫描）未压测；折叠为「新增文件数」级的读；");
console.log("  · 删文件后 `cache` 与 `_index.md` 的收敛已验，但**同尺寸内容修改**在无 version 后端的降级未验。");
console.log("ALL PASS ✅");
