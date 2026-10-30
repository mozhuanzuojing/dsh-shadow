import assert from "node:assert/strict";
import { makeHttpEmbedder } from "../../dist/engine/read/embedding.js";

const realFetch = globalThis.fetch;
const setFetch = (fn: any) => {
  (globalThis as any).fetch = fn;
};
const restore = () => {
  (globalThis as any).fetch = realFetch;
};

const emb = makeHttpEmbedder({ baseURL: "http://x/v1", apiKeyEnv: "NO_SUCH_ENV_XYZ", model: "m1" });

try {
  // 1) HTTP 500 → 显式抛错
  setFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await assert.rejects(() => emb.embed(["a"]), /HTTP 500/, "500 应抛错");

  // 2) 返回数量不匹配 → 抛错
  setFetch(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ embedding: [1, 0] }] }) }));
  await assert.rejects(() => emb.embed(["a", "b"]), /数量不匹配/, "数量不符应抛错");

  // 3) 正常：2 条文本 → 2 个向量
  setFetch(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ data: body.input.map((t: string) => ({ embedding: t === "a" ? [1, 0] : [0, 1] })) }) };
  });
  const vecs = await emb.embed(["a", "b"]);
  assert.equal(vecs.length, 2);
  assert.deepEqual(vecs[0], [1, 0]);

  // 4) 未配置 model → 抛错
  const emb2 = makeHttpEmbedder({ baseURL: "http://x/v1", apiKeyEnv: "NO_SUCH_ENV_XYZ", model: "" });
  await assert.rejects(() => emb2.embed(["a"]), /model/, "无 model 应抛错");

  console.log("✔ http-embedder：500 抛错 / 数量不符抛错 / 正常返回向量 / 无 model 抛错");
} finally {
  restore();
}
