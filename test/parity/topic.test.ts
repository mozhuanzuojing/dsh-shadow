import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { runRead } from "../../dist/engine/read/route.js";
import { MemoryFs } from "../../dist/store/fs.js";

const root = join(process.cwd(), "fixtures", "oracle-v1");
const corpus = join(root, "corpus");
const WS = "/ws";

const seed: Record<string, string> = {};
for (const e of readdirSync(corpus, { recursive: true, withFileTypes: true })) {
  if (!e.isFile()) continue;
  const full = join((e as any).parentPath ?? (e as any).path, e.name);
  const rel = relative(corpus, full).replace(/\\/g, "/");
  seed[`${WS}/${rel}`] = readFileSync(full, "utf8");
}

const metaRaw = JSON.parse(readFileSync(join(corpus, ".shadow", "_meta.json"), "utf8")) as Record<string, any>;
const meta = new Map<string, any>();
for (const [rel, v] of Object.entries(metaRaw)) {
  meta.set(rel, { rel, hits: v.hits ?? 0, status: v.status ?? "active", pinned: !!v.pinned });
}

const deps = {
  fs: new MemoryFs(seed),
  ws: WS,
  config: normalizeConfig({ shadowRoot: WS }),
  clock: fixedClock("2026-09-06T12:00:00"),
  signals: new SignalStore(),
  meta,
};

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as {
  queries: { id: string; slug: string; args: Record<string, unknown> }[];
};

const v1refs = (t: string): string[] => [...new Set([...t.matchAll(/^\[(\.shadow\/atoms\/[^\]]+\.md)\]/gm)].map((m) => m[1]!))];
const v2refs = (t: string): string[] => [...new Set([...t.matchAll(/^- \[(\.shadow\/atoms\/[^\]]+\.md)\]/gm)].map((m) => m[1]!))];

const jaccard = (a: string[], b: string[]): number => {
  const A = new Set(a);
  const B = new Set(b);
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  const union = new Set([...A, ...B]).size;
  return union ? hit / union : 1;
};

let sum = 0;
let n = 0;
const rows: string[] = [];
for (const q of manifest.queries) {
  if (q.id === "q20") continue; // no-arg index 不是召回路径，单独由 read.test 覆盖
  const out = JSON.parse(readFileSync(join(root, "outputs", "topic", `${q.slug}.json`), "utf8")) as { text?: string };
  const r = await runRead(deps, q.args);
  assert.equal(r.ok, true, `${q.id} 应成功：${r.ok ? "" : r.error.message}`);
  if (!r.ok) continue;
  const v1 = v1refs(out.text ?? "");
  const v2 = v2refs(r.value.text);
  const j = jaccard(v1, v2);
  sum += j;
  n++;
  rows.push(`${q.id} v1=${v1.length} v2=${v2.length} J=${j.toFixed(2)}`);
}

const avg = sum / n;
for (const row of rows) console.log(`  ${row}`);
console.log(`  avg Jaccard=${avg.toFixed(3)} (n=${n})`);

// 合成语料上的 v2 与 v1 排序有已知偏差（v2 修了 decision 换行/预算、entry 归一化）：
// 阈值取 0.85，并在 docs/v2/PARITY.md 的允许偏差里登记 q02/q07/q10。
assert.ok(avg >= 0.85, `topic parity 平均 Jaccard 应 ≥0.85，实际 ${avg.toFixed(3)}`);

const noMatch = await runRead(deps, { topic: "完全不存在主题zzz" });
assert.equal(noMatch.ok, true);
if (noMatch.ok) assert.ok(noMatch.value.text.includes("未找到相关记忆"), "无命中语义应保留");

console.log("✔ parity(topic)：19 条查询在冻结 v1 语料上平均 Jaccard ≥0.85；无命中语义保留");
