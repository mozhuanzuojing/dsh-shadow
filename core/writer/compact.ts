// dsh-shadow —— core/writer/compact.ts：Episode 收口（ADR-0038 正文 + 2026-09-30 补记）。
//
// 为什么单独一个文件：`materialize.ts` 是复杂度**热点（只能降）**，而收口这件事自带一段必须写下的根因说明。
// 迁出后 `materialize.ts` 只留两个调用点，热点随之下降。
//
// **触发点自 v1.21.42 起在写侧**（`maybeCompact`，由 `flush` 调用）。根因（2026-09-30 实测）：
//   `runCompact` 原先只在 `rebuildIndex` 里被调用 → `rebuildIndex` 只由 `ensureIndex` 调用 →
//   `ensureIndex` 只由**无参 `read_shadow`**（`query/index-budget.ts`）触发，而写路径明写「不在此处重建」。
//   ⇒ **只要没人无参读目录，文件就永不收敛**：本机 466 条原子、`hits>0` 113 条（主题召回走
//   `listMemories` 每次读盘、**不碰索引**）⇒ `_index.md` / `abstracts/` / `-consolidated.md` **三件一起缺**，
//   且**没有任何异常**。
// **判据**：文件爆炸**发生在写侧**，收敛也必须在写侧发生；索引（`_index.md` / abstracts）**仍保持懒构建**。
// 这不违反 ADR-0038 §6 的「方向 A 不做」：合并的仍是**已关闭**的 episode（时间间隔客观判定），
// 不引入「agent 自决任务边界」，Episode 依旧是派生。
//
// ⚠ **产物形态仍是「一个 episode 一个 consolidated 文件」（住在 `atoms/`）** —— `ADR-0110` §2.2 想把它改成
// 「同一件 Affaire 的同一张纪要加圈 + 落 `indexes/affaires/`」，但**那一步被实测挡下**（2026-09-30）：
//   旧形态里 consolidated **本身就是记忆**（在 `atoms/`、进缓存）⇒ `episode-lineage` 场景 7 钉着
//   「**收口后决策可召回**」；一旦把纪要挪进 `indexes/`（派生件、不进缓存），被收口的决策就**从召回面消失**。
//   ⇒ **③ 必须与「读侧入口（纪要可读可召回）」一起做**，不许只改写侧形态（那会削弱 ADR-0038 已有的保证）。
//   详见 `adr/0110` §5 与 `BACKLOG.md` V12③。
import { consolidateText } from "./render.js";
import { mutateMeta, readMeta } from "../../persistence/meta.js";
import { memoryFileName, timeFromName, dateFromName } from "../../persistence/files.js";
import { atomsRel } from "../paths.js";
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

/** 一个 episode 结束时把其原子合并成一个 consolidated 文件，个体原子 mark `compacted` 并移出活跃热集
 *  （**文件保留、可回放**；Forget≠Delete，ADR-0038）。 */
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
  // `mutateMeta` 的**新鲜快照**上应用。
  const marks: string[] = [];
  const dateOf = (rel: string) => dateFromName(String(rel).split("/").pop() || "") || today();
  for (const ep of eps.slice(0, -1)) {
    const atoms = (ep.memoryRefs || []).map((rel: string) => cache.get(rel)?.parsed).filter(Boolean);
    if (!atoms.length) continue;
    // 时间戳必须**从 `episode.startedAt` 同时产出「文件名里的」与「缓存里的」**（v1.15.38 修复）
    const stamp = String(ep.startedAt || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):?(\d{2}):?(\d{2})/);
    const rdate = stamp ? stamp[1] : dateOf((ep.memoryRefs || [])[0]);
    const rtime = stamp ? `${stamp[2]}${stamp[3]}${stamp[4]}` : "";
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
