import type { AgentLike } from "./types.js";
/**
 * 该会话自己的沙箱策略；取不到（无 session、宿主未提供 `sandboxPolicy`、调用抛错）时返回
 * `undefined` —— 门面随即**原样返回原 fs**，即维持旧行为，不改变任何已有语义。
 *
 * 宿主未提供 `sandboxPolicy` 时不是「降级」：`dsh-fs-sandbox` 自己 `inject: ["sandboxPolicy"]`，
 * 该服务缺失时**围栏本身不存在**（用的是不带围栏的后端），写入不受影响。
 */
export declare function sessionPolicy(context: any, session: any): any;
/** 取当前 agent 的会话并解析其沙箱策略（写侧入口的语法糖）。 */
export declare function policyForAgent(context: any, agent: AgentLike | undefined): any;
/**
 * 把会话策略补进 `writeText` / `editText` 的 fs 门面。
 * 无策略时**原样返回** `rawFs`（零行为变化），故本函数在旧宿主上等于恒等变换。
 *
 * 只转发**插件真正使用**的方法，且只补**真实存在**的方法：
 * `persistence/meta.ts:50` 用 `typeof fs.stat === "function"` 做特性探测，
 * 无条件补一个 `stat` 会让探测恒真、改变既有分支。
 */
export declare function scopedFs(rawFs: any, policy: any): any;
