export const perspectiveStateOf = (ev, hasValidation) => {
    if (!ev)
        return "isolated";
    const refs = ev.referencedBy?.length || 0;
    if (refs >= 2 && hasValidation)
        return "validated";
    if (refs >= 2)
        return "corroborated";
    return "isolated";
};
export const renderStability = (state) => {
    const lines = ["[Perspective Stability]"];
    lines.push(`state ${state}（isolated → corroborated → validated；shared != 正确）`);
    return lines.join("\n");
};
