// dsh-shadow —— verification/persist.ts：验证记录持久化（run 落 observer 层 verification/，连同 persistence 记录）。
export const writeVerificationRun = async (fs, root, run) => {
    try {
        const t = await fs.resolve(`${root}/verification/run-${run.runId}.json`, { cwd: root });
        await fs.writeText(t, JSON.stringify(run));
    }
    catch (err) {
        console.log("[dsh-shadow] verification run write failed:", err && err.message);
    }
};
