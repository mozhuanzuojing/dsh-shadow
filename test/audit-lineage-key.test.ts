// dsh-shadow —— T27：**审计记录按「记录里出现的文件路径」当线索键**接进证据面（`AtomEvidenceRef` 那一层）。
//
// 判据（唯一一份）在 `persistence/audit-stream.ts` 的 `auditEvidenceSplit`：
// · **能给出定位符的**才算线索键 —— 路径 ⇒ `{type:"file"}`、URL ⇒ `{type:"url"}`；
// · **给不出定位符的**（裸词、带空格的散文串）⇒ 进 `unattributable`（**归不了**），**绝不硬塞成 ref**。
//
// 为什么「窄」是判据的一部分（不是保守）：审计记录与记忆之间**本来只有 `agent` + 日期两个弱键**
// （`BACKLOG` T27 记的就是这个卡点）⇒ 拿猜出来的键去归并 = **制造错配的证据链，比不归更坏**。
// 故本文件必须同时钉住两件事：① 该归的归得对；② **不该归的一条都不许归**。
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAuditStream, renderAuditStreamDiag } from "../dist/persistence/audit-stream.js";

// ── 一组最简 fs 门面（真临时目录；`readAuditStream` 只用 resolve/listDir/readText）──
const mkFs = () => ({
  async resolve(p: string) {
    return { displayPath: p, targetKey: p };
  },
  async readText(t: any) {
    return readFileSync(t.displayPath, "utf8");
  },
  async listDir(t: any) {
    return readdirSync(t.displayPath, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
  },
});

const mkWs = (): string => mkdtempSync(join(tmpdir(), "dsh-audit-key-"));

/**
 * 造一个只含 `materials` 字段的审计流，读回摘要。
 * ⚠ **经公开入口（`readAuditStream`）走**，不导出内部判据函数 —— 与本模块「只在本模块用的东西不导出」同一条约定
 * （导出会给 A1「导出但生产无调用点」添条目）。
 */
const readWith = async (materials: string[], ws = mkWs()) => {
  mkdirSync(join(ws, ".shadow", "audit"), { recursive: true });
  writeFileSync(join(ws, ".shadow", "audit", "2026-09-25.jsonl"), JSON.stringify({ ts: "2026-09-25T01:00:00Z", materials }) + "\n", "utf8");
  return readAuditStream(mkFs(), ws);
};

// ─────────────────────────────────────────────────────────────
// ① 什么能当线索键（经公开入口标定）
// ─────────────────────────────────────────────────────────────
{
  const r = await readWith([
    "core/writer/core.ts", // → file
    "D:\\ws\\src\\a.ts", // → file（Windows 分隔符也算路径）
    "https://example.com/spec", // → url
    "redis", // → 归不了（裸词，无法定位）
    "改/读 了三个文件", // → 归不了（带空格的散文，不是定位符）
    "core/writer/core.ts", // 重复 ⇒ 只算一次
  ]);
  assert.equal(r.evidence.length, 3, `路径与 URL 各成一条 ref；实际 ${JSON.stringify(r.evidence)}`);
  assert.deepEqual(
    r.evidence.map((x) => x.type),
    ["file", "file", "url"],
    "类型必须按判据给（路径=file / URL=url）",
  );
  assert.equal(r.evidence[0].locator, "core/writer/core.ts", "locator 原样保留（不改写路径）");
  assert.equal(r.unattributableCount, 2, "两条给不出定位符 ⇒ 归不了");
  assert.deepEqual(r.unattributable, ["redis", "改/读 了三个文件"], "归不了的原值要留着给人看（不是丢掉）");
  console.log("✔ ① 判据：路径→file · URL→url · 去重 · 裸词/散文→归不了（原值保留）");
}

// ② 负对照：**不该归的一条都不许归**（这是本条的判据核心：宁可说不知道）
{
  const r = await readWith(["redis", "todo", "（无）", "", "   ", "a b/c"]);
  assert.equal(r.evidence.length, 0, `没有任何可定位的材料 ⇒ 一条 ref 都不许造；实际 ${JSON.stringify(r.evidence)}`);
  assert.equal(r.unattributableCount, 4, "`redis`/`todo`/`（无）`/`a b/c` 四条归不了（空串与空白不算材料）");
  console.log("✔ ② 负对照：无可定位材料 ⇒ 0 条 ref（不硬塞）；空串/空白不计入");
}

// ─────────────────────────────────────────────────────────────
// ③ 端到端：从真 `.jsonl` 读出来的材料，两堆分得开
// ─────────────────────────────────────────────────────────────
{
  const ws = mkWs();
  mkdirSync(join(ws, ".shadow", "audit"), { recursive: true });
  const lines = [
    JSON.stringify({ ts: "2026-09-25T01:00:00Z", text: "改/读 core/writer/core.ts" }),
    JSON.stringify({ ts: "2026-09-25T01:00:01Z", materials: ["docs/maintainers.md", "redis"] }),
    JSON.stringify({ ts: "2026-09-25T01:00:02Z", materials: ["https://example.com/spec"] }),
  ];
  writeFileSync(join(ws, ".shadow", "audit", "2026-09-25.jsonl"), lines.join("\n") + "\n", "utf8");

  const s = await readAuditStream(mkFs(), ws);
  assert.equal(s.ok, true, "正常读：ok");
  assert.equal(s.records, 3, "三条记录都解析出来");
  assert.equal(s.tornLines, 0, "没有撕裂行");
  assert.equal(s.evidence.length, 3, `三条可定位材料 ⇒ 三条 ref；实际 ${JSON.stringify(s.evidence)}`);
  assert.deepEqual(
    s.evidence.map((r) => `${r.type} ${r.locator}`).sort(),
    ["file core/writer/core.ts", "file docs/maintainers.md", "url https://example.com/spec"].sort(),
    "两种来源（`改/读` 文本推断 + `materials` 字段）都要进证据面",
  );
  assert.equal(s.unattributableCount, 1, "`redis` 归不了");
  assert.deepEqual(s.unattributable, ["redis"], "归不了的原值可见");
  // 渲染面：两段都要出现在诊断行里（否则「归不了」等于被静默吞掉）
  const diag = renderAuditStreamDiag(s);
  assert.match(diag, /线索键 3 条/, `诊断必须报可归条数；实际 ${diag}`);
  assert.match(diag, /归不了 1 条/, `诊断必须报归不了条数；实际 ${diag}`);
  assert.match(diag, /不进索引\/不计 hits/, "三条硬边界之一（不进索引）仍要在诊断里说清");
  console.log("✔ ③ 端到端：真 jsonl ⇒ 3 条 ref（文本推断 + 字段两种来源）+ 1 条归不了；诊断两个数都在");
}

// ④ 缺件不静默：目录不存在 ⇒ 「还没采集」，**不是**「全都归不了」
{
  const ws = mkWs();
  const s = await readAuditStream(mkFs(), ws);
  assert.equal(s.ok, true, "目录不存在 = 还没采集（正常）");
  assert.equal(s.records, 0, "0 条记录");
  assert.equal(s.evidence.length, 0, "0 条 ref");
  assert.equal(s.unattributableCount, 0, "**0 条归不了** —— 「没有记录」不许被读成「归不了」");
  const diag = renderAuditStreamDiag(s);
  assert.match(diag, /尚无记录/, "要说「尚无记录」");
  assert.doesNotMatch(diag, /归不了/, "缺件时不得出现「归不了」字样（那是另一回事）");
  console.log("✔ ④ 缺件不静默：目录不存在 ⇒ 0 ref / 0 归不了 + 说「尚无记录」（≠ 归不了）");
}

// ⑤ 读失败：分得开（`adr/0049`）
{
  const s = await readAuditStream({ resolve: async () => ({}), readText: async () => "", listDir: async () => { throw Object.assign(new Error("boom"), { code: "EACCES" }); } } as any, "/ws");
  assert.equal(s.ok, false, "非 isNotFound 的读失败 ⇒ ok:false");
  assert.match(renderAuditStreamDiag(s), /读失败/, "渲染要说「读失败」且不得当成「没有」");
  assert.doesNotMatch(renderAuditStreamDiag(s), /归不了/, "读失败时不得报「归不了」（还没读到东西）");
  console.log("✔ ⑤ 读失败与「没有」分得开（别当「归不了」，也别当「没有」）");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 这些 ref **没有**写进 atom 的 `lineage.evidence` —— 那会改记忆文件内容（契约面），需要另一次决策；");
console.log("  · 当前消费者只有 `read_shadow({debug:true})` 的诊断面（本文件测的是判据 + 该渲染）。");
console.log("ALL PASS ✅");
