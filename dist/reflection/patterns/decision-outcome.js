const tally = (traces, pick) => {
    const m = new Map();
    for (const t of traces) {
        const v = pick(t);
        if (!v)
            continue;
        m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
};
export const repeatedDecisions = (traces) => tally(traces, (t) => t.decision?.action);
export const repeatedOutcomes = (traces) => tally(traces, (t) => t.outcome?.actual);
