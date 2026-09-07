export const writeValidation = async (fs, ws, va) => {
    try {
        const rel = `.shadow/validation/${va.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(va));
    }
    catch (e) {
        console.log("[dsh-shadow] validation write failed:", e && e.message);
    }
};
