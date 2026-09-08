// dsh-shadow —— ADR-0048⑤：ChangeSet（zg change-set 思想，变革驱动索引）。
import assert from "node:assert/strict";
import { ChangeSet } from "../dist/core/change-set.js";

// 创建/修改/删除 + 目录
const cs = new ChangeSet({ root: "D:/ws" });
cs.add(".shadow/2026-09-08/a.md", "changed");
cs.add(".shadow/2026-09-08/b.md", "created");
cs.add(".shadow/2026-09-08/c.md", "deleted");
cs.add(".shadow/2026-09-08", "changed", true);
const snap = cs.snapshot();
assert.ok(snap.touchedFiles.includes(".shadow/2026-09-08/a.md"), "changed 进 touched");
assert.ok(snap.deletedPrefixes.includes(".shadow/2026-09-08/c.md"), "deleted 进 deletedPrefixes");
assert.ok(snap.rescanDirectories.includes(".shadow/2026-09-08"), "dir 进 rescanDirectories");

// pathCoveredBy 去重：目录之下再加文件 → 覆盖
const cs2 = new ChangeSet({ root: "D:/ws" });
cs2.add(".shadow/2026-09-08", "changed", true);
cs2.add(".shadow/2026-09-08/a.md", "changed");   // 目录已覆盖 → 不重复记
assert.ok(!cs2.snapshot().touchedFiles.includes(".shadow/2026-09-08/a.md"), "目录覆盖后不重复记文件");

// affects：touched / deleted 前缀 / dir 下
const cs3 = new ChangeSet();
cs3.add(".shadow/2026-09-08/d.md", "deleted");
cs3.add(".shadow/2026-09-08/x", "changed", true);
assert.equal(cs3.affects(".shadow/2026-09-08/d.md"), true, "deleted 前缀 affects");
assert.equal(cs3.affects(".shadow/2026-09-08/x/y.md"), true, "dir 下 affects");
assert.equal(cs3.affects(".shadow/2026-09-08/z.md"), false, "无关 rel 不 affects");

// 规模阈值 → forceFullReconcile
const cs4 = new ChangeSet({ maxChangedPaths: 2 });
cs4.add("a.md", "changed");
cs4.add("b.md", "changed");
cs4.add("c.md", "changed");
assert.equal(cs4.snapshot().forceFullReconcile, true, "超阈值 → 强制全量对齐");

console.log("✔ 场景 ChangeSet-1 变革驱动：created/changed/deleted + 目录去重 + affects + 规模阈值");
console.log("ALL PASS ✅");
