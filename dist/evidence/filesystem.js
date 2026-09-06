export const fsExists = async (fs, ws, rel) => {
    if (!fs || !ws || !rel)
        return true; // 无法判定时视为存在，避免误伤
    try {
        await fs.readText(await fs.resolve(`${ws}/${rel}`, { cwd: ws }));
        return true;
    }
    catch {
        return false;
    }
};
export const fsEvidenceProvider = {
    async discover(ref, ctx) {
        const exists = await fsExists(ctx.fs, ctx.ws, ref.path);
        return exists ? [{ path: ref.path, route: "fs" }] : [];
    },
    async verify(ref, ctx) {
        const exists = await fsExists(ctx.fs, ctx.ws, ref.path);
        const matches = exists ? [{ path: ref.path, route: "fs" }] : [];
        return { status: exists ? "verified" : "not_found", source: "fs", matches, confidence: exists ? 0.99 : 0.01, freshness: exists ? "fresh" : "stale", provenance: { provider: "fs", at: new Date().toISOString() } };
    },
};
