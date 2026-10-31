/**
 * v2 ops — 并行隔离测试运行器。
 *
 * 形态：每个测试文件一个 node 子进程（保持进程级隔离）；异步 worker pool 并发调度。
 * 支持：--concurrency / --timeout / --fail-fast / --heavy / --root / --timings。
 * 不把多个测试塞进同一线程：Node 模块单例、SQLite、process.env 都可能跨文件污染。
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

export interface RunnerOptions {
  /** 测试根目录（绝对路径）。 */
  root: string;
  concurrency: number;
  timeoutMs: number;
  failFast: boolean;
  /** 重测试（embedding/migrate/plugin）同时运行上限。 */
  heavyLimit: number;
  /** 耗时记录写入路径（绝对路径）。 */
  timingsPath: string;
}

export interface FileResult {
  file: string;
  code: number;
  ms: number;
  timedOut: boolean;
  output: string;
}

const MAX_OUTPUT = 512 * 1024;
const HEAVY_RE = /(?:^|[\\/])(?:embedding|migrate|plugin)(?:[^\\/]*)\.test\.ts$/i;

export const isHeavyTest = (file: string): boolean => HEAVY_RE.test(file);

const positiveInt = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

export const parseArgs = (argv: string[], cwd = process.cwd()): RunnerOptions => {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const concurrency = positiveInt(get("concurrency"), Math.max(1, Math.min(8, availableParallelism())), 1, 64);
  const rootRaw = get("root") ?? "test";
  const timingsRaw = get("timings") ?? ".test-timings.json";
  return {
    root: resolve(cwd, rootRaw),
    concurrency,
    timeoutMs: positiveInt(get("timeout"), 60_000, 1_000, 30 * 60_000),
    failFast: argv.includes("--fail-fast"),
    heavyLimit: positiveInt(get("heavy"), Math.max(1, Math.min(2, concurrency)), 1, 16),
    timingsPath: resolve(cwd, timingsRaw),
  };
};

const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith(".test.ts")) out.push(p);
  }
  return out;
};

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = Math.max(1, permits);
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return;
    }
    await new Promise<void>((resolveWaiter) => this.waiters.push(resolveWaiter));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.permits += 1;
  }
}

/** 杀进程树：Windows 用 taskkill /T；POSIX 用进程组负 pid。 */
const killTree = (child: ChildProcess): void => {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
};

const runOne = (file: string, workerId: number, opts: RunnerOptions, tempRoot: string): Promise<FileResult> => {
  return new Promise((resolveResult) => {
    const started = Date.now();
    let output = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, [file], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TMP: tempRoot,
        TEMP: tempRoot,
        TMPDIR: tempRoot,
        DSH_SHADOW_TEST_WORKER: String(workerId),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const append = (chunk: Buffer): void => {
      output = (output + chunk.toString("utf8")).slice(-MAX_OUTPUT);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // 进程树没在 5s 内退出时强行结算，避免 timeout 把整个 runner 卡死。
      hardTimer = setTimeout(() => finish(124), 5_000);
    }, opts.timeoutMs);
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      resolveResult({
        file: relative(opts.root, file).replace(/\\/g, "/"),
        code: timedOut ? 124 : code,
        ms: Date.now() - started,
        timedOut,
        output,
      });
    };
    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code ?? 1));
  });
};

export const runTests = async (opts: RunnerOptions): Promise<{ results: FileResult[]; wallMs: number; failed: number }> => {
  const files = walk(opts.root).sort();
  if (!files.length) {
    throw new Error(`no test/**/*.test.ts found under ${opts.root}`);
  }

  const runRoot = join(tmpdir(), "dsh-shadow-test", `${process.pid}-${Date.now()}`);
  const temps = Array.from({ length: opts.concurrency }, (_, i) => {
    const dir = join(runRoot, `w${i}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  });

  const results: FileResult[] = [];
  let next = 0;
  let failed = 0;
  let stopping = false;
  const heavy = new Semaphore(opts.heavyLimit);
  const started = Date.now();

  const runWorker = async (workerId: number): Promise<void> => {
    while (true) {
      if (stopping) return;
      const index = next++;
      if (index >= files.length) return;
      const file = files[index]!;
      const hot = isHeavyTest(file);
      if (hot) await heavy.acquire();
      try {
        const result = await runOne(file, workerId, opts, temps[workerId]!);
        results.push(result);
        if (result.code !== 0) {
          failed += 1;
          if (opts.failFast) stopping = true;
          const tail = result.output.trimEnd();
          console.error(`\n[test] FAIL ${result.file} (${result.ms}ms${result.timedOut ? ", timeout" : ""})`);
          if (tail) console.error(tail.slice(-4000));
        } else {
          console.log(`[test] ok ${result.file} (${result.ms}ms)`);
        }
      } finally {
        if (hot) heavy.release();
      }
    }
  };

  await Promise.all(Array.from({ length: opts.concurrency }, (_, i) => runWorker(i)));
  const wallMs = Date.now() - started;

  try {
    rmSync(runRoot, { recursive: true, force: true });
  } catch {
    /* 残留临时目录不掩盖测试结果 */
  }

  results.sort((a, b) => a.file.localeCompare(b.file));
  try {
    mkdirSync(dirname(opts.timingsPath), { recursive: true });
    writeFileSync(
      opts.timingsPath,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          wallMs,
          concurrency: opts.concurrency,
          files: Object.fromEntries(results.map((r) => [r.file, r.ms])),
        },
        null,
        2,
      ) + "\n",
    );
  } catch (e) {
    console.error(`[test] timings 写入失败：${e instanceof Error ? e.message : String(e)}`);
  }

  return { results, wallMs, failed };
};

const main = async (): Promise<void> => {
  const opts = parseArgs(process.argv.slice(2));
  let outcome: Awaited<ReturnType<typeof runTests>>;
  try {
    outcome = await runTests(opts);
  } catch (e) {
    console.error(`[test] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
    return;
  }
  const total = outcome.results.length;
  const passed = total - outcome.failed;
  console.log(
    `\n[test] ${passed}/${total} passed in ${outcome.wallMs}ms (concurrency ${opts.concurrency}, heavy ${opts.heavyLimit})`,
  );
  const slowest = [...outcome.results].sort((a, b) => b.ms - a.ms).slice(0, 5);
  if (slowest.length) console.log(`[test] slowest: ${slowest.map((r) => `${r.file} ${r.ms}ms`).join(" · ")}`);
  if (outcome.failed) {
    console.error(`[test] FAILED: ${outcome.results.filter((r) => r.code !== 0).map((r) => r.file).join(", ")}`);
    process.exit(1);
  }
};

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && entry === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
