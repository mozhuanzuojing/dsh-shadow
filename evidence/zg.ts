// dsh-shadow —— evidence/zg.ts：ZgEvidenceProvider（内容/exact，CLI spawn zg --rg）。从 index.ts 迁出。
// zg 是检索层（discover/verify），Arbitration 留在 Shadow Core。zg 未装 → explicit unavailable，绝不静默 fallback。
//
// v1.15.7 修两个「装了也用不了」的真缺陷（Windows 实测，非推断）：
//   ① spawn：`execFile("zg")` 在 Windows 上**必然**失败 —— npm 全局安装只给 `zg`(sh) / `zg.cmd` / `zg.ps1`，
//      而 Node 不解析 `.cmd`（报 ENOENT），显式传 `zg.cmd` 又被 Node 以 EINVAL 拒绝
//      （CVE-2024-27980 缓解：无 shell 时禁止执行 .bat/.cmd）。结果是「zg 装好、手动跑得通，
//      插件一律报 unavailable」。修法：定位包内 CLI 入口 JS，用 `process.execPath` 起它（跨平台一致），
//      找不到才回退裸 `zg`（Unix 下 zg 是可执行符号链接，本来就能用）。
//   ② 解析：zg 0.2.2 的 `--rg` 输出是「**文件路径单独一行** + 缩进的 `起-止 [heading 面包屑] 行号:\t内容`」，
//      不是 ripgrep 的 `path:line:text`。旧 parser 因此把路径丢失、行号取错。
import type { EvidenceMatch, EvidenceProvider, GatewayEvidenceRef, EvidenceResult } from "../core/types.js";
import path from "node:path";
import fs from "node:fs";

/** npm 全局/局部布局下的 zg CLI 入口（相对 <prefix> 与 <prefix>/bin）。 */
const CLI_TAIL = ["node_modules", "@zvec", "zvec-grep", "dist", "cli", "index.js"];

let cachedInvocation: { cmd: string; prefix: string[] } | null = null;

/**
 * 解析「怎么起 zg」：
 *   - `DSH_SHADOW_ZG_CLI` 显式覆盖（指向包内 cli/index.js）；
 *   - 扫 PATH 找包内 CLI 入口 → 用 `process.execPath` 起它（Windows 唯一可用路径，Unix 亦然）；
 *   - 都找不到 → 回退裸 `zg`（Unix 可执行符号链接；Windows 会 ENOENT → 报 unavailable）。
 * 结果缓存：PATH 在一次进程生命周期内不变。
 */
export const resolveZgInvocation = (): { cmd: string; prefix: string[] } => {
  if (cachedInvocation) return cachedInvocation;
  const override = String(process.env.DSH_SHADOW_ZG_CLI || "").trim();
  // 显式覆盖直接生效（**不**先做存在性检查）：配置写错时应「可见地失败」，
  // 而不是被静默回退到另一个 zg —— 那会把「你配错了」伪装成「跑通了」（ADR-0049）。
  if (override) {
    cachedInvocation = { cmd: process.execPath, prefix: [override] };
    return cachedInvocation;
  }
  const candidates: string[] = [];
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    candidates.push(path.join(d, ...CLI_TAIL));                 // <prefix>/node_modules/...（Windows npm 前缀）
    candidates.push(path.join(d, "..", "lib", ...CLI_TAIL));    // <prefix>/../lib/node_modules/...（Unix 全局 / nvm）
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        cachedInvocation = { cmd: process.execPath, prefix: [c] };
        return cachedInvocation;
      }
    } catch { /* 单个候选不可读：跳过，继续找 */ }
  }
  cachedInvocation = { cmd: "zg", prefix: [] };
  return cachedInvocation;
};

/** 仅供测试：清掉 invocation 缓存（改过 DSH_SHADOW_ZG_CLI 后需要）。 */
export const resetZgInvocationCache = (): void => { cachedInvocation = null; };

export const runZg = async (args: string[], ctx: any, timeoutMs = 8000): Promise<any> => {
  try {
    const cp: any = await import("child_process");
    const { execFile } = cp;
    const { cmd, prefix } = resolveZgInvocation();
    return await new Promise((resolve) => {
      // maxBuffer 8MB：大仓库的 rg 输出轻易超过旧值 1MB，那时 err.code=ERR_CHILD_PROCESS_STDIO_MAXBUFFER
      // 会被当成普通 error（看起来像「zg 坏了」），实际只是缓冲太小。
      execFile(cmd, [...prefix, ...args], { cwd: ctx.ws, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
        if (err) {
          if (err.code === "ENOENT") return resolve({ unavailable: true, reason: "zg_not_installed" });
          if (err.killed || err.signal) return resolve({ unavailable: true, reason: "timeout" });
          // 缓冲太小**不是**「zg 坏了」，也不是「证据不存在」——单独给一个可诊断的原因（v1.15.57）。
          if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return resolve({ unavailable: true, reason: "output_too_large" });
          const s = String(stderr || "");
          if (/index/i.test(s)) return resolve({ unavailable: false, freshness: "possibly_stale", reason: "index_missing", stdout: s });
          // **工具报错 ≠ 证据不存在**（v1.15.57 修）：旧版这里 `unavailable: false, reason:"error"`，
          // 于是落到下面的 `not_found` 分支 ⇒ 一次 zg 失败被当成「**该证据已失效**」：
          // `arbitrate` 把它计进 missing、召回 `score × 0.5` + `stale=true`（**假漂移**）。
          // 语义上我们**没能验证**，而不是「验证了它不在」⇒ 必须报 `unavailable`（消费方会打印 reason）。
          return resolve({ unavailable: true, reason: "error", stdout: (stdout || "") + s });
        }
        resolve({ unavailable: false, stdout: String(stdout || "") });
      });
    });
  } catch {
    return { unavailable: true, reason: "zg_not_installed" };
  }
};

/** 命中行：`  起-止 [heading <面包屑>] 行号:<内容>`（范围与面包屑都可能缺）。 */
const HIT_RE = /^\s+(?:(\d+)-(\d+)\s+)?(?:\[heading\s+(.*?)\]\s+)?(\d+):\s?(.*)$/;

/** 路径归一 + 同路径判定。zg 返回**相对工作区**的路径，而 Atom 证据可能记绝对路径，故按后缀比。 */
const normPath = (p: unknown) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
export const samePath = (a: unknown, b: unknown): boolean => {
  const x = normPath(a); const y = normPath(b);
  if (!x || !y) return false;
  return x === y || x.endsWith("/" + y) || y.endsWith("/" + x);
};

/**
 * 解析 zg `--rg` 输出。**两行结构**：不带缩进的行 = 文件路径；缩进行 = 命中。
 * startLine 取**命中行号**（面包屑前的 `231:`），不是分块范围 —— 证据要的是精确位置。
 *
 * 只认**结构化命中**，不保留任何「文本里出现过就造一条」的兜底：
 *   - 旧版有「stdout 出现 ref.path → 造单条命中」，实测**会误报** —— zg 对不存在的路径会打印
 *     `missing: <path>`，stdout 里含该路径，于是「路径不存在」被判成 verified；
 *   - 旧版还有「stdout 出现 query → 造单条命中」，且因运算符优先级 bug 在已有命中时也会重复 push。
 *   两者都是**仅凭文本出现就制造证据**，违反 ADR-0043「无证据不返回」。
 */
export const parseZgMatches = (stdout: string, ref: GatewayEvidenceRef, limit = 8): EvidenceMatch[] => {
  const out: EvidenceMatch[] = [];
  let currentPath = "";
  for (const raw of String(stdout || "").split("\n")) {
    if (!raw.trim()) continue;
    if (!/^\s/.test(raw)) { currentPath = raw.trim(); continue; }   // 不缩进 → 文件路径行
    const m = raw.match(HIT_RE);
    if (!m) continue;
    const hitLine = Number(m[4]);
    out.push({
      path: currentPath || String(ref.path || ""),
      startLine: Number.isFinite(hitLine) && hitLine > 0 ? hitLine : undefined,
      matchedText: String(m[5] || "").slice(0, 120),
      route: "exact",
    });
    if (out.length >= limit) break;
  }
  return out;
};

export const zgVerify = async (ref: GatewayEvidenceRef, ctx: any): Promise<EvidenceResult> => {
  const args = ["query", "--rg", "-n", "-F", ref.query || ref.path, "-g", "**"];
  // v1.15.7：ref.path 非空 → 把搜索**限定到该路径**（而不是「工作区级搜索 → 再过滤」）。
  // 后者实测不可行：一次查询真实返回 **40 条命中 / 16 个文件**，全局 top-N 会把目标路径截掉，
  // 把「该路径确有证据」误判成 not_found（本机复现：目标在第 7 个文件，limit=8 时已被切掉）。
  // zg 对**不存在**的路径不报错（exit 0 + "No searchable files." + 0 命中）→ 自然落到 not_found，语义正确。
  if (ref.path) args.push(String(ref.path));
  const res = await runZg(args, ctx);
  // ADR-0049：不可用的**原因**必须可见（旧版把它吞了，真机只看到一句 unavailable、无从排查）。
  const base = { source: "zg", provenance: { provider: "zg", at: new Date().toISOString(), ...(res.reason ? { reason: String(res.reason) } : {}) } };
  if (res.unavailable) return { ...base, status: "unavailable", matches: [], confidence: 0, freshness: "stale" };
  if (res.reason === "index_missing" || res.freshness === "possibly_stale") return { ...base, status: "ambiguous", matches: parseZgMatches(res.stdout || "", ref), confidence: 0.3, freshness: "possibly_stale" };
  const matches = parseZgMatches(res.stdout || "", ref);
  // 语义（v1.15.7）：`ref.path` 非空 = 在验「**这条路径**是否仍支撑该记忆」，与 fsEvidenceProvider 同义。
  // zg 是**工作区级**搜索，不加这道过滤，「别的文件命中」就会冒充「该路径 verified」，
  // 把 stale 证据判成 fresh —— 直接污染 Memory≠Evidence 的 fresh/stale 裁决。
  // `ref.path` 为空（index-engine 的 workspace 级候选发现）时不加过滤，保持发现语义。
  if (ref.path) {
    const kept = matches.filter((x) => samePath(x.path, ref.path));
    return kept.length
      ? { ...base, status: "verified", matches: kept, confidence: 0.8, freshness: "fresh" }
      : { ...base, status: "not_found", matches: [], confidence: 0.1, freshness: "stale" };
  }
  return matches.length ? { ...base, status: "verified", matches, confidence: 0.8, freshness: "fresh" } : { ...base, status: "not_found", matches: [], confidence: 0.1, freshness: "stale" };
};

export const zgEvidenceProvider: EvidenceProvider = {
  async discover(ref: GatewayEvidenceRef, ctx: any) { const r = await zgVerify(ref, ctx); return r.status === "verified" ? r.matches : []; },
  async verify(ref: GatewayEvidenceRef, ctx: any) { return zgVerify(ref, ctx); },
};
