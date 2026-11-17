import assert from "node:assert/strict";
import { appendPoint, lineLastAt, nextSeq, renderLineHeader } from "../../dist/domain/lines.js";

const H = { lineId: "x", session: "s", entry: "e", startAt: "2026-09-05T23:50:00" };
const pt = (seq: number, at: string, when: string) => ({ seq, at, kind: "turn", rel: `.shadow/lines/x.md#${seq}`, text: "t", body: `> 坐标：when(${when})` });

// 跨午夜：线头日期 09-05，末点正文 when 为 09-06 → lineLastAt 用真实日期（不偏一天）
let t = renderLineHeader(H);
t = appendPoint(t, H, pt(1, "23:50:00", "2026-09-05 23:50:00"));
t = appendPoint(t, H, pt(2, "00:10:00", "2026-09-06 00:10:00"));
assert.equal(lineLastAt(t), "2026-09-06T00:10:00", "跨午夜线时龄应取末点真实日期");

// seq 抗坏行：缺号（1,3）时 nextSeq 取最大号+1=4（不复用 2）
let u = renderLineHeader(H);
u = appendPoint(u, H, pt(1, "10:00:00", "2026-09-05 10:00:00"));
u = appendPoint(u, H, pt(3, "10:05:00", "2026-09-05 10:05:00"));
assert.equal(nextSeq(u), 4, "缺号时 nextSeq 用最大点号+1");

console.log("✔ lines-edge：跨午夜时龄取真实日期 · seq 用最大点号+1（抗坏行/缺号）");
