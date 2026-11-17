import assert from "node:assert/strict";
import { appendPoint, renderLineHeader } from "../../dist/domain/lines.js";
import { forgetColdLines } from "../../dist/engine/lines.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const H = (id: string, startAt: string) => ({ lineId: id, session: "s", entry: "dsh1", startAt });
const mkLine = (id: string, startAt: string, at: string): string => {
  const h = H(id, startAt);
  return appendPoint(renderLineHeader(h), h, { seq: 1, at, kind: "turn", rel: `.shadow/lines/${id}.md#1`, text: "x", body: `# dsh1\n\n> 坐标：locus(WS) · when(${startAt.replace("T", " ")}) · soul(lead) · role(default) · intent(capture)\n\n- [${at}] [dsh1] 用户：x` });
};

const oldIso = "2026-01-01T10:00:00";
const newIso = "2026-11-17T10:00:00";
const fs = new MemoryFs({
  [`${WS}/.shadow/lines/old.md`]: mkLine("old", oldIso, "10:00:00"),
  [`${WS}/.shadow/lines/new.md`]: mkLine("new", newIso, "10:00:00"),
});

// dry-run：不移动
const dry = await forgetColdLines(fs, WS, 14, { apply: false, now: "2026-11-17T12:00:00" });
assert.deepEqual(dry.candidates, ["old.md"], `应只选中冷线 old，实际 ${dry.candidates.join(",")}`);
assert.equal(dry.moved, 0, "dry-run 不应移动");
assert.ok((await fs.listDir(`${WS}/.shadow/lines`)).ok, "dry-run 后线目录仍在");

// apply：old 移入 trash，new 保留
const app = await forgetColdLines(fs, WS, 14, { apply: true, now: "2026-11-17T12:00:00" });
assert.equal(app.moved, 1, "应移动 1 条冷线");
const remain = await fs.listDir(`${WS}/.shadow/lines`);
assert.ok(remain.ok && remain.value.map((e) => e.name).join(",") === "new.md", "热线 new 应保留、old 应移走");
const trash = await fs.listDir(`${WS}/.shadow/.trash`);
assert.ok(trash.ok && trash.value.some((e) => e.name.startsWith("lines-forgotten-")), "应生成 trash 目录");

console.log("✔ forget-lines：冷线按龄移入 trash（可回退）· 热线保留 · 读目录不再含冷线");
