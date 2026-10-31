# 并行隔离大规模测试：竞品调研与 dsh-shadow 可借鉴方案

> 日期：2026-10-31 · 状态：**调研，未改测试运行器** · 范围：测试执行的并行调度、隔离边界、分片与失败治理
> 证据分级：官方文档/GitHub API = 事实；竞品模式归纳 = 判断；对本仓库的建议 = 待验证方案。

## 0. 结论（TL;DR）

1. **主流做法不是“把测试丢进线程池”，而是先确定隔离边界**：Playwright/Vitest 以**测试文件**为并行单位（worker 进程/线程池），pytest-xdist 用 `--dist loadfile` 保证同文件同 worker，nextest 更激进到**每个测试一个进程**。隔离粒度越细，越不容易互相污染，但启动成本越高。
2. **大规模的关键是调度，不是并发数**：分片（`--shard` / `--partition`）、按历史耗时均衡、重测试分组/限流（nextest `test-groups` + `threads-required`）、失败上限（Playwright `maxFailures`）比单纯开 32 个 worker 更有效。
3. **dsh-shadow 当前隔离底子不差，缺的是并行调度**：`tools/test.ts` 已经“每个测试文件一个 node 子进程”，天然有进程级隔离；但它是 `spawnSync` 串行，没有并发、分片、超时、耗时记录。55 个文件串行 **9.49s**；我用一次性 8 路并发探针跑同一套，**55/55 通过，1.21s**（非提交代码，仅验证隔离可行性）。
4. **最值得借鉴的三件事**：① 保留“文件级子进程”，改成异步 worker pool；② 加 `--shard i/n` + 耗时记录，CI 用矩阵分片；③ 给重测试（embedding/migrate/e2e）加“重测试组”信号量，避免 8 路并发把 CPU/缓存打满。
5. **不建议照搬**：为 55 个 Node 测试引入 Vitest 迁移、Bazel 远程执行、Testcontainers/Docker——隔离收益小于维护成本；当前没有外部数据库/浏览器依赖。

## 1. 问题边界

“并行隔离大规模测试”包含四个互相独立的维度，不能混为一谈：

| 维度 | 问题 | 典型手段 |
|---|---|---|
| **执行隔离** | 测试之间是否共享进程内存、模块缓存、全局变量 | worker 进程/线程、process-per-test、容器 |
| **资源隔离** | 临时目录、SQLite、端口、模型缓存、外部服务是否互斥 | per-worker temp root、独立 DB/schema、端口 0、资源租约 |
| **调度规模** | 多核/多机如何均衡，慢测试如何不拖尾 | 文件级并行、work-stealing、按耗时装箱、分片 |
| **失败治理** | 失败是否可见、是否互相拖垮、是否能复现 | 超时、fail-fast/max-failures、重试、JUnit/耗时报告 |

竞品通常把“隔离”放在 runner 层，“调度”放在 CI 层；我们讨论时也要分开，否则会得出“上容器就并行了”这类错误结论。

## 2. 竞品与 GitHub 项目矩阵

GitHub star 数为 2026-10-31 通过 GitHub API 读取的快照，仅用于判断项目活跃度，不代表质量。

| 项目 | 并行单位 / 隔离 | 调度与分片 | 最值得借鉴 | 来源 |
|---|---|---|---|---|
| **Vitest**（17.3k★） | 文件级 worker 池；默认隔离测试文件；支持 threads/forks 等 pool | `--shard`；CI 分片后 `--merge-reports`；高 CPU 时主线程 Vite server 会成为瓶颈，官方建议 sharding | 文件级隔离、分片+报告合并、主进程瓶颈意识 | [Parallelism](https://vitest.dev/guide/parallelism.html)、[Improving Performance](https://vitest.dev/guide/improving-performance) |
| **Playwright**（98.9k★） | **worker 进程**；默认测试文件并行，同文件内测试串行；`fullyParallel` 可细到测试 | `--workers`、`--shard`、`--max-failures` | 默认文件级并行；同文件保序；失败上限 | [Parallelism](https://playwright.dev/docs/test-parallel)、[Sharding](https://playwright.dev/docs/test-sharding) |
| **pytest-xdist**（1.9k★） | 多进程；`--dist loadfile` 保证同文件同 worker；`loadscope/loadgroup` 保 fixture 组 | `-n auto`（物理核）、`--maxprocesses`、`worksteal` 动态偷任务 | **loadfile** 与我们“文件级子进程”完全同构；worksteal 适合耗时差异大的套件 | [Distribution](https://pytest-xdist.readthedocs.io/en/stable/distribution.html) |
| **cargo-nextest**（3.4k★） | **process-per-test**；强调线程隔离会共享进程状态，进程隔离更接近“生产故障边界” | `test-groups` 互斥/限流；`threads-required` 重测试占多线程；`--partition slice/hash` 做 CI 分片 | 重测试资源配额；进程级隔离；分片算法 | [Why process-per-test](https://nexte.st/docs/design/why-process-per-test/)、[Test groups](https://nexte.st/docs/configuration/test-groups/)、[Partitioning](https://nexte.st/docs/ci-features/partitioning/) |
| **Bazel**（26.0k★） | 沙箱/隔离环境；强调 **isolation + source identity**（输入哈希） | 动作图并行；缓存命中即跳过；远程执行 | 输入哈希/可缓存思维；不必照搬沙箱 | [Hermeticity](https://bazel.build/basics/hermeticity) |
| **Turborepo**（31.3k★） | 任务级并行；假设任务确定性 | 输入/输出 fingerprint 缓存，本地+远程缓存 | “确定性输入→缓存”模型；测试先不做结果缓存 | [Caching](https://turborepo.dev/docs/crafting-your-repository/caching) |
| **Testcontainers**（2.6k★ Node） | 每个测试/套件启动一次性容器（数据库、浏览器等） | 容器生命周期由库管理 | 外部服务隔离；我们当前无外部 DB，收益低 | [Node Testcontainers](https://node.testcontainers.org/) |
| **Jest**（45.5k★） | worker 进程池；`--runInBand` 串行排障 | `--shard`、`--findRelatedTests`（变更影响分析） | 变更影响分析；串行排障开关 | [Jest CLI](https://jestjs.io/docs/cli) |
| **GitHub Actions Matrix** | 每个 matrix job 独立 runner/文件系统 | 矩阵并行 + 分片索引 | CI 多机分片；与本地 runner 的 `--shard` 对齐 | [Job variations](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations) |

## 3. 七个可复用模式

### 3.1 进程隔离优先于线程隔离

nextest 的论证很直接：线程共享地址空间、全局变量、panic/abort 影响整个进程；进程边界更接近真实故障边界。Playwright 用 worker 进程，pytest-xdist 用多进程，我们的 `tools/test.ts` 也已经是“一文件一子进程”。

**判断**：不要为了省启动开销改成 `worker_threads` 共享模块缓存；Node 测试里模块级单例、`process.env`、SQLite 句柄都可能跨文件污染。保留子进程，优化调度即可。

### 3.2 文件级并行是性价比最高的粒度

Playwright 默认文件级并行、文件内串行；pytest-xdist `loadfile` 也是同一思路。理由：

- 文件内测试往往共享 fixture/临时目录，强行并行会引入新的竞态；
- 文件间天然是作者划定的隔离单元；
- 失败定位仍然清晰（一个文件一个退出码）。

**对我们的直接映射**：55 个 `*.test.ts`，一个文件一个 node 子进程；只需把“串行 for 循环”换成“并发池”，不需要重写测试。

### 3.3 分片要稳定，均衡要看历史耗时

- Playwright/Vitest/nextest 都提供按索引分片（`--shard=2/3` / `--partition slice:2/3`）；
- nextest 还提供 **hashed sharding**，避免文件增删导致分片整体漂移；
- pytest-xdist 的 `worksteal` 解决“长测试拖尾”：谁先空谁偷任务；
- Vitest 官方特别提醒：高 CPU 机器上主线程（Vite server）可能成为瓶颈，分片到多台机器比单机堆线程更有效。

**对我们的建议**：本地用“贪心取下一个文件”的 worker pool（天然 work-stealing）；CI 用稳定 hash 分片，避免每次分片结果跳变；耗时记录用于下一轮装箱。

### 3.4 重测试需要“资源配额”，不是简单并发

nextest 的 `test-groups` 支持互斥与限流，`threads-required` 让重测试占多个线程配额。这解决的是：

- 8 路并发里混入一个 600ms 的 embedding/E2E，CPU/IO 被它拖慢；
- 多个测试同时下载模型、同时启动 CLI 子进程、同时写大文件。

**对我们的建议**：给 `embedding.test.ts`（当前 582ms）、`e2e/migrate`（585ms）、`e2e/plugin`（464ms）打“heavy”标记；并发池里 heavy 组最多 1–2 个同时跑，其余轻测试照常并发。不要用固定 sleep 解决，使用信号量/队列。

### 3.5 隔离要覆盖“文件系统、数据库、端口、缓存、时钟”

Testcontainers 解决外部服务；pytest fixture 解决 DB/临时目录；Playwright 用独立 browser context。对 Node 项目，最小清单是：

- **临时目录**：每个 worker 独立 `TMP`/`TEMP`，测试用 `mkdtemp`；
- **数据库**：每个测试/文件独立 SQLite 文件或事务回滚；
- **端口**：若起本地 server，用 `port: 0` 让 OS 分配，禁止硬编码；
- **模型/下载缓存**：独立 `HF_HOME`/缓存目录，或对下载测试加全局锁；
- **时钟/随机**：注入 clock/seed，禁止依赖真实时间（我们已有 `fixedClock`）。

### 3.6 失败治理：超时、失败上限、可见输出

Playwright 的 `maxFailures` 在达到失败数后停止并跳过剩余测试，避免坏套件烧资源；Vitest/nextest 都有重试与慢测试报告。并行后最容易退化的就是**输出可读性**：`stdio: "inherit"` 会让多个子进程输出交错。

**对我们的建议**：每个子进程 `stdout/stderr` 缓冲，完成时整体打印并加文件前缀；失败时保留尾部 N 行；加 per-file timeout；默认收集全部失败，`--fail-fast` 可选。

### 3.7 变更影响分析与缓存：先做“构建缓存”，不要做“测试结果缓存”

Jest `--findRelatedTests`、Bazel/Turborepo 的输入哈希都指向“只跑受影响的测试/任务”。但测试结果缓存的前提是**完全确定性**；我们的测试包含时间、随机、真实文件系统，直接缓存结果容易把 flake 掩盖。

**判断**：先缓存 `dist` 构建产物（内容哈希），测试结果只记录耗时，不做命中跳过；变更影响分析可作为 P2，且只作为“建议运行集”，不能替代 CI 全量。

## 4. dsh-shadow 当前基线（实测）

### 4.1 运行器事实

`tools/test.ts`：

- 递归收集 `test/**/*.test.ts`，按路径排序；
- `for` 循环 + `spawnSync(process.execPath, [file], { stdio: "inherit" })`；
- 失败非零退出；无并发、无分片、无超时、无耗时文件、无输出缓冲。

### 4.2 隔离现状

- `test/helpers.ts` 的 `WS = "/ws"` 配 `MemoryFs`，文件系统在内存里，进程内隔离；
- 真实文件系统测试（`e2e/derived`、`migrate`、`plugin`、`toolset*`）使用 `mkdtempSync` 独立临时目录；
- 未发现测试硬编码端口或写生产 `.shadow` 的路径；`dist` 只读；
- 尚未对“模型下载缓存/全局缓存”做显式隔离（本次 grep 未发现，但不能证明不存在）。

### 4.3 实测数据

| 模式 | 文件数 | 结果 | 总耗时 | 备注 |
|---|---:|---|---:|---|
| 当前串行 `node tools/test.ts` | 55 | 55/55 | **9,490ms** | 文件耗时合计 9,474ms；p50 146ms、max 585ms |
| 一次性 8 路并发探针 | 55 | 55/55 | **1,209ms** | 每文件一个子进程，`stdout/stderr` 捕获；非仓库代码，单次运行 |

> 探针结论只证明“当前 55 个文件在 8 路文件级并发下没有暴露共享状态冲突”，不等于所有未来测试都安全；重测试/缓存类仍需显式配额。

慢文件：`e2e/migrate` 585ms、`unit/embedding` 582ms、`e2e/plugin` 464ms、`unit/search-code-tool` 285ms、`e2e/toolset-config` 279ms。

## 5. 差异：我们 vs 竞品

| 能力 | 竞品 | 我们当前 | 影响 |
|---|---|---|---|
| 并行单位 | 文件级 worker / process-per-test | 文件级子进程，但串行 | 隔离够，速度没吃到 |
| 调度 | worker pool、work-stealing | 单线程 for 循环 | 55 文件 9.5s，8 路可到 ~1.2s |
| 分片 | `--shard` / `--partition` | 无 | CI 无法多机扩展 |
| 重测试限流 | nextest test-groups / threads-required | 无 | 并发后 CPU/缓存争用风险 |
| 超时 | per-test/per-file timeout | 无 | 挂起会卡住整个套件 |
| 失败上限 | Playwright maxFailures | 收集全部 | 坏套件会跑完所有文件 |
| 耗时记录 | Vitest/nextest 报告 | 仅控制台打印 | 无法做均衡分片/回归 |
| 输出 | 结构化 reporter/JUnit | `stdio: inherit` | 并发后输出交错、不可读 |
| 外部服务隔离 | Testcontainers | 无外部 DB，不需要 | 容器化收益低 |
| 构建缓存 | Bazel/Turborepo | `npm run build` 全量 | 测试前构建是固定成本，可另做 |

## 6. 建议（按优先级）

### P0：安全并行化，不改测试语义

1. **异步 worker pool**：`spawn` 替代 `spawnSync`；默认 `concurrency = min(8, os.availableParallelism())`，允许 `--concurrency=N`。
2. **保留一文件一进程**：不引入线程池；每个子进程独立 `TMP`/`TEMP`，测试内继续用 `mkdtemp`。
3. **输出缓冲**：每文件收集 stdout/stderr，完成时打印 `[test] ok/FAIL <file> (<ms>)`，失败附尾部；避免 `inherit` 交错。
4. **超时与失败语义**：`--timeout=60000`；超时杀进程树；默认收集全部，`--fail-fast` 可选。
5. **重测试组**：`embedding`、`migrate`、`plugin` 打 heavy 标记，信号量限制同时 1–2 个；其余轻测试占满并发。
6. **耗时文件**：写 `.test-timings.json`（相对路径→ms），供下一轮均衡和慢测试回归。

建议 CLI：

```bash
node tools/test.ts --concurrency=8
node tools/test.ts --shard=1/4 --concurrency=8
node tools/test.ts --fail-fast --timeout=60000
```

### P1：CI 多机与治理

1. **稳定分片**：`--shard=i/n` 用相对路径的稳定 hash 分片（不要按排序后切片，文件增删会整体漂移）；CI matrix 4 片，每片上传 JUnit/日志，最后合并。
2. **耗时均衡**：本地可选 `--balance=timings`，按历史耗时做 LPT 装箱；CI 仍用稳定 hash 保证可复现。
3. **失败重试只给显式 `flaky` 标记**：重试不能掩盖确定性失败；重试结果单独标注。
4. **变更影响分析**：`--changed` 基于 `git diff` 选测试，仅作为开发者快速反馈；CI 仍全量。
5. **缓存 `dist` 构建**：按源码内容哈希缓存构建产物，测试 runner 只消费；不缓存测试结果。

### P2：按需升级

- 单文件内测试数继续增长时，再把超大文件拆成 process-per-test（nextest 思路）；
- 出现外部数据库/消息队列时再引入 Testcontainers；
- 不引入 Bazel/远程执行：当前套件太小，收益不抵维护成本；
- 不迁移 Vitest：自定义 runner 已与 `dist` 测试和 `node` 子进程深度耦合，迁移收益低。

## 7. 不建议照搬

| 方案 | 为什么不适配 |
|---|---|
| Vitest 全面迁移 | 测试直接跑编译后 `dist`，自定义 runner 简单；迁移会引入 Vite/transform 层，收益主要是开发体验而非隔离 |
| Bazel/远程执行 | 55 个 Node 测试、单仓库、无跨语言依赖；沙箱/远程执行成本远大于收益 |
| Testcontainers/Docker | 无外部数据库/浏览器；Windows 上 Docker 可用性还不稳定，增加环境依赖 |
| 测试结果缓存 | 测试含时间/随机/真实 FS，结果缓存会掩盖 flake；只缓存构建产物 |
| 线程池替代进程 | Node 模块单例、SQLite、`process.env` 都可能跨文件污染；nextest 的论证同样适用 |

## 8. 风险与未验证

- **单次探针不等于证明**：8 路并发只跑了一次；需要连续多轮、CI 冷缓存、低配机器复验。
- **CPU 争用**：8 路并发下每个测试的绝对耗时会被拉长；用总墙钟和 p95 评估，不要用单文件耗时回归判断。
- **模型/下载缓存**：若 embedding 测试未来下载模型，必须加缓存目录隔离或全局锁；否则并发会写坏缓存。
- **Windows 进程树**：超时杀子进程需杀进程树（`taskkill /T` 或 Job Object），否则 `spawn` 的子进程可能残留。
- **输出顺序**：并行完成顺序不稳定；报告要按文件排序，而不是按完成顺序断言。
- **X 内容**：本次 x.com 搜索页未返回可解析推文，nitter 镜像连接失败；没有把 X 内容作为证据。若必须引用 X，需要在已登录浏览器里用 CDP 抓取（本机有 chrome-devtools 能力），否则只能引用官方文档/GitHub。

## 9. 来源

- Vitest: [Parallelism](https://vitest.dev/guide/parallelism.html) · [Improving Performance](https://vitest.dev/guide/improving-performance)
- Playwright: [Parallelism](https://playwright.dev/docs/test-parallel) · [Sharding](https://playwright.dev/docs/test-sharding)
- pytest-xdist: [Distribution](https://pytest-xdist.readthedocs.io/en/stable/distribution.html)
- nextest: [Why process-per-test](https://nexte.st/docs/design/why-process-per-test/) · [Test groups](https://nexte.st/docs/configuration/test-groups/) · [Partitioning](https://nexte.st/docs/ci-features/partitioning/)
- Bazel: [Hermeticity](https://bazel.build/basics/hermeticity)
- Turborepo: [Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- Testcontainers: [Node.js](https://node.testcontainers.org/)
- Jest: [CLI](https://jestjs.io/docs/cli)
- GitHub Actions: [Job variations](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
- GitHub 项目元数据：GitHub REST API `/repos/{owner}/{repo}`（2026-10-31 快照）
