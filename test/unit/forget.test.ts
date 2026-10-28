import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { MemoryFs } from "../../dist/store/fs.js";
import type { ReadDeps } from "../../dist/engine/read/types.js";
import type { AtomMeta } from "../../dist/contract/types.js";
import { WS, TODAY, atomText } from "../helpers.ts";

const base = `${WS}/.shadow/atoms`;

const seed = (): Record<string, string> => ({
  [`${base}/2026-09-05--100000-fresh.md`]: atomText({ entry: "src/fresh.ts", date: "2026-09-05", summary: "新鲜" }),
  [`${base}/2026-08-01--100000-old.md`]: atomText({ entry: "src/old.ts", date: "2026-08-01", summary: "旧且没被读过" }),
  [`${base}/2026-08-02--100000-hot.md`]: atomText({ entry: "src/hot.ts", date: "2026-08-02", summary: "旧但常被召回" }),
  [`${base}/2026-08-03--100000-arch.md`]: atomText({ entry: "src/arch.ts", date: "2026-08-03", summary: "已归档" }),
});

const metaOf = (hits: number, status: AtomMeta["status"] = "active", pinned = false): AtomMeta => ({ rel: "", hits, status, pinned });

const make = (raw: Record<string, unknown>, metaEntries: Array<[string, AtomMeta]> = []): ReadDeps => ({
  fs: new MemoryFs(seed()),
  ws: WS,
  config: normalizeConfig({ shadowRoot: WS, ...raw }),
  clock: fixedClock(`${TODAY}T12:00:00`),
  signals: new SignalStore(),
  meta: new Map(metaEntries),
});

const readText = async (deps: ReadDeps, rel: string): Promise<string> => {
  const r = await deps.fs.readText(`${WS}/${rel}`);
  assert.equal(r.ok, true, `文件应仍存在：${rel}`);
  return r.ok ? r.value : "";
};

// 1) 默认配置：只做状态类遗忘（archived），陈旧类不启用；旧 atom 即使无 meta/hits 也仍在活跃集
const depsDefault = make({}, [[".shadow/atoms/2026-08-03--100000-arch.md", metaOf(0, "archived")]]);
const r1 = await runRead(depsDefault, {});
assert.equal(r1.ok, true);
const t1 = r1.ok ? r1.value.text : "";
assert.ok(t1.includes("遗忘：1 条不在活跃集（归档 1）"), t1.slice(-500));
assert.ok(t1.includes("Forget≠Delete"), "默认也要披露不删除");
assert.ok(t1.includes("2026-08-01--100000-old.md"), "陈旧类默认不启用：旧 atom 仍在活跃索引");
assert.ok(!t1.includes("2026-08-03--100000-arch.md"), "归档项应移出活跃索引");
await readText(depsDefault, ".shadow/atoms/2026-08-03--100000-arch.md");

// 2) 配置 forget.{staleDays,minHits} 后：旧+低 hits 与归档一起移出；文件仍在
const forgetCfg = { forget: { staleDays: 10, minHits: 1, maxActive: 0 } };
const depsForget = make(forgetCfg, [
  [".shadow/atoms/2026-08-01--100000-old.md", metaOf(0)],
  [".shadow/atoms/2026-08-02--100000-hot.md", metaOf(9)],
  [".shadow/atoms/2026-08-03--100000-arch.md", metaOf(0, "archived")],
]);
const r2 = await runRead(depsForget, {});
assert.equal(r2.ok, true);
const t2 = r2.ok ? r2.value.text : "";
assert.ok(t2.includes("遗忘：2 条不在活跃集"), t2.slice(-600));
assert.ok(t2.includes("陈旧低价值 1"));
assert.ok(t2.includes("归档 1"));
assert.ok(t2.includes("2026-09-05--100000-fresh.md"), "新鲜项仍在");
assert.ok(t2.includes("2026-08-02--100000-hot.md"), "hits 达标仍在");
assert.ok(!t2.includes("2026-08-01--100000-old.md"), "陈旧低价值应移出活跃索引");
await readText(depsForget, ".shadow/atoms/2026-08-01--100000-old.md");

// 3) maxActive 上限：超出部分按最旧移出，并披露 cap 原因
const depsCap = make({ forget: { staleDays: 14, minHits: 0, maxActive: 2 } });
const r3 = await runRead(depsCap, { mode: "shadow-manifest" });
assert.equal(r3.ok, true);
const t3 = r3.ok ? r3.value.text : "";
assert.ok(t3.includes("已遗忘：2"), "4 条 - 上限 2 = 2 条遗忘");
assert.ok(t3.includes("活跃"), t3.slice(0, 400));
const r3b = await runRead(depsCap, {});
const t3b = r3b.ok ? r3b.value.text : "";
assert.ok(t3b.includes("超出 maxActive 2"), t3b.slice(-600));

// 4) 诊断模式披露遗忘与活跃两个数（不隐瞒文件还在）
const r4 = await runRead(depsForget, { mode: "shadow-report" });
assert.equal(r4.ok, true);
const t4 = r4.ok ? r4.value.text : "";
assert.ok(t4.includes("原子：2（活跃）"), t4.slice(0, 300));
assert.ok(t4.includes("已遗忘：2"), t4.slice(0, 300));

// 5) 主题召回不会命中被遗忘项（活跃集之外）
const r5 = await runRead(depsForget, { topic: "旧且没被读过" });
assert.equal(r5.ok, true);
const t5 = r5.ok ? r5.value.text : "";
assert.ok(!t5.includes("2026-08-01--100000-old.md"), "遗忘项不得被主题召回命中");

console.log("✔ forget：默认不启用陈旧遗忘、配置后移出活跃集、maxActive、诊断披露、文件保留（Forget≠Delete）");
