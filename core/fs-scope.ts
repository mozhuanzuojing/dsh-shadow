// dsh-shadow —— core/fs-scope.ts：会话作用域的 fs 门面（ADR-0074）。
//
// 只补一件事：`writeText` 的 `sandboxPolicy` 参数。
//
// **为什么必须补**（实测，见 CHANGELOG v1.15.31）：
//   `dsh-fs-sandbox` 的围栏取 `sandboxPolicy ?? ctx.sandboxPolicy.resolve()`（lib/index.js:154），
//   而不带 session 调 `resolve()` 得到的是**部署 fallback**（dsh-sandbox-policy/lib/index.js:141-148）：
//     mode          = process.env.DSH_PERMISSION_MODE ?? "workspace-write"
//     workspaceRoot = process.cwd()（**dsh 服务进程的启动目录**，不是会话工作区）
//   本插件的写入目标是**会话工作区** `session.header.cwd`。两者不同时（`dsh web` 从别处启动、
//   会话切到别的项目），`isPathUnder(target, process.cwd())` 判定失败 ⇒ 抛
//     cannot write "…": file access denied under workspace-write mode
//   实测：`G:\project\dsh1\.shadow\…` 一条都落不了盘，而**该会话的策略其实是 danger-full-access**。
//
// **边界（不越权）**：只填写调用方**没给**的策略；显式传入的一律原样转发。
// 策略来自 `sandboxPolicy.resolve({ session })`，即**该会话自己的** mode ——
// 本门面从不构造 `danger-full-access`，也从不覆盖会话的 read-only（测试 ④ 是这条的正对照）。
//
// **为什么用门面而不是改 40 处调用点**：所有写入都经由同一个 `fs` 对象向下传递，
// 在**取得 fs 的三处**（写侧 flush / 索引重建 / 读侧 queryDeps）包一次，
// 等价于全部写入点都补上了策略，且不必动任何 persistence 模块的签名。
import type { AgentLike } from "./types.js";

/**
 * 该会话自己的沙箱策略；取不到（无 session、宿主未提供 `sandboxPolicy`、调用抛错）时返回
 * `undefined` —— 门面随即**原样返回原 fs**，即维持旧行为，不改变任何已有语义。
 *
 * 宿主未提供 `sandboxPolicy` 时不是「降级」：`dsh-fs-sandbox` 自己 `inject: ["sandboxPolicy"]`，
 * 该服务缺失时**围栏本身不存在**（用的是不带围栏的后端），写入不受影响。
 */
export function sessionPolicy(context: any, session: any): any {
  if (!session) return undefined;
  try {
    const sp = context?.get?.("sandboxPolicy");
    return sp && typeof sp.resolve === "function" ? sp.resolve({ session }) : undefined;
  } catch {
    return undefined;
  }
}

/** 取当前 agent 的会话并解析其沙箱策略（写侧入口的语法糖）。 */
export function policyForAgent(context: any, agent: AgentLike | undefined): any {
  return sessionPolicy(context, agent?.session);
}

/**
 * 把会话策略补进 `writeText` / `editText` 的 fs 门面。
 * 无策略时**原样返回** `rawFs`（零行为变化），故本函数在旧宿主上等于恒等变换。
 *
 * 只转发**插件真正使用**的方法，且只补**真实存在**的方法：
 * `persistence/meta.ts:50` 用 `typeof fs.stat === "function"` 做特性探测，
 * 无条件补一个 `stat` 会让探测恒真、改变既有分支。
 */
export function scopedFs(rawFs: any, policy: any): any {
  if (!rawFs || !policy) return rawFs;
  const f: any = {
    resolve: (...a: any[]) => rawFs.resolve(...a),
    readText: (...a: any[]) => rawFs.readText(...a),
    listDir: (...a: any[]) => rawFs.listDir(...a),
    // 两个受围栏的操作：调用方省略 policy 才补；显式给了就用调用方的（不覆盖）。
    writeText: (target: any, content: any, expected?: any, signal?: any, sp?: any) =>
      rawFs.writeText(target, content, expected, signal, sp ?? policy),
  };
  if (typeof rawFs.stat === "function") f.stat = (...a: any[]) => rawFs.stat(...a);
  // `editText` 是**另一个**受围栏的操作。插件今天不调它，但门面若只补写不补改，
  // 就是「同一处机制只修了一半」——正是本仓反复挖到的那类断线。故一并补上。
  if (typeof rawFs.editText === "function") {
    f.editText = (target: any, edit: any, expected?: any, signal?: any, sp?: any) =>
      rawFs.editText(target, edit, expected, signal, sp ?? policy);
  }
  return f;
}
