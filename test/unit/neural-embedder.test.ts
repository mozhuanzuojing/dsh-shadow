import assert from "node:assert/strict";
import { makeNeuralEmbedder, DEFAULT_NEURAL_MODEL } from "../../dist/engine/read/neural-embedder.js";

// 假 pipeline：记录收到的文本，返回固定格式的 tolist
const calls: any[] = [];
const loadPipeline = async () => async (texts: string[], opts: any) => {
  calls.push({ texts, opts });
  return { tolist: () => texts.map((t) => [t.includes("query:") ? 1 : 0, 1]) };
};

// 1) e5 模型：带 query:/passage: 前缀
const e5 = makeNeuralEmbedder({ model: "Xenova/multilingual-e5-small", loadPipeline });
assert.equal(e5.id, "neural:Xenova/multilingual-e5-small");
assert.equal(e5.queryPrefix, "query: ");
assert.equal(e5.docPrefix, "passage: ");
const v = await e5.embed(["passage: hello"]);
assert.equal(v.length, 1);
assert.equal(v[0]!.length, 2);
assert.equal(calls[0].opts.pooling, "mean");
assert.equal(calls[0].opts.normalize, true);

// 2) 非 e5 模型：不加前缀
const mini = makeNeuralEmbedder({ model: "Xenova/all-MiniLM-L6-v2", loadPipeline });
assert.equal(mini.queryPrefix, undefined);
assert.equal(mini.docPrefix, undefined);

// 3) 默认模型
assert.equal(makeNeuralEmbedder({}).id, `neural:${DEFAULT_NEURAL_MODEL}`);

console.log("✔ neural-embedder：e5 前缀 / 非 e5 无前缀 / pooling+normalize / 默认模型");
