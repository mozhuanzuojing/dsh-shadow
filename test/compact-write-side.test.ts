// dsh-shadow —— 写侧收口回归（v1.21.42）：**只写不读，也必须发生 Episode 收口**。
//
// 根因（见 `core/writer/materialize.ts` 的 `maybeCompact` 注释）：收口原先挂在**无参 `read_shadow`**
// 的读路径上（`ensureIndex` → `rebuildIndex` → `runCompact`），而写路径明写「不在此处重建」
// ⇒ **没人无参读目录就永不收敛**。本机实测正是如此：466 条原子、`hits>0` 113 条，
// 而 `_index.md` / `abstracts/` / `-consolidated.md` **三件一起缺**、没有任何异常。
//
// 本用例**从不调用 `read_shadow`**：只 `push` + `onTurnStopping`（一次普通写入），断言收口照样发生。
// 同时锁住边界：**索引（`_index.md`）仍是懒构建** —— 本版只搬触发点，没把索引也改成写侧。
import assert from "node:assert/strict";
import { createShadowCollector } from "../dist/core/writer/index.js";

const files = new Map<string, string>();
const fs = {
  resolve: async (p: string) => p,
  writeText: async (p: string, text: string) => { files.set(p, text); },
  readText: async (p: string) => files.get(p) || "",
  // `listMemories` 只读 `f.name`（见 `persistence/files.ts`）⇒ 目录列表给名字即可。
  listDir: async (dir: string) => [...files.keys()]
    .filter((k) => k.startsWith(`${dir}/`))
    .map((k) => ({ name: k.slice(dir.length + 1) }))
    .filter((e) => !e.name.includes("/")),
};
const context = { get: (k: string) => (k === "fs" ? fs : undefined) };
const config = {
  summary: { enabled: false },   // 避免触发 llm
  writeConsent: false,
  // ⚠ 必须显式关掉遗忘：本用例的 seed 是 09-07 的原子，而 `forget` 默认开 ⇒ 它们会因「过期」被
  // 剔出活跃集（第一次跑这条用例就是这么红的：插桩显示 `cache=1`，只剩刚落盘那条）。
  // 本用例测的是**收口触发点**，不是遗忘策略 ⇒ 用 `forget:{enabled:false}` 把它隔离掉（同 `episode-lineage` 场景 7）。
  forget: { enabled: false },
  compact: { enabled: true, gapMinutes: 60 },
  retention: {},                 // 让 registerMeta / mutateMeta 真的走一遍
  shadowRoot: "D:/ws",           // 显式根：否则会落兜底根并置 scope 提示（见 writer-write 用例的注）
};
const collector = createShadowCollector({ context, config, getAgentById: (id: string | undefined) => ({ id }) });

// ── 语料：两个**已关闭**的 episode（A：09:00/09:01/09:05；B：12:00）+ 当前这次写入（今天）──────
const seed = (name: string, entry: string, decision: string, path: string) =>
  files.set(`D:/ws/.shadow/atoms/${name}`,
    `# ${entry}\n\n> 完整线索\n> 坐标：locus(ws) · when(2026-09-07 09:00:00) · soul(default) · role(default) · intent(test)\n` +
    `> 背景/材料：${path}\n> 决策：〔user〕${decision}\n> 概况：1 动作 · 1 用户消息 · 1 决策\n` +
    `> 项目：ws\n> Agent：T7\n\n- [09:00:00] [${entry}] 改/读 ${path}\n`);
seed("2026-09-07--090000-pkg-a.md", "pkg-a", "采用 bundle 模式", "pkg-a/x.js");
seed("2026-09-07--090100-pkg-a.md", "pkg-a", "拆分模块", "pkg-a/x2.js");
seed("2026-09-07--090500-pkg-a.md", "pkg-a", "重构 resolver", "pkg-a/x3.js");
seed("2026-09-07--120000-pkg-b.md", "pkg-b", "收尾 pkg-b", "pkg-b/y.js");

const before = files.size;
// ⚠ 必须**同时**推一条用户消息：只有纯动作的批次按 ADR-0097（记录粒度）**进审计流**、不落记忆文件
//（第一次跑这条用例就是这么红的：`audit/2026-09-30.jsonl` 出现了、原子没有）。
collector.push("T7", { kind: "action", text: "改/读 spec/u8.md", comp: "spec/u8.md", source: "fs" });
collector.push("T7", { kind: "user", text: "用户：记住这次写侧收口验证", comp: "", source: "user" });
await collector.onTurnStopping({ agent: { id: "T7" } });   // ← 唯一动作：一次**写**

assert.equal(collector.getFlushWarn(), "", "写侧收口不应产生降级警告");
assert.ok(files.size > before, "flush 应落盘新原子");

const consolidated = [...files.keys()].filter((k) => k.includes("/.shadow/atoms/") && k.includes("-consolidated.md"));
assert.ok(consolidated.length >= 1, "**只写不读**也必须生成 consolidated 收口文件（v1.21.42 修的就是这一步）");
const ctext = consolidated.map((k) => files.get(k) || "").join("\n");
assert.ok(ctext.includes("采用 bundle 模式"), "consolidated 文件应保留决策正文");
assert.ok(ctext.includes("改/读 pkg-a/x.js"), "consolidated 文件应保留动作背景");

const meta = JSON.parse(files.get("D:/ws/.shadow/_meta.json") || "{}");
assert.equal(meta[".shadow/atoms/2026-09-07--090000-pkg-a.md"]?.status, "compacted",
  "被收口的原子应在 _meta.json 标 compacted");
assert.ok(files.has("D:/ws/.shadow/atoms/2026-09-07--090000-pkg-a.md"),
  "原子文件必须保留（Forget≠Delete，可回放）");

// 边界：本版**只搬收口触发点**，索引仍是懒构建 —— 没读过目录就不该有 `_index.md`。
assert.ok(!files.has("D:/ws/.shadow/indexes/_index.md"),
  "索引仍应是懒构建：只写不读时不得出现 _index.md（否则说明顺手把索引也搬到了写侧）");

console.log("✔ 场景 Compact-Write-Side：只写不读也收口（关闭 episode → consolidated + 原子标 compacted），索引仍懒构建");
console.log("ALL PASS ✅");
