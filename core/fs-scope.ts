// dsh-shadow —— core/fs-scope.ts：会话作用域的 fs 门面（ADR-0074）。
//
// 只补一件事：`writeText` 的 `sandboxPolicy` 参数。
//
// **为什么必须补**（实测，见 CHANGELOG v1.15.31；机制描述于 v1.15.40 用**运行体**复核后更正）：
//   `dsh-fs-sandbox` 的围栏取 `sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()`
//   —— 运行体 `dsh-web-app@0.1.5-rc.2` 的 `@deepseek-ai/dsh-fs-sandbox/lib/index.js:158`
//   （**行号随版本漂移**；ADR 里引用过的 `:154` 是更早的构建，同一行逻辑）。
//   而不带 session 调 `resolve()` 得到的是**服务级**策略（`@deepseek-ai/dsh-sandbox-policy/lib/index.js`）：
//     :116  this.defaultMode  = config.mode                            ← **部署配置的默认档**（**不是**环境变量）
//     :117  this.workspaceRoot = resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())
//     :141  mode:          request.mode ?? (session===void 0 ? void 0 : overrideOf(session)) ?? this.defaultMode
//     :142  workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot)
//   ⇒ 只有传了 session，`workspaceRoot` 才取 `session.header.cwd`（= 会话工作区）；
//     不传时取**部署配置的根**（最后才退化到 `process.cwd()`，即 dsh 服务进程的启动目录）。
//   本插件的写入目标是**会话工作区** `session.header.cwd`。两者不同时（`dsh web` 从别处启动、
//   会话切到别的项目），`isPathUnder(target, …)` 判定失败 ⇒ 抛
//     cannot write "…": file access denied under workspace-write mode
//   实测：`G:\project\dsh1\.shadow\…` 一条都落不了盘，而**该会话的策略其实是 danger-full-access**。
//
//   **⚠ 两层别混（v1.15.40 第 2 轮亲踩过，留档防复发）**：
//   · **包层**：`dsh-sandbox-policy` 只读 `config.mode` / `config.workspaceRoot`（包内没有环境变量逻辑）；
//   · **部署层**：部署组合 `@deepseek-ai/dsh-base/cordis.patch.yml` 的 `sandbox-policy` 行**把这些值配出来** ——
//     运行体 `dsh-web-app@0.1.5-rc.2` 的该文件 `:208-212`（原文）：
//         - id: sandbox-policy
//           name: '@deepseek-ai/dsh-sandbox-policy'
//           config:
//             mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
//             workspaceRoot: !!js process.cwd()
//   ⇒ **本文件上方（与 ADR-0074）描述的 `DSH_PERMISSION_MODE` / `process.cwd()` 属于部署层，是准确的。**
//   **我犯过的错**：曾只对三个包 grep `DSH_PERMISSION_MODE` 得 0 命中，就断言「该环境变量不存在」——
//   那是**枚举范围没划全**（漏了部署组合），与「靠样本不全下结论」同一族。**教训：grep 之前先写清范围。**
//
//   **平台自己的包也是这个模式**（同一运行体的旁证）：
//     `dsh-web-app/lib/…/index.js:168` `static inject = ['fs','sandboxPolicy','sessions','typert']`
//     `:200` `workspaceRoot: header.cwd ?? scope.sandboxPolicy.workspaceRoot`
//     ⇒ **先会话 cwd、再退服务根**——与本门面同一取向。
//
//   **访问方式是平台明确给出的**（运行体 Service 目录 `ctx.sandboxPolicy` 契约原文）：
//     `access.optional = { expression: "ctx.get(\"sandboxPolicy\")", requiresUndefinedCheck: true }`
//     `access.hardDependency = { inject: ["sandboxPolicy"], expression: "ctx.sandboxPolicy" }`
//     `resolve(...)` 的说明：「**A session cwd is its workspace-write boundary; the configured root is
//     the fallback for agentless calls and sessions without a cwd.**」
//     ⇒ 普通插件**可以**读它；下文 `sessionPolicy` 走的正是 optional 那条（并自带 undefined 检查）——
//       即**本门面从一开始就是「向平台要策略」**，没有自己推导 mode/root。
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
