#!/usr/bin/env node
// dsh-shadow —— tools/audit-drift.lib.ts：**投影漂移**审计的纯逻辑（CLI 与标定测试共用同一份）。
//
// 为什么需要它（ADR-0070）：v1.15.22–26 连续五轮找到的都是**同一族**缺陷 ——
//   机制是对的，断的是「**投影跟不上源头**」，且**单元测试全绿**：
//     · ADR-0063/D5：同一条规则**三份实现**，生效的那份判据精度仅 9.8%
//     · ADR-0067  ：命中数累积用了「展开了片段」的集合（真语料 74.3% 的记忆永不命中）
//     · ADR-0069  ：`_index.md` 的新鲜度只看**进程内** Set ⇒ 别的会话写入的记忆永远进不了索引
//   逐个人工找是**体力**；本工具把它变成**可重复的检测**。
//
// 两条纪律（沿用 ADR-0062）：
//   ① **工具必须先标定**：用**已知答案**（git 历史里的修复前代码 + 夹具）证明它抓得到，再用它下结论。
//   ② 输出是**线索不是结论**：命中项一律人工复核。
//
// 纯函数：输入 `{file, text}[]`，输出线索数组。不做 IO。

/** 去掉注释（尊重字符串），保持行号不漂移。与 `audit-wiring.lib.ts` 同一份实现（此处重复是为免跨工具耦合）。 */
export const stripComments = (src: string): string => {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote: string | null = null;
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
      const seg = end < 0 ? src.slice(i) : src.slice(i, end + 2);
      out += "\n".repeat((seg.match(/\n/g) || []).length);
      i = end < 0 ? n : end + 2; continue;
    }
    if (c === "/" && c2 === "/") { let j = i; while (j < n && src[j] !== "\n") j++; i = j; continue; }
    out += c; i++;
  }
  return out;
};

/** 路径分类：生产源码 vs 其余（按**路径分段**判，避免 audit-wiring 栽过的「前导斜杠」坑）。 */
export const isProductionPath = (p: string): boolean => {
  const segs = String(p).replace(/\\/g, "/").split("/").filter(Boolean);
  const EXCLUDE = new Set(["node_modules", "dist", "test", "tests", "fixtures", "__tests__", "tools"]);
  return !segs.some((s) => EXCLUDE.has(s));
};

/** 源探针：**问源头**的调用（读盘 / 指纹 / stat）。新鲜度判据若不含这些，就是在「只问进程」。 */
const PROBE_CALL = /\b(\w*(?:Fingerprint|fingerprint)\w*|\w*listDir|listMemories|readDir|readText|\.stat|stat)\s*\(/;

/**
 * 进程内集合的 `.has(`。三种接收者形态（都是**可解释的**启发式，不是类型分析）：
 *   ① `core.<field>.has(` —— `WriterCore` 就是进程内状态的持有者（见 `core/writer-core.ts` 注释）；
 *   ② `<name>.has(`，其中 `<name>` 是**本文件**里 `const X = new Set(` / `new Map(` 出来的；
 *   ③ `<ident>.<prop>.has(`，其中 `<prop>` 的**名字本身**表示进程内记账（`*Map` / `*Set` / `*Cache`
 *      / `*Dirty` / `*Warm` / `*Seen` / `*Visited`）—— 属性名是这类语义时，它几乎必然在内存里。
 */
export const processLocalHasRe = (localCollections: Set<string>): RegExp => {
  const names = [...localCollections].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const localAlt = names.length ? `|(?:${names.join("|")})` : "";
  const bookkeeping = String.raw`\w+\.\w*(?:Map|Set|Cache|Dirty|Warm|Seen|Visited)\w*`;
  return new RegExp(`(?:\\bcore\\.\\w+${localAlt}|${bookkeeping}|\\b\\w+)\\s*\\.\\s*has\\s*\\(`);
};

/**
 * 派生件路径的函数名收窄：**新鲜度跳过守卫**只出现在「构建/维护派生件」的函数里。
 * 不加这条会把「`if (core.pending.has(id)) return;`（已在处理，无需重复）」这类**正当早退**误报。
 */
const DERIVED_ARTIFACT_FN = /(Index|Cache|Projection|Snapshot|Manifest|Materialize|Rebuild|Ensure|Refresh|Sync|Fingerprint|Digest|Version)/i;

export interface DriftLead {
  kind: "freshness-asks-process" | "predicate-expressed-twice";
  file: string;
  line: number;
  detail: string;
  snippet: string;
}

/**
 * 收集「进程内集合」的局部名：`const X = new Set(` / `new Map(`。
 * 也把 `core.<field>` 视作进程内状态 —— `WriterCore` 就是进程内状态的持有者（见 `core/writer-core.ts` 注释）。
 */
export const collectLocalCollections = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const m of stripComments(text).matchAll(/\bconst\s+(\w+)\s*(?::[^=]+)?=\s*new\s+(?:Set|Map)\b/g)) out.add(m[1]);
  return out;
};

/**
 * **检测 A（已标定）：派生件的新鲜度「只看进程、不问源」**（ADR-0069 那一族）。
 *
 * 判据（三条同时成立才报）：
 *   ① 守卫是**裸 `return;`**（不返回值）—— 排除「缓存命中直接回值」这种正当早退；
 *   ② 守卫条件里出现**进程内集合**的 `.has(`（`core.X.has(` 或本文件 `new Set/Map` 的局部名）；
 *   ③ **该守卫条件里不出现源探针**（`*Fingerprint(` / `listDir(` / `stat(` / `readText(` …），
 *      也不出现「由探针赋值出来的局部名」（`const fpNow = await xxxFingerprint(...)`）。
 *
 * 为什么 ③ 要认「探针赋值的局部名」：修复后的写法是
 *   `const fpNow = await shadowSourcesFingerprint(...); if (fpNow === fpPrev) return;`
 *   —— 条件是 `fpNow`，不是探针调用本身。不做这一步会把**已修好**的代码报成漂移（假阳）。
 */
export const findFreshnessAsksProcess = (files: { file: string; text: string }[]): DriftLead[] => {
  const leads: DriftLead[] = [];
  for (const { file, text } of files) {
    const src = stripComments(text);
    const lines = src.split("\n");
    const locals = collectLocalCollections(text);
    const hasRe = processLocalHasRe(locals);
    // 由探针赋值出来的局部名（数据流一步）：`const X = ... probe(...)` 或 `const X = await probe(...)`
    const probeVars = new Set<string>();
    for (const line of lines) {
      const m = line.match(/\bconst\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?([^\n]*)/);
      if (!m) continue;
      if (PROBE_CALL.test(m[2])) probeVars.add(m[1]);
    }
    // 逐行跟踪**最近的函数声明名**（用于收窄到派生件路径）
    let fnName = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fn = line.match(/(?:export\s+)?(?:const|function|async\s+function)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|[(<])/);
      if (fn) fnName = fn[1];
      // 守卫形式：`if (COND) return;`（一行内）
      const m = line.match(/^\s*\}?\s*if\s*\((.+)\)\s*return\s*;\s*$/);
      if (!m) continue;
      const cond = m[1];
      if (!DERIVED_ARTIFACT_FN.test(fnName)) continue;         // 收窄：只在派生件路径上找
      if (!hasRe.test(cond)) continue;                          // ② 进程内集合
      if (PROBE_CALL.test(cond)) continue;                      // ③ 条件直接含探针
      if ([...probeVars].some((v) => new RegExp(`\\b${v}\\b`).test(cond))) continue; // ③ 条件含探针赋值的局部名
      leads.push({ kind: "freshness-asks-process", file, line: i + 1, snippet: line.trim().slice(0, 160), detail: `\`${fnName}\` 的守卫只看进程内集合就跳过重建 ⇒ 别的会话/外部写入看不到（投影漂移）` });
    }
  }
  return leads.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
};

/**
 * **检测 B（已标定，线索级）：同一条判据在 ≥2 个不同模块被表达**（ADR-0063/D5 那一族）。
 *
 * 判据：把 `字段 === "字面量"` 的比较按 `字段=字面量` 归集；若**同一个 `字段=字面量`**
 * 出现在 **≥2 个不同的生产文件**，报线索。
 *
 * **键的形态（v1.15.32 起）**：接收者一并入键（`c.status=supported`，而不是 `status=supported`），
 * 且 `?.` 与 `.` **归一到同一个键** —— 否则可选链写法会让同一判据被拆成两个键而**静默漏报**
 * （修复前 `claim-admission.ts` 就是这样消失的，见下方 `findPredicateExpressedTwice` 内的注释）。
 * 副作用：`?.` 站点的键从「字段名」变成「接收者.字段名」，这是**更精确**的形态。
 *
 * **为什么只是线索**：生产者（`deriveX`）与消费者（`validateX`）分别表达同一条判据，
 * 在架构上**可能是正当的**（分层）。本仓 D5 的病根不是「两处表达」，而是「两处**口径不同**」——
 * 那一点本工具**测不出来**（没有类型/语义分析）。故此项必须人工复核。
 */
export const findPredicateExpressedTwice = (files: { file: string; text: string }[]): DriftLead[] => {
  const byKey = new Map<string, { file: string; line: number; snippet: string }[]>();
  for (const { file, text } of files) {
    stripComments(text).split("\n").forEach((line, i) => {
      // ⚠ v1.15.32 修一处**漏报**（T5 第 4 次复核时亲手踩到）：
      //   原正则 `\b([\w$.]+)` 的字符集**不含 `?`**，于是 `c?.status === "supported"`（可选链）
      //   只能从 `status` 起匹配 ⇒ 键退化成 `status=…`，与不带 `?` 的 `c.status=…` **归不到一起**。
      //   后果：同一条判据的三处里，用 `?.` 的那一处被算成「另一个键、只出现在一个文件」⇒ **静默漏报**。
      //   实测案例：`world/guard/claim-admission.ts:6` 的 `isAdmissibleClaim`（正是唯一判据源本身）
      //   就是这样从 B 段消失的 —— 而它恰恰是「两处各自重写、没用它」这条真漂移的关键证据。
      //   修法：允许 `?.`，并把键里的 `?` **归一掉**（`a?.b` 与 `a.b` 是同一条访问路径，语义等价）。
      for (const m of line.matchAll(/\b([\w$]+(?:\??\.[\w$]+)*)\s*===\s*["']([^"']+)["']/g)) {
        const key = `${m[1].replace(/\?/g, "")}=${m[2]}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push({ file, line: i + 1, snippet: line.trim().slice(0, 120) });
      }
    });
  }
  const leads: DriftLead[] = [];
  for (const [key, hits] of byKey) {
    const files = [...new Set(hits.map((h) => h.file))];
    if (files.length < 2) continue;
    // 只报「看起来像判据」的键：值不是常见的类型/状态枚举噪声（保留全部，人工复核）
    for (const h of hits) {
      leads.push({ kind: "predicate-expressed-twice", file: h.file, line: h.line, snippet: h.snippet, detail: `\`${key}\` 在 ${files.length} 个生产文件里被比较：${files.join(", ")}` });
    }
  }
  return leads.sort((a, b) => a.detail.localeCompare(b.detail) || a.file.localeCompare(b.file) || a.line - b.line);
};

/** 跑全部检测器。 */
export const auditDrift = (files: { file: string; text: string }[]) => ({
  freshness: findFreshnessAsksProcess(files),
  predicates: findPredicateExpressedTwice(files),
});

/** 测试/CLI 共用：按标记抽出**原始文本**里的行号（不剥注释 —— 标记本身写在注释里）。 */
export const markedLines = (text: string, marker: string): number[] => {
  const out: number[] = [];
  String(text).split("\n").forEach((l, i) => { if (l.includes(marker)) out.push(i + 1); });
  return out;
};
