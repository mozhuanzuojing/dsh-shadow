import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchCodeIndexed } from "../../dist/engine/read/code-index.js";
import { realFs } from "../../dist/store/fs.js";

const dir = await mkdtemp(join(tmpdir(), "dsh-shadow-index-"));
const ws = dir.replace(/\\/g, "/");
try {
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "auth.ts"), "export function createSession(token) {\n  return token;\n}\n");
  await writeFile(join(dir, "src", "ui.ts"), "export function renderButton() {\n  return 1;\n}\n");
  const deps = { fs: realFs, ws };

  // 1) 首次建索引并命中
  const r1 = await searchCodeIndexed(deps, "createSession", { limit: 5 });
  assert.ok(r1.text.includes("src/auth.ts"), r1.text);
  assert.ok(r1.chunks >= 2, `应有语法块：${r1.chunks}`);
  assert.ok(r1.readFiles >= 2, `首次应读文件：${r1.readFiles}`);

  // 2) 无变化：不重读任何文件（增量复用）
  const r2 = await searchCodeIndexed(deps, "createSession", { limit: 5 });
  assert.equal(r2.readFiles, 0, `无变化不应读文件：${r2.readFiles}`);

  // 3) 只改一个文件：只重读该文件
  await new Promise((r) => setTimeout(r, 25));
  await writeFile(join(dir, "src", "auth.ts"), "export function createSession(token) {\n  return token;\n}\nexport function rotateToken() {\n  return 2;\n}\n");
  const r3 = await searchCodeIndexed(deps, "rotateToken", { limit: 5 });
  assert.equal(r3.readFiles, 1, `应只重读 1 个文件：${r3.readFiles}`);
  assert.ok(r3.text.includes("src/auth.ts"), r3.text);

  // 4) trigram 候选裁剪生效（候选 < 总块数）
  assert.ok(r3.candidates < r3.chunks, `候选应被裁剪：candidates=${r3.candidates} chunks=${r3.chunks}`);

  // 5) maxFiles 截断要显式披露（不能谎报「未截断」）
  const r5 = await searchCodeIndexed(deps, "createSession", { limit: 3, maxFiles: 1 });
  assert.equal(r5.truncated, true, "maxFiles=1 应标记截断");
  assert.ok(r5.text.includes("截断"), `输出应披露截断：${r5.text.slice(0, 200)}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("✔ code-index：语法块索引 / 无变化 0 重读 / 改一文件只重读 1 个 / trigram 候选裁剪 / maxFiles 截断披露");
