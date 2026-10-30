/**
 * v2 engine — embedder 选择链（provider: auto/local/http/hash）。
 *
 * 语义：**按顺序尝试**，前一个失败（error）才用下一个；`building` 不是失败（后台建索引中）。
 * auto = HTTP(model) → 本地神经 → 哈希；local = 神经 → 哈希；http = HTTP → 哈希；hash = 哈希。
 */

import type { Embedder } from "./embedding.js";
import { makeHttpEmbedder } from "./embedding.js";
import { makeNeuralEmbedder } from "./neural-embedder.js";
import { makeLocalEmbedder } from "./local-embedder.js";

export interface EmbeddingChainConfig {
  provider?: string;
  baseURL?: string;
  apiKeyEnv?: string;
  model?: string;
  neuralModel?: string;
}

export const resolveEmbedderChain = (cfg: EmbeddingChainConfig = {}): Embedder[] => {
  const provider = String(cfg.provider ?? "auto");
  const hash = (): Embedder => makeLocalEmbedder();
  const neural = (): Embedder => makeNeuralEmbedder({ model: cfg.neuralModel || undefined });
  const http = (): Embedder =>
    makeHttpEmbedder({
      baseURL: cfg.baseURL || "http://127.0.0.1:3425/v1",
      apiKeyEnv: cfg.apiKeyEnv || "MAGPIE_GATEWAY_KEY",
      model: cfg.model || "",
    });
  if (provider === "hash") return [hash()];
  if (provider === "local") return [neural(), hash()];
  if (provider === "http") return [http(), hash()];
  return cfg.model ? [http(), neural(), hash()] : [neural(), hash()];
};
