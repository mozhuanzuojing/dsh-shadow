import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { queryView } from "../../dist/engine/read/modes.js";
import type { ParsedAtom } from "../../dist/contract/types.js";

const atom: ParsedAtom = {
  rel: ".shadow/atoms/2026-10-30--100000-a--aaaaaa.md",
  name: "2026-10-30--100000-a--aaaaaa.md",
  date: "2026-10-30",
  time: "100000",
  slug: "a",
  uid: "aaaaaa",
  entry: "src/a.ts",
  project: "p",
  agent: "a",
  goal: "按日归档",
  summary: "按日归档 trash",
  axes: { locus: "", when: "", soul: "", role: "", intent: "" },
  materials: [],
  decisions: [],
  decisionEvents: [],
  userMessages: [],
  actions: [],
  thinkLines: [],
  body: "按日归档 trash",
  archiveRel: ".shadow/archive/2026-10-30.jsonl#.shadow/atoms/2026-10-30--100000-a--aaaaaa.md",
  kind: "memory",
};

const out = queryView(
  {
    config: normalizeConfig({}),
    clock: fixedClock("2026-10-31T12:00:00"),
    meta: new Map(),
    limit: 3,
    fs: {} as any,
    ws: "/ws",
    signals: { note() {}, clear() {} } as any,
  },
  [atom],
  { topic: "按日归档", limit: 3 },
);
assert.match(out.body, /证据：\.shadow\/archive\/2026-10-30\.jsonl#/, "query evidence 必须用 archiveRel 句柄");

console.log("✔ queryView：证据路径优先 archiveRel（归档 atom 不再指向不存在的热文件）");
