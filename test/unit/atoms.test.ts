import assert from "node:assert/strict";
import { fixedClock } from "../../dist/contract/time.js";
import { err } from "../../dist/contract/outcome.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { loadAtoms, readAtom, writeAtom } from "../../dist/store/atoms.js";
import { atomText, WS } from "../helpers.ts";

const clock = fixedClock("2026-09-06T12:00:00");
const fs = new MemoryFs();
const text = atomText({ entry: "src/alpha.ts" });

const first = await writeAtom(fs, WS, { entry: "src/alpha.ts", text, date: "2026-09-06", time: "120000", uid: "aaaaaa" }, clock);
assert.equal(first.ok, true);
if (!first.ok) throw new Error("first write failed");
assert.equal(first.value.name, "2026-09-06--120000-src-alpha-ts--aaaaaa.md");

// 同秒 + 同入口 + 同 uid：必须换 uid，绝不覆盖
const second = await writeAtom(fs, WS, { entry: "src/alpha.ts", text: text.replace("src/alpha.ts", "src/alpha2.ts"), date: "2026-09-06", time: "120000", uid: "aaaaaa" }, clock);
assert.equal(second.ok, true);
if (!second.ok) throw new Error("second write failed");
assert.notEqual(second.value.name, first.value.name);

const loaded = await loadAtoms(fs, WS);
assert.equal(loaded.ok, true);
if (!loaded.ok) throw new Error("load failed");
assert.equal(loaded.value.atoms.length, 2);
assert.equal(loaded.value.errors.length, 0);

const one = await readAtom(fs, WS, first.value.rel);
assert.equal(one.ok, true);
if (!one.ok) throw new Error("read failed");
assert.equal(one.value.entry, "src/alpha.ts");

const missing = await readAtom(fs, WS, ".shadow/atoms/2026-09-06--120000-nope--zzzzzz.md");
assert.equal(missing.ok, false);
if (missing.ok) throw new Error("expected missing");
assert.equal(missing.error.code, "NOT_FOUND");

class FailingWriteFs extends MemoryFs {
  override async writeText() {
    return err("PERMISSION", "denied", { path: "x" }) as never;
  }
}
const failing = new FailingWriteFs();
const failed = await writeAtom(failing, WS, { entry: "src/alpha.ts", text }, clock);
assert.equal(failed.ok, false);
if (failed.ok) throw new Error("expected write failure");
assert.equal(failed.error.code, "PERMISSION");

class FailingReadFs extends MemoryFs {
  override async readText(p: string) {
    if (p.includes("--aaaaaa.md")) return err("PERMISSION", "denied", { path: p }) as never;
    return super.readText(p);
  }
}
const fr = new FailingReadFs({ [`${WS}/${first.value.rel}`]: text, [`${WS}/${second.value.rel}`]: text });
const partial = await loadAtoms(fr, WS);
assert.equal(partial.ok, true);
if (!partial.ok) throw new Error("load failed");
assert.equal(partial.value.errors.length, 1);
assert.equal(partial.value.errors[0]!.code, "PERMISSION");

// v1 旧日期树只读兼容：`.shadow/<YYYY-MM-DD>/*.md` 必须被 loadAtoms 读到
const legacyFs = new MemoryFs({
  [`${WS}/.shadow/2020-01-01/2020-01-01--010101-legacy-entry.md`]: atomText({ entry: "src/legacy.ts", date: "2020-01-01" }),
});
const legacy = await loadAtoms(legacyFs, WS);
assert.equal(legacy.ok, true);
if (!legacy.ok) throw new Error("legacy load failed");
assert.equal(legacy.value.atoms.length, 1);
assert.equal(legacy.value.atoms[0]!.rel, ".shadow/2020-01-01/2020-01-01--010101-legacy-entry.md");
assert.equal(legacy.value.atoms[0]!.date, "2020-01-01");

console.log("✔ atoms：唯一命名、同秒不覆盖、读缺失 NOT_FOUND、写失败显式、部分读失败可见、v1 日期树只读");

