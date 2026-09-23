// dsh-shadow —— T17-B 派生索引回归锁（`adr/0095` 一期 / `DESIGN.md` D1–D14）。
//
// 本文件只测**新边界**（`core/candidate-provider.ts` / `core/candidate-sqlite.ts` / `query/materialize.ts`
// 的四态与新鲜度），既有读侧测试**一字未改**即是另一半证据。
//
// 三条纪律（写在这里，免得后来者把测试写松）：
//   · **严格桩**：桩对不存在的路径**抛** `FS_NOT_FOUND`（不返回 `""`），照 `test/t8-silent-degradation.test.ts`
//     的 `strict` 写法 —— 宽松桩会让「两条路径从未在真实语义下跑过」（`adr/0085` §7 的教训）。
//   · **桩必须能表达真实边界**：目录级 `version` **只在增/删/改名时变，原地改内容不变**
//     （`fs-cost-findings.md` Q5 实测）。桩若表达不出这条，本文件测的是桩而不是系统。
//   · **sqlite 落盘用真实临时目录**（`os.tmpdir()` + `mkdtempSync`）+ 手写 fs 门面 —— **不 import 宿主包**
//     `@deepseek-ai/dsh-fs-local`（它不在本仓 `node_modules` 里，靠 pnpm dlx 绝对路径 = 机器相关依赖）。
//   · `node:sqlite` 一律用**计算型说明符**动态 import（本仓 `@types/node@20` 没有 `sqlite.d.ts`，静态 import 会 TS2307）。
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { createCandidateProvider } from "../dist/core/candidate/provider.js";
import { createSqliteCandidateProvider, INDEX_SCHEMA_VERSION } from "../dist/core/candidate/sqlite.js";
import { deriveShadowNodes } from "../dist/core/node.js";
import { createShadowCollector } from "../dist/core/writer/index.js";
import { materializeAtoms } from "../dist/query/materialize.js";
import { runReadShadow } from "../dist/query/query.js";

const SQLITE_SPEC: string = "node:sqlite"; // 计算型说明符（见文件头）
const sqliteMod: any = await import(SQLITE_SPEC);

const TMP: string[] = [];
const mkRoot = (): string => { const r = mkdtempSync(join(tmpdir(), "dsh-derived-index-")); TMP.push(r); return r; };
const dayStr = (offset: number): string => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
const memName = (date: string, time: string, slug: string): string => `${date}--${time}-${slug}.md`;
const metaPath = (root: string) => join(root, ".shadow", "_meta.json");
const indexPath = (root: string) => join(root, ".shadow", "index.sqlite");

const NOT_FOUND = (p: string) => Object.assign(new Error(`cannot read "${p}": not found`), { code: "FS_NOT_FOUND" });

/** 文件级版本：**等长重写也会变**（sound）—— 抽象自 `dsh-fs-local` 的 `dev:ino:size:mtimeNs:ctimeNs`。 */
const fileVersion = (p: string): string => { const st = statSync(p); return `${st.size}:${st.mtimeMs}`; };
/** 目录级版本：**只在增/删/改名时变**，原地改内容不变（Q5 实测边界）。 */
const dirVersion = (p: string): string => `dir:${readdirSync(p).sort().join(",")}`;

/**
 * 严格 fs 门面（`resolve` / `listDir` / `readText` / `stat` / `processPath`），底下是**真实临时目录**。
 * `opts.processPath === false` ⇒ 整个方法不存在（用来测 D13 守卫①「拿不到宿主路径」）。
 */
const makeStrictFs = (root: string, opts: { processPath?: boolean } = {}) => {
  const counters = { listDir: 0, readText: 0, readPaths: [] as string[] };
  const host = (spec: string) => pathResolve(String(spec));
  const f: any = {
    counters,
    async resolve(spec: string) { return { displayPath: host(spec), targetKey: host(spec) }; },
    async readText(t: any) {
      counters.readText += 1;
      const p = t?.displayPath ?? t?.targetKey;
      counters.readPaths.push(String(p));
      // **严格桩**：不存在 ⇒ 抛 FS_NOT_FOUND（**不返回 ""**）
      if (!p || !existsSync(p) || !statSync(p).isFile()) throw NOT_FOUND(String(p));
      return readFileSync(p, "utf8");
    },
    async listDir(t: any) {
      counters.listDir += 1;
      const p = t?.displayPath ?? t?.targetKey;
      if (!p || !existsSync(p) || !statSync(p).isDirectory()) throw NOT_FOUND(String(p));
      return readdirSync(p).map((name) => {
        const child = join(p, name);
        const isDir = statSync(child).isDirectory();
        const e: any = {
          name,
          type: isDir ? "directory" : "file",
          target: { displayPath: child, targetKey: child },
          version: isDir ? dirVersion(child) : fileVersion(child),
        };
        if (!isDir) e.size = statSync(child).size;
        return e;
      });
    },
    async stat(t: any) {
      const p = t?.displayPath ?? t?.targetKey;
      if (!p || !existsSync(p)) return undefined;
      const st = statSync(p);
      const isDir = st.isDirectory();
      return { version: isDir ? dirVersion(p) : fileVersion(p), type: isDir ? "directory" : "file", size: isDir ? 0 : st.size };
    },
    async writeText(t: any, c: string) {
      const p = t?.displayPath ?? t?.targetKey;
      writeFileSync(p, c, "utf8");
      return { operation: "update", version: fileVersion(p), before: null, after: c };
    },
  };
  if (opts.processPath !== false) f.processPath = (t: any) => t?.displayPath ?? t?.targetKey;
  return f;
};

const put = (root: string, date: string, name: string, text: string) => {
  mkdirSync(join(root, ".shadow", date), { recursive: true });
  writeFileSync(join(root, ".shadow", date, name), text, "utf8");
};

const memoryText = (entry: string) =>
  `# ${entry}\n\n> 项目：dsh1\n> Agent：a1\n> 目标：把 ${entry} 做出来\n> 背景/材料：spec/a.md、spec/b.md\n\n` +
  `- [10:00:00] [${entry}] 用户：请记住 ${entry}\n- [10:01:00] [${entry}] 决定 采用 ${entry} 方案\n- [10:02:00] [${entry}] 改/读 src/${entry}.ts\n`;

const cfgFs = { derivedIndex: { provider: "fs" } };
const cfgSql = { derivedIndex: { provider: "sqlite" } };
const cfgSqlFull = { derivedIndex: { provider: "sqlite", verifySources: "full" } };

const sortedRel = (v: any[]) => [...v].sort((a, b) => String(a.rel).localeCompare(String(b.rel)));
const relsOf = (v: any) => v.memories.map((m: any) => m.rel).sort();
const entryOf = (v: any, rel: string) => ((v.parsed.find((p: any) => p.rel === rel) || {}) as any).entry;

/** 与 provider **逐字同格式**的粗信号（自检用；见下面「测试侧格式必须与落库值相同」的断言）。 */
const coarseStringOf = async (fs: any, root: string): Promise<string> => {
  const es = (await fs.listDir(await fs.resolve(join(root, ".shadow")))) || [];
  return es
    .filter((e: any) => e.type === "directory" && (/^\d{4}-\d{2}-\d{2}$/.test(e.name) || e.name === "resources"))
    .map((e: any) => `${e.name}:${e.version}`)
    .sort()
    .join("|");
};
const readMetaValue = (root: string, key: string): string | undefined => {
  const db = new sqliteMod.DatabaseSync(indexPath(root));
  const row = db.prepare("SELECT value FROM index_meta WHERE key=?").get(key);
  db.close();
  return row ? String(row.value) : undefined;
};
const writeCoarse = (root: string, value: string) => {
  const db = new sqliteMod.DatabaseSync(indexPath(root));
  db.prepare("INSERT OR REPLACE INTO index_meta(key,value) VALUES('coarse_signal',?)").run(value);
  db.close();
};

/**
 * 语料：两个日期目录 + 一个 `_index.md`（派生件，不算记忆）+ 一张资源卡（本层**不读**，D2）
 * + `_meta.json` 夹具（`compacted` / `archived` —— D9 要求：本工作区这两态从未触发，只能用夹具）。
 * 日期取「今天/昨天」⇒ 与 `ageDaysOf` 的 staleDays 无关（不让日期漂移把语料判成「旧」）。
 */
const D1 = dayStr(1);
const D2 = dayStr(0);
const A_COMPACTED = memName(D1, "100000", "alpha");
const A_ACTIVE1 = memName(D1, "100100", "beta");
const A_ACTIVE2 = memName(D1, "100200", "epsilon");
const B_ARCHIVED = memName(D2, "090000", "gamma");
const B_ACTIVE = memName(D2, "090100", "delta");
const mkCorpus = (): string => {
  const root = mkRoot();
  put(root, D1, A_COMPACTED, memoryText("alpha"));
  put(root, D1, A_ACTIVE1, memoryText("beta"));
  put(root, D1, A_ACTIVE2, memoryText("epsilon"));
  put(root, D2, B_ARCHIVED, memoryText("gamma"));
  put(root, D2, B_ACTIVE, memoryText("delta"));
  put(root, D2, "_index.md", "# index（派生件，不算记忆）\n");
  put(root, "resources", "card.md", "# 资源卡（本层不读，D2）\n");
  writeFileSync(metaPath(root), JSON.stringify({
    [`.shadow/${D1}/${A_COMPACTED}`]: { hits: 0, status: "compacted", pinned: false },
    [`.shadow/${D2}/${B_ARCHIVED}`]: { hits: 0, status: "archived", pinned: false },
  }), "utf8");
  return root;
};

// ─────────────────────────────────────────────────────────────
// ⓪ 桩自身的严格性（先证工具，再谈结论 —— `adr/0085` §7）
// ─────────────────────────────────────────────────────────────
{
  const fs = makeStrictFs(mkRoot());
  const missing = join(tmpdir(), "dsh-derived-index-绝对不存在");
  await assert.rejects(() => fs.readText({ displayPath: missing }), (e: any) => e.code === "FS_NOT_FOUND",
    "严格桩：读不存在的路径必须抛 FS_NOT_FOUND（**不许**返回空串 —— 那会让「读失败」与「空文件」不可分）");
  await assert.rejects(() => fs.listDir({ displayPath: missing }), (e: any) => e.code === "FS_NOT_FOUND",
    "严格桩：listDir 不存在的目录必须抛 FS_NOT_FOUND");
  console.log("✔ ⓪ 严格桩自检：readText / listDir 对不存在路径抛 FS_NOT_FOUND（不返回空串）");
}

// ─────────────────────────────────────────────────────────────
// ① 等价性：同一份语料，provider:"fs" 与 provider:"sqlite" 两路 `parsed` 逐字段深相等
// ─────────────────────────────────────────────────────────────
let baseline: any; // 供后续组复用（fs 路输出）
{
  const root = mkCorpus();
  const fs = makeStrictFs(root);
  const a = await materializeAtoms(fs, root, cfgFs);
  baseline = a;
  // keep 真的在起作用（D9 夹具：compacted / archived 必须被丢掉）
  assert.ok(!relsOf(a).includes(`.shadow/${D1}/${A_COMPACTED}`), "`compacted` 夹具必须被 keep 丢掉（判据只有一份实现）");
  assert.ok(!relsOf(a).includes(`.shadow/${D2}/${B_ARCHIVED}`), "`archived` 夹具必须被 keep 丢掉");
  assert.ok(a.memories.length >= 2, `未归档/未收口的记忆必须留下；实际 ${JSON.stringify(relsOf(a))}`);

  const readBefore = fs.counters.readText;
  const b = await materializeAtoms(fs, root, cfgSql); // 首次 sqlite ⇒ 整体重建
  assert.ok(existsSync(indexPath(root)), "sqlite 路必须在真实临时目录里**真的建出** `index.sqlite`");
  assert.deepEqual(sortedRel(b.parsed), sortedRel(a.parsed), "两路 `parsed` 必须逐字段深相等");
  assert.deepEqual(relsOf(b), relsOf(a), "两路 `memories` 必须相同（顺序不计）");
  assert.deepEqual(
    deriveShadowNodes(b.parsed).map((n: any) => n.id).sort(),
    deriveShadowNodes(a.parsed).map((n: any) => n.id).sort(),
    "两路走同一个 `deriveShadowNodes` ⇒ 节点 id 集合必须相同",
  );
  assert.ok(fs.counters.readText - readBefore > 0, "建索引时必须真的读过文件（否则这条等价是空的）");

  // 漏斗：稳态索引路**不读任何记忆文件**（只读权威 `_meta.json`）
  const readBefore2 = fs.counters.readText;
  const c = await materializeAtoms(fs, root, cfgSql);
  assert.equal(fs.counters.readText - readBefore2, 1, "稳态索引路只读一次 `_meta.json` ⇒ **files read = 0**（记忆文件一个都不读）");
  assert.deepEqual(sortedRel(c.parsed), sortedRel(a.parsed), "第二次索引读仍必须与 fs 路等价");
  // D2：本层**不读资源卡**（`.shadow/resources/*.md` 仍由 query/reads.ts 原样调用）
  assert.ok(!fs.counters.readPaths.some((p) => p.includes("resources")), "派生索引 provider **不得**读资源卡（D2）");

  // **探针自证**（`adr/0085` §7：断言通过只证明「我没测到」）——把 fs 路结果人为破坏，上面那条深相等必须变红。
  const dropped = JSON.parse(JSON.stringify(sortedRel(a.parsed)));
  dropped.pop();
  assert.notDeepEqual(sortedRel(b.parsed), dropped, "少一条 ⇒ 等价判据必须红（否则它测不出「静默少结果」）");
  const mutated = JSON.parse(JSON.stringify(sortedRel(a.parsed)));
  mutated[0].kind = mutated[0].kind === "metadata" ? "experience" : "metadata";
  assert.notDeepEqual(sortedRel(b.parsed), mutated, "改一个字段 ⇒ 等价判据必须红（否则「逐字段深相等」是空话）");
  const relMutated = JSON.parse(JSON.stringify(relsOf(a)));
  relMutated[0] = `${relMutated[0]}-ghost`;
  assert.notDeepEqual(relsOf(b), relMutated, "来源清单少/多一条 ⇒ 判据必须红");
  console.log(`✔ ① 等价性：parsed 逐字段深相等 · memories 相同 · 节点 id 集合相同 · 稳态 files read = 0 · 资源卡未被本层读（kept=${a.memories.length}）`);
  console.log("✔ ①b 探针自证：人为少一条 / 改一字段 / 改一个 rel ⇒ 上述三条判据各自变红（它们能测出差异）");
}

// ─────────────────────────────────────────────────────────────
// ② 四态（D5）：unavailable / corrupt / query-error / **合法 0 行**
// ─────────────────────────────────────────────────────────────
{
  // (a) unavailable —— 桩不给 `processPath`（D13 守卫①）
  const root = mkCorpus();
  const fs = makeStrictFs(root, { processPath: false });
  const notes: any[] = [];
  const fsOut = await materializeAtoms(fs, root, cfgFs);
  const out = await materializeAtoms(fs, root, cfgSql, { note: (...a: any[]) => notes.push(a) });
  assert.equal(notes.length, 1, `降级必须**恰好**留一条痕；实际 ${notes.length}`);
  assert.equal(notes[0][0], "derivedIndex", "横幅的 capability 必须是 derivedIndex（同一台账、同一渲染）");
  assert.match(String(notes[0][1]), /processPath/, `横幅必须带**真实 reason**；实际 ${JSON.stringify(notes[0])}`);
  assert.deepEqual(sortedRel(out.parsed), sortedRel(fsOut.parsed), "回退 fs 后结果必须不变");
  assert.ok(!existsSync(indexPath(root)), "unavailable **不得**写盘（不落索引）");
  console.log("✔ ②a unavailable（拿不到宿主路径）：note 恰一次 + 带真实 reason + 回退 fs 结果不变 + 不写盘");
}
{
  // (b) unavailable —— 模块不可用（注入点：load: async () => undefined）
  const root = mkCorpus();
  const fs = makeStrictFs(root);
  await materializeAtoms(fs, root, cfgSql); // 先建出索引，用来验「不得删任何东西」
  const idx = indexPath(root);
  const before = { mtime: statSync(idx).mtimeMs, size: statSync(idx).size };
  const p = createSqliteCandidateProvider({ load: async () => undefined });
  const cs = await p.provide(fs, root, cfgSql, () => true, { writable: true });
  assert.equal(cs.state, "unavailable", "模块缺失 ⇒ unavailable");
  assert.equal(cs.unavailable, true, "`unavailable` 是 `state !== \"ok\"` 的语法糖");
  assert.match(String(cs.reason), /node:sqlite/, `reason 必须点明载体缺失；实际 ${cs.reason}`);
  assert.ok(existsSync(idx) && statSync(idx).size === before.size && statSync(idx).mtimeMs === before.mtime,
    "unavailable **不得删/改任何东西**（它只是本次回退）");
  // (b2) 守卫②：会话只读 ⇒ 不写、unavailable（同一条路径不得删东西）
  const cs2 = await createSqliteCandidateProvider().provide(fs, root, cfgSql, () => true, { writable: false });
  assert.equal(cs2.state, "unavailable");
  assert.match(String(cs2.reason), /只读/, `reason 必须写清「会话策略只读」；实际 ${cs2.reason}`);
  assert.ok(existsSync(idx), "只读会话 **不得**删任何东西");
  console.log("✔ ②b unavailable（模块缺失 / 会话只读）：note 语义正确、索引文件一字未动、不得触发重建");
}
{
  // (c) corrupt —— schema 版本不符 ⇒ 本次回退 + **坏件挪走**；**下一次**读整体重建
  const root = mkCorpus();
  const fs = makeStrictFs(root);
  await materializeAtoms(fs, root, cfgSql);
  const db = new sqliteMod.DatabaseSync(indexPath(root));
  db.prepare("INSERT OR REPLACE INTO index_meta(key,value) VALUES('schema_version','bogus-0')").run();
  db.close();
  const notes: any[] = [];
  const out = await materializeAtoms(fs, root, cfgSql, { note: (...a: any[]) => notes.push(a) });
  assert.equal(notes.length, 1, "corrupt 必须留痕（能力级信号，会一次次重复付费）");
  assert.match(String(notes[0][1]), /schema/, `reason 必须点明 schema 版本不符；实际 ${JSON.stringify(notes[0])}`);
  assert.deepEqual(sortedRel(out.parsed), sortedRel(baseline.parsed), "corrupt 本次回退 fs ⇒ 结果不变");
  assert.equal(existsSync(indexPath(root)), false, "corrupt 必须把坏索引**挪走**（留在原地 = 每次都坏、每次都重建失败）");
  assert.ok(readdirSync(join(root, ".shadow")).some((n) => n.startsWith("index.sqlite.corrupt-")), "坏件应被改名留档（不是静默删掉）");

  const notes2: any[] = [];
  const out2 = await materializeAtoms(fs, root, cfgSql, { note: (...a: any[]) => notes2.push(a) });
  assert.equal(notes2.length, 0, "corrupt 之后的**下一次**读必须整体重建并回到 ok（不得再留痕）");
  assert.ok(existsSync(indexPath(root)), "整体重建必须重新产出索引");
  assert.equal(readMetaValue(root, "schema_version"), INDEX_SCHEMA_VERSION, "重建后 schema 版本必须是当前版本");
  assert.deepEqual(sortedRel(out2.parsed), sortedRel(baseline.parsed), "重建后的结果仍必须与 fs 路等价");
  console.log("✔ ②c corrupt（schema 不符）：本次回退 fs + 坏件挪走 + 下次整体重建 ⇒ 回到 ok / 零留痕");
}
{
  // (d) query-error —— 查询抛错 ⇒ 回退 fs，**不得重建、不得删**
  const root = mkCorpus();
  const fs = makeStrictFs(root);
  await materializeAtoms(fs, root, cfgSql);
  const idx = indexPath(root);
  // 判据必须看「**有没有被重建/删掉**」，不能看 mtime —— 正常路径本来就会更新 `last_source_scan` 元数据。
  const before = { schema: readMetaValue(root, "schema_version"), rebuildAt: readMetaValue(root, "last_rebuild_at"), count: readMetaValue(root, "source_count") };
  const brokenLoad = async () => ({
    DatabaseSync: class extends sqliteMod.DatabaseSync {
      prepare(sql: string) {
        if (/FROM atom/i.test(sql)) {
          return { all() { throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" }); }, get() { throw new Error("locked"); }, run() { throw new Error("locked"); } };
        }
        return super.prepare(sql);
      }
    },
  });
  const p = createSqliteCandidateProvider({ load: brokenLoad });
  const cs = await p.provide(fs, root, cfgSql, () => true, { writable: true });
  assert.equal(cs.state, "query-error", "查询抛错 ⇒ query-error（**不得**与 corrupt 合并）");
  assert.match(String(cs.reason), /locked|SQLITE_BUSY/, `reason 必须带真实错误；实际 ${cs.reason}`);
  assert.ok(existsSync(idx), "query-error **不得**删索引（它只是本次回退）");
  assert.ok(!readdirSync(join(root, ".shadow")).some((n) => n.startsWith("index.sqlite.corrupt-")), "query-error **不得**把索引标坏");
  assert.deepEqual(
    { schema: readMetaValue(root, "schema_version"), rebuildAt: readMetaValue(root, "last_rebuild_at"), count: readMetaValue(root, "source_count") },
    before,
    "query-error **不得**触发整体重建（schema / last_rebuild_at / source_count 都必须原样）",
  );
  const notes: any[] = [];
  const p2 = createSqliteCandidateProvider({ load: brokenLoad });
  const cs2 = await p2.provide(fs, root, cfgSql, () => true, { writable: true });
  assert.equal(cs2.state, "query-error", "第二次仍然报 query-error（既不整体重建、也不转 corrupt）");
  console.log("✔ ②d query-error（SQLITE_BUSY）：state 与 corrupt 分开、索引文件一字未动、不得触发重建");
}
{
  // (d2) **未知 provider 名** ⇒ 退 fs 且**绝不静默**（D2）：note 恰一次 + 结果不变
  const root = mkCorpus();
  const fs = makeStrictFs(root);
  const fsOut = await materializeAtoms(fs, root, cfgFs);
  const notes: any[] = [];
  const out = await materializeAtoms(fs, root, { derivedIndex: { provider: "bogus" } }, { note: (...a: any[]) => notes.push(a) });
  assert.equal(notes.length, 1, "未知 provider 名必须留一条可见痕（静默当 fs 会让拼错的名字永远查不出来）");
  assert.match(String(notes[0][1]), /provider_unknown: bogus/, `reason 必须带原名字；实际 ${JSON.stringify(notes[0])}`);
  assert.deepEqual(sortedRel(out.parsed), sortedRel(fsOut.parsed), "未知 provider 必须退回 fs 全量 ⇒ 结果不变");
  assert.ok(!existsSync(indexPath(root)), "未知 provider 不得落任何索引");
  console.log("✔ ②d2 未知 provider：回退 fs + 可见 reason（`provider_unknown: bogus`）+ 结果不变");
}
{
  // (e) **合法 0 行** ⇒ 空集、ok、**不得回退、不得报降级**
  const root = mkRoot();
  put(root, D1, "_index.md", "# index\n"); // 日期目录里只有派生件 ⇒ 记忆集为空
  const fs = makeStrictFs(root);
  const notes: any[] = [];
  const out = await materializeAtoms(fs, root, cfgSql, { note: (...a: any[]) => notes.push(a) });
  assert.deepEqual(out.memories, [], "合法 0 行 ⇒ 空 memories");
  assert.deepEqual(out.parsed, [], "合法 0 行 ⇒ 空 parsed");
  assert.equal(notes.length, 0, "**合法 0 行是 ok，不是错误** —— 绝不回退、绝不报降级");
  const cs = await createCandidateProvider(cfgSql).provide(fs, root, cfgSql, () => true, { writable: true });
  assert.equal(cs.state, "ok", "空索引必须报 `ok`（`error ≠ empty`）");
  assert.notEqual(cs.unavailable, true, "空集**不得**带 unavailable 标记");
  assert.deepEqual(cs.sources, []);
  assert.deepEqual(cs.atoms, []);
  console.log("✔ ②e 合法 0 行：state=ok + 空集 + 零留痕（既不当错误、也不当降级）");
}

// ─────────────────────────────────────────────────────────────
// ③ 降级可见（正/负对照）：健康路径零留痕 ⇒ 输出与今天逐字节一致
// ─────────────────────────────────────────────────────────────
{
  const root = mkCorpus();
  const fs = makeStrictFs(root);
  const collector: any = createShadowCollector({
    context: { get: () => fs },
    config: { summary: { enabled: false }, forget: {}, compact: {}, retention: { enabled: false }, writeConsent: false },
    getAgentById: () => undefined,
  });
  await materializeAtoms(fs, root, cfgSql, { note: collector.noteDegrade }); // 首次：建索引（不是降级）
  const notes: any[] = [];
  const out = await materializeAtoms(fs, root, cfgSql, { note: (c: string, r: string, e: string) => { notes.push([c, r, e]); collector.noteDegrade(c, r, e); } });
  assert.equal(notes.length, 0, "**负对照**：健康路径 `note` 必须零调用");
  assert.equal(collector.getFlushWarn(), "", "**负对照**：健康路径 `flushWarn` 必须**逐字节为空** ⇒ 输出与今天一致");
  assert.deepEqual(sortedRel(out.parsed), sortedRel(baseline.parsed), "健康路径结果必须与 fs 路等价");

  // 正对照：同一个台账在降级时**必须**出声（否则「零调用」可能只是「压根没接线」）
  const fsNo = makeStrictFs(root, { processPath: false });
  await materializeAtoms(fsNo, root, cfgSql, { note: collector.noteDegrade });
  const warn = collector.getFlushWarn();
  assert.ok(warn.includes("能力降级") && warn.includes("derivedIndex"), `降级必须渲染成横幅；实际 ${JSON.stringify(warn)}`);
  assert.match(warn, /本该快/);
  assert.match(warn, /结果不变/);
  console.log("✔ ③ 正/负对照：健康路径零留痕 + flushWarn 逐字节为空；降级时同一台账渲染出横幅（含真实原因与后果）");
}

// ─────────────────────────────────────────────────────────────
// ④ 端到端「逐字节相同」：fs 与 sqlite 各跑一份**内容相同**的副本（D12）
// ─────────────────────────────────────────────────────────────
{
  const rootA = mkCorpus();
  const rootB = mkCorpus();
  const fsA = makeStrictFs(rootA);
  const fsB = makeStrictFs(rootB);
  const mkDeps = (fs: any, ws: string, cfg: any): any => {
    const collector: any = createShadowCollector({
      context: { get: () => fs },
      config: { ...cfg, summary: { enabled: false }, forget: {}, compact: {}, retention: { enabled: false }, writeConsent: false },
      getAgentById: () => undefined,
    });
    return {
      fs,
      config: { ...cfg, shadowRoot: ws },
      cwdBySession: new Map(),
      getFlushWarn: () => collector.getFlushWarn(),
      noteDegrade: collector.noteDegrade,
      verifyEvidence: async () => ({ status: "unavailable", source: "fs", matches: [], confidence: 0, freshness: "fresh", provenance: { provider: "fs" } }),
      expandTerms: async () => [],
      ensureIndex: async () => {},
      approval: undefined,
      derivedIndexWritable: true,
      derivedIndexDirty: () => [],
      derivedIndexClearDirty: () => {},
    };
  };
  const outFs = await runReadShadow(mkDeps(fsA, rootA, cfgFs), { mode: "episode" }, { agent: undefined });
  const outSql = await runReadShadow(mkDeps(fsB, rootB, cfgSql), { mode: "episode" }, { agent: undefined });
  assert.ok(outFs.length > 0, "端到端必须真的产出内容（否则逐字节相等是空的）");
  assert.equal(outSql, outFs, "两路（fs / sqlite，两份内容相同的副本）的输出必须**逐字节**相同");
  console.log(`✔ ④ 端到端逐字节相同：mode:"episode" 两路输出 ${outFs.length} 字符逐字一致`);
}

// ─────────────────────────────────────────────────────────────
// ⑤ 新鲜度：门①（粗信号）/ 门②（变化目录细比对）/ 门③（写侧 dirty）
// ─────────────────────────────────────────────────────────────
{
  const root = mkRoot();
  const D = dayStr(0);
  const NAME = memName(D, "120000", "core");
  const REL = `.shadow/${D}/${NAME}`;
  put(root, D, NAME, memoryText("v1"));
  const fs = makeStrictFs(root);
  await materializeAtoms(fs, root, cfgSql); // 建索引

  // (i) 新增文件必须被看见（**不得漏召回**）
  const NEW = memName(D, "130000", "added");
  put(root, D, NEW, memoryText("added"));
  const r1 = await materializeAtoms(fs, root, cfgSql);
  assert.ok(relsOf(r1).includes(`.shadow/${D}/${NEW}`), "新增文件必须被索引看见（门② 细比对）——漏一条就是静默少结果");

  // (ii) 删除文件不得留幽灵
  rmSync(join(root, ".shadow", D, NEW));
  const r2 = await materializeAtoms(fs, root, cfgSql);
  assert.ok(!relsOf(r2).includes(`.shadow/${D}/${NEW}`), "删掉的文件不得留在索引里（幽灵记忆）");

  // (iii) 原地改内容：先证「目录令牌看不见这条路」，再证 dirty 能兜住
  const probe = makeStrictFs(root);
  const dirToken = async () => {
    const es = await probe.listDir(await probe.resolve(join(root, ".shadow")));
    return (es.find((e: any) => e.name === D) || {}).version;
  };
  const t0 = await dirToken();
  put(root, D, NAME, memoryText("v2-inplace"));
  assert.equal(await dirToken(), t0, "**目录令牌对原地改内容必须不变**（Q5 边界；桩若表达不出，本组就是在测桩）");
  const r3 = await materializeAtoms(fs, root, cfgSql);
  assert.equal(entryOf(r3, REL), "v1", "无 dirty 时原地改写**看不见** —— 这是登记在案的剩余漏洞（外部进程原地改），不是 bug");
  const dirty = new Set<string>([REL]);
  const r4 = await materializeAtoms(fs, root, cfgSql, {
    writable: true, dirtyRels: dirty, clearDirty: (rs: Iterable<string>) => { for (const x of rs) dirty.delete(x); },
  });
  assert.equal(entryOf(r4, REL), "v2-inplace", "**写侧 dirty 必须兜住原地改写**（门③ 存在的唯一理由）");
  assert.equal(dirty.size, 0, "成功 upsert 之后必须消费掉 dirty（否则会无界积压）");

  // (iv) 逃生口：verifySources:"full" 不依赖 dirty 也能看见原地改
  put(root, D, NAME, memoryText("v3-inplace"));
  const r5 = await materializeAtoms(fs, root, cfgSqlFull);
  assert.equal(entryOf(r5, REL), "v3-inplace", "`verifySources:\"full\"` 必须不依赖 dirty 就看见原地改写（sound 逃生口）");

  // (v) **回退不丢**：一次 unavailable 之后，那条 dirty 必须原样保留、下一次仍能补上
  put(root, D, NAME, memoryText("v4-inplace"));
  const dirty2 = new Set<string>([REL]);
  const clearDirty2 = (rs: Iterable<string>) => { for (const x of rs) dirty2.delete(x); };
  const degraded = makeStrictFs(root, { processPath: false });
  await materializeAtoms(degraded, root, cfgSql, { writable: true, dirtyRels: dirty2, clearDirty: clearDirty2 });
  assert.equal(dirty2.size, 1, "**回退路径不得消费 dirty**（消费了 = 这次原地改写永久丢失，且粗信号看不见它）");
  const r6 = await materializeAtoms(fs, root, cfgSql, { writable: true, dirtyRels: dirty2, clearDirty: clearDirty2 });
  assert.equal(entryOf(r6, REL), "v4-inplace", "回退一次之后，下一次健康读必须仍能补上那条 dirty rel");
  assert.equal(dirty2.size, 0, "补上之后必须消费掉");
  console.log("✔ ⑤ 新鲜度：新增被看见 / 删除不留幽灵 / 原地改靠 dirty 兜住 / full 逃生口 / 回退不丢 dirty");
}

// ─────────────────────────────────────────────────────────────
// ⑥ 时序：稳态只有「根目录一次 listDir」；dirty ⇒ 根 + 该目录
// ─────────────────────────────────────────────────────────────
{
  const root = mkRoot();
  const D = dayStr(0);
  const NAME = memName(D, "080000", "steady");
  const REL = `.shadow/${D}/${NAME}`;
  put(root, D, NAME, memoryText("s1"));
  const fs = makeStrictFs(root);
  await materializeAtoms(fs, root, cfgSql); // 建索引

  fs.counters.listDir = 0;
  await materializeAtoms(fs, root, cfgSql);
  assert.equal(fs.counters.listDir, 1, "稳态必须只有**根目录一次** `listDir`（目录令牌相等 ⇒ 不进任何日期目录）");

  put(root, D, NAME, memoryText("s2")); // 原地改写（模拟 patchSummary）+ 写侧标脏
  const dirty = new Set<string>([REL]);
  fs.counters.listDir = 0;
  await materializeAtoms(fs, root, cfgSql, {
    writable: true, dirtyRels: dirty, clearDirty: (rs: Iterable<string>) => { for (const x of rs) dirty.delete(x); },
  });
  assert.equal(fs.counters.listDir, 2, "dirty ⇒ 根 1 次 + 该 rel 所在目录 1 次（单条 upsert 之外**还必须核对整个目录**）");

  fs.counters.listDir = 0;
  await materializeAtoms(fs, root, cfgSql);
  assert.equal(fs.counters.listDir, 1, "dirty 消费掉之后必须回到稳态（1 次）");
  console.log("✔ ⑥ 时序：稳态 1 次 listDir · dirty 2 次（根+dirty 所在目录）· 消费后回到 1 次");
}

// ─────────────────────────────────────────────────────────────
// ⑦ 反例（必须红的那种设计）：**dirty 不能替代「核对所在目录」**
//     构造出「版本已记录但内容未索引」的状态（= 「先 listDir 再取版本」时序反了时的状态），
//     再要求只走 dirty 路径也必须发现**不经过 dirty 的新增文件**。
// ─────────────────────────────────────────────────────────────
{
  const root = mkRoot();
  const D = dayStr(0);
  const A = memName(D, "070000", "a");
  const RELA = `.shadow/${D}/${A}`;
  const NEW = memName(D, "070100", "newfile");
  const RELNEW = `.shadow/${D}/${NEW}`;
  put(root, D, A, memoryText("a"));
  const fs = makeStrictFs(root);
  await materializeAtoms(fs, root, cfgSql); // 建索引
  await materializeAtoms(fs, root, cfgSql); // 稳态：粗信号落库

  // **自检**：测试侧算出的粗信号必须与 provider 落库的逐字相同（否则本组的构造无效）
  assert.equal(readMetaValue(root, "coarse_signal"), await coarseStringOf(fs, root),
    "（自检）测试侧粗信号格式必须与 provider 落库值逐字一致");

  put(root, D, NEW, memoryText("newfile")); // 新增文件（**不经过 dirty**）⇒ 目录令牌已变
  writeCoarse(root, await coarseStringOf(fs, root)); // ← 构造「版本已记录但内容未索引」

  const dirty = new Set<string>([RELA]); // 只标**已存在**那条 ⇒ 只走 dirty 路径
  const out = await materializeAtoms(fs, root, cfgSql, {
    writable: true, dirtyRels: dirty, clearDirty: (rs: Iterable<string>) => { for (const x of rs) dirty.delete(x); },
  });
  assert.ok(out.memories.some((m: any) => m.rel === RELNEW),
    "反例：dirty 路径**必须核对所在目录** —— 只 upsert 那一行会把不经过 dirty 的新增文件永远漏掉");
  console.log("✔ ⑦ 反例：dirty 路径核对整个目录 ⇒ 不经过 dirty 的新增文件仍被看见（「只 upsert 那一行」会红）");
}

// ── 收尾：清理临时目录（断言失败时泄漏到系统临时目录，由 OS 清理）──
for (const d of TMP) rmSync(d, { recursive: true, force: true });
console.log(`\n[derived-index] ALL PASS ✅（临时目录已清理 ${TMP.length} 个）`);
