/**
 * dsh-shadow —— tools/citation-audit.lib.ts：`文件:行号` 引用的**越界门**（v1.18.4）。
 *
 * ## 由来（实测）
 *
 * 本仓纪律「每条断言带 `文件:行号`」的代价是**行号会腐烂**。v1.15.65 立了规矩（归档层不改、
 * 冻结 ADR 写补记、当前态文档必须修），但**规矩靠记性**。v1.18.4 又实测到一次：
 * 把材料 `openclaw` 从 `c1c870a4` 更新到 `052d26ee` 后，`adr/0095` 正文引的
 * `memory-builtin.md:249`/`:259` **全部失配**（该文件整体下移 3 行）——
 * 而在此之前**没有任何机器能告诉我「哪些断言建立在这个材料的行号上」**。
 * ⇒ 同一天先量后建：本门是那次测量的产物。
 *
 * ## 判据（只有一条，且**故意窄**）
 *
 * **能被唯一解析的目标，其被引行号区间必须落在该文件的实际行数之内。**
 * 抓的是「文件变短了 / 引用早就越界了」这一半 —— 判据必须**零误报**才配进门。
 *
 * ## 能力边界（用门之前先读；ADR-0049：缺件不静默）
 *
 * - **不判「指错行」**：`reflection/types.ts:22` 那种「行号存在、但那一行是注释不是判据」
 *   本门**抓不到** —— 那要读语义，机械判据做不到。本门只答「越界了没有」。
 * - **不判外部材料的内容位移**：材料会随上游移动（上面那次就是）。对 `../_src/` 下的目标
 *   本门只判越界，**不判内容**；要判内容就得先有 **pin**（见 `AGENTS.md`「引用纪律」）。
 * - **不猜**：同名文件有多个（实测 `types.ts` 16 个 / `persist.ts` 10 个 / `guard.ts` 6 个），
 *   或目标找不到 ⇒ **计为「未判定」并打印个数**，**绝不**挑一个来判。未判定**不是**「已验证」。
 * - **不覆盖归档层**：`CHANGELOG.md` 与**冻结 ADR** 的行号是「当时」的语义 ⇒ 不在范围内
 *   （查它们等于要求改写历史）。
 * - **不联网**（与 `verify` 里的其它门同族）。
 *
 * ## 扫描面（A3②，v1.22.1 扩面）
 *
 * 原先只扫**当前态文档**（根目录 `*.md` + `docs/*.md` + 未冻结 ADR）；现在**同一套判据**
 * 也扫**源码 `.ts` 的注释**里的 `文件:行号`：本仓的核心纪律是「每条断言带 `文件:行号`」，
 * 而 `.ts` 注释恰恰是这条纪律用得最多、却**从来没有门**的地方（评审实测：抽查 8 处当前态
 * `文件:行号` 引用，**4 处文件已不存在**）。覆盖面与 `.md` 完全相同（共用同一份 `judge`），
 * 差别只在**怎么把行拿出来**：`.ts` 只取注释内容，且**保持行号对齐**（非注释行留空行）。
 *
 * **已知边界（先读再改）**：
 *   · **行尾注释不扫**（`const x = 1; // 见 a.ts:1`）—— 宁可漏，不可误报；
 *   · **不区分「字符串里长得像注释的一行」**（多行模板串中以 `//` / `*` 开头的那一行会被当成注释）；
 *     实测当前语料（源码 + `tools/`，`test/` 排除）命中 **0 处误报**，唯一一处是**真越界**
 *     ——本文件自己的文件头，已改成符号引用；
 *   · `test/` 与 `dist/` / `node_modules/` / 文档 / 预设**不进扫描面**：测试夹具里会**刻意**
 *     写越界引用（那是标定语料），拿它报红是假阳性（同 `audit-layers` 排除 `test/` 的理由）。
 *
 * ## 两个被**测量否决**的更宽判据（记下来，免得下次又想去加）
 *
 * 1. **「引用后的 `「…」` 引文必须出现在被引行上」**：第一版把反引号也当引文 ⇒ 实测
 *    **139 处「不符」，几乎全是误报**（例：`README.md` 引 `test/recall-envelope.test.ts` 的
 *    `assert.equal(modes.size, 62, …)` —— 引用是**对的**，错的是抽取正则）。
 *    （⚠ 上面这处举例已按 A3② 改成**符号引用**：它原先指着 README 的第 314 行，
 *    而 README 现在只有 296 行 —— 扩面之后这条「历史举例」当场被本门自己抓成越界，不是巧合。）
 * 2. 收紧成「只认紧跟引用的 `「…」`」后：**误报 0，覆盖也 0** —— 带 `「」` 引文的引用
 *    全落在冻结 ADR 与外部材料上，恰好是本门不查的两层。
 * ⇒ 覆盖 0 的判据等于没有判据；**先量再建**，不要凭「看起来更严」加判据。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadTrustedRoots, resolveAgainstTrustedRoots, type TrustedRoot } from "./trusted-roots.lib.ts";
import { SOURCE_EXCLUDED_DIRS } from "./audit-layers.lib.ts";

export type CiteResult = {
  ok: boolean;
  code: number;
  lines: string[];
  counts: { total: number; judged: number; unjudged: number; external: number; overflow: number };
};

const norm = (s: string) => s.replace(/\r/g, "");

/**
 * 文件行数 = 内容行数，**不把结尾换行造成的那条空串算一行**。
 * （实测：`"l1…l5\n"` 按 `split("\n")` 得 6 —— 会把「引到文件末尾多 1 行」放过。）
 */
export const countLines = (text: string): number => {
  const ls = norm(text).split("\n");
  if (ls.length && ls[ls.length - 1] === "") ls.pop();
  return ls.length;
};

/**
 * 归档层文档名（**不查它的行号**：那里是「当时」的语义，查它等于要求改写历史）。
 * 立成常量而不是在比较点里写字面量：本仓 `audit:ratchet` 的 `b_keys` 会把
 * 「比较点里的新字符串字面量」算成新线索（v1.15.x 已因 `=== "(root)"` / `=== ".git"` 各踩一次）。
 */
export const CHANGELOG_DOC = "CHANGELOG.md";

/** 顶层文档（排除归档层）+ 未冻结 ADR。 */
export const currentStateDocs = (root: string): string[] => {
  const docs: string[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    if (e.name === CHANGELOG_DOC) continue;
    docs.push(join(root, e.name));
  }
  // `docs/*.md` 属当前态（如 `docs/maintainers.md`，v1.21.0 README 拆分后）；HTML/JSON 不扫。
  const docsDir = join(root, "docs");
  if (existsSync(docsDir)) {
    for (const f of readdirSync(docsDir).filter((f) => f.endsWith(".md"))) {
      docs.push(join(docsDir, f));
    }
  }
  const adrDir = join(root, "adr");
  if (existsSync(adrDir)) {
    for (const f of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) {
      const p = join(adrDir, f);
      if (!isFrozenAdr(readFileSync(p, "utf8"))) docs.push(p);
    }
  }
  return docs;
};

/**
 * 归档层文档（`CHANGELOG.md` + **全部** `adr/*.md`，**含冻结**）。
 *
 * 只在显式要求时度量（`--include-archive`）；**默认门不用它** —— 归档层的行号是「当时」语义，
 * 拿它报红等于要求改写历史。要问「归档层现在有多少越界」，这是唯一的入口。
 */
export const archiveDocs = (root: string): string[] => {
  const docs: string[] = [];
  const changelog = join(root, CHANGELOG_DOC);
  if (existsSync(changelog)) docs.push(changelog);
  const adrDir = join(root, "adr");
  if (existsSync(adrDir)) {
    for (const f of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) docs.push(join(adrDir, f));
  }
  return docs;
};

/** 状态行里出现「冻结」⇒ 该 ADR 正文的行号属冻结层（只改补记，不改正文）。 */
export const isFrozenAdr = (text: string): boolean => {
  for (const line of norm(text).split("\n").slice(0, 24)) {
    if (/^\s*[-*]?\s*状态[：:]/.test(line) && line.includes("冻结")) return true;
  }
  return false;
};

const CITE = /([A-Za-z0-9_.\-/\\]+\.(?:md|ts|mts|json|ya?ml|py|sh|ps1)):(\d+)(?:\s*[-–~]\s*(\d+))?/g;

/**
 * 扫描**源码注释**时要跳过的目录（A3②）。
 *
 * 直接复用 `audit-layers.lib.ts` 的 `SOURCE_EXCLUDED_DIRS`（`dist` / `node_modules` / `.git` /
 * `_research` / `.docs` / `docs` / `presets`）——「哪些目录不是源码」这条判断**只有一份实现**；
 * 本门再补 `test`：测试夹具里**刻意**写着越界引用（那是标定语料），拿它报红是假阳性。
 * `tools/` **在**扫描面内（工具注释同样是当前态代码，本轮实测的第一处真越界就在那里）。
 */
const SRC_SKIP = new Set([...SOURCE_EXCLUDED_DIRS, "test"]);

/** 扫描面的源码文件（仓库相对 → 绝对路径；不含 `.d.ts`）。 */
export const sourceCommentDocs = (root: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 读不动就跳过：本门只判「越界」，读不到的目标归入「未判定」
    }
    for (const e of entries) {
      if (SRC_SKIP.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(p);
    }
  };
  walk(root);
  return out.sort();
};

/**
 * 只保留**注释文本**、并**保持行号对齐**（非注释行 → 空串）。
 *
 * 为什么必须对齐：`collectCites` 用行下标当 `docLine`，而报文要给读者「去第几行看」——
 * 若把注释抽出来压缩成几行，报出来的行号就是假的（本仓最忌的「读数不可复核」）。
 * 识别形态：整行 `//`、整行 `/*`（含跨行块注释），以及块注释内的续行。
 * **刻意不认行尾注释**（`const x = 1; // 见 a.ts:1`）：那要区分「字符串里的 `//`」，
 * 判错的代价是**假阳性**，而本门的判据必须零误报才配进门（见文件头「两个被测量否决的更宽判据」）。
 */
export const commentTextOf = (text: string): string => {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of norm(text).split("\n")) {
    const t = raw.trim();
    if (inBlock) {
      const end = t.indexOf("*/");
      out.push(end < 0 ? t : t.slice(0, end));
      if (end >= 0) inBlock = false;
      continue;
    }
    if (t.startsWith("//")) {
      out.push(t.slice(2));
      continue;
    }
    if (t.startsWith("/*")) {
      const end = t.indexOf("*/", 2);
      out.push(end < 0 ? t.slice(2) : t.slice(2, end));
      if (end < 0) inBlock = true;
      continue;
    }
    out.push("");
  }
  return out.join("\n");
};

export type Cite = { doc: string; docLine: number; target: string; from: number; to: number; raw: string };

export const collectCites = (root: string, docs: string[]): Cite[] => {
  const cites: Cite[] = [];
  for (const doc of docs) {
    // `.ts` 只取注释（且行号对齐）；`.md` / ADR 整篇都算（当前态文档的正文里全是断言）。
    const raw = readFileSync(doc, "utf8");
    const lines = norm(doc.endsWith(".ts") ? commentTextOf(raw) : raw).split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(CITE)) {
        cites.push({
          doc: doc.slice(root.length + 1).replace(/\\/g, "/"),
          docLine: i + 1,
          target: m[1].replace(/\\/g, "/"),
          from: Number(m[2]),
          to: Number(m[3] ?? m[2]),
          raw: m[0],
        });
      }
    });
  }
  return cites;
};

const WALK_SKIP = new Set([".git", "dist", "node_modules"]);

/** 按**文件名**建索引；只记我们真正需要的那些名字（仓库可能很大，Walk 一遍就够）。 */
const indexByBasename = (dir: string, needed: Set<string>, into: Map<string, string[]>): void => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 权限/junction 等读不动就跳过：本门只判「越界」，读不到的目标归入「未判定」
  }
  for (const e of entries) {
    if (WALK_SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) indexByBasename(p, needed, into);
    else if (e.isFile()) {
      const b = basename(e.name);
      if (needed.has(b)) {
        const hits = into.get(b);
        if (hits) hits.push(p);
        else into.set(b, [p]);
      }
    }
  }
};

/** 判定结果（判定本体的输出；**呈现**由 `checkCitations` / `checkArchiveCitations` 各自负责）。 */
type Judged = {
  cites: Cite[];
  judged: number;
  unjudged: number;
  external: number;
  overflow: { cite: Cite; total: number; isExternal: boolean }[];
  unjudgedList: string[];
};

/**
 * **判定本体 —— 判据只有这一份实现。**
 *
 * 解析顺序：本仓相对 → `_src` 材料根 → 裸文件名兜底（**唯一**命中才算）→ 其余「未判定」；
 * 能唯一解析的才比行数。呈现（文案 / 退出码 / 报不报红）由调用方决定 —— 当前态门与归档层度量
 * **共用它**，这样「什么算引用」「什么算越界」不会在两处各写一遍而漂移（本仓反复吃过的亏）。
 */
const judge = (ROOT: string, docs: string[], MATERIALS: string, roots: TrustedRoot[]): Judged => {
  const cites = collectCites(ROOT, docs);
  const unjudgedList: string[] = [];
  const overflow: { cite: Cite; total: number; isExternal: boolean }[] = [];
  let judged = 0;
  let unjudged = 0;
  let external = 0;

  type Resolved = { path: string; isExternal: boolean } | null;
  const direct = new Map<string, Resolved>();

  const tryDirect = (t: string): Resolved => {
    if (direct.has(t)) return direct.get(t)!;
    let out: Resolved = null;
    const local = join(ROOT, t);
    if (existsSync(local)) out = { path: local, isExternal: false };
    else if (existsSync(MATERIALS)) {
      for (const mat of readdirSync(MATERIALS)) {
        const p = join(MATERIALS, mat, t);
        if (existsSync(p)) {
          out = { path: p, isExternal: true };
          break;
        }
      }
    }
    direct.set(t, out);
    return out;
  };

  const resolved = cites.map((c) => tryDirect(c.target));

  // 只有「直接解析失败」的才需要按文件名兜底，且**只兜不含目录的裸文件名**。
  // ⚠ 实测（v1.18.4）：`docs/subsystems/filesystem.md:415-417` 是**别的根**（DSH 平台克隆，
  // 正文自己写着「克隆 v0.1.2-alpha.1」）⇒ 按文件名兜底会错配到材料里的同名文件，
  // 报出一个**假阳性**。带目录的引用只能按根相对/材料相对解析，否则归入「未判定」。
  const needed = new Set<string>();
  cites.forEach((c, i) => {
    if (!resolved[i] && !c.target.includes("/")) needed.add(basename(c.target));
  });
  const byName = new Map<string, string[]>();
  if (needed.size) {
    indexByBasename(ROOT, needed, byName);
    if (existsSync(MATERIALS)) {
      for (const mat of readdirSync(MATERIALS)) indexByBasename(join(MATERIALS, mat), needed, byName);
    }
  }

  cites.forEach((c, i) => {
    let hit = resolved[i];
    if (!hit && !c.target.includes("/")) {
      const hits = byName.get(basename(c.target)) ?? [];
      if (hits.length === 1) {
        hit = { path: hits[0], isExternal: hits[0].startsWith(MATERIALS) };
      } else if (hits.length === 0) {
        unjudged++;
        unjudgedList.push(`  ? 目标找不到（不判）  ${c.doc}:${c.docLine}  →  ${c.raw}`);
        return;
      } else {
        unjudged++;
        unjudgedList.push(`  ? 同名 ${hits.length} 个，**不猜**（不判）  ${c.doc}:${c.docLine}  →  ${c.raw}`);
        return;
      }
    }
    if (!hit) {
      // 第四档：**已注册的别的根**（adr/0108）。唯一命中才算；多根命中**仍不判**（ADR-0059：不猜）。
      const rr = resolveAgainstTrustedRoots(c.target, roots, ROOT);
      if (rr.hit) {
        hit = { path: rr.hit, isExternal: true };
      } else if (rr.ambiguous.length) {
        unjudged++;
        unjudgedList.push(
          `  ? 已注册根里命中 ${rr.ambiguous.length} 个，**不猜**（不判）  ${c.doc}:${c.docLine}  →  ${c.raw}  [根：${rr.ambiguous.join(" / ")}]`,
        );
        return;
      } else if (rr.unavailable.length) {
        unjudged++;
        unjudgedList.push(
          `  ? **根不可用**（不判）  ${c.doc}:${c.docLine}  →  ${c.raw}  [根：${rr.unavailable.join(" / ")}]`,
        );
        return;
      } else {
        unjudged++;
        unjudgedList.push(
          `  ? 带目录的路径在本仓 / 材料 / **已注册根**里都找不到（不判；可能是**别的根**，如平台克隆 —— 要用它得先注册）  ${c.doc}:${c.docLine}  →  ${c.raw}`,
        );
        return;
      }
    }

    const isExternal = hit.isExternal;
    if (isExternal) external++;

    let total: number;
    try {
      total = countLines(readFileSync(hit.path, "utf8"));
    } catch {
      unjudged++;
      unjudgedList.push(`  ? 读不动（不判）  ${c.doc}:${c.docLine}  →  ${c.raw}`);
      return;
    }
    judged++;
    if (c.from < 1 || c.to < c.from || c.to > total) {
      // 只**记录**越界，不在判定层决定「红不红」—— 那是呈现层的事
      //（归档层的越界是「当时」的历史事实，不得据此让门变红）。
      overflow.push({ cite: c, total, isExternal });
    }
  });

  return { cites, judged, unjudged, external, overflow, unjudgedList };
};

export const checkCitations = (root: string, opts: { verbose?: boolean } = {}): CiteResult => {
  const ROOT = resolve(root);
  const MATERIALS = resolve(ROOT, "..", "_src");
  const docs = currentStateDocs(ROOT);
  if (!docs.length) {
    return {
      ok: false,
      code: 2,
      counts: { total: 0, judged: 0, unjudged: 0, external: 0, overflow: 0 },
      lines: ["❌ ⑥ **结构缺失**：当前态文档一个都没找到（顶层无 `*.md`）。**这不是「通过」**（ADR-0049）。"],
    };
  }

  // 扫描面 = 当前态文档 + **源码 `.ts` 的注释**（A3②）：判据、解析、越界口径**完全共用**，
  // 差别只在 `collectCites` 怎么把行取出来（见 `commentTextOf`）。
  const sources = sourceCommentDocs(ROOT);
  const { roots, problems } = loadTrustedRoots(ROOT);
  const { cites, judged, unjudged, external, overflow, unjudgedList } = judge(ROOT, [...docs, ...sources], MATERIALS, roots);
  const rootLines = [
    "  · 可信根注册表：" + roots.length + " 个可用" +
      (problems.length ? " · **" + problems.length + " 条问题**（不得静默）" : ""),
    ...problems.map((p) => `      ⚠ ${p}`),
  ];

  const head =
    `引用 ${cites.length} 处（当前态文档 + 源码 \`.ts\` 的**注释**（${sources.length} 个文件）；` +
    `\`CHANGELOG.md\` 与冻结 ADR **不在范围内**）` +
    ` ⇒ 可唯一解析并判定 ${judged} 处（其中外部材料 ${external} 处）· 未判定 ${unjudged} 处`;
  const boundary = [
    "  ⚠ 本门**只答「越界了没有」**：抓不到「行号存在但指错行」（那要读语义），",
    "    也不判外部材料的内容位移（材料随上游移动）—— 未判定**不是**「已验证」（ADR-0049）。",
    "  ⚠ `.ts` 只扫**注释**（整行 `//` / 块注释；行尾注释与字符串不在面内），`test/` 亦不在面内 ——",
    "    测试夹具里会刻意写越界引用（标定语料），拿它报红是假阳性。",
    ...rootLines,
  ];

  if (overflow.length) {
    const failures = overflow.map(
      (o) =>
        `  ✗ **行号越界**  ${o.cite.doc}:${o.cite.docLine}  →  ${o.cite.raw}` +
        `${o.isExternal ? " [外部材料：只判越界，不判内容位移]" : ""}\n` +
        `      该文件实际只有 ${o.total} 行（引的是 ${o.cite.from}-${o.cite.to}）`,
    );
    return {
      ok: false,
      code: 1,
      counts: { total: cites.length, judged, unjudged, external, overflow: overflow.length },
      lines: [`❌ ⑥ **有 \`文件:行号\` 引用越界**`, `  （${head}）`, "", ...failures, "", ...boundary,
        "",
        "  怎么修：引**符号名**（本仓首选），或核对该文件当前行数后订正行号；",
        "  归档层（`CHANGELOG.md`）与冻结 ADR 的行号**不要动**（冻结 ADR 写补记）。"],
    };
  }

  return {
    ok: true,
    code: 0,
    counts: { total: cites.length, judged, unjudged, external, overflow: 0 },
    lines: [
      `✔ ⑥ 没有越界的 \`文件:行号\` 引用（${head}）`,
      ...boundary,
      ...(opts.verbose ? ["", ...unjudgedList] : []),
    ],
  };
};

/**
 * **归档层度量**（CLI 的 `--include-archive`）：量 `CHANGELOG.md` + **全部** ADR（含冻结）。
 *
 * 与当前态门**共用 `judge`** —— 所以「什么算引用 / 什么算越界 / 什么算未判定」**只有一份实现**。
 * 差别只在**呈现与退出码**：
 * - **只报不判**：归档层行号是「**当时**」语义 ⇒ 越界是**历史事实**，`exit 0`，绝不据此报红；
 * - **缺件不静默**：归档层文档一个都没有 ⇒ `exit 2`（**不是「通过」**，ADR-0049）。
 */
export const checkArchiveCitations = (root: string, opts: { verbose?: boolean } = {}): CiteResult => {
  const ROOT = resolve(root);
  const MATERIALS = resolve(ROOT, "..", "_src");
  const docs = archiveDocs(ROOT);
  if (!docs.length) {
    return {
      ok: false,
      code: 2,
      counts: { total: 0, judged: 0, unjudged: 0, external: 0, overflow: 0 },
      lines: [
        "❌ **结构缺失**：归档层文档一个都没找到（无 `CHANGELOG.md`，也无 `adr/*.md`）。**这不是「通过」**（ADR-0049）。",
      ],
    };
  }

  const { roots, problems } = loadTrustedRoots(ROOT);
  const r = judge(ROOT, docs, MATERIALS, roots);
  const lines = [
    `归档层引用 ${r.cites.length} 处（\`CHANGELOG.md\` + **全部** ADR，含冻结）` +
      ` ⇒ 可唯一解析并判定 ${r.judged} 处（其中外部材料 ${r.external} 处）` +
      ` · 未判定 ${r.unjudged} 处 · **越界 ${r.overflow.length} 处**`,
    "  ⚠ **只报不判**：归档层的行号是「**当时**」语义 ⇒ 越界是历史事实，**不构成本门失败**（exit 0）。",
    "  ⚠ 「未判定」**不是**「死链」：带目录的路径常属**别的根**（平台克隆等），判它 = 假阳性（ADR-0059）。",
    `  · 可信根注册表：${roots.length} 个可用${problems.length ? ` · **${problems.length} 条问题**（不得静默）` : ""}`,
    ...problems.map((p) => `      ⚠ ${p}`),
  ];
  if (r.overflow.length) {
    lines.push("", `--- 越界逐条（${r.overflow.length} 处）---`);
    for (const o of r.overflow) {
      lines.push(
        `  ✗ ${o.cite.doc}:${o.cite.docLine}  →  ${o.cite.raw}${o.isExternal ? " [外部材料]" : ""}\n` +
          `      该文件实际只有 ${o.total} 行（引的是 ${o.cite.from}-${o.cite.to}）`,
      );
    }
  }
  if (opts.verbose) lines.push("", ...r.unjudgedList);

  return {
    ok: true,
    code: 0,
    counts: {
      total: r.cites.length,
      judged: r.judged,
      unjudged: r.unjudged,
      external: r.external,
      overflow: r.overflow.length,
    },
    lines,
  };
};
