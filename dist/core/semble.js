import { isAbsoluteLocator } from "../evidence/paths.js";
/** 单次检索超时。首次调用可能触发索引构建，故比 zg 的 8s 宽。 */
const DEFAULT_TIMEOUT_MS = 30000;
/** stdout 上限（Semble 返回 JSON，大命中可能偏大）。 */
const MAX_BUFFER = 8 * 1024 * 1024;
/**
 * 剔掉 NO_PROXY / no_proxy 里**带方括号**的条目。
 * 根因（v1.15.6 实测）：`[::1]` 这一条会让 httpx 构造 Client 时走 URLPattern，
 *   把端口解析成 `':1]'` → `httpx.InvalidURL: Invalid port: ':1]'`；**模型已缓存也照崩**（exit 1）。
 * 通用处理「方括号」这一形状，而不是硬编码某一台机器的值——坏的是形状，不是 ::1 本身。
 */
export const stripBracketedNoProxy = (value) => String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.includes("[") && !s.includes("]"))
    .join(",");
/** 子进程环境：execFile 默认继承父进程 env，故必须在此清洗（见上）。 */
const sembleEnv = () => {
    const env = { ...process.env };
    for (const key of ["NO_PROXY", "no_proxy"]) {
        if (env[key] !== undefined)
            env[key] = stripBracketedNoProxy(env[key]);
    }
    return env;
};
/** 起 semble CLI。返回 { unavailable } / { stdout }，不抛异常（与 runZg 同形）。 */
export const runSemble = async (args, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    try {
        const cp = await import("child_process");
        const { execFile } = cp;
        return await new Promise((resolve) => {
            execFile("semble", args, { timeout: timeoutMs, maxBuffer: MAX_BUFFER, env: sembleEnv() }, (err, stdout, stderr) => {
                if (err) {
                    if (err.code === "ENOENT")
                        return resolve({ unavailable: true, reason: "semble_not_installed" });
                    if (err.killed || err.signal)
                        return resolve({ unavailable: true, reason: "timeout" });
                    return resolve({ unavailable: false, reason: "error", stdout: String(stdout || ""), stderr: String(stderr || "") });
                }
                resolve({ unavailable: false, stdout: String(stdout || "") });
            });
        });
    }
    catch {
        return { unavailable: true, reason: "semble_not_installed" };
    }
};
/** 把候选路径绝对化（相对 → 基于 workspace）。
 *  必须做：Semble 返回的是**相对 repo 的路径**（如 `core\resource.ts`），而 Index Engine 下游会过
 *  `authorizeScope({ workspace })`（绝对前缀匹配）——不绝对化就会被**整批滤掉**（v1.15.6 实测）。
 *  绝对化同时让候选可直接回喂 Evidence Gateway（那边按 fs 路径查）。 */
export const absolutizeLocator = (locator, ws) => {
    const p = String(locator || "").trim().replace(/\\/g, "/");
    if (!p)
        return "";
    if (isAbsoluteLocator(p))
        return p; // 已是绝对（含盘符或根斜杠）—— 判定集中一处
    const base = String(ws || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    return base ? `${base}/${p}` : p;
};
/** 解析 `semble search` 的 JSON stdout → AtomEvidenceRef[]（file + 行号范围）。
 *  locator 一律**绝对化**（见 absolutizeLocator）。纯函数。 */
export const parseSembleRefs = (stdout, ws = "", limit = 20) => {
    const text = String(stdout || "");
    const from = text.indexOf("{");
    const to = text.lastIndexOf("}");
    if (from < 0 || to <= from)
        return [];
    let parsed;
    try {
        parsed = JSON.parse(text.slice(from, to + 1));
    }
    catch {
        return [];
    }
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    const refs = [];
    for (const r of results.slice(0, limit)) {
        const locator = absolutizeLocator(r?.file_path, ws);
        if (!locator)
            continue;
        const start = Number(r?.start_line) || 0;
        const end = Number(r?.end_line) || 0;
        refs.push({ type: "file", locator, fragment: start ? { start, end: end || undefined } : undefined });
    }
    return refs;
};
/**
 * 候选生成：`semble search <query> <ws> --content code`。
 * **content 固定 code**（ADR-0054 §2）：嵌入模型是代码专用（potion-code-16M-v2），
 * 用它检索 `.shadow/` 中文散文属越出训练分布；S2（记忆语料）是后续独立决策。
 * 返回的 score **不向外暴露**——它不可跨查询比较（ADR-0054 实测），只用于 Semble 内部排序。
 */
export const sembleCandidates = async (query, ctx, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const q = String(query || "").trim();
    const ws = String(ctx?.ws || ctx?.workspace || "").trim();
    if (!q || !ws)
        return { refs: [] };
    const res = await runSemble(["search", q, ws, "--top-k", "20", "--content", "code"], timeoutMs);
    if (res.unavailable)
        return { unavailable: true, reason: res.reason, refs: [] };
    return { refs: parseSembleRefs(res.stdout || "", ws) };
};
