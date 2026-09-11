# Windows 现代 CLI 工具链

适用于 Windows 11 / PowerShell 7 / AI Coding / DSH Agent 环境。

> **本文件是 `wsl-cli-tools.md` 的 Windows 侧对等收集**（那份是 Linux/WSL 口径）。
> 表内 **winget 包 ID 与版本均在本机 winget 源实测核对**（2026-09-10），不是照抄文档。
> 未实测项一律标「未核实」，不猜。

---

## 0. 为什么 Windows 更需要这份清单（实测）

WSL 那边是「用更好的工具替换已有的」，Windows 这边是「**原本就没有**」。本机实测：

| 命令 | Windows 上的真相 |
|------|------------------|
| `grep` | **不存在** |
| `sed` / `awk` / `uniq` / `xargs` / `which` / `touch` | **全部不存在** |
| `find` | 存在，但是 **DOS 的 `find.exe`**（按行找字符串），与 UNIX `find` **完全不是一个东西** |
| `ls` / `cat` / `sort` | 只是 PowerShell **别名**（`Get-ChildItem` / `Get-Content` / `Sort-Object`），不是可执行文件 |

⇒ **在 Windows 上把脚本从 Linux 搬过来会大面积失败**，根因就在这里。所以「GNU 工具链」在本清单里是**刚需分类**，不是锦上添花。

---

## 1. 包管理器现状

| 渠道 | 本机状态 | 说明 |
|------|----------|------|
| **winget** | ✅ 已装 | **主渠道**，本文件所有 ID 都以它为准 |
| scoop | ❌ 未装 | 便携式工具生态好，可后补 |
| choco | ❌ 未装 | 需管理员 |
| npm（全局） | ✅ 有 | 见 §5 的 `.cmd` 陷阱 |
| uv | ✅ 有（真 `.exe`） | Python 工具首选 |
| cargo | ❌ 未装 | 装 Rust 类工具才需要 |

---

## 2. 工具映射总表

> 列义：**用途** · **工具** · **winget ID** · **版本**（实测当日） · **替代对象**
> 版本号会随时间变化，ID 稳定。

### 2.1 搜索与查找

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| 全文搜索 | `rg` | `BurntSushi.ripgrep.MSVC` | 15.2.0 | `grep -R`（Windows 无） |
| 文件查找 | `fd` | `sharkdp.fd` | 10.5.0 | UNIX `find`（DOS `find.exe` 不是它） |
| AST 结构化搜索 | `ast-grep` / `sg` | `ast-grep.ast-grep` | 0.45.2 | `grep -C` |
| 模糊过滤 | `fzf` | `junegunn.fzf` | 0.74.3 | `find \| grep` |

> `ripgrep` 有两个变体：`BurntSushi.ripgrep.MSVC`（推荐）与 `BurntSushi.ripgrep.GNU`。

### 2.2 文本与数据处理

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| JSON 处理 | `jq` | `jqlang.jq` | 1.8.2 | —（Windows 无） |
| YAML/JSON 处理 | `yq` | `MikeFarah.yq` | 4.53.6 | — |
| 字符串替换 | `sd` | `chmln.sd` | 1.1.0 | `sed`（Windows 无） |
| 文件查看（高亮） | `bat` | `sharkdp.bat` | 0.26.1 | `cat`（别名，非文件） |
| Markdown 渲染 | `glow` | `charmbracelet.glow` | 3.0.0 | 阅读 `.md` |
| 十六进制查看 | `hexyl` | `sharkdp.hexyl` | 0.17.0 | `xxd` / `od` |

### 2.3 目录与文件浏览

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| 目录清单 | `eza` | `eza-community.eza` | 0.23.5 | `ls` / `dir` |
| 终端文件管理器 | `yazi` | `sxyazi.yazi` | 26.9.1 | `mc` / 资源管理器 |

### 2.4 Shell 与终端增强

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| 目录跳转 | `zoxide`（`z`） | `ajeetdsouza.zoxide` | 0.10.0 | `cd` |
| 历史搜索 | `atuin` | `Atuinsh.Atuin` | 18.21.0 | `history \| grep` |
| 提示符 | `starship` | `Starship.Starship` | 1.26.0 | 各 shell 自带提示符 |
| 结构化 Shell | `nu` | `Nushell.Nushell` | 0.114.1 | PowerShell（另一种选择） |
| 目录局部环境 | `direnv` | `direnv.direnv` | 2.37.1 | 手动 `source .env` |
| 终端复用 | `zellij` | `Zellij.Zellij` | 0.45.1 | **tmux**（见下） |
| 终端模拟器 | `wezterm` | `wez.wezterm` | 20240203 | Windows Terminal（自带） |
| 编辑器 | `nvim` | `Neovim.Neovim` | 0.12.5 | notepad / VS Code |
| 精简帮助（社区示例） | `tldr` | `tldr-pages.tlrc` | 1.13.1 | `man` |

> **tmux 在 Windows 上没有官方 winget 包**（实测搜到的 `Helvesec.RMUX` 是第三方重写）。要 tmux 语义请用 `zellij`，或直接在 WSL 里用 tmux。
> `tldr` 用的是 `tlrc` 实现（`tldr-pages.tlrc`，Moniker 即 `tldr`）。

### 2.5 Git 与版本控制

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| diff 美化 | `delta` | `dandavison.delta` | 0.19.2 | `diff` |
| Git TUI | `lazygit` | `JesseDuffield.lazygit` | 0.64.1 | `git log` 手敲 |
| Git TUI（轻量） | `tig` | ❌ **无 winget 包** | — | `git log` |
| GitHub CLI | `gh` | `GitHub.cli` | 2.100.0 | 网页操作 |

> **`tig` 没有 winget 包**（实测搜 `tig` 命中的 `DoD.STIGViewer` 是**完全无关的工具**，勿混装）。走 scoop / choco 或官方 release；只想看历史用 `lazygit`。

### 2.6 磁盘与系统

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| 磁盘分析 | `dust` | `bootandy.dust` | 1.2.5 | `du` |
| 磁盘分析（交互） | `dua` | `Byron.dua-cli` | 2.42.1 | `ncdu` |
| 系统监控 | `btop` | `aristocratos.btop4win` | 1.0.5 | 任务管理器 / `top` |
| 进程查看 | `procs` | `dalance.procs` | 0.14.12 | `ps aux` |

### 2.7 网络与下载

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| HTTP 客户端 | `xh` | `ducaale.xh` | 0.26.2 | `curl` |
| 多线程下载 | `aria2c` | `aria2.aria2` | 1.37.0 | `wget` |
| 图形化 ping | `gping` | `orf.gping` | 1.21.0 | `ping` |
| 媒体处理 | `ffmpeg` | `Gyan.FFmpeg` | 9.0.1 | — |
| 网络配置 / socket 查看 | `ip` / `ss` | ❌ **Linux 专属** | — | `ifconfig` / `netstat` |

> `ip` 与 `ss` 属 Linux 的 **iproute2**，Windows 上不存在对应命令（用 `Get-NetIPAddress` / `netstat`）。它们登记在台账里是为了对齐 WSL 清单，**Windows 上不提供安装方式**。

### 2.8 版本与包管理

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| 版本管理器 | `mise` | `jdx.mise` | 2026.8.5 | nvm / fnm / asdf |
| Python 环境与工具 | `uv` / `uvx` | `astral-sh.uv` | 0.12.12 | pip / pipenv / pipx |

### 2.9 构建与任务编排

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| 任务运行器 | `just` | `Casey.Just` | 1.58.0 | `make` |
| 多进程管理 | `mprocs` | `pvolok.mprocs` | 0.9.6 | `parallel` |
| 基准测试 | `hyperfine` | `sharkdp.hyperfine` | 1.20.0 | `time` |
| 日志分析 | `lnav` | `tstack.lnav` | 0.14.1-rc1 | `tail -f` |
| Docker TUI | `lazydocker` | `JesseDuffield.Lazydocker` | 0.25.2 | `docker ps` |
| 更现代的 watch | `viddy` | ❌ **无 winget 包** | — | `watch` |

> `viddy` 实测 winget 无结果；走 `cargo install viddy` 或官方 release。

### 2.10 归档

| 用途 | 工具 | winget ID | 版本 | 替代对象 |
|------|------|-----------|------|----------|
| 压缩/解压 | `7z` | `7zip.7zip` | 26.03 | `tar` / `unzip`（Windows 无 `unzip`） |

---
true### 2.11–2.21 分类补充（v1.15.14 扩源，ADR-0058）truetrue> 以下 57 项由 `tools/winget-verify-seed.ts` **程序化核验**后写入 —— 对每个**精确包 ID** 调 `winget show`，true> 取权威版本与许可证；核验不过的一律不采纳（本次 57/57 通过）。true> **为什么不按名字自动找包**：实测该做法会产出假阳性 ——true> `xh` 会猜成 `Mozilla.Firefox.xh`（真实 `ducaale.xh`）、`delta` 猜成 `eToro.Delta`（真实 `dandavison.delta`）、true> `choose` 猜成 `AuthenticatorChooser`、`nix` 猜成 `LabChart`。所以**包 ID 必须由人裁决、机器只做核验与取版本**。true> 版本取自核验日（2026-09-11），会随时间变化；**ID 稳定**。
### 2.11 逆向与二进制分析

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| .NET 调试与反编译 | `dnSpy` | `dnSpyEx.dnSpy` | 6.6.0 | — |
| 文件元数据读写（EXIF 等） | `exiftool` | `OliverBetz.ExifTool` | 13.59 | — |
| .NET 反编译（开源） | `ILSpy` | `icsharpcode.ILSpy` | 11.0.0.9375 | — |
| 逆向工程框架（radare2 分支） | `rizin` | `Rizin.Rizin` | 0.9.1 | radare2 |
| 可执行文件压缩/加壳 | `upx` | `UPX.UPX` | 5.2.1 | — |

### 2.12 网络与下载

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| HTTP 客户端 | `curl` | `cURL.cURL` | 8.21.0.6 | — |
| DNS 查询客户端 | `dog` | `ogham.dog` | 0.1.0 | dig / nslookup |
| DNS 查询（现代） | `doggo` | `MrKaran.Doggo` | 1.4.0 | dig |
| 人性化 HTTP 客户端 | `http` | `HTTPie.HTTPie` | 2025.2.0 | curl（可读性更好） |
| 网络带宽测试 | `iperf3` | `ar51an.iPerf3` | 3.21 | — |
| HTTP(S) 抓包与改写 | `mitmdump` | `mitmproxy.mitmproxy` | 12.2.3 | Fiddler / Charles |
| 端口扫描与网络探测 | `nmap` | `Insecure.Nmap` | 7.80 | — |

### 2.13 文本与数据

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| 进程内分析型 SQL（可直接查 CSV/Parquet） | `duckdb` | `DuckDB.cli` | 1.5.5 | sqlite3（分析场景） |
| JSON → 可 grep 的赋值语句 | `gron` | `TomHudson.gron` | 0.7.1 | jq（grep 场景） |
| CSV/TSV/JSON 流式处理 | `mlr` | `Miller.Miller` | 6.20.2 | awk / cut / join |
| CSV 命令行工具集 | `xsv` | `BurntSushi.xsv.MSVC` | 0.13.0 | csvkit |

### 2.14 Git 与版本控制

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| 自动把改动折进正确的提交（fixup） | `git-absorb` | `tummychow.git-absorb` | 0.9.0 | 手动 git rebase -i |
| GitLab 命令行（MR/Issue/CI） | `glab` | `GLab.GLab` | 1.117.0 | 网页操作 |
| VCS（Git 兼容，工作流不同） | `jj` | `jj-vcs.jj` | 0.44.0 | — |

### 2.15 容器与编排

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| 镜像分层分析 | `dive` | `wagoodman.dive` | 0.13.1 | docker history |
| Kubernetes 包管理 | `helm` | `Helm.Helm` | 4.3.0 | — |
| Kubernetes TUI | `k9s` | `Derailed.k9s` | 0.51.0 | kubectl 手敲 |
| 本地 Kubernetes（容器内） | `kind` | `Kubernetes.kind` | 0.33.0 | minikube |
| Kubernetes 命令行 | `kubectl` | `Kubernetes.kubectl` | 1.37.0 | — |
| K8s 清单定制（无模板） | `kustomize` | `Kubernetes.kustomize` | 5.8.1 | helm（轻量场景） |
| 本地单节点 Kubernetes | `minikube` | `Kubernetes.minikube` | 1.39.0 | — |
| 无守护进程容器引擎 | `podman` | `RedHat.Podman` | 5.8.3 | docker |
| K8s 开发内循环 | `skaffold` | `Google.ContainerTools.Skaffold` | 2.24.0 | 手写 CI 脚本 |
| 多 Pod 日志聚合 | `stern` | `stern.stern` | 1.34.0 | kubectl logs -f |

### 2.16 安全与供应链

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| 制品签名与验签 | `cosign` | `Sigstore.Cosign` | 3.1.3 | — |
| Git 历史密钥扫描 | `gitleaks` | `Gitleaks.Gitleaks` | 8.30.1 | 手写正则 |
| SBOM/镜像漏洞扫描 | `grype` | `Anchore.Grype` | 0.118.0 | — |
| K8s 安全基线扫描 | `kubescape` | `kubescape.kubescape` | 4.0.14 | — |
| 加密的配置文件管理 | `sops` | `SecretsOPerationS.SOPS` | 3.13.3 | 明文密钥 |
| SBOM 生成 | `syft` | `Anchore.Syft` | 1.51.0 | — |
| 漏洞/配置/密钥扫描 | `trivy` | `AquaSecurity.Trivy` | 0.74.0 | — |

### 2.17 构建与任务

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| Bazel 版本管理器 | `bazelisk` | `Bazel.Bazelisk` | 1.29.0 | 手动装 bazel |
| 跨平台构建系统 | `cmake` | `Kitware.CMake` | 4.4.3 | 手写 Makefile |
| Go 制品发布自动化 | `goreleaser` | `goreleaser.goreleaser` | 2.17.1 | 手写发布脚本 |
| 负载测试 | `k6` | `GrafanaLabs.k6` | 2.2.0 | ab / jmeter |
| 高速构建后端 | `ninja` | `Ninja-build.Ninja` | 1.13.2 | make（速度） |

### 2.18 文档与转换

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| 文档格式互转（md/docx/pdf…） | `pandoc` | `JohnMacFarlane.Pandoc` | 3.11 | — |
| PDF 文本/图片提取（pdftotext/pdftoppm） | `pdftotext` | `oschwartz10612.Poppler` | 25.07.0-0 | — |
| PDF 结构变换/修复 | `qpdf` | `QPDF.QPDF` | 12.4.1 | — |
| 图片/PDF 文字识别 | `tesseract` | `UB-Mannheim.TesseractOCR` | 5.4.0.20240606 | — |
| 排版系统（LaTeX 替代，快） | `typst` | `Typst.Typst` | 0.15.1 | LaTeX |

### 2.19 媒体处理

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| 图像转换与处理 | `magick` | `ImageMagick.ImageMagick` | 7.1.2.29 | — |
| Matroska 封装/拆分 | `mkvmerge` | `MoritzBunkus.MKVToolNix` | 100.0.0 | — |
| PNG 无损压缩 | `oxipng` | `Shssoichiro.Oxipng` | 10.1.1 | optipng |
| 网络视频/音频下载 | `yt-dlp` | `yt-dlp.yt-dlp` | 2026.08.19 | youtube-dl |

### 2.20 磁盘与系统

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| 系统监控（跨平台 top） | `btm` | `Clement.bottom` | 0.14.9 | 任务管理器 / htop |
| 硬件信息与传感器读取 | `HWiNFO64` | `REALiX.HWiNFO` | 8.50 | — |
| Windows 深度诊断（handle/procdump/autoruns…） | `handle` | `Microsoft.Sysinternals.Suite` | 未取到（套件包） | — |

### 2.21 版本与包管理

| 用途 | 工具 | winget ID | 版本（权威核验） | 替代对象 |
|---|---|---|---|---|
| Windows 包管理器（winget 之外的第二渠道） | `choco` | `Chocolatey.Chocolatey` | 2.7.4.0 | — |
| C/C++ 包管理 | `conan` | `JFrog.Conan` | 2.32.0 | vcpkg（另一选择） |
| Python/Conda 环境管理 | `conda` | `Anaconda.Miniconda3` | 未取到（套件包） | — |
| 跨语言环境与包管理 | `pixi` | `prefix-dev.pixi` | 0.80.0 | conda（更快） |
## 3. GNU 工具链：Windows 上到底装哪个（刚需分类）

因为 §0 那些命令在 Windows 上根本不存在，这一节是**优先级最高**的。三个选项：

| 选项 | winget ID | 版本 | 是什么 | 适合 |
|------|-----------|------|--------|------|
| **Coreutils for Windows**（微软维护） | `Microsoft.Coreutils` | 2026.9.3 | **微软给 Windows 打包的 uutils**，把 **coreutils + findutils + grep** 合成**单个 multi-call 二进制** | **✅ Windows 首选** |
| uutils coreutils（上游原版） | `uutils.coreutils` | 0.10.0 | Rust 重写的 GNU coreutils，跨平台 | 想要上游原版 / 其他平台统一 |
| busybox-w32 | `frippery.busybox-w32` | 1.38.0-FRP | 经典 BusyBox 的 Windows 移植 | 极简单文件、老派做法 |

### 三个选项的事实（已核实）

- **`uutils/coreutils`**：**24,062** ⭐ / **MIT** / Rust / 2013 年建。README 自述「**Cross-platform Rust rewrite of the GNU coreutils**」，目标平台含 Linux、macOS、*BSD、**Windows**、WASI。自述「所有程序都已实现，但**部分选项可能缺失或行为不同**」；差异按 bug 处理。**自 Ubuntu 25.10 起随 Ubuntu 默认发行**。
- **`Microsoft.Coreutils`**：**5,155** ⭐ / **MIT** / 2026-05 新建、**preview 阶段**。README 原文：*"A Microsoft-maintained build of uutils/coreutils, findutils, and grep packaged as a single multi-call binary for Windows."* ⇒ **它不是 uutils 的竞品，而是微软为 Windows 做的打包**。
- **`busybox-w32`**：经典 BusyBox 的 Windows 版本。

### 用 `Microsoft.Coreutils` 必须先知道的 5 件事（README 原文要点）

1. **要求 PowerShell 7.4+**（`~` 支持需 **7.6+**）。本机是 **7.6.6** ⇒ 满足。
2. **与 shell 内建/别名冲突**：`cat` / `cp` / `ls` / `rm` / `mkdir` / `mv` / `pwd` / `echo` / `date` / `sort` / `tee` / `sleep` / `uptime` / `rmdir` 在 PowerShell 里**有别名或内建**，实际跑哪个取决于 PATH 顺序与别名表。
   - 另有 **🛑 未随包发行**：`dir`、`expand`、`kill`、`more`、`timeout`、`whoami`（与 Windows 内建冲突，或因无 POSIX 信号）。
   - 可用 `coreutils-manager disable <utility>` 关掉某个冲突工具。
3. **Windows 平台差异**（原文）：**没有 `/dev/null`，用 `NUL`**；**没有 POSIX 信号**（`SIGHUP`/`SIGPIPE`/`SIGUSR`；`Ctrl+C` 可用）；CRLF 可能导致 `uniq` 把最后一行判成不同；路径分隔符 `/` 与 `\` 都接受但输出可能是 `\`；**权限是 ACL 不是 POSIX 位**（`find -perm` 行为不同）；**创建符号链接需要开发者模式或提权**（读取已有链接不需要）。
4. **有意不移植**：`dd`、`dircolors`、`shred`、`sync`、`uname`，以及全部 POSIX-only 概念（`chmod`/`chown`/`id`/`nice`/`nohup`/`stty`/`tty`/`who` 等）。
5. **PowerShell 解析集成**：安装器通过 `PSReadLine` 让 `echo *.txt` 像 UNIX 那样展开、`echo '*.txt'` 保留字面量；但**转义符仍是反引号 `` ` ``**（不是 `\`），且**不会移除 PowerShell 别名**（`Get-Command ls` 仍显示别名）。

> **注意**：`Microsoft.Coreutils` 明确标注 **in preview**。

---

## 4. 逆向与二进制分析

| 用途 | 工具 | 安装 | 说明 |
|------|------|------|------|
| **Dex/APK → Java 反编译** | **jadx** | `winget install Skylot.jadx` | **50,406** ⭐ / **Apache-2.0** / Java。CLI = `jadx`，GUI = `jadx-gui` |
| 字节码反汇编（JDK 自带） | `javap` | 随 JDK | 本机 JDK **25.0.2** 已装，很多场景 `javap` 就够，**不必装 jadx** |
| 本机 java | `java` | 随 JDK | 本机：`C:\Program Files\Eclipse Adoptium\jdk-25.0.2.10-hotspot` |
| 反汇编/反编译（重型） | Ghidra | ❌ **winget 里没有**（实测搜不到） | 走 [releases](https://github.com/NationalSecurityAgency/ghidra) 或 scoop/choco |
| 十六进制/二进制查看 | `hexyl` | `winget install sharkdp.hexyl` | 见 §2.2 |

### jadx 事实与用法（已核实）

- 作者自述：**"Dex to Java decompiler"**——从 **APK / dex / aar / aab / zip** 产出 Java 源码，附带 `AndroidManifest.xml` 与资源（`resources.arsc`）解码、**内置反混淆**。
- **要求 Java 11+ 64 位**（README 原文；本机 JDK 25 满足）。**源码构建**需 JDK 17+。
- **官方给的安装渠道只有 Arch / macOS(brew) / Flathub，没有 Windows 包管理器那条**；Windows 官方路径是**下 release zip → 解包 → 跑 `bin` 下的 `jadx.bat` / `jadx-gui.bat`**。winget 的 `Skylot.jadx` 是社区/打包渠道（已实测存在，1.5.6）。
- **作者明确警告**：*"in most cases jadx can't decompile all 100% of the code, so errors will occur"* ⇒ 输出有错是**预期内**，不是环境问题。
- 常用形式：

  ```powershell
  jadx -d out classes.dex          # 单 dex
  jadx -d out app.apk              # APK
  jadx --deobf app.apk             # 开反混淆
  jadx --log-level ERROR app.apk   # 降噪
  ```

---

## 5. Windows 特有的坑（全部本机实测，不是抄文档）

### 5.1 `.cmd` / `.bat` **不能**被 `execFile` 直接起 —— 最容易踩

Node 的 `execFile`（许多 agent 工具与脚本用它）在 Windows 上：

| 调用 | 结果 |
|------|------|
| `execFile("zg")` | **ENOENT**（npm 只生成 `zg.cmd`，Node 不解析 `.cmd`） |
| `execFile("zg.cmd")` | **EINVAL** —— Node 自 2024 起**禁止**无 `shell:true` 执行 `.bat/.cmd`（CVE-2024-27980 缓解） |
| `execFile("npm")` | **ENOENT**（同样是 `.cmd`） |
| `execFile("uv")` | ✅ 可用（`uv` 是**真 `.exe`**） |

**解法**：要么用真 `.exe`，要么改走 `node <cli.js>`：
- npm → `node "$(Split-Path (Get-Command node).Source)\node_modules\npm\bin\npm-cli.js" …`
- 其它 npm 全局工具 → 找包内 `dist/cli/index.js` 之类入口，用 `node` 起

### 5.2 `NO_PROXY` 里带方括号的 IPv6 会让 Python `httpx` 崩

本机 ambient `NO_PROXY` 结尾是 `[::1]`，会让 `httpx` 构造 Client 时抛
`InvalidURL: Invalid port: ':1]'`（**模型已缓存也照崩**，且与是否有网无关）。

- 影响面：**任何走 httpx 的 Python 工具**（含 `huggingface_hub`），不只某一个 CLI。
- 解法：剔掉**带方括号**的条目（保留不带括号的 `::1`），或给该子进程显式注入干净的 `NO_PROXY`。

### 5.3 GitHub 的可用路径**会在直连与代理之间漂移**

实测两次相反的情形：

| 时间 | 直连 `github.com:443` | 代理 `127.0.0.1:9910` |
|------|----------------------|------------------------|
| 较早 | ✅ 通 | ❌ 重置大 POST（`git push` 失败，`gh api` 正常） |
| 较晚 | ❌ 不通 | ✅ 通（`git ls-remote` / `push` 都成功） |

**结论：别固定一种**。推送失败时先分别测两条路径再选：

```powershell
Test-NetConnection github.com -Port 443 -InformationLevel Quiet
Test-NetConnection 127.0.0.1 -Port 9910 -InformationLevel Quiet
```

代理可用时：`git -c http.proxy=http://127.0.0.1:9910 -c https.proxy=http://127.0.0.1:9910 -c http.version=HTTP/1.1 push`

### 5.4 CRLF 与 `NUL`

- 文本文件多为 **CRLF**，字节级工具可能看到 `\r`（如 `uniq` 可能把末行判成不同）。
- **没有 `/dev/null`** → 用 **`NUL`**：`find . -name "*.log" > NUL`。
- Git 侧建议 `core.autocrlf=true`（本机已是）。注意它会让工作区文件显示为「已修改」而 `git diff` 为空——那是行尾归一化，不是内容变化。

### 5.5 符号链接要开发者模式

读取已有符号链接无需提权；**创建**新的需要**开发者模式**或提权终端。本机此项**未启用**（实测注册表值为空）。

### 5.6 PowerShell 别名的错觉

`Get-Command ls` 在 PowerShell 里显示的是**别名**，不是可执行文件。装了 coreutils 后，实际跑哪个取决于**别名表与 PATH 顺序**——`Set-Alias` 只能覆盖交互；脚本里请用**完整路径**或显式调用。

---

## 6. 本机现状（2026-09-10 实测）

| 项 | 值 |
|----|-----|
| PowerShell | **7.6.6**（Core 版，`C:\Program Files\PowerShell\7\pwsh.exe`） |
| Node | v26.7.0；npm 全局前缀 `C:\nvm4w\nodejs` |
| Java | **OpenJDK 25.0.2**（Adoptium） |
| uv / uvx | 已装（真 `.exe`） |
| winget | 已装 |
| scoop / choco / cargo | **未装** |
| 已装的本清单工具 | `semble`(uv)、`zg`(@zvec/zvec-grep, npm) —— 见 dsh-shadow 的 `mode:"toolset"` 台账 |

---

## 7. 批量安装（按需取用，不要一次全装）

```powershell
# —— 优先级最高：GNU 工具链（Windows 原本没有 grep/find/sed/awk…）——
winget install Microsoft.Coreutils          # 微软打包的 uutils（coreutils+findutils+grep 三合一）
# 或上游原版：winget install uutils.coreutils

# —— 搜索三件套 ——
winget install BurntSushi.ripgrep.MSVC sharkdp.fd ast-grep.ast-grep junegunn.fzf

# —— 文本处理 ——
winget install jqlang.jq MikeFarah.yq chmln.sd sharkdp.bat charmbracelet.glow

# —— Git 增强 ——
winget install dandavison.delta JesseDuffield.lazygit GitHub.cli

# —— 逆向（jadx 需 Java 11+，本机 JDK 25 满足）——
winget install Skylot.jadx
winget install 7zip.7zip

# —— 版本与包管理 ——
winget install jdx.mise astral-sh.uv

# —— 系统/网络（挑需要的）——
winget install eza-community.eza bootandy.dust aristocratos.btop4win dalance.procs
winget install ducaale.xh orf.gping Gyan.FFmpeg
```

装完**新开一个终端**让 PATH 生效；`Microsoft.Coreutils` 冲突工具可用 `coreutils-manager disable <utility>` 关掉。

---

## 8. 镜像与代理（本机口径）

| 用途 | 配置 |
|------|------|
| 通用代理 | `HTTP_PROXY` / `HTTPS_PROXY` = `http://127.0.0.1:9910`（本机） |
| **`NO_PROXY` 注意** | **不要**放带方括号的 IPv6（如 `[::1]`）——见 §5.2 |
| npm | `npm config set registry https://registry.npmmirror.com` |
| pip | `pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple` |
| HuggingFace | `HF_ENDPOINT=https://hf-mirror.com` |
| Node 版本镜像 | `FNM_NODE_DIST_MIRROR=https://npmmirror.com/mirrors/node` |
| Rust | `RUSTUP_DIST_SERVER` / `sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/` |

---

## 9. 未核实项（明确标注，不冒充结论）

| 项 | 状态 |
|----|------|
| Ghidra 的 winget 包 | **不存在**（实测搜不到）；未验证 scoop/choco 是否有 |
| `Microsoft.Coreutils` 的实际安装行为与冲突表现 | **未安装实测**（只核对了 winget 元数据与 README）；其 **preview** 状态未评估稳定性 |
| `scoop` / `choco` 渠道的对应包 ID | **未核实**（本机未装这两个管理器） |
| tmux 原生 Windows 方案 | winget 无官方包；第三方重写未评估 |
| `viddy` | winget **无结果**（实测） |
| `dive`（容器镜像分析） | winget 搜到的 `OpenAgentPlatform.Dive` **不是**该工具，勿混装 |
| 各工具版本号 | 为 **2026-09-10 实测快照**，会随时间变化 |
