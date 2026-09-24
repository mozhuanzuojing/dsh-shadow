// dsh-shadow —— 投影空间小世界 / 灵魂规避滤 / 便利贴（ADR-0107）
import assert from "node:assert/strict";
import { applySoftLens, missingSoulBanner, ignoreTermsOf } from "../dist/core/space/soft-lens.js";
import { buildProjectionView, parseViewTokens, parseViewVisible, projectionViewRel, bodyHashOf, readProjectionViewIfFresh } from "../dist/core/space/view-file.js";
import { loadProjectionSpace, invalidateProjectionSpace, soulTokenOf } from "../dist/core/space/world.js";
import { writeRoleCard } from "../dist/core/space/cards.js";

console.log("── soft-lens ──");
{
  const soul = { observer: { what_to_ignore: ["秘密", "密码"] } };
  const body = "可见行\n含秘密的一行\n另一行\n密码=xxx\n末行";
  const r = applySoftLens(body, soul);
  assert.equal(r.missingSoul, false);
  assert.ok(r.applied);
  assert.ok(r.text.includes("可见行") && r.text.includes("末行"));
  assert.ok(!r.text.includes("秘密"));
  assert.equal(r.hidden.length, 2);
  assert.deepEqual(ignoreTermsOf(soul), ["秘密", "密码"]);
}
{
  const r = applySoftLens("全文", null);
  assert.equal(r.missingSoul, true);
  assert.equal(r.applied, false);
  assert.equal(r.text, "全文");
  assert.ok(missingSoulBanner().includes("还没有灵魂"));
}
console.log("✔ soft-lens 规避 / 缺灵魂透传");

console.log("── view-file ──");
{
  const soul = { observer: { what_to_ignore: ["藏"] } };
  const txt = buildProjectionView(
    ".shadow/atoms/2026-09-23--120000-a.md",
    "2026-09-23--120000-a.md",
    "公开\n藏起我\n尾",
    soul,
    { atomToken: "10:v1", soulToken: "soul.json:1:v" },
  );
  assert.ok(txt.includes("> atomToken: 10:v1"));
  assert.ok(parseViewVisible(txt).includes("公开"));
  assert.ok(!parseViewVisible(txt).includes("藏起"));
  const tok = parseViewTokens(txt);
  assert.equal(tok?.soulToken, "soul.json:1:v");
  assert.equal(projectionViewRel("a.md"), ".shadow/indexes/projections/a.md");
}
console.log("✔ view-file 格式与路径");

// ── 读回完整性（v1.21.0 修）· 便利贴新鲜度（令牌 + 正文哈希）──────────────────────
// 缺陷原型（修前必红）：`parseViewVisible` 的前瞻 `(?=\r?\n## |\r?\n*$)` 在 `/m` 下于**首个行尾**即成立
// ⇒ 只捕获第一行，而 topic 召回把它直接赋给 `s.text` ⇒ 送模型的正文被静默截断成一行。
console.log("── 读回必须是完整正文（不是第一行）──");
{
  const soul = { observer: { what_to_ignore: ["藏"] } };
  const name = "2026-09-23--120000-a.md";
  const body = "公开一\n公开二\n## 正文里的小标题（不是分段标记）\n公开三\n藏起来的一行";
  const want = { atomToken: "10:v1", soulToken: "soul.json:1:v", bodyHash: bodyHashOf(body) };
  const txt = buildProjectionView(`.shadow/atoms/${name}`, name, body, soul, want);

  // 正对照（修前形态标定）：把**修前那条正则**原样跑一遍 —— 它必须只回第一行。
  // 这条断言的作用是让「上面那三条」永远有标定：判据真有区分力，不是恒真。
  const prefixRegex = txt.match(/^## visible\r?\n([\s\S]*?)(?=\r?\n## |\r?\n*$)/m);
  assert.equal(prefixRegex?.[1].trim(), "公开一",
    `正对照：修前的正则确实只回第一行（/m 下 \\n*$ 在首个行尾即成立）；实际 ${JSON.stringify(prefixRegex?.[1])}`);

  const visible = parseViewVisible(txt);
  assert.ok(visible.includes("公开一") && visible.includes("公开三"),
    `多行正文必须整段读回（修前只回第一行）：${JSON.stringify(visible)}`);
  assert.ok(visible.includes("## 正文里的小标题"),
    `正文里的 "## " 行不是分段标记，必须保留：${JSON.stringify(visible)}`);
  assert.ok(!visible.includes("藏起来"), "被规避的行仍不得出现");

  // 令牌 + 正文哈希都命中 ⇒ 才用便利贴；用的时候必须是**完整**正文
  const store = new Map<string, string>([[`D:/wsRead/${projectionViewRel(name)}`, txt]]);
  const fs = {
    resolve: async (p: any) => ({ displayPath: String(p).replace(/\\/g, "/") }),
    readText: async (t: any) => store.get(String(t.displayPath)) || "",
  };
  const fresh = await readProjectionViewIfFresh(fs, "D:/wsRead", name, want);
  assert.ok(fresh && fresh.includes("公开三"),
    `令牌与哈希都命中时必须返回完整正文：${JSON.stringify(fresh)}`);

  // 令牌相同、正文变了（≈「后端不给 version 时同尺寸原地改」）⇒ 必须判不新鲜
  assert.equal(
    await readProjectionViewIfFresh(fs, "D:/wsRead", name, { ...want, bodyHash: bodyHashOf(`${body}改`) }),
    null,
    "正文哈希不同 ⇒ 不得复用旧便利贴（否则用旧正文顶替刚读到的原文）",
  );

  // 旧格式便利贴（没有 bodyHash 行）⇒ 不得当新鲜，必须重滤写回
  const legacy = txt.replace(/^> bodyHash:.*\r?\n/m, "");
  assert.ok(!legacy.includes("bodyHash"), "夹具自证：legacy 便利贴确实没有 bodyHash 行");
  const storeLegacy = new Map<string, string>([[`D:/wsLegacy/${projectionViewRel(name)}`, legacy]]);
  const fsLegacy = {
    resolve: async (p: any) => ({ displayPath: String(p).replace(/\\/g, "/") }),
    readText: async (t: any) => storeLegacy.get(String(t.displayPath)) || "",
  };
  assert.equal(
    await readProjectionViewIfFresh(fsLegacy, "D:/wsLegacy", name, want),
    null,
    "没有正文哈希的旧便利贴不得当新鲜（ADR-0107 §2.5：不确定就重滤）",
  );
  console.log("✔ 完整正文往返 + 令牌/哈希双闸（哈希不符或旧格式 ⇒ 不复用）");
}


console.log("── world hydrate（桩 fs）──");
{
  invalidateProjectionSpace();
  const store = new Map<string, string>();
  const resolve = async (p: string) => ({ displayPath: p.replace(/\\/g, "/") });
  const fs = {
    resolve,
    readText: async (t: any) => store.get(String(t.displayPath).replace(/\\/g, "/")) || "",
    writeText: async (t: any, c: string) => { store.set(String(t.displayPath).replace(/\\/g, "/"), c); },
    listDir: async (t: any) => {
      const prefix = String(t.displayPath).replace(/\\/g, "/").replace(/\/$/, "") + "/";
      const names = new Set<string>();
      const types = new Map<string, "file" | "directory">();
      for (const k of store.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const seg = rest.split("/")[0];
        if (!seg) continue;
        names.add(seg);
        types.set(seg, rest.includes("/") ? "directory" : "file");
      }
      return [...names].map((n) => ({
        name: n,
        type: types.get(n) === "directory" || [...store.keys()].some((k) => k.startsWith(prefix + n + "/")) ? "directory" : "file",
        size: 1,
        version: "1",
        target: { displayPath: prefix + n },
      }));
    },
  };
  const ws = "D:/ws";
  store.set(`${ws}/.shadow/atoms/2026-09-23--120000-x.md`, "# x\n\n> 完整线索\n> 坐标：locus(ws) · when(2026-09-23 12:00:00) · soul(default) · role(default) · intent(t)\n\n- hi\n");
  store.set(`${ws}/.shadow/soul/soul.json`, JSON.stringify({ observer: { what_to_ignore: ["噪声"] } }));
  await writeRoleCard(fs, ws, { id: "coder", title: "Coder" });
  const w1 = await loadProjectionSpace(fs, ws, {});
  assert.equal(w1.missingSoul, false);
  assert.equal(w1.roles.length, 1);
  assert.equal(w1.atomRels.length, 1);
  const w2 = await loadProjectionSpace(fs, ws, {});
  assert.equal(w2, w1, "默认缓存应命中同一对象");
  const w3 = await loadProjectionSpace(fs, ws, { projectionSpace: { cache: false } });
  assert.notEqual(w3, w1);
  assert.ok((await soulTokenOf(fs, ws)).startsWith("soul.json:"));
}
console.log("✔ world hydrate + cache 默认开 / 可关");

console.log("ALL PASS ✅");
