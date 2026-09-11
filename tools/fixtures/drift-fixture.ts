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

// ── 检测 B：同一 `字段=字面量` 跨文件出现 ──
export const gateHere = (p: any) => p?.phase === "ghost";   // MARK:B-SHARED
export const onlyLocal = (p: any) => p?.only === "here";

// 占位：让夹具自洽
declare function rebuild(x: string): Promise<void>;
declare function shadowSourcesFingerprint(fs: any, ws: string): Promise<string | undefined>;
