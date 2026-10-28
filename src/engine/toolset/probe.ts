/**
 * v2 engine/toolset — 探测 / 巡检 / 能力预检（全部只读）。
 *
 * 探测的两条诚实纪律（沿 v1 ADR-0055）：
 *   ① **探测失败只说「未检出」，不说「未装」**：探测方式可能不适用（该工具没有版本旗标），
 *      PATH 也可能是**宿主进程启动时的快照**（宿主起来之后装的工具要重启才可见）。
 *   ② reference 档默认**不探测**（全目录上百个外部进程没必要每次都跑）；要探测用 survey:"all"。
 *
 * 为什么用 node:child_process：台账必须真的问 PATH 上的可执行文件，不能猜。
 * 只用 execFile（不经 shell）⇒ 零运行期 npm 依赖、无 shell 注入面；代价是 Windows 上
 * execFile 不能起 .cmd/.bat（CVE-2024-27980 缓解）—— 这类失败只会显示「未检出」，口径已在上面兜住。
 */

import { execFile } from "node:child_process";
import { CAPABILITIES, capabilityOf, findCapabilities } from "./catalog.js";
import type { ExecResult, PrecheckRow, ProbeResult, Runner, SurveyRow } from "./types.js";

/** provider 探测超时（首次可能触发索引/模型加载）。 */
const PROVIDER_TIMEOUT_MS = 15_000;
/** reference 探测超时：只是 `--version`，短超时即可；失败不影响结论口径（说「未检出」）。 */
const REFERENCE_TIMEOUT_MS = 3_000;

/** 能力预检单次最多处理的条目数（防止一次调用拉满 100+ 子进程）。 */
export const MAX_PRECHECK_NEEDS = 12;

/** 真实 runner：execFile，不抛（错误归一成 ok:false），带超时与输出上限。 */
export const execRunner: Runner = (cmd, args, timeoutMs) =>
  new Promise<ExecResult>((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code ?? (error as { signal?: string }).signal ?? "error";
        resolve({ ok: false, code: String(code), out: String(stdout ?? ""), err: String(stderr ?? "") || error.message });
        return;
      }
      resolve({ ok: true, code: 0, out: String(stdout ?? ""), err: String(stderr ?? "") });
    });
  });

const firstLine = (s: string): string => String(s ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";

export interface ProbeOptions {
  /** 注入 runner（测试用假 runner；默认 execRunner）。 */
  runner?: Runner;
  /** 覆盖探测超时；缺省按条目 kind 取（provider 15s / reference 3s）。 */
  timeoutMs?: number;
}

/**
 * 探测一项。**不抛**：runner 抛错也归一成「未检出」并带原因。
 * 注意返回值里的 detail 是**证据口径**（如 `未检出（ENOENT）`），不是「未安装」结论。
 */
export const probeCapability = async (id: string, opts: ProbeOptions = {}): Promise<ProbeResult> => {
  const c = capabilityOf(id);
  if (!c) return { available: false, detail: `未登记的条目：${id}` };
  const cmd = c.probe[0];
  if (!cmd) return { available: false, detail: "台账条目 probe 为空（数据错误）" };
  const runner = opts.runner ?? execRunner;
  const timeoutMs = opts.timeoutMs ?? (c.kind === "provider" ? PROVIDER_TIMEOUT_MS : REFERENCE_TIMEOUT_MS);
  try {
    const r = await runner(cmd, c.probe.slice(1), timeoutMs);
    return r.ok
      ? { available: true, detail: firstLine(r.out) || "ok" }
      : { available: false, detail: `未检出（${r.code}）` };
  } catch (e) {
    return { available: false, detail: `未检出（探测抛错：${e instanceof Error ? e.message : String(e)}）` };
  }
};

export interface SurveyOptions extends ProbeOptions {
  /** "providers"（默认，只探 provider）｜"all"（并行探测全部）。 */
  survey?: "providers" | "all";
  /** 只列某一分类。 */
  category?: string;
}

/**
 * 台账巡检。默认：provider 实时探测，reference **只列不探**（省 100+ 次外部进程）。
 * `survey:"all"` → 全部并行探测（短超时）。
 */
export const surveyCapabilities = async (opts: SurveyOptions = {}): Promise<SurveyRow[]> => {
  const all = opts.survey === "all";
  const scope = opts.category ? CAPABILITIES.filter((c) => c.category === opts.category) : CAPABILITIES;
  return Promise.all(
    scope.map(async (c): Promise<SurveyRow> => {
      const shouldProbe = c.kind === "provider" || all;
      if (!shouldProbe) return { capability: c, available: null, detail: "未探测" };
      const p = await probeCapability(c.id, { runner: opts.runner, timeoutMs: opts.timeoutMs });
      return { capability: c, available: p.available, detail: p.detail };
    }),
  );
};

export interface PrecheckOptions extends ProbeOptions {}

/**
 * 按能力需求预检。**只读**（只探测，绝不安装）。
 * 未命中的需求不探测、不编造命令 —— 只如实说「台账未登记」。
 * 多命中（如 coreutils 三变体）→ 逐条探测，任一可用即算就位。
 */
export const precheckCapabilities = async (needs: string[], opts: PrecheckOptions = {}): Promise<PrecheckRow[]> => {
  const list = (needs ?? []).map((n) => String(n ?? "").trim()).filter(Boolean).slice(0, MAX_PRECHECK_NEEDS);
  return Promise.all(
    list.map(async (need): Promise<PrecheckRow> => {
      const hits = findCapabilities(need);
      if (!hits.length) {
        return { need, hit: false, hits: [], available: null, detail: "台账未登记该能力（不编造命令）" };
      }
      let firstMissing: ProbeResult | undefined;
      for (const c of hits) {
        const p = await probeCapability(c.id, { runner: opts.runner, timeoutMs: opts.timeoutMs });
        if (p.available) {
          return { need, hit: true, capability: c, hits, available: true, detail: `${c.label} 可用（${p.detail}）` };
        }
        if (!firstMissing) firstMissing = p;
      }
      return { need, hit: true, capability: hits[0], hits, available: false, detail: firstMissing?.detail || "未检出" };
    }),
  );
};
