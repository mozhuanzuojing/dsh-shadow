// dsh-shadow —— core/toolset.ts：工具集台账（能力登记 + 缺件处置 + 通用 CLI 目录）。ADR-0049 / ADR-0055。
//
// 两级台账（**必须分清，否则边界就糊了**）：
//   - `kind: "provider"`：**插件内接线**的可选增强（zg / semble）。缺它 → 对应能力降级，处置行会出现在读侧输出里。
//   - `kind: "reference"`：**通用开发 CLI 目录**（rg / fd / jadx / coreutils …）。插件**不接线**它们，
//     只做「检测 + 装法提示」。列在这里的价值是：agent 需要某类工具时，不必重新研究「装什么、怎么装」。
//
// 权限模型（为什么插件不代装）—— 理由取自本仓自身条文，不是偏好：
//   - README 安全边界表：「有后果的动作要用户确认」；
//   - references.md 引 OpenAI《Computer use》同条：「破坏性变更…要用户确认」；
//   - ADR-0029.1 inv 178 **Authority ≠ Ownership**；
//   - ADR-0030 inv 182 **Delegation Scope 不可扩大** +「被授权执行 ≠ 被解释授权 ≠ 被扩大授权」。
//   故：默认只**检测与提示**；安装只在**显式调用**时发生，且**一律先经宿主审批**
//   （`ctx.approval.request` 只有 `allowed-once` 是授予，见 core/toolset-exec.ts）。
/** winget 安装配方（`winget` 实测可被 execFile 直接起）。 */
const wingetRecipe = (pkg) => ({
    kind: "argv",
    argv: ["winget", "install", "--id", pkg, "-e", "--accept-package-agreements", "--accept-source-agreements"],
});
/** winget 处置：win32 给命令，其它平台说明本表是 Windows 口径。 */
const wingetRemedy = (pkg, note) => ({
    win32: { cmd: `winget install --id ${pkg} -e`, note },
    default: { cmd: "（本表为 Windows 口径）", note: "非 Windows：用系统包管理器或官方 release" },
});
// ─────────────────────────────────────────────────────────────────────────────
// 通用 CLI 目录（reference）。列序固定：id, 二进制, 显示名, 分类, winget 包 ID, 实测版本, 版本旗标, 用途, 替代对象, 备注
// winget ID 与版本均为 **2026-09-10 本机实测核对**；版本会随时间变化，ID 稳定。
// ─────────────────────────────────────────────────────────────────────────────
const tool = (id, bin, label, category, pkg, ver, flag, provides, replaces, note) => ({
    id,
    label,
    kind: "reference",
    category,
    provides: `${provides}${replaces && replaces !== "—" ? `（替代：${replaces}）` : ""}`,
    degradesTo: "无（通用工具，不影响插件行为）",
    remedy: wingetRemedy(pkg, note),
    install: wingetRecipe(pkg),
    winget: pkg,
    probe: flag ? [bin, flag] : [bin],
    note: note ? `winget ${pkg} · 实测 ${ver}` : `winget ${pkg} · 实测 ${ver}`,
    doc: "docs/toolchain-windows.md",
});
const REFERENCE_TOOLS = [
    // ── GNU 工具链（Windows 原本没有 grep/find/sed/awk…，最高优先级；三选一，勿全装）──
    tool("coreutils-ms", "coreutils", "Coreutils for Windows（微软打包 uutils）", "GNU 工具链", "Microsoft.Coreutils", "2026.9.3", "--version", "coreutils + findutils + grep 三合一的 multi-call 二进制", "grep/find/sed/awk 等（Windows 原本没有）", "✅ Windows 首选；**要求 PowerShell 7.4+**（7.6+ 支持 ~）；preview 阶段；与 PowerShell 别名冲突，可用 coreutils-manager disable 关掉"),
    tool("coreutils-uutils", "coreutils", "uutils coreutils（上游原版）", "GNU 工具链", "uutils.coreutils", "0.10.0", "--version", "GNU coreutils 的 Rust 跨平台重写", "GNU coreutils", "上游原版；自述「部分选项可能缺失或行为不同」，差异按 bug 处理"),
    tool("busybox", "busybox", "busybox-w32", "GNU 工具链", "frippery.busybox-w32", "1.38.0-FRP", "--help", "经典 BusyBox 的 Windows 移植", "大量 UNIX 小工具", "极简单文件、老派做法"),
    // ── 搜索与查找 ──
    tool("rg", "rg", "ripgrep", "搜索与查找", "BurntSushi.ripgrep.MSVC", "15.2.0", "--version", "全文搜索", "grep -R（Windows 无）", "另有 BurntSushi.ripgrep.GNU 变体"),
    tool("fd", "fd", "fd", "搜索与查找", "sharkdp.fd", "10.5.0", "--version", "文件查找", "UNIX find（注意 DOS find.exe 不是它）"),
    tool("ast-grep", "ast-grep", "ast-grep", "搜索与查找", "ast-grep.ast-grep", "0.45.2", "--version", "AST 结构化搜索", "grep -C"),
    tool("fzf", "fzf", "fzf", "搜索与查找", "junegunn.fzf", "0.74.3", "--version", "模糊过滤", "find | grep"),
    // ── 文本与数据处理 ──
    tool("jq", "jq", "jq", "文本与数据", "jqlang.jq", "1.8.2", "--version", "JSON 处理", "—"),
    tool("yq", "yq", "yq", "文本与数据", "MikeFarah.yq", "4.53.6", "--version", "YAML/JSON 处理", "—"),
    tool("sd", "sd", "sd", "文本与数据", "chmln.sd", "1.1.0", "--version", "字符串替换", "sed（Windows 无）"),
    tool("bat", "bat", "bat", "文本与数据", "sharkdp.bat", "0.26.1", "--version", "高亮查看文件", "cat（PowerShell 别名，非文件）"),
    tool("glow", "glow", "glow", "文本与数据", "charmbracelet.glow", "3.0.0", "--version", "Markdown 渲染", "阅读 .md"),
    tool("hexyl", "hexyl", "hexyl", "文本与数据", "sharkdp.hexyl", "0.17.0", "--version", "十六进制查看", "xxd / od"),
    // ── 目录与文件浏览 ──
    tool("eza", "eza", "eza", "目录与浏览", "eza-community.eza", "0.23.5", "--version", "目录清单", "ls / dir"),
    tool("yazi", "yazi", "yazi", "目录与浏览", "sxyazi.yazi", "26.9.1", "--version", "终端文件管理器", "mc / 资源管理器"),
    // ── Shell 与终端 ──
    tool("zoxide", "zoxide", "zoxide", "Shell 与终端", "ajeetdsouza.zoxide", "0.10.0", "--version", "目录跳转（z）", "cd"),
    tool("atuin", "atuin", "atuin", "Shell 与终端", "Atuinsh.Atuin", "18.21.0", "--version", "历史搜索", "history | grep"),
    tool("starship", "starship", "starship", "Shell 与终端", "Starship.Starship", "1.26.0", "--version", "提示符", "各 shell 自带提示符"),
    tool("nushell", "nu", "nushell", "Shell 与终端", "Nushell.Nushell", "0.114.1", "--version", "结构化 Shell", "PowerShell（另一种选择）", "二进制名是 nu"),
    tool("direnv", "direnv", "direnv", "Shell 与终端", "direnv.direnv", "2.37.1", "version", "目录局部环境", "手动 source .env", "版本子命令是 `direnv version`，不是 --version"),
    tool("zellij", "zellij", "zellij", "Shell 与终端", "Zellij.Zellij", "0.45.1", "--version", "终端复用", "tmux", "**Windows 无官方 tmux winget 包**，用 zellij 替代"),
    tool("wezterm", "wezterm", "WezTerm", "Shell 与终端", "wez.wezterm", "20240203", "--version", "终端模拟器", "Windows Terminal（自带）"),
    tool("nvim", "nvim", "Neovim", "Shell 与终端", "Neovim.Neovim", "0.12.5", "--version", "编辑器", "notepad / VS Code"),
    // ── Git 与版本控制 ──
    tool("delta", "delta", "delta", "Git 与版本控制", "dandavison.delta", "0.19.2", "--version", "diff 美化", "diff"),
    tool("lazygit", "lazygit", "lazygit", "Git 与版本控制", "JesseDuffield.lazygit", "0.64.1", "--version", "Git TUI", "git log 手敲"),
    tool("gh", "gh", "GitHub CLI", "Git 与版本控制", "GitHub.cli", "2.100.0", "--version", "GitHub 命令行", "网页操作"),
    // ── 磁盘与系统 ──
    tool("dust", "dust", "dust", "磁盘与系统", "bootandy.dust", "1.2.5", "--version", "磁盘分析", "du"),
    tool("dua", "dua", "dua", "磁盘与系统", "Byron.dua-cli", "2.42.1", "--version", "磁盘分析（交互）", "ncdu"),
    tool("btop", "btop", "btop4win", "磁盘与系统", "aristocratos.btop4win", "1.0.5", "--version", "系统监控", "任务管理器 / top"),
    tool("procs", "procs", "procs", "磁盘与系统", "dalance.procs", "0.14.12", "--version", "进程查看", "ps aux"),
    // ── 网络与下载 ──
    tool("xh", "xh", "xh", "网络与下载", "ducaale.xh", "0.26.2", "--version", "HTTP 客户端", "curl"),
    tool("aria2", "aria2c", "aria2", "网络与下载", "aria2.aria2", "1.37.0", "--version", "多线程下载", "wget", "二进制名是 aria2c"),
    tool("gping", "gping", "gping", "网络与下载", "orf.gping", "1.21.0", "--version", "图形化 ping", "ping"),
    tool("ffmpeg", "ffmpeg", "FFmpeg", "网络与下载", "Gyan.FFmpeg", "9.0.1", "-version", "媒体处理", "—", "版本旗标是单横线 -version"),
    // ── 版本与包管理 ──
    tool("mise", "mise", "mise", "版本与包管理", "jdx.mise", "2026.8.5", "--version", "版本管理器", "nvm / fnm / asdf"),
    tool("uv", "uv", "uv", "版本与包管理", "astral-sh.uv", "0.12.12", "--version", "Python 环境与工具", "pip / pipenv / pipx", "真 .exe，可直接被 execFile 起"),
    // ── 构建与任务编排 ──
    tool("just", "just", "just", "构建与任务", "Casey.Just", "1.58.0", "--version", "任务运行器", "make"),
    tool("mprocs", "mprocs", "mprocs", "构建与任务", "pvolok.mprocs", "0.9.6", "--version", "多进程管理", "parallel"),
    tool("hyperfine", "hyperfine", "hyperfine", "构建与任务", "sharkdp.hyperfine", "1.20.0", "--version", "基准测试", "time"),
    tool("lnav", "lnav", "lnav", "构建与任务", "tstack.lnav", "0.14.1-rc1", "--version", "日志分析", "tail -f"),
    // ── 归档 ──
    tool("7zip", "7z", "7-Zip", "归档", "7zip.7zip", "26.03", "", "压缩/解压", "tar / unzip（Windows 无 unzip）", "不带参数即打印版本与用法；另有 7z.exe"),
    // ── 逆向与二进制分析 ──
    tool("jadx", "jadx", "jadx", "逆向与二进制分析", "Skylot.jadx", "1.5.6", "--version", "Dex/APK → Java 反编译", "—", "**需 Java 11+ 64 位**；作者警告无法 100% 反编译，报错属预期。GUI 为 jadx-gui"),
];
// ─────────────────────────────────────────────────────────────────────────────
// provider（插件内接线）—— 这两项的缺件会改变插件行为，故 `degradesTo` 有实义。
// ─────────────────────────────────────────────────────────────────────────────
const PROVIDERS = [
    {
        id: "zg",
        label: "zg（@zvec/zvec-grep）",
        kind: "provider",
        category: "插件内接线",
        provides: "证据验证（verifyEvidence）与 Index Engine 的 zg 候选",
        degradesTo: "证据验证退回 fs（只判路径存在性）、候选退回全量扫描",
        remedy: {
            default: {
                cmd: "npm install -g @zvec/zvec-grep",
                note: "需 Node ≥ 22；插件只用 --rg 路由，不必放开被拦下的原生依赖 install 脚本",
            },
        },
        install: { kind: "npm-global", pkg: "@zvec/zvec-grep" },
        probe: ["zg", "--version"],
        doc: "README「可选外部 CLI（zg / Semble）」",
    },
    {
        id: "semble",
        label: "Semble",
        kind: "provider",
        category: "插件内接线",
        provides: "Index Engine 的语义候选（provider=semble）",
        degradesTo: "候选退回 fs 全量扫描",
        remedy: {
            default: {
                cmd: "uv tool install semble",
                note: "需 uv；首次检索会下载一次嵌入模型，之后离线可用",
            },
        },
        install: { kind: "argv", argv: ["uv", "tool", "install", "semble"] },
        probe: ["semble", "--version"],
        doc: "README「可选外部 CLI（zg / Semble）」",
    },
];
/** 全台账：provider + reference。 */
export const CAPABILITIES = [...PROVIDERS, ...REFERENCE_TOOLS];
/** 渲染用的分类顺序。 */
export const CATEGORY_ORDER = [
    "插件内接线",
    "GNU 工具链",
    "搜索与查找",
    "文本与数据",
    "目录与浏览",
    "Shell 与终端",
    "Git 与版本控制",
    "磁盘与系统",
    "网络与下载",
    "版本与包管理",
    "构建与任务",
    "归档",
    "逆向与二进制分析",
];
export const providerCapabilities = () => CAPABILITIES.filter((c) => c.kind === "provider");
export const referenceCapabilities = () => CAPABILITIES.filter((c) => c.kind === "reference");
export const capabilityOf = (id) => CAPABILITIES.find((c) => c.id === String(id || ""));
/** 取该平台（或 default）的处置；条目未登记 → undefined。 */
export const remedyFor = (id, platform = process.platform) => {
    const c = capabilityOf(id);
    if (!c)
        return undefined;
    return c.remedy[platform] || c.remedy.default;
};
/**
 * 缺件一行提示（给读侧输出用）。**条目未登记 → undefined**：不认识的东西不编造命令。
 * 形状：`> 缺件处置：<命令>（<坑>）· 提供什么 · 退到哪 · 原因 · 见文档`
 */
export const unavailableHint = (id, reason, platform = process.platform) => {
    const c = capabilityOf(id);
    if (!c)
        return undefined;
    const r = remedyFor(id, platform);
    if (!r)
        return undefined;
    const why = String(reason || "").trim();
    const seg = [`> 缺件处置：${r.cmd}`];
    if (r.note)
        seg.push(`（${r.note}）`);
    seg.push(`· 提供：${c.provides}`);
    seg.push(`· 现退到：${c.degradesTo}`);
    if (why && why !== "unavailable")
        seg.push(`· 原因：${why}`);
    seg.push(`· 见 ${c.doc}`);
    return seg.join(" ");
};
