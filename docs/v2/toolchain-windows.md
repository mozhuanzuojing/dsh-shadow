# Windows 工具链（v2 活台账）

> **v2 现行版**，取代已冻结的 `docs/v1/toolchain-windows.md`（2026-09 基线快照，只读保留）。
> v1 那份含**完整 57+ 项 winget 工具目录**（`§2.1–§2.21`，包 ID 稳定、版本会变）与历史坑；本文件只维护
> **本机现状 / 已装清单 / 变更历史**，不复制 v1 的整张目录（避免两处数字各自漂移）。
> 口径：能实测的不抄文档；未核实一律标「未核实」。

---

## 1. 本机现状（2026-11-21 实测）

| 工具 | 版本 | 位置 / 状态 |
|---|---|---|
| PowerShell | 7.7.0 | `C:\Program Files\PowerShell\7\pwsh.exe`（**Store 版已卸载**） |
| winget | 1.29.380 | `...\WindowsApps\winget.exe`（别名已恢复） |
| Windows Terminal（`wt`） | 1.25.3131 | `...\WindowsApps\wt.exe`（别名已恢复） |
| WSL | 3.0.5.0 | `Microsoft.WSL` |
| Coreutils for Windows | 2026.9.3 | `C:\Program Files\coreutils`（`bin\` 79 工具，已在 Machine+User PATH） |
| curl（内置） | 8.22.0 | `C:\Windows\System32\curl.exe` |
| tar（内置） | bsdtar 3.8.9 | `C:\Windows\System32\tar.exe` |
| Edit（内置 CLI 编辑器） | 1.2.1 | `C:\Windows\System32\edit.exe` |
| sudo（Sudo for Windows） | 内置 | `C:\Windows\System32\sudo.exe`（已启用，**内联模式**，`HKLM\...\Sudo\Enabled=3`） |
| scoop | v0.6.0 | `C:\Users\l\scoop`（`scoop.ps1` 被执行策略拦，需 `-ExecutionPolicy Bypass` 运行） |
| PowerToys | 未安装 | 需要时：`winget install --id Microsoft.PowerToys -e` |

---

## 2. 本次变更（2026-11-21）

### 2.1 计划任务（旧自启清理）
- 删除：`LocalWorkbench-Ensure`、`JiraProvider`、`OpsProvider`、`OpsProviderRecapture`、`ShihRecorder`、`ShihBreathAccountability`（后三个 local-workbench provider 均已坏 `0x80070002`）。
- 各 provider 的 `install-autostart.ps1` / `install-recapture-task.ps1` 加**弃用守卫**（默认不注册，`-Unregister` 仍可注销）。
- `wslc1-core-autostart` **修好并保留**：`Resolve-PwshPath` 增加“扫描 `Program Files\WindowsApps` 真实 x64 包取最高版本”兜底，重注册后指向稳定 pwsh；试跑 `LastResult=0x0` 且 redis/gitea/mssql/nginx 全部启动。

### 2.2 PowerShell
- 卸载 Store 版 `Microsoft.PowerShell 7.7.0.0`（卸载前先停占用它的 `jira-provider` 进程树）。
- 官方 ZIP `PowerShell-7.7.0-win-x64.zip` 解压安装到 **`C:\Program Files\PowerShell\7`**，加入**系统 PATH**。
- **官方最新即 7.7.0**（无 MSI 资产，仅 ZIP），与 Store 版同版本。

### 2.3 别名恢复
- 重注册 `Microsoft.DesktopAppInstaller` → 恢复 `winget.exe`。
- 重注册 `Microsoft.WindowsTerminal` → 恢复 `wt.exe`。

### 2.4 Coreutils / sudo
- `Microsoft.Coreutils` 升级到 **2026.9.3**（`bin\` 79 工具已在 PATH）。
- `sudo config --enable normal` 启用 Sudo（内联模式）。

---

## 3. 关键坑（本次新增/复核）

1. **用户级 App Execution Alias 会被整体清空**：`%LOCALAPPDATA%\Microsoft\WindowsApps` 曾只剩 2 个无关条目，`pwsh/winget/wt` 全缺 → 凡把 exe 路径写死成 `...\WindowsApps\<name>.exe` 的计划任务**静默失败（0x80070002）**。恢复方式：**重注册对应 Store 包**重建官方 AppExecLink。
2. **ZIP 版 `pwsh.exe` 不能靠符号链接启动**：它会在“启动路径所在目录”找 `pwsh.dll`，经符号链接会去 WindowsApps 找而失败。→ 走 PATH 解析到真实目录，不要用 WindowsApps 符号链接代理 ZIP 版。
3. **wslc 的 `ps` 按会话隔离**：普通 shell 里 `wslc ps` 可能显示为空，但只要端口（redis 6379 / mssql 1433 / gitea 3321+2222 / nginx 8880）在监听就说明容器在跑。
4. **Coreutils 与 PowerShell 别名冲突**：`ls/cat/cp/date/...` 在 PowerShell 里是别名；用 GNU 版写 `*.exe`，或 `coreutils-manager disable <utility>`。
5. **无 `/dev/null`，用 `NUL`；无 POSIX 信号**（`Ctrl+C` 可用）；路径分隔符 `/` `\` 均接受。
6. **`.cmd/.bat` 不能被 `execFile` 直接起**（Node `ENOENT`/`EINVAL`）——见 v1 基线 §5.1。
7. **`NO_PROXY` 别放带方括号的 IPv6**（如 `[::1]`），会让 Python `httpx` 崩 —— 见 v1 基线 §5.2。
8. **GitHub 直连/代理会漂移**：失败时先分别测 `github.com:443` 与 `127.0.0.1:9910` 再选。

---

## 4. 完整工具目录（去哪查）

完整 winget 工具映射表（用途 / ID / 版本 / 替代对象，含搜索、文本、Git、容器、安全、文档、媒体等 21 类）见**冻结基线** `docs/v1/toolchain-windows.md` 的 `§2.1–§2.21`——**包 ID 稳定**、版本号以当时核验为准。本文件不复制，避免两处漂移。

---

## 5. 未核实项

| 项 | 状态 |
|---|---|
| PowerToys 实际体验 | 未装、未评估 |
| Coreutils 与具体工具链的冲突组合 | 仅抽测 `ls/cat/date` |
| 各工具版本号 | 为 2026-11-21 快照，会随时间变化 |
