import assert from "node:assert/strict";
import { makeLocalEmbedder, localEmbedText } from "../../dist/engine/read/local-embedder.js";
import { cosine } from "../../dist/domain/embedding.js";

const a = localEmbedText("export function createSession(token) { return jwt.sign(token); }");
const b = localEmbedText("export function createSession(token) { return jwt.sign(token); }");
const c = localEmbedText("function renderButton() { return '<button>'; }");

// 1) 确定性 + 维度 + 归一
assert.deepEqual(a, b, "同文本应同向量");
assert.equal(a.length, 512);
assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9, "应 L2 归一");

// 2) 相近文本相似度 > 无关文本
const simSame = cosine(a, b);
const simDiff = cosine(a, c);
assert.ok(simSame > 0.99, `同文本相似度应≈1：${simSame}`);
assert.ok(simSame > simDiff + 0.2, `相关应高于无关：${simSame} vs ${simDiff}`);

// 3) 内置 embedder 接口
const emb = makeLocalEmbedder(256);
assert.equal(emb.id, "local:hash-256");
const vecs = await emb.embed(["createSession", "renderButton"]);
assert.equal(vecs.length, 2);
assert.equal(vecs[0]!.length, 256);

console.log("✔ local-embedder：确定性 / 512 维归一 / 相关>无关 / embedder 接口");
