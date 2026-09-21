// dsh-shadow —— persistence/jsonl-append.ts：`.shadow/**/*.jsonl` 的**唯一一份**追加实现（v1.19.0 / `adr/0097` D2）。
//
// ## 为什么抽出来（判据收一处）
//
// 本仓原先只有**一处**内联实现（`query/observatory.ts` 的 `recordQueryObservation`）。审计流若再写一份
// 就是「同一件事两份实现」——本仓为此返工过两次（`tools/comparison-points.lib.ts` 的两个正则副本、
// `core/util.ts:numOr` 的三处默认值回落）。⇒ 抽到这里，两处共用。
//
// ## 边界（每条都有实测依据，别改坏）
//
// ① **只追加**：先在内存里读回已有内容，再整文件写回 —— 宿主的 fs 门面只给 `writeText`，**没有 append 原语**。
// ② **「还没有这个文件」不是失败**：真实 fs 对**不存在的路径** `readText` 会**抛错**，旧版把这个抛错
//    归进失败 ⇒ 首写永远失败、目录永远建不出来（v1.15.94 缺陷 A，默认开启的观测层因此一次都没落盘）。
//    ⇒ 只有 `isNotFound(e)` 才当空串；其它读错误照实返回失败。
// ③ **同进程内串行**：同一 `rel` 的「读-改-写」必须排队。否则两次并发调用会各自读到同一份 `prev`，
//    后写覆盖先写（`readText` 与 `writeText` 都是 `await`，交错是常态）。这是**顺带修掉的一类丢行**
//    （原先 `query-log` 就有这个窗口）。
//    ⚠ **跨进程未测**（与 `query-log` 同一边界）：两个进程同时写同一段仍可能丢行。
// ④ 目录由宿主 `writeText` 的 `mkdir -p` 建（`dsh-fs-local`），本函数**不**自己建目录。
import { isNotFound, errText } from "../core/util.js";
/** 同一个 `ws|rel` 上的「读-改-写」串行化（进程内；随模块生命周期存在）。 */
const chains = new Map();
const serialize = (key, fn) => {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(key, next.then(() => undefined, () => undefined));
    return next;
};
/**
 * 向 `<ws>/<rel>` **追加**一行（调用方自己保证 `line` 不含换行）。
 *
 * 失败**不静默**：返回 `{ ok:false, reason }`，由调用方决定怎么留痕（`query-log` 走 `deps.noteDegrade`，
 * 审计流走 `core.lastFlushError` + `console.error`）。
 */
export const appendJsonlLine = async (fs, ws, rel, line) => {
    if (!fs || !ws)
        return { ok: false, reason: "无 fs 或无工作区" };
    if (!rel)
        return { ok: false, reason: "无追加目标" };
    return serialize(`${ws}|${rel}`, async () => {
        let target;
        try {
            target = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        }
        catch (e) {
            return { ok: false, reason: `定位追加目标失败：${errText(e)}` };
        }
        // 追加要读回**已有内容**，但「还没有这个文件」是**正常**的（第一次写）——
        // 与「读失败」必须分开（见文件头 ②）。
        let prev = "";
        try {
            prev = (await fs.readText(target)) || "";
        }
        catch (e) {
            if (!isNotFound(e))
                return { ok: false, reason: `读取既有内容失败：${errText(e)}` };
            prev = "";
        }
        try {
            await fs.writeText(target, prev.endsWith("\n") || !prev.length ? prev + line + "\n" : prev + "\n" + line + "\n");
            return { ok: true };
        }
        catch (e) {
            return { ok: false, reason: `追加写入失败：${errText(e)}` };
        }
    });
};
