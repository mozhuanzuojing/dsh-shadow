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

import { verSrcLabel, type VerSrcKind } from "../util.js";

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
  /** 分类（渲染顺序见 `CATEGORY_ORDER`）；类型是**由 `CATEGORY_ORDER` 派生的联合**（A20）。 */
  category: Category;
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
  /**
   * **版本号出处的类型化字段 —— 唯一事实源**（v1.15.89 / ADR-0090，来自 ADR-0087 的「甲-3」）。
   * `note` 由它**派生**（渲染逐字不变），下游 `claimOf()` 不再正则反解散文 ——
   * 「弱档被折进散文」正是 ADR-0072 要防的形态。
   */
  verSrcKind: VerSrcKind;
  /** 台账**声称**的版本号（原样保留；`none` 档为 `""`）。 */
  verSrcVersion: string;
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
// 通用 CLI 目录（reference）。**字段即契约**（A19：单对象参数，顺序不再是契约）。
// winget ID 与版本均为 **2026-09-10 本机实测核对**；版本会随时间变化，ID 稳定。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `tool()` 的入参（A19）。**为什么从 11 个位置参数改成单对象**：
 * 原签名 `tool(id, bin, label, category, pkg, ver, flag, provides, replaces, note?, verSrc?)` 里
 * `bin` 与 `label`、`ver` 与 `flag` **位置相邻且同为 `string`** ⇒ 写错位置**不报错**，
 * 而错的 `probe[0]` 会让该条目**恒「未检出」**（台账是给 agent 看的权威目录，错一条就误导一次）；
 * 调用点读到 11 个裸参数也看不出语义（`REFERENCE_TOOLS` 里那几个「备注很长、被折成两三行」的条目尤其如此）。
 * 改成单对象后：字段名即文档、缺字段/多字段都编译不过、顺序随意。
 */
interface ToolSpec {
  id: string;
  /** 二进制名（`probe[0]`；与 `label` 是两件事，此前同为相邻 `string`）。 */
  bin: string;
  label: string;
  category: Category;
  /** winget 包 ID；**空串 = 无可靠安装方式**（只陈述事实，不给命令）。 */
  pkg: string;
  /** 台账**声称**的版本号（原样保留；`"none"` 档为 `""`）。 */
  ver: string;
  /** 版本旗标/子命令（如 `--version` / `-V` / `version`）；`probe = [bin, flag]`。 */
  flag: string;
  provides: string;
  replaces: string;
  note?: string;
  /**
   * 版本号出处（v1.15.14；**v1.15.29 改正默认值**；**v1.15.89 改成类型**；**A19 起随入参变成字段**）。
   * **必须诚实区分**，否则会说谎：
   *   - `"measured"`（标签「实测」）：在**本机**跑该条目的 `probe`（如 `--version`）拿到版本号。**只有这才叫实测。**
   *   - `"authority"`（标签「权威核验」，**现为默认**）：取自 `winget show` 的权威目录 —— 那是**最新发布版**，
   *     **不代表本机已装该版本**。
   *   - `"none"`：**不声称版本**（无 winget 包等无版本可比对的条目）。
   * ⚠ **取值域是类型**（`core/util.ts` 的 `VerSrcKind`），不是任意字符串 —— 见 ADR-0090。
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
  verSrc?: VerSrcKind;
}

const tool = (spec: ToolSpec): Capability => {
  const { id, bin, label, category, pkg, ver, flag, provides, replaces, note, verSrc = "authority" } = spec;
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
      verSrcKind: "none",
      verSrcVersion: "",
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
    note: `winget ${pkg} · ${verSrcLabel(verSrc)} ${ver}${note ? ` · ${note}` : ""}`,
    verSrcKind: verSrc,
    verSrcVersion: ver,
    doc: "docs/toolchain-windows.md",
  };
};

const REFERENCE_TOOLS: Capability[] = [
  // ── GNU 工具链（Windows 原本没有 grep/find/sed/awk…，最高优先级；三选一，勿全装）──
  tool({ id: "coreutils-ms", bin: "coreutils", label: "Coreutils for Windows（微软打包 uutils）", category: "GNU 工具链", pkg: "Microsoft.Coreutils", ver: "2026.9.3", flag: "--version",
    provides: "coreutils + findutils + grep 三合一的 multi-call 二进制", replaces: "grep/find/sed/awk 等（Windows 原本没有）", note: "✅ Windows 首选；**要求 PowerShell 7.4+**（7.6+ 支持 ~）；preview 阶段；与 PowerShell 别名冲突，可用 coreutils-manager disable 关掉" }),
  tool({ id: "coreutils-uutils", bin: "coreutils", label: "uutils coreutils（上游原版）", category: "GNU 工具链", pkg: "uutils.coreutils", ver: "0.10.0", flag: "--version",
    provides: "GNU coreutils 的 Rust 跨平台重写", replaces: "GNU coreutils", note: "上游原版；自述「部分选项可能缺失或行为不同」，差异按 bug 处理" }),
  tool({ id: "busybox", bin: "busybox", label: "busybox-w32", category: "GNU 工具链", pkg: "frippery.busybox-w32", ver: "1.38.0-FRP", flag: "--help",
    provides: "经典 BusyBox 的 Windows 移植", replaces: "大量 UNIX 小工具", note: "极简单文件、老派做法" }),

  // ── 搜索与查找 ──
  tool({ id: "rg", bin: "rg", label: "ripgrep", category: "搜索与查找", pkg: "BurntSushi.ripgrep.MSVC", ver: "15.2.0", flag: "--version",
    provides: "全文搜索", replaces: "grep -R（Windows 无）", note: "另有 BurntSushi.ripgrep.GNU 变体" }),
  tool({ id: "fd", bin: "fd", label: "fd", category: "搜索与查找", pkg: "sharkdp.fd", ver: "10.5.0", flag: "--version", provides: "文件查找", replaces: "UNIX find（注意 DOS find.exe 不是它）" }),
  tool({ id: "ast-grep", bin: "ast-grep", label: "ast-grep", category: "搜索与查找", pkg: "ast-grep.ast-grep", ver: "0.45.2", flag: "--version", provides: "AST 结构化搜索", replaces: "grep -C" }),
  tool({ id: "fzf", bin: "fzf", label: "fzf", category: "搜索与查找", pkg: "junegunn.fzf", ver: "0.74.3", flag: "--version", provides: "模糊过滤", replaces: "find | grep" }),

  // ── 文本与数据处理 ──
  tool({ id: "jq", bin: "jq", label: "jq", category: "文本与数据", pkg: "jqlang.jq", ver: "1.8.2", flag: "--version", provides: "JSON 处理", replaces: "—" }),
  tool({ id: "yq", bin: "yq", label: "yq", category: "文本与数据", pkg: "MikeFarah.yq", ver: "4.53.6", flag: "--version", provides: "YAML/JSON 处理", replaces: "—" }),
  tool({ id: "sd", bin: "sd", label: "sd", category: "文本与数据", pkg: "chmln.sd", ver: "1.1.0", flag: "--version", provides: "字符串替换", replaces: "sed（Windows 无）" }),
  tool({ id: "bat", bin: "bat", label: "bat", category: "文本与数据", pkg: "sharkdp.bat", ver: "0.26.1", flag: "--version", provides: "高亮查看文件", replaces: "cat（PowerShell 别名，非文件）" }),
  tool({ id: "glow", bin: "glow", label: "glow", category: "文本与数据", pkg: "charmbracelet.glow", ver: "3.0.0", flag: "--version", provides: "Markdown 渲染", replaces: "阅读 .md" }),
  tool({ id: "hexyl", bin: "hexyl", label: "hexyl", category: "文本与数据", pkg: "sharkdp.hexyl", ver: "0.17.0", flag: "--version", provides: "十六进制查看", replaces: "xxd / od" }),

  // ── 目录与文件浏览 ──
  tool({ id: "eza", bin: "eza", label: "eza", category: "目录与浏览", pkg: "eza-community.eza", ver: "0.23.5", flag: "--version", provides: "目录清单", replaces: "ls / dir" }),
  tool({ id: "yazi", bin: "yazi", label: "yazi", category: "目录与浏览", pkg: "sxyazi.yazi", ver: "26.9.1", flag: "--version", provides: "终端文件管理器", replaces: "mc / 资源管理器" }),

  // ── Shell 与终端 ──
  tool({ id: "zoxide", bin: "zoxide", label: "zoxide", category: "Shell 与终端", pkg: "ajeetdsouza.zoxide", ver: "0.10.0", flag: "--version", provides: "目录跳转（z）", replaces: "cd" }),
  tool({ id: "atuin", bin: "atuin", label: "atuin", category: "Shell 与终端", pkg: "Atuinsh.Atuin", ver: "18.21.0", flag: "--version", provides: "历史搜索", replaces: "history | grep" }),
  tool({ id: "starship", bin: "starship", label: "starship", category: "Shell 与终端", pkg: "Starship.Starship", ver: "1.26.0", flag: "--version", provides: "提示符", replaces: "各 shell 自带提示符" }),
  tool({ id: "nushell", bin: "nu", label: "nushell", category: "Shell 与终端", pkg: "Nushell.Nushell", ver: "0.114.1", flag: "--version",
    provides: "结构化 Shell", replaces: "PowerShell（另一种选择）", note: "二进制名是 nu" }),
  tool({ id: "direnv", bin: "direnv", label: "direnv", category: "Shell 与终端", pkg: "direnv.direnv", ver: "2.37.1", flag: "version",
    provides: "目录局部环境", replaces: "手动 source .env", note: "版本子命令是 `direnv version`，不是 --version" }),
  tool({ id: "zellij", bin: "zellij", label: "zellij", category: "Shell 与终端", pkg: "Zellij.Zellij", ver: "0.45.1", flag: "--version",
    provides: "终端复用", replaces: "tmux", note: "**Windows 无官方 tmux winget 包**，用 zellij 替代" }),
  // v1.15.12 补：WSL 清单（docs/toolchain-wsl.md）提到、但台账此前漏登的条目。
  // **Windows 无可靠包的不编造命令**（pkg 留空 → 只说事实）。
  tool({ id: "tmux", bin: "tmux", label: "tmux", category: "Shell 与终端", pkg: "", ver: "", flag: "-V", provides: "终端复用", replaces: "screen", note: "Windows 无官方包；用 zellij，或直接在 WSL 里用 tmux" }),
  tool({ id: "tldr", bin: "tldr", label: "tldr（tlrc）", category: "Shell 与终端", pkg: "tldr-pages.tlrc", ver: "1.13.1", flag: "--version", provides: "精简帮助（社区示例）", replaces: "man" }),
  tool({ id: "viddy", bin: "viddy", label: "viddy", category: "构建与任务", pkg: "", ver: "", flag: "--version", provides: "更现代的 watch", replaces: "watch", note: "winget 无结果（实测）；走 cargo install 或 release" }),
  tool({ id: "tig", bin: "tig", label: "tig", category: "Git 与版本控制", pkg: "", ver: "", flag: "--version",
    provides: "Git TUI（轻量）", replaces: "git log", note: "winget 搜到的 DoD.STIGViewer 是**无关工具**（勿混装）；走 scoop/choco 或 release" }),
  tool({ id: "lazydocker", bin: "lazydocker", label: "lazydocker", category: "构建与任务", pkg: "JesseDuffield.Lazydocker", ver: "0.25.2", flag: "--version", provides: "Docker TUI", replaces: "docker ps" }),
  tool({ id: "ip", bin: "ip", label: "iproute2（ip / ss）", category: "网络与下载", pkg: "", ver: "", flag: "-V",
    provides: "网络配置与 socket 查看", replaces: "ifconfig / netstat", note: "**Linux 专属**（iproute2）；Windows 用 Get-NetIPAddress / netstat" }),
  tool({ id: "wezterm", bin: "wezterm", label: "WezTerm", category: "Shell 与终端", pkg: "wez.wezterm", ver: "20240203", flag: "--version", provides: "终端模拟器", replaces: "Windows Terminal（自带）" }),
  tool({ id: "nvim", bin: "nvim", label: "Neovim", category: "Shell 与终端", pkg: "Neovim.Neovim", ver: "0.12.5", flag: "--version", provides: "编辑器", replaces: "notepad / VS Code" }),

  // ── Git 与版本控制 ──
  tool({ id: "delta", bin: "delta", label: "delta", category: "Git 与版本控制", pkg: "dandavison.delta", ver: "0.19.2", flag: "--version", provides: "diff 美化", replaces: "diff" }),
  tool({ id: "lazygit", bin: "lazygit", label: "lazygit", category: "Git 与版本控制", pkg: "JesseDuffield.lazygit", ver: "0.64.1", flag: "--version", provides: "Git TUI", replaces: "git log 手敲" }),
  tool({ id: "gh", bin: "gh", label: "GitHub CLI", category: "Git 与版本控制", pkg: "GitHub.cli", ver: "2.100.0", flag: "--version", provides: "GitHub 命令行", replaces: "网页操作" }),

  // ── 磁盘与系统 ──
  tool({ id: "dust", bin: "dust", label: "dust", category: "磁盘与系统", pkg: "bootandy.dust", ver: "1.2.5", flag: "--version", provides: "磁盘分析", replaces: "du" }),
  tool({ id: "dua", bin: "dua", label: "dua", category: "磁盘与系统", pkg: "Byron.dua-cli", ver: "2.42.1", flag: "--version", provides: "磁盘分析（交互）", replaces: "ncdu" }),
  tool({ id: "btop", bin: "btop", label: "btop4win", category: "磁盘与系统", pkg: "aristocratos.btop4win", ver: "1.0.5", flag: "--version", provides: "系统监控", replaces: "任务管理器 / top" }),
  tool({ id: "procs", bin: "procs", label: "procs", category: "磁盘与系统", pkg: "dalance.procs", ver: "0.14.12", flag: "--version", provides: "进程查看", replaces: "ps aux" }),

  // ── 网络与下载 ──
  tool({ id: "xh", bin: "xh", label: "xh", category: "网络与下载", pkg: "ducaale.xh", ver: "0.26.2", flag: "--version", provides: "HTTP 客户端", replaces: "curl" }),
  tool({ id: "aria2", bin: "aria2c", label: "aria2", category: "网络与下载", pkg: "aria2.aria2", ver: "1.37.0", flag: "--version", provides: "多线程下载", replaces: "wget", note: "二进制名是 aria2c" }),
  tool({ id: "gping", bin: "gping", label: "gping", category: "网络与下载", pkg: "orf.gping", ver: "1.21.0", flag: "--version", provides: "图形化 ping", replaces: "ping" }),
  tool({ id: "ffmpeg", bin: "ffmpeg", label: "FFmpeg", category: "网络与下载", pkg: "Gyan.FFmpeg", ver: "9.0.1", flag: "-version", provides: "媒体处理", replaces: "—", note: "版本旗标是单横线 -version" }),

  // ── 版本与包管理 ──
  tool({ id: "mise", bin: "mise", label: "mise", category: "版本与包管理", pkg: "jdx.mise", ver: "2026.8.5", flag: "--version", provides: "版本管理器", replaces: "nvm / fnm / asdf" }),
  tool({ id: "uv", bin: "uv", label: "uv", category: "版本与包管理", pkg: "astral-sh.uv", ver: "0.12.12", flag: "--version",
    provides: "Python 环境与工具", replaces: "pip / pipenv / pipx", note: "真 .exe，可直接被 execFile 起" }),

  // ── 构建与任务编排 ──
  tool({ id: "just", bin: "just", label: "just", category: "构建与任务", pkg: "Casey.Just", ver: "1.58.0", flag: "--version", provides: "任务运行器", replaces: "make" }),
  tool({ id: "mprocs", bin: "mprocs", label: "mprocs", category: "构建与任务", pkg: "pvolok.mprocs", ver: "0.9.6", flag: "--version", provides: "多进程管理", replaces: "parallel" }),
  tool({ id: "hyperfine", bin: "hyperfine", label: "hyperfine", category: "构建与任务", pkg: "sharkdp.hyperfine", ver: "1.20.0", flag: "--version", provides: "基准测试", replaces: "time" }),
  tool({ id: "lnav", bin: "lnav", label: "lnav", category: "构建与任务", pkg: "tstack.lnav", ver: "0.14.1-rc1", flag: "--version", provides: "日志分析", replaces: "tail -f" }),

  // ── 归档 ──
  tool({ id: "7zip", bin: "7z", label: "7-Zip", category: "归档", pkg: "7zip.7zip", ver: "26.03", flag: "", provides: "压缩/解压", replaces: "tar / unzip（Windows 无 unzip）", note: "不带参数即打印版本与用法；另有 7z.exe" }),

  // ── 逆向与二进制分析 ──
  tool({ id: "jadx", bin: "jadx", label: "jadx", category: "逆向与二进制分析", pkg: "Skylot.jadx", ver: "1.5.6", flag: "--version",
    provides: "Dex/APK → Java 反编译", replaces: "—", note: "**需 Java 11+ 64 位**；作者警告无法 100% 反编译，报错属预期。GUI 为 jadx-gui" }),

  // ═══════════════════════════════════════════════════════════════════════════
  // v1.15.14 扩源（ADR-0058）：以下条目由 tools/winget-verify-seed.ts **程序化核验**后写入。
  // 选入判据：publisher 能证明是上游本身或公认官方再打包；**按名字猜包 ID 已被证伪**
  //   （xh→Mozilla.Firefox.xh、delta→eToro.Delta、choose→AuthenticatorChooser、nix→LabChart…）。
  // 版本与许可证取自 `winget show` 权威输出（核验日 2026-09-11）；版本会随时间变化，ID 稳定。
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 逆向与二进制分析 ──
  tool({ id: "dnspy", bin: "dnSpy", label: "dnSpyEx", category: "逆向与二进制分析", pkg: "dnSpyEx.dnSpy", ver: "6.6.0", flag: "--version",
    provides: ".NET 调试与反编译", replaces: "—", note: ".NET 反编译首选；原 dnSpy 已停更，此为维护分支；许可证 GPL-3.0", verSrc: "authority" }),
  tool({ id: "exiftool", bin: "exiftool", label: "ExifTool", category: "逆向与二进制分析", pkg: "OliverBetz.ExifTool", ver: "13.59", flag: "-ver",
    provides: "文件元数据读写（EXIF 等）", replaces: "—", note: "Windows 再打包；上游 philharvey/ExifTool；许可证 CC0-1.0", verSrc: "authority" }),
  tool({ id: "ilspy", bin: "ILSpy", label: "ILSpy", category: "逆向与二进制分析", pkg: "icsharpcode.ILSpy", ver: "11.0.0.9375", flag: "--version",
    provides: ".NET 反编译（开源）", replaces: "—", note: "上游组织 icsharpcode；许可证 MIT", verSrc: "authority" }),
  tool({ id: "rizin", bin: "rizin", label: "Rizin", category: "逆向与二进制分析", pkg: "Rizin.Rizin", ver: "0.9.1", flag: "-v",
    provides: "逆向工程框架（radare2 分支）", replaces: "radare2", note: "radare2 活跃分支；GUI 是 Rizin.Cutter；许可证 LGPL-3.0", verSrc: "authority" }),
  tool({ id: "upx", bin: "upx", label: "UPX", category: "逆向与二进制分析", pkg: "UPX.UPX", ver: "5.2.1", flag: "--version",
    provides: "可执行文件压缩/加壳", replaces: "—", note: "上游自维护；许可证 GPL-2.0-or-later", verSrc: "authority" }),

  // ── 网络与下载 ──
  tool({ id: "curl", bin: "curl", label: "curl", category: "网络与下载", pkg: "cURL.cURL", ver: "8.21.0.6", flag: "--version",
    provides: "HTTP 客户端", replaces: "—", note: "Windows 自带的 curl.exe 版本旧，此为上游最新；许可证 Freeware", verSrc: "authority" }),
  tool({ id: "dog", bin: "dog", label: "dog", category: "网络与下载", pkg: "ogham.dog", ver: "0.1.0", flag: "--version",
    provides: "DNS 查询客户端", replaces: "dig / nslookup", note: "作者 ogham（同 bat 系出）；许可证 EUPL-1.2 License", verSrc: "authority" }),
  tool({ id: "doggo", bin: "doggo", label: "doggo", category: "网络与下载", pkg: "MrKaran.Doggo", ver: "1.4.0", flag: "--version",
    provides: "DNS 查询（现代）", replaces: "dig", note: "作者 MrKaran；许可证 GPL-3.0", verSrc: "authority" }),
  tool({ id: "httpie", bin: "http", label: "HTTPie", category: "网络与下载", pkg: "HTTPie.HTTPie", ver: "2025.2.0", flag: "--version",
    provides: "人性化 HTTP 客户端", replaces: "curl（可读性更好）", note: "上游自维护；许可证 免费软件", verSrc: "authority" }),
  tool({ id: "iperf3", bin: "iperf3", label: "iperf3", category: "网络与下载", pkg: "ar51an.iPerf3", ver: "3.21", flag: "--version",
    provides: "网络带宽测试", replaces: "—", note: "Windows 构建；上游 esnet/iperf；许可证 BSD-3-Clause", verSrc: "authority" }),
  tool({ id: "mitmproxy", bin: "mitmdump", label: "mitmproxy", category: "网络与下载", pkg: "mitmproxy.mitmproxy", ver: "12.2.3", flag: "--version",
    provides: "HTTP(S) 抓包与改写", replaces: "Fiddler / Charles", note: "命令行版是 mitmdump；另有 mitmweb/mitmproxy；许可证 MIT License", verSrc: "authority" }),
  tool({ id: "nmap", bin: "nmap", label: "Nmap", category: "网络与下载", pkg: "Insecure.Nmap", ver: "7.80", flag: "--version",
    provides: "端口扫描与网络探测", replaces: "—", note: "上游 Insecure.Com（nmap 官方发布者名）；许可证 Modified GNU GPLv2", verSrc: "authority" }),

  // ── 文本与数据 ──
  tool({ id: "duckdb", bin: "duckdb", label: "DuckDB CLI", category: "文本与数据", pkg: "DuckDB.cli", ver: "1.5.5", flag: "--version",
    provides: "进程内分析型 SQL（可直接查 CSV/Parquet）", replaces: "sqlite3（分析场景）", note: "上游自维护；许可证 MIT", verSrc: "authority" }),
  tool({ id: "gron", bin: "gron", label: "gron", category: "文本与数据", pkg: "TomHudson.gron", ver: "0.7.1", flag: "--version",
    provides: "JSON → 可 grep 的赋值语句", replaces: "jq（grep 场景）", note: "作者 TomHudson；许可证 MIT", verSrc: "authority" }),
  tool({ id: "miller", bin: "mlr", label: "Miller", category: "文本与数据", pkg: "Miller.Miller", ver: "6.20.2", flag: "--version",
    provides: "CSV/TSV/JSON 流式处理", replaces: "awk / cut / join", note: "二进制名是 mlr；许可证 BSD-2-Clause", verSrc: "authority" }),
  tool({ id: "xsv", bin: "xsv", label: "xsv", category: "文本与数据", pkg: "BurntSushi.xsv.MSVC", ver: "0.13.0", flag: "--version",
    provides: "CSV 命令行工具集", replaces: "csvkit", note: "作者 BurntSushi（同 ripgrep）；许可证 Dual License (Unlicense & MIT)", verSrc: "authority" }),

  // ── Git 与版本控制 ──
  tool({ id: "git-absorb", bin: "git-absorb", label: "git-absorb", category: "Git 与版本控制", pkg: "tummychow.git-absorb", ver: "0.9.0", flag: "--version",
    provides: "自动把改动折进正确的提交（fixup）", replaces: "手动 git rebase -i", note: "作者 tummychow；许可证 BSD-3-Clause", verSrc: "authority" }),
  tool({ id: "glab", bin: "glab", label: "GitLab CLI", category: "Git 与版本控制", pkg: "GLab.GLab", ver: "1.117.0", flag: "--version",
    provides: "GitLab 命令行（MR/Issue/CI）", replaces: "网页操作", note: "上游 glab（GitHub CLI 的 GitLab 对应物）；许可证 MIT", verSrc: "authority" }),
  tool({ id: "jj", bin: "jj", label: "Jujutsu", category: "Git 与版本控制", pkg: "jj-vcs.jj", ver: "0.44.0", flag: "--version",
    provides: "VCS（Git 兼容，工作流不同）", replaces: "—", note: "上游 jj-vcs；与 Git 仓库互操作；许可证 Apache-2.0", verSrc: "authority" }),

  // ── 容器与编排 ──
  tool({ id: "dive", bin: "dive", label: "dive", category: "容器与编排", pkg: "wagoodman.dive", ver: "0.13.1", flag: "version",
    provides: "镜像分层分析", replaces: "docker history", note: "作者 wagoodman；用于精简镜像；许可证 MIT", verSrc: "authority" }),
  tool({ id: "helm", bin: "helm", label: "Helm", category: "容器与编排", pkg: "Helm.Helm", ver: "4.3.0", flag: "version",
    provides: "Kubernetes 包管理", replaces: "—", note: "版本子命令是 `helm version`；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "k9s", bin: "k9s", label: "k9s", category: "容器与编排", pkg: "Derailed.k9s", ver: "0.51.0", flag: "version",
    provides: "Kubernetes TUI", replaces: "kubectl 手敲", note: "作者 derailed；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "kind", bin: "kind", label: "kind", category: "容器与编排", pkg: "Kubernetes.kind", ver: "0.33.0", flag: "version",
    provides: "本地 Kubernetes（容器内）", replaces: "minikube", note: "上游 kubernetes-sigs；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "kubectl", bin: "kubectl", label: "kubectl", category: "容器与编排", pkg: "Kubernetes.kubectl", ver: "1.37.0", flag: "version",
    provides: "Kubernetes 命令行", replaces: "—", note: "版本子命令是 `kubectl version`；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "kustomize", bin: "kustomize", label: "kustomize", category: "容器与编排", pkg: "Kubernetes.kustomize", ver: "5.8.1", flag: "version",
    provides: "K8s 清单定制（无模板）", replaces: "helm（轻量场景）", note: "上游 kubernetes-sigs；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "minikube", bin: "minikube", label: "minikube", category: "容器与编排", pkg: "Kubernetes.minikube", ver: "1.39.0", flag: "version",
    provides: "本地单节点 Kubernetes", replaces: "—", note: "上游 kubernetes；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "podman", bin: "podman", label: "Podman", category: "容器与编排", pkg: "RedHat.Podman", ver: "5.8.3", flag: "--version",
    provides: "无守护进程容器引擎", replaces: "docker", note: "RedHat 官方；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "skaffold", bin: "skaffold", label: "Skaffold", category: "容器与编排", pkg: "Google.ContainerTools.Skaffold", ver: "2.24.0", flag: "version",
    provides: "K8s 开发内循环", replaces: "手写 CI 脚本", note: "Google 官方；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "stern", bin: "stern", label: "stern", category: "容器与编排", pkg: "stern.stern", ver: "1.34.0", flag: "--version",
    provides: "多 Pod 日志聚合", replaces: "kubectl logs -f", note: "上游 stern；许可证 Apache-2.0 license", verSrc: "authority" }),

  // ── 安全与供应链 ──
  tool({ id: "cosign", bin: "cosign", label: "Cosign", category: "安全与供应链", pkg: "Sigstore.Cosign", ver: "3.1.3", flag: "version",
    provides: "制品签名与验签", replaces: "—", note: "Sigstore 官方；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "gitleaks", bin: "gitleaks", label: "gitleaks", category: "安全与供应链", pkg: "Gitleaks.Gitleaks", ver: "8.30.1", flag: "version",
    provides: "Git 历史密钥扫描", replaces: "手写正则", note: "上游 gitleaks；许可证 MIT", verSrc: "authority" }),
  tool({ id: "grype", bin: "grype", label: "Grype", category: "安全与供应链", pkg: "Anchore.Grype", ver: "0.118.0", flag: "version",
    provides: "SBOM/镜像漏洞扫描", replaces: "—", note: "Anchore 官方，与 syft 配套；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "kubescape", bin: "kubescape", label: "Kubescape", category: "安全与供应链", pkg: "kubescape.kubescape", ver: "4.0.14", flag: "version",
    provides: "K8s 安全基线扫描", replaces: "—", note: "ARMO 官方；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "sops", bin: "sops", label: "SOPS", category: "安全与供应链", pkg: "SecretsOPerationS.SOPS", ver: "3.13.3", flag: "--version",
    provides: "加密的配置文件管理", replaces: "明文密钥", note: "上游 getsops；许可证 MPL-2.0", verSrc: "authority" }),
  tool({ id: "syft", bin: "syft", label: "Syft", category: "安全与供应链", pkg: "Anchore.Syft", ver: "1.51.0", flag: "version",
    provides: "SBOM 生成", replaces: "—", note: "Anchore 官方；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "trivy", bin: "trivy", label: "Trivy", category: "安全与供应链", pkg: "AquaSecurity.Trivy", ver: "0.74.0", flag: "--version",
    provides: "漏洞/配置/密钥扫描", replaces: "—", note: "Aqua Security 官方；许可证 Apache-2.0", verSrc: "authority" }),

  // ── 构建与任务 ──
  tool({ id: "bazelisk", bin: "bazelisk", label: "Bazelisk", category: "构建与任务", pkg: "Bazel.Bazelisk", ver: "1.29.0", flag: "version",
    provides: "Bazel 版本管理器", replaces: "手动装 bazel", note: "上游 bazelbuild；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "cmake", bin: "cmake", label: "CMake", category: "构建与任务", pkg: "Kitware.CMake", ver: "4.4.3", flag: "--version",
    provides: "跨平台构建系统", replaces: "手写 Makefile", note: "Kitware 官方；许可证 BSD-3-Clause", verSrc: "authority" }),
  tool({ id: "goreleaser", bin: "goreleaser", label: "GoReleaser", category: "构建与任务", pkg: "goreleaser.goreleaser", ver: "2.17.1", flag: "--version",
    provides: "Go 制品发布自动化", replaces: "手写发布脚本", note: "上游自维护；许可证 MIT", verSrc: "authority" }),
  tool({ id: "k6", bin: "k6", label: "k6", category: "构建与任务", pkg: "GrafanaLabs.k6", ver: "2.2.0", flag: "version",
    provides: "负载测试", replaces: "ab / jmeter", note: "Grafana 官方；许可证 AGPL-3.0", verSrc: "authority" }),
  tool({ id: "ninja", bin: "ninja", label: "Ninja", category: "构建与任务", pkg: "Ninja-build.Ninja", ver: "1.13.2", flag: "--version",
    provides: "高速构建后端", replaces: "make（速度）", note: "上游 ninja-build；许可证 Apache-2.0", verSrc: "authority" }),

  // ── 文档与转换 ──
  tool({ id: "pandoc", bin: "pandoc", label: "Pandoc", category: "文档与转换", pkg: "JohnMacFarlane.Pandoc", ver: "3.11", flag: "--version",
    provides: "文档格式互转（md/docx/pdf…）", replaces: "—", note: "作者 John MacFarlane（上游本人）；许可证 GPL-2.0-or-later", verSrc: "authority" }),
  tool({ id: "poppler", bin: "pdftotext", label: "Poppler", category: "文档与转换", pkg: "oschwartz10612.Poppler", ver: "25.07.0-0", flag: "-v",
    provides: "PDF 文本/图片提取（pdftotext/pdftoppm）", replaces: "—", note: "Windows 构建；上游 freedesktop/poppler；许可证 MIT", verSrc: "authority" }),
  tool({ id: "qpdf", bin: "qpdf", label: "qpdf", category: "文档与转换", pkg: "QPDF.QPDF", ver: "12.4.1", flag: "--version",
    provides: "PDF 结构变换/修复", replaces: "—", note: "上游 qpdf；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "tesseract", bin: "tesseract", label: "Tesseract OCR", category: "文档与转换", pkg: "UB-Mannheim.TesseractOCR", ver: "5.4.0.20240606", flag: "--version",
    provides: "图片/PDF 文字识别", replaces: "—", note: "Windows 常用再打包；上游 tesseract-ocr；许可证 Apache-2.0", verSrc: "authority" }),
  tool({ id: "typst", bin: "typst", label: "Typst", category: "文档与转换", pkg: "Typst.Typst", ver: "0.15.1", flag: "--version",
    provides: "排版系统（LaTeX 替代，快）", replaces: "LaTeX", note: "上游 typst；许可证 Apache-2.0", verSrc: "authority" }),

  // ── 媒体处理 ──
  tool({ id: "imagemagick", bin: "magick", label: "ImageMagick", category: "媒体处理", pkg: "ImageMagick.ImageMagick", ver: "7.1.2.29", flag: "--version",
    provides: "图像转换与处理", replaces: "—", note: "二进制名是 magick（IM7）；许可证 ImageMagick", verSrc: "authority" }),
  tool({ id: "mkvtoolnix", bin: "mkvmerge", label: "MKVToolNix", category: "媒体处理", pkg: "MoritzBunkus.MKVToolNix", ver: "100.0.0", flag: "--version",
    provides: "Matroska 封装/拆分", replaces: "—", note: "作者 Moritz Bunkus（上游本人）；许可证 GPL-2.0", verSrc: "authority" }),
  tool({ id: "oxipng", bin: "oxipng", label: "oxipng", category: "媒体处理", pkg: "Shssoichiro.Oxipng", ver: "10.1.1", flag: "--version",
    provides: "PNG 无损压缩", replaces: "optipng", note: "上游自维护；许可证 MIT", verSrc: "authority" }),
  tool({ id: "yt-dlp", bin: "yt-dlp", label: "yt-dlp", category: "媒体处理", pkg: "yt-dlp.yt-dlp", ver: "2026.08.19", flag: "--version",
    provides: "网络视频/音频下载", replaces: "youtube-dl", note: "上游自维护；许可证 Unlicense", verSrc: "authority" }),

  // ── 磁盘与系统 ──
  tool({ id: "bottom", bin: "btm", label: "bottom", category: "磁盘与系统", pkg: "Clement.bottom", ver: "0.14.9", flag: "--version",
    provides: "系统监控（跨平台 top）", replaces: "任务管理器 / htop", note: "二进制名是 btm；作者 ClementTsang；许可证 MIT", verSrc: "authority" }),
  tool({ id: "hwinfo", bin: "HWiNFO64", label: "HWiNFO", category: "磁盘与系统", pkg: "REALiX.HWiNFO", ver: "8.50", flag: "--version",
    provides: "硬件信息与传感器读取", replaces: "—", note: "上游 REALiX；许可证 专有软件", verSrc: "authority" }),
  tool({ id: "sysinternals", bin: "handle", label: "Sysinternals Suite", category: "磁盘与系统", pkg: "Microsoft.Sysinternals.Suite", ver: "未取到（套件包）", flag: "-?",
    provides: "Windows 深度诊断（handle/procdump/autoruns…）", replaces: "—", note: "微软官方；套件含数十个工具，此处探针用 handle；许可证 Proprietary", verSrc: "authority" }),

  // ── 版本与包管理 ──
  tool({ id: "chocolatey", bin: "choco", label: "Chocolatey", category: "版本与包管理", pkg: "Chocolatey.Chocolatey", ver: "2.7.4.0", flag: "--version",
    provides: "Windows 包管理器（winget 之外的第二渠道）", replaces: "—", note: "上游 chocolatey；台账多条目在其上有包时可作补充渠道；许可证 Apache v2", verSrc: "authority" }),
  tool({ id: "conan", bin: "conan", label: "Conan", category: "版本与包管理", pkg: "JFrog.Conan", ver: "2.32.0", flag: "--version",
    provides: "C/C++ 包管理", replaces: "vcpkg（另一选择）", note: "JFrog 官方；许可证 MIT", verSrc: "authority" }),
  tool({ id: "miniconda", bin: "conda", label: "Miniconda3", category: "版本与包管理", pkg: "Anaconda.Miniconda3", ver: "未取到（套件包）", flag: "--version",
    provides: "Python/Conda 环境管理", replaces: "—", note: "二进制名是 conda；Anaconda 官方；许可证 专有软件", verSrc: "authority" }),
  tool({ id: "pixi", bin: "pixi", label: "pixi", category: "版本与包管理", pkg: "prefix-dev.pixi", ver: "0.80.0", flag: "--version",
    provides: "跨语言环境与包管理", replaces: "conda（更快）", note: "上游 prefix-dev；许可证 BSD-3-Clause", verSrc: "authority" }),
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
    verSrcKind: "none",
    verSrcVersion: "",
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
    verSrcKind: "none",
    verSrcVersion: "",
    doc: "README「可选外部 CLI（zg / Semble）」",
  },
];

/** 全台账：provider + reference。 */
export const CAPABILITIES: Capability[] = [...PROVIDERS, ...REFERENCE_TOOLS];

/**
 * 渲染用的分类顺序 —— **同时是分类取值域的唯一事实源**（A20）。
 * 值住在**私有的元组**里（`as const`），因为 `core/toolset/exec.ts` 会拿一个 `string`
 * 去 `CATEGORY_ORDER.includes(...)`（渲染时给「未登记进顺序表」的分类兜底）——
 * 把 `as const` 直接挂在导出的 `CATEGORY_ORDER` 上会让那个调用点编译不过，而那条兜底是**必需的**
 * （否则将来新增分类会从渲染顺序里掉队且无处可归）。⇒ 公开面保持 `readonly string[]`，联合类型从元组派生。
 */
const CATEGORY_TUPLE = [
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
] as const;

export const CATEGORY_ORDER: readonly string[] = CATEGORY_TUPLE;

/**
 * 分类的**类型化取值域**（A20）：`Capability.category` 用它 ⇒ 打错一个字（如 `"Shell与终端"`）
 * 在**编译期**就红，而不是让该条目静默掉出 `CATEGORY_ORDER` 的渲染顺序
 * （`findCapabilities` 的匹配面也吃 `category` —— 错值会同时让「按能力反查」失效）。
 * 与 `core/util.ts` 的 `VerSrcKind` 同一形态：「取值域是类型」，映射表只有一份。
 */
export type Category = (typeof CATEGORY_TUPLE)[number];

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
