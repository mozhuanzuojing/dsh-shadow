// dsh-shadow —— core/writer-materialize.ts：写侧物化 seam（candidate 2 主体拆分）。
// 从 createShadowCollector 迁出的「pending → 落盘物化」部分：flush（事件→记忆文件+meta+摘要）、
// rebuildIndex（L2 增量索引→_index.md）、runCompact（Episode 收口归档）、patchSummary、ensureIndex。
// fs 重、领域逻辑最密；用显式 WriterCore 注入（状态 + 配置派生），便于无 harness 验证。
// 与 writer.ts 原实现逐字一致；flush 经 hooks.primaryComp 取主入口（composition root 注入，解 cycle）。
import { SHADOW_ROOT } from "./paths.js";
import { deriveL0, deriveL1, renderSidecar, sidecarRel } from "./abstract.js";
import { resolveWorkspace } from "./scope.js";
import { policyForAgent, scopedFs, sessionPolicy } from "./fs-scope.js";
import { today, compact, slug, topicsInText, numOr, onByDefault } from "./util.js";
import { readRel, listMemories, memoryFileName, timeFromName } from "../persistence/files.js";
import { readMeta, mutateMeta } from "../persistence/meta.js";
import { buildClueHeader, registerMeta } from "./memory.js";
import { traceOf } from "./trace.js";
import { streamText, textMessage } from "./writer-llm.js";
import { buildIndexText, consolidateText } from "./writer-render.js";
import { parseMemory, deriveEpisodes, episodesIndexText } from "./episode.js";
import { isForgettable, oldestBeyond, isCompacted } from "./forget.js";
import { routeFor, noteDegrade, markDerivedDirty, rememberAuditMaterials, takeAuditMaterials } from "./writer-core.js";
import { isAuditBatch, echoToAudit, auditStreamRel, auditLinesOf, bodyLinesOf, actionMaterials } from "./capture-granularity.js";
import { appendJsonlLine } from "../persistence/jsonl-append.js";
import { invalidateProjection, shadowSourcesFingerprint } from "./projection-store.js";
export function makeMaterialize(core, hooks) {
    const cacheFor = (ws) => { let c = core.indexCache.get(ws); if (!c) {
        c = new Map();
        core.indexCache.set(ws, c);
    } return c; };
    const recOf = (mm, text) => {
        const entry = (String(text || "").match(/^# (.+)$/m) || [])[1]?.trim() || "";
        let parsed = undefined;
        try {
            parsed = parseMemory(text, mm.rel, mm.name);
        }
        catch (e) {
            // T8-A（v1.15.65，T8 第 7 条①）：旧版这里 `catch { /* 解析失败仅缺 episode/decision */ }`
            // 是**静默**的 —— 而后果不止「缺 episode/decision」：`parsed` 为 `undefined` 时这条记忆
            // 在 `deriveEpisodes` / `deriveDecisions` 里**整个消失**，它在索引与主题召回里却照旧活跃
            // ⇒ 同一份语料两条读路径的覆盖面不一致，而读者无从知道。
            // 「坏件 ≠ 空件」（`adr/0083` §2）：解析失败必须与「这条记忆本来就没有决策」分开。
            noteDegrade(core, "episodeParse", `记忆解析失败（${mm.rel}：${(e && e.message) || String(e)}）`, "该记忆**不会**出现在 Episodes / Decision Lineage 里（但它在索引与主题召回里照旧可见）");
        }
        return { date: mm.date, time: mm.time, name: mm.name, rel: mm.rel, entry, topics: topicsInText(text, slug(mm.name)), parsed };
    };
    /**
     * 记忆缓存 ↔ 磁盘**对账**（ADR-0069，v1.15.26）。
     *
     * 旧实现是「每个 workspace 只做**一次**全量读，之后只靠本进程 flush 增补」——
     * 那让缓存**再也看不到别的会话写入的文件**（也看不到磁盘上被删掉的文件）。
     *
     * 新实现改成**每次对账**：
     *   · `listMemories` 只做 `listDir`（元数据，**不读内容**）⇒ 廉价；
     *   · 只为**缓存里没有的**文件读内容 ⇒ 代价与「新增文件数」成正比，与库大小无关；
     *   · 磁盘上已消失的从缓存删掉 ⇒ 消除「幽灵记忆」（投影里有、源头没有）。
     *
     * 这样「投影跟得上源头」与「不每回合全量重读」两个目标同时成立。
     */
    const ensureIndexCache = async (fs, ws, skipForgotten) => {
        const cache = cacheFor(ws);
        const memories = await listMemories(fs, ws);
        for (const mm of memories) {
            if (skipForgotten(mm.rel)) {
                cache.delete(mm.rel);
                continue;
            }
            if (cache.has(mm.rel))
                continue; // 已在缓存 → 不重复读盘（增量）
            const text = await readRel(fs, ws, mm.rel);
            if (text)
                cache.set(mm.rel, recOf(mm, text));
        }
        // 源头已消失的 → 从投影删掉（否则索引里会留下幽灵条目）
        const onDisk = new Set(memories.map((m) => m.rel));
        for (const rel of [...cache.keys()])
            if (!onDisk.has(rel))
                cache.delete(rel);
        core.indexCacheWarm.add(ws);
    };
    const summarizeTurn = async (agent, body) => {
        if (core.summaryCfg.enabled === false)
            return "";
        const route = routeFor(core);
        const maxTokens = Math.max(1, Number(core.summaryCfg.maxTokens) || 80);
        const timeoutMs = Math.max(1, Number(core.summaryCfg.timeoutMs) || 8000);
        const system = "用一句话概括给定内容（这轮对话/动作的要点）。只用中文，不超过 40 个字；只输出这一句话，不加解释、引号、Markdown 或任何前缀。";
        const framed = String(body || "").trim().slice(0, 2000) || "（无正文）";
        const messages = [textMessage(`shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, framed)];
        // T8-A（v1.15.65，T8 第 2 条）：旧版 `if (!route) return ""` 静默；`streamText` 的
        // `finish.reason.kind === "error"` 也静默返回 `""` ⇒ 文件里只是「**没有摘要**」，
        // 与「**尚未生成**」不可区分（`patchSummary` 的回填也会因此永远不发生，且不留痕）。
        const text = await streamText(core.context, route, { label: "summarize", system, messages, maxTokens, timeoutMs, onSkip: (reason, detail) => noteDegrade(core, "summary", `${reason}${detail ? `（${detail}）` : ""}`, "记忆文件里**没有摘要** —— 这与「尚未生成」在文件表面上完全一样；检索时也少了一路语义线索") });
        const one = String(text || "").replace(/\s+/g, " ").trim();
        return one ? one.slice(0, 120) : "";
    };
    // ── Episode 收口归档（B）：一个 episode 结束时把其 turn 原子合并成一个 consolidated 文件，
    //    个体原子 mark status=compacted 并移出活跃热集（文件保留、可回放；Forget≠Delete）。默认关。
    const compactSlug = (id) => String(id || "ep").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "ep";
    const runCompact = async (fs, ws, cache) => {
        if (!onByDefault(core.compactCfg.enabled))
            return; // v1.15.85「默认全开」
        const parsed = [...cache.values()].map((r) => r.parsed).filter(Boolean);
        if (!parsed.length)
            return;
        const gap = numOr(core.compactCfg.gapMinutes, core.episodeGap);
        const eps = deriveEpisodes(parsed, { gapMinutes: gap });
        if (eps.length <= 1)
            return; // 只有当前打开的 episode，无已完成收口的
        // **增量标记，不在陈旧快照上改**（ADR-0068）：本函数的写入窗口跨「重建索引 + 收口」，
        // 拿开头读到的 meta 全量覆盖回去会丢掉期间别人的写入。故只收集 delta，最后在
        // `mutateMeta` 的**新鲜快照**上应用。
        const marks = [];
        const dateOf = (rel) => (rel.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || today();
        for (const ep of eps.slice(0, -1)) {
            const atoms = (ep.memoryRefs || []).map((rel) => cache.get(rel)?.parsed).filter(Boolean);
            if (!atoms.length)
                continue;
            // 时间戳必须**从 `episode.startedAt` 同时产出「文件名里的」与「缓存里的」**（v1.15.38 修复）：
            //   原来文件名不带时间戳、缓存里放 `startedAt.slice(11,17).replace(/:/g,"")`
            //   （`YYYY-MM-DD HH:MM:SS` 下 = `"09:00:"` → `"0900"`，**4 位、不是 HHMMSS**）⇒
            //   重启后读侧从文件名反解得到 `""`，同一 consolidated 文件的 `time` 两套值，
            //   而 `time` 是取代裁决的输入（`query/query.ts:299`）⇒ 跨重启裁决会变（ADR-0069 同族）。
            //   现在：文件名带 6 位 HHMMSS，缓存 `time` **由文件名反解**（`timeFromName`），两侧同源。
            const stamp = String(ep.startedAt || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):?(\d{2}):?(\d{2})/);
            const rdate = stamp ? stamp[1] : dateOf((ep.memoryRefs || [])[0]);
            const rtime = stamp ? `${stamp[2]}${stamp[3]}${stamp[4]}` : "";
            const name = memoryFileName(rdate, rtime, `ep-${compactSlug(ep.id)}-consolidated.md`);
            const rel = `${SHADOW_ROOT}/${rdate}/${name}`;
            const text = consolidateText(ep, atoms);
            const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
            await fs.writeText(t, text);
            for (const a of atoms) {
                marks.push(a.rel);
                cache.delete(a.rel);
            }
            cache.set(rel, recOf({ date: rdate, time: timeFromName(name), name, rel }, text));
        }
        if (marks.length) {
            await mutateMeta(fs, ws, (m) => {
                for (const rel of marks) {
                    m[rel] = m[rel] || { hits: 0, status: "active", pinned: false };
                    m[rel].status = "compacted";
                }
            });
        }
    };
    // ── 目录级 L0/L1 sidecar（ADR-0065 / D6，v1.15.35）────────────────────────────
    //  每条记忆一份摘要是 O(N) 写；**每个日期目录一份**是 O(#dates) 写，故代价有界（见 types.ts 的注释）。
    //  层次：记忆（source）→ L1 → L0，**每层只从它下面那层派生**（`core/abstract.ts` 的唯一纪律）。
    //  返回「最近 N 个目录的 L0」供 `_index.md` 引用 —— 这条读路径让 sidecar **不是死代码**。
    const writeAbstracts = async (fs, ws, recs) => {
        if (core.abstractCfg.enabled === false)
            return "";
        const byDate = new Map();
        for (const r of recs) {
            if (!r?.date)
                continue;
            const arr = byDate.get(r.date) || [];
            arr.push(r);
            byDate.set(r.date, arr);
        }
        // 降序 = 最近的目录在前（与 `listDir` 的升序相反，故显式排 —— 与 ADR-0071 同一处坑）。
        const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
        const facesOf = (rs) => rs.map((r) => ({ name: r.name, time: r.time, entry: r.entry, topics: r.topics || [] }));
        const sections = [];
        for (const date of dates) {
            const faces = facesOf(byDate.get(date));
            const l1 = deriveL1(faces);
            // `pending` 恒为 0：本函数与 `_index.md` 用**同一份 `recs`** 派生 ⇒ 构造上不可能落后。
            // 之所以仍写下这个字段：③ 要求派生件**自报覆盖率**，而「自报 0」本身就是可对账的断言
            //（`test/abstract-sidecar.test.ts` 的棘轮会独立重算，而不是信它）。
            const text = renderSidecar(date, l1, { covered: faces.length, pending: 0 });
            try {
                const t = await fs.resolve(`${ws}/${sidecarRel(date)}`, { cwd: ws });
                await fs.writeText(t, text);
            }
            catch (e) {
                console.log("[dsh-shadow] abstract sidecar write failed:", e && e.message);
                // T8-A 漏项（v1.15.65 补）：这一条**不是**「正当静默」那一类（判据见 `core/projection-store.ts`）——
                // 下面的 `continue` 会让该日期目录的 L0 **不再被写进 `_index.md`**（`sections.push` 被跳过）
                // ⇒ **读者拿到的内容变了**（索引里少一行），且 sidecar 文件也不存在。
                // 我上一轮修 T8-A 时就站在这个 `catch` 旁边，却没给它加信号 —— 而这正是
                // `README` 自己标的「**部分可见**：索引里看不到它，但无显式 warn」。
                noteDegrade(core, "abstracts", `目录摘要 sidecar 写失败（${e && e.message}）`, `该日期目录的 L0 **不会出现在 \`_index.md\` 里**（索引少一行），且 sidecar 文件不存在 ⇒ 「这个目录没有摘要」与「写失败了」在读数上不可区分`);
                continue; // 一个目录写失败不影响其余；也不把它列进 `_index.md`（避免指向不存在的摘要）
            }
            sections.push(`- ${date}（${faces.length} 条）${deriveL0(l1)}`);
        }
        // T8-B（v1.15.64）：`types.ts:55` **明写**「默认 3，0 = 不列」，而 `|| 3` 把 0 吞掉 ⇒
        // 文档承诺的「0 = 不列」在代码里不成立（下面的 `!show` 分支因此永远走不到）。
        const show = numOr(core.abstractCfg.showInIndex, 3);
        if (!show || !sections.length)
            return "";
        return `\n\n## 目录摘要（L0 · 派生物）\n${sections.slice(0, show).join("\n")}\n`;
    };
    const rebuildIndex = async (fs, ws) => {
        if (!fs || !ws)
            return;
        try {
            // **先采指纹、后读源**（ADR-0069；与 ADR-0068 同一顺序教训）：
            //   若扫描期间源又变了，记下的是**更旧**的指纹 ⇒ 下次比对必然不等 ⇒ 保守重建（只是多干一次活）；
            //   反过来（读完再采）会把这次变化记成「已见过」⇒ 下次比对相等 ⇒ **永久漏掉那次变化**。
            const fpBefore = await shadowSourcesFingerprint(fs, ws);
            // L2 增量索引 —— 每次**对账**（见 ensureIndexCache 注释）：廉价 listDir + 只读新文件，
            // 而不是「只读一次、之后再也看不见别的会话写的文件」。
            const meta = await readMeta(fs, ws);
            const skipForgotten = (rel) => isForgettable(rel, meta, core.forgetCfg) || isCompacted(meta, rel);
            await ensureIndexCache(fs, ws, skipForgotten);
            const cache = cacheFor(ws);
            // 遗忘：把低价值/旧条目移出活跃热集（文件保留，仅不再被索引/召回扫描；Forget≠Delete）。
            for (const rel of [...cache.keys()])
                if (isForgettable(rel, meta, core.forgetCfg) || isCompacted(meta, rel))
                    cache.delete(rel);
            // 硬上限：活跃记忆超过 maxActive 时，遗忘最旧的（封顶热集大小）。
            const maxActive = Math.max(0, Number(core.forgetCfg.maxActive) || 0);
            if (onByDefault(core.forgetCfg.enabled) && maxActive > 0 && cache.size > maxActive) {
                const recsAll = [...cache.values()];
                const drop = oldestBeyond(recsAll.map((r) => ({ rel: r.rel, date: r.date, time: r.time })), maxActive);
                for (const rel of drop)
                    cache.delete(rel);
            }
            // Episode 收口归档：关闭的 episode → 合并成一个 consolidated 文件 + 原子归档（文件变少）。
            await runCompact(fs, ws, cache);
            const recs = [...cache.values()];
            const memories = recs.map((r) => ({ date: r.date, time: r.time, name: r.name, rel: r.rel }));
            const topicFiles = {};
            const parsed = [];
            const todayStr = today();
            const todayTopics = new Set();
            let todayCount = 0;
            for (const r of recs) {
                for (const t of r.topics)
                    (topicFiles[t] = topicFiles[t] || []).push(r.rel);
                if (r.date === todayStr) {
                    todayCount++;
                    for (const t of r.topics)
                        todayTopics.add(t);
                }
                if (r.parsed)
                    parsed.push(r.parsed);
            }
            let idx = buildIndexText(ws, memories, topicFiles, { count: todayCount, topics: [...todayTopics] });
            // 目录级 L0/L1 sidecar（ADR-0065 / D6）：先把 sidecar 写出去，再把它最近几个目录的 L0
            // 引到 `_index.md` —— 顺序不能反（否则索引可能指向一份写失败的摘要）。
            idx += await writeAbstracts(fs, ws, recs);
            // 把碎片串成"任务回溯（Episodes）"：一次连续任务 = 一个 Episode（派生式，不写回记忆文件）。
            if (core.episodeShow > 0) {
                try {
                    const eps = deriveEpisodes(parsed, { gapMinutes: core.episodeGap });
                    idx += "\n" + episodesIndexText(eps, core.episodeShow);
                }
                catch (e) {
                    // T8-A（v1.15.65，T8 第 7 条②）：旧版只有 `console.log` —— 而 `console.log`
                    // **不算** ADR-0049 认可的可见信号。后果：`_index.md` 里**没有** Episodes 段，
                    // 与「当前只有原子记忆、还没有连续任务片段」**渲染成同一句话**
                    //（`episodesIndexText([])` 输出「（暂无连续任务片段，当前仅原子记忆）」）⇒ 读者分不清。
                    console.log("[dsh-shadow] episodes derive failed:", e && e.message);
                    noteDegrade(core, "episodes", `Episodes 派生失败（${(e && e.message) || String(e)}）`, "`_index.md` 不列 Episodes 段，且与「暂无连续任务片段」**渲染结果相同** ⇒ 分不清是「没有」还是「坏了」");
                }
            }
            const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_index.md`, { cwd: ws });
            await fs.writeText(t, idx);
            // 落盘成功后才记指纹（失败时不记，下次仍会重建）。只在可判定时记。
            if (fpBefore !== undefined)
                core.indexFingerprint.set(ws, fpBefore);
        }
        catch (e) {
            console.log("[dsh-shadow] rebuildIndex failed:", e && e.message);
            return false; // **必须让调用方知道**：否则它会清掉 dirty 标记 ⇒ 本次失败后**再也不重建**
        }
        return true;
    };
    const patchSummary = async (fs, ws, rel, entry, arr) => {
        const summary = await summarizeTurn(null, arr.map((e) => `- [${e.comp || entry}] ${e.text}`).join("\n"));
        if (!summary)
            return;
        try {
            const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
            const existing = await fs.readText(t);
            const patched = existing.replace(/^(# .+\n\n)/, `$1> 摘要：${summary}\n\n`);
            if (patched !== existing) {
                await fs.writeText(t, patched);
                core.indexDirty.add(ws); // 摘要回填 → 索引懒标记，待读时再重建。
                // T17-B（D6 门③）：**这就是目录级粗信号必然漏报的那一类写** —— `patchSummary` 原地改写
                // **已存在**的同一个文件（路径不变、目录令牌不变，实测 `fs-cost-findings.md` Q5）。
                // 不标脏 ⇒ 派生索引永远陈旧，而且没有任何信号。故这里必须留一条写侧精确信号。
                markDerivedDirty(core, ws, rel);
            }
        }
        catch (e) {
            console.log("[dsh-shadow] summarize patch failed:", e && e.message);
        }
    };
    const flush = async (agent) => {
        const id = agent?.id;
        const arr = core.pending.get(id || "");
        if (!arr || !arr.length) {
            if (id) {
                core.pending.delete(id);
                core.comps.delete(id);
            }
            return;
        }
        // P5 默认回写显式同意：writeConsent=true 时，仅当本回合含"用户显式要求记忆"的措辞才落盘；
        // 否则只累积（保留 pending，不删除、不写文件），避免静默持久化用户未要求的上下文。
        if (core.writeConsent && !arr.some((e) => e.kind === "user" && /(记住|记得|记一下|记下来|记忆|沉淀|存档|保存|日后|以后|写入记忆|记下)/.test(String(e.text || "")))) {
            return;
        }
        // **先取好工作区与会话 fs，再消费 pending**（v1.15.55 修：顺序反了 ⇒ 整批被静默丢弃）。
        // 旧顺序是「先 `pending.delete` / `comps.delete`，再 `if (!ws || !fs) return`」：
        // 一旦取不到 ws/fs（会话工作区解析失败 / 无沙箱策略），**整批记录已经被消费掉了**，
        // 既没落盘、也没留痕（`lastFlushError` 未设 ⇒ 读侧 `getFlushWarn()` 恒空 ⇒
        // 「你读到的可能是旧/不完整记忆」这条告警**在最需要它的时候失效**）。
        const ws = resolveWorkspace(agent, core.cwdBySession, core.config);
        // 会话作用域的 fs（ADR-0074）：写入必须携带**该会话自己的**沙箱策略 ——
        // 省略该参数会让沙箱退回部署 fallback（mode=workspace-write + `process.cwd()`），
        // 会话工作区一旦不等于服务启动目录，写入即被围栏拒绝（记忆一条都落不了盘）。
        const fs = scopedFs(core.context.get("fs"), policyForAgent(core.context, agent));
        if (!ws || !fs) {
            // **pending 保留**（不 delete）：下次 flush 还能落盘；同时**必须留痕**。
            core.lastFlushError = {
                at: Date.now(),
                err: `flush 跳过：${!ws ? "工作区不可解析" : "无会话 fs（沙箱策略缺失）"}；本回合 ${arr.length} 条**未落盘且已保留**`,
            };
            console.error("[dsh-shadow][error] flush SKIPPED:", core.lastFlushError.err);
            return;
        }
        const entry = hooks.primaryComp?.(id || "") || "shadow";
        const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
        // 事件 → Trace：与审计流共用同一份归一化（v1.19.0 / adr/0097）。
        const traces = traceOf(arr, id);
        // ── v1.19.0（adr/0097 D1/D2）：**粒度分流** ────────────────────────────────────────────────
        // 一批里**只有 action**（无 user / decision / assistant）时它**不是记忆** ——
        // CONTEXT.md 的五个要素一个都没有 —— 它是**审计流**：一行一条 JSON 追加进
        // `.shadow/audit/<date>.jsonl`，不再各占一个 inode、不再各带一份溯源样板。
        // 判据是纯函数 `classifyBatch`；复核判据 = 记忆文件的 `> 证据链：来源(...)` 不得只有「动作」
        // （门：`tools/granularity-audit.ts`）。
        if (isAuditBatch(arr) && echoToAudit(core.config)) {
            if (id)
                core.pending.delete(id);
            if (id)
                core.comps.delete(id);
            const auditRel = auditStreamRel(today());
            const lines = auditLinesOf(traces, { agent: id ? String(id) : undefined, project });
            if (lines.length) {
                const r = await appendJsonlLine(fs, ws, auditRel, lines.join("\n"));
                if (!r.ok) {
                    // 失败**不静默**（ADR-0049）：审计流写不进去与「本来就没动作」必须可区分。
                    core.lastFlushError = { at: Date.now(), err: `审计流追加失败（${auditRel}）：${r.reason}` };
                    console.error("[dsh-shadow][error]", core.lastFlushError.err);
                }
            }
            // D4：材料**折叠进下一条记忆** —— 否则「纯动作批读过的文件」会从记忆层消失（审计流读侧不消费）。
            rememberAuditMaterials(core, id, actionMaterials(arr));
            return;
        }
        if (id)
            core.pending.delete(id);
        if (id)
            core.comps.delete(id);
        try {
            const rel = `${SHADOW_ROOT}/${today()}/${compact()}-${slug(entry)}.md`;
            const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
            const head = `# ${entry}\n\n`;
            // 先前那些**已降级进审计流**的批读过的文件，并入本条记忆的「背景/材料」（即取即清）。
            const extra = { project, agent: id ? String(id) : undefined, goal: core.goalByAgent.get(String(id || "")), foldedMaterials: takeAuditMaterials(core, id) };
            const clue = buildClueHeader(entry, arr, id, extra);
            const bodyLines = bodyLinesOf(traces, entry);
            const body = bodyLines.length ? bodyLines.join("\n") : "- （本回合无可安全记录的正文）";
            await fs.writeText(t, `${head}${clue}${body}\n`);
            // L2 增量索引：把刚落盘的文件立即并入进程内缓存（避免重复读盘）；索引直接由缓存生成。
            cacheFor(ws).set(rel, recOf({ date: today(), time: compact().split("--")[1]?.slice(0, 6), name: rel.split("/").pop(), rel }, `${head}${clue}${body}\n`));
            core.indexDirty.add(ws); // 索引懒构建：不在此处重建，待 read_shadow 读索引时再 ensureIndex。
            // T17-B（D6 门③）：刚落盘的这条 rel 也必须标脏 —— 供派生索引做**单条 upsert**。
            // 注意它**不依赖** `projectionStore.enabled`（那是另一件事：`nodes.jsonl` 投影缓存）。
            markDerivedDirty(core, ws, rel);
            // 记忆文件与索引缓存已写入；**元数据登记失败必须留痕**（否则这条记忆在索引里活跃、
            // 而 `_meta.json` 里没有它 ⇒ hits 永远不计、生命周期恒 NEW、遗忘判据落回默认值）。
            if (!(await registerMeta(fs, ws, rel, id, onByDefault(core.retentionCfg.enabled)))) {
                core.lastMetaError = { at: Date.now(), err: `元数据未登记（${rel}）：hits/生命周期/遗忘判据都看不到这条记忆` };
                console.error("[dsh-shadow][error]", core.lastMetaError.err);
            }
            void patchSummary(fs, ws, rel, entry, arr);
        }
        catch (e) {
            core.lastFlushError = { at: Date.now(), err: (e && e.message) || String(e) };
            console.error("[dsh-shadow][error] flush FAILED:", core.lastFlushError.err);
        }
    };
    // 懒构建索引：flush 只置 dirty（不重建）；这里才在「确实要读索引」时构建/落盘。
    //
    // v1.15.26（ADR-0069）修一处**投影漂移**：旧条件是
    //   `if (!core.indexDirty.has(ws) && core.indexCacheWarm.has(ws)) return;`
    // 而 `indexDirty` 是**进程内** Set —— 它只反映**本进程**的写入。
    // 记忆文件是 source of truth，**别的会话/子代理写入的记忆本进程的 dirty 永远看不到**
    // ⇒ 缓存一旦预热，`_index.md` 就**再也不更新**。实测（真 `.shadow`）：
    //   `_index.md` 停在 09:34:01，之后写入的 **623 条（8.54%）**记忆对索引不可见；
    //   而主题召回走 `listMemories`（每次读盘）**看得见** ⇒ 同一份语料两条读路径可见性分歧。
    // 修法与 v1.15.12 修 `shadow_query` 陈旧投影**同型**：让新鲜度问**源**，不只问进程 ——
    // 用已存在的 `shadowSourcesFingerprint`（它就是为这个目的写的，此前只接给了 `nodes.jsonl`）。
    const ensureIndex = async (ws, session) => {
        if (!ws)
            return;
        // 读路径同样会经此写盘（`_index.md`、Episode 收口文件）⇒ 同样要带会话策略（ADR-0074）。
        const fsI = scopedFs(core.context.get("fs"), sessionPolicy(core.context, session));
        if (!fsI)
            return;
        if (core.indexCacheWarm.has(ws) && !core.indexDirty.has(ws)) {
            // 进程内无变更 ⇒ **再问一次源**：源未变才真能跳过（否则保守重建）。
            const fpNow = await shadowSourcesFingerprint(fsI, ws);
            const fpPrev = core.indexFingerprint.get(ws);
            // 两侧都可判定且一致 → 跳过；任一侧不可判定（后端不报 size/version、首次无记录）→ 保守重建。
            if (fpNow !== undefined && fpPrev !== undefined && fpNow === fpPrev)
                return;
        }
        const ok = await rebuildIndex(fsI, ws);
        if (!ok) {
            // **不清 dirty**（下次读还会重建），并**留痕**给读侧（`getFlushWarn()` 会渲染）。
            // 旧代码无条件 `indexDirty.delete(ws)`：一次重建失败 ⇒ dirty 被清掉 ⇒ 之后
            // `indexCacheWarm` 命中就**再也不重建**，而调用方照读磁盘上的**陈旧** `_index.md`。
            core.lastIndexError = { at: Date.now(), err: `索引重建失败（${ws}）：本次仍读旧 _index.md` };
            console.error("[dsh-shadow][error]", core.lastIndexError.err);
            return;
        }
        core.indexDirty.delete(ws);
        // v1.15.12：索引重建 = **记忆集已变** → 投影缓存必须一并失效，
        // 否则 shadow_query 会读陈旧投影（此前 invalidate 零调用点，只能手动删 nodes.jsonl）。
        //
        // T17-B（D6）：**派生索引（`index.sqlite`）的失效/增量与这一行无关** —— 它的新鲜度由
        //   门① 目录令牌（~5 ms）、门② 变化目录细比对、门③ 写侧 dirty（`markDerivedDirty`，见 flush/patchSummary）
        //   三者共同决定，**不依赖 `projectionStore.enabled`**。这里保持原条件只是在管 `nodes.jsonl` 投影缓存：
        //   解耦的含义是「别把新能力挂在这个 `if` 里面」。§ 既有缺口（`adr/0095` §三⑵ 的原文）即指此。
        if (core.config.projectionStore?.enabled === true)
            await invalidateProjection(fsI, ws);
    };
    return { flush, rebuildIndex, ensureIndex };
}
