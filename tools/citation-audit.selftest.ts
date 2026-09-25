/**
 * dsh-shadow —— tools/citation-audit.selftest.ts：越界门（检查 ⑥）的自检。
 *
 * 判据型工具必须给出**正对照 + 负对照 + 控制变量**，否则「全绿」可能只是判据没生效：
 *   ① 正对照：区间落在这个文件的行数之内 ⇒ 放行
 *   ② 负对照：区间越界 ⇒ 必须红（exit 1），且报文要说出「实际多少行」
 *   ③ 控制变量（**不猜**）：同名文件多个 ⇒ 归入「未判定」并放行，**不得**挑一个来判
 *   ④ 控制变量（归档层豁免）：`CHANGELOG.md` 里的越界引用**不得**让门变红
 *   ⑤ 控制变量（冻结 ADR 豁免）：内容**完全相同**的两份 ADR，只差状态行里的「冻结」二字 ——
 *      冻结的那份放行、未冻结的那份必须红（证明 ④⑤ 不是「整类没查」的空判据）
 *   ⑥–⑧ 见下方对应块（结构缺失不静默 / 别的根不误配 / 已挂在 `audit:docs` 上）
 *   ⑨–⑪ 归档层度量（`--include-archive`，v1.21.7）：看得见归档层越界但**不据此报红**、
 *      **冻结 ADR 也被纳入**（否则 ⑨ 只是「CHANGELOG 特例」）、归档层缺件不静默
 *
 * 跑法：`node tools/citation-audit.selftest.ts`
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "citation-audit.ts");

const run = (root: string, extra: string[] = []) => {
  try {
    return { code: 0, out: execFileSync("node", [CLI, root, ...extra], { encoding: "utf8" }) };
  } catch (e: any) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

const mk = (files: Record<string, string>): string => {
  const d = mkdtempSync(join(tmpdir(), "cit-audit-"));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(d, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body, "utf8");
  }
  return d;
};

const tmp: string[] = [];
const tree = (files: Record<string, string>) => {
  const d = mk(files);
  tmp.push(d);
  return d;
};

try {
  // ① 正对照
  {
    const d = tree({ "README.md": "见 `a.ts:1-2`。\n", "a.ts": "l1\nl2\nl3\nl4\nl5\n" });
    const r = run(d);
    assert.equal(r.code, 0, `范围内必须放行（0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /没有越界/, `正对照报文应说明「没有越界」：${r.out}`);
    assert.match(r.out, /不在范围内/, `报文必须写明归档层/冻结 ADR 不在范围内：${r.out}`);
  }

  // ② 负对照
  {
    const d = tree({ "README.md": "见 `a.ts:1-9`。\n", "a.ts": "l1\nl2\nl3\nl4\nl5\n" });
    const r = run(d);
    assert.equal(r.code, 1, `越界必须红（1）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /行号越界/, `报文应含「行号越界」：${r.out}`);
    assert.match(r.out, /实际只有 5 行/, `报文应说出实际行数（否则复审者无法复核）：${r.out}`);
  }

  // ③ 不猜：同名多个 ⇒ 未判定并放行
  {
    const d = tree({
      "README.md": "见 `dup.ts:1-2`。\n",
      "x/dup.ts": "l1\n",
      "y/dup.ts": "l1\n",
    });
    const r = run(d, ["--verbose"]);
    assert.equal(r.code, 0, `同名多个时**不得**猜（应放行 0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /同名 2 个/, `应把「同名多个」列为未判定：${r.out}`);
    assert.match(r.out, /未判定 1 处/, `计数应把未判定算出来：${r.out}`);
  }

  // ④ 归档层豁免：CHANGELOG 里同样的越界引用不得让门变红
  {
    const d = tree({ "README.md": "无关引用：无。\n", "CHANGELOG.md": "见 `a.ts:1-9`。\n", "a.ts": "l1\n" });
    const r = run(d);
    assert.equal(r.code, 0, `归档层（CHANGELOG）的行号是「当时」的 ⇒ 不得据此报红；实际 ${r.code}：${r.out}`);
  }

  // ⑤ 冻结 ADR 豁免（控制变量：两份内容相同，只差状态行）
  {
    const body = "见 `a.ts:1-9`。\n";
    const frozen = tree({
      "README.md": "无关引用：无。\n",
      "a.ts": "l1\n",
      "adr/0001-x.md": `# ADR-0001\n\n- 状态：**已接受**（本 ADR 只冻结边界）\n\n${body}`,
    });
    const live = tree({
      "README.md": "无关引用：无。\n",
      "a.ts": "l1\n",
      "adr/0001-x.md": `# ADR-0001\n\n- 状态：**草案**\n\n${body}`,
    });
    const rf = run(frozen);
    const rl = run(live);
    assert.equal(rf.code, 0, `冻结 ADR 正文的行号是冻结时的 ⇒ 豁免；实际 ${rf.code}：${rf.out}`);
    assert.equal(rl.code, 1, `同一份内容、状态非冻结 ⇒ 必须红（否则 ⑤ 是空判据）；实际 ${rl.code}：${rl.out}`);
  }

  // ⑥ 结构缺失不静默：一个当前态文档都没有 ⇒ exit 2（不是「通过」）
  {
    const d = tree({ "CHANGELOG.md": "只有归档层。\n" });
    const r = run(d);
    assert.equal(r.code, 2, `无当前态文档应报结构缺失（2）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /结构缺失/, `报文应含「结构缺失」：${r.out}`);
    assert.match(r.out, /不是「通过」/, `必须写明这不是「通过」（ADR-0049）：${r.out}`);
  }

  // ⑦ 控制变量（**别的根**）：带目录的路径在本仓不存在、但同名文件躺在某个子目录里 ⇒
  //    不得按文件名错配（那会报假阳性）。实测来源：`adr/0074` 引的是 **DSH 平台克隆**里的
  //    `docs/subsystems/filesystem.md`（正文自己写着「克隆 v0.1.2-alpha.1」），第一版曾错配。
  {
    const d = tree({
      "README.md": "见 `docs/subsystems/filesystem.md:415-417`。\n",
      "other/filesystem.md": "l1\nl2\n",
    });
    const r = run(d, ["--verbose"]);
    assert.equal(r.code, 0, `别的根的引用**不得**按文件名错配（应放行 0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /别的根/, `应把「带目录但找不到」列为未判定并点明可能是别的根：${r.out}`);
  }

  // ⑧ 挂在门上（防「门被摘掉」）：`audit:docs` 的结果数组里必须真的有 ⑥。
  //    只有正向一半时，把检查从数组里删掉反而让门更宽松、**照样全绿**，而 `AGENTS.md` 里那一行
  //    变成死指针 —— 同一条教训见检查② 的「反向一半」。
  {
    const src = readFileSync(join(HERE, "docs-consistency.ts"), "utf8");
    assert.match(
      src,
      /checkCitations\(\s*ROOT\s*\)/,
      "docs-consistency.ts 的 results 数组里必须调用 checkCitations(ROOT) —— 否则 ⑥ 只是文档里的一行字",
    );
  }

  // ⑨ 正对照（归档层度量看得见越界，且**不让门变红**）：同一个越界引用，放在 `CHANGELOG.md` 里
  //    ⇒ 默认门放行（④ 已证），而 `--include-archive` 必须**看见**它，且**退出码仍是 0**。
  {
    const d = tree({ "README.md": "无关引用：无。\n", "CHANGELOG.md": "见 `a.ts:1-9`。\n", "a.ts": "l1\n" });
    const r = run(d, ["--include-archive"]);
    assert.equal(r.code, 0, `归档层度量**不得**据此报红（exit 0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /归档层引用 1 处/, `应报出归档层引用数：${r.out}`);
    assert.match(r.out, /越界 1 处/, `应报出归档层越界数：${r.out}`);
    assert.match(r.out, /只报不判/, `报文必须写明「只报不判」的边界：${r.out}`);
  }

  // ⑩ 控制变量（冻结 ADR **也**纳入归档层度量）：⑤ 证明冻结 ADR 被**门**豁免；
  //    这里证明它**没有**被「整类不查」—— 归档层度量必须把它算进来，否则 ⑨ 只是「CHANGELOG 特例」。
  {
    const d = tree({
      "README.md": "无关引用：无。\n",
      "a.ts": "l1\n",
      "adr/0001-x.md": "# ADR-0001\n\n- 状态：**已接受**（冻结）\n\n见 `a.ts:1-9`。\n",
    });
    const gate = run(d);
    const arch = run(d, ["--include-archive"]);
    assert.equal(gate.code, 0, `冻结 ADR 不进默认门；实际 ${gate.code}：${gate.out}`);
    assert.equal(arch.code, 0, `归档层度量也不报红；实际 ${arch.code}：${arch.out}`);
    assert.match(arch.out, /含冻结/, `应声明归档层含**全部** ADR（含冻结）：${arch.out}`);
    assert.match(arch.out, /越界 1 处/, `冻结 ADR 的越界必须被看见（否则是「整类没查」）：${arch.out}`);
  }

  // ⑪ 缺件不静默：归档层文档一个都没有 ⇒ exit 2（**不是「通过」**，ADR-0049）
  {
    const d = tree({ "README.md": "无关引用：无。\n" });
    const r = run(d, ["--include-archive"]);
    assert.equal(r.code, 2, `无归档层文档应报结构缺失（2）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /结构缺失/, `报文应含「结构缺失」：${r.out}`);
  }

  console.log(
    "✔ citation-audit.selftest：① 正对照 / ② 负对照 / ③ 不猜 / ④ 归档层豁免 / ⑤ 冻结 ADR 豁免（含控制变量）/ ⑥ 结构缺失 / ⑦ 别的根不误配 / ⑧ 已挂在 audit:docs 上 / ⑨ 归档层度量看得见越界且不报红 / ⑩ 冻结 ADR 也被纳入度量 / ⑪ 归档层缺件不静默 —— 全部通过",
  );
} finally {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
}
