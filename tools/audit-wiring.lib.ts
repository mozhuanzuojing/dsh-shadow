#!/usr/bin/env node
// dsh-shadow —— tools/audit-wiring.lib.ts：接线审计的**纯逻辑**（CLI 与标定测试共用同一份）。
//
// 拆出来的理由：标定测试必须验**同一份逻辑**，否则测试过了产品没改、或反之。
// 全部纯函数：输入是 `{file, text}[]`，输出是线索数组。不做 IO。

/**
 * 去掉注释（**标定测试暴露的必要修正**）。
 *
 * 为什么必须做：夹具里一句说明文字 `meta.status === "superseded"` 被当成了真代码 ——
 * 工具在扫**注释文本**，会把「文档里举的例子」报成「分支不可达」，制造纯噪声。
 * 静态分析只看代码，不看注释。
 *
 * 实现：单趟状态机，尊重 `'` / `"` / 反引号字符串与转义；跨行的块注释一并去掉。
 * **已知边界**：不处理正则字面量里的引号（本仓源码里斜杠出现在正则中的情形极少）；
 * 模板串内的插值也不解析。为此工具只做**线索发现**，命中项一律人工复核。
 */
export const stripComments = (src) => {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote = null;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (quote) {
      if (c === "\\") { out += c + (c2 ?? ""); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      // 用等量换行占位，保持行号不漂移（命中位置要能回溯到真实行）
      const seg = end < 0 ? src.slice(i) : src.slice(i, end + 2);
      out += "\n".repeat((seg.match(/\n/g) || []).length);
      i = end < 0 ? n : end + 2; continue;
    }
    if (c === "/" && c2 === "/") {
      let j = i; while (j < n && src[j] !== "\n") j++;
      i = j; continue; // 换行由下一轮保留
    }
    out += c; i++;
  }
  return out;
};

/**
 * **在 `stripComments` 之上，再抹掉字符串字面量里的“代码形状”**（v1.15.36）。
 *
 * 为什么需要（实测，不是推理）：`countCallSites` 数的是 `Name(` 形态，而**字符串里**也可能出现这个形状：
 *   `export const s = "Foo(1)";`  ⇒ 旧实现把它算成 **1 个调用点** ⇒ 该符号被判「有接线」⇒ **漏报**。
 * 实测三例（`_probe`）：注释里 `Foo(` ⇒ 0（已正确）；**字符串里 `Foo(` ⇒ 1（错）**；块注释 ⇒ 0（已正确）。
 * ⇒ **真正的盲区是字符串，不是注释** —— 我原先的记账（ADR-0062 补记 §0 的 ①）把位置记错了，
 *   且方向是**漏报**（把死代码看成活的），比误报更危险。已在 ADR 更正。
 *
 * 语义：**空白化**（保长度、保换行 ⇒ 行号不漂移），分三种情形：
 *   · 行注释 / 块注释 —— 抹掉（与 `stripComments` 同）；
 *   · `'…'` / `"…"` —— **整段抹掉**（调用点不可能出现在普通字符串里）；
 *   · `` `…` `` 模板串 —— **只抹字面部分，`${…}` 里的代码原样保留并递归处理**
 *     （`` `${f(x)}` `` 里的 `f(x)` 是**真调用**，抹掉它会制造新的漏报）。
 *
 * **已知边界**：`${…}` 里若含**未闭合的**花括号（如字符串中的 `"{"`），配对计数会偏 ——
 * 该情形在本仓不存在，且工具一律人工复核。`stripComments` 保留原语义**不动**：
 * `collectComparisons` / `hasProducer` 要匹配的正是字符串里的值，抹掉它会毁掉 B 类检测。
 */
export const maskStrings = (src) => {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      const seg = end < 0 ? src.slice(i) : src.slice(i, end + 2);
      out += blank(seg);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === "/" && c2 === "/") {
      let j = i; while (j < n && src[j] !== "\n") j++;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      out += blank(src.slice(i, Math.min(j + 1, n)));
      i = Math.min(j + 1, n);
      continue;
    }
    if (c === "`") {
      out += " ";
      i++;
      while (i < n) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        if (src[i] === "`") { out += " "; i++; break; }
        if (src[i] === "$" && src[i + 1] === "{") {
          let depth = 1, j = i + 2;
          while (j < n && depth > 0) { if (src[j] === "{") depth++; else if (src[j] === "}") depth--; if (depth > 0) j++; }
          out += "${" + maskStrings(src.slice(i + 2, j)) + "}";
          i = j + 1;
          continue;
        }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
};

/**
 * **路径分类：哪些进「谁会调用这个导出」的语料面**（v1.15.60 改名，原名 `isProductionPath`）。
 *
 * ⚠ **它与 `audit-drift.lib.ts` 的 `isProductModulePath` 问的不是同一个问题**，两份**刻意不同**：
 *   · 本函数（wiring）问「**谁可能调用这个导出**」⇒ 产品代码**与 `tools/`（CLI/审计工具）都算调用者**，
 *     排除的只是测试与产物（`test/`/`dist/`/`node_modules/`/`fixtures/`）。
 *     若把 `tools/` 也排除，CLI 调用的导出会统统落进「零引用」桶 —— 那是**另一种谎**。
 *   · drift 的 `isProductModulePath` 问「**产品模块之间**有没有同一条判据被表达两次 ⇒ 它必须排除 `tools/`。
 * 2026-09-12 的审查把这对同名不同义报成「判据分叉」——**分叉是有理的，问题是名字**；故按用途改名。
 *
 * **标定测试暴露的必要修正**：v1 用 `/[\\/]test[\\/]/` 判断 —— 该正则**要求前导斜杠**，
 * 而相对路径是 `test/foo.ts`（无前导斜杠）⇒ **顶层 `test/` 从未被排除**。
 * 后果致命：测试夹具里的 `status: "superseded"` 被当成**生产写入者**，
 * 恰好**掩盖**了本轮要抓的那处真缺陷（`meta.status === "superseded"` 无写入者）。
 * ⇒ 改为**按路径分段**判断，与相对/绝对路径无关。
 */
/**
 * **「这条路径算不算测试面」—— 唯一来源**（v1.15.58 从 CLI 搬进 lib，并补标定）。
 *
 * 为什么值得单列：这条判据由一处**真缺陷**修来（v1.15.43）—— 旧写法 `!isCallerCorpusPath(p)`
 * 会把 `dist/**`、`node_modules/**` 的 `.d.ts` 也算成「测试引用」⇒ A 段那一列**虚高**，
 * 分诊时会把「零测试引用」读成「已被测试覆盖」。
 * 它此前定义在 **CLI**（`tools/audit-wiring.ts:61`），而 CLI 不在任何 selftest 的覆盖面上 ⇒
 * 改成 `p.includes("test")`、退回旧写法、或整条删掉，**6 个 selftest 全部照旧全绿**，
 * 而那一列会静默改变含义。搬进 lib 后由 `audit-wiring.selftest.ts` ⑫ 锁住。
 */
export const isTestPath = (p) => p === "test" || p.startsWith("test/");

export const isCallerCorpusPath = (p) => {
  const segs = String(p).replace(/\\/g, "/").split("/").filter(Boolean);
  const EXCLUDE = new Set(["node_modules", "dist", "test", "tests", "fixtures", "__tests__"]);
  return !segs.some((s) => EXCLUDE.has(s));
};

/** 从源码文本抽取「字段 === "值"」比较点。返回 Map<`field=value`, 位置[]> */
export const collectComparisons = (files) => {
  // 抓 `=== "字面量"`，左侧取最后一个标识符字段名
  const cmpRe = /\b([\w$]+)\s*===\s*["']([^"']+)["']/g;
  const out = new Map();
  for (const { file, text } of files) {
    stripComments(text).split("\n").forEach((line, i) => {
      for (const m of line.matchAll(cmpRe)) {
        const key = `${m[1]}=${m[2]}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(`${file}:${i + 1}`);
      }
    });
  }
  return out;
};

/**
 * 某字段-值是否有**生产者**（v3：字段 + 值联合，支持三元/条件式）。
 * 判定：同一行内，字段名与字面量在 200 字符窗口内共现（任一顺序）。
 * **跨字段的字面量不计入** —— 这是 v2 漏报的根因（`verdict: "superseded"` 不该算作 `status` 的写入者）。
 */
export const hasProducer = (files, field, value) => {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const near = new RegExp(`\\b${esc(field)}\\b[^;\\n]{0,200}?["']${esc(value)}["']`);
  const nearRev = new RegExp(`["']${esc(value)}["'][^;\\n]{0,200}?\\b${esc(field)}\\b`);
  // **关键**（标定测试暴露）：先把「比较表达式」整段删掉，否则**比较行自身**会被误认成生产者
  //   —— `if (r.phase === "ghost")` 里 `phase` 与 `"ghost"` 同行共现，于是「读点」冒充了「写入点」，
  //   真正的不可达分支永远报不出来（这正是标定测试第 ③ 组抓到的）。
  const stripCmp = (line) => line.replace(/[!=]==?\s*["'][^"']*["']/g, " ");
  const hits = [];
  for (const { file, text } of files) {
    let n = 0;
    for (const line of stripComments(text).split("\n")) {
      const l = stripCmp(line);
      if (near.test(l) || nearRev.test(l)) n++;
    }
    if (n) hits.push(`${file}×${n}`);
  }
  return hits;
};

/** 无写入者的比较点（不可达分支的线索）。 */
export const findOrphanComparisons = (files) => {
  const out = [];
  for (const [key, where] of collectComparisons(files)) {
    const at = key.indexOf("=");
    const field = key.slice(0, at);
    const value = key.slice(at + 1);
    if (!hasProducer(files, field, value).length) out.push({ field, value, where });
  }
  return out.sort((a, b) => `${a.field}=${a.value}`.localeCompare(`${b.field}=${b.value}`));
};

/**
 * **调用点计数**（A 类的关键修正）。
 *
 * 为什么需要：v1 的 A 类只数「符号名出现次数」，于是
 * **类型导入 + 接口签名**也算「被引用」—— 本仓真实案例 `ChangeSet`：
 * `import type { ChangeSet }` + `invalidateFor?(set: ChangeSet)` 两处提名字，
 * 却**从不实例化、从无调用点**，于是漏报。
 *
 * 判据：数 `Name(` 形态的调用/实例化（含 `new Name(`），再从总数里减去**定义形态**
 *   （`function Name(` / `class Name` / `Name = (` / `Name(` 出现在声明里）。
 * 纯文本启发式：不解析类型位置，故 `Foo(x)` 这种同名调用可能误计 —— 命中项仍需人工复核。
 *
 * **v1.15.36 修正**：改用 `maskStrings` 而非 `stripComments`（见其注释）——
 *   字符串字面量里的 `Name(` 曾被算成调用点 ⇒ **漏报**（把死代码看成活的）。
 */
export const countCallSites = (files, name) => {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const callRe = new RegExp(`\\b${esc}\\s*\\(`, "g");
  // **只减 `function Name(`**（标定测试修正）：`callRe` 要求名字后紧跟 `(`，
  //   故 `const Called = (...)` 这种**箭头函数定义不会被 callRe 匹配**，不该被减；
  //   `class Name {` 同理无括号。v1 把这两类也减了 ⇒ 有调用点的符号被算成 0（漏报反向）。
  const defRe = new RegExp(`(?:async\\s+)?function\\s+${esc}\\s*\\(`, "g");
  let calls = 0, defs = 0;
  const where = [];
  for (const { file, text } of files) {
    const t = maskStrings(text);
    const c = (t.match(callRe) || []).length;
    const d = (t.match(defRe) || []).length;
    if (c - d > 0) where.push(`${file}×${c - d}`);
    calls += c; defs += d;
  }
  return { sites: calls - defs, where };
};

// ─────────────────────────────────────────────────────────────────────────────
// A 类的**分桶判据**（v1.15.36）：把「一个 33 条的大堆」拆成「三种不同性质的线索」。
//
// 为什么必须拆（实测 ADR-0062 补记 §0 的三条成因，逐条验证后的真实形态）：
//   ① 调用点只在**字符串/注释**里  → 已由 `maskStrings` 修掉（不再制造「假调用点」）；
//   ② 经**数组/变量间接调用**（`for (const g of guards) g(x)`）→ `Name(` 数不出来 ⇒ 误报；
//   ③ 「成对导出、只接一半」的**平行 API**（谓词接线、`assert*` 包装不接线）→ 误报。
// ② ③ 都**无法靠文本分析解决**（要类型/数据流分析）。故本工具**不去猜「它到底有没有被调用」**，
// 而是**如实分桶**：被 import 过的、与已接线符号配对的，各自单独列出并标注——
// 让人工复核从「33 条一条条查」变成「先看性质最可疑的那一桶」。
// 这是本仓对「工具答不了的问题」的一贯处置：**不伪造精度，只把线索分类得更可操作**。
// ─────────────────────────────────────────────────────────────────────────────

/** 从源码文本抽取**被具名 import / re-export 的符号**。返回 Map<file, Set<name>>。 */
export const collectImported = (files) => {
  const out = new Map();
  // `import { a, b as c } from "…"` / `export { a, b } from "…"`（只取**本名**，忽略 as 别名）
  const re = /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from/g;
  for (const { file, text } of files) {
    const set = out.get(file) || new Set();
    for (const m of maskStrings(text).matchAll(re)) {
      for (const raw of m[1].split(",")) {
        const nm = raw.trim().split(/\s+as\s+/)[0].trim();
        if (nm) set.add(nm);
      }
    }
    out.set(file, set);
  }
  return out;
};

/** 某符号是否**被生产代码 import**（任一处具名导入列表里出现）。 */
export const importedBy = (files, name) => {
  const imported = collectImported(files);
  const hits = [];
  for (const [file, set] of imported) if (set.has(name)) hits.push(file);
  return hits.sort();
};

/** 去掉 `import … from` / `export … from` **整行**（空白化，保行数）——用于「导入之外还有没有提及」。 */
export const stripImportLines = (text) =>
  String(text).split("\n").map((l) => (/^\s*(?:import|export)\b.*\bfrom\b/.test(l) ? " ".repeat(l.length) : l)).join("\n");

/**
 * **裸提及计数**（盲区 ② 的真判据，v1.15.36）。
 *
 * 为什么需要：A2「被 import 但无直接调用点」混着两种完全不同的东西 ——
 *   · 经**数组/回调/默认参数**间接调用，或只出现在**类型位置**（如 `set: ChangeSet`）⇒ **正当**；
 *   · 被 import 了却**除导入行外再无任何提及** ⇒ **未使用的导入**，真可疑。
 * 实测（真仓库 204 文件 / 516 导出，A2 候选 4 个）本判据**恰好切开**：
 *   `ledgerMismatch` 裸提及 **0**（唯一可疑）· `ChangeSet`/`renderExperience`/`sembleCandidates` 各 **1**
 *   （分别是类型位置 / `exps.map(renderExperience)` / 默认参数值 —— 全是正当用途）。
 * ⇒ 它把「8 条要人工查」缩到「1 条真的要看」。**这是文本分析能给出的最强信号**。
 *
 * 做法：统计掩码后、**去掉导入行**的文本里 `\bname\b` 的出现次数，再减去**声明处那一次**。
 * **已知边界**：`-1` 假设声明只贡献一次提及；重导出（barrel）与本文件多次声明会偏。
 * 故仍属线索级 —— 它**缩小范围**，不定罪。
 */
export const bareMentions = (files, name, declFile) => {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  let total = 0;
  const where = [];
  for (const { file, text } of files) {
    const t = stripImportLines(maskStrings(text));
    const c = (t.match(re) || []).length;
    if (c) { total += c; where.push(`${file}×${c}`); }
  }
  // 减去声明文件里那一次（`export const name = (` / `export class name {` 本身算一次提及）
  const decl = files.find((f) => f.file === declFile)?.text || "";
  const declCount = (stripImportLines(maskStrings(decl)).match(re) || []).length;
  return { count: Math.max(0, total - Math.min(1, declCount)), where };
};

/** 某文件里**被具名导出的符号清单**（用于「配对导出」判定）。 */
export const exportsOf = (text) => {  const re = /^export\s+(?:const\s+(\w+)\s*=\s*(?:async\s*)?\(|function\s+(\w+)|async\s+function\s+(\w+)|class\s+(\w+))/gm;
  const out = [];
  for (const m of text.matchAll(re)) {
    const nm = m[1] || m[2] || m[3] || m[4];
    if (nm) out.push(nm);
  }
  return out;
};

/**
 * **配对导出**判定（盲区 ③ 的可操作化）：`assertX` ↔ `x` 这类成对导出的另一半。
 *
 * 用例（本仓真实形态）：`notRevoked` 与 `assertNotRevoked` 同文件导出，
 * 引擎只 import 了**谓词**，`assert*` 包装无人调用 —— 那不是「忘接线」，是**一处决定**。
 * 双向匹配：给 `assertNotRevoked` 找 `notRevoked`；给 `notRevoked` 找 `assertNotRevoked`。
 */
/**
 * **A 段分桶判据 —— 唯一来源**（v1.15.58 从 CLI 搬进来）。
 *
 * 为什么必须放在 lib：此前这条 ternary 写在 `tools/audit-wiring.ts`，而
 * `tools/audit-wiring.selftest.ts` 的 ⑪ **在测试内重写了一遍同样的 ternary** 再断言
 * 「四桶之和 = A 段总数」—— 那是**同义反复**（分桶值由同一段代码赋出，和必然成立），
 * 而且它验证的是**测试自己那份拷贝**：把产品侧改成任何东西，标定测试照样全绿。
 * 一条「改坏了也不会红」的标定测试比没有测试更坏：它给的是**虚假的确定性**。
 *
 * 优先级（越靠前越可疑）：**A3（成对导出，只接一半）> A1（零引用）> A2b（导入即闲置）> A2a（间接调用）**。
 * 各桶含义与复核方式见 CLI 的 `BUCKETS` 文案。
 */
export const bucketOf = (row: { pair?: unknown; imports?: unknown[]; bare?: number }): "A3" | "A1" | "A2b" | "A2a" =>
  row.pair ? "A3" : !(row.imports ?? []).length ? "A1" : row.bare === 0 ? "A2b" : "A2a";

export const pairedExport = (names, name) => {
  const has = (x) => names.includes(x);
  if (/^assert/i.test(name)) {
    const rest = name.replace(/^assert/, "");
    for (const cand of [rest.charAt(0).toLowerCase() + rest.slice(1), rest]) if (has(cand)) return cand;
  }
  const cap = "assert" + name.charAt(0).toUpperCase() + name.slice(1);
  if (has(cap)) return cap;
  return undefined;
};

