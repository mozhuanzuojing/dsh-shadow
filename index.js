/**
 * dsh-shadow — agent「思维/上下文/灵魂」的投影，落成「一切皆文件」的记忆树。
 *
 * 哲学：一切皆文件，这只是思维/上下文/灵魂的投影。
 * 记忆以「入口点 + 时间」为纲、思维/决策为正文、动作为背景。
 *   - 每条记忆 = 一个文件：shadow/<日期>/<时刻>-<入口slug>.md
 *   - shadow/_index.md = 说明文档 + 近期记忆 + 主题索引 + 意识轨迹
 *   - read_shadow：无参读索引；带 topic/entry 穿透到具体记忆文件
 *
 * 采集来源（按可靠度）：
 *   - fs/observed   → 入口点（实际改/读的组件，客观锚）
 *   - goal/changed  → 决策/意向
 *   - tools/result  → 动作背景
 *   - session/event → 交互 + 思维落点（尽力而为，守卫式；确切载荷重启后精修）
 *
 * Cordis host plugin entry。经 cordis.patch.yml bundle layer 挂载（dsh-wechat 模式）。
 * 零运行时依赖 @deepseek-ai/*：全部服务经 ctx.get / ctx.inject 读取。
 */
export const name = "dsh-shadow";
export const inject = [];

export function apply(ctx, rawConfig = {}) {
  const context = ctx;
  const pad = (n) => String(n).padStart(2, "0");
  const today = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - (offset || 0));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const stamp = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const compact = () => `${today()}--${stamp().replace(/:/g, "")}`;
  const slug = (s) => {
    const t = String(s || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return (t || "mem").slice(0, 40);
  };
  const normalize = (p) => String(p || "").replace(/\\/g, "/");
  const workspaceFor = (agent) =>
    agent?.session?.header?.cwd ?? agent?.session?.cwd ?? rawConfig?.shadowRoot ?? "";
  const under = (abs, ws) => {
    const a = normalize(abs);
    const w0 = normalize(ws);
    const w = w0.endsWith("/") ? w0.slice(0, -1) : w0;
    return a === w ? "" : a.startsWith(w + "/") ? a.slice(w.length + 1) : a;
  };
  // 入口点：相对路径前两级组件（客观锚）；无法相对则取路径本身。
  const component = (abs, ws) => {
    const rel = under(abs, ws);
    if (!rel) return normalize(abs);
    const segs = rel.split("/").filter(Boolean);
    return segs.slice(0, 2).join("/") || rel;
  };
  const initiatorId = () => {
    try {
      const agents = context.get("agents");
      return agents ? agents.currentInitiator()?.id : undefined;
    } catch {
      return undefined;
    }
  };

  // pending[agentId] = [{ time, kind, text, comp }]
  const pending = new Map();
  const comps = new Map();
  const push = (agentId, rec) => {
    if (!agentId) return;
    const arr = pending.get(agentId) || [];
    arr.push({ time: stamp(), ...rec });
    pending.set(agentId, arr);
    if (rec.comp) {
      const cs = comps.get(agentId) || [];
      cs.push(rec.comp);
      comps.set(agentId, cs);
    }
  };
  const primaryComp = (agentId) => {
    const cs = comps.get(agentId) || [];
    if (!cs.length) return "";
    const tally = {};
    for (const c of cs) tally[c] = (tally[c] || 0) + 1;
    return Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  };

  // 从 session/event 里尽力抽一条 user/assistant 消息（守卫式，多种形状）。
  const extractMessage = (event) => {
    if (!event) return null;
    const e = event;
    const role = e.role || e.speaker || e.message?.role || (e.type === "user" ? "user" : e.type === "assistant" ? "assistant" : undefined);
    if (role !== "user" && role !== "assistant") return null;
    let text =
      e.text ||
      e.content ||
      e.message?.text ||
      e.message?.content ||
      "";
    if (Array.isArray(text)) {
      text = text.map((b) => b?.text || b?.content || "").filter(Boolean).join("\n");
    }
    text = String(text || "").trim();
    if (!text) return null;
    return { kind: role, text: text.slice(0, 600) };
  };

  const goalText = (change) => {
    if (!change) return "";
    const obj = change.objective || change.goal?.objective || change.change?.objective || "";
    const act = change.action || change.phase || change.kind || "decision";
    const parts = [];
    if (obj) parts.push(String(obj).slice(0, 160));
    if (act) parts.push(`〔${act}〕`);
    return parts.join(" ") || "（决策）";
  };

  const readRel = async (fs, ws, rel) => {
    if (!fs || !ws) return "";
    try {
      const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
      return await fs.readText(t);
    } catch {
      return "";
    }
  };

  const listMemories = async (fs, ws) => {
    const out = [];
    try {
      const root = await fs.resolve(`${ws}/shadow`, { cwd: ws });
      const dates = await fs.listDir(root);
      for (const d of dates) {
        if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
        const dt = await fs.resolve(`${ws}/shadow/${d.name}`, { cwd: ws });
        const files = await fs.listDir(dt);
        for (const f of files) {
          const n = f?.name;
          if (!n || !n.endsWith(".md") || n === "_index.md") continue;
          const tm = n.match(/^\d{4}-\d{2}-\d{2}--(\d{6})/);
          out.push({ date: d.name, name: n, rel: `shadow/${d.name}/${n}`, time: tm ? tm[1] : "" });
        }
      }
    } catch {
      /* shadow 目录不存在 */
    }
    return out;
  };

  const topicsInText = (text, fallback) => {
    const set = new Set();
    const re = /\[[^\]]+\] \[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(text))) set.add(m[1]);
    if (fallback) set.add(fallback);
    return [...set];
  };

  const buildIndexText = (ws, memories, topicFiles, todayInfo) => {
    const byDate = {};
    for (const mm of memories) (byDate[mm.date] = byDate[mm.date] || []).push(mm);
    const lines = [];
    lines.push("# shadow 目录说明与索引");
    lines.push("");
    lines.push("`shadow/` 是 agent 思维/上下文/灵魂的投影——每条记忆都是一个文件。");
    lines.push("格式：`shadow/<日期>/<时刻>-<入口slug>.md`；记忆以「入口点+时间」为纲，思维/决策为正文。");
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
        for (const mm of byDate[dt].sort((a, b) => a.name.localeCompare(b.name))) {
          lines.push(`  - \`${mm.name}\``);
        }
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
    const sorted = [...memories].sort((a, b) =>
      a.date === b.date ? (a.time || "").localeCompare(b.time || "") : a.date.localeCompare(b.date),
    );
    if (sorted.length) {
      for (const mm of sorted) lines.push(`- ${mm.date} ${mm.time || "??????"} \`${mm.name}\``);
    } else {
      lines.push("（暂无）");
    }
    return lines.join("\n");
  };

  const rebuildIndex = async (fs, ws) => {
    if (!fs || !ws) return;
    try {
      const memories = await listMemories(fs, ws);
      const topicFiles = {};
      const todayStr = today();
      const todayTopics = new Set();
      let todayCount = 0;
      for (const mm of memories) {
        const text = await readRel(fs, ws, mm.rel);
        const tops = topicsInText(text, slug(mm.name));
        for (const t of tops) (topicFiles[t] = topicFiles[t] || []).push(mm.rel);
        if (mm.date === todayStr) {
          todayCount++;
          for (const t of tops) todayTopics.add(t);
        }
      }
      const idx = buildIndexText(ws, memories, topicFiles, { count: todayCount, topics: [...todayTopics] });
      const t = await fs.resolve(`${ws}/shadow/_index.md`, { cwd: ws });
      await fs.writeText(t, idx);
    } catch (e) {
      console.log("[dsh-shadow] rebuildIndex failed:", e && e.message);
    }
  };

  const flush = async (agent) => {
    const id = agent?.id;
    const arr = pending.get(id);
    if (!arr || !arr.length) {
      pending.delete(id);
      comps.delete(id);
      return;
    }
    pending.delete(id);
    const entry = primaryComp(id) || "shadow";
    comps.delete(id);
    const ws = workspaceFor(agent);
    const fs = context.get("fs");
    if (!ws || !fs) return;
    try {
      const rel = `shadow/${today()}/${compact()}-${slug(entry)}.md`;
      const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
      const head = `# ${entry}\n\n`;
      const body = arr.map((e) => `- [${e.time}] [${e.comp || entry}] ${e.text}`).join("\n");
      await fs.writeText(t, `${head}${body}\n`);
      await rebuildIndex(fs, ws);
    } catch (e) {
      console.log("[dsh-shadow] flush failed:", e && e.message);
    }
  };

  // ─── 采集：入口点（真实改/读组件，客观锚） ───
  context.on("fs/observed", (target) => {
    const abs = (target && (target.path || target.uri)) || "";
    if (!abs) return undefined;
    let initiator;
    try {
      initiator = context.get("agents")?.currentInitiator();
    } catch {
      initiator = undefined;
    }
    const id = initiator?.id;
    if (!id) return undefined;
    const ws = workspaceFor(initiator) || "";
    push(id, { kind: "action", text: `改/读 ${under(abs, ws) || abs}`, comp: component(abs, ws) });
    return undefined;
  });

  // ─── 采集：动作背景 ───
  context.on("tools/result", (exec) => {
    const id = exec?.agent?.id || initiatorId();
    const tool = exec?.tool?.name || exec?.toolName || exec?.name || exec?.tool || "tool";
    push(id, { kind: "action", text: `调用 ${tool}`, comp: tool });
    return undefined;
  });

  // ─── 采集：决策/意向（goal 变更） ───
  context.on("goal/changed", (payload) => {
    push(payload?.agent?.id, { kind: "decision", text: `决定 ${goalText(payload?.change)}`, comp: "" });
    return undefined;
  });

  // ─── 采集：交互 + 思维落点（尽力而为） ───
  context.on("session/event", (session, event) => {
    const m = extractMessage(event);
    if (!m) return undefined;
    const id = initiatorId();
    const tag = m.kind === "user" ? "用户" : "我";
    push(id, { kind: m.kind, text: `${tag}：${m.text}`, comp: "" });
    return undefined;
  });

  // ─── 回合结束：落成一个记忆文件 ───
  context.on("agent/turn-stopping", async (payload) => {
    await flush(payload && payload.agent);
    return undefined;
  });

  // ─── 注册 model 可见工具 read_shadow ───
  if (typeof context.inject === "function") {
    context.inject(["tools"], (toolsCtx) => {
      const toolsService = toolsCtx.get("tools");
      if (!toolsService) return;
      toolsService.register({
        name: "read_shadow",
        description:
          "读取 agent 的记忆树（shadow）。无参数返回目录与索引；带 topic/entry 按入口或主题穿透到具体记忆文件。当判断上下文不足、需要回忆最近想过/决定过什么时调用。",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string", description: "要穿透的入口/主题（如某路径片段、组件名、工具名、决策词）" },
            limit: { type: "number", description: "最多返回的记忆文件数，默认 20" },
          },
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }],
        },
        async execute(args, exec) {
          const agent = exec?.agent;
          const ws = workspaceFor(agent);
          if (!ws) return "（无法确定工作区，shadow 不可用）";
          const fs = context.get("fs");
          if (!fs) return "（fs 服务不可用）";
          const topic = String(args?.topic || "").trim();
          if (!topic) {
            const idx = await readRel(fs, ws, "shadow/_index.md");
            return idx || "（暂无 shadow 索引）";
          }
          const limit = Math.max(1, Math.min(50, Number(args?.limit) || 20));
          const needle = topic.toLowerCase();
          const memories = await listMemories(fs, ws);
          memories.sort((a, b) =>
            a.date === b.date ? b.name.localeCompare(a.name) : b.date.localeCompare(a.date),
          );
          const hits = [];
          for (const mm of memories) {
            if (hits.length >= limit) break;
            const text = await readRel(fs, ws, mm.rel);
            if (text.toLowerCase().includes(needle)) hits.push(`[${mm.rel}]\n${text.trim()}`);
          }
          return hits.length ? hits.join("\n\n") : `（无匹配「${topic}」的记忆）`;
        },
      });
    });
  }

  // ─── 注入「缺上下文就去翻」的运行时上下文（用 context 而非 section） ───
  if (typeof context.inject === "function") {
    context.inject(["systemPrompt"], (promptCtx) => {
      const systemPrompt = promptCtx.get("systemPrompt");
      if (!systemPrompt) return;
      systemPrompt.context({
        name: "dsh-shadow",
        order: 40,
        text: () =>
          "你的思维、上下文与决策沉淀在 shadow 记忆树中。如果发现当前上下文不足、需要回忆最近想过/决定过什么，" +
          "或要回顾用户最近在往哪个方向走，请先调用 read_shadow（无参读目录索引，带 topic 可按入口穿透）再补充回答。",
      });
    });
  }

  return () => {
    pending.clear();
    comps.clear();
  };
}
