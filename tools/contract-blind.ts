/**
 * v2 ops — CONTRACT C6 读者盲测数据包生成器。
 *
 * 只生成 packets（读者可见）与 key（判卷可见）；不调用 LLM、不改 .shadow。
 * 读者只应看 packets.json；key.json 由评审/判卷使用。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeConfig } from "../dist/contract/config.js";
import { systemClock } from "../dist/contract/time.js";
import { loadAllAtoms } from "../dist/store/archive.js";
import { realFs } from "../dist/store/fs.js";
import { scoreAtoms } from "../dist/engine/read/recall.js";
import { snippetFor } from "../dist/domain/rank.js";
import { tokenize } from "../dist/domain/text.js";

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const ws = resolve(arg("ws", process.cwd()));
const n = Math.max(1, Math.min(50, Number(arg("n", "10")) || 10));
const outDir = resolve(arg("out", `_tmp/contract-blind-${systemClock.today()}`));

const all = await loadAllAtoms(realFs, ws);
if (!all.ok) {
  console.error(`[contract-blind] load failed（${all.error.code}）：${all.error.message}`);
  process.exit(2);
}
const candidates = all.value.atoms
  .filter((a) => a.body.trim() && a.kind === "memory" && a.entry !== "shadow" && Boolean(a.summary || a.decisions.length || a.goal))
  .sort((a, b) => `${b.date} ${b.time} ${b.rel}`.localeCompare(`${a.date} ${a.time} ${a.rel}`));
const groups = new Map<string, typeof candidates>();
for (const a of candidates) {
  const list = groups.get(a.entry) ?? [];
  list.push(a);
  groups.set(a.entry, list);
}
const queues = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, list]) => list.slice());
const picked: typeof candidates = [];
while (picked.length < n && queues.some((q) => q.length)) {
  for (const q of queues) {
    const a = q.shift();
    if (a) picked.push(a);
    if (picked.length >= n) break;
  }
}

const cases = picked.map((a, i) => {
  const query = [a.summary, a.decisions[0], a.goal, a.entry].filter(Boolean).join(" ").trim();
  const scored = scoreAtoms(all.value.atoms, tokenize(query), {
    config: normalizeConfig({}),
    meta: new Map(),
    todayStr: systemClock.today(),
  });
  const results = scored.slice(0, 8).map((s) => ({
    handle: s.atom.archiveRel ?? s.atom.rel,
    entry: s.atom.entry,
    summary: s.atom.summary,
    snippet: snippetFor(s.atom.body, tokenize(query)).slice(0, 300),
  }));
  return {
    id: `case-${String(i + 1).padStart(2, "0")}`,
    query,
    results,
  };
});

const key = picked.map((a, i) => ({
  id: `case-${String(i + 1).padStart(2, "0")}`,
  targetRel: a.rel,
  entry: a.entry,
  expected: {
    materials: a.materials.slice(0, 12),
    userMessages: a.userMessages.slice(0, 12),
    decisions: a.decisions.slice(0, 12),
    actions: a.actions.slice(0, 12),
    summary: a.summary,
    goal: a.goal,
  },
}));

mkdirSync(outDir, { recursive: true });
const packetPath = resolve(outDir, "packets.json");
const keyPath = resolve(outDir, "key.json");
writeFileSync(packetPath, JSON.stringify({ workspace: ws, generatedAt: new Date().toISOString(), cases }, null, 2) + "\n");
writeFileSync(keyPath, JSON.stringify({ workspace: ws, generatedAt: new Date().toISOString(), cases: key }, null, 2) + "\n");
console.log(JSON.stringify({ packetPath, keyPath, cases: cases.length }, null, 2));
