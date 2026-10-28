import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import {
  computeForgetting,
  oldestBeyond,
  renderForgetNotice,
  staleForgetReason,
  statusForgetReason,
} from "../../dist/domain/lifecycle.js";
import type { AtomMeta, ParsedAtom } from "../../dist/contract/types.js";
import { atomText, WS } from "../helpers.ts";

const TODAY = new Date("2026-09-06T00:00:00");

const atom = (name: string, date: string, time = "100000", entry = "src/alpha.ts"): ParsedAtom => {
  const rel = `.shadow/atoms/${name}`;
  return parseAtom(atomText({ entry, date, time }), rel, name);
};

const metaOf = (patch: Partial<AtomMeta> = {}): AtomMeta => ({
  rel: "",
  hits: 0,
  status: "active",
  pinned: false,
  ...patch,
});

const relOf = (a: ParsedAtom): string => a.rel;

// 1) 状态类遗忘：archived/superseded/compacted 移出活跃集；pinned 优先
assert.equal(statusForgetReason(undefined), null);
assert.equal(statusForgetReason(metaOf({ status: "active" })), null);
assert.equal(statusForgetReason(metaOf({ status: "archived" })), "archived");
assert.equal(statusForgetReason(metaOf({ status: "superseded" })), "superseded");
assert.equal(statusForgetReason(metaOf({ status: "compacted" })), "compacted");
assert.equal(statusForgetReason(metaOf({ status: "archived", pinned: true })), null, "pinned 优先于归档");

// 2) 陈旧/低价值遗忘：minHits<=0 = 关闭（v2 默认），minHits>0 才启用
const old = atom("2026-08-01--100000-src-alpha.md", "2026-08-01");
const fresh = atom("2026-09-05--100000-src-alpha.md", "2026-09-05");
const cfgOff = { staleDays: 10, minHits: 0, maxActive: 0 };
assert.equal(staleForgetReason(old, metaOf({ hits: 0 }), cfgOff, TODAY), null, "minHits=0 不得遗忘（默认配置零改动）");
assert.equal(staleForgetReason(fresh, metaOf({ hits: 0 }), { staleDays: 10, minHits: 1, maxActive: 0 }, TODAY), null, "未到期不遗忘");
assert.equal(staleForgetReason(old, metaOf({ hits: 0 }), { staleDays: 10, minHits: 1, maxActive: 0 }, TODAY), "stale");
assert.equal(staleForgetReason(old, metaOf({ hits: 5 }), { staleDays: 10, minHits: 1, maxActive: 0 }, TODAY), null, "hits 达标不遗忘");
assert.equal(staleForgetReason(old, metaOf({ hits: 0, pinned: true }), { staleDays: 10, minHits: 1, maxActive: 0 }, TODAY), null, "pinned 不遗忘");

// 3) maxActive：按 (date,time) 取最旧的多余项
const a1 = atom("2026-08-01--100000-a.md", "2026-08-01");
const a2 = atom("2026-08-02--100000-b.md", "2026-08-02");
const a3 = atom("2026-08-03--100000-c.md", "2026-08-03");
assert.deepEqual([...oldestBeyond([a3, a1, a2], 0)], [], "0 = 不设上限");
assert.deepEqual([...oldestBeyond([a3, a1, a2], 2)].sort(), [relOf(a1)], "上限 2 → 最旧的一条被移出");
assert.deepEqual([...oldestBeyond([a3, a1, a2], 5)], [], "未超上限");

// 4) computeForgetting：组合裁决 + 计数
const atoms = [
  atom("2026-09-05--100000-fresh.md", "2026-09-05"),
  atom("2026-08-01--100000-old.md", "2026-08-01"),
  atom("2026-08-02--100000-hit.md", "2026-08-02"),
  atom("2026-08-03--100000-archived.md", "2026-08-03"),
  atom("2026-08-04--100000-pinned.md", "2026-08-04"),
];
const meta = new Map<string, AtomMeta>([
  [atoms[1]!.rel, metaOf({ hits: 0 })],
  [atoms[2]!.rel, metaOf({ hits: 9 })],
  [atoms[3]!.rel, metaOf({ status: "archived" })],
  [atoms[4]!.rel, metaOf({ status: "compacted", pinned: true })],
]);
const r = computeForgetting(atoms, meta, { staleDays: 10, minHits: 1, maxActive: 0 }, TODAY);
assert.equal(r.active.length, 3, "活跃集 = fresh + hit + pinned");
assert.equal(r.total, 2, "遗忘集 = old + archived");
assert.equal(r.counts.stale, 1);
assert.equal(r.counts.archived, 1);
assert.ok(r.forgotten.has(atoms[1]!.rel) && r.forgotten.has(atoms[3]!.rel));
assert.ok(!r.forgotten.has(atoms[4]!.rel), "pinned 不遗弃");

// 5) 默认配置下一律不忘（升级不得改变召回面）
const rDefault = computeForgetting(atoms, meta, { staleDays: 14, minHits: 0, maxActive: 0 }, TODAY);
assert.equal(rDefault.total, 1, "默认配置只剩状态类遗忘（archived）；陈旧不算");

// 6) 披露文案必须同时说清 数量/原因/没删
const notice = renderForgetNotice(r);
assert.ok(notice.includes("遗忘：2 条"), notice);
assert.ok(notice.includes("归档 1"));
assert.ok(notice.includes("陈旧低价值 1"));
assert.ok(notice.includes("Forget≠Delete"), "必须写明不是删除");
assert.ok(notice.includes(".shadow/atoms/"), "必须写出文件还在哪");
assert.equal(renderForgetNotice({ ...r, total: 0, counts: { archived: 0, superseded: 0, compacted: 0, stale: 0, cap: 0 } }), "");

console.log("✔ lifecycle：状态类/陈旧类遗忘、minHits=0 关闭、maxActive、pinned 优先、Forget≠Delete 披露");
