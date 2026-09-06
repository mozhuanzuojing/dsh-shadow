export const readObserverState = async (fs, ws, soul, argsState) => {
    const fromSoul = (soul && (soul.state || soul.observerState || soul.observer?.state)) || {};
    const base = fromSoul && typeof fromSoul === "object" ? fromSoul : {};
    const pick = (k) => (argsState && argsState[k] !== undefined) ? String(argsState[k]) : (base[k] !== undefined ? String(base[k]) : undefined);
    return {
        energy: pick("energy"),
        focus: pick("focus"),
        goalStage: pick("goalStage"),
        uncertainty: argsState?.uncertainty !== undefined ? Number(argsState.uncertainty) : (base.uncertainty !== undefined ? Number(base.uncertainty) : undefined),
    };
};
