import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendPoint, renderLineHeader } from "../../dist/domain/lines.js";

const H = (id: string, startAt: string) => ({ lineId: id, session: "s", entry: "dsh1", startAt });
const lineText = (id: string, when: string): string =>
  appendPoint(renderLineHeader(H(id, when.slice(0, 19).replace(" ", "T"))), H(id, when.slice(0, 19).replace(" ", "T")), {
    seq: 1,
    at: when.slice(11),
    kind: "turn",
    rel: `.shadow/lines/${id}.md#1`,
    text: "x",
    body: `# dsh1\n\n> 坐标：locus(WS) · when(${when}) · soul(lead) · role(default) · intent(capture)\n\n- [${when.slice(11)}] [dsh1] 用户：x`,
  });
const mkLines = (ws: string, files: Record<string, string>) => {
  const d = join(ws, ".shadow", "lines");
  mkdirSync(d, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(d, name), text);
};
const run = (tool: string, ws: string, days: number, apply: boolean) =>
  spawnSync(process.execPath, [join(process.cwd(), "tools", tool), `--ws=${ws}`, `--older-than-days=${days}`, ...(apply ? ["--apply"] : [])], { encoding: "utf8" });

try {
  // 归档：冷线(2020) 移 archive/lines，热线(今日) 保留
  const wsA = mkdtempSync(join(tmpdir(), "arch-"));
  mkLines(wsA, { "old.md": lineText("old", "2020-01-01 10:00:00"), "new.md": lineText("new", "2026-11-18 10:00:00") });
  const dry = run("archive-lines.ts", wsA, 1000, false);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(dry.stdout.includes("冷线 1 条"), `应识别 1 条冷线：${dry.stdout}`);
  const app = run("archive-lines.ts", wsA, 1000, true);
  assert.equal(app.status, 0, app.stderr);
  assert.ok(existsSync(join(wsA, ".shadow", "archive", "lines", "old.md")), "old 应归档");
  assert.deepEqual(readdirSync(join(wsA, ".shadow", "lines")).sort(), ["new.md"], "热目录只留 new");
  rmSync(wsA, { recursive: true, force: true });

  // 遗忘：冷线移 trash（离开读路径，可回退）
  const wsB = mkdtempSync(join(tmpdir(), "forg-"));
  mkLines(wsB, { "old.md": lineText("old", "2020-01-01 10:00:00"), "new.md": lineText("new", "2026-11-18 10:00:00") });
  const f = run("forget-lines.ts", wsB, 1000, true);
  assert.equal(f.status, 0, f.stderr);
  assert.deepEqual(readdirSync(join(wsB, ".shadow", "lines")).sort(), ["new.md"], "热线保留、冷线移走");
  const trash = readdirSync(join(wsB, ".shadow", ".trash")).filter((n) => n.startsWith("lines-forgotten-"));
  assert.equal(trash.length, 1, "应生成 trash 目录");
  assert.ok(existsSync(join(wsB, ".shadow", ".trash", trash[0]!, "old.md")), "old 应在 trash 可回退");
  rmSync(wsB, { recursive: true, force: true });
} catch (e) {
  throw e;
}

console.log("✔ tools/archive-lines + forget-lines：冷线归档(可读)/遗忘(trash 可回退) · 热线保留");
