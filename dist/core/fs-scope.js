/**
 * 该会话自己的沙箱策略；取不到（无 session、宿主未提供 `sandboxPolicy`、调用抛错）时返回
 * `undefined` —— 门面随即**原样返回原 fs**，即维持旧行为，不改变任何已有语义。
 *
 * 宿主未提供 `sandboxPolicy` 时不是「降级」：`dsh-fs-sandbox` 自己 `inject: ["sandboxPolicy"]`，
 * 该服务缺失时**围栏本身不存在**（用的是不带围栏的后端），写入不受影响。
 */
export function sessionPolicy(context, session) {
    if (!session)
        return undefined;
    try {
        const sp = context?.get?.("sandboxPolicy");
        return sp && typeof sp.resolve === "function" ? sp.resolve({ session }) : undefined;
    }
    catch {
        return undefined;
    }
}
/** 取当前 agent 的会话并解析其沙箱策略（写侧入口的语法糖）。 */
export function policyForAgent(context, agent) {
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
export function scopedFs(rawFs, policy) {
    if (!rawFs || !policy)
        return rawFs;
    const f = {
        resolve: (...a) => rawFs.resolve(...a),
        readText: (...a) => rawFs.readText(...a),
        listDir: (...a) => rawFs.listDir(...a),
        // 两个受围栏的操作：调用方省略 policy 才补；显式给了就用调用方的（不覆盖）。
        writeText: (target, content, expected, signal, sp) => rawFs.writeText(target, content, expected, signal, sp ?? policy),
    };
    if (typeof rawFs.stat === "function")
        f.stat = (...a) => rawFs.stat(...a);
    // `editText` 是**另一个**受围栏的操作。插件今天不调它，但门面若只补写不补改，
    // 就是「同一处机制只修了一半」——正是本仓反复挖到的那类断线。故一并补上。
    if (typeof rawFs.editText === "function") {
        f.editText = (target, edit, expected, signal, sp) => rawFs.editText(target, edit, expected, signal, sp ?? policy);
    }
    return f;
}
