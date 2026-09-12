import { SHADOW_ROOT } from "../core/paths.js";
const META_REL = `${SHADOW_ROOT}/_meta.json`;
/**
 * 读 `_meta.json` 的**带版本快照**。
 *
 * 顺序是 **先 `stat` 取版本、再 `readText`** —— 这个顺序是安全的那一个：
 * 若两次调用之间有人写入，我们手上的版本就比内容旧，随后的带守卫写会**失败并重试**（不会覆盖）。
 * 反过来（先读内容再取版本）会拿到「比内容新的版本」，守卫通过而**覆盖掉别人的写入**，正是要避免的。
 */
export const readMetaVersioned = async (fs, ws) => {
    const empty = { meta: {}, target: undefined, version: undefined, corrupt: false };
    if (!fs || !ws)
        return empty;
    let target;
    try {
        target = await fs.resolve(`${ws}/${META_REL}`, { cwd: ws });
    }
    catch {
        return empty;
    }
    let version = undefined;
    try {
        // `stat` 是可选能力：不支持时返回 undefined，写入退化为无条件（与旧行为一致，不再更差）。
        const info = typeof fs.stat === "function" ? await fs.stat(target) : undefined;
        if (info && info.type === "file")
            version = info.version;
    }
    catch {
        /* 目标不存在 / 后端不支持：版本保持 undefined */
    }
    let txt = "";
    try {
        txt = await fs.readText(target);
    }
    catch {
        txt = "";
    }
    let meta = {};
    let corrupt = false;
    try {
        if (txt) {
            meta = JSON.parse(txt) || {};
        }
    }
    catch {
        // **坏件 ≠ 空件**（ADR-0049）。读不出内容时**必须**让上层知道：
        // 否则 `mutateMeta` 会把这份「空快照」整体写回 ⇒ 一条坏字节就把全工作区的
        // pinned / archived / compacted / hits **清零**（输出悄悄变化，且不可恢复）。
        corrupt = true;
        meta = {};
        console.log("[dsh-shadow] _meta.json **坏件**（无法解析）：已拒绝把空快照写回 —— 请人工修复", target);
    }
    return { meta, target, version, corrupt };
};
/** 读 `_meta.json`（纯读侧用；需要「读-改-写」时请用 `mutateMeta`）。 */
export const readMeta = async (fs, ws) => (await readMetaVersioned(fs, ws)).meta;
/** 带守卫的一次写。`"ok"` = 落盘成功；`"stale"` = 版本冲突（调用方应重读重试）；`"failed"` = **没写成功**。 */
export const writeMetaGuarded = async (fs, ws, meta, version) => {
    if (!fs || !ws)
        return "ok"; // 无后端可写 ⇒ 视为「无需落盘」（调用方 `mutateMeta` 已在上层挡掉）
    try {
        const t = await fs.resolve(`${ws}/${META_REL}`, { cwd: ws });
        // 有版本 → 带上守卫；没有（stat 不可用）→ 无条件写，与旧行为一致。
        const intent = version ? { kind: "replaceIfVersion", version } : undefined;
        if (intent)
            await fs.writeText(t, JSON.stringify(meta), intent);
        else
            await fs.writeText(t, JSON.stringify(meta));
        return "ok";
    }
    catch (e) {
        const code = e?.code ?? "";
        const stale = code === "FS_STALE_VERSION" || /FS_STALE_VERSION/.test(String(e?.message ?? e));
        if (stale)
            return "stale";
        console.log("[dsh-shadow] meta write failed:", e && e.message);
        return "failed"; // **不重试**（重试也不会成功），但**必须让上层知道没落盘**
    }
};
/** 无条件写（保留给「明确要覆盖」的场景；正常改 meta 用 `mutateMeta`）。返回本次写入结果。 */
export const writeMeta = async (fs, ws, meta) => writeMetaGuarded(fs, ws, meta, undefined);
/**
 * **事务式**修改 `_meta.json`：读 → 在快照上改 → 带守卫写；`FS_STALE_VERSION` 时重读重试。
 *
 * `mutate` 返回 `false` 表示「无需写入」（例如没有任何变化），事务直接结束。
 * 重试上限 3 次：拿不到独占就放弃这一次的更新（宁可少记一次命中，也不覆盖别人的写入）。
 */
export const mutateMeta = async (fs, ws, mutate, attempts = 3) => {
    if (!fs || !ws)
        return false;
    for (let i = 0; i < attempts; i++) {
        const { meta, version, corrupt } = await readMetaVersioned(fs, ws);
        // **坏件不写回**：拿一份「解析失败后的空快照」覆盖磁盘 = 把全工作区元数据清零（见 readMetaVersioned）。
        // 这次更新直接放弃（宁可少记一次命中，也不毁掉别人的 pin/archived/hits）。
        if (corrupt)
            return false;
        const keep = mutate(meta);
        if (keep === false)
            return true; // 调用方判定无需写入
        const outcome = await writeMetaGuarded(fs, ws, meta, version);
        if (outcome === "ok")
            return true;
        // **写失败**（磁盘满 / EACCES / 后端报错）：重试也不会成功，且**绝不能报成功** ⇒ 立刻返回 false。
        if (outcome === "failed")
            return false;
        // 版本冲突：说明期间有别的写入者。重读快照再试（而不是把我们的旧快照盖上去）。
    }
    console.log("[dsh-shadow] meta mutate gave up after", attempts, "attempts (concurrent writers)");
    return false;
};
