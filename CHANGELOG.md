# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.32] `T17-C` 补上**跨平台**那半（Linux 读数）+ 默认值的**理由换成具体缺口**

**产品代码零改动；证据面 + 台账面。** 上一版（`v1.21.30`）把「跨平台锁未测」列为不改默认的理由之一 ——
本版把那半**测了**，于是**理由必须重写**：不再是「没测」，而是**测出了一个具体缺口**。

### 1. 怎么跑起来的（先记障碍，免得下次重试）

- 按指示先走 `wslc`（WSL 容器）路线：**拉不到任何镜像** ——
  `Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded)`；
  换国内镜像 `docker.m.daocloud.io` / `docker.1ms.run` 两次都在 2 分钟以上**零输出**（挂住）。
- 查过两条「本该能配代理」的路，**都不通**：`wslc` 的设置文件（`%LOCALAPPDATA%\wslc\settings.yaml`）**只有 session（CPU/内存/磁盘/绑定地址）与凭据存储**，
  **没有 registry/代理项**；给 `wslc pull` 进程设 `HTTPS_PROXY=127.0.0.1:9910` 也**无效**（拉取请求由**容器引擎**发出，不是 CLI 进程）。
- ⇒ 改用**同一台机的 WSL2 发行版**：`debian-u8-1`（Debian 13 trixie · 内核 `6.18.40.1-microsoft-standard-WSL2`），
  经宿主代理（WSL 网关 `172.30.176.1:9910`；实测 `curl` / `python urllib` 都是 **200**）下载**官方 Linux 版 node 26.8.2**，
  再把 `dist/` 与探针拷到 ext4 的 `/tmp` 跑（不直接跑 `/mnt/d`，避开 9p 干扰）。`node:sqlite` 可用：`DatabaseSync = function`。
- **可重放脚本**（仓外证据，按约定落 `../.docs/fix/2026-09-25/`）：
  `t17c-env.sh`（环境 + 代理连通性）· `t17c-setup.sh`（下载 Linux node + 拷 `dist/`/探针）· `t17c-run.sh <N>`（跑探针）。

### 2. 三个数字：Windows vs Linux（合成语料 8800 条）

| 场景 | Windows | **Linux（WSL2 Debian 13 · node 26.8.2）** |
|---|---|---|
| cold rebuild（8800 `.md` → SQLite） | 512.6 ms | **251.8 ms** |
| startup（索引已存在） | **68.9 ms** | 86.2 ms |
| incremental（+1 新、原地改 1） | 302.5 ms | **136.4 ms** |

索引体积两侧一致（**6884 KB**）。⇒ 冷建**不到一秒**、启动**几十毫秒**，两侧都在可接受量级内（Linux 冷建/增量更快、启动略慢）。

### 3. 二进程并发：**四次运行，结论不同，都照记**

| 运行 | Windows reader | Windows writer | Linux reader | Linux writer |
|---|---|---|---|---|
| 合成 **300** 条 | 12/12 `ok` | **`query-error`** | **`query-error`** | **`query-error`** |
| 合成 **8800** 条 | 12/12 `ok` | 12/12 `ok` | 12/12 `ok` | 12/12 `ok` |

⇒ ① 撞锁**会发生且时序相关**（同代码两次运行可能一次撞一次不撞）；小语料更易撞、大语料稳态不撞；
② **跨平台确实不同**（300 条那次 Linux 两个进程都撞、Windows 只有 writer 撞）；
③ 撞锁一律表达成 `query-error`（本次回退 fs + **可见**），**不崩、不静默空集**（`error ≠ empty` 成立）；
④ **不能靠单次运行断言**。

### 4. 决策：**默认仍是 `fs`** —— 但**理由换了**

- 9 项矩阵的证据落点已齐，第 8/9 项跨平台也测了 ⇒ **不再是「没测」**。
- 挡住的是并发那半边测出的**具体缺口**：**撞锁会发生，而当前实现没有重试/退避**（撞上就回退本次，那一轮走 fs 全量扫 + 读侧挂一条降级横幅）。
  在「默认开」的位置上这是**偶发一次性降级 + 横幅** —— 属产品取舍，**不是**「已验证通过」。
- ⇒ **改默认的前置条件现在是可执行的**：① 给 `query-error` 做**有界重试 + 退避**（并保持「重试仍失败才回退」的可见性）；
  ② 用真实流量 `query-log` 样本压一遍。其余未核实项不变（真实流量漏召回 / 外部进程原地改频率 / 非本地后端 `processPath`）。

### 5. 验证

- `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` → **exit 0**（`run-tests` **70/70**；本版无产品代码改动）。
- 探针两侧各跑通：Windows `node tools/derived-index-bench.ts --atoms 8800` exit 0；Linux `t17c-run.sh 8800` exit 0（四步全成立、含并发）。
- `npm run audit:docs` / `audit:complexity` / `audit:ratchet` 全过（无新增桶）。

### 6. 诚实标注（不缩小）

- **跨平台那条用的是 WSL2 发行版，不是容器**（原因见 §1）⇒ 适用范围写「**Linux（WSL2 内核）**」，
  **不要**读成「容器里也验过了」；容器/overlayfs 下的锁与 WAL 仍未测。
- 三个数字仍是**单次运行**、合成语料**分布均匀** ⇒ 只当**量级**。
- `query-error` 的**分布**（哪几轮、多少次）只打印、未做成断言 ⇒ 读者不能据此估频率。
- 矩阵第 4 项「表缺失」分支仍未单独断言。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T17-C` 的**默认值前置条件 ①**（`query-error` 有界重试 + 退避）→ `T26`/`T27`（选型后写码）。
- **仍等你**：`T26`/`T27` 的选型 · `D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）。
