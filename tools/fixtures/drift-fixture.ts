// dsh-shadow —— tools/fixtures/drift-fixture.ts：**投影漂移审计的标定夹具**。
// 不是产品代码，只被 `tools/audit-drift.selftest.ts` 读，用来证明检测器**抓得到已知答案**。
//
// 每个用例末尾带 `MARK:<名>` 标记，测试**按标记定位行号**（不硬编码行号 ⇒ 夹具改动不会假红/假绿）。
// 期望（POS 应报 / NEG 不得报）写在标记旁。

// ── POS-1：裸 return + `core.` 进程内集合 + 无源探针 ⇒ 应报
export const ensureThingA = async (core: any, ws: string) => {
  if (!ws) return;
  if (core.indexDirty.has(ws) && core.indexCacheWarm.has(ws)) return; // MARK:POS-1
  await rebuild(ws);
};

// ── POS-2：本文件 `new Set` 出来的局部名 ⇒ 应报
export const ensureThingB = async (ws: string) => {
  const warm = new Set<string>();
  if (warm.has(ws)) return; // MARK:POS-2
  await rebuild(ws);
};

// ── POS-3：`<ident>.<prop>` 的 prop 名表示进程内记账（`*Map`）⇒ 应报
export const ensureThingC = async (ctx: any, k: string) => {
  if (ctx.cacheMap.has(k)) return; // MARK:POS-3
  await rebuild(k);
};

// ── NEG-1：**返回值**的早退 = 缓存命中（正当）⇒ 不得报
export const readThing = (cache: Map<string, any>, k: string) => {
  if (cache.has(k)) return cache.get(k); // MARK:NEG-1
  return undefined;
};

// ── NEG-2：条件用**探针赋值的局部名**（ADR-0069 修复后的写法）⇒ 不得报
export const ensureThingD = async (fs: any, ws: string, prev: string | undefined) => {
  const warm = true;
  if (warm) {
    const fpNow = await shadowSourcesFingerprint(fs, ws);
    if (fpNow !== undefined && prev !== undefined && fpNow === prev) return; // MARK:NEG-2
  }
  await rebuild(ws);
};

// ── NEG-3：条件**直接含源探针** ⇒ 不得报
export const ensureThingE = async (fs: any, t: any) => {
  if (await fs.stat(t)) return; // MARK:NEG-3
  await rebuild("x");
};

// ── NEG-4：不含进程内集合 ⇒ 不得报
export const ensureThingF = async (flag: boolean) => {
  if (flag === true) return; // MARK:NEG-4
  await rebuild("y");
};

// ── NEG-5：**非派生件路径**上的正当早退（「已在处理，无需重复」）⇒ 不得报
//    这是函数名收窄（DERIVED_ARTIFACT_FN）要挡住的假阳。
export const push = async (core: any, id: string) => {
  if (core.pending.has(id)) return; // MARK:NEG-5
  await rebuild(id);
};

// ── NEG-6 + POS-4：**差分对**，专门标定判据 ③「条件含**探针赋值的局部名**」
//    为什么需要这一对（v1.15.58）：原来的 NEG-2 条件里**没有 `.has(`**，于是它在判据 ②
//    （要求条件里出现进程内集合）就被 `continue` 掉了，**根本走不到 ③** ——
//    也就是说 `audit-drift.lib.ts:111-117` 收集 `probeVars` 与 `:131` 用它排除这一整段，
//    **没有任何夹具能落到它上面**：把它删掉、或把它写成恒空集合，标定测试仍全绿。
//    这一对只差**一处**：条件里有没有出现「由探针赋值出来的局部名」。
//      · NEG-6：有 ⇒ 是 ADR-0069 修复后的正当写法 ⇒ **不得报**
//      · POS-4 ：没有（同样的 `.has(` 形状）⇒ **必须报**
//    两者一起通过，才证明 ③ 真的在起作用（而不是被 ② 顺手挡掉）。
export const ensureThingG = async (fs: any, ws: string) => {
  const warm2 = new Set<string>();
  const fpNow2 = await shadowSourcesFingerprint(fs, ws);
  if (warm2.has(ws) && fpNow2 !== undefined) return; // MARK:NEG-6
  await rebuild(ws);
};

export const ensureThingH = async (ws: string, other: string | undefined) => {
  const warm3 = new Set<string>();
  if (warm3.has(ws) && other !== undefined) return; // MARK:POS-4
  await rebuild(ws);
};

// ── 检测 B：同一 `字段=字面量` 跨文件出现 ──
export const gateHere = (p: any) => p?.phase === "ghost";   // MARK:B-SHARED
export const onlyLocal = (p: any) => p?.only === "here";

// ── 检测 B 回归（v1.15.32）：`?.` 与 `.` 是**同一条访问路径**，必须归到**同一个键** ──
//    旧正则 `[\w$.]+` 的字符集不含 `?` ⇒ 带可选链的一侧只能从字段名起匹配，
//    退化成 `flag=join`，与另一侧的 `x.flag=join` 归不到一起 ⇒ **静默漏报**。
//    真实案例：`world/guard/claim-admission.ts:6` 的 `isAdmissibleClaim`（唯一判据源）就是这样消失的。
//    本行与 `drift-fixture-b.ts` 的对应行配对，期望键 **`x.flag=join`**（两侧归一后合并）。
export const joinViaOptional = (x: any) => x?.flag === "join";   // MARK:B-OPT

// 占位：让夹具自洽
declare function rebuild(x: string): Promise<void>;
declare function shadowSourcesFingerprint(fs: any, ws: string): Promise<string | undefined>;
