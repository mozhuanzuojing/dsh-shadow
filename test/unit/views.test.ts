import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import {
  deriveContextRefs, deriveDecisions, deriveEpisodes, deriveTasks,
  renderDecisions, renderEpisodes, renderRecovery, renderTasks,
} from "../../dist/domain/views.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

const atoms = [
  mk("2026-09-03--120000-docs-todo.md", { entry: "docs/todo.md", date: "2026-09-03", time: "120000", user: "整理 todo" }),
  mk("2026-09-04--090000-src-auth.md", {
    entry: "src/auth.ts", date: "2026-09-04", time: "090000",
    summary: "JWT 过期时间改 2h", materials: ["src/auth.ts"],
    decisions: [{ text: "JWT 过期改为 2h", source: "user" }], user: "把 JWT 过期时间改成 2h",
  }),
  mk("2026-09-05--100000-src-alpha.md", {
    entry: "src/alpha.ts", date: "2026-09-05", time: "100000",
    summary: "把 alpha 入口改成 A", materials: ["src/alpha.ts"],
    decisions: [{ text: "采用方案 A", source: "user" }, { text: "先跑基准", source: "goal" }],
    reasons: [{ text: "因为 A 可回滚", source: "user" }], user: "请把 alpha 入口改成 A",
  }),
];

const eps = deriveEpisodes(atoms, 60);
assert.equal(eps.length, 3, `应 3 个 episode，实际 ${eps.length}`);
assert.ok(renderEpisodes(eps, "alpha").includes("src/alpha.ts"));

const dl = deriveDecisions(atoms);
assert.equal(dl.count, 3);
assert.ok(dl.byEntry["src/alpha.ts"]!.some((d) => d.reason === "因为 A 可回滚"));
const decText = renderDecisions(dl);
assert.ok(decText.includes("\n## src/alpha.ts"), "decision 渲染应保留换行（v1 压平 bug 已修）");
assert.ok(!decText.includes("## src/alpha.ts\n- 2026"), "不应把标题与条目压成一行");

const tasks = deriveTasks(atoms);
assert.ok(tasks.length >= 2);
assert.ok(renderTasks(tasks, "alpha").includes("src/alpha.ts"));
assert.ok(renderRecovery("alpha", tasks, []).includes("记忆恢复"));

const refs = await deriveContextRefs(atoms, async (p) => ({ status: p.includes("spec") ? "stale" : "validated" }));
assert.ok(refs.length >= 1);
assert.ok(refs.some((r) => r.status === "validated"));

console.log("✔ views：Episode/Decision/Task/Recovery/Context；decision 不再被压平");

