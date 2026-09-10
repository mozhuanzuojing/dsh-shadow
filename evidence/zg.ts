// dsh-shadow —— evidence/zg.ts：ZgEvidenceProvider（内容/semantic/exact，CLI spawn zg --rg）。从 index.ts 迁出。
// zg 是检索层（discover/verify），Arbitration 留在 Shadow Core。zg 未装 → explicit unavailable，绝不静默 fallback。
import type { EvidenceMatch, EvidenceProvider, GatewayEvidenceRef, EvidenceResult } from "../core/types.js";

export const runZg = async (args: string[], ctx: any, timeoutMs = 8000): Promise<any> => {
  try {
    const cp: any = await import("child_process");
    const { execFile } = cp;
    return await new Promise((resolve) => {
      execFile("zg", args, { cwd: ctx.ws, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
        if (err) {
          if (err.code === "ENOENT") return resolve({ unavailable: true, reason: "zg_not_installed" });
          const s = String(stderr || "");
          if (/index/i.test(s)) return resolve({ unavailable: false, freshness: "possibly_stale", reason: "index_missing", stdout: s });
          return resolve({ unavailable: false, reason: "error", stdout: (stdout || "") + s });
        }
        resolve({ unavailable: false, stdout: String(stdout || "") });
      });
    });
  } catch {
    return { unavailable: true, reason: "zg_not_installed" };
  }
};

export const parseZgMatches = (stdout: string, ref: GatewayEvidenceRef): EvidenceMatch[] => {
  const out: EvidenceMatch[] = [];
  for (const line of String(stdout || "").split("\n")) {
    if (!line.trim()) continue;
    const lm = line.match(/(\d+):(.*)$/);
    const pm = line.match(/[A-Za-z]:[\\\/]|\/([\w\-./\\]+):(\d+)/);
    out.push({ path: pm ? line.slice(0, line.indexOf(":") > 0 ? line.indexOf(":") : 0) || ref.path : ref.path, startLine: lm ? Number(lm[1]) : undefined, matchedText: (lm ? lm[2] : line).slice(0, 120), route: "exact" });
    if (out.length >= 8) break;
  }
  if (!out.length && String(stdout).includes(ref.path || "") || (ref.query && String(stdout).includes(ref.query))) out.push({ path: ref.path, route: "exact", matchedText: String(stdout).slice(0, 120) });
  return out;
};

export const zgVerify = async (ref: GatewayEvidenceRef, ctx: any): Promise<EvidenceResult> => {
  const res = await runZg(["query", "--rg", "-n", "-F", ref.query || ref.path, "-g", "**"], ctx);
  const base = { source: "zg", provenance: { provider: "zg", at: new Date().toISOString() } };
  if (res.unavailable) return { ...base, status: "unavailable", matches: [], confidence: 0, freshness: "stale" };
  if (res.reason === "index_missing" || res.freshness === "possibly_stale") return { ...base, status: "ambiguous", matches: parseZgMatches(res.stdout || "", ref), confidence: 0.3, freshness: "possibly_stale" };
  const matches = parseZgMatches(res.stdout || "", ref);
  return matches.length ? { ...base, status: "verified", matches, confidence: 0.8, freshness: "fresh" } : { ...base, status: "not_found", matches: [], confidence: 0.1, freshness: "stale" };
};

export const zgEvidenceProvider: EvidenceProvider = {
  async discover(ref: GatewayEvidenceRef, ctx: any) { const r = await zgVerify(ref, ctx); return r.status === "verified" ? r.matches : []; },
  async verify(ref: GatewayEvidenceRef, ctx: any) { return zgVerify(ref, ctx); },
};
