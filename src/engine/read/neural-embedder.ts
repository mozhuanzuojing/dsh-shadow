/**
 * v2 engine — 本地神经 embedder（transformers.js / ONNX）。ADR-0022 修订。
 *
 * 参考 Cursor：语义检索要用**真模型**，而不是哈希。这里在本地跑一个检索型小模型
 * （默认 `Xenova/multilingual-e5-small`，中英混合；e5 需要 query:/passage: 前缀），
 * 首次使用会从 HuggingFace 下载 ONNX 权重并缓存（q8 量化）。
 * 动态 import：模型/依赖不可用 → 抛错，由上层回落到内置哈希向量（不静默）。
 */

import type { Embedder } from "./embedding.js";

export interface NeuralEmbedderOptions {
  /** HuggingFace 模型 id（transformers.js 兼容的 ONNX 仓库）。 */
  model?: string;
  dtype?: "q8" | "fp16" | "fp32";
  /** 测试注入：替换真实 pipeline 加载。 */
  loadPipeline?: (model: string, dtype: string) => Promise<any>;
}

export const DEFAULT_NEURAL_MODEL = "Xenova/multilingual-e5-small";
/** 国内直连 huggingface.co 常超时；默认探测失败后走镜像。 */
const HF_MIRROR = "https://hf-mirror.com/";
let endpointPicked = false;

const pickEndpoint = async (mod: any): Promise<void> => {
  if (endpointPicked) return;
  endpointPicked = true;
  const explicit = process.env.DSH_SHADOW_HF_ENDPOINT?.trim();
  if (explicit) {
    mod.env.remoteHost = explicit.endsWith("/") ? explicit : `${explicit}/`;
    return;
  }
  try {
    const r = await fetch("https://huggingface.co/", { method: "HEAD", signal: AbortSignal.timeout(3000) });
    if (r.ok) return; // 直连可用
  } catch {
    /* 直连失败 → 镜像 */
  }
  mod.env.remoteHost = HF_MIRROR;
};

export const makeNeuralEmbedder = (opts: NeuralEmbedderOptions = {}): Embedder => {
  const model = opts.model?.trim() || DEFAULT_NEURAL_MODEL;
  const dtype = opts.dtype ?? "q8";
  let pipe: any = null;
  const getPipe = async (): Promise<any> => {
    if (pipe) return pipe;
    if (opts.loadPipeline) {
      pipe = await opts.loadPipeline(model, dtype);
      return pipe;
    }
    const mod: any = await import("@huggingface/transformers");
    await pickEndpoint(mod);
    pipe = await mod.pipeline("feature-extraction", model, { dtype });
    return pipe;
  };
  // e5 系列需要非对称前缀；其它模型不加。
  const e5 = /(^|[/-])e5([-.]|$)/i.test(model);
  return {
    id: `neural:${model}`,
    queryPrefix: e5 ? "query: " : undefined,
    docPrefix: e5 ? "passage: " : undefined,
    async embed(texts: string[]): Promise<number[][]> {
      const p = await getPipe();
      const out = await p(texts, { pooling: "mean", normalize: true });
      const list = typeof out?.tolist === "function" ? out.tolist() : out;
      if (!Array.isArray(list) || !Array.isArray(list[0])) throw new Error("neural embedder 返回格式异常");
      return list as number[][];
    },
  };
};
