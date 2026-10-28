/**
 * v2 ops — 语料基准：n 条合成 atom → DB-first 读路径的 cold/warm/查询耗时。
 * 刻意不进 verify（要造大语料）；改了 store/retrieve 后再跑。
 *
 *   node tools/corpus-bench.ts 1000
 *   node tools/corpus-bench.ts 8000
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { normalizeConfig } from "../dist/contract/config.js";
import { systemClock } from "../dist/contract/time.js";
import { SignalStore } from "../dist/engine/signals.js";
import { runRead } from "../dist/engine/read/route.js";
import { MemoryFs } from "../dist/store/fs.js";
import { IndexCache } from "../dist/store/index-cache.js";

const n = Math.max(10, Number(process.argv[2] || 1000));
const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-bench-"));
const seed: Record<string, string> = {};
for (let i = 0; i < n; i++) {
  const day = String((i % 28) + 1).padStart(2, "0");
  const name = `2026-09-${day}--10${String(i % 60).padStart(2, "0")}00-src-module-${i}.md`;
  const topic = i % 10 === 0 ? "alpha" : "beta";
  seed[`${ws}/.shadow/atoms/${name}`] =
    `# src/module-${i}.ts\n\n> 完整线索\n> 坐标：locus(${ws}) · when(2026-09-${day} 10:00:00) · soul(default) · role(default) · intent(bench)\n` +
    `> 决策：〔user〕${topic} 模块采用方案 ${i}\n> 摘要：${topic} 模块 ${i} 的改动\n\n` +
    `- [10:00:00] [src/module-${i}.ts] 用户：请处理 ${topic} 模块 ${i}\n` +
    `- [10:00:01] [src/module-${i}.ts] 决定 ${topic} 模块采用方案 ${i}\n` +
    `- [10:00:02] [src/module-${i}.ts] 改/读 src/module-${i}.ts\n`;
}

const fs = new MemoryFs(seed);
const cache = new IndexCache();
const config = normalizeConfig({ shadowRoot: ws });
const t0 = performance.now();
try {
  const idx = await cache.get(fs, ws);
  if (!idx.ok) throw new Error(idx.error.message);
  const tOpen = performance.now();

  const cold = await cache.load(idx.value, fs, ws);
  if (!cold.ok) throw new Error(cold.error.message);
  const tCold = performance.now();

  const warm = await cache.load(idx.value, fs, ws);
  if (!warm.ok) throw new Error(warm.error.message);
  const tWarm = performance.now();

  const deps = {
    fs,
    ws,
    config,
    clock: systemClock,
    signals: new SignalStore(),
    loadAtoms: () => cache.load(idx.value, fs, ws),
    index: idx.value,
  };
  const q = await runRead(deps, { topic: "alpha", max_tokens: 1600 });
  if (!q.ok) throw new Error(q.error.message);
  const tQuery = performance.now();

  console.log(`n=${n}`);
  console.log(`  open      ${(tOpen - t0).toFixed(1)} ms`);
  console.log(`  cold load ${(tCold - tOpen).toFixed(1)} ms (source=${cold.value.source})`);
  console.log(`  warm load ${(tWarm - tCold).toFixed(1)} ms (source=${warm.value.source})`);
  console.log(`  query     ${(tQuery - tWarm).toFixed(1)} ms (matched=${q.value.matched} returned=${q.value.returned})`);
  console.log(`  index     ${idx.value.count()} rows`);
  if (warm.value.source !== "db") {
    console.error("[corpus-bench] warm load 未走 db");
    process.exitCode = 1;
  }
} finally {
  cache.closeAll();
  rmSync(ws, { recursive: true, force: true });
}

