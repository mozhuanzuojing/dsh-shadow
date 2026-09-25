// dsh-shadow —— tools/derived-index-bench.ts：**派生索引（SQLite）的三个基准数字 + 二进程并发探针**（`T17-C`）。
//
// 由来：`adr/0095` §六 要求三个数字（**cold rebuild 8.8k** / **incremental update** / **startup**），
// §七 的 T17-C 验证矩阵第 8、9 项就是它们；而 §补记七 明写「**并发 / 多进程**同时读+写同一份索引未测」。
// 本工具把这三件事做成**可重放**的：**合成语料**（不进仓库、不碰用户真实记忆）+ 真实临时目录 + 真实 provider。
//
// 为什么合成而不是用真语料：① 真语料只有几百到一千条，出不了 8.8k 的读数；
// ② 8.8k 是**规模**问题，不是**内容分布**问题 —— 合成语料能回答「建表要多久」；
// ⚠ 边界：合成记忆的**内容分布是均匀的**，真实语料的入口/主题分布更偏 ⇒ 耗时只能当**下界量级**看。
//
// 用法：node tools/derived-index-bench.ts [--atoms 8800] [--child <ws>]
// 退出码：0 = 三步都通过且并发探针无失败；1 = 有一步不成立；2 = 缺件（无 dist / 参数错 / 临时目录建不出来）。
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_ENTRY = join(HERE, "..", "dist", "core", "candidate", "sqlite.js");
if (!existsSync(DIST_ENTRY)) {
  console.error("[derived-index-bench] 缺 dist/core/candidate/sqlite.js —— 先跑 `npm run build`（或 `npm run verify`）");
  process.exit(2);
}

const argv = process.argv.slice(2);
const VALUE = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
};
const ATOMS = Math.max(1, Number(VALUE("--atoms") ?? 8800) || 8800);
const CHILD_WS = VALUE("--child");

// ── 合成语料：**最小但可解析**的原子（与 `test/abstract-sidecar.test.ts` 的夹具同形）──
const atomText = (i: number, date: string, time: string): string =>
  [
    `# synth-${i}`,
    "",
    "> 完整线索",
    `> 坐标：locus(ws) · when(${date} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}) · soul(default) · role(default) · intent(synth)`,
    "> 概况：1 动作 · 0 用户消息 · 0 决策",
    "> 项目：ws",
    "",
    `- [${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}] [synth-${i}] 改/读 synth/file-${i % 97}.ts`,
    "",
  ].join("\n");

const seedCorpus = (ws: string, n: number): string[] => {
  const atoms = join(ws, ".shadow", "atoms");
  mkdirSync(atoms, { recursive: true });
  const rels: string[] = [];
  for (let i = 0; i < n; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    const date = `2026-01-${day}`;
    const hh = String(Math.floor((i * 7) % 24)).padStart(2, "0");
    const mm = String((i * 13) % 60).padStart(2, "0");
    const ss = String((i * 29) % 60).padStart(2, "0");
    const name = `${date}--${hh}${mm}${ss}-synth-${i}.md`;
    writeFileSync(join(atoms, name), atomText(i, date, `${hh}${mm}${ss}`), "utf8");
    rels.push(`.shadow/atoms/${name}`);
  }
  return rels;
};

// ── 本地 fs 门面（与 `dsh-fs-local.listDirectory` 同形；底下是**真实临时目录**）──
//    ⚠ 与 `test/derived-index.test.ts` 的「严格桩」**同形但不等价**：那一个带调用计数与
//    `processPath:false` 开关（服务于断言），本工具只要一个可跑的真门面 ⇒ 刻意不共享（共享会强迫
//    测试夹具背上本工具不需要的状态）。**判据本身**（版本语义）两侧一致：目录版本只在增/删/改名时变。
const localFs = () => {
  const fileVersion = (p: string): string => { const st = statSync(p); return `${st.size}:${st.mtimeMs}`; };
  const dirVersion = (p: string): string => `dir:${readdirSync(p).sort().join(",")}`;
  return {
    async resolve(p: string) { return { displayPath: p, targetKey: p }; },
    async readText(t: any) { return readFileSync(t.displayPath, "utf8"); },
    async listDir(t: any) {
      return readdirSync(t.displayPath, { withFileTypes: true }).map((e) => {
        const child = join(t.displayPath, e.name);
        const isDir = e.isDirectory();
        return { name: e.name, type: isDir ? "directory" : "file", size: isDir ? 0 : statSync(child).size, version: isDir ? dirVersion(child) : fileVersion(child), target: { displayPath: child, targetKey: child } };
      });
    },
    async stat(t: any) {
      const st = statSync(t.displayPath);
      return { version: st.isDirectory() ? dirVersion(t.displayPath) : fileVersion(t.displayPath), type: st.isDirectory() ? "directory" : "file", size: st.isDirectory() ? 0 : st.size };
    },
    async writeText(t: any, c: string) { writeFileSync(t.displayPath, c, "utf8"); return { operation: "update", version: fileVersion(t.displayPath), before: null, after: c }; },
    processPath: (t: any) => t?.displayPath ?? t?.targetKey,
  };
};

const ms = (t0: number): number => Number((performance.now() - t0).toFixed(1));
const ok = (label: string, cond: boolean, detail: string): boolean => {
  console.log(`  ${cond ? "✔" : "✗"} ${label}：${detail}`);
  return cond;
};

/** 子进程模式：**并发探针**用的读/写循环（同一份索引，两个进程）。 */
const runChild = async (ws: string): Promise<void> => {
  const { createSqliteCandidateProvider } = await import("../dist/core/candidate/sqlite.js");
  const cfg = { derivedIndex: { provider: "sqlite" }, forget: { enabled: false } };
  const fs = localFs();
  const p = createSqliteCandidateProvider();
  const states: string[] = [];
  const writer = process.argv.includes("--writer");
  // ⚠ **两个子进程都必须 `writable: true`**：`writable: false` 会在守卫②（只读会话）**直接返回 unavailable**
  //    ——那只证明「只读会话不落盘」（test ②b 已覆盖），**证明不了并发**。真正的并发探针要两个进程都真开库。
  for (let i = 0; i < 12; i++) {
    const set = await p.provide(fs, ws, cfg, () => true, { writable: true });
    states.push(set.state);
    if (writer && i % 3 === 0) {
      const day = "2026-01-28";
      writeFileSync(join(ws, ".shadow", "atoms", `${day}--2359${String(i).padStart(2, "0")}-child-${process.pid}-${i}.md`), atomText(999000 + i, day, "235959"), "utf8");
    }
  }
  const kinds = [...new Set(states)].sort();
  console.log(`  [child pid=${process.pid} ${writer ? "writer" : "reader"}] states=${kinds.join(",")}（${states.length} 次）`);
};
if (CHILD_WS) {
  await runChild(CHILD_WS);
  process.exit(0);
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
const ROOT = mkdtempSync(join(tmpdir(), "dsh-derived-bench-"));
const WS = join(ROOT, "ws");
mkdirSync(WS, { recursive: true });
console.log("▶ 派生索引基准（T17-C 的矩阵第 8/9 项 + 并发探针）");
console.log(`  工作区（临时，不碰用户语料）：${WS}`);
const seeded = seedCorpus(WS, ATOMS);
console.log(`  合成语料：${seeded.length} 个原子（均匀分布；**真语料分布更偏** ⇒ 耗时只当量级看）`);

const { createSqliteCandidateProvider } = await import("../dist/core/candidate/sqlite.js");
const cfg = { derivedIndex: { provider: "sqlite" }, forget: { enabled: false } };
const fs = localFs();
const provider = createSqliteCandidateProvider();
const keep = () => true;
let failures = 0;

// ① cold rebuild
let t0 = performance.now();
let set = await provider.provide(fs, WS, cfg, keep, { writable: true });
const coldMs = ms(t0);
const indexPath = join(WS, ".shadow", "indexes", "index.sqlite");
const indexBytes = existsSync(indexPath) ? statSync(indexPath).size : 0;
failures += ok("① cold rebuild", set.state === "ok" && set.sources.length === ATOMS, `${coldMs} ms · rows=${set.sources.length}/${ATOMS} · index=${(indexBytes / 1024).toFixed(0)} KB · state=${set.state}`) ? 0 : 1;

// ② startup（索引已在）
t0 = performance.now();
set = await provider.provide(fs, WS, cfg, keep, { writable: true });
const startMs = ms(t0);
failures += ok("② startup（已有索引）", set.state === "ok" && set.sources.length === ATOMS, `${startMs} ms · rows=${set.sources.length} · state=${set.state}`) ? 0 : 1;

// ③ incremental（+1 新文件、原地改 1 个文件）
const changedRel = seeded[0];
const changedPath = join(WS, changedRel);
const before = readFileSync(changedPath, "utf8");
writeFileSync(changedPath, before.replace("[synth-0]", "[synth-0-edited]"), "utf8");   // 原地改（同文件）
const day = "2026-01-28";
const newName = `${day}--120000-synth-new.md`;
writeFileSync(join(WS, ".shadow", "atoms", newName), atomText(424242, day, "120000"), "utf8");
t0 = performance.now();
set = await provider.provide(fs, WS, cfg, keep, { writable: true, dirtyRels: [changedRel, `.shadow/atoms/${newName}`] });
const incMs = ms(t0);
const atoms = set.atoms ?? [];
const sawEdited = atoms.some((a: any) => JSON.stringify(a).includes("synth-0-edited"));
failures += ok("③ incremental（+1 新、改 1 原地）", set.state === "ok" && set.sources.length === ATOMS + 1 && sawEdited, `${incMs} ms · rows=${set.sources.length}/${ATOMS + 1} · 改动能被看见=${sawEdited} · state=${set.state}`) ? 0 : 1;

// ④ 二进程并发探针（一个读、一个写；同一份索引）
console.log("  ④ 并发探针：两个子进程同时读/写同一份索引（WAL / busy 的真实行为）");
const spawnChild = (extra: string) =>
  new Promise<number>((res) => {
    const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "--child", WS, ...(extra ? [extra] : [])], { stdio: "inherit" });
    c.on("close", (code) => res(code ?? 1));
  });
const [readerCode, writerCode] = await Promise.all([spawnChild(""), spawnChild("--writer")]);
failures += ok("④ 并发探针", readerCode === 0 && writerCode === 0, `reader exit=${readerCode} · writer exit=${writerCode}（两个子进程都跑完 12 轮；states 见上）`) ? 0 : 1;

console.log("");
console.log(`【三个数字】cold rebuild（${ATOMS} 条）= ${coldMs} ms · startup = ${startMs} ms · incremental（+1/改1）= ${incMs} ms`);
console.log(`【索引体积】${(indexBytes / 1024).toFixed(0)} KB（${ATOMS} 条 ⇒ ${(indexBytes / ATOMS).toFixed(0)} B/条）`);
rmSync(ROOT, { recursive: true, force: true });
console.log(failures ? `❌ 有 ${failures} 步不成立` : "✔ 四步全部成立（含二进程并发；**跨平台锁与真实流量漏召回仍未测** —— 见 adr/0095 §补记七）");
process.exit(failures ? 1 : 0);
