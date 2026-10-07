// dsh-shadow —— 写侧收口回归（v1.21.42）：**只写不读，也必须发生 Episode 收口**。
//
// 根因（见 `core/writer/materialize.ts` 的 `maybeCompact` 注释）：收口原先挂在**无参 `read_shadow`**
// 的读路径上（`ensureIndex` → `rebuildIndex` → `runCompact`），而写路径明写「不在此处重建」
// ⇒ **没人无参读目录就永不收敛**。本机实测正是如此：466 条原子、`hits>0` 113 条，
// 而 `_index.md` / `abstracts/` / `-consolidated.md` **三件一起缺**、没有任何异常。
//
// 本用例**从不调用 `read_shadow`**：只 `push` + `onTurnStopping`（一次普通写入），断言收口照样发生。
// 同时锁住边界：**索引（`_index.md`）仍是懒构建** —— 本版只搬触发点，没把索引也改成写侧。
//
// 第二个场景（负对照，B24）：**收口标记（`compacted`）写失败必须可见** —— 见文件末尾。
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

// v1.21.45（ADR-0110 §2.2）：**两者并存** —— 上面那些**圈记忆原子**（住 atoms/、进缓存）是**召回面**，
// 另外还有一张**派生纪要**（住 indexes/affaires/、不进缓存）逐圈加厚，这才是「螺旋」的成长面。
const minutes = [...files.keys()].filter((k) => k.includes("/.shadow/indexes/affaires/") && k.endsWith(".md") && !k.includes(".history/"));
assert.equal(minutes.length, 1, "两个已关闭 episode 属同一件 Affaire ⇒ **只有一张纪要**（不再是「一个 episode 一个文件」）");
const mtext = files.get(minutes[0])!;
assert.ok(mtext.includes("### 圈 1") && mtext.includes("### 圈 2"), "同一张纪要应有圈 1 与圈 2（逐圈加厚）");
assert.ok(mtext.includes("采用 bundle 模式"), "纪要也应含决策正文");
assert.ok(mtext.includes("# 纪要："), "纪要必须有头（可读）");
const hist = [...files.keys()].filter((k) => k.includes("/.shadow/indexes/affaires/") && k.includes(".history/"));
assert.equal(hist.length, 1, "开第 2 圈前应落**恰好一份**归档圈（律 3）");
assert.ok(files.get(hist[0])!.includes("### 圈 1") && !files.get(hist[0])!.includes("### 圈 2"),
  "归档圈必须是**上一圈**的逐字快照（只追加、永不改写）");
assert.ok(![...files.keys()].some((k) => k.includes("/.shadow/indexes/") && k.endsWith("-consolidated.md")),
  "圈记忆原子只应住在 atoms/（派生纪要里不该再出现 consolidated 文件）");

const meta = JSON.parse(files.get("D:/ws/.shadow/_meta.json") || "{}");
assert.equal(meta[".shadow/atoms/2026-09-07--090000-pkg-a.md"]?.status, "compacted",
  "被收口的原子应在 _meta.json 标 compacted");
assert.ok(files.has("D:/ws/.shadow/atoms/2026-09-07--090000-pkg-a.md"),
  "原子文件必须保留（Forget≠Delete，可回放）");

// 边界：本版**只搬收口触发点**，索引仍是懒构建 —— 没读过目录就不该有 `_index.md`。
assert.ok(!files.has("D:/ws/.shadow/indexes/_index.md"),
  "索引仍应是懒构建：只写不读时不得出现 _index.md（否则说明顺手把索引也搬到了写侧）");

console.log("✔ 场景 Compact-Write-Side：只写不读也收口（关闭 episode → consolidated + 原子标 compacted），索引仍懒构建");

// ── 负对照（B24 消费面）：**收口标记写失败必须可见**（ADR-0049 / ADR-0085）────────────────────
// `marks` = 已收口原子的 `status = "compacted"`；它是「把已归档条目移出**活跃索引/召回**热集」的
// 唯一依据（ADR-0068）——丢了会让**已归档原子重回活跃集**，读者看到的内容因此改变，不是遥测量。
// 旧版 `await mutateMeta(...)` 把「并发没抢到」与「写失败」一起吞进没人看的 `false`
// ⇒ 一次竞争或一次磁盘故障就能**静默**改变召回面。本组只拦 `_meta.json` 的写（收口文件与纪要仍落盘），
// 断言横幅**逐条说清原因与后果**；健康路径零横幅由上面第 56 行那条正对照锁住。
{
  const m2 = new Map<string, string>();
  const fs2 = {
    resolve: async (p: string) => p,
    writeText: async (p: string, text: string) => {
      if (p.endsWith("_meta.json")) throw new Error("readonly");   // 只拦 meta ⇒ 其余写路径照常
      m2.set(p, text);
    },
    readText: async (p: string) => m2.get(p) || "",
    listDir: async (dir: string) => [...m2.keys()]
      .filter((k) => k.startsWith(`${dir}/`))
      .map((k) => ({ name: k.slice(dir.length + 1) }))
      .filter((e) => !e.name.includes("/")),
  };
  const seed2 = (name: string, entry: string, decision: string, path: string) =>
    m2.set(`D:/ws2/.shadow/atoms/${name}`,
      `# ${entry}\n\n> 完整线索\n> 坐标：locus(ws2) · when(2026-09-07 09:00:00) · soul(default) · role(default) · intent(test)\n` +
      `> 背景/材料：${path}\n> 决策：〔user〕${decision}\n> 概况：1 动作 · 1 用户消息 · 1 决策\n` +
      `> 项目：ws2\n> Agent：T8\n\n- [09:00:00] [${entry}] 改/读 ${path}\n`);
  seed2("2026-09-07--090000-pkg-a.md", "pkg-a", "采用 bundle 模式", "pkg-a/x.js");
  seed2("2026-09-07--090100-pkg-a.md", "pkg-a", "拆分模块", "pkg-a/x2.js");
  seed2("2026-09-07--120000-pkg-b.md", "pkg-b", "收尾 pkg-b", "pkg-b/y.js");

  const c2 = createShadowCollector({
    context: { get: (k: string) => (k === "fs" ? fs2 : undefined) },
    config: {
      summary: { enabled: false }, writeConsent: false,
      forget: { enabled: false },                 // 同上面那条：隔离遗忘策略，只测收口
      compact: { enabled: true, gapMinutes: 60 },
      retention: {},                             // 让 registerMeta 也真的走一遍（它同样会失败 ⇒ 另一条横幅）
      shadowRoot: "D:/ws2",
    },
    getAgentById: (id: string | undefined) => ({ id }),
  });
  c2.push("T8", { kind: "action", text: "改/读 spec/u9.md", comp: "spec/u9.md", source: "fs" });
  c2.push("T8", { kind: "user", text: "用户：记住收口标记写失败必须可见", comp: "", source: "user" });
  await c2.onTurnStopping({ agent: { id: "T8" } });

  const w = c2.getFlushWarn();
  assert.ok(w.includes("compact"), `收口标记写失败必须留痕（丢了会让已归档原子重回活跃集）；实际 ${JSON.stringify(w)}`);
  assert.ok(w.includes("收口标记未落盘") && w.includes("写失败"),
    `横幅必须分开写**原因**（写失败 ≠ 并发没抢到）并说清后果；实际 ${JSON.stringify(w)}`);
  assert.ok(m2.has("D:/ws2/.shadow/atoms/2026-09-07--090000-pkg-a.md"),
    "原子文件必须保留（Forget≠Delete，可回放）—— 缺的只是「移出活跃集」这一步");
  assert.ok([...m2.keys()].some((k) => k.includes("-consolidated.md")),
    "正对照：收口文件仍应落盘（证明失败点确实只在 `_meta.json` 那一步）");
  console.log("✔ 场景 Compact-Write-Side-2（负对照）：收口标记写失败 ⇒ 「能力降级 · compact」横幅可见且分开写明原因");
}

console.log("ALL PASS ✅");
