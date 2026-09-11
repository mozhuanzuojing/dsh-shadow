// dsh-shadow —— 目录级 L0/L1 sidecar 的回归锁（ADR-0065 吸收 OpenViking / D6，v1.15.35）。
//
// 背景（`adr/0065-absorbing-openviking.md` 的「可吸收三条」，D6 决定「三条都做」）：
//   ① 目录级 abstract + overview sidecar —— 今天判断相关**必须先读记忆文件**、只能靠全局 `_index.md`；
//   ② **上层由下层确定性派生** —— 消除层间漂移；
//   ③ 派生件**自报覆盖率与待处理变更**。
//
// 本测试锁住三件事（对应三条），外加两条**结构边界**（越界会污染 source）：
//   ① 确定性：同输入必得**逐字节相同**输出；且排序只在 deriveL1 里做（与 listDir 顺序无关）。
//   ② 层间不漂移：**L0 必须是 L1 的函数** —— 反例：只改 L1 不改 L0 ⇒ 必须被判为漂移。
//   ③ 覆盖率自洽 + `sidecarDrift` 真会报警（**正对照**，否则「0 条漂移」可能只是检测器不工作）。
//   ④ `pending` 非 0（sidecar 落后于源头）必须被检出。
//   ⑤ **`_` 前缀文件不得被 `listMemories` 当成记忆**（否则 sidecar 会变成一条「记忆」）。
import assert from "node:assert/strict";
import {
  L0_MAX, L1_MAX, SIDECAR_NAME,
  deriveL0, deriveL1, renderSidecar, parseSidecar, sidecarDrift, sidecarRel,
  type MemoryFace,
} from "../dist/core/abstract.js";
import { listMemories } from "../dist/persistence/files.js";

const face = (name: string, time: string, entry: string, topics: string[] = []): MemoryFace => ({ name, time, entry, topics });

// ── ① 确定性：同输入逐字节相同；且**与输入顺序无关** ──
{
  const a = [face("2026-09-08--100000-alpha.md", "100000", "alpha", ["t1"]), face("2026-09-08--090000-beta.md", "090000", "beta", ["t2"])];
  const l1_first = deriveL1(a);
  const l1_reversed = deriveL1([...a].reverse());
  assert.equal(l1_first, l1_reversed, "deriveL1 必须与输入顺序无关（排序在函数内做）");
  assert.equal(deriveL1(a), l1_first, "deriveL1 必须是纯函数（同输入同输出）");
  assert.ok(l1_first.includes("记忆 2 条"), `L1 应自报条数；实际 ${JSON.stringify(l1_first.slice(0, 60))}`);
  assert.ok(l1_first.includes("090000–100000"), `L1 时刻跨度应升序规范化；实际 ${JSON.stringify(l1_first)}`);
  assert.ok(l1_first.includes("alpha") && l1_first.includes("beta"), "L1 应列出全部入口");
  assert.equal(deriveL1([]), "", "空输入 ⇒ 空 L1（不编造）");
  console.log("✔ ① 确定性：同输入逐字节相同，且与 listDir 顺序无关（排序只在 deriveL1 内）");
}

// ── ② 层间不漂移：**L0 必须是 L1 的函数**（这是 D6「②」的要害） ──
{
  const l1 = deriveL1([face("2026-09-08--100000-a.md", "100000", "a")]);
  const l0 = deriveL0(l1);
  assert.ok(l0.length > 0, "L0 应由 L1 抽出非空内容");
  assert.ok(!l0.includes("#"), "L0 应剥掉 markdown 记号");
  assert.ok(l0.length <= L0_MAX, `L0 不得超过 ${L0_MAX} 字符（实际 ${l0.length}）`);
  assert.ok(l1.length <= L1_MAX, `L1 不得超过 ${L1_MAX} 字符`);
  assert.equal(deriveL0(""), "", "空 L1 ⇒ 空 L0");
  // 截断只在超长时发生（`cap(x) === x` 当 x 未超长）——
  // 这条不变量重要：若短文本也加省略号，「每次读都略有不同」会让棘轮恒红。
  // 注：抽取**只剥标题行**（`#` 开头），**不剥列表记号** `- ` —— 那是文档化行为
  //（L1 的正文由 bullet 组成，故 L0 会带上 `- `；见 `core/abstract.ts` 的 `deriveL0` 注释）。
  assert.equal(deriveL0("## 概览\n短文本"), "短文本", "未超长时不得加省略号");
  assert.equal(deriveL0("## 概览\n- 短文本"), "- 短文本", "列表记号按文档化行为保留（只剥标题）");
  console.log("✔ ② L0 由 L1 确定性抽取；层间不一致在**构造上**不可能（L0 = f(L1)）");
}

// ── ③ 往返 + 覆盖率自洽 + **正对照**（检测器真会报警） ──
{
  const faces = [face("2026-09-08--100000-a.md", "100000", "a", ["x"]), face("2026-09-08--110000-b.md", "110000", "b", ["y"])];
  const l1 = deriveL1(faces);
  const text = renderSidecar("2026-09-08", l1, { covered: faces.length, pending: 0 });

  const parsed = parseSidecar(text);
  assert.ok(parsed, "sidecar 必须可逆向解析（棘轮靠它逐项对账）");
  assert.equal(parsed!.coverage.covered, 2, "covered 应可解析回 2");
  assert.equal(parsed!.coverage.pending, 0, "pending 应可解析回 0");
  assert.equal(parsed!.l1, l1, "L1 往返必须逐字节一致");
  assert.equal(parsed!.l0, deriveL0(l1), "L0 往返必须等于由 L1 抽取的结果");

  // 一致 ⇒ 0 条漂移
  assert.deepEqual(sidecarDrift(faces, text), [], "sidecar 与源一致时应报 0 条漂移");

  // **正对照**（ADR-0062 §2 纪律：先证工具会报警，再用它）
  // (a) 源头多了一条而 sidecar 没跟上 ⇒ 必须报「落后于源头」
  const drifted1 = sidecarDrift([...faces, face("2026-09-08--120000-c.md", "120000", "c")], text);
  assert.ok(drifted1.some((e) => e.includes("落后于源头")), `源头变了必须被检出；实际 ${JSON.stringify(drifted1)}`);
  // (b) 只把 L0 单独改掉（层间漂移）⇒ 必须报
  const tampered = text.replace(/## L0\n[^\n]*/, "## L0\n被单独改过的 L0");
  const drifted2 = sidecarDrift(faces, tampered);
  assert.ok(drifted2.some((e) => e.includes("L0 被单独改过")), `L0 被单独改过必须被检出；实际 ${JSON.stringify(drifted2)}`);
  // (c) 无法解析 / 坏文件 ⇒ 不抛，报可读原因
  assert.deepEqual(sidecarDrift(faces, ""), ["sidecar 无法解析（缺 L0 / L1 / 覆盖率 段）"], "空文件应报无法解析");
  assert.equal(parseSidecar("随便一段文字"), undefined, "不可解析的文本 ⇒ undefined（不编造）");
  console.log("✔ ③ 往返一致 + 覆盖率可解析；**正对照**：源头落后 / L0 单独被改 / 坏文件 三种都能被抓到");
}

// ── ④ `pending` 非 0（派生件自报「我没跟上」）必须被检出 ──
{
  const faces = [face("2026-09-08--100000-a.md", "100000", "a")];
  const l1 = deriveL1(faces);
  const lagging = renderSidecar("2026-09-08", l1, { covered: 1, pending: 3 });
  const errs = sidecarDrift(faces, lagging);
  assert.ok(errs.some((e) => e.includes("pending=3")), `自报 pending 非 0 必须被检出；实际 ${JSON.stringify(errs)}`);
  const wrongCount = renderSidecar("2026-09-08", l1, { covered: 9, pending: 0 });
  assert.ok(sidecarDrift(faces, wrongCount).some((e) => e.includes("covered=9")), "covered 与实际不符必须被检出");
  console.log("✔ ④ 覆盖率自报被**独立重算**（不信它）：pending 非 0、covered 不符都会红");
}

// ── ⑤ 结构边界：`_` 前缀文件**不得**被 `listMemories` 当成记忆 ──
//    这条是「sidecar 放日期目录里」这一决定的**前提**（见 `persistence/files.ts` 的注释）。
{
  const store = new Map<string, string>([
    ["D:/ws/.shadow/2026-09-08/2026-09-08--100000-a.md", "# a\n"],
    ["D:/ws/.shadow/2026-09-08/_index.md", "# idx\n"],
    [`D:/ws/.shadow/2026-09-08/${SIDECAR_NAME}`, "# sidecar\n"],
    ["D:/ws/.shadow/2026-09-08/_meta.json", "{}"],
  ]);
  const fs: any = {
    async resolve(p: string) { return { targetKey: p, displayPath: p }; },
    async listDir(t: any) {
      const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
      const prefix = base + "/";
      const names = new Set<string>();
      for (const k of store.keys()) if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split("/")[0]);
      return [...names].map((n) => ({ name: n }));
    },
  };
  const mems = await listMemories(fs, "D:/ws");
  const names = mems.map((m: any) => m.name);
  assert.deepEqual(names, ["2026-09-08--100000-a.md"],
    `只有真记忆该被枚举；实际 ${JSON.stringify(names)}（sidecar / _index.md / _meta.json 都不是记忆）`);
  assert.ok(!names.includes(SIDECAR_NAME), "sidecar 绝不能变成一条「记忆」（否则它会被索引、被召回、被计数）");
  assert.equal(sidecarRel("2026-09-08"), ".shadow/2026-09-08/_abstract.md", "sidecar 路径必须是 `_` 前缀");
  assert.ok(SIDECAR_NAME.startsWith("_"), "sidecar 名字必须 `_` 前缀（枚举器按前缀分类）");
  console.log("✔ ⑤ 结构边界：`_` 前缀文件被枚举器排除（sidecar / _index.md / _meta.json 都不是记忆）");
}

// ── ⑥ 端到端：真跑一次索引重建 ⇒ sidecar 落盘 + `_index.md` 引用其 L0 ──
{
  const mod: any = await import("../dist/index.js");
  const store = new Map<string, string>();
  const toolRegistry = new Map<string, any>();
  const mkFs = () => ({
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText(t: any) { return store.get(t.displayPath) ?? ""; },
    async writeText(t: any, c: string) { store.set(t.displayPath, c); return { version: "v1" }; },
    async listDir(t: any) {
      const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
      const prefix = base + "/";
      const names = new Map<string, "file" | "directory">();
      for (const k of store.keys()) {
        const nk = k.replace(/\\/g, "/");
        if (!nk.startsWith(prefix)) continue;
        const rest = nk.slice(prefix.length);
        const seg = rest.split("/")[0];
        if (!seg) continue;
        names.set(seg, rest.includes("/") ? "directory" : "file");
      }
      return [...names].map(([n, type]) => {
        const childPath = `${base}/${n}`;
        const e: any = { name: n, type, target: { displayPath: childPath } };
        if (type === "file") e.size = (store.get(childPath) ?? "").length;
        return e;
      });
    },
  });
  const agentsById = new Map<string, any>();
  const agent = { id: "T1", session: { id: "s1", header: { cwd: "D:/ws" } } };
  agentsById.set("T1", agent);
  const services: any = {
    fs: mkFs(),
    agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) },
    systemPrompt: { context: () => {} },
    tools: { register: (d: any) => toolRegistry.set(d.name, d) },
    llm: undefined, agentDefaultModel: undefined,
  };
  const listeners = new Map<string, Function>();
  const ctx: any = {
    get: (k: string) => services[k],
    on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); },
    inject: (_d: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
  };
  mod.apply(ctx, { summary: { enabled: false }, recall: {} });
  store.set("D:/ws/.shadow/2026-09-08/2026-09-08--100000-alpha.md",
    "# alpha\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n\n- [10:00:00] [alpha] 改/读 alpha.ts\n");
  const rs = toolRegistry.get("read_shadow");
  await rs.execute({}, { agent });
  const sidecarPath = "D:/ws/.shadow/2026-09-08/_abstract.md";
  assert.ok(store.has(sidecarPath), `索引重建应产出目录级 sidecar；实际写入 ${JSON.stringify([...store.keys()])}`);
  const errs = sidecarDrift(
    [{ name: "2026-09-08--100000-alpha.md", time: "100000", entry: "alpha", topics: ["alpha"] }],
    store.get(sidecarPath)!,
  );
  // 注意：这里只用**一条**记忆面去对账，故只断言「L0 是 L1 的函数」与「能解析」两条硬不变量，
  // 完整覆盖率的端到端对账由 ③/④ 用构造的输入精确覆盖（避免把 `topics` 的派生细节写进断言）。
  assert.ok(parseSidecar(store.get(sidecarPath)!) !== undefined, "落盘的 sidecar 必须可解析");
  assert.ok(!errs.some((e) => e.includes("L0 被单独改过")), `落盘 sidecar 的 L0 必须等于由 L1 抽取的结果；实际 ${JSON.stringify(errs)}`);
  const idx = store.get("D:/ws/.shadow/_index.md") || "";
  assert.ok(idx.includes("目录摘要"), "`_index.md` 应引用目录级 L0（这条读路径让 sidecar 不是死代码）");
  assert.ok(idx.includes("2026-09-08"), "`_index.md` 的目录摘要段应列出该目录");
  console.log("✔ ⑥ 端到端：索引重建产出 `_abstract.md`，且 `_index.md` 引用其 L0（读路径存在，非死代码）");
}

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机语料上的**规模与耗时**（每日期目录一次写；本测试只用 1–2 条记忆）；");
console.log("  · sidecar **读路径的召回收益**未测 —— 本轮只做到「`_index.md` 引用 L0」，未改检索排序；");
console.log("  · **L0 抽取质量**（它只是 L1 的确定性首段，不含判断）：相关性判断仍属读侧，未经评测；");
console.log("  · 存量 `_index.md` 的回填未做（旧目录的 sidecar 要等各自索引重建才生成）。");
console.log("ALL PASS ✅");
