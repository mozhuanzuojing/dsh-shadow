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

/** 缺件处置：一条可复制执行的命令 + 可选的坑说明。 */
export interface CapabilityRemedy {
  cmd: string;
  note?: string;
}

/**
 * 安装配方（声明式）。**为什么不能只存一条命令字符串**：
 *   - `npm-global` 在 Windows 上 npm 只是 `npm.cmd`，而 Node 的 execFile 既不能起 `.cmd`（ENOENT）
 *     也不能显式起 `.cmd`（EINVAL，CVE-2024-27980 缓解）→ 必须改走 `node <npm-cli.js>`；
 *   - `argv` 用于本身就是可执行文件的工具（uv.exe / winget.exe 皆实测可直接起）。
 * 故存**结构**、由 `core/toolset-exec.ts` 在运行时解析成真实 argv。
 */
export type InstallRecipe =
  | { kind: "npm-global"; pkg: string }
  | { kind: "argv"; argv: string[] };

/** provider = 插件内接线；reference = 通用 CLI 目录（插件不接线）。 */
export type ToolKind = "provider" | "reference";

/** 一项条目。 */
export interface Capability {
  id: string;
  label: string;
  kind: ToolKind;
  /** 分类（渲染顺序见 CATEGORY_ORDER）。 */
  category: string;
  /** 它提供什么。 */
  provides: string;
  /** provider 缺件时**退到什么确定性路径**（ADR-0049）；reference 填「不影响插件行为」。 */
  degradesTo: string;
  /** 按 `process.platform` 给处置；`default` 兜底（非 Windows 平台走它）。 */
  remedy: Record<string, CapabilityRemedy>;
  /** 安装配方；**没有可靠装法就不给**（宁缺勿编）。 */
  install?: InstallRecipe;
  /** 对应的 winget 包 ID（结构化保留：供 docs 棘轮比对，避免文档与台账漂移）。 */
  winget?: string;
  /** 探测 argv（版本旗标见条目；探测失败只说「未检出」，不等于未装）。 */
  probe: string[];
  /** 备注（版本快照、坑、边界）。 */
  note?: string;
  /** 文档锚。 */
  doc: string;
}

/** winget 安装配方（`winget` 实测可被 execFile 直接起）。 */
const wingetRecipe = (pkg: string): InstallRecipe => ({
  kind: "argv",
  argv: ["winget", "install", "--id", pkg, "-e", "--accept-package-agreements", "--accept-source-agreements"],
});

/** winget 处置：win32 给命令，其它平台说明本表是 Windows 口径。 */
const wingetRemedy = (pkg: string, note?: string): Record<string, CapabilityRemedy> => ({
  win32: { cmd: `winget install --id ${pkg} -e`, note },
  default: { cmd: "（本表为 Windows 口径）", note: "非 Windows：用系统包管理器或官方 release" },
});

/**
 * **无可靠安装方式**时的处置（v1.15.12）：只陈述事实，**不编造命令**。
 * 用于：Windows 上确实没有官方包的工具（`tmux` / `viddy` / `tig`）、或平台专属（`ip`/`ss` 属 Linux iproute2）。
 */
const noInstallRemedy = (note: string): Record<string, CapabilityRemedy> => ({
  default: { cmd: "（未登记可靠安装方式）", note },
});

// ─────────────────────────────────────────────────────────────────────────────
// 通用 CLI 目录（reference）。列序固定：id, 二进制, 显示名, 分类, winget 包 ID, 实测版本, 版本旗标, 用途, 替代对象, 备注
// winget ID 与版本均为 **2026-09-10 本机实测核对**；版本会随时间变化，ID 稳定。
// ─────────────────────────────────────────────────────────────────────────────
const tool = (
  id: string,
  bin: string,
  label: string,
  category: string,
  pkg: string,
  ver: string,
  flag: string,
  provides: string,
  replaces: string,
  note?: string,
  /**
   * 版本号出处（v1.15.14；**v1.15.29 改正默认值**）。**必须诚实区分**，否则会说谎：
   *   - `"实测"`：在**本机**跑该条目的 `probe`（如 `--version`）拿到版本号。**只有这才叫实测。**
   *   - `"权威核验"`（**现为默认**）：取自 `winget show` 的权威目录 —— 那是**最新发布版**，
   *     **不代表本机已装该版本**。
   *
   * ⚠ **为什么改正默认值**（ADR-0072，实测证据）：本参数原默认为 `"实测"`，但 v1.15.10 加入的
   *   那 44 条，其版本号**其实全部取自 winget 目录**，并非本机 `--version` 跑出来的：
   *   · 44 条里 **35 条与 winget 权威版本逐字一致**（手工取本机版本不可能如此吻合）；
   *   · 逐条探测证实：标「实测 0.74.3」的 `fzf` 本机实为 **0.73.1**（且来自 scoop 而非 winget）；
   *     标「实测 0.10.0」的 `zoxide`，`winget list` 显示**已装 0.9.9 / 可用 0.10.0**
   *     —— 台账抄的是**「可用」列**（最新发布版）；
   *   · 本机可检出的 8 条「实测」条目里 **7 条台账版本比本机新**，方向一致（不是巧合）。
   *   ⇒ 「实测」这个标签**比事实强**，正是 v1.15.14 造 `verSrc` 要防的那种谎。
   *   改成 `"权威核验"` 后标签与事实一致，且**可复核**（重跑 `npm run verify:toolset` 即可确认）。
   */
  verSrc = "权威核验",
): Capability => {
  const providesText = `${provides}${replaces && replaces !== "—" ? `（替代：${replaces}）` : ""}`;
  // pkg 为空 → **无可靠安装方式**：只陈述事实，不给命令（宁缺勿编）。
  if (!pkg) {
    return {
      id, label, kind: "reference", category,
      provides: providesText,
      degradesTo: "无（通用工具，不影响插件行为）",
      remedy: noInstallRemedy(note || "本表未登记可靠安装方式"),
      probe: flag ? [bin, flag] : [bin],
      note: note ? `无 winget 包 · ${note}` : "无 winget 包",
      doc: "docs/toolchain-windows.md",
    };
  }
  return {
    id, label, kind: "reference", category,
    provides: providesText,
    degradesTo: "无（通用工具，不影响插件行为）",
    remedy: wingetRemedy(pkg, note),
    install: wingetRecipe(pkg),
    winget: pkg,
    probe: flag ? [bin, flag] : [bin],
    // v1.15.14 修一处**静默丢弃**：此前 `note` 只在无 pkg 分支被用，有 pkg 分支把它整条丢掉，
    //   于是传进来的许可证/坑说明**无声消失**。改为拼接，且把版本出处显式写出。
    note: `winget ${pkg} · ${verSrc} ${ver}${note ? ` · ${note}` : ""}`,
    doc: "docs/toolchain-windows.md",
  };
};

const REFERENCE_TOOLS: Capability[] = [
  // ── GNU 工具链（Windows 原本没有 grep/find/sed/awk…，最高优先级；三选一，勿全装）──
  tool("coreutils-ms", "coreutils", "Coreutils for Windows（微软打包 uutils）", "GNU 工具链", "Microsoft.Coreutils", "2026.9.3", "--version",
    "coreutils + findutils + grep 三合一的 multi-call 二进制", "grep/find/sed/awk 等（Windows 原本没有）",
    "✅ Windows 首选；**要求 PowerShell 7.4+**（7.6+ 支持 ~）；preview 阶段；与 PowerShell 别名冲突，可用 coreutils-manager disable 关掉"),
  tool("coreutils-uutils", "coreutils", "uutils coreutils（上游原版）", "GNU 工具链", "uutils.coreutils", "0.10.0", "--version",
    "GNU coreutils 的 Rust 跨平台重写", "GNU coreutils",
    "上游原版；自述「部分选项可能缺失或行为不同」，差异按 bug 处理"),
  tool("busybox", "busybox", "busybox-w32", "GNU 工具链", "frippery.busybox-w32", "1.38.0-FRP", "--help",
    "经典 BusyBox 的 Windows 移植", "大量 UNIX 小工具", "极简单文件、老派做法"),

  // ── 搜索与查找 ──
  tool("rg", "rg", "ripgrep", "搜索与查找", "BurntSushi.ripgrep.MSVC", "15.2.0", "--version", "全文搜索", "grep -R（Windows 无）",
    "另有 BurntSushi.ripgrep.GNU 变体"),
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
  // v1.15.12 补：WSL 清单（docs/toolchain-wsl.md）提到、但台账此前漏登的条目。
  // **Windows 无可靠包的不编造命令**（pkg 留空 → 只说事实）。
  tool("tmux", "tmux", "tmux", "Shell 与终端", "", "", "-V", "终端复用", "screen", "Windows 无官方包；用 zellij，或直接在 WSL 里用 tmux"),
  tool("tldr", "tldr", "tldr（tlrc）", "Shell 与终端", "tldr-pages.tlrc", "1.13.1", "--version", "精简帮助（社区示例）", "man"),
  tool("viddy", "viddy", "viddy", "构建与任务", "", "", "--version", "更现代的 watch", "watch", "winget 无结果（实测）；走 cargo install 或 release"),
  tool("tig", "tig", "tig", "Git 与版本控制", "", "", "--version", "Git TUI（轻量）", "git log", "winget 搜到的 DoD.STIGViewer 是**无关工具**（勿混装）；走 scoop/choco 或 release"),
  tool("lazydocker", "lazydocker", "lazydocker", "构建与任务", "JesseDuffield.Lazydocker", "0.25.2", "--version", "Docker TUI", "docker ps"),
  tool("ip", "ip", "iproute2（ip / ss）", "网络与下载", "", "", "-V", "网络配置与 socket 查看", "ifconfig / netstat", "**Linux 专属**（iproute2）；Windows 用 Get-NetIPAddress / netstat"),
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
  tool("jadx", "jadx", "jadx", "逆向与二进制分析", "Skylot.jadx", "1.5.6", "--version", "Dex/APK → Java 反编译", "—",
    "**需 Java 11+ 64 位**；作者警告无法 100% 反编译，报错属预期。GUI 为 jadx-gui"),

  // ═══════════════════════════════════════════════════════════════════════════
  // v1.15.14 扩源（ADR-0058）：以下条目由 tools/winget-verify-seed.ts **程序化核验**后写入。
  // 选入判据：publisher 能证明是上游本身或公认官方再打包；**按名字猜包 ID 已被证伪**
  //   （xh→Mozilla.Firefox.xh、delta→eToro.Delta、choose→AuthenticatorChooser、nix→LabChart…）。
  // 版本与许可证取自 `winget show` 权威输出（核验日 2026-09-11）；版本会随时间变化，ID 稳定。
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 逆向与二进制分析 ──
  tool("dnspy", "dnSpy", "dnSpyEx", "逆向与二进制分析", "dnSpyEx.dnSpy", "6.6.0", "--version",
    ".NET 调试与反编译", "—",
    ".NET 反编译首选；原 dnSpy 已停更，此为维护分支；许可证 GPL-3.0", "权威核验"),
  tool("exiftool", "exiftool", "ExifTool", "逆向与二进制分析", "OliverBetz.ExifTool", "13.59", "-ver",
    "文件元数据读写（EXIF 等）", "—",
    "Windows 再打包；上游 philharvey/ExifTool；许可证 CC0-1.0", "权威核验"),
  tool("ilspy", "ILSpy", "ILSpy", "逆向与二进制分析", "icsharpcode.ILSpy", "11.0.0.9375", "--version",
    ".NET 反编译（开源）", "—",
    "上游组织 icsharpcode；许可证 MIT", "权威核验"),
  tool("rizin", "rizin", "Rizin", "逆向与二进制分析", "Rizin.Rizin", "0.9.1", "-v",
    "逆向工程框架（radare2 分支）", "radare2",
    "radare2 活跃分支；GUI 是 Rizin.Cutter；许可证 LGPL-3.0", "权威核验"),
  tool("upx", "upx", "UPX", "逆向与二进制分析", "UPX.UPX", "5.2.1", "--version",
    "可执行文件压缩/加壳", "—",
    "上游自维护；许可证 GPL-2.0-or-later", "权威核验"),

  // ── 网络与下载 ──
  tool("curl", "curl", "curl", "网络与下载", "cURL.cURL", "8.21.0.6", "--version",
    "HTTP 客户端", "—",
    "Windows 自带的 curl.exe 版本旧，此为上游最新；许可证 Freeware", "权威核验"),
  tool("dog", "dog", "dog", "网络与下载", "ogham.dog", "0.1.0", "--version",
    "DNS 查询客户端", "dig / nslookup",
    "作者 ogham（同 bat 系出）；许可证 EUPL-1.2 License", "权威核验"),
  tool("doggo", "doggo", "doggo", "网络与下载", "MrKaran.Doggo", "1.4.0", "--version",
    "DNS 查询（现代）", "dig",
    "作者 MrKaran；许可证 GPL-3.0", "权威核验"),
  tool("httpie", "http", "HTTPie", "网络与下载", "HTTPie.HTTPie", "2025.2.0", "--version",
    "人性化 HTTP 客户端", "curl（可读性更好）",
    "上游自维护；许可证 免费软件", "权威核验"),
  tool("iperf3", "iperf3", "iperf3", "网络与下载", "ar51an.iPerf3", "3.21", "--version",
    "网络带宽测试", "—",
    "Windows 构建；上游 esnet/iperf；许可证 BSD-3-Clause", "权威核验"),
  tool("mitmproxy", "mitmdump", "mitmproxy", "网络与下载", "mitmproxy.mitmproxy", "12.2.3", "--version",
    "HTTP(S) 抓包与改写", "Fiddler / Charles",
    "命令行版是 mitmdump；另有 mitmweb/mitmproxy；许可证 MIT License", "权威核验"),
  tool("nmap", "nmap", "Nmap", "网络与下载", "Insecure.Nmap", "7.80", "--version",
    "端口扫描与网络探测", "—",
    "上游 Insecure.Com（nmap 官方发布者名）；许可证 Modified GNU GPLv2", "权威核验"),

  // ── 文本与数据 ──
  tool("duckdb", "duckdb", "DuckDB CLI", "文本与数据", "DuckDB.cli", "1.5.5", "--version",
    "进程内分析型 SQL（可直接查 CSV/Parquet）", "sqlite3（分析场景）",
    "上游自维护；许可证 MIT", "权威核验"),
  tool("gron", "gron", "gron", "文本与数据", "TomHudson.gron", "0.7.1", "--version",
    "JSON → 可 grep 的赋值语句", "jq（grep 场景）",
    "作者 TomHudson；许可证 MIT", "权威核验"),
  tool("miller", "mlr", "Miller", "文本与数据", "Miller.Miller", "6.20.2", "--version",
    "CSV/TSV/JSON 流式处理", "awk / cut / join",
    "二进制名是 mlr；许可证 BSD-2-Clause", "权威核验"),
  tool("xsv", "xsv", "xsv", "文本与数据", "BurntSushi.xsv.MSVC", "0.13.0", "--version",
    "CSV 命令行工具集", "csvkit",
    "作者 BurntSushi（同 ripgrep）；许可证 Dual License (Unlicense & MIT)", "权威核验"),

  // ── Git 与版本控制 ──
  tool("git-absorb", "git-absorb", "git-absorb", "Git 与版本控制", "tummychow.git-absorb", "0.9.0", "--version",
    "自动把改动折进正确的提交（fixup）", "手动 git rebase -i",
    "作者 tummychow；许可证 BSD-3-Clause", "权威核验"),
  tool("glab", "glab", "GitLab CLI", "Git 与版本控制", "GLab.GLab", "1.117.0", "--version",
    "GitLab 命令行（MR/Issue/CI）", "网页操作",
    "上游 glab（GitHub CLI 的 GitLab 对应物）；许可证 MIT", "权威核验"),
  tool("jj", "jj", "Jujutsu", "Git 与版本控制", "jj-vcs.jj", "0.44.0", "--version",
    "VCS（Git 兼容，工作流不同）", "—",
    "上游 jj-vcs；与 Git 仓库互操作；许可证 Apache-2.0", "权威核验"),

  // ── 容器与编排 ──
  tool("dive", "dive", "dive", "容器与编排", "wagoodman.dive", "0.13.1", "version",
    "镜像分层分析", "docker history",
    "作者 wagoodman；用于精简镜像；许可证 MIT", "权威核验"),
  tool("helm", "helm", "Helm", "容器与编排", "Helm.Helm", "4.3.0", "version",
    "Kubernetes 包管理", "—",
    "版本子命令是 `helm version`；许可证 Apache-2.0", "权威核验"),
  tool("k9s", "k9s", "k9s", "容器与编排", "Derailed.k9s", "0.51.0", "version",
    "Kubernetes TUI", "kubectl 手敲",
    "作者 derailed；许可证 Apache-2.0", "权威核验"),
  tool("kind", "kind", "kind", "容器与编排", "Kubernetes.kind", "0.33.0", "version",
    "本地 Kubernetes（容器内）", "minikube",
    "上游 kubernetes-sigs；许可证 Apache-2.0", "权威核验"),
  tool("kubectl", "kubectl", "kubectl", "容器与编排", "Kubernetes.kubectl", "1.37.0", "version",
    "Kubernetes 命令行", "—",
    "版本子命令是 `kubectl version`；许可证 Apache-2.0", "权威核验"),
  tool("kustomize", "kustomize", "kustomize", "容器与编排", "Kubernetes.kustomize", "5.8.1", "version",
    "K8s 清单定制（无模板）", "helm（轻量场景）",
    "上游 kubernetes-sigs；许可证 Apache-2.0", "权威核验"),
  tool("minikube", "minikube", "minikube", "容器与编排", "Kubernetes.minikube", "1.39.0", "version",
    "本地单节点 Kubernetes", "—",
    "上游 kubernetes；许可证 Apache-2.0", "权威核验"),
  tool("podman", "podman", "Podman", "容器与编排", "RedHat.Podman", "5.8.3", "--version",
    "无守护进程容器引擎", "docker",
    "RedHat 官方；许可证 Apache-2.0", "权威核验"),
  tool("skaffold", "skaffold", "Skaffold", "容器与编排", "Google.ContainerTools.Skaffold", "2.24.0", "version",
    "K8s 开发内循环", "手写 CI 脚本",
    "Google 官方；许可证 Apache-2.0", "权威核验"),
  tool("stern", "stern", "stern", "容器与编排", "stern.stern", "1.34.0", "--version",
    "多 Pod 日志聚合", "kubectl logs -f",
    "上游 stern；许可证 Apache-2.0 license", "权威核验"),

  // ── 安全与供应链 ──
  tool("cosign", "cosign", "Cosign", "安全与供应链", "Sigstore.Cosign", "3.1.3", "version",
    "制品签名与验签", "—",
    "Sigstore 官方；许可证 Apache-2.0", "权威核验"),
  tool("gitleaks", "gitleaks", "gitleaks", "安全与供应链", "Gitleaks.Gitleaks", "8.30.1", "version",
    "Git 历史密钥扫描", "手写正则",
    "上游 gitleaks；许可证 MIT", "权威核验"),
  tool("grype", "grype", "Grype", "安全与供应链", "Anchore.Grype", "0.118.0", "version",
    "SBOM/镜像漏洞扫描", "—",
    "Anchore 官方，与 syft 配套；许可证 Apache-2.0", "权威核验"),
  tool("kubescape", "kubescape", "Kubescape", "安全与供应链", "kubescape.kubescape", "4.0.14", "version",
    "K8s 安全基线扫描", "—",
    "ARMO 官方；许可证 Apache-2.0", "权威核验"),
  tool("sops", "sops", "SOPS", "安全与供应链", "SecretsOPerationS.SOPS", "3.13.3", "--version",
    "加密的配置文件管理", "明文密钥",
    "上游 getsops；许可证 MPL-2.0", "权威核验"),
  tool("syft", "syft", "Syft", "安全与供应链", "Anchore.Syft", "1.51.0", "version",
    "SBOM 生成", "—",
    "Anchore 官方；许可证 Apache-2.0", "权威核验"),
  tool("trivy", "trivy", "Trivy", "安全与供应链", "AquaSecurity.Trivy", "0.74.0", "--version",
    "漏洞/配置/密钥扫描", "—",
    "Aqua Security 官方；许可证 Apache-2.0", "权威核验"),

  // ── 构建与任务 ──
  tool("bazelisk", "bazelisk", "Bazelisk", "构建与任务", "Bazel.Bazelisk", "1.29.0", "version",
    "Bazel 版本管理器", "手动装 bazel",
    "上游 bazelbuild；许可证 Apache-2.0", "权威核验"),
  tool("cmake", "cmake", "CMake", "构建与任务", "Kitware.CMake", "4.4.3", "--version",
    "跨平台构建系统", "手写 Makefile",
    "Kitware 官方；许可证 BSD-3-Clause", "权威核验"),
  tool("goreleaser", "goreleaser", "GoReleaser", "构建与任务", "goreleaser.goreleaser", "2.17.1", "--version",
    "Go 制品发布自动化", "手写发布脚本",
    "上游自维护；许可证 MIT", "权威核验"),
  tool("k6", "k6", "k6", "构建与任务", "GrafanaLabs.k6", "2.2.0", "version",
    "负载测试", "ab / jmeter",
    "Grafana 官方；许可证 AGPL-3.0", "权威核验"),
  tool("ninja", "ninja", "Ninja", "构建与任务", "Ninja-build.Ninja", "1.13.2", "--version",
    "高速构建后端", "make（速度）",
    "上游 ninja-build；许可证 Apache-2.0", "权威核验"),

  // ── 文档与转换 ──
  tool("pandoc", "pandoc", "Pandoc", "文档与转换", "JohnMacFarlane.Pandoc", "3.11", "--version",
    "文档格式互转（md/docx/pdf…）", "—",
    "作者 John MacFarlane（上游本人）；许可证 GPL-2.0-or-later", "权威核验"),
  tool("poppler", "pdftotext", "Poppler", "文档与转换", "oschwartz10612.Poppler", "25.07.0-0", "-v",
    "PDF 文本/图片提取（pdftotext/pdftoppm）", "—",
    "Windows 构建；上游 freedesktop/poppler；许可证 MIT", "权威核验"),
  tool("qpdf", "qpdf", "qpdf", "文档与转换", "QPDF.QPDF", "12.4.1", "--version",
    "PDF 结构变换/修复", "—",
    "上游 qpdf；许可证 Apache-2.0", "权威核验"),
  tool("tesseract", "tesseract", "Tesseract OCR", "文档与转换", "UB-Mannheim.TesseractOCR", "5.4.0.20240606", "--version",
    "图片/PDF 文字识别", "—",
    "Windows 常用再打包；上游 tesseract-ocr；许可证 Apache-2.0", "权威核验"),
  tool("typst", "typst", "Typst", "文档与转换", "Typst.Typst", "0.15.1", "--version",
    "排版系统（LaTeX 替代，快）", "LaTeX",
    "上游 typst；许可证 Apache-2.0", "权威核验"),

  // ── 媒体处理 ──
  tool("imagemagick", "magick", "ImageMagick", "媒体处理", "ImageMagick.ImageMagick", "7.1.2.29", "--version",
    "图像转换与处理", "—",
    "二进制名是 magick（IM7）；许可证 ImageMagick", "权威核验"),
  tool("mkvtoolnix", "mkvmerge", "MKVToolNix", "媒体处理", "MoritzBunkus.MKVToolNix", "100.0.0", "--version",
    "Matroska 封装/拆分", "—",
    "作者 Moritz Bunkus（上游本人）；许可证 GPL-2.0", "权威核验"),
  tool("oxipng", "oxipng", "oxipng", "媒体处理", "Shssoichiro.Oxipng", "10.1.1", "--version",
    "PNG 无损压缩", "optipng",
    "上游自维护；许可证 MIT", "权威核验"),
  tool("yt-dlp", "yt-dlp", "yt-dlp", "媒体处理", "yt-dlp.yt-dlp", "2026.08.19", "--version",
    "网络视频/音频下载", "youtube-dl",
    "上游自维护；许可证 Unlicense", "权威核验"),

  // ── 磁盘与系统 ──
  tool("bottom", "btm", "bottom", "磁盘与系统", "Clement.bottom", "0.14.9", "--version",
    "系统监控（跨平台 top）", "任务管理器 / htop",
    "二进制名是 btm；作者 ClementTsang；许可证 MIT", "权威核验"),
  tool("hwinfo", "HWiNFO64", "HWiNFO", "磁盘与系统", "REALiX.HWiNFO", "8.50", "--version",
    "硬件信息与传感器读取", "—",
    "上游 REALiX；许可证 专有软件", "权威核验"),
  tool("sysinternals", "handle", "Sysinternals Suite", "磁盘与系统", "Microsoft.Sysinternals.Suite", "未取到（套件包）", "-?",
    "Windows 深度诊断（handle/procdump/autoruns…）", "—",
    "微软官方；套件含数十个工具，此处探针用 handle；许可证 Proprietary", "权威核验"),

  // ── 版本与包管理 ──
  tool("chocolatey", "choco", "Chocolatey", "版本与包管理", "Chocolatey.Chocolatey", "2.7.4.0", "--version",
    "Windows 包管理器（winget 之外的第二渠道）", "—",
    "上游 chocolatey；台账多条目在其上有包时可作补充渠道；许可证 Apache v2", "权威核验"),
  tool("conan", "conan", "Conan", "版本与包管理", "JFrog.Conan", "2.32.0", "--version",
    "C/C++ 包管理", "vcpkg（另一选择）",
    "JFrog 官方；许可证 MIT", "权威核验"),
  tool("miniconda", "conda", "Miniconda3", "版本与包管理", "Anaconda.Miniconda3", "未取到（套件包）", "--version",
    "Python/Conda 环境管理", "—",
    "二进制名是 conda；Anaconda 官方；许可证 专有软件", "权威核验"),
  tool("pixi", "pixi", "pixi", "版本与包管理", "prefix-dev.pixi", "0.80.0", "--version",
    "跨语言环境与包管理", "conda（更快）",
    "上游 prefix-dev；许可证 BSD-3-Clause", "权威核验"),
];

// ─────────────────────────────────────────────────────────────────────────────
// provider（插件内接线）—— 这两项的缺件会改变插件行为，故 `degradesTo` 有实义。
// ─────────────────────────────────────────────────────────────────────────────
const PROVIDERS: Capability[] = [
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
export const CAPABILITIES: Capability[] = [...PROVIDERS, ...REFERENCE_TOOLS];

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
  // v1.15.14 扩源新增（ADR-0058）：按「一个编码 agent 实际会做的活」分类，而非按工具来源分。
  "容器与编排",
  "安全与供应链",
  "文档与转换",
  "媒体处理",
];

export const providerCapabilities = (): Capability[] => CAPABILITIES.filter((c) => c.kind === "provider");
export const referenceCapabilities = (): Capability[] => CAPABILITIES.filter((c) => c.kind === "reference");

export const capabilityOf = (id: unknown): Capability | undefined =>
  CAPABILITIES.find((c) => c.id === String(id || ""));

/**
 * 需求侧别名（v1.15.13）：调用方常按**发行版包名 / 常见缩写**说一个工具，而不是台账 id。
 * 收在这里的是「同一物、多个名字」的确定映射；**不是**能力评分或优劣判断。
 * 与 WSL 棘轮（`test/toolset-catalog.test.ts` 的 ALIAS）同源：那边防台账↔文档漂移，这边防「说得出、查不到」。
 */
const NEED_ALIASES: Record<string, string> = {
  fdfind: "fd",
  batcat: "bat",
  z: "zoxide",
  sg: "ast-grep",
  ag: "ast-grep",
  ripgrep: "rg",
  neovim: "nvim",
  "github-cli": "gh",
  gnu_coreutils: "coreutils",
  coreutils_uutils: "coreutils",
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * **按「需要什么能力」反查台账**（v1.15.13，接缝 G2）。
 *
 * 为什么需要它：`capabilityOf(id)` 要求调用方**先知道台账的 id**；而派活时手里只有一句
 * 「这个活得做全文搜索 / 反编译 APK」。没有反查，agent 只能靠猜 id，或干脆不查。
 *
 * 匹配面：`id` / `probe[0]`（二进制名）/ `label` / `provides` / `category`，**词边界**匹配 + 别名归一。
 *
 * **这不是能力评分**（边界见 ADR-0029.1 inv 179 / ADR-0030 inv 184）：它只回答
 * 「台账里有没有一个叫这个名字的东西」，**不排优劣、不给主体打分、不产出 capability level**。
 * 命中多条是正常的（如 `coreutils` 三变体），调用方自行决定用哪个。
 */
export const findCapabilities = (need: unknown): Capability[] => {
  const raw = String(need || "").trim().toLowerCase();
  if (!raw) return [];
  const t = NEED_ALIASES[raw] || raw;
  if (t.length < 2) return [];                       // 单字符（如 "z"）只在别名表里成立，不裸匹配
  const re = new RegExp(`(^|[^a-z0-9_-])${escapeRe(t)}([^a-z0-9_-]|$)`, "i");
  return CAPABILITIES.filter((c) =>
    re.test(c.id) ||
    re.test(c.probe[0] || "") ||
    re.test(c.label) ||
    re.test(c.provides) ||
    re.test(c.category),
  );
};

/** 取该平台（或 default）的处置；条目未登记 → undefined。 */
export const remedyFor = (id: unknown, platform: string = process.platform): CapabilityRemedy | undefined => {
  const c = capabilityOf(id);
  if (!c) return undefined;
  return c.remedy[platform] || c.remedy.default;
};

/**
 * 缺件一行提示（给读侧输出用）。**条目未登记 → undefined**：不认识的东西不编造命令。
 * 形状：`> 缺件处置：<命令>（<坑>）· 提供什么 · 退到哪 · 原因 · 见文档`
 */
export const unavailableHint = (id: unknown, reason?: unknown, platform: string = process.platform): string | undefined => {
  const c = capabilityOf(id);
  if (!c) return undefined;
  const r = remedyFor(id, platform);
  if (!r) return undefined;
  const why = String(reason || "").trim();
  const seg = [`> 缺件处置：${r.cmd}`];
  if (r.note) seg.push(`（${r.note}）`);
  seg.push(`· 提供：${c.provides}`);
  seg.push(`· 现退到：${c.degradesTo}`);
  if (why && why !== "unavailable") seg.push(`· 原因：${why}`);
  seg.push(`· 见 ${c.doc}`);
  return seg.join(" ");
};
