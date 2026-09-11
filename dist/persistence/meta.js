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
    const empty = { meta: {}, target: undefined, version: undefined };
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
    try {
        meta = txt ? (JSON.parse(txt) || {}) : {};
    }
    catch {
        meta = {};
    }
    return { meta, target, version };
};
/** 读 `_meta.json`（纯读侧用；需要「读-改-写」时请用 `mutateMeta`）。 */
export const readMeta = async (fs, ws) => (await readMetaVersioned(fs, ws)).meta;
/** 带守卫的一次写。返回 `true` = 落盘成功；`false` = 版本冲突（调用方应重读重试）。 */
export const writeMetaGuarded = async (fs, ws, meta, version) => {
    if (!fs || !ws)
        return true;
    try {
        const t = await fs.resolve(`${ws}/${META_REL}`, { cwd: ws });
        // 有版本 → 带上守卫；没有（stat 不可用）→ 无条件写，与旧行为一致。
        const intent = version ? { kind: "replaceIfVersion", version } : undefined;
        if (intent)
            await fs.writeText(t, JSON.stringify(meta), intent);
        else
            await fs.writeText(t, JSON.stringify(meta));
        return true;
    }
    catch (e) {
        const code = e?.code ?? "";
        const stale = code === "FS_STALE_VERSION" || /FS_STALE_VERSION/.test(String(e?.message ?? e));
        if (stale)
            return false;
        console.log("[dsh-shadow] meta write failed:", e && e.message);
        return true; // 非冲突错误不重试（重试也不会成功），但也不当作「冲突」语义
    }
};
/** 无条件写（保留给「明确要覆盖」的场景；正常改 meta 用 `mutateMeta`）。 */
export const writeMeta = async (fs, ws, meta) => {
    await writeMetaGuarded(fs, ws, meta, undefined);
};
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
        const { meta, version } = await readMetaVersioned(fs, ws);
        const keep = mutate(meta);
        if (keep === false)
            return true; // 调用方判定无需写入
        if (await writeMetaGuarded(fs, ws, meta, version))
            return true;
        // 版本冲突：说明期间有别的写入者。重读快照再试（而不是把我们的旧快照盖上去）。
    }
    console.log("[dsh-shadow] meta mutate gave up after", attempts, "attempts (concurrent writers)");
    return false;
};
