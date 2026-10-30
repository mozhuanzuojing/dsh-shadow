import assert from "node:assert/strict";
import { resolveEmbedderChain } from "../../dist/engine/read/embedder-chain.js";

const ids = (cfg: any) => resolveEmbedderChain(cfg).map((e) => e.id);

// auto + 无 model：本地神经 → 哈希
assert.deepEqual(ids({}), ["neural:Xenova/multilingual-e5-small", "local:hash-512"]);

// auto + model：HTTP → 本地神经 → 哈希
const withModel = ids({ model: "m1" });
assert.equal(withModel[0], "http:m1");
assert.equal(withModel[1], "neural:Xenova/multilingual-e5-small");
assert.equal(withModel[2], "local:hash-512");

// local：神经 → 哈希
assert.deepEqual(ids({ provider: "local" }), ["neural:Xenova/multilingual-e5-small", "local:hash-512"]);

// http：HTTP → 哈希
assert.deepEqual(ids({ provider: "http", model: "m2" }), ["http:m2", "local:hash-512"]);

// hash：仅哈希
assert.deepEqual(ids({ provider: "hash" }), ["local:hash-512"]);

// 自定义神经模型
assert.equal(ids({ neuralModel: "Xenova/all-MiniLM-L6-v2" })[0], "neural:Xenova/all-MiniLM-L6-v2");

console.log("✔ embedder-chain：auto/model/local/http/hash 顺序正确");
