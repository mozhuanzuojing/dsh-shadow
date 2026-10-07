// dsh-shadow —— core/writer/compact.ts：Episode 收口（ADR-0038 正文 + 补记 + ADR-0110 §2.2）。
//
// 为什么单独一个文件：`materialize.ts` 是复杂度**热点（只能降）**，而收口这件事自带一段必须写下的根因说明。
//
// **触发点自 v1.21.42 起在写侧**（`maybeCompact`，由 `flush` 调用）。根因（2026-09-30 实测）：
//   `runCompact` 原先只在 `rebuildIndex` 里被调用 → `rebuildIndex` 只由 `ensureIndex` 调用 →
//   `ensureIndex` 只由**无参 `read_shadow`**（`query/index-budget.ts`）触发，而写路径明写「不在此处重建」。
//   ⇒ **只要没人无参读目录，文件就永不收敛**（本机 466 条原子、`_index.md`/`abstracts/`/`consolidated` 三件一起缺）。
//
// ── 形态（ADR-0110 §2.2，`v1.21.45` 起）：**两者并存**，不是一个替掉另一个 ────────────────────────
//   `v1.21.44` 曾试图把产物**从** `atoms/` **挪到** `indexes/affaires/` 并只做「同卡加圈」，
//   结果被既有判据挡下：旧形态的 consolidated **本身就是一条记忆**（在 `atoms/`、进缓存）⇒
//   `episode-lineage` 场景 7 的「**收口后决策可召回**」成立；挪进派生层后，被收口的决策**从召回面消失**。
//   ⇒ 正确解法是**把两件事分开、各归其位**：
//     · **召回面** = **圈记忆原子**，落 `atoms/`（不可变、只追加、进缓存）—— 主题召回看得见，ADR-0038 的保证不动；
//     · **成长面** = **派生纪要**，落 `indexes/affaires/<key>.md`（可逐圈加厚；**开新圈前**留归档圈
//       `…history/<圈号>.md`，只追加、永不改写 ⇒ 平衡三律的律 3）。
//   ⚠ 纪要**不进记忆缓存**（它是派生件，不是 Memory Atom ⇒ 不得出现在索引/召回里）。
// 这不违反 ADR-0038 §6 的「方向 A 不做」：合并的仍是**已关闭**的 episode（时间间隔客观判定），
// 不引入「agent 自决任务边界」，Episode 依旧是派生。
import { createHash } from "node:crypto";
import { consolidateText } from "./render.js";
import { metaOutcomeNotice, mutateMetaVersioned, readMeta } from "../../persistence/meta.js";
import { noteDegrade } from "./core.js";
import { readRel, memoryFileName, timeFromName, dateFromName } from "../../persistence/files.js";
import { atomsRel, indexesRel } from "../paths.js";
import { deriveEpisodes } from "../view/episode.js";
import { isCompacted, isForgettable } from "../retention/forget.js";
import { numOr, onByDefault, today } from "../util.js";

/** 收口要用的工厂作用域件（`core` / `recOf` / 缓存两件由 `materialize.ts` 注入）。 */
export interface CompactDeps {
  core: any;
  recOf: (mm: any, text: string) => any;
  cacheFor: (ws: string) => Map<string, any>;
  ensureIndexCache: (fs: any, ws: string, skipForgotten: (rel: string) => boolean) => Promise<void>;
}

const compactSlug = (id: string) => String(id || "ep").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "ep";

// ── 派生纪要（成长面）：同一件 Affaire 一张，逐圈加厚 ─────────────────────────────────────────
/** 纪要 key = 「这件事」（同一 `项目|Agent`；退化时用 episode id）。 */
const minuteKeyOf = (ep: any): string => [ep.project, ep.agent].filter(Boolean).join("|") || String(ep.id || "affaire");
/** 纪要文件名（带短哈希 ⇒ 不同 key 不撞名）。 */
const minuteFileName = (key: string): string => {
  const safe = String(key || "").replace(/[^a-z0-9._-]+/gi, "-").slice(-40);
  const h = createHash("md5").update(String(key || ""), "utf8").digest("hex").slice(0, 8);
  return `${safe || "affaire"}-${h}.md`;
};
const minuteRel = (key: string): string => indexesRel(`affaires/${minuteFileName(key)}`);
const minuteHistoryRel = (key: string, ring: number): string =>
  indexesRel(`affaires/${minuteFileName(key).replace(/\.md$/, "")}.history/${ring}.md`);
const ringCountOf = (text: string): number => (String(text || "").match(/^### 圈 /gm) || []).length;

/** 加一圈：首圈写头，之后**只追加**（旧圈逐字不动 ⇒ 成长可回退）。 */
const appendRing = (prev: string, key: string, ring: number, ep: any, n: number, body: string): string => {
  const head = prev
    ? prev.replace(/\n*$/, "\n")
    : `# 纪要：${key}\n\n> 类型：纪要（**派生 · 可重建**；ADR-0110 §2.2 —— 同一件 Affaire 逐圈加厚）\n> key：\`${key}\`\n> 圈数：0\n\n## 圈\n`;
  const from = String(ep.startedAt || "").slice(0, 16);
  const to = String(ep.endedAt || "").slice(11, 16);
  const when = to && to !== from.slice(11, 16) ? `${from} → ${to}` : from;
  const withCount = head.replace(/^> 圈数：\d+$/m, `> 圈数：${ring}`);
  return `${withCount}\n### 圈 ${ring} · ${when} · ${n} 条原子\n\n${body.trimEnd()}\n`;
};

/** 一个 episode 结束时：产出**圈记忆原子**（召回面）+ 往**派生纪要**加一圈（成长面）。原子标 `compacted`
 *  并移出活跃热集（**文件保留、可回放**；Forget≠Delete，ADR-0038）。 */
export const runCompact = async (deps: CompactDeps, fs: any, ws: string, cache: Map<string, any>): Promise<void> => {
  const { core, recOf } = deps;
  if (!onByDefault(core.compactCfg.enabled)) return;   // v1.15.85「默认全开」
  const parsed = [...cache.values()].map((r) => r.parsed).filter(Boolean);
  if (!parsed.length) return;
  const gap = numOr(core.compactCfg.gapMinutes, core.episodeGap);
  const eps = deriveEpisodes(parsed, { gapMinutes: gap });
  if (eps.length <= 1) return; // 只有当前打开的 episode，无已完成收口的
  // **增量标记，不在陈旧快照上改**（ADR-0068）：本函数的写入窗口跨「重建索引 + 收口」，
  // 拿开头读到的 meta 全量覆盖回去会丢掉期间别人的写入。故只收集 delta，最后在
  // `mutateMetaVersioned` 的**新鲜快照**上应用（四态结局见下方 `marks` 那一段）。
  const marks: string[] = [];
  const dateOf = (rel: string) => dateFromName(String(rel).split("/").pop() || "") || today();
  for (const ep of eps.slice(0, -1)) {
    const atoms = (ep.memoryRefs || []).map((rel: string) => cache.get(rel)?.parsed).filter(Boolean);
    if (!atoms.length) continue;
    // 时间戳必须**从 `episode.startedAt` 同时产出「文件名里的」与「缓存里的」**（v1.15.38 修复）
    const stamp = String(ep.startedAt || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):?(\d{2}):?(\d{2})/);
    const rdate = stamp ? stamp[1] : dateOf((ep.memoryRefs || [])[0]);
    const rtime = stamp ? `${stamp[2]}${stamp[3]}${stamp[4]}` : "";
    // ① 召回面（ADR-0038）：圈记忆原子，落 `atoms/`、进缓存 ⇒ 主题召回看得见
    const name = memoryFileName(rdate, rtime, `ep-${compactSlug(ep.id)}-consolidated.md`);
    const rel = `${atomsRel()}/${name}`;
    const text = consolidateText(ep, atoms);
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, text);
    for (const a of atoms) {
      marks.push(a.rel);
      cache.delete(a.rel);
    }
    cache.set(rel, recOf({ date: rdate, time: timeFromName(name), name, rel }, text));
    // ② 成长面（ADR-0110 §2.2）：同一件 Affaire 的派生纪要**加一圈**（开新圈前先留归档圈 = 律 3）
    const key = minuteKeyOf(ep);
    const mrel = minuteRel(key);
    const prev = await readRel(fs, ws, mrel);
    const ring = ringCountOf(prev) + 1;
    if (prev) {
      const ht = await fs.resolve(`${ws}/${minuteHistoryRel(key, ring - 1)}`, { cwd: ws });
      await fs.writeText(ht, prev);
    }
    const body = text.replace(/^# .*\n+/, "");   // 去掉渲染器自带的 H1（圈标题已经承担了层级）
    const mt = await fs.resolve(`${ws}/${mrel}`, { cwd: ws });
    await fs.writeText(mt, appendRing(prev, key, ring, ep, atoms.length, body));
    // ⚠ **不**把纪要塞回 `cache`：它是派生件，进缓存就会被当成 Memory Atom 出现在索引/召回里。
  }
  if (marks.length) {
    // ## 为什么这一处**必须**区分「并发没抢到」与「写失败」（B24 消费面②）
    //
    // `marks` = 本批**已收口**原子的 `status = "compacted"`。这个标记**丢不得**（ADR-0068 原文）：
    // 它是「把低价值/已归档条目移出**活跃索引/召回**热集」的唯一依据，丢了会让
    // **已归档原子重回活跃索引/召回** —— 读者看到的内容因此改变，不是遥测量。
    // 旧版 `await mutateMeta(...)` 把两种结局都吞进 `false` 且**没人看**（没有调用方分支）⇒
    // 一次竞争或一次磁盘故障就能静默改变召回面。这里把结论送进**可见信号**通道
    //（`WriterCore.degrade` 台账 → `getFlushWarn()` 在每条读路径上渲染），并**分开写原因**
    //（原因串与「哪种结局要人管」的判据都在 `persistence/meta.ts` 的 `metaOutcomeNotice` 一处，
    // 不让同一个 `字段=字面量` 在两个模块里各出现一次 —— `audit:drift` 的棘轮只许降）。
    // ⚠ 与 `registerMeta` 的用法**不同**：那里只有 `needsHuman` 才上报（`contended` 会自愈、
    // 报它就是假降级）；**这里两种都要上横幅** —— 收口标记哪怕只是时间性地没写进去，
    // 召回面此刻也已经不对了，读者有权知道。`noop` 不可能出现（本 mutate 恒返回 `void`）。
    const outcome = await mutateMetaVersioned(fs, ws, (m) => {
      for (const rel of marks) {
        m[rel] = m[rel] || { hits: 0, status: "active", pinned: false };
        m[rel].status = "compacted";
      }
    });
    const notice = metaOutcomeNotice(outcome);
    if (notice) {
      noteDegrade(
        core,
        "compact",
        `收口标记未落盘：${notice.why}`,
        `本批 ${marks.length} 条已收口原子的 \`status=compacted\` **没写进 \`_meta.json\`** ⇒ 它们可能**仍留在活跃索引/召回里**` +
          `（收口文件与派生纪要都已落盘、可回放；缺的只是「移出活跃集」这一步）`,
      );
    }
  }
};

/** **写侧**收口触发（v1.21.42）：冷进程里 cache 可能为空，先把缓存按同一套判据对账出来，再交给 `runCompact`。 */
export const maybeCompact = async (deps: CompactDeps, fs: any, ws: string): Promise<void> => {
  const { core, cacheFor, ensureIndexCache } = deps;
  if (!onByDefault(core.compactCfg.enabled)) return;
  // `ensureIndexCache` 只 listDir + 只读**新**文件（代价与「新增文件数」成正比，与库大小无关）。
  const meta = await readMeta(fs, ws);
  const skip = (rel: string) => isForgettable(rel, meta, core.forgetCfg) || isCompacted(meta, rel);
  await ensureIndexCache(fs, ws, skip);
  await runCompact(deps, fs, ws, cacheFor(ws));
};
