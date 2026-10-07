// dsh-shadow —— persistence/snapshots.ts：按日期目录存图的**快照读取**（单一来源）。
//
// **为什么收敛成一处**（ADR-0071）：`selfhood/temporal/persistence.ts` 与 `world/persistence/persist.ts`
// 原本各有一份**逐字近重复**的读取逻辑（连 bug 都一样），正是 `tools/audit-drift.ts` 的**检测 B**
// 报出的那两个模块（键 `name=graph.json`）。本仓这几轮的教训是「同一逻辑在多处表达，
// 其中一处会漂移」——故把这份逻辑收敛到此，两个 reader 只做参数化调用。
//
// **顺序纪律（原 bug 的根因）**：`listDir` 的契约是 *"List direct children of a directory in
// **stable name order**"*，真机实现是 `entries.sort((l, r) => l.name.localeCompare(r.name))`
// ⇒ **升序**。而日期目录名是 `YYYY-MM-DD`（字典序 = 时间序）。故「取第一个」= **取最旧**。
// 本函数**先按名字降序**再找，第一个命中的就是**最新**的那份快照。
//
// 快照是**可重建的派生件**（ADR-0003 / ADR-0017 / ADR-0024）——回读一份**更旧**的派生件，
// 正是「投影与源头脱钩」那一类；故取最新是唯一自洽的选择。
//
// ## B3（v1.22.x）：回退到更旧快照**必须让调用方拿得到**，不能只 `console.log`
//
// 旧契约 `Promise<T | null>` + 回退时 `console.log("…已回退到更旧的…")`：唯一信号是日志，
// 而 `console.log` **不算** ADR-0049 认可的可见信号（ADR-0085）⇒「读到旧图」与「投影就是当前状态」
// 不可区分（ADR-0003：派生件不是 source）。现在返回值携带 `value / usedRel / skipped / readFailure`：
//   · `usedRel` —— 实际读的是哪一份；
//   · `skipped` —— 被跳过的更新候选**及各自原因**（坏件 / 读失败 / 空文件 / 读取时已不存在）；
//   · `readFailure` —— 非「不存在」的失败（EACCES / 后端故障 / 只读挂载）的真实原因。
// 调用方据此可以在自己的输出里说明「这是旧图」，而不是靠人去翻日志。
//
// ## B4（同一类 `catch` 的漏项）
//
// 旧实现把「目录不存在」「listDir 失败」「readText 失败」「JSON 坏件」并进两个 `catch {}`/
// `.catch(() => [])` ⇒ 四件事逐字不可区分。现在判据复用 `core/util.ts#isNotFound`：
// `isNotFound` ⇒ 正常空值；其余 ⇒ 带 `reason` 的失败。**`JSON.parse` 与 `readText` 分开 try**
//（坏件要有自己的原因，不能借读失败的说辞）。
import { SHADOW_ROOT } from "../core/paths.js";
import { isNotFound, errText } from "../core/util.js";

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 一次快照读取的**完整结果**（B3）。`value === null` 有两种成因，用 `readFailure` 区分：
 * 有空（`readFailure === undefined` ⇒ 真的还没有任何快照）与读不出来（`readFailure` 有值 ⇒ 事故）。
 */
export interface SnapshotRead<T> {
  /** 读到的最新快照；没有任何可用快照 / 读不出来 ⇒ `null`。 */
  value: T | null;
  /** 实际使用的那一份（`"<YYYY-MM-DD>/<fileName>"`）；`value === null` 时为 `undefined`。 */
  usedRel?: string;
  /** 被跳过的**更新**候选（降序扫描 ⇒ 它们都比 `usedRel` 新），每项带原因。 */
  skipped: string[];
  /** **读不出来**（不是「不存在」）的真实原因；`undefined` = 没有发生这类失败。 */
  readFailure?: string;
}

/**
 * 读 `<shadowRoot>/<dirRel>/<YYYY-MM-DD>/<fileName>` 里**最新**的一份。
 *
 * @param dirRel 相对 `.shadow/` 的目录（如 `temporal` / `world`）
 * @param fileName 快照文件名（默认 `graph.json`）
 * @returns 见 `SnapshotRead`：**不抛、不编造**；「还没有」与「读不出来」在返回值里分开。
 *
 * ⚠ **回退语义（有意的）**：某一天的最新快照坏掉/读不出时，本函数会**继续找更旧的**并返回它
 *（不因一份坏文件就让整条读路径返回 null）。但回退**不再静默**：`skipped` 会列出被跳过的每一份
 * 与原因，调用方必须据此告诉读者「这是旧图」。
 */
export const readLatestSnapshot = async <T = any>(fs: any, ws: string, dirRel: string, fileName = "graph.json"): Promise<SnapshotRead<T>> => {
  const skipped: string[] = []; // 坏件/读失败/空文件（**回退到更旧快照时必须说出来**，见文件头 B3）
  const fail = (reason: string): SnapshotRead<T> => ({ value: null, skipped, readFailure: reason });
  if (!fs || !ws) return fail(`无 fs 或无工作区 ⇒ 读不出 ${dirRel}/${fileName}`);

  let root: any;
  try {
    root = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}`, { cwd: ws });
  } catch (e: any) {
    // 目录还不存在 = 正常（还没写过快照）；其余 = 事故（EACCES / 后端故障 / 只读挂载）。
    return isNotFound(e) ? { value: null, skipped } : fail(`定位 \`${dirRel}\` 目录失败：${errText(e)}`);
  }
  let entries: any[] = [];
  try {
    entries = (await fs.listDir(root)) || [];
  } catch (e: any) {
    return isNotFound(e) ? { value: null, skipped } : fail(`列举 \`${dirRel}\` 目录失败：${errText(e)}`);
  }
  // **降序**：第一个含快照的日期即最新（升序取第一个会拿到最旧 —— 这是修掉的那个 bug）。
  const dates = entries
    .filter((e: any) => e?.name && DATE_DIR.test(e.name))
    .map((e: any) => String(e.name))
    .sort((a: string, b: string) => b.localeCompare(a));

  for (const name of dates) {
    const label = `${name}/${fileName}`;
    let files: any[] = [];
    try {
      const dir = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}/${name}`, { cwd: ws });
      files = (await fs.listDir(dir)) || [];
    } catch (e: any) {
      if (isNotFound(e)) continue; // 这一天的目录没了 ⇒ 正常跳过（不因此丢掉更旧的）
      return fail(`列举 \`${dirRel}/${name}\` 失败：${errText(e)}`);
    }
    if (!files.some((f: any) => f?.name === fileName)) continue;
    let txt = "";
    try {
      const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}/${name}/${fileName}`, { cwd: ws });
      txt = await fs.readText(p);
    } catch (e: any) {
      // 「列目录时还在、读的时候没了」是竞态 ⇒ 当跳过；其它读错误照实记原因并继续找更旧的。
      skipped.push(isNotFound(e) ? `${label}（读取时已不存在）` : `${label}（读失败：${errText(e)}）`);
      continue;
    }
    if (!txt) {
      // 空快照 ≈ 没写（与「坏件」是两种原因，故分开记）。本仓把它并入「被跳过」，由调用方披露。
      skipped.push(`${label}（空文件）`);
      continue;
    }
    // **`JSON.parse` 独立 try**（B4）：坏件要有自己的原因，不能借读失败的说辞。
    try {
      return { value: JSON.parse(txt) as T, usedRel: label, skipped };
    } catch (e: any) {
      skipped.push(`${label}（坏件：${errText(e)}）`);
      continue;
    }
  }
  return { value: null, skipped };
};
