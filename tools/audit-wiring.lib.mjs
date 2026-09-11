#!/usr/bin/env node
// dsh-shadow —— tools/audit-wiring.lib.mjs：接线审计的**纯逻辑**（CLI 与标定测试共用同一份）。
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
 * 路径分类：哪些是**生产源码**（其余为测试/产物，不作数）。
 *
 * **标定测试暴露的必要修正**：v1 用 `/[\\/]test[\\/]/` 判断 —— 该正则**要求前导斜杠**，
 * 而相对路径是 `test/foo.ts`（无前导斜杠）⇒ **顶层 `test/` 从未被排除**。
 * 后果致命：测试夹具里的 `status: "superseded"` 被当成**生产写入者**，
 * 恰好**掩盖**了本轮要抓的那处真缺陷（`meta.status === "superseded"` 无写入者）。
 * ⇒ 改为**按路径分段**判断，与相对/绝对路径无关。
 */
export const isProductionPath = (p) => {
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
    const t = stripComments(text);
    const c = (t.match(callRe) || []).length;
    const d = (t.match(defRe) || []).length;
    if (c - d > 0) where.push(`${file}×${c - d}`);
    calls += c; defs += d;
  }
  return { sites: calls - defs, where };
};
