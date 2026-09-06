export const runZg = async (args, ctx, timeoutMs = 8000) => {
    try {
        const cp = await import("child_process");
        const { execFile } = cp;
        return await new Promise((resolve) => {
            execFile("zg", args, { cwd: ctx.ws, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    if (err.code === "ENOENT")
                        return resolve({ unavailable: true, reason: "zg_not_installed" });
                    const s = String(stderr || "");
                    if (/index/i.test(s))
                        return resolve({ unavailable: false, freshness: "possibly_stale", reason: "index_missing", stdout: s });
                    return resolve({ unavailable: false, reason: "error", stdout: (stdout || "") + s });
                }
                resolve({ unavailable: false, stdout: String(stdout || "") });
            });
        });
    }
    catch {
        return { unavailable: true, reason: "zg_not_installed" };
    }
};
export const parseZgMatches = (stdout, ref) => {
    const out = [];
    for (const line of String(stdout || "").split("\n")) {
        if (!line.trim())
            continue;
        const lm = line.match(/(\d+):(.*)$/);
        const pm = line.match(/[A-Za-z]:[\\\/]|\/([\w\-./\\]+):(\d+)/);
        out.push({ path: pm ? line.slice(0, line.indexOf(":") > 0 ? line.indexOf(":") : 0) || ref.path : ref.path, startLine: lm ? Number(lm[1]) : undefined, matchedText: (lm ? lm[2] : line).slice(0, 120), route: "exact" });
        if (out.length >= 8)
            break;
    }
    if (!out.length && String(stdout).includes(ref.path || "") || (ref.query && String(stdout).includes(ref.query)))
        out.push({ path: ref.path, route: "exact", matchedText: String(stdout).slice(0, 120) });
    return out;
};
export const zgVerify = async (ref, ctx) => {
    const res = await runZg(["query", "--rg", "-n", "-F", ref.query || ref.path, "-g", "**"], ctx);
    const base = { source: "zg", provenance: { provider: "zg", at: new Date().toISOString() } };
    if (res.unavailable)
        return { ...base, status: "unavailable", matches: [], confidence: 0, freshness: "stale" };
    if (res.reason === "index_missing" || res.freshness === "possibly_stale")
        return { ...base, status: "ambiguous", matches: parseZgMatches(res.stdout || "", ref), confidence: 0.3, freshness: "possibly_stale" };
    const matches = parseZgMatches(res.stdout || "", ref);
    return matches.length ? { ...base, status: "verified", matches, confidence: 0.8, freshness: "fresh" } : { ...base, status: "not_found", matches: [], confidence: 0.1, freshness: "stale" };
};
export const zgEvidenceProvider = {
    async discover(ref, ctx) { const r = await zgVerify(ref, ctx); return r.status === "verified" ? r.matches : []; },
    async verify(ref, ctx) { return zgVerify(ref, ctx); },
};
