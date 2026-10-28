# WSL 现代 CLI 工具链

适用于 Debian / WSL2 / AI Coding / Claude Code Agent 环境。

> **行为指令**（`rg`/`fd`/`jq` 替代 `grep`/`find`/`ps` 等）已内联到项目 `CLAUDE.md` §5。
> 以下为完整工具映射表和环境参考。

---

## 工具映射总表

| 用途 | 现代工具 | 包名 | 原始方式 |
|------|---------|------|---------|
| 全文搜索 | `rg` | ripgrep | `grep -R` |
| 文件查找 | `fd` / `fdfind` | fd-find | `find .` |
| AST 代码搜索 | `ast-grep` / `sg` | ast-grep | `grep -C` |
| 目录清单 | `eza --icons` | eza | `ls` |
| 文件查看 | `bat` / `batcat` | bat | `cat` |
| 磁盘分析 | `dust` / `dua` | du-dust | `du` / `ncdu` |
| 系统监控 | `btop` | btop | `top` / `htop` |
| 进程查看 | `procs` | procs | `ps aux` |
| diff 美化 | `delta` | git-delta | `diff` |
| 目录跳转 | `z` | zoxide | `cd` |
| 历史搜索 | `atuin` | atuin | `history \| grep` |
| 字符串替换 | `sd` | sd | `sed` |
| 编辑器 | `nvim` | neovim | `vim` |
| 终端复用 | `tmux` | tmux | `screen` |
| HTTP 客户端 | `xh` | xh | `curl` |
| 多线程下载 | `aria2c` | aria2 | `wget` |
| JSON 处理 | `jq` | jq | — |
| 模糊过滤 | `fzf` | fzf | `find \| grep` |
| 文件分页 | `bat` / `batcat` | bat | `less` / `more` |
| 网络配置 | `ip` | iproute2 | `ifconfig` |
| Socket 查看 | `ss` | iproute2 | `netstat` |
| 图形化 ping | `gping` * | gping | `ping` |
| 精简帮助 | `tldr` | tldr | `man` |
| Markdown 渲染 | `glow` | glow | 阅读 .md 文件 |
| 日志分析 | `lnav` | lnav | `tail -f` |
| Docker TUI | `lazydocker` | lazydocker | `docker ps` |
| Git TUI | `tig` | tig | `git log` |
| 任务运行器 | `just` | just | `make` |
| 多进程管理 | `mprocs` | mprocs | `parallel` |
| 版本管理器 | `mise` | mise-en-place | `nvm` / `fnm` / `asdf` |
| Python 包管理 | `uv` | uv | `pip` / `pipenv` |
| 目录环境变量 | `direnv` | direnv | `source .env` |
| 基准测试 | `hyperfine` * | hyperfine | `time` |
| 更现代 watch | `viddy` | viddy | `watch` |

> `*` 补充角色，不能完全替代原始命令。

## WSL/Debian 包名兼容

```bash
# Debian 包名与命令名不一致的别名（放入 ~/.zshrc）
alias fd='fdfind'      # fd-find → fdfind
alias bat='batcat'     # bat → batcat
```

## 常用对照

```bash
# 搜索: grep → rg
rg "TODO" .

# 查找: find → fd
fdfind ".ts"

# 查看: cat → bat
batcat app.ts

# 替换: sed → sd
sd "foo" "bar" test.txt

# HTTP: curl → xh
xh https://api.example.com

# 跳转: cd → zoxide
z api

# 任务: make → just
just build

# Node/Python: nvm/asdf → mise
mise install node@lts && mise use -g node@lts
```

## WSL 环境信息

- **OS**: Debian trixie (WSL2)
- **Shell**: zsh + Oh My Zsh + Powerlevel10k

### WSL 代理配置

```bash
# 默认注释，按需开启。WSL 网关 IP 动态获取
GATEWAY=$(cat /etc/resolv.conf | grep nameserver | head -1 | awk '{print $2}')
# export HTTP_PROXY="http://${GATEWAY}:9910"
# export HTTPS_PROXY="http://${GATEWAY}:9910"
# export ALL_PROXY="socks5://${GATEWAY}:9909"
```

### 国内镜像

| 服务 | 镜像 | 用途 |
|------|------|------|
| apt | `mirrors.tuna.tsinghua.edu.cn/debian` | 系统包 |
| Rust (rustup) | `RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup` | Rust 安装 |
| Rust (cargo) | `sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/` | cargo install |
| Node.js | `FNM_NODE_DIST_MIRROR=https://npmmirror.com/mirrors/node` | mise 安装 node |
| npm | `https://registry.npmmirror.com` | npm install |
| pip | `https://pypi.tuna.tsinghua.edu.cn/simple` | pip install |
| HuggingFace | `HF_ENDPOINT=https://hf-mirror.com` | 模型下载 |

### WSL .zshrc 加载链

```
zsh (WSL)
 → Oh My Zsh（plugins + theme）
 → fzf / zoxide / direnv（交互增强）
 → mise activate（Node/Python/Ruby 版本管理，必须在 OMZ 之前）
 → atuin init（历史搜索）
 → p10k instant prompt（Powerlevel10k）
 → proxy env（默认注释，按需开启）
```
