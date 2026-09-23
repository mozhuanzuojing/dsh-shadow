// dsh-shadow —— core/candidate-sqlite.ts：SQLite 派生索引 provider（T17-B / D3 / D5 / D6 / D13 / D14）。
//
// 载体：`<ws>/.shadow/index.sqlite`（`adr/0095` Decision 1）。**它永远是派生件**：删掉它必须能仅凭
// `.shadow/*.md` 重建出等价索引（第一原则：**加速层不得新增真相、不得新增丢数据的路径**）。
//
// ── 四条硬纪律（每条都有实测/裁决依据，写在这里防后来者改坏）────────────────────────────────
// ① **D14 取模块**：动态 import + **计算型说明符**。`@types/node@20` 没有 `sqlite.d.ts` ⇒ 静态 import 会
//    TS2307；更严重的是宿主 Node < 22.5 时静态 import 会让**整个插件加载失败**（加速层把插件搞挂，
//    直接违法第一原则）。⇒ 本模块的公开签名里**不得出现 `DatabaseSync` 类型**（一律 `any` 持有句柄）。
// ② **D13 写入路径**：`fs.processPath` + `node:fs`。插件手里的 fs 服务**只能写文本**（`writeText`），
//    而 SQLite 要一个真实文件路径 ⇒ 这是全仓**唯一一处不走策略围栏的写**（用户 2026-09-16 裁决）。
//    三道守卫见 `provide` 开头；路径**一律**由 `resolve` 得到、由 `processPath` 产出，**不做字符串拼接**。
// ③ **D6 时序纪律**：**先取目录版本、再 `listDir` 该目录**，并把**先取到的那个版本**落库。
//    判据：只要「存下来的版本 == 现在读到的版本」⇒ 该目录此后**一定**没发生过增/删/改名（都会改目录版本）。
//    反过来（先 `listDir` 再取版本）会存下一个「比内容新」的版本 ⇒ 那个新增文件**永远进不了索引**。
//    这与 `persistence/meta.ts` 的「先 stat 取版本、再 readText」是同一条纪律。
// ④ **让出事件循环**：整体重建是 9–20 s 的**同步** `DatabaseSync` 写；每 ~200 条 `await setImmediate`
//    让一次，否则宿主事件循环被整段卡死（Web GUI 会假死）。
//
// ── 失败四态（D5；**error ≠ empty**）────────────────────────────────────────────────────
//   `unavailable`（模块缺失 / 拿不到宿主路径 / 只读 / 打不开）→ 回退 fs；**不删任何东西、不重建**。
//   `corrupt`（schema 不符 / 表缺失 / 反序列化失败）→ **把坏索引挪走**（`index.sqlite.corrupt-<ts>`），
//       本次回退 fs；**下一次**调用因「没有索引」而整体重建。重建时机只能在这里 —— 不能在同一次调用里
//       顺手做 9–20 s 的重建（那会把一次读变成一次长阻塞）。
//   `query-error`（查询抛错 / 锁）→ 回退 fs；**不重建**。
//   **合法 0 行 ⇒ `ok` + 空集**：是结果、不是错误，绝不回退、绝不报降级。
//
// ── 据实登记的剩余漏洞（必须写进 ADR 补记，不许写成「复用即可」）──────────────────────────
//   **外部进程**（另一个会话 / 子代理 / 手工编辑器）对一个**已存在**的记忆文件**原地改内容**时，
//   目录令牌看不见、写侧 dirty 也不知道 ⇒ 索引会陈旧，直到那个目录发生增/删/改名。
//   缓解句柄：`derivedIndex.verifySources: "full"`、删掉 `.shadow/index.sqlite`、或把 provider 设回 `fs`。
//
// ── 与 `fs` 路的一处**已知差异**（登记，不改行为）──────────────────────────────────────────
//   `fs` 路对**读不出的文件**是**静默跳过**（`persistence/files.ts` 的 `readRel` 有 `catch { return "" }`，
//   这是既有行为，本层不许改）⇒ 那条记忆这次不出现。而 `sqlite` 路返回的是**索引里那次读到的内容**
//   ⇒ 文件此刻读失败时，sqlite 路会返回**更多**（是「多」，不是漏召回）。
//   口径：既不新增丢数据的路径，也不把「读失败」当成「不存在」；两者都属既有 read 侧 swallow 的族
//   （`../.docs/fix/2026-09-16/INDEX.md` §3.5 已登记的同类）。写进 ADR 补记，不在 provider 层私自修补。
import { existsSync, renameSync, unlinkSync } from "node:fs";
import { isAbsolute } from "node:path";
import { readRel, timeFromName } from "../../persistence/files.js";
import { isMemoryFileName } from "../../persistence/files.js"; // 记忆文件判据的唯一实现（判据收一处）
import { parseMemory } from "../episode.js";
import { SHADOW_ROOT } from "../paths.js";
import { isNotFound } from "../util.js"; // 「读侧目标不存在」的唯一判据（判据收一处；不许再各写一份）
// 权威源目录的判据与投影指纹**同源**（判据收一处）：见 `shadowSourcesFingerprint` 的注释。
import { DATE_DIR_NAME, RESOURCES_DIR_NAME, isSourceDirEntry } from "../projection-store.js";
import type { CandidateProvider, CandidateSet, CandidateState, MemorySource } from "../types.js";

/** 索引器 / 表结构的令牌（`adr/0095` §五「必须做」）。不匹配 = `corrupt`（D5）；升级这里即触发整体重建。 */
export const INDEX_SCHEMA_VERSION = "1";

/** 变量说明符：`tsc` 不做模块解析（`@types/node` 太老），运行期才探测能力（D14）。 */
const SQLITE_SPEC = "node:sqlite";
const INDEX_FILE = "index.sqlite";
/** dirty rel 积压超过这个数 ⇒ 整批转「走全量细比对」（保守；集合必须有界，见 D6 门③）。 */
const DIRTY_FULL_SCAN_THRESHOLD = 500;
/** 整体重建时每多少条让出一次事件循环（纪律④）。 */
const REBUILD_YIELD_EVERY = 200;

/** DDL 列集合照 `t17a-sqlite.mts`（原型实测等价过的那一份）。**不建** `atom_fts`（D11）、**不建** `resource_card`（D2）。 */
const DDL = `
CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS source (
  rel TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER,
  version TEXT,
  shadow_root TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS atom (
  rel TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  entry TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  decisions_json TEXT NOT NULL DEFAULT '[]',
  decision_events_json TEXT NOT NULL DEFAULT '[]',
  user_messages_json TEXT NOT NULL DEFAULT '[]',
  materials_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL DEFAULT '[]',
  think_lines_json TEXT NOT NULL DEFAULT '[]',
  lineage_json TEXT NOT NULL DEFAULT '{}',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);`;

/**
 * 索引行 → `parseMemory` 的返回形状（照 `t17a-lib.mts` 的 `atomFromRow`，**字段逐个 JSON.parse**）。
 * **不重写任何派生判据**：候选仍由生产 `deriveShadowNodes` 从这些字段产出。
 * 抛错 = 索引坏了（D5 的「反序列化失败」⇒ `corrupt`）。
 */
export const atomFromRow = (row: any): any => {
  const decisions: string[] = JSON.parse(row.decisions_json || "[]");
  const materials: string[] = JSON.parse(row.materials_json || "[]");
  return {
    rel: row.rel,
    date: row.date,
    time: row.time,
    entry: row.entry,
    project: row.project,
    agent: row.agent,
    goal: row.goal,
    decisions,
    decisionEvents: JSON.parse(row.decision_events_json || "[]"),
    userMessages: JSON.parse(row.user_messages_json || "[]"),
    materials,
    actions: JSON.parse(row.actions_json || "[]"),
    thinkLines: JSON.parse(row.think_lines_json || "[]"),
    body: row.body,
    kind: row.kind,
    lineage: JSON.parse(row.lineage_json || "{}"),
  };
};

// ── 小工具 ─────────────────────────────────────────────────────────────────────
const msgOf = (e: any): string => (e && e.message ? String(e.message) : String(e));
const nowIso = (): string => new Date().toISOString();
const okSet = (sources: MemorySource[], atoms: any[]): CandidateSet => ({ provider: "sqlite", state: "ok", sources, atoms });
const failSet = (state: CandidateState, reason: string): CandidateSet =>
  ({ provider: "sqlite", state, unavailable: true, reason, sources: [], atoms: [] });

/** `.shadow/<date>/<file>.md` → `<date>`；取不到返回 `""`。 */
const dirOfRel = (rel: string): string => {
  const parts = String(rel).split("/");
  return parts.length >= 3 ? parts[parts.length - 2] : "";
};

/**
 * 门① 粗信号：一次 `listDir(.shadow)` 的目录令牌拼串。
 * **任何条目 `version` 缺失/不可判定 ⇒ 整条信号判为「不可判定」（`undefined`）**，调用方随即走
 * 全量文件级细比对 —— **不可判定 ≠ 没变**（保守；把不可判定当没变就是静默漏召回）。
 */
const coarseOf = (entries: any[]): string | undefined => {
  const parts: string[] = [];
  for (const e of entries || []) {
    if (!isSourceDirEntry(e)) continue; // 与投影指纹同一判据（日期目录 + resources）
    const v = e.version;
    if (typeof v !== "string" || !v) return undefined;
    parts.push(`${String(e.name)}:${v}`);
  }
  return parts.sort().join("|");
};

const coarseMap = (s: string | undefined): Map<string, string> => {
  const m = new Map<string, string>();
  for (const seg of String(s || "").split("|")) {
    const i = seg.indexOf(":");
    if (i > 0) m.set(seg.slice(0, i), seg.slice(i + 1));
  }
  return m;
};

/** 路径**必须**由 `resolve` 得到、由 `processPath` 产出（纪律②；不做字符串拼接）。 */
const processPathOf = async (fs: any, ws: string, name: string): Promise<string> => {
  const target = await fs.resolve(`${ws}/${SHADOW_ROOT}/${name}`, { cwd: ws });
  const p = fs.processPath(target);
  if (typeof p !== "string" || !p) throw new Error("processPath 返回空路径");
  return p;
};

/** 打开连接：每次调用 open→用→close（**不做模块级连接缓存** —— 那会跨实例泄漏）。 */
const openDb = (DatabaseSync: any, path: string): any => {
  const db = new DatabaseSync(path);
  try { db.exec("PRAGMA busy_timeout = 3000"); } catch { /* 老版本不支持该 PRAGMA 不算失败 */ }
  return db;
};
const closeQuietly = (db: any): void => { try { db?.close?.(); } catch { /* 关闭失败不改变结论 */ } };

const prepared = (db: any) => ({
  insSource: db.prepare("INSERT OR REPLACE INTO source(rel,date,name,size,version,shadow_root) VALUES(?,?,?,?,?,?)"),
  insAtom: db.prepare(
    `INSERT OR REPLACE INTO atom(rel,date,time,entry,project,agent,goal,kind,decisions_json,decision_events_json,
      user_messages_json,materials_json,actions_json,think_lines_json,lineage_json,body,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ),
  delRel: db.prepare("DELETE FROM atom WHERE rel=?"),
  delSourceRel: db.prepare("DELETE FROM source WHERE rel=?"),
  delByDateSource: db.prepare("DELETE FROM source WHERE date=?"),
  delByDateAtom: db.prepare("DELETE FROM atom WHERE date=?"),
  rowsByDate: db.prepare("SELECT rel,size,version FROM source WHERE date=?"),
  countByDate: db.prepare("SELECT COUNT(*) AS n FROM source WHERE date=?"),
  allDates: db.prepare("SELECT DISTINCT date FROM source"),
  allSources: db.prepare("SELECT rel,date,name FROM source ORDER BY rel"),
  allAtoms: db.prepare("SELECT * FROM atom ORDER BY rel"),
  metaGet: db.prepare("SELECT value FROM index_meta WHERE key=?"),
  metaSet: db.prepare("INSERT OR REPLACE INTO index_meta(key,value) VALUES(?,?)"),
});

const writeMeta = (st: any, key: string, value: string): void => { st.metaSet.run(key, value); };

/** 记忆文件判据与 `listMemories` **同判据**（`.md`、非 `_index.md`、非 `_` 前缀）—— 判据收一处：
 *  唯一实现在 `persistence/files.ts` 的 `isMemoryFileName`（两处各写一遍就会漂移，见它的注释）。 */
const enumDateDir = async (fs: any, ws: string, date: string): Promise<{ rel: string; name: string; size: number; version: string }[]> => {
  const files = (await fs.listDir(await fs.resolve(`${ws}/${SHADOW_ROOT}/${date}`, { cwd: ws }))) || [];
  const out: { rel: string; name: string; size: number; version: string }[] = [];
  for (const f of files) {
    const n = String(f?.name || "");
    if (!isMemoryFileName(n)) continue;
    out.push({ rel: `${SHADOW_ROOT}/${date}/${n}`, name: n, size: Number.isFinite(Number(f.size)) ? Number(f.size) : -1, version: String(f.version ?? "") });
  }
  return out;
};

const insParsed = (st: any, p: any, date: string, size: number, version: string): void => {
  st.insSource.run(p.rel, date, String(p.rel).split("/").pop() || "", size, version, SHADOW_ROOT);
  st.insAtom.run(
    p.rel, p.date, p.time, p.entry, p.project, p.agent, p.goal, p.kind,
    JSON.stringify(p.decisions ?? []), JSON.stringify(p.decisionEvents ?? []), JSON.stringify(p.userMessages ?? []),
    JSON.stringify(p.materials ?? []), JSON.stringify(p.actions ?? []), JSON.stringify(p.thinkLines ?? []),
    JSON.stringify(p.lineage ?? {}), p.body ?? "", p.lineage?.createdAt ?? "",
  );
};

/** 把坏索引**挪走**（而不是留在原地）⇒ 下一次调用走整体重建。挪不动就删；都失败则如实返回 false。 */
const markCorrupt = async (fs: any, ws: string, indexHost: string): Promise<boolean> => {
  try {
    const target = await processPathOf(fs, ws, `${INDEX_FILE}.corrupt-${Date.now()}`);
    renameSync(indexHost, target);
    return true;
  } catch {
    try { unlinkSync(indexHost); return true; } catch { return false; }
  }
};

/** 表/schema 健康：**显式**查表存在性（D5 的「表缺失」）+ 读 `index_meta.schema_version`。 */
const readSchema = (db: any): { schema?: string; bad: boolean; reason?: string } => {
  try {
    const names = new Set<string>(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() || []).map((r: any) => String(r.name)),
    );
    const missing = ["index_meta", "source", "atom"].filter((t) => !names.has(t));
    if (missing.length) return { bad: true, reason: `表缺失（${missing.join(",")}）` };
    const row = db.prepare("SELECT value FROM index_meta WHERE key='schema_version'").get();
    return { schema: row ? String(row.value) : undefined, bad: false };
  } catch (e) {
    return { bad: true, reason: msgOf(e) };
  }
};

/** 从索引取候选（**应用调用方的 `keep`**；D4：索引存全部，过滤留给读侧）。合法 0 行 ⇒ `ok` + 空集。 */
const querySet = (db: any, keep: (rel: string) => boolean): CandidateSet => {
  const st = prepared(db);
  const sources: MemorySource[] = [];
  const kept = new Set<string>();
  for (const r of st.allSources.all()) {
    const rel = String(r.rel);
    if (!keep(rel)) continue;
    kept.add(rel);
    sources.push({ date: String(r.date), name: String(r.name), rel, time: timeFromName(String(r.name)) });
  }
  if (!kept.size) return okSet([], []);
  const atoms: any[] = [];
  for (const row of st.allAtoms.all()) {
    if (!kept.has(String(row.rel))) continue;
    try { atoms.push(atomFromRow(row)); }
    catch (e) {
      const err: any = new Error(`索引行反序列化失败（${row.rel}）：${msgOf(e)}`);
      err.__corrupt = true;
      throw err;
    }
  }
  return okSet(sources, atoms);
};

/**
 * 目录级细比对（门②；同时承担门③ 的「dirty 之后必须核对所在目录」）。
 *
 * 对每个给定日期目录各做一次 `listDir`（**在取版本之后**，纪律③），逐文件 `name:size:version` 与
 * `source` 表比 ⇒ 事务内逐条 upsert / delete；`forceRels` 里的 rel **无条件** upsert（门③ 的权威信号：
 * 即使后端不报 `version` 也能兜住原地改内容）。
 *
 * 返回 `true` = 「增量结果与目录实数不符」⇒ 调用方**必须整体重建**（D5 的 soundness 网）。
 */
const syncDirs = async (
  db: any, fs: any, ws: string, dirs: string[], forceRels: string[], full: boolean, removedDirs: string[] = [],
): Promise<boolean> => {
  const st = prepared(db);
  db.exec("BEGIN");
  try {
    if (full) {
      // 全量比对还要处理「整个日期目录消失」
      for (const r of st.allDates.all()) {
        const d = String(r.date);
        if (!dirs.includes(d)) { st.delByDateSource.run(d); st.delByDateAtom.run(d); }
      }
    }
    for (const d of removedDirs) { st.delByDateSource.run(d); st.delByDateAtom.run(d); }
    // `forceRels` 按目录分桶（门③ 的权威信号）：避免「每个目录 × 全量 dirty」的二次扫描。
    const forceByDir = new Map<string, Set<string>>();
    for (const r of forceRels) {
      const d = dirOfRel(r);
      if (!forceByDir.has(d)) forceByDir.set(d, new Set());
      forceByDir.get(d)!.add(r);
    }
    for (const dir of dirs) {
      const files = await enumDateDir(fs, ws, dir);
      const byRel = new Set(files.map((f) => f.rel));
      const force = forceByDir.get(dir) || new Set<string>();
      // **一次 O(n) 建索引**（日期目录最大 2,410 条，实测）：早先写成 `rows.find(...)` 是每文件一次线性查找
      // ⇒ 单目录 O(n²)，会把「细比对只值一次 listDir」这笔收益吃掉。
      const prevByRel = new Map<string, { size: number; version: string }>();
      for (const r of st.rowsByDate.all(dir)) {
        prevByRel.set(String(r.rel), { size: Number(r.size), version: String(r.version ?? "") });
      }
      for (const f of files) {
        const prev = prevByRel.get(f.rel);
        // 文件级 `version` 是 sound 的（等长重写也变）⇒ 它变了就必须重读
        const same = prev && prev.size === f.size && prev.version === f.version && !force.has(f.rel);
        if (same) continue;
        const text = await readRel(fs, ws, f.rel);
        if (!text) { st.delRel.run(f.rel); st.delSourceRel.run(f.rel); continue; }
        try { insParsed(st, parseMemory(text, f.rel, f.name), dir, f.size, f.version); }
        catch { st.delRel.run(f.rel); st.delSourceRel.run(f.rel); }
      }
      for (const rel of prevByRel.keys()) if (!byRel.has(rel)) { st.delRel.run(rel); st.delSourceRel.run(rel); }
      // soundness 网：目录实数必须与索引行数一致，否则整体重建
      const cnt = st.countByDate.get(dir);
      if (Number(cnt?.n ?? -1) !== files.length) { db.exec("ROLLBACK"); return true; }
    }
    // `forceRels` 里所在目录**不在本次比对范围**的（例如刚出现的新目录）：也要单条 upsert（权威信号）
    for (const rel of forceRels) {
      if (dirs.includes(dirOfRel(rel))) continue;
      const text = await readRel(fs, ws, rel);
      if (!text) { st.delRel.run(rel); st.delSourceRel.run(rel); continue; }
      try { insParsed(st, parseMemory(text, rel, String(rel).split("/").pop() || ""), dirOfRel(rel), -1, ""); }
      catch { st.delRel.run(rel); st.delSourceRel.run(rel); }
    }
    db.exec("COMMIT");
    return false;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* 回滚失败不掩盖原始错误 */ }
    throw e;
  }
};

export interface SqliteProviderOpts {
  /**
   * 能力探测的**注入点**（多实例隔离：参数传入，不做模块级可变单例）。
   * 默认实现才 `await import(SQLITE_SPEC).catch(() => undefined)`；
   * 测试用 `load: async () => undefined` 造 `unavailable`（真 `node:sqlite` 在本机可用，造不出「模块缺失」）。
   */
  load?: () => Promise<any>;
}

/**
 * `sqlite` 候选 provider。
 *
 * **无实例状态、无模块状态**：跨调用唯一携带的信息全部落在**产物**上（索引文件的 schema 版本、
 * 粗信号、以及「坏索引被挪走」这个事实）⇒ 每次 `createCandidateProvider` 新建实例也不会丢语义。
 */
export const createSqliteCandidateProvider = (opts?: SqliteProviderOpts): CandidateProvider => {
  const load = opts?.load ?? (async () => await import(SQLITE_SPEC).catch(() => undefined));

  return {
    id: "sqlite",
    async provide(fs: any, ws: string, cfg: any, keep: (rel: string) => boolean, callOpts?: { writable?: boolean; dirtyRels?: Iterable<string> }): Promise<CandidateSet> {
      const writable = callOpts?.writable !== false; // 缺省按可写（策略取不到时 scopedFs 本就是恒等变换，无围栏可绕）

      // ── 守卫① 宿主绝对路径（D13）：processPath 不存在 / 抛错 / 非绝对 ⇒ unavailable ──
      if (typeof fs?.processPath !== "function") {
        return failSet("unavailable", "拿不到宿主绝对路径：fs.processPath 不可用（非本地后端）");
      }
      let indexHost: string;
      try { indexHost = await processPathOf(fs, ws, INDEX_FILE); }
      catch (e) { return failSet("unavailable", `拿不到宿主绝对路径：${msgOf(e)}`); }
      if (!isAbsolute(indexHost)) return failSet("unavailable", `拿不到宿主绝对路径：processPath 返回的不是绝对路径（${indexHost}）`);

      // ── 守卫② 只读会话（D13）：不写、直接 unavailable；**不删任何东西** ──
      if (!writable) return failSet("unavailable", "会话策略只读（read-only）⇒ 派生索引不落盘");

      // ── 模块（D14）──
      let mod: any;
      try { mod = await load(); } catch { mod = undefined; }
      const DatabaseSync = mod?.DatabaseSync;
      if (typeof DatabaseSync !== "function") {
        return failSet("unavailable", "node:sqlite 不可用（宿主 Node < 22.5：无 DatabaseSync）");
      }

      const dirty = [...new Set<string>((callOpts?.dirtyRels ? [...callOpts.dirtyRels] : []).map(String))];

      // ── 门① 先取目录版本（纪律③）──
      let rootEntries: any[];
      try {
        rootEntries = (await fs.listDir(await fs.resolve(`${ws}/${SHADOW_ROOT}`, { cwd: ws }))) || [];
      } catch (e) {
        // `.shadow` 不存在 ⇒ 没有记忆 ⇒ **合法空集**（不写盘、不重建、不降级）
        if (isNotFound(e)) return okSet([], []);
        return failSet("unavailable", `读不到 .shadow 目录：${msgOf(e)}`);
      }
      const coarseNow = coarseOf(rootEntries);
      const dateDirs = (rootEntries || [])
        .filter(isSourceDirEntry)
        .map((e) => String(e.name))
        .filter((n) => DATE_DIR_NAME.test(n)); // `resources` 只进粗信号、不进 `source` 表（D2）

      const rebuildAndQuery = async (): Promise<CandidateSet> => {
        let tmpHost: string;
        try { tmpHost = await processPathOf(fs, ws, `${INDEX_FILE}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`); }
        catch (e) { return failSet("unavailable", `拿不到宿主绝对路径（tmp）：${msgOf(e)}`); }
        let wdb: any;
        try {
          if (existsSync(tmpHost)) unlinkSync(tmpHost); // 上次崩在中途留下的残件
          wdb = openDb(DatabaseSync, tmpHost);
          wdb.exec(DDL);
          const st = prepared(wdb);
          wdb.exec("BEGIN");
          let n = 0;
          // 整体重建也遵守纪律③：`coarseNow` 是本函数调用**之前**取的版本快照，落库的就是它。
          for (const dir of dateDirs) {
            for (const f of await enumDateDir(fs, ws, dir)) {
              const text = await readRel(fs, ws, f.rel);
              if (!text) continue;
              let p: any;
              try { p = parseMemory(text, f.rel, f.name); } catch { continue; } // 单条解析失败跳过（与读侧同）
              insParsed(st, p, dir, f.size, f.version);
              n += 1;
              // 纪律④：DatabaseSync 是同步的，每 ~200 条让出一次事件循环，否则宿主整段卡死
              if (n % REBUILD_YIELD_EVERY === 0) await new Promise((r) => setImmediate(r));
            }
          }
          writeMeta(st, "schema_version", INDEX_SCHEMA_VERSION);
          if (coarseNow !== undefined) writeMeta(st, "coarse_signal", coarseNow);
          writeMeta(st, "source_count", String(n));
          writeMeta(st, "last_rebuild_at", nowIso());
          wdb.exec("COMMIT");
          wdb.close();
          // **原子发布**：`renameSync` 替换（不是 `copyFileSync` —— 那不是原子发布）
          renameSync(tmpHost, indexHost);
        } catch (e) {
          closeQuietly(wdb);
          try { if (existsSync(tmpHost)) unlinkSync(tmpHost); } catch { /* 残件清理失败不影响结论 */ }
          return failSet("unavailable", `派生索引整体重建失败：${msgOf(e)}`);
        }
        let rdb: any;
        try {
          rdb = openDb(DatabaseSync, indexHost);
          return querySet(rdb, keep);
        } catch (e: any) {
          // 反序列化失败在 D5 里属 `corrupt`（可重建），不许被归成 `query-error`（那只回退本次）
          if (e?.__corrupt) {
            closeQuietly(rdb);
            const moved = await markCorrupt(fs, ws, indexHost);
            return failSet("corrupt", `${msgOf(e)}⇒ 本次回退 fs${moved ? "；坏件已挪走，下次读整体重建" : "（坏件挪走失败）"}`);
          }
          return failSet("query-error", `重建后查询索引失败：${msgOf(e)}`);
        } finally { closeQuietly(rdb); }
      };

      // ── 打开 / 校验（打不开或 schema 不符 ⇒ corrupt + 把坏件挪走；**本次不重建**）──
      let db: any;
      if (!existsSync(indexHost)) return await rebuildAndQuery(); // 「没有索引」= 重建的唯一时机之一
      try {
        db = openDb(DatabaseSync, indexHost);
      } catch (e) {
        const moved = await markCorrupt(fs, ws, indexHost);
        return failSet("corrupt", `索引打不开（${msgOf(e)}）⇒ 本次回退 fs${moved ? "；坏件已挪走，下次读整体重建" : "（坏件挪走失败）"}`);
      }
      const st = readSchema(db);
      if (st.bad) {
        closeQuietly(db);
        const moved = await markCorrupt(fs, ws, indexHost);
        return failSet("corrupt", `索引元数据不可读/表缺失（${st.reason}）⇒ 本次回退 fs${moved ? "；坏件已挪走，下次读整体重建" : "（坏件挪走失败）"}`);
      }
      if (st.schema !== INDEX_SCHEMA_VERSION) {
        closeQuietly(db); // Windows 上必须先关句柄才能改名
        const moved = await markCorrupt(fs, ws, indexHost);
        return failSet("corrupt", `schema 版本不符（索引=${st.schema ?? "缺失"}，期望=${INDEX_SCHEMA_VERSION}）⇒ 本次回退 fs${moved ? "；旧索引已挪走，下次读整体重建" : "（旧索引挪走失败）"}`);
      }

      // ── 新鲜度：门①（粗信号）→ 门②（变化目录细比对）→ 门③（写侧 dirty）──
      try {
        const mode = cfg?.derivedIndex?.verifySources === "full" ? "full" : "coarse";
        const stx = prepared(db);
        const storedCoarse = (() => { const r = stx.metaGet.get("coarse_signal"); return r ? String(r.value) : undefined; })();
        // 全量细比对的三条触发：显式 full / 粗信号不可判定 / dirty 积压过大（有界性）
        const needFull = mode === "full" || coarseNow === undefined || dirty.length > DIRTY_FULL_SCAN_THRESHOLD;
        let mismatch = false;
        if (needFull) {
          mismatch = await syncDirs(db, fs, ws, dateDirs, dirty, true);
        } else {
          const before = coarseMap(storedCoarse);
          const now = coarseMap(coarseNow);
          // `resources` 只进粗信号、不进 `source` 表（D2：本层不接管资源卡）⇒ 它的令牌变化只更新信号
          const changed = [...now.keys()].filter((n) => n !== RESOURCES_DIR_NAME && before.get(n) !== now.get(n));
          const removed = [...before.keys()].filter((n) => n !== RESOURCES_DIR_NAME && !now.has(n));
          if (changed.length || removed.length) mismatch = await syncDirs(db, fs, ws, changed, dirty, false, removed);
          // 门③：dirty 的 rel **不能只更新那一行** —— 还要对它所在目录做一次 listDir + 比对，
          // 这样同时兜住「同一窗口里别的进程也写了同一目录」（并且不依赖后端是否报 version）。
          if (!mismatch && dirty.length) {
            const recheck = [...new Set(dirty.map(dirOfRel))].filter((d) => d && dateDirs.includes(d));
            if (recheck.length) mismatch = await syncDirs(db, fs, ws, recheck, dirty, false);
          }
        }
        if (mismatch) { closeQuietly(db); return await rebuildAndQuery(); }
        // **把先取到的那个版本落库**（纪律③：存下的版本必须不新于内容）
        if (coarseNow !== undefined) writeMeta(stx, "coarse_signal", coarseNow);
        writeMeta(stx, "last_source_scan", nowIso());
        return querySet(db, keep);
      } catch (e: any) {
        if (e?.__corrupt) {
          closeQuietly(db);
          const moved = await markCorrupt(fs, ws, indexHost);
          return failSet("corrupt", `${msgOf(e)}⇒ 本次回退 fs${moved ? "；坏件已挪走，下次读整体重建" : "（坏件挪走失败）"}`);
        }
        return failSet("query-error", `派生索引查询失败：${msgOf(e)}`);
      } finally {
        closeQuietly(db);
      }
    },
  };
};
