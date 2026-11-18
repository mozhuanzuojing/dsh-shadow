import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomText } from "../helpers.ts";

const tool = join(process.cwd(), "tools", "user-aggregate.ts");
const wsA = mkdtempSync(join(tmpdir(), "ua-a-"));
const wsB = mkdtempSync(join(tmpdir(), "ua-b-"));
const uroot = mkdtempSync(join(tmpdir(), "ua-root-"));
const mkAtom = (ws: string, name: string, opts: Parameters<typeof atomText>[0]) => {
  const d = join(ws, ".shadow", "atoms");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, name), atomText(opts));
};

try {
  mkAtom(wsA, "2026-11-18--090000-a1.md", { entry: "src/a.ts", date: "2026-11-18", time: "090000", agent: "s1", summary: "A1" });
  mkAtom(wsA, "2026-11-18--090500-a2.md", { entry: "src/a.ts", date: "2026-11-18", time: "090500", agent: "s1", summary: "A2" });
  mkAtom(wsB, "2026-11-18--091000-b1.md", { entry: "src/b.ts", date: "2026-11-18", time: "091000", agent: "s2", summary: "B1" });
  writeFileSync(join(uroot, "soul.json"), JSON.stringify({ identity: { name: "userA" }, observer: { what_matters: ["src/a"], what_to_ignore: [] } }));
  writeFileSync(join(uroot, "taste.json"), JSON.stringify({ version: 1, prefer: ["中文", "结论先行"], avoid: [], notes: [] }));
  mkdirSync(join(wsA, ".shadow", "taste"), { recursive: true });
  writeFileSync(join(wsA, ".shadow", "taste", "taste.json"), JSON.stringify({ version: 1, prefer: ["workspace 覆盖"], avoid: [], notes: [] }));

  // dry-run：跨 2 工作区聚合 + 守恒 + 隐私过滤
  const dry = spawnSync(process.execPath, [tool, `--roots=${wsA},${wsB}`, `--user-root=${uroot}`], { encoding: "utf8" });
  assert.equal(dry.status, 0, `user-aggregate 失败：${dry.stderr}`);
  assert.ok(dry.stdout.includes("合计点 3"), `应聚合 3 点：${dry.stdout}`);
  assert.ok(dry.stdout.includes("工作区 2"), `应 2 工作区：${dry.stdout}`);
  assert.ok(dry.stdout.includes("守恒 true"), `应守恒：${dry.stdout}`);
  assert.ok(dry.stdout.includes("过滤面 1"), `隐私应过滤 1 面：${dry.stdout}`);
  assert.ok(!existsSync(join(uroot, "user.md")), "dry-run 不应写 user.md");

  // apply：写派生摘要
  const app = spawnSync(process.execPath, [tool, `--roots=${wsA},${wsB}`, `--user-root=${uroot}`, "--apply"], { encoding: "utf8" });
  assert.equal(app.status, 0, `user-aggregate --apply 失败：${app.stderr}`);
  assert.ok(existsSync(join(uroot, "user.md")), "--apply 应写 user.md");
  assert.ok(readFileSync(join(uroot, "user.md"), "utf8").startsWith("# 用户级记忆"), "user.md 标题");
  const md = readFileSync(join(uroot, "user.md"), "utf8");
  assert.ok(md.includes("## Taste（用户级锚"), "user.md 应含 Taste 用户级锚");
  assert.ok(md.includes("workspace") && md.includes("覆盖 user"), "应含 workspace 覆盖说明");
} finally {
  for (const d of [wsA, wsB, uroot]) rmSync(d, { recursive: true, force: true });
}

console.log("✔ tools/user-aggregate：跨工作区聚合/守恒/隐私过滤 + --apply 写 user.md");
