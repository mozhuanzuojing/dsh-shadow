// dsh-shadow —— evidence/filesystem.ts：FsExistenceProvider（只答"还在不在"）。从 index.ts 迁出。
import type { EvidenceMatch, EvidenceProvider, GatewayEvidenceRef, EvidenceResult } from "../core/types.js";

export const fsExists = async (fs: any, ws: string, rel: string) => {
  if (!fs || !ws || !rel) return true; // 无法判定时视为存在，避免误伤
  try { await fs.readText(await fs.resolve(`${ws}/${rel}`, { cwd: ws })); return true; } catch { return false; }
};

export const fsEvidenceProvider: EvidenceProvider = {
  async discover(ref: GatewayEvidenceRef, ctx: any) {
    const exists = await fsExists(ctx.fs, ctx.ws, ref.path);
    return exists ? [{ path: ref.path, route: "fs" }] : [];
  },
  async verify(ref: GatewayEvidenceRef, ctx: any): Promise<EvidenceResult> {
    const exists = await fsExists(ctx.fs, ctx.ws, ref.path);
    const matches: EvidenceMatch[] = exists ? [{ path: ref.path, route: "fs" }] : [];
    return { status: exists ? "verified" : "not_found", source: "fs", matches, confidence: exists ? 0.99 : 0.01, freshness: exists ? "fresh" : "stale", provenance: { provider: "fs", at: new Date().toISOString() } };
  },
};
