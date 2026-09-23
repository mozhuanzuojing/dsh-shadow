#!/usr/bin/env node
// dsh-shadow —— tools/comparison-points.lib.ts：「`X === "字面量"` 比较点」的**唯一判据**。
//
// 为什么要有这个文件（**判据收一处**，ADR-0063 / ADR-0070）：
//   本仓有**两个**审计工具都要扫这类比较点，它们问的问题**不同**：
//     · `tools/audit-wiring.ts` B 类 —— 「某个 `字段=字面量` **只被读、生产里没有写入点**」
//       ⇒ 线索：该分支可能**永不可达**；
//     · `tools/audit-drift.ts`  B 类 —— 「同一个 `字段=字面量` 在 **≥2 个生产模块**被表达」
//       ⇒ 线索：同一条判据可能**分了两处口径**。
//   **「什么算一个比较点」是两者共同的输入**，此前各自写了一份正则 ⇒ 同一缺陷要修两遍，
//   且极易漏修一遍。
//
//   v1.15.64 **实测正是如此**（本轮 T8 的副产品）：
//     ① 修 T8-B 时我在 `core/util.ts` 加了 `numOr`，里面有 `typeof v === "number"`；
//     ② `audit-wiring` 的棘轮如实报「B 类线索**变多**：b_keys 115 → 116」；
//     ③ 顺藤查出 `typeof x === "<类型名>"` 是**定义上的假阳**（详见下），修掉 wiring 那一份；
//     ④ `audit-drift` 的棘轮**紧接着**报「`drift_sites` 28 → 29」—— 同一个假阳在**另一份实现**里，
//        键名不变（`v=string`），只是多了一处 site。
//   ⇒ 两个工具**互相独立地**把同一个假阳报出来，却都不修自己那份 ——
//     因为 `audit-drift.lib.ts` 自述「**看不见 `tools/` 内部**的判据分叉」（`isProductModulePath` 排除 `tools/`）。
//     本文件就是那个**共同输入**。
//
// ⚠ **键怎么取，两家刻意不同，不要「统一」**：
//   · wiring 的键只取左侧**最后一段**标识符（`r.status === "ok"` ⇒ `status=ok`）——
//     它问「这个字段有没有写入者」，接收者是谁不影响答案；
//   · drift 的键取**整条接收者链**并把 `?.` 归一（`c?.status === "supported"` ⇒ `c.status=supported`）——
//     它问「同一条判据是不是被表达了两次」，接收者正是判据身份的一部分。
//   统一键 = 同时改变两个工具的含义。共享的只是「**扫什么**」，不是「**怎么归键**」。

/** 一个比较点：`lhs === value`。 */
export interface ComparisonPoint {
  /** 左侧原文，可含接收者链与可选链（`c?.status`）。 */
  lhs: string;
  /** 左侧**最后一段**标识符（`c?.status` → `status`）。 */
  field: string;
  /** 右侧字符串字面量。 */
  value: string;
  /** **1-based** 行号（与工具输出的 `文件:行号` 一致）。 */
  line: number;
  /** 该行 `trim()` 后的片段（截断 160 字符，仅供人读）。 */
  snippet: string;
}

// 可选 `typeof ` 前缀是**故意**写成可选的：这样匹配区间从 `typeof` 开始，
// 才能在同一次匹配里把它识别出来再丢掉（见 `scanComparisons` 的 `continue`）。
// 若把 `typeof` 写在正则之外、用别的方式判，就会出现「引擎从 `v` 起匹配、看不到 `typeof`」的漏排除。
const CMP_RE_SRC = String.raw`(?:\btypeof\s+)?\b([\w$]+(?:\??\.[\w$]+)*)\s*===\s*["']([^"']+)["']`;

/**
 * **判据：`typeof x === "<类型名>"` 不是「字段 vs 值」比较，必须排除。**
 *
 * 左侧是 `typeof` 的结果、右侧是**类型名** —— 二者都**不可能**有「生产者」：
 *   · 对 wiring（问「有没有写入者」）：它**必然**落进「无写入点 ⇒ 分支可能不可达」，
 *     可这个分支的实际可达性由**运行时类型**决定，静态文本永远答不了 ⇒ 是**噪音**；
 *   · 对 drift（问「判据是否被表达两次」）：`typeof` 的名字空间只有那 8 个字面量，
 *     左侧又几乎总是泛用局部名（`v` / `x` / `b`），两个模块同时写 `typeof v === "object"`
 *     只是**巧合同名**，不是「同一条判据」⇒ 也是**噪音**。
 *
 * 真语料证据（v1.15.64 实测，**全部是假阳**）：
 *   · `v=string`   ← `core/admission/proposal.ts:90` · `core/scope.ts:10` · `core/util.ts:103`
 *   · `v=object`   ← `core/admission/proposal.ts:89` · `core/util.ts:104` · `tools/retrieval-eval.lib.ts:24`
 *   · `wiring=object` ← `tools/cli-wiring.selftest.ts:78`（`typeof b.wiring === "object"`）
 *   · `v=number`   ← `core/util.ts:96`（v1.15.64 新建，就是它把棘轮顶红的）
 *
 * **排除的是前缀 `typeof`，不是「值长成类型名」** —— 同一个字面量 `"number"` 用在真字段上
 * （`r.t === "number"`）**照旧被收集**。标定夹具 `tools/fixtures/wiring-fixture.ts` 的
 * `g` 就是这条**反例正控**：若哪天有人把排除写成「值在黑名单里就跳过」，
 * 这个正控会红 —— 那才是本仓 ADR-0063 最怕的「把一类别名一删了事」的静默掩盖。
 */
export const scanComparisons = (text: string): ComparisonPoint[] => {
  const out: ComparisonPoint[] = [];
  const re = new RegExp(CMP_RE_SRC, "g");   // 每次新建：共享一个带 `g` 的正则会被 `lastIndex` 咬
  String(text || "").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(re)) {
      if (/^typeof\b/.test(m[0])) continue;  // ← 判据只此一处，两个工具共用
      const lhs = m[1];
      out.push({
        lhs,
        field: lhs.replace(/\?/g, "").split(".").pop() || lhs,
        value: m[2],
        line: i + 1,
        snippet: line.trim().slice(0, 160),
      });
    }
  });
  return out;
};
