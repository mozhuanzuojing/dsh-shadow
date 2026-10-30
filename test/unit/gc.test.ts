import assert from "node:assert/strict";
import { MemoryFs } from "../../dist/store/fs.js";
import { gcDerivedIndexes } from "../../dist/store/gc.js";

const WS = "/ws";
const fs = new MemoryFs({
  [`${WS}/.shadow/indexes/materials/keep.md`]: "keep",
  [`${WS}/.shadow/indexes/materials/orphan.md`]: "orphan",
  [`${WS}/.shadow/indexes/materials/keep.md.history/1.md`]: "v1",
  [`${WS}/.shadow/indexes/materials/keep.md.history/2.md`]: "v2",
  [`${WS}/.shadow/indexes/materials/keep.md.history/3.md`]: "v3",
  [`${WS}/.shadow/indexes/projections/legacy.md`]: "legacy",
});

const expected = new Set([`${WS}/.shadow/indexes/materials/keep.md`]);
const result = await gcDerivedIndexes(fs, WS, expected, { keepHistory: 2 });

assert.equal(result.errors.length, 0);
assert.equal(result.deleted, 2, "应删除 1 个孤儿 + 1 个旧 history 版本");
assert.equal(await fs.exists(`${WS}/.shadow/indexes/materials/keep.md`), true, "本轮 plan 内的派生卡必须保留");
assert.equal(await fs.exists(`${WS}/.shadow/indexes/materials/orphan.md`), false, "本轮不再产出的派生卡应删除");
assert.equal(await fs.exists(`${WS}/.shadow/indexes/projections/legacy.md`), true, "v1 遗留 projections 不在 GC 范围");

const history = await fs.listDir(`${WS}/.shadow/indexes/materials/keep.md.history`);
assert.equal(history.ok, true);
if (!history.ok) throw new Error("history list failed");
assert.equal(history.value.length, 2, "history 只保留最近 2 个版本");

const missing = await gcDerivedIndexes(fs, "/not-there", new Set());
assert.equal(missing.errors.length, 0, "索引目录不存在是空，不是错误");
assert.equal(missing.deleted, 0);

console.log("✔ gc：孤儿派生卡 + history 版本回收；不碰 projections/atoms；缺目录不报错");
