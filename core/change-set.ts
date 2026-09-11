// dsh-shadow —— core/change-set.ts：ChangeSet（zg `daemon/change-set.ts` 思想，ADR-0048 ⑤）。
// 变革驱动索引：跟踪 创建/修改/删除 的条目，只重索引变更者；pathCoveredBy 去重；超 maxChangedPaths → 强制全量对齐。
// 纯数据/本地结构（shadow rel 路径），无 LLM；供 Projection Store / 索引做「只失效变更项」。
//
// ⚠ **本类在生产中未被实例化**（v1.15.19 审计确认，见 ADR-0062）：
//   唯二消费者是 `test/change-set.test.ts` 与 `test/projection-store.test.ts`；
//   生产侧 `core/projection-store.ts` 只在**类型位置**提到它（`invalidateFor?(set: ChangeSet)`），
//   而那个方法本身也未接线。生产走的是粗粒度清空（`invalidateProjection`）。
//   **不是正确性缺陷**（缓存可重建，清空即正确），是**未接线的优化**。
//   接线需要写侧新增变更跟踪；本仓纪律不臆造机制，故显式标注而未自动接上。
export type ChangeKind = "created" | "changed" | "deleted";

export interface ChangeSetSnapshot {
  touchedFiles: string[];
  rescanDirectories: string[];
  deletedPrefixes: string[];
  forceFullReconcile: boolean;
}

const norm = (p: string) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");

export class ChangeSet {
  private readonly touched = new Set<string>();
  private readonly dirs = new Set<string>();
  private readonly deleted = new Set<string>();
  private forceFullReconcile = false;
  private readonly root?: string;
  private readonly maxChangedPaths: number;

  constructor(opts: { root?: string; maxChangedPaths?: number } = {}) {
    this.root = opts.root ? norm(opts.root) : undefined;
    this.maxChangedPaths = Math.max(1, Number(opts.maxChangedPaths) || 1000);
  }

  /** 是否已被某目录/dir 覆盖（重复增补去重）。 */
  private pathCoveredBy(set: Set<string>, path: string): boolean {
    const p = norm(path);
    for (const d of set) { const dd = norm(d); if (dd === p || p.startsWith(dd + "/")) return true; }
    return false;
  }

  private covered(path: string): boolean {
    return this.pathCoveredBy(this.dirs, path) || this.pathCoveredBy(this.deleted, path);
  }

  private addInternal(set: Set<string>, path: string): void {
    const p = norm(path);
    if (!p) return;
    if (this.root) {
      // 只记 root 内的路径（shadow rel 通常已在 root 内；绝对路径则先裁剪）。
      const r = norm(this.root);
      const rel = p.startsWith(r + "/") ? p.slice(r.length + 1) : p;
      set.add(rel || p);
    } else {
      set.add(p);
    }
  }

  add(path: string, kind: ChangeKind, isDirectory = false): void {
    if (this.forceFullReconcile && this.size > 0) return;   // 已决定全量对齐，忽略增量
    const p = norm(path);
    if (isDirectory) { this.addInternal(this.dirs, p); }
    else {
      if (this.covered(p)) return;   // 已被已有目录/deleted 覆盖 → 去重
      if (kind === "deleted") this.addInternal(this.deleted, p);
      else this.addInternal(this.touched, p);
    }
    // 规模控制：变更路径数超阈值，触发全量对齐
    if (this.touched.size + this.deleted.size + this.dirs.size > this.maxChangedPaths) this.forceFullReconcile = true;
  }

  get size(): number { return this.touched.size + this.deleted.size + this.dirs.size; }

  snapshot(): ChangeSetSnapshot {
    return {
      touchedFiles: [...this.touched],
      rescanDirectories: [...this.dirs],
      deletedPrefixes: [...this.deleted],
      forceFullReconcile: this.forceFullReconcile,
    };
  }

  /** 判断某 rel 是否属变更（touched / 目录下 / deleted 前缀下）。 */
  affects(rel: string): boolean {
    const p = norm(rel);
    if (this.touched.has(p)) return true;
    if (this.pathCoveredBy(this.deleted, p)) return true;
    return this.pathCoveredBy(this.dirs, p);
  }
}
