/**
 * dsh-shadow —— 插件外「用户级聚合」工具（ADR-0028 Phase B/C）。
 *
 * 插件 fs 是工作区沙箱，读不到别的 workspace；本工具走 realFs（无沙箱），把多个工作区的
 * `.shadow`(atoms ∪ lines) 聚合为 user 级「面 / 观察意识」摘要，写到 userRoot（默认 ~/.dsh-observer）。
 * **只写派生摘要，不复制原文**（原文仍留各工作区）。
 *
 * 用法（在 dsh-shadow 目录）：
 *   node tools/user-aggregate.ts --roots=D:/p/a,D:/p/b                 # dry-run
 *   node tools/user-aggregate.ts --roots=... --apply                   # 写 <userRoot>/user.md + user.json
 *   node tools/user-aggregate.ts --roots=... --user-root=C:/Users/me/.dsh-observer
 */

import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { realFs } from "../dist/store/fs.js";
import { parseAtom } from "../dist/domain/parse.js";
import { loadAtomsFromLines, unionByRel } from "../dist/engine/lines.js";
import { renderUserSummary, userScope, filterFacesByLens, type WorkspaceSlice } from "../dist/domain/scope.js";
import { lensFromSoul } from "../dist/engine/project/lens.js";
import type { ParsedAtom } from "../dist/contract/types.js";

const argOf = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const apply = process.argv.includes("--apply");
const roots = (argOf("roots") ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((r) => resolve(r));
const userRoot = resolve(argOf("user-root") ?? join(homedir(), ".dsh-observer"));

const readAtoms = async (root: string): Promise<ParsedAtom[]> => {
  const fromAtoms: ParsedAtom[] = [];
  const ls = await realFs.listDir(`${root}/.shadow/atoms`);
  if (ls.ok) {
    for (const e of ls.value) {
      if (e.type !== "file" || !e.name.endsWith(".md")) continue;
      const r = await realFs.readText(`${root}/.shadow/atoms/${e.name}`);
      if (r.ok) {
        try { fromAtoms.push(parseAtom(r.value, `.shadow/atoms/${e.name}`, e.name)); } catch { /* skip */ }
      }
    }
  }
  const fromLines = await loadAtomsFromLines(realFs, root);
  return unionByRel(fromLines.atoms, fromAtoms);
};

const main = async (): Promise<void> => {
  if (!roots.length) {
    console.log("[user-aggregate] 需要 --roots=<ws1,ws2,...>（工作区根）。");
    process.exitCode = 2;
    return;
  }
  const slices: WorkspaceSlice[] = [];
  for (const root of roots) slices.push({ ws: root, atoms: await readAtoms(root) });
  const total = slices.reduce((n, s) => n + s.atoms.length, 0);
  for (const s of slices) console.log(`[user-aggregate] ${s.ws}: 点 ${s.atoms.length}`);
  console.log(`[user-aggregate] 合计点 ${total} · 工作区 ${roots.length}`);

  const agg = userScope(slices, "session");
  const sum = agg.faces.reduce((n, f) => n + f.points, 0);
  const conserved = sum === total;
  console.log(`[user-aggregate] user 面 ${agg.faces.length} · 面内点合计 ${sum} · 守恒 ${conserved} · 意识点 ${agg.consciousness.points}`);
  if (!conserved) {
    console.log("[user-aggregate] ❌ 守恒校验失败，拒绝写。");
    process.exitCode = 1;
    return;
  }

  // 隐私 / 视野过滤：以 userRoot/soul.json 的 observer 视角过滤面（被过滤项显式披露，不静默）
  let lens = { whatMatters: [] as string[], whatToIgnore: [] as string[] };
  let soulNote = "无 user soul（未过滤）";
  const sr = await realFs.readText(`${userRoot}/soul.json`);
  if (sr.ok) {
    try {
      const l = lensFromSoul(JSON.parse(sr.value));
      lens = { whatMatters: l.whatMatters, whatToIgnore: l.whatToIgnore };
      soulNote = `user soul(id=${l.id})`;
    } catch {
      soulNote = "user soul 解析失败（不过滤）";
    }
  }
  const { kept, excluded } = filterFacesByLens(agg.faces, lens);
  const keptPoints = kept.reduce((n, f) => n + f.points, 0);
  console.log(`[user-aggregate] 隐私/视野：soul=${soulNote} · 保留面 ${kept.length} · 过滤面 ${excluded.length}（${agg.points - keptPoints} 点，显式披露）`);

  const md = renderUserSummary({ faces: kept, consciousness: agg.consciousness, points: agg.points }, { roots, generatedAt: new Date().toISOString(), lim: 30, excluded });
  if (!apply) {
    console.log(`[user-aggregate] ✅ dry-run。加 --apply 写到：${userRoot}/user.md`);
    console.log("--- 预览（前 600 字）---\n" + md.slice(0, 600));
    return;
  }
  const w1 = await realFs.writeText(`${userRoot}/user.md`, md);
  const json = JSON.stringify({ generatedAt: new Date().toISOString(), roots, points: total, faces: agg.faces.length, keptFaces: kept.length, excludedFaces: excluded, consciousness: agg.consciousness }, null, 2);
  const w2 = await realFs.writeText(`${userRoot}/user.json`, json);
  if (!w1.ok || !w2.ok) {
    console.log(`[user-aggregate] ❌ 写 userRoot 失败：${(!w1.ok && w1.error.message) || (!w2.ok && w2.error.message)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[user-aggregate] ✅ 已写 ${userRoot}/user.md + user.json（面 ${agg.faces.length} · 点 ${total}）`);
};

main().catch((e) => {
  console.error(`[user-aggregate] 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
