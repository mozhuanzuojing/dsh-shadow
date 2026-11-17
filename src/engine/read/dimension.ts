/**
 * v2 engine/read —— 按维读取（ADR-0026）。
 *
 * `read_shadow({dim})`：line(1维) / face(2维·会话轴) / task(2维·任务轴·按这件事) / consciousness(n维)。
 * 纯派生、只读；面含降维钻取；意识含灵魂视角与盲区。
 */

import type { ParsedAtom } from "../../contract/types.js";
import { SOUL_FILE } from "../../contract/paths.js";
import { deriveConsciousness, deriveFaces, downToPoints, type FaceAxis } from "../../domain/dimensions.js";
import type { ModeOutput, ReadDeps } from "./types.js";

const soulIdOf = async (deps: ReadDeps): Promise<string | null> => {
  const r = await deps.fs.readText(`${deps.ws}/${SOUL_FILE}`);
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.value);
    const id = j?.identity && typeof j.identity === "object" ? j.identity.name || j.identity.role : j?.identity;
    return id ? String(id) : null;
  } catch {
    return null;
  }
};

export const dimensionView = async (deps: ReadDeps, atoms: ParsedAtom[], dim: string): Promise<ModeOutput> => {
  const axis: FaceAxis = dim === "task" ? "task" : "session";
  const { lines, faces } = deriveFaces(atoms, axis, deps.config.compact.gapMinutes);
  const lim = deps.limit ?? 20;

  if (dim === "line") {
    // 复用已加载的 atoms（含线重建点，rel=线#seq），不重复读文件；按线文件分组。
    const linePts = atoms.filter((a) => a.rel.includes("/lines/"));
    if (linePts.length) {
      const g = new Map<string, ParsedAtom[]>();
      for (const a of linePts) {
        const k = a.rel.split("#")[0]!;
        const arr = g.get(k) ?? [];
        arr.push(a);
        g.set(k, arr);
      }
      const keys = [...g.keys()].sort().reverse();
      const shown = keys.slice(0, lim);
      const body = [
        `# 线（1维）· 共 ${keys.length} 条（线点）`,
        "> 线 = 点沿「时间 × 同一件事」的连续段；降维可回点。",
        "",
        ...shown.map((k) => {
          const pts = (g.get(k) ?? []).sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`));
          const f = pts[0]!;
          const l = pts[pts.length - 1]!;
          const dec = pts.reduce((n, a) => n + a.decisions.length, 0);
          const title = String(f.summary || f.userMessages[0] || f.goal || f.entry || "").replace(/^用户：/, "").slice(0, 40);
          return `- ${f.date} ${f.time}「${title}」· ${pts.length} 点 · 末 ${l.time}${dec ? ` · ${dec} 决策` : ""}`;
        }),
      ].join("\n");
      return { body, matched: keys.length, returned: shown.length, dropped: Math.max(0, keys.length - shown.length), examples: [] };
    }
    // 回退（纯 atom 模式、尚无线点）：按会话轴从点聚合
    const shownLines = lines.slice(0, lim);
    const body = [
      `# 线（1维）· 共 ${lines.length} 条（由点聚合）`,
      "> 线 = 点沿「时间 × 同一件事」的连续段；降维可回点。",
      "",
      ...shownLines.map((e) => `- ${e.startedAt}「${String(e.title).slice(0, 40)}」· ${e.memoryCount} 点 · ${e.decisions.length} 决策`),
    ].join("\n");
    return { body, matched: lines.length, returned: shownLines.length, dropped: Math.max(0, lines.length - shownLines.length), examples: [] };
  }

  if (dim === "face" || dim === "task") {
    const shown = faces.slice(0, lim);
    const label = axis === "task" ? "任务轴·按这件事" : "会话轴";
    const seg = [`# 面（2维 · ${label}）· 共 ${faces.length} 张`, "> 面 = 多条线织成；每面含降维钻取（面→线→点）。", ""];
    for (const f of shown) {
      const down = downToPoints(f);
      seg.push(`## 面 · ${String(f.key).slice(0, 46)}`);
      seg.push(`- ${f.lines.length} 线 · ${f.points} 点 · ${f.decisions} 决策 · ${f.startedAt}→${f.endedAt}`);
      seg.push(`- 降维：${down.slice(0, 5).join("、")}${down.length > 5 ? "…" : ""}`);
      seg.push("");
    }
    return { body: seg.join("\n"), matched: faces.length, returned: shown.length, dropped: Math.max(0, faces.length - shown.length), examples: [] };
  }

  // consciousness（默认 n 维）
  const cs = deriveConsciousness(atoms, faces, await soulIdOf(deps));
  const seg = [
    `# 观察意识（${cs.axis} 轴）`,
    `- 面 ${cs.faces} · 点 ${cs.points} · 灵魂 ${cs.soulId ?? "无（默认视角）"}`,
    "",
    "## 看到的主线（入口）",
    ...cs.topEntries.map(([k, v]) => `- ${k} · ${v}`),
    "",
    "## 盲区",
    ...cs.blindSpots.map((b) => `- ${b}`),
  ];
  return { body: seg.join("\n"), matched: cs.points, returned: cs.faces, dropped: 0, examples: [] };
};
