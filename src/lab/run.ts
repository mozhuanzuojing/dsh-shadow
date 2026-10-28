/**
 * v2 lab — 51 mode 的统一执行入口。
 *
 * 算法来自 vendored v1 lab（`vendor/query/*` 与依赖闭包）；这里只做：
 * 输入白名单 → write 闸 → v1 依赖/fs 适配 → 分派 → v2 Outcome/结构化结果。
 */

import { err, ok, type Outcome } from "../contract/outcome.js";
import type { NormalizedConfig } from "../contract/config.js";
import { RECALL_PREFIX } from "../domain/text.js";
import type { SignalStore } from "../engine/signals.js";
import type { FsPort } from "../store/fs.js";
import { toV1Fs } from "./fs.js";
import {
  LAB_MODE_SET,
  LAB_INPUT_SET,
  isLabWriteMode,
  unknownLabMode,
} from "./registry.js";
import { runContVerify } from "./vendor/query/contverify.js";
import { runObserverKernel } from "./vendor/query/observer-kernel.js";
import { runValidation } from "./vendor/query/validation.js";
import { runFederation } from "./vendor/query/federation.js";
import { runRealityModel } from "./vendor/query/reality-model.js";
import { runWorld } from "./vendor/query/world.js";
import { runSimAction } from "./vendor/query/sim-action.js";
import { runPlanning } from "./vendor/query/planning.js";
import { runAgency } from "./vendor/query/agency.js";
import { runDelegation } from "./vendor/query/delegation.js";
import { runRecall } from "./vendor/query/recall.js";
import { runAdaptation } from "./vendor/query/adaptation.js";
import { runHorizon } from "./vendor/query/horizon.js";
import { runIndexBudget } from "./vendor/query/index-budget.js";
import { RECALL_PREFIX as V1_RECALL_PREFIX } from "./vendor/core/util.js";

export interface LabDeps {
  fs: FsPort;
  ws: string;
  config: NormalizedConfig;
  signals: SignalStore;
  agent?: { id?: string; session?: any };
}

export interface LabResult {
  mode: string;
  wrote: boolean;
  data: { text: string };
  notes: string[];
  loss: null;
}

const stripPrefix = (s: string): string => {
  for (const p of [RECALL_PREFIX, V1_RECALL_PREFIX]) {
    if (s.startsWith(p)) return s.slice(p.length);
  }
  return s;
};

const dispatch = async (mode: string, args: any, deps: any, ctx: any): Promise<string | undefined> => {
  // 顺序与 v1 query.ts 的 seam 顺序一致；每个 runner 对非本族 mode 返回 undefined。
  const chains: Array<(d: any, a: any, c: any) => Promise<string | undefined>> = [
    runContVerify, runObserverKernel, runValidation, runFederation, runRealityModel,
    runWorld, runSimAction, runPlanning, runAgency, runDelegation, runRecall,
    runAdaptation, runHorizon,
  ];
  for (const run of chains) {
    const out = await run(deps, args, ctx);
    if (out !== undefined) return out;
  }
  if (mode === "index") {
    const maxChars = Math.max(256, Math.min(8000, Number(args?.max_tokens) || 1600)) * 4;
    return runIndexBudget(deps, ctx, maxChars);
  }
  return undefined;
};

/** 51 mode 的执行器。`write` 是显式闸，不是提示。 */
export const runLab = async (
  deps: LabDeps,
  raw: { mode?: unknown; input?: unknown; write?: unknown },
): Promise<Outcome<LabResult>> => {
  const mode = String(raw?.mode ?? "").trim();
  if (!LAB_MODE_SET.has(mode)) return err("UNKNOWN_MODE", unknownLabMode(mode), { mode });
  const input = raw?.input ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return err("INVALID_INPUT", `shadow_lab.input 必须是对象；mode "${mode}" 的字段见 docs/v2/LAB.md。`, { mode });
  }
  const unknown = Object.keys(input as Record<string, unknown>).filter((k) => !LAB_INPUT_SET.has(k));
  if (unknown.length) {
    return err(
      "INVALID_INPUT",
      `mode "${mode}" 不接受字段：${unknown.join(", ")}；允许字段：${[...LAB_INPUT_SET].sort().join(", ")}`,
      { mode, unknown },
    );
  }
  const writeRequired = isLabWriteMode(mode);
  const write = raw?.write === true;
  if (writeRequired && !write) {
    return err("WRITE_REQUIRED", `mode "${mode}" 是写型；必须显式 shadow_lab({mode:"${mode}", write:true})。`, { mode });
  }
  if (!writeRequired && write) {
    return err("WRITE_DENIED", `mode "${mode}" 是只读；不能带 write:true。`, { mode });
  }

  const agentId = deps.agent?.id || "lab";
  const fs = toV1Fs(deps.fs);
  const v1deps: any = {
    fs,
    // 全局 observer 根收进工作区，避免写到 home；workspace 层写仍由各记录自带 workspace。
    config: { observerGlobalRoot: `${deps.ws.replace(/\\/g, "/").replace(/\/+$/, "")}/.shadow/lab/observer` },
    cwdBySession: new Map([[agentId, deps.ws]]),
    getFlushWarn: () => "",
    noteDegrade: (capability: string, reason: string, effect: string) => deps.signals.note(`lab.${capability}`, "LAB_DEGRADE", reason, effect),
    ensureIndex: async () => {},
    verifyEvidence: async () => ({ status: "unavailable", reason: "lab 未接 Evidence Gateway" }),
    expandTerms: async () => [],
    approval: undefined,
  };
  const args = { mode, ...(input as Record<string, unknown>) };
  const ctx = { fs, ws: deps.ws, flushWarn: "", agent: { id: agentId, session: deps.agent?.session } };

  let body: string | undefined;
  try {
    body = await dispatch(mode, args, v1deps, ctx);
  } catch (e) {
    // vendored v1 代码内部大多返回失败文本；未捕获异常必须变成显式失败，不得裸抛给工具框架。
    return err("INTERNAL", `lab mode "${mode}" 执行异常：${e instanceof Error ? e.message : String(e)}`, { mode });
  }
  if (body === undefined) return err("NOT_PORTED", `lab mode "${mode}" 尚未接上执行器。`, { mode });

  const clean = stripPrefix(String(body));
  const wrote = write && !/Rejected|未落盘|写入失败|未写入/.test(clean);
  return ok({
    mode,
    wrote,
    data: { text: clean },
    notes: deps.signals.active().map((s) => `${s.capability}${s.code ? `/${s.code}` : ""}：${s.message}；${s.effect}`),
    loss: null,
  });
};
