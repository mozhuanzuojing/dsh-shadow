// dsh-shadow —— 工具集台账 ↔ 文档 棘轮（v1.15.10，ADR-0055）
// 目的：把「全部纳入」变成**可回归**的约束 —— 台账里有、文档里没有 → 红；文档里有装法、台账没登记 → 红。
// 这防止两份清单（机器用的 core/toolset.ts 与 人读的 docs/toolchain-windows.md）随时间漂移。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPABILITIES,
  CATEGORY_ORDER,
  capabilityOf,
  providerCapabilities,
  referenceCapabilities,
} from "../dist/core/toolset.js";
import { surveyCapabilities, renderSurvey, installCapability, resolveInstall } from "../dist/core/toolset-exec.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = readFileSync(join(repoRoot, "docs", "toolchain-windows.md"), "utf8");

// ─────────────────────────────────────────────
// ① 台账结构自洽
// ─────────────────────────────────────────────
assert.ok(CAPABILITIES.length >= 40, `台账应有 ≥40 项（实际 ${CAPABILITIES.length}）`);
assert.equal(providerCapabilities().length, 2, "provider 应是 zg / semble 两项");
assert.ok(referenceCapabilities().length >= 38, "reference 应覆盖通用工具目录");
const ids = CAPABILITIES.map((c) => c.id);
assert.equal(new Set(ids).size, ids.length, `台账 id 不可重复：${ids.filter((x, i) => ids.indexOf(x) !== i).join(", ")}`);
for (const c of CAPABILITIES) {
  assert.ok(c.id && c.label && c.kind && c.category && c.provides && c.degradesTo && c.doc, `字段不齐：${JSON.stringify(c.id)}`);
  assert.ok(c.probe.length > 0 && c.probe[0], `probe 不能为空：${c.id}`);
  assert.ok(c.remedy.default, `缺 default 处置（非 Windows 平台要靠它）：${c.id}`);
  assert.ok(CATEGORY_ORDER.includes(c.category), `分类未登记进 CATEGORY_ORDER：${c.id} → ${c.category}`);
  assert.ok(c.probe.every((a) => typeof a === "string"), `probe 含非字符串：${c.id}`);
  assert.ok(!c.probe.includes(""), `probe 含空参数（会变成传空路径）：${c.id} → ${JSON.stringify(c.probe)}`);
}
console.log(`✔ ① 台账自洽：${CAPABILITIES.length} 项（provider ${providerCapabilities().length} + reference ${referenceCapabilities().length}），分类 ${CATEGORY_ORDER.length} 个`);

// ─────────────────────────────────────────────
// ② 棘轮（正向）：台账每个 reference 的 winget ID 必须出现在文档里
// ─────────────────────────────────────────────
const missingInDoc: string[] = [];
for (const c of referenceCapabilities()) {
  if (!c.winget) continue;
  if (!DOC.includes(c.winget)) missingInDoc.push(`${c.id} → ${c.winget}`);
}
assert.equal(missingInDoc.length, 0, `docs/toolchain-windows.md 未登记这些 winget ID：\n  ${missingInDoc.join("\n  ")}`);
console.log(`✔ ② 棘轮正向：${referenceCapabilities().filter((c) => c.winget).length} 个 winget ID 全部出现在 docs/toolchain-windows.md`);

// ─────────────────────────────────────────────
// ③ 棘轮（反向）：文档里 `winget install` 实际安装的包必须在台账里
//    按**命令参数语法**解析（而不是全文扫「含点号的 token」——那会把 `Apache-2.0`、版本号当包 ID）。
//    规则：取 `winget install` 之后的 token，跳过 `-` 开头的旗标（如 `--id` / `-e` /
//    `--accept-package-agreements`），直到遇到第一个不像包 ID 的 token（如表格的 `|`、反引号、`**`）为止。
// ─────────────────────────────────────────────
const PKG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9._-]+$/;   // 必须含点，形如 Publisher.Package
const docWinget = new Set<string>();
for (const line of DOC.split("\n")) {
  const at = line.search(/winget\s+install/i);
  if (at < 0) continue;
  const rest = line.slice(at).replace(/^winget\s+install/i, "");
  for (const raw of rest.split(/\s+/)) {
    const tok = raw.replace(/^[`'"]+|[`'"]+$/g, "");               // 去掉行内代码/引号包裹
    if (!tok) continue;
    if (tok.startsWith("-")) continue;                             // 旗标
    if (!PKG_RE.test(tok)) break;                                  // 不像包 ID → 命令到此为止
    docWinget.add(tok);
  }
}
assert.ok(docWinget.size > 0, "文档里应能扫到 winget 包 ID（否则反向棘轮形同虚设）");
assert.ok(!docWinget.has("Apache-2.0"), "反向棘轮不得把许可证号当包 ID（解析回归）");
const ledgerWinget = new Set(referenceCapabilities().map((c) => c.winget).filter(Boolean));
const unregistered = [...docWinget].filter((p) => !ledgerWinget.has(p));
assert.equal(unregistered.length, 0, `文档用到但这些包未登记进台账：${unregistered.join(", ")}`);
console.log(`✔ ③ 棘轮反向：文档里 ${docWinget.size} 个 winget 包 ID 全部已在台账登记（按参数语法解析，未误收许可证号）`);

// ─────────────────────────────────────────────
// ⑦ 棘轮（WSL 清单）：docs/toolchain-wsl.md 的「工具映射总表」提到的工具，台账必须有对应条目
//    （v1.15.12 补上 ADR-0055 记为「已知缺口」的这一条：此前只有 Windows 文档受棘轮保护。）
//    WSL 用的是 Debian 命令名，与 winget 包名无对应关系 ⇒ 按**命令名**匹配台账的 bin / id / label / provides。
//    别名表收 Debian 包名与命令名不一致的那几个（fd-find→fdfind、bat→batcat）与常见缩写（z→zoxide）。
// ─────────────────────────────────────────────
const WSL = readFileSync(join(repoRoot, "docs", "toolchain-wsl.md"), "utf8");
// 只扫**「工具映射总表」**这一段：文档里还有「国内镜像」等表格，第 2 列是 URL，误扫会假阳性。
const wslStart = WSL.indexOf("## 工具映射总表");
assert.ok(wslStart >= 0, "docs/toolchain-wsl.md 应有「工具映射总表」小节");
const wslEnd = WSL.indexOf("\n## ", wslStart + 1);
const WSL_TABLE = WSL.slice(wslStart, wslEnd > wslStart ? wslEnd : undefined);
const ALIAS: Record<string, string> = { fdfind: "fd", batcat: "bat", z: "zoxide", sg: "ast-grep" };
// 台账可匹配面：probe[0]（二进制名）/ id / label / provides
const ledgerText = referenceCapabilities().map((c) => [c.probe[0], c.id, c.label, c.provides].join(" ")).join("\n");
const hasTool = (token: string): boolean => {
  const t = ALIAS[token] || token;
  if (!t || t.length < 2) return false;
  return new RegExp(`(^|[^A-Za-z0-9_-])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_-]|$)`, "i").test(ledgerText);
};
const wslTools = new Set<string>();
for (const line of WSL_TABLE.split("\n")) {
  if (!line.trim().startsWith("|")) continue;                 // 只扫表格行
  const cells = line.split("|").map((s) => s.trim());
  if (cells.length < 4) continue;
  const toolCell = cells[2];                                  // 第 2 列 = 现代工具
  for (const m of toolCell.matchAll(/`([^`]+)`/g)) {
    const head = m[1].trim().split(/\s+/)[0];                 // `eza --icons` → eza
    if (head) wslTools.add(head);
  }
}
assert.ok(wslTools.size >= 20, `WSL 工具表应能解析出 ≥20 个工具（实际 ${wslTools.size}）`);
const wslMissing = [...wslTools].filter((t) => !hasTool(t));
assert.equal(wslMissing.length, 0, `docs/toolchain-wsl.md 提到但这些工具未登记进台账：${wslMissing.join(", ")}`);
console.log(`✔ ⑦ 棘轮 WSL：文档里 ${wslTools.size} 个工具全部能在台账找到条目（含别名 fdfind/batcat/z 与词边界匹配）`);

// ─────────────────────────────────────────────
// ④ 巡检渲染：分类分组 + 「未探测」与「未检出」必须可区分
// ─────────────────────────────────────────────
const rows = await surveyCapabilities({ survey: "providers" });
// v1.15.13 修正：原断言是 `rows.some(r => r.available === true)`（「本机应有已检出的 provider」）——
// 这把**某台机器的安装状态**写死进了测试。本机 zg / semble 实测均 ENOENT（未装），该断言**恒红**，
// 于是一进 CI / 换机就红，且一条永远红的测试会掩盖以后真正的失败。
// 真正要守护的不变量是**与机器无关**的：默认巡检必须真的**探过** provider（available ∈ {true,false}，
// 而不是 null=未探测）；装了才有 true，没装就该得 false——两者都是「探测确实跑了」的证据。
assert.ok(rows.every((r) => r.capability.kind !== "provider" || r.available !== null), "默认巡检必须真的探测 provider（available 不得为 null=未探测）");
assert.ok(rows.every((r) => r.capability.kind === "provider" || r.available === null), "默认巡检不应探测 reference");
const out = renderSurvey(rows, { survey: "providers" });
assert.ok(out.includes("## 插件内接线"), "应含分类标题");
assert.ok(out.includes("## GNU 工具链"), "应列出 reference 分类");
assert.ok(out.includes("（未探测）"), "reference 应标「未探测」");
assert.ok(out.includes("未探测**"), "应给出「要探测全部」的指引");
assert.ok(out.includes("探测失败 ≠ 未安装"), "必须说明探测失败不等于未安装（诚实纪律）");
assert.ok(!out.includes("未装"), "不得使用「未装」措辞（只能是「未检出」/「未探测」）");
console.log("✔ ④ 巡检渲染：按分类分组、区分「未探测/未检出」、含「探测失败≠未安装」说明");

// ─────────────────────────────────────────────
// ⑤ 未登记条目安全：探测 / 安装 / 安装解析 都不编造
// ─────────────────────────────────────────────
assert.equal(capabilityOf("nope"), undefined, "未登记 → undefined");
const u1 = await installCapability("nope");
assert.equal(u1.status, "unknown-capability", "未登记 → unknown-capability");
assert.ok(!u1.display, "未登记不得给出安装命令");
assert.ok("error" in resolveInstall("nope"), "未登记 → 解析安装 argv 报 error");
console.log("✔ ⑤ 未登记条目：不编造探测/安装/命令");

// ─────────────────────────────────────────────
// ⑥ 安装路径仍受审批门保护（回归 v1.15.9 的安全核心）
//    用一个**确实缺件**的 reference 条目（rg 本机未装）走门，且**断言它没有被真的安装**
// ─────────────────────────────────────────────
const rgMissing = (await surveyCapabilities({ survey: "all" })).find((r) => r.capability.id === "rg");
if (rgMissing && rgMissing.available === false) {
  const denied = await installCapability("rg", { approval: { request: async () => "rejected" }, agent: { id: "T" } });
  assert.equal(denied.status, "rejected", "reference 条目的安装同样受审批门保护");
  const noCh = await installCapability("rg", {});
  assert.equal(noCh.status, "no-approval", "无审批通道 → 不安装");
  assert.ok(noCh.display && noCh.display.includes("winget"), `应给出 winget 命令供自行执行：${noCh.display}`);
  const after = (await surveyCapabilities({ survey: "all" })).find((r) => r.capability.id === "rg");
  assert.equal(after.available, false, "被拒绝后 rg 必须仍然未安装（没被偷偷装上）");
  console.log("✔ ⑥ reference 条目安装同样受审批门保护，且拒绝后确实未安装");
} else {
  console.log("⚠ ⑥ 跳过：本机 rg 状态不是「未检出」，无法用它验证 reference 安装门");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · `allowed-once` → 真正执行 winget/npm/uv 安装 → 重探 这条**执行**路径；");
console.log("    跑它会在本机真的安装软件。安全门已由 ⑥ 覆盖，argv 解析已由 resolveInstall 覆盖。");
console.log("  · 各 reference 条目 probe 旗标的**正确性**（可能某工具不支持该旗标 → 只会显示「未检出」，");
console.log("    不会误报可用；口径已由 ④ 的「探测失败≠未安装」兜住）。");
console.log("ALL PASS ✅");
