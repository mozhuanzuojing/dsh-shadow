import assert from "node:assert/strict";
import { appendPoint, lineIdFor, nextSeq, parseLine, renderLineHeader, shouldExtend } from "../../dist/domain/lines.js";

const H = { lineId: "2026-11-17--s1--src-a-ts", session: "s1", entry: "src/a.ts", startAt: "2026-11-17T15:22:17" };

// 新建线 + 追加 2 个点：一个文件装 2 点（不再一句话一文件）
let text = appendPoint(null, H, { seq: 1, at: "15:22:17", kind: "user", rel: ".shadow/atoms/p1.md", text: "用户：改 a" });
assert.equal(nextSeq(text), 2, "下一个点应为 #2");
text = appendPoint(text, H, { seq: 2, at: "15:23:01", kind: "decision", rel: ".shadow/atoms/p2.md", text: "决定：采用 A" });

const parsed = parseLine(text);
assert.equal(parsed.points.length, 2, `线内应有 2 点，实际 ${parsed.points.length}`);
assert.deepEqual(parsed.points.map((p) => p.seq), [1, 2]);
assert.equal(parsed.points[1]!.rel, ".shadow/atoms/p2.md", "点句柄必须可解析回 atom");
assert.equal(parsed.points[1]!.kind, "decision");
assert.ok(renderLineHeader(H).startsWith("# 线 "), "线头格式");

// 单行：正文含换行/大括号也不破坏格式
const t2 = appendPoint(null, H, { seq: 1, at: "10:00:00", kind: "user", rel: ".shadow/atoms/x.md", text: "多行\n正文{尖}" });
const p2 = parseLine(t2).points;
assert.equal(p2.length, 1);
assert.ok(!t2.includes("\n正文"), "换行应被压平，保持一行一点");
assert.ok(!t2.includes("{尖}"), "大括号应剥离，避免破坏 {{rel=}}");

// 闭合规则：间隔 ≤60min 续接；>60min 或倒序 另起
assert.equal(shouldExtend("2026-11-17T15:22:17", "2026-11-17T15:30:00", 60), true);
assert.equal(shouldExtend("2026-11-17T15:22:17", "2026-11-17T17:00:00", 60), false);
assert.equal(shouldExtend("2026-11-17T15:22:17", "2026-11-17T14:00:00", 60), false);

// 线 id 稳定可读
assert.ok(lineIdFor("s1", "src/a.ts", "2026-11-17T15:22:17").startsWith("2026-11-17--152217--s1--src-a-ts"));

console.log("✔ lines：一条线一文件装多点 / 点带 #seq 与 rel 句柄 / 单行安全 / 闭合规则 / 线 id");
