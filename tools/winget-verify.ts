#!/usr/bin/env node
// dsh-shadow —— tools/winget-verify.ts：工具集台账的**权威源核验器**（v1.15.14，ADR-0058）
//
// 为什么需要它：台账的 `winget` 包 ID 与版本是**人工登记**的，会随上游漂移；
// 而「按名字猜包 ID」这条路已被实测证伪 ——
//   `xh`  猜成 `Mozilla.Firefox.xh`（真实 `ducaale.xh`）
//   `delta` 猜成 `eToro.Delta`（真实 `dandavison.delta`）
// 所以本工具**只按精确包 ID 核验**，绝不按名字搜索后再猜。名字→ID 的映射必须由人给（seed），
// 机器只回答「这个 ID 现在还在不在、版本是多少、元数据对不对」。
//
// 设计约束（为什么用 winget 本体而不用 CDN 索引）：
//   - **零依赖**：`winget show` 是原生工具（本机 v1.29.290），与仓库 shell-out `zg`/`semble` 同法；
//     而读 CDN 的 `source.msix` 需要 zip + sqlite（Node 无内置 sqlite，要引原生依赖）。
//   - **更权威**：它查的是本机**实际配置的源**，而非缓存快照。
//
// 用法：
//   node tools/winget-verify.ts            # 核验台账全部带 winget 的条目
//   node tools/winget-verify.ts --json     # 机器可读输出
//   node tools/winget-verify.ts --id jqlang.jq   # 只核验一个
//
// **诚实纪律**（沿用 ADR-0049/0055）：核验失败只说「未取到」，**不说「包不存在」**——
//   可能只是网络不通、源未配置、或 winget 未安装。判定为「不存在」需要 `winget show` 明确报未找到。
import { execFile } from "node:child_process";

const TIMEOUT_MS = 60000;

/** `winget` 一次调用的结果。切到 TS 后**显式声明**：原 `.mjs` 靠隐式 any，字段写错编译器抓不到。 */
interface WingetRun { ok: boolean; code: number | string; out: string; err: string }

/** 起 winget，不抛异常。 */
const runWinget = (args: string[]): Promise<WingetRun> =>
  new Promise<WingetRun>((resolve) => {
    execFile("winget", args, { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: (err as any)?.code ?? 0, out: String(stdout || ""), err: String(stderr || "") });
    });
  });

/**
 * 解析 `winget show` 的输出。
 * **locale 无关**锚点：包 ID 取首行方括号（ID 恒为 ASCII）；版本取首个「值是版本形状」的行。
 * 中文/英文界面标签不同（`版本:` / `Version:`），故**不按标签匹配**。
 */
export const parseWingetShow = (out: unknown, expectedId?: string) => {
  const text = String(out || "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // 包 ID：首行的 [bracket]
  let id = "";
  const m = text.match(/\[([^\]\s]+)\]/);
  if (m) id = m[1];
  if (!id && expectedId) id = expectedId;
  // 未找到？（winget 报「找不到与输入条件匹配的已安装程序包」/ "No package found"）
  const notFound = /找不到|未找到|No package found|No installed package/i.test(text) && !m;
  // 版本：在头几行里找「值像版本号」的那行（排除 URL / 日期行）
  let version = "";
  for (const line of lines.slice(0, 12)) {
    const v = line.slice(line.indexOf(":") + 1).trim();
    if (!v || /^https?:\/\//i.test(v)) continue;                  // 跳过 URL
    if (/^\d+(\.\d+)+([\w.\-+]*)$/.test(v)) { version = v; break; } // 1.8.2 / 0.12.12 / 1.38.0-FRP-...
  }
  const field = (re: RegExp) => {
    for (const line of lines) {
      const at = line.search(re);
      if (at >= 0) return line.slice(at).replace(re, "").trim();
    }
    return "";
  };
  return { id, version, notFound, license: field(/^(许可证|License)\s*[:：]\s*/i), homepage: field(/^(主页|Homepage)\s*[:：]\s*/i) };
};

/** 核验一个包 ID。 */
export const verifyOne = async (pkgId: string, { expectedVersion }: { expectedVersion?: string | null } = {}) => {
  const r = await runWinget(["show", "--id", pkgId, "-e", "--disable-interactivity"]);
  if (!r.ok && !r.out) {
    return { pkgId, status: "unavailable", detail: `未取到（winget exit ${r.code}）：${(r.err || "").split("\n")[0].slice(0, 120)}` };
  }
  const p = parseWingetShow(r.out, pkgId);
  if (p.notFound) return { pkgId, status: "not-found", detail: "winget 明确报未找到该包 ID" };
  if (!p.id) return { pkgId, status: "unavailable", detail: "输出无法解析出包 ID（未判定为不存在）" };
  // 大小写不一致也算漂移：winget 的 ID 大小写敏感度低，但登记应与权威一致
  const idMismatch = p.id.toLowerCase() !== String(pkgId).toLowerCase();
  const verDrift = expectedVersion && p.version && String(p.version) !== String(expectedVersion);
  const status = idMismatch ? "id-mismatch" : verDrift ? "version-drift" : "ok";
  return { pkgId, status, resolvedId: p.id, version: p.version, license: p.license, homepage: p.homepage,
           detail: idMismatch ? `登记 ${pkgId} → 权威 ${p.id}` : verDrift ? `登记 ${expectedVersion} → 权威 ${p.version}` : "一致" };
};

/** 核验台账里全部带 winget 的条目。 */
export const verifyLedger = async (capabilities, onEach) => {
  const targets = capabilities.filter((c) => c.winget);
  const out = [];
  for (const c of targets) {
    const r = await verifyOne(c.winget, { expectedVersion: null });   // 版本不参与「失败」判定，只报告
    const row = { id: c.id, label: c.label, ledgerWinget: c.winget, ...r };
    out.push(row);
    if (onEach) onEach(row);
  }
  return out;
};

// ── CLI ──
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const asJson = process.argv.includes("--json");
  const idAt = process.argv.indexOf("--id");
  const { CAPABILITIES } = await import("../dist/core/toolset.js");
  if (idAt >= 0) {
    const one = await verifyOne(process.argv[idAt + 1]);
    console.log(JSON.stringify(one, null, 2));
    process.exit(one.status === "ok" ? 0 : 1);
  }
  const rows = await verifyLedger(CAPABILITIES, (r) => {
    if (!asJson) {
      const badge = r.status === "ok" ? "✅" : r.status === "version-drift" ? "⚠ " : "❌";
      console.log(`${badge} ${r.id.padEnd(18)} ${r.ledgerWinget.padEnd(34)} ${(r.resolvedId || "").padEnd(34)} ${r.detail}`);
    }
  });
  const bad = rows.filter((r) => r.status === "not-found" || r.status === "id-mismatch");
  const drift = rows.filter((r) => r.status === "version-drift");
  const un = rows.filter((r) => r.status === "unavailable");
  if (asJson) console.log(JSON.stringify({ rows, summary: { total: rows.length, bad: bad.length, drift: drift.length, unavailable: un.length } }, null, 2));
  else {
    console.log("");
    console.log(`核验 ${rows.length} 项：✅ 一致 ${rows.length - bad.length - drift.length - un.length} · ⚠ 版本漂移 ${drift.length} · ❌ 包 ID 问题 ${bad.length} · 未取到 ${un.length}`);
    if (un.length) console.log(`  未取到 ${un.length} 项**不等于包不存在**（可能网络/源/未装 winget）—— 按 ADR-0049 只陈述事实。`);
  }
  process.exit(bad.length ? 1 : 0);
}
