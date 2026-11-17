import assert from "node:assert/strict";
import { appendPoint, renderLineHeader } from "../../dist/domain/lines.js";
import { archiveColdLines, loadAtomsFromLines } from "../../dist/engine/lines.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const mkLine = (id: string, startAt: string): string => {
  const h = { lineId: id, session: "s", entry: "dsh1", startAt };
  return appendPoint(renderLineHeader(h), h, {
    seq: 1,
    at: startAt.slice(11),
    kind: "turn",
    rel: `.shadow/lines/${id}.md#1`,
    text: "x",
    body: `# dsh1\n\n> 坐标：locus(WS) · when(${startAt.replace("T", " ")}) · soul(lead) · role(default) · intent(capture)\n\n- [${startAt.slice(11)}] [dsh1] 用户：x`,
  });
};

const fs = new MemoryFs({
  [`${WS}/.shadow/lines/old.md`]: mkLine("old", "2026-01-01T10:00:00"),
  [`${WS}/.shadow/lines/new.md`]: mkLine("new", "2026-11-17T10:00:00"),
});

// dry-run
const dry = await archiveColdLines(fs, WS, 14, { apply: false, now: "2026-11-17T12:00:00" });
assert.deepEqual(dry.candidates, ["old.md"]);
assert.equal(dry.moved, 0);

// apply
const app = await archiveColdLines(fs, WS, 14, { apply: true, now: "2026-11-17T12:00:00" });
assert.equal(app.moved, 1);
const hot = await fs.listDir(`${WS}/.shadow/lines`);
assert.ok(hot.ok && hot.value.map((e) => e.name).join(",") === "new.md", "热目录只留 new");
const arch = await fs.listDir(`${WS}/.shadow/archive/lines`);
assert.ok(arch.ok && arch.value.map((e) => e.name).join(",") === "old.md", "old 应归档");

// 归档冷线仍可读（loadLines 读 hot+archive）
const rec = await loadAtomsFromLines(fs, WS);
assert.equal(rec.atoms.length, 2, `归档后仍应读回 2 点（冷可读），实际 ${rec.atoms.length}`);
assert.equal(rec.errors.length, 0);
assert.ok(rec.atoms.some((a) => a.rel.includes("/archive/lines/")), "归档点句柄应重写为 archive/lines 路径（防死链）");

console.log("✔ archive-lines：冷线移入 archive/lines · 热目录缩小 · 归档后仍可读（冷但可读）");
