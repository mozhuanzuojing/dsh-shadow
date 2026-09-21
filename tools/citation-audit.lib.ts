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
 * ## 两个被**测量否决**的更宽判据（记下来，免得下次又想去加）
 *
 * 1. **「引用后的 `「…」` 引文必须出现在被引行上」**：第一版把反引号也当引文 ⇒ 实测
 *    **139 处「不符」，几乎全是误报**（例：`README.md:314` 引 `test/recall-envelope.test.ts:104`，
 *    该行确为 `assert.equal(modes.size, 62, …)` —— 引用是**对的**，错的是抽取正则）。
 * 2. 收紧成「只认紧跟引用的 `「…」`」后：**误报 0，覆盖也 0** —— 带 `「」` 引文的引用
 *    全落在冻结 ADR 与外部材料上，恰好是本门不查的两层。
 * ⇒ 覆盖 0 的判据等于没有判据；**先量再建**，不要凭「看起来更严」加判据。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

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
  const adrDir = join(root, "adr");
  if (existsSync(adrDir)) {
    for (const f of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) {
      const p = join(adrDir, f);
      if (!isFrozenAdr(readFileSync(p, "utf8"))) docs.push(p);
    }
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

export type Cite = { doc: string; docLine: number; target: string; from: number; to: number; raw: string };

export const collectCites = (root: string, docs: string[]): Cite[] => {
  const cites: Cite[] = [];
  for (const doc of docs) {
    const lines = norm(readFileSync(doc, "utf8")).split("\n");
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

  const cites = collectCites(ROOT, docs);
  const unjudgedList: string[] = [];
  const failures: string[] = [];
  let judged = 0;
  let unjudged = 0;
  let external = 0;
  let overflow = 0;

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
      unjudged++;
      unjudgedList.push(
        `  ? 带目录的路径在本仓 / 材料里都找不到（不判；可能是**别的根**，如平台克隆）  ${c.doc}:${c.docLine}  →  ${c.raw}`,
      );
      return;
    }

    const isExternal = hit.isExternal;
    const note = isExternal ? " [外部材料：只判越界，不判内容位移]" : "";
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
      overflow++;
      failures.push(
        `  ✗ **行号越界**  ${c.doc}:${c.docLine}  →  ${c.raw}${note}\n` +
          `      该文件实际只有 ${total} 行（引的是 ${c.from}-${c.to}）`,
      );
    }
  });

  const head =
    `引用 ${cites.length} 处（当前态文档；\`CHANGELOG.md\` 与冻结 ADR **不在范围内**）` +
    ` ⇒ 可唯一解析并判定 ${judged} 处（其中外部材料 ${external} 处）· 未判定 ${unjudged} 处`;
  const boundary = [
    "  ⚠ 本门**只答「越界了没有」**：抓不到「行号存在但指错行」（那要读语义），",
    "    也不判外部材料的内容位移（材料随上游移动）—— 未判定**不是**「已验证」（ADR-0049）。",
  ];

  if (failures.length) {
    return {
      ok: false,
      code: 1,
      counts: { total: cites.length, judged, unjudged, external, overflow },
      lines: [`❌ ⑥ **有 \`文件:行号\` 引用越界**`, `  （${head}）`, "", ...failures, "", ...boundary,
        "",
        "  怎么修：引**符号名**（本仓首选），或核对该文件当前行数后订正行号；",
        "  归档层（`CHANGELOG.md`）与冻结 ADR 的行号**不要动**（冻结 ADR 写补记）。"],
    };
  }

  return {
    ok: true,
    code: 0,
    counts: { total: cites.length, judged, unjudged, external, overflow },
    lines: [
      `✔ ⑥ 没有越界的 \`文件:行号\` 引用（${head}）`,
      ...boundary,
      ...(opts.verbose ? ["", ...unjudgedList] : []),
    ],
  };
};
