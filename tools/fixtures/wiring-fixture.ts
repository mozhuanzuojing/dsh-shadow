// 接线审计工具的**标定夹具**（不是产品代码，只被 tools/audit-wiring.selftest.ts 读）。
//
// 目的：本工具在真仓库上曾报「0 findings」，而我**确证过**至少有 3 处不可达分支。
// 一个不会报警的检测器，报「0」是没有意义的 —— 故先用**已知答案的夹具**标定它。
//
// 夹具里有 4 个字段-值组合，其中 2 个有写入者、2 个没有：

export interface Row {
  status: string;
  kind: string;
  phase: string;
}

// ── 有写入者（不得被报）──
// ① 直写
export const a = (): Row => ({ status: "ok", kind: "x", phase: "idle" });
// ② **三元写**（v1 检测器漏掉的就是这种 → 造成误报）
export const b = (violated: boolean): Row => ({ status: violated ? "bad" : "ok", kind: "x", phase: "idle" });
// ③ 赋值写
export const c = (r: Row, on: boolean) => { r.kind = on ? "y" : "x"; return r; };

// ── 读点：两个可达（"ok"/"bad"/"y" 有写入者）+ 两个**不可达**（"ghost" 无处生产）──
export const d = (r: Row) => {
  if (r.status === "ok") return 1;          // 可达
  if (r.status === "bad") return 2;         // 可达（靠三元写）
  if (r.kind === "y") return 3;             // 可达（靠赋值写）
  if (r.phase === "ghost") return 4;        // ★ 不可达：没有任何地方生产 "ghost"
  if (r.kind === "phantom") return 5;       // ★ 不可达：没有任何地方生产 "phantom"
  return 0;
};

// ── 干扰项：把该字面量生产成**别的字段**（模拟本仓真实踩过的坑）──
// 真实案例：`meta.status === "superseded"` 不可达，但 `"superseded"` 被生产成 `verdict`/`outcome`。
// 一个按「字面量」判定的检测器会因此漏报 —— 本夹具的 ghost 不走这条，另设：
export const e = () => ({ verdict: "phantom" });   // "phantom" 有生产者，但**不是 kind 字段**

// ── A 类夹具：导出但**无调用点**（本仓真实案例：`ChangeSet` 实现了、测了、生产里从不实例化）──
// 期望：`NeverCalled`（函数）与 `NeverBuilt`（类）被判「无调用点」；
//       而 `Called` / `Built` 有调用点、**不得**被报。
export const Called = (x: number) => x + 1;
export class Built { readonly v = 1; }
export const caller = () => { const c = Called(1); return new Built().v + c; };

export const NeverCalled = (x: number) => x + 2;          // ★ 无调用点
export class NeverBuilt { readonly w = 2; }               // ★ 从不实例化
export const typeOnlyUser = (_a: NeverBuilt | null) => _a; // 仅作出现在**类型位置**，不是调用点
