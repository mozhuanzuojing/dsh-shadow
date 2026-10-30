/**
 * v2 contract — 配置（11 键）。
 *
 * 原则：显式 0 保留（不写 `|| default`）；未知键在 normalize 时收集为 warnings，不静默。
 */

import type { ShadowConfig } from "./types.js";

export interface NormalizedConfig {
  shadowRoot?: string;
  projectRoot?: string;
  capture: Required<NonNullable<ShadowConfig["capture"]>>;
  recall: Required<NonNullable<ShadowConfig["recall"]>>;
  retention: Required<NonNullable<ShadowConfig["retention"]>>;
  forget: Required<NonNullable<ShadowConfig["forget"]>>;
  compact: Required<NonNullable<ShadowConfig["compact"]>>;
  index: Required<NonNullable<ShadowConfig["index"]>>;
  telemetry: Required<NonNullable<ShadowConfig["telemetry"]>>;
  toolset: Required<NonNullable<ShadowConfig["toolset"]>>;
  lab: Required<NonNullable<ShadowConfig["lab"]>>;
  autoRecall: Required<NonNullable<ShadowConfig["autoRecall"]>>;
  codeSearch: Required<NonNullable<ShadowConfig["codeSearch"]>>;
  warnings: string[];
}

/** 只有“未传 / null / NaN”才回落；显式 0 保留。 */
export const numOr = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** v1 的默认全开判据：undefined = 开，只有显式 false 才关。 */
export const onByDefault = (value: unknown): boolean => value !== false;

export const normalizeConfig = (raw: ShadowConfig | undefined, warnings: string[] = []): NormalizedConfig => {
  const c = raw ?? {};
  const known = new Set([
    "shadowRoot", "projectRoot", "capture", "recall", "retention", "forget",
    "compact", "index", "telemetry", "toolset", "lab", "autoRecall", "codeSearch",
  ]);
  for (const k of Object.keys(c as Record<string, unknown>)) {
    if (!known.has(k)) warnings.push(`未知配置键：${k}（v2 只认 ${[...known].join(" / ")}）`);
  }
  if (c.recall?.cooldownTurns !== undefined) warnings.push("recall.cooldownTurns 在 v2-dev 尚未接线");
  if (c.recall?.lossDisclosure !== undefined) warnings.push("recall.lossDisclosure 在 v2-dev 尚未接线");
  if (c.index?.provider !== undefined) warnings.push("index.provider 在 v2-dev 尚未接线（当前固定 sqlite）");
  return {
    shadowRoot: typeof c.shadowRoot === "string" && c.shadowRoot.trim() ? c.shadowRoot.trim() : undefined,
    projectRoot: typeof c.projectRoot === "string" && c.projectRoot.trim() ? c.projectRoot.trim() : undefined,
    capture: {
      echo: c.capture?.echo === "memory" ? "memory" : "audit",
      consent: c.capture?.consent === true,
      summary: c.capture?.summary === "off" ? "off" : c.capture?.summary === "deterministic" ? "deterministic" : "auto",
    },
    recall: {
      budget: Math.max(256, Math.min(8000, numOr(c.recall?.budget, 1600))),
      limit: Math.max(1, Math.min(30, numOr(c.recall?.limit, 10))),
      cooldownTurns: Math.max(0, numOr(c.recall?.cooldownTurns, 0)),
      deprioritize: Array.isArray(c.recall?.deprioritize)
        ? c.recall!.deprioritize!.filter((x): x is string => typeof x === "string" && !!x.trim())
        : [],
      lossDisclosure: c.recall?.lossDisclosure !== false,
    },
    retention: {
      halfLifeDays: Math.max(0.01, numOr(c.retention?.halfLifeDays, 7)),
      staleDays: Math.max(1, numOr(c.retention?.staleDays, 14)),
    },
    forget: {
      staleDays: Math.max(1, numOr(c.forget?.staleDays, 14)),
      minHits: Math.max(0, numOr(c.forget?.minHits, 0)),
      maxActive: Math.max(0, numOr(c.forget?.maxActive, 0)),
    },
    compact: {
      gapMinutes: Math.max(0, numOr(c.compact?.gapMinutes, 60)),
    },
    index: {
      provider: c.index?.provider === "fs" ? "fs" : "sqlite",
      verify: c.index?.verify === "full" ? "full" : "token",
    },
    telemetry: {
      queryLog: c.telemetry?.queryLog !== false,
      hits: c.telemetry?.hits !== false,
    },
    toolset: { enabled: c.toolset?.enabled !== false },
    lab: { enabled: c.lab?.enabled === true },
    autoRecall: {
      enabled: c.autoRecall?.enabled === true,
      limit: Math.max(1, Math.min(5, numOr(c.autoRecall?.limit, 2))),
    },
    codeSearch: {
      exclude: Array.isArray(c.codeSearch?.exclude)
        ? c.codeSearch!.exclude!.filter((x): x is string => typeof x === "string" && !!x.trim())
        : [],
      useGitignore: c.codeSearch?.useGitignore !== false,
      index: {
        enabled: c.codeSearch?.index?.enabled !== false,
        maxChunks: Math.max(1, Math.min(200000, numOr(c.codeSearch?.index?.maxChunks, 20000))),
        maxBytes: Math.max(100_000, Math.min(200_000_000, numOr(c.codeSearch?.index?.maxBytes, 16_000_000))),
      },
      embedding: {
        enabled: c.codeSearch?.embedding?.enabled !== false,
        provider: c.codeSearch?.embedding?.provider === "local" ? "local" : c.codeSearch?.embedding?.provider === "http" ? "http" : "auto",
        baseURL: typeof c.codeSearch?.embedding?.baseURL === "string" && c.codeSearch.embedding.baseURL.trim() ? c.codeSearch.embedding.baseURL.trim() : "http://127.0.0.1:3425/v1",
        apiKeyEnv: typeof c.codeSearch?.embedding?.apiKeyEnv === "string" && c.codeSearch.embedding.apiKeyEnv.trim() ? c.codeSearch.embedding.apiKeyEnv.trim() : "MAGPIE_GATEWAY_KEY",
        model: typeof c.codeSearch?.embedding?.model === "string" ? c.codeSearch.embedding.model.trim() : "",
        maxChunks: Math.max(1, Math.min(50000, numOr(c.codeSearch?.embedding?.maxChunks, 2000))),
      },
    },
    warnings,
  };
};
