export const resolveIdentityAt = (versions, timestamp) => {
    const t = String(timestamp || "").slice(0, 10);
    const sorted = [...versions].sort((a, b) => (parseInt(a.version.replace(/\D/g, "")) || 0) - (parseInt(b.version.replace(/\D/g, "")) || 0));
    let best = null;
    for (const v of sorted) {
        if ((v.at || "") <= t)
            best = v;
        else
            break;
    }
    return best;
};
export const resolvedVersionOf = (versions, timestamp) => resolveIdentityAt(versions, timestamp)?.version || "pre-v1";
