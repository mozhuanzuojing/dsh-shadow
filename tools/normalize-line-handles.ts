/**
 * 一次性：把 `.shadow/lines/*.md` 里仍是「原子路径」的点句柄规范化为「线#seq」。
 * 迁移(v1/buildLineFiles)留下的点 rel=.shadow/atoms/x.md；文件已移入 trash → 句柄死链。
 * 规范化后：点句柄= .shadow/lines/<name>.md#seq，与 line 源一致（正文不变）。
 *
 *   node tools/normalize-line-handles.ts --ws=D:/project/dsh1
 */
import { resolve, join } from "node:path";
import { realFs } from "../dist/store/fs.js";
import { appendPoint, parseLine, parseLineHeader, renderLineHeader } from "../dist/domain/lines.js";

const argOf = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const WS = resolve(argOf("ws") ?? join(process.cwd(), ".."));
const DIR = `${WS.replace(/\\/g, "/").replace(/\/+$/, "")}/.shadow/lines`;

const main = async (): Promise<void> => {
  const ls = await realFs.listDir(DIR);
  if (!ls.ok) {
    console.log(`[normalize] 无线目录：${DIR}`);
    return;
  }
  let files = 0;
  let changedPts = 0;
  for (const f of ls.value) {
    if (!f.name.endsWith(".md")) continue;
    const r = await realFs.readText(`${DIR}/${f.name}`);
    if (!r.ok) continue;
    const h = parseLineHeader(r.value);
    if (!h) continue;
    const pts = parseLine(r.value).points;
    let out = renderLineHeader(h);
    let changed = 0;
    for (const p of pts) {
      const nr = p.rel.startsWith(".shadow/atoms/") ? `.shadow/lines/${f.name}#${p.seq}` : p.rel;
      if (nr !== p.rel) changed++;
      out = appendPoint(out, h, { ...p, rel: nr });
    }
    if (changed) {
      const w = await realFs.writeText(`${DIR}/${f.name}`, out);
      if (w.ok) {
        files++;
        changedPts += changed;
        console.log(`[normalize] ${f.name}：规范化 ${changed} 点句柄`);
      }
    }
  }
  console.log(`[normalize] 完成：${files} 文件 / ${changedPts} 点句柄 → 线#seq`);
};

main().catch((e) => {
  console.error(`[normalize] 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
