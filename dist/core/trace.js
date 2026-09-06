export const traceOf = (records, actorId) => (records || []).map((e, i) => ({
    seq: i + 1,
    at: e.time || "",
    kind: e.kind,
    actor: actorId || "",
    comp: e.comp || "",
    text: e.text || "",
    sub: e.sub,
    source: e.source || "",
}));
