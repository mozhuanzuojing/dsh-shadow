const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");
export class ChangeSet {
    touched = new Set();
    dirs = new Set();
    deleted = new Set();
    forceFullReconcile = false;
    root;
    maxChangedPaths;
    constructor(opts = {}) {
        this.root = opts.root ? norm(opts.root) : undefined;
        this.maxChangedPaths = Math.max(1, Number(opts.maxChangedPaths) || 1000);
    }
    /** 是否已被某目录/dir 覆盖（重复增补去重）。 */
    pathCoveredBy(set, path) {
        const p = norm(path);
        for (const d of set) {
            const dd = norm(d);
            if (dd === p || p.startsWith(dd + "/"))
                return true;
        }
        return false;
    }
    covered(path) {
        return this.pathCoveredBy(this.dirs, path) || this.pathCoveredBy(this.deleted, path);
    }
    addInternal(set, path) {
        const p = norm(path);
        if (!p)
            return;
        if (this.root) {
            // 只记 root 内的路径（shadow rel 通常已在 root 内；绝对路径则先裁剪）。
            const r = norm(this.root);
            const rel = p.startsWith(r + "/") ? p.slice(r.length + 1) : p;
            set.add(rel || p);
        }
        else {
            set.add(p);
        }
    }
    add(path, kind, isDirectory = false) {
        if (this.forceFullReconcile && this.size > 0)
            return; // 已决定全量对齐，忽略增量
        const p = norm(path);
        if (isDirectory) {
            this.addInternal(this.dirs, p);
        }
        else {
            if (this.covered(p))
                return; // 已被已有目录/deleted 覆盖 → 去重
            if (kind === "deleted")
                this.addInternal(this.deleted, p);
            else
                this.addInternal(this.touched, p);
        }
        // 规模控制：变更路径数超阈值，触发全量对齐
        if (this.touched.size + this.deleted.size + this.dirs.size > this.maxChangedPaths)
            this.forceFullReconcile = true;
    }
    get size() { return this.touched.size + this.deleted.size + this.dirs.size; }
    snapshot() {
        return {
            touchedFiles: [...this.touched],
            rescanDirectories: [...this.dirs],
            deletedPrefixes: [...this.deleted],
            forceFullReconcile: this.forceFullReconcile,
        };
    }
    /** 判断某 rel 是否属变更（touched / 目录下 / deleted 前缀下）。 */
    affects(rel) {
        const p = norm(rel);
        if (this.touched.has(p))
            return true;
        if (this.pathCoveredBy(this.deleted, p))
            return true;
        return this.pathCoveredBy(this.dirs, p);
    }
}
