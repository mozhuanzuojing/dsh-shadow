import { SHADOW_ROOT } from "../core/paths.js";

// dsh-shadow —— persistence/meta.ts：_meta.json 派生状态读写（Derived Artifact）。
// 派生约定（ADR-0003 §3-7）：Memory 文件（.shadow/<date>/<time>-<entry>.md）是 source of truth；
// _meta.json / _recall_log.json / _index.md 都是可从 Memory 重建的派生物，坏了用 rebuild-index 重建。
//
// **并发纪律（ADR-0068，v1.15.25）**：`_meta.json` 是**全工作区共享**的一个文件，而它的所有写入
// 都是「读全量 → 改 → 写回全量」。这在并发下（多会话 / teammate / 宿主与子代理同时召回）会**丢更新**。
// fs 契约本身提供了守卫（`FsWriteIntent.replaceIfVersion`，冲突报 `FS_STALE_VERSION`；`FsInfo.version`
// 是「a write/edit guards against」的新鲜度令牌），故：**改 meta 一律走 `mutateMeta` 事务**，
// 不要自己 `readMeta` → 改 → `writeMeta`。
//
// 类型说明：本插件**不依赖** `@deepseek-ai/dsh-fs`（它是宿主提供的 peer，靠能力探测使用），
// 故此处用结构类型声明用到的两个形状，而不是 import 它的类型。
/** `FsWriteIntent` 的结构子集（本仓只用到带版本替换这一支）。 */
interface ReplaceIfVersion {
  kind: "replaceIfVersion";
  version: any;
}

const META_REL = `${SHADOW_ROOT}/_meta.json`;

/** 事务快照：内容 + 写侧守卫 + 目标。 */
export interface MetaSnapshot {
  meta: any;
  target: any;
  /** 写守卫用的版本令牌；`undefined` = 后端不支持 `stat`（此时退化为无条件写）。 */
  version: any;
  /**
   * 文件**存在但读不出**（不是合法 JSON）。
   * `true` ⇒ `meta` 是**空的占位**，**不得写回**（写回＝把全工作区元数据清零）。
   */
  corrupt: boolean;
}

/**
 * 读 `_meta.json` 的**带版本快照**。
 *
 * 顺序是 **先 `stat` 取版本、再 `readText`** —— 这个顺序是安全的那一个：
 * 若两次调用之间有人写入，我们手上的版本就比内容旧，随后的带守卫写会**失败并重试**（不会覆盖）。
 * 反过来（先读内容再取版本）会拿到「比内容新的版本」，守卫通过而**覆盖掉别人的写入**，正是要避免的。
 */
export const readMetaVersioned = async (fs: any, ws: string): Promise<MetaSnapshot> => {
  const empty: MetaSnapshot = { meta: {}, target: undefined, version: undefined, corrupt: false };
  if (!fs || !ws) return empty;
  let target: any;
  try {
    target = await fs.resolve(`${ws}/${META_REL}`, { cwd: ws });
  } catch {
    return empty;
  }
  let version: any = undefined;
  try {
    // `stat` 是可选能力：不支持时返回 undefined，写入退化为无条件（与旧行为一致，不再更差）。
    const info = typeof fs.stat === "function" ? await fs.stat(target) : undefined;
    if (info && info.type === "file") version = info.version;
  } catch {
    /* 目标不存在 / 后端不支持：版本保持 undefined */
  }
  let txt = "";
  try {
    txt = await fs.readText(target);
  } catch {
    txt = "";
  }
  let meta: any = {};
  let corrupt = false;
  try {
    if (txt) {
      meta = JSON.parse(txt) || {};
    }
  } catch {
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
export const readMeta = async (fs: any, ws: string) => (await readMetaVersioned(fs, ws)).meta;

/**
 * 一次守卫写的**三种**结果。
 *
 * 旧版把「写失败」也 `return true`（`true` 的语义是**落盘成功**）⇒ 磁盘满 / EACCES 时
 * `mutateMeta` 报成功、`hits`/`compacted` 标记**静默不落盘**。布尔量根本装不下三种含义，故改成三态。
 */
export type MetaWriteOutcome = "ok" | "stale" | "failed";

/** 带守卫的一次写。`"ok"` = 落盘成功；`"stale"` = 版本冲突（调用方应重读重试）；`"failed"` = **没写成功**。 */
export const writeMetaGuarded = async (fs: any, ws: string, meta: any, version: any): Promise<MetaWriteOutcome> => {
  if (!fs || !ws) return "ok"; // 无后端可写 ⇒ 视为「无需落盘」（调用方 `mutateMeta` 已在上层挡掉）
  try {
    const t = await fs.resolve(`${ws}/${META_REL}`, { cwd: ws });
    // 有版本 → 带上守卫；没有（stat 不可用）→ 无条件写，与旧行为一致。
    const intent: ReplaceIfVersion | undefined = version ? { kind: "replaceIfVersion", version } : undefined;
    if (intent) await fs.writeText(t, JSON.stringify(meta), intent);
    else await fs.writeText(t, JSON.stringify(meta));
    return "ok";
  } catch (e: any) {
    const code = e?.code ?? "";
    const stale = code === "FS_STALE_VERSION" || /FS_STALE_VERSION/.test(String(e?.message ?? e));
    if (stale) return "stale";
    console.log("[dsh-shadow] meta write failed:", e && e.message);
    return "failed"; // **不重试**（重试也不会成功），但**必须让上层知道没落盘**
  }
};

/** 无条件写（保留给「明确要覆盖」的场景；正常改 meta 用 `mutateMeta`）。返回本次写入结果。 */
export const writeMeta = async (fs: any, ws: string, meta: any): Promise<MetaWriteOutcome> =>
  writeMetaGuarded(fs, ws, meta, undefined);

/**
 * **事务式**修改 `_meta.json`：读 → 在快照上改 → 带守卫写；`FS_STALE_VERSION` 时重读重试。
 *
 * `mutate` 返回 `false` 表示「无需写入」（例如没有任何变化），事务直接结束。
 * 重试上限 3 次：拿不到独占就放弃这一次的更新（宁可少记一次命中，也不覆盖别人的写入）。
 */
export const mutateMeta = async (fs: any, ws: string, mutate: (meta: any) => boolean | void, attempts = 3): Promise<boolean> => {
  if (!fs || !ws) return false;
  for (let i = 0; i < attempts; i++) {
    const { meta, version, corrupt } = await readMetaVersioned(fs, ws);
    // **坏件不写回**：拿一份「解析失败后的空快照」覆盖磁盘 = 把全工作区元数据清零（见 readMetaVersioned）。
    // 这次更新直接放弃（宁可少记一次命中，也不毁掉别人的 pin/archived/hits）。
    if (corrupt) return false;
    const keep = mutate(meta);
    if (keep === false) return true; // 调用方判定无需写入
    const outcome = await writeMetaGuarded(fs, ws, meta, version);
    if (outcome === "ok") return true;
    // **写失败**（磁盘满 / EACCES / 后端报错）：重试也不会成功，且**绝不能报成功** ⇒ 立刻返回 false。
    if (outcome === "failed") return false;
    // 版本冲突：说明期间有别的写入者。重读快照再试（而不是把我们的旧快照盖上去）。
  }
  console.log("[dsh-shadow] meta mutate gave up after", attempts, "attempts (concurrent writers)");
  return false;
};
