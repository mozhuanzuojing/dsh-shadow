/**
 * dsh-shadow —— tools/granularity-audit.selftest.ts：粒度门（`adr/0097` D7）的标定。
 *
 * 判据型工具必须给出**正对照 + 负对照 + 控制变量**，否则「全绿」可能只是判据没生效：
 *   ① 正对照（起点之后）：纯动作回声落成记忆文件 ⇒ 必须红（exit 1）且**点名文件**
 *   ② 负对照（起点之后）：含决策的文件 ⇒ 必须放行（exit 0）
 *   ③ 控制变量（**历史豁免**）：起点之**前**的同类文件 ⇒ 必须放行，且报文要**说明豁免了多少条**
 *      （这正是本门的核心边界：它不回答「全仓都不是」，只回答「起点之后没有新的」）
 *   ④ 控制变量（**不猜**）：起点之后**没有** `> 证据链：来源(...)` 行的文件 ⇒ 归入「未判定」并放行，
 *      不得因为「看起来可疑」就定罪
 *   ⑤ 控制变量（派生件不判）：`_abstract.md` 这类 `_` 前缀派生物**即使就放在 atoms/ 里**也不判
 *      （v1.21.0 修：原夹具落在 `indexes/`，而门只读 `atoms/` ⇒ 那条负对照**恒真**、证明不了任何事）
 *   ⑥ 结构缺失（缺件不静默）：找不到 `.shadow` ⇒ exit 2，**且报文必须说「这不是通过」**
 *   ⑦ 控制变量（**不考虑历史数据**，用户 2026-09-24 定）：旧日期树**不参与判定** ⇒ 放行，
 *      且旧树里的文件不进任何桶（门只覆盖 `.shadow/atoms/`）
 *   ⑧ 控制变量（**改名洗不掉违规**，v1.21.0 修）：文件名不含日期时按线索头自报的 `· 日期(...)` 判；
 *      自报日期 ≥ 起点 ⇒ 照旧红（原实现把它记成「历史豁免」）
 *   ⑨ 控制变量（**两处都没日期 ⇒ 未判定**）：不猜、放行
 *   ⑩ 判据真值：`relOf` 必须回答「文件真实在哪」（唯一调用方是仍扫旧日期树的回收工具；
 *      v1.21.0 一度让它恒指 atoms/ ⇒ 审计流写假来源、幂等与 meta 剪枝失效）
 *
 * 跑法：`node tools/granularity-audit.selftest.ts`
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { relOf } from "./granularity.lib.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "granularity-audit.ts");

const run = (root: string) => {
  try {
    return { code: 0, out: execFileSync("node", [CLI, root], { encoding: "utf8" }) };
  } catch (e: any) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

const memory = (kindLine: string | null) =>
  ["# shadow", "", ...(kindLine ? [kindLine] : []), "> 概况：1 动作 · 0 用户消息 · 0 决策", "", "- [10:00:00] [edit] 调用 edit", ""].join("\n");

const tmp: string[] = [];
const tree = (files: Record<string, string>) => {
  const d = mkdtempSync(join(tmpdir(), "gran-audit-"));
  tmp.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = join(d, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body, "utf8");
  }
  return d;
};

const AFTER = "2026-09-22";
const BEFORE = "2026-09-10";

try {
  // ① 正对照：起点之后的纯动作回声 ⇒ 红
  {
    const d = tree({ [`.shadow/atoms/${AFTER}--100000-shadow.md`]: memory("> 证据链：来源(动作) · 日期(2026-09-22) · 证据(—)") });
    const r = run(d);
    assert.equal(r.code, 1, `起点之后的纯动作文件必须红（1）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /只有动作/, `报文应说明「只有动作」：${r.out}`);
    assert.match(r.out, /shadow\.md/, `报文应点名文件（否则复审者找不到是哪条）：${r.out}`);
  }

  // ② 负对照：起点之后含决策 ⇒ 放行
  {
    const d = tree({ [`.shadow/atoms/${AFTER}--100000-shadow.md`]: memory("> 证据链：来源(决策·动作) · 日期(2026-09-22) · 证据(—)") });
    const r = run(d);
    assert.equal(r.code, 0, `含决策的文件必须放行（0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /没有「纯动作回声」/, `正对照报文：${r.out}`);
  }

  // ③ 控制变量：历史豁免
  {
    const d = tree({ [`.shadow/atoms/${BEFORE}--100000-shadow.md`]: memory("> 证据链：来源(动作) · 日期(2026-09-10) · 证据(—)") });
    const r = run(d);
    assert.equal(r.code, 0, `起点之前的归档必须豁免（0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /豁免（起点之前的归档）\*\* 1 条/, `报文必须打印豁免条数（这是本门的核心边界）：${r.out}`);
    assert.match(r.out, /起点之前的历史已按/, `报文必须写明边界（v1.19.1：历史已回收 ⇒ 文案从「未判」改成「已按 §5.3 回收」）：${r.out}`);
  }

  // ④ 控制变量：没有来源行 ⇒ 未判定、放行（不猜）
  {
    const d = tree({ [`.shadow/atoms/${AFTER}--100000-shadow.md`]: memory(null) });
    const r = run(d);
    assert.equal(r.code, 0, `无来源行不得定罪（应放行 0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /未判定（读不到\/无来源行\/无日期） 1 条/, `应把它计成未判定：${r.out}`);
  }

  // ⑤ 控制变量：`_` 前缀派生物不判 —— 夹具**必须放在被扫的目录里**（atoms/），否则这条是恒真
  {
    const d = tree({
      [`.shadow/atoms/${AFTER}--100000-ok.md`]: memory("> 证据链：来源(决策·动作) · 日期(2026-09-22) · 证据(—)"),
      [`.shadow/atoms/_abstract.md`]: memory("> 证据链：来源(动作) · 日期(2026-09-22) · 证据(—)"),
    });
    const r = run(d);
    assert.equal(r.code, 0, `派生物（_ 前缀）不得被当记忆判（应放行 0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /判定 1 条/, `派生物不得进判定（应只判 1 条真记忆，修前这条是恒真）：${r.out}`);
  }

  // ⑥ 结构缺失：没有 .shadow ⇒ exit 2，且必须说「不是通过」
  {
    const d = tree({ "README.md": "no shadow here\n" });
    const r = run(d);
    assert.equal(r.code, 2, `找不到 .shadow 应报结构缺失（2）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /结构缺失/, `报文应含「结构缺失」：${r.out}`);
    assert.match(r.out, /不是「通过」/, `必须写明这不是通过（ADR-0049）：${r.out}`);
  }

  // ⑦ 不考虑历史数据（用户 2026-09-24 定）：旧日期树**不参与判定** ⇒ 放行，且不计入任何桶
  {
    const d = tree({ [`.shadow/${AFTER}/${AFTER}--100000-shadow.md`]: memory("> 证据链：来源(动作) · 日期(2026-09-22) · 证据(—)") });
    const r = run(d);
    assert.equal(r.code, 0, `旧日期树不参与判定 ⇒ 放行（0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /不参与判定/, `报文必须写清「旧布局不参与判定」：${r.out}`);
    assert.match(r.out, /无可判定记忆/, `旧树里的文件不得被计入判定：${r.out}`);
  }

  // ⑧ 改名洗不掉违规：文件名无日期 ⇒ 按线索头自报日期判
  {
    const d = tree({ [".shadow/atoms/ep-abc-consolidated.md"]: memory("> 证据链：来源(动作) · 日期(2026-09-22) · 证据(—)") });
    const r = run(d);
    assert.equal(r.code, 1, `文件名不含日期时必须按自报日期判（不得洗进豁免桶）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /ep-abc-consolidated\.md/, `报文应点名该文件：${r.out}`);
    assert.doesNotMatch(r.out, /豁免（起点之前的归档）\*\* 1 条/, `它不该出现在豁免桶里：${r.out}`);
  }

  // ⑨ 两处都没有日期 ⇒ 未判定（不猜）
  {
    const d = tree({ [".shadow/atoms/no-date-anywhere.md"]: memory(null) });
    const r = run(d);
    assert.equal(r.code, 0, `无日期无来源行不得定罪（应放行 0）；实际 ${r.code}：${r.out}`);
    assert.match(r.out, /未判定（读不到\/无来源行\/无日期） 1 条/, `应把它计成未判定：${r.out}`);
  }

  // ⑩ 判据真值：relOf 回答「文件真实在哪」
  assert.equal(
    relOf("2026-09-10", "2026-09-10--100000-x.md"),
    ".shadow/2026-09-10/2026-09-10--100000-x.md",
    "relOf 不得把旧布局文件指成 atoms/（假来源会让回收工具的幂等守卫与 _meta.json 剪枝失效）",
  );

  console.log(
    "✔ granularity-audit.selftest：① 正对照（起点后纯动作 ⇒ 红）· ② 负对照（含决策 ⇒ 放行）· ③ 历史豁免（含条数）· ④ 不猜（无来源行 ⇒ 未判定）· ⑤ 派生物不判（夹具进了 atoms/）· ⑥ 结构缺失 ⇒ 2 · ⑦ 旧日期树不参与判定（不考虑历史数据）· ⑧ 改名洗不掉违规 ⇒ 1 · ⑨ 两处无日期 ⇒ 未判定 · ⑩ relOf 真值 —— 全部通过",
  );
} finally {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
}
