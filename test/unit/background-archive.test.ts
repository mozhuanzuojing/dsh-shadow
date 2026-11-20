import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { buildBackground } from "../../dist/domain/background.js";
import { atomText } from "../helpers.ts";

const rel = ".shadow/atoms/2026-11-19--090000-a--aaaa.md";
const a = parseAtom(atomText({ entry: "a", date: "2026-11-19", time: "090000", user: "不要多数据库抽象" }), rel, "a.md");
a.archiveRel = `.shadow/archive/2026-11-19.jsonl#${rel}`;

const bg = buildBackground([a], "多数据库抽象");
assert.equal(bg.evidence[0], rel, "种子 evidence 必须是 rel（与 graph 边键一致），不是 archiveRel");
assert.equal(bg.handles[0], a.archiveRel, "展示句柄应为 archiveRel");

console.log("✔ background-archive：种子=rel（图可用）/ 句柄=archiveRel（展示）分离");
