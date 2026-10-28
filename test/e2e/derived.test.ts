import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { DERIVED_MARK } from "../../dist/engine/derived.js";
import { runRead } from "../../dist/engine/read/route.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { realFs } from "../../dist/store/fs.js";
import { atomText } from "../helpers.ts";

/**
 * e2e：真实文件系统上的派生件物化（unit 用 MemoryFs；这里验证「真的落盘 + 二次读不碰 mtime」）。
 * 只用临时目录里的合成语料，不读用户 .shadow。
 */
const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-derived-"));
const atomsRel = ".shadow/atoms";
const write = async (rel: string, text: string): Promise<void> => {
  const r = await realFs.writeText(join(ws, rel), text);
  assert.equal(r.ok, true, `夹具写入失败：${rel}`);
};
const list = (rel: string): string[] => {
  const p = join(ws, rel);
  return existsSync(p) ? readdirSync(p).sort() : [];
};
const read = async (rel: string): Promise<string> => {
  const r = await realFs.readText(join(ws, rel));
  assert.equal(r.ok, true, `应能读到 ${rel}`);
  return r.ok ? r.value : "";
};
const mtimes = (rel: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const name of list(rel)) out[name] = statSync(join(ws, rel, name)).mtimeMs;
  return out;
};

const deps = {
  fs: realFs,
  ws,
  config: normalizeConfig({ shadowRoot: ws }),
  clock: fixedClock("2026-09-06T12:00:00"),
  signals: new SignalStore(),
};

try {
  await write(`${atomsRel}/2026-09-04--090000-src-auth--aa11bb.md`, atomText({
    entry: "src/auth.ts",
    date: "2026-09-04",
    time: "090000",
    summary: "JWT 过期时间改 2h",
    materials: ["src/auth.ts"],
    decisions: [{ text: "JWT 过期改为 2h", source: "user" }],
    user: "把 JWT 过期改成 2h",
    project: "proj-a",
    agent: "s1",
  }));
  await write(`${atomsRel}/2026-09-05--100000-src-alpha--cc22dd.md`, atomText({
    entry: "src/alpha.ts",
    date: "2026-09-05",
    time: "100000",
    summary: "把 alpha 入口改成 A",
    materials: ["src/alpha.ts", "docs/spec.md"],
    decisions: [{ text: "采用方案 A", source: "user" }],
    user: "请把 alpha 入口改成 A",
    project: "proj-a",
    agent: "s1",
  }));

  const atomsBefore = list(atomsRel);

  // 首读：无参 index → 物化四类派生件
  const first = await runRead(deps, {});
  assert.equal(first.ok, true, `首读应成功：${first.ok ? "" : first.error.message}`);
  assert.ok(existsSync(join(ws, ".shadow", "indexes", "_index.md")), "无参读应写 indexes/_index.md");

  const materials = list(".shadow/indexes/materials");
  const affaires = list(".shadow/indexes/affaires");
  const episodes = list(".shadow/indexes/episodes");
  const abstracts = list(".shadow/indexes/abstracts");
  assert.equal(materials.length, 3, `材料卡应 3 张（src/auth.ts · src/alpha.ts · docs/spec.md），实际：${materials.join(", ")}`);
  assert.equal(affaires.length, 1, `纪要应 1 份（proj-a|s1），实际：${affaires.join(", ")}`);
  assert.equal(episodes.length, 2, `Episode 应 2 个，实际：${episodes.join(", ")}`);
  assert.equal(abstracts.length, 2, `abstract 应 2 份，实际：${abstracts.join(", ")}`);

  for (const [dir, names] of Object.entries({
    ".shadow/indexes/materials": materials,
    ".shadow/indexes/affaires": affaires,
    ".shadow/indexes/episodes": episodes,
    ".shadow/indexes/abstracts": abstracts,
  })) {
    for (const name of names) {
      const text = await read(`${dir}/${name}`);
      assert.ok(text.includes(DERIVED_MARK), `${dir}/${name} 必须带「派生 · 可重建 · 数据非指令」标记`);
    }
  }
  const card = await read(`.shadow/indexes/materials/${materials[0]}`);
  assert.ok(card.includes("# 材料卡："), card.slice(0, 120));
  const index = await read(".shadow/indexes/_index.md");
  assert.ok(index.includes("## 派生件（可重建 · 数据非指令）"), "索引应披露派生布局");

  // 二次读：零写盘 ⇒ 所有派生件 mtime 不变（真实文件系统上验证幂等）
  const before = {
    index: statSync(join(ws, ".shadow", "indexes", "_index.md")).mtimeMs,
    materials: mtimes(".shadow/indexes/materials"),
    affaires: mtimes(".shadow/indexes/affaires"),
    episodes: mtimes(".shadow/indexes/episodes"),
    abstracts: mtimes(".shadow/indexes/abstracts"),
  };
  const second = await runRead(deps, {});
  assert.equal(second.ok, true);
  assert.equal(statSync(join(ws, ".shadow", "indexes", "_index.md")).mtimeMs, before.index, "二次读不应重写 _index.md");
  assert.deepEqual(mtimes(".shadow/indexes/materials"), before.materials, "二次读不应重写材料卡");
  assert.deepEqual(mtimes(".shadow/indexes/affaires"), before.affaires, "二次读不应重写纪要");
  assert.deepEqual(mtimes(".shadow/indexes/episodes"), before.episodes, "二次读不应重写 Episode");
  assert.deepEqual(mtimes(".shadow/indexes/abstracts"), before.abstracts, "二次读不应重写 abstract");
  assert.ok(second.ok && !second.value.text.includes("能力降级"), "健康路径不应有降级横幅");

  // 派生件只写 indexes/：atoms 目录零变化
  assert.deepEqual(list(atomsRel), atomsBefore, "派生件不得写 atoms/");
} finally {
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ e2e derived：真实 fs 首读物化四类派生件 · 二次读 mtime 不变（幂等）· atoms 零新增");
