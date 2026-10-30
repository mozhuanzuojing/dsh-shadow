import assert from "node:assert/strict";
import { cosine } from "../../dist/domain/embedding.js";
import { buildEmbeddingIndex, searchEmbedding, type Embedder } from "../../dist/engine/read/embedding.js";
import { MemoryFs } from "../../dist/store/fs.js";

// 假 embedder：64 维 bag-of-words（确定性、离线），用于验证索引/检索/复用
const DIMS = 64;
const fake = (): Embedder & { calls: number } => {
  const o: any = {
    id: "fake-64",
    calls: 0,
    async embed(texts: string[]) {
      o.calls += 1;
      return texts.map((t) => {
        const v = new Array(DIMS).fill(0);
        for (const w of t.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean)) {
          let h = 0;
          for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
          v[h % DIMS] += 1;
        }
        const n = Math.hypot(...v) || 1;
        return v.map((x) => x / n);
      });
    },
  };
  return o;
};

// 1) cosine 基本性质
assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9, "同向量余弦=1");
assert.equal(cosine([1, 0], [0, 1]), 0, "正交=0");

// 2) 建索引 + 语义检索命中
const seed = {
  "/ws/src/auth.ts": "export function createSession(token) { return jwt.sign(token); }\n",
  "/ws/src/ui.ts": "export function renderButton() { return '<button>'; }\n",
};
const deps = { fs: new MemoryFs(seed), ws: "/ws" };
const e1 = fake();
const b = await buildEmbeddingIndex(deps as any, e1, { maxChunks: 100 });
assert.ok(b.entries.length >= 2, "应有索引条目");
assert.ok(b.embedded >= 2 && b.reused === 0, `首次应全量嵌入：${JSON.stringify(b)}`);

const r = await searchEmbedding(deps as any, "jwt token session", e1, { limit: 5 });
assert.ok(!r.error, `不应报错：${r.error}`);
assert.equal(r.hits[0]?.rel, "src/auth.ts", `语义应命中 auth：${JSON.stringify(r.hits)}`);

// 3) 二次构建按 hash 复用（0 新嵌入）
const e2 = fake();
const b2 = await buildEmbeddingIndex(deps as any, e2, { maxChunks: 100 });
assert.equal(b2.embedded, 0, `二次应复用全部：${JSON.stringify(b2)}`);
assert.equal(b2.reused, b.entries.length);
assert.equal(e2.calls, 0, "二次不应调用 embedder");

// 4) 空查询
const none = await searchEmbedding(deps as any, "", e1, {});
assert.equal(none.hits.length, 0);

console.log("✔ embedding：cosine + 语义检索命中 + hash 复用(0 重嵌) + 空查询");
