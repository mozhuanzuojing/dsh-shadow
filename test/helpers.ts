import { normalizeConfig } from "../dist/contract/config.js";
import { fixedClock } from "../dist/contract/time.js";
import { SignalStore } from "../dist/engine/signals.js";
import type { ReadDeps } from "../dist/engine/read/types.js";
import { MemoryFs } from "../dist/store/fs.js";

export const WS = "/ws";
export const TODAY = "2026-09-06";

export const atomText = (opts: {
  entry?: string;
  date?: string;
  time?: string;
  summary?: string;
  materials?: string[];
  decisions?: { text: string; source?: string }[];
  reasons?: { text: string; source?: string }[];
  user?: string;
  actions?: string[];
  goal?: string;
  project?: string;
  agent?: string;
} = {}): string => {
  const entry = opts.entry ?? "src/alpha.ts";
  const date = opts.date ?? "2026-09-05";
  const time = opts.time ?? "100000";
  const lines: string[] = [`# ${entry}`, "", "> 完整线索"];
  lines.push(`> 坐标：locus(${WS}) · when(${date} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}) · soul(default) · role(default) · intent(test)`);
  if (opts.materials?.length) lines.push(`> 背景/材料：${opts.materials.join("、")}`);
  if (opts.decisions?.length) lines.push(`> 决策：${opts.decisions.map((d) => `〔${d.source ?? "user"}〕${d.text}`).join("；")}`);
  if (opts.reasons?.length) lines.push(`> 决策理由：${opts.reasons.map((d) => `〔${d.source ?? "user"}〕${d.text}`).join("；")}`);
  if (opts.summary) lines.push(`> 摘要：${opts.summary}`);
  if (opts.goal) lines.push(`> 目标：${opts.goal}`);
  if (opts.project) lines.push(`> 项目：${opts.project}`);
  if (opts.agent) lines.push(`> Agent：${opts.agent}`);
  lines.push("");
  if (opts.user) lines.push(`- [10:00:00] [${entry}] 用户：${opts.user}`);
  for (const d of opts.decisions ?? []) lines.push(`- [10:00:01] [${entry}] 决定 ${d.text}`);
  for (const a of opts.actions ?? ["改/读 src/alpha.ts"]) lines.push(`- [10:00:02] [${entry}] ${a}`);
  return lines.join("\n") + "\n";
};

export const seedCorpus = (): Record<string, string> => {
  const base = `${WS}/.shadow/atoms`;
  return {
    [`${base}/2026-09-05--100000-src-alpha.md`]: atomText({
      entry: "src/alpha.ts",
      summary: "把 alpha 入口改成 A",
      materials: ["src/alpha.ts", "docs/spec.md"],
      decisions: [{ text: "采用方案 A", source: "user" }, { text: "先跑基准", source: "goal" }],
      reasons: [{ text: "因为 A 可回滚", source: "user" }],
      user: "请把 alpha 入口改成 A",
    }),
    [`${base}/2026-09-04--090000-src-auth.md`]: atomText({
      entry: "src/auth.ts",
      date: "2026-09-04",
      time: "090000",
      summary: "JWT 过期时间改 2h",
      materials: ["src/auth.ts"],
      decisions: [{ text: "JWT 过期改为 2h", source: "user" }],
      user: "把 JWT 过期时间改成 2h",
      actions: ["改/读 src/auth.ts"],
    }),
    [`${base}/2026-09-03--120000-docs-todo--ab12cd.md`]: atomText({
      entry: "docs/todo.md",
      date: "2026-09-03",
      time: "120000",
      user: "整理 todo 清单",
    }),
  };
};

export const makeDeps = (seed: Record<string, string> = seedCorpus()): ReadDeps => ({
  fs: new MemoryFs(seed),
  ws: WS,
  config: normalizeConfig({ shadowRoot: WS }),
  clock: fixedClock(`${TODAY}T12:00:00`),
  signals: new SignalStore(),
});
