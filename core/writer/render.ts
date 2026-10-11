// dsh-shadow —— core/writer-render.ts：写侧物化渲染 seam（candidate 2，纯函数）。
// 从 writer.ts 迁出的纯字符串渲染器：buildIndexText（._index.md 版面）与 consolidateText（Episode 收口合并正文）。
// 无 fs / 无状态突变 / 无 LLM——输入参数即全量依赖，可在无 harness 环境单测。
// 契约与原 writer.ts 逐字一致（仅把闭包提升为纯函数）。

/** 生成 `.shadow/indexes/_index.md` 的全文（目录说明 + 今日摘要 + 近期记忆 + 主题索引 + 意识轨迹）。 */
export function buildIndexText(ws: string, memories: any[], topicFiles: Record<string, string[]>, todayInfo: { count: number; topics: string[] }): string {
  const byDate: Record<string, any[]> = {};
  for (const mm of memories) (byDate[mm.date] = byDate[mm.date] || []).push(mm);
  const lines: string[] = [];
  lines.push("# shadow 目录说明与索引");
  lines.push("");
  lines.push("`.shadow/` 是投影空间根（atoms / roles / affaires / indexes）——每条记忆都是 `atoms/` 下的一个文件。");
  lines.push("格式：`.shadow/atoms/<date>--<HHMMSS>-<入口slug>.md`；线索头含五轴坐标；思维/决策为正文。");
  lines.push("默认入口：`read_shadow` 无参读本索引；带 `topic`/`entry` 穿透到具体记忆文件。");
  lines.push("");
  lines.push(`工作区：\`${ws}\``);
  lines.push("");
  lines.push("## 今日摘要");
  if (todayInfo && todayInfo.count > 0) {
    lines.push(`今日 ${todayInfo.count} 条记忆${todayInfo.topics.length ? `，主题：${todayInfo.topics.slice(0, 10).join("、")}` : ""}。`);
  } else {
    lines.push("（今日暂无）");
  }
  lines.push("");
  lines.push("## 近期记忆（按日期）");
  const dates = Object.keys(byDate).sort().reverse();
  if (dates.length) {
    for (const dt of dates) {
      lines.push(`- ${dt}/`);
      for (const mm of byDate[dt].sort((a, b) => a.name.localeCompare(b.name))) lines.push(`  - \`${mm.name}\``);
    }
  } else {
    lines.push("（暂无）");
  }
  lines.push("");
  lines.push("## 主题索引（入口/主题 → 记忆文件）");
  const topics = Object.keys(topicFiles).sort();
  if (topics.length) {
    for (const t of topics) lines.push(`- \`${t}\` → ${[...new Set(topicFiles[t])].join("、")}`);
  } else {
    lines.push("（暂无）");
  }
  lines.push("");
  lines.push("## 意识轨迹（按时间，可反推方向）");
  const sorted = [...memories].sort((a, b) => (a.date === b.date ? (a.time || "").localeCompare(b.time || "") : a.date.localeCompare(b.date)));
  if (sorted.length) {
    for (const mm of sorted) lines.push(`- ${mm.date} ${mm.time || "??????"} \`${mm.name}\``);
  } else {
    lines.push("（暂无）");
  }
  return lines.join("\n");
}

/** 生成一个 Episode 收口 consolidated 文件的正文（合并原子决策/动作/用户消息 + 证据链）。 */
export function consolidateText(ep: any, atoms: any[]): string {
  const entry = (ep.entries && ep.entries[0]) || ep.title || "episode";
  const project = (atoms[0] && atoms[0].project) || ep.project || "";
  const agent = (atoms[0] && atoms[0].agent) || ep.agent || "";
  const date = (ep.startedAt || "").slice(0, 10);
  const materials = Array.from(new Set(atoms.flatMap((a: any) => a.materials || [])));
  const decisions = Array.from(new Set(atoms.flatMap((a: any) => a.decisions || [])));
  const actions = Array.from(new Set(atoms.flatMap((a: any) => a.actions || [])));
  // `D1`（`adr/0113` §1.5）：用户消息**只在 `userMessages` 里** —— `core/view/episode.ts` 把以 `用户：`
  // 开头的正文行收进 `userMessages`，并**恰好把它们排除出 `thinkLines`**。旧版从 `thinkLines` 过滤
  // `^用户：` ⇒ **恒不命中**（那里的行一定带 `- ` / `[..] [..]` 前缀），于是 `> 概况：` 恒报 0 用户消息、
  // 用户消息行恒不出现 —— 破的是「**如实**声明」那一半。这里取字段，并与 decisions/actions 同一
  // `new Set` 去重口径（同一句用户原话跨原子重复时只计一次）。
  const userMsgs = Array.from(new Set(atoms.flatMap((a: any) => a.userMessages || [])));
  const lines = [`# ${entry}`, "", "> 完整线索"];
  if (materials.length) lines.push(`> 背景/材料：${materials.slice(0, 8).join("、")}`);
  if (decisions.length) lines.push(`> 决策：${decisions.slice(0, 8).map((d: string) => `〔episode〕${d}`).join("；")}`);
  lines.push(`> 证据链：来源(决策·动作·用户) · 日期(${date}) · 证据(${materials.slice(0, 6).join("、") || "—"})`);
  lines.push(`> 概况：${actions.length} 动作 · ${userMsgs.length} 用户消息 · ${decisions.length} 决策`);
  if (project) lines.push(`> 项目：${project}`);
  if (agent) lines.push(`> Agent：${agent}`);
  lines.push(`> 汇总：由 ${atoms.length} 个原子记忆在 Episode 收口时合并（原始原子已归档移出活跃热集）`, "");
  const at = String(ep.startedAt || "").slice(11, 16) || "--:--";
  for (const d of decisions.slice(0, 20)) lines.push(`- [${at}] [${entry}] 决定 ${d}`);
  for (const a of actions.slice(0, 40)) lines.push(`- [${at}] [${entry}] ${a}`);
  // ⚠ `用户：` 标记**不能省**：收口文件本身会被重新 `parseMemory`（`compact.ts` 落缓存时经 `recOf`、
  // 冷进程再从磁盘重扫）⇒ 省掉标记这些行会被降级成 `thinkLines`（与 `决定 ` / `改/读 ` 两侧**不对称**），
  // `mode:"task"` 的触发与元数据分诊也随之丢失。逐字句柄仍是原原子（`Forget≠Delete`）——
  // 注意 `userMessages` 在解析层已截到 160 字（`adr/0113` §1.5 `V1`）⇒ 这里是**摘要**，不是逐字。
  for (const u of userMsgs.slice(0, 20)) lines.push(`- [${at}] [${entry}] 用户：${u}`);
  return lines.join("\n") + "\n";
}
