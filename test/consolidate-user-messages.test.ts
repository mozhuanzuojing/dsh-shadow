// dsh-shadow —— 收口正文的**用户消息段**（`D1`；正/负对照。判据源：`adr/0113` §1.5 `D1`）。
//
// ## 为什么单独一个文件
// `D1` 是**取错字段**：`core/view/episode.ts` 把以 `用户：` 开头的行放进 `userMessages`，
// 并**恰好把它们排除出 `thinkLines`**；而 `core/writer/render.ts` 的 `consolidateText` 却从
// `thinkLines` 里过滤 `^用户：` ⇒ 那个过滤器**恒不命中**（`thinkLines` 的行一定带 `- ` / `[..] [..]` 前缀）。
// 后果：`> 概况：… N 用户消息` **恒报 0**，用户消息行**永不出现** —— 破的是「**如实**声明」那一半。
//
// ## 两条判据（不比对易腐的输出串）
//   ① **数**：`> 概况：… N 用户消息` 的 N === 该 episode 的 `userMessages` **去重数**
//      （去重口径与 decisions/actions 两侧一致，都走 `new Set`）；
//   ② **行 + 身份**：把收口正文**重新 `parseMemory`**，得到的 `userMessages` 必须逐条相等
//      ⇒ 「真的出现」**且**「仍认得出是用户消息」。② 是只修①时最容易漏掉的一半：把文本塞进正文
//      却丢掉 `用户：` 标记，重解析时它会被降级成 `thinkLines`（与 `决定 ` / `改/读 ` 两侧**不对称**），
//      `mode:"task"` 的触发（`core/view/task.ts` 读 `userMessages`）也跟着消失 —— 那只是把同一个缺陷
//      推上一层（收口原子本身就在 `atoms/` 里、会进缓存并参与派生）。
//
// 负对照：`userMessages` 为空 ⇒ 概况**如实报 0**、**不得凭空造行**、也不得留一个空标记。
import assert from "node:assert/strict";
import { parseMemory, deriveEpisodes, type ParsedMemory } from "../dist/core/view/episode.js";
import { consolidateText } from "../dist/core/writer/render.js";

type AtomDef = { name: string; text: string };

/** 造一条与写侧落盘形态同形的原子文件（头 + `- [..] [entry] <文本>` 正文行）。 */
const atom = (name: string, entry: string, at: string, body: string[]): AtomDef => ({
  name,
  text: [
    `# ${entry}`, "",
    "> 完整线索",
    "> 坐标：locus(ws) · when(2026-09-07 09:00:00) · soul(default) · role(default) · intent(test)",
    "> 项目：ws", "> Agent：T1", "",
    ...body.map((l) => `- [${at}] [${entry}] ${l}`), "",
  ].join("\n"),
});

const userLine = (t: string) => `用户：${t}`;
const actLine = (p: string) => `改/读 ${p}`;

/** 文件名必须带 `<date>--<HHMMSS>-`（Episode 的时间间隔判据读的是**文件名**里的时刻，不是正文行里的）。 */
const parsed = (defs: AtomDef[]): ParsedMemory[] =>
  defs.map((d) => parseMemory(d.text, `D:/ws/.shadow/atoms/${d.name}`, d.name));

/** 判据①的期望值来自**原子自己**的 `userMessages`（不是从输出反推），与 render 的去重口径同形。 */
const wantUsers = (atoms: ParsedMemory[]) => Array.from(new Set(atoms.flatMap((a) => a.userMessages)));

const summaryUserCount = (text: string): number => {
  const m = text.match(/^> 概况：\d+ 动作 · (\d+) 用户消息 · \d+ 决策$/m);
  assert.ok(m, `收口正文必须有可解析的「> 概况：」行：\n${text}`);
  return Number(m[1]);
};

// ── 正对照：有用户消息 ⇒ 数 = 去重数，行真的出现且仍认得出 ────────────────────────────
{
  const atoms = parsed([
    atom("2026-09-07--090000-pkg-a.md", "pkg-a", "09:00:00", [userLine("原话甲"), actLine("pkg-a/x.js")]),
    // 同一句**跨原子重复** ⇒ 去重判据才有区分力（decisions/actions 两侧也是同一 `new Set` 口径）
    atom("2026-09-07--090500-pkg-a.md", "pkg-a", "09:05:00", [userLine("原话甲"), userLine("原话乙"), actLine("pkg-a/x2.js")]),
  ]);
  const want = wantUsers(atoms);
  assert.deepEqual(want, ["原话甲", "原话乙"], `夹具应给出 2 条去重用户消息，实际 ${JSON.stringify(want)}`);

  const ep = deriveEpisodes(atoms, { gapMinutes: 60 })[0];
  assert.equal(ep.memoryRefs.length, 2, "两原子间隔 5 分钟 ⇒ 应属同一 episode（否则正对照不成立）");

  const text = consolidateText(ep, atoms);
  assert.equal(summaryUserCount(text), want.length, `概况的用户消息数必须等于 userMessages 去重数：\n${text}`);

  const back = parseMemory(text, "D:/ws/.shadow/atoms/ep-x-consolidated.md", "ep-x-consolidated.md");
  assert.deepEqual(back.userMessages, want, `收口正文重解析后 userMessages 必须逐条相等（行真的出现，且带「用户：」标记）：\n${text}`);
  assert.deepEqual(back.thinkLines, [], `用户消息行不得被降级进 thinkLines：\n${text}`);
  console.log("✔ 正对照（D1）：收口概况的用户消息数 = `userMessages` 去重数，且重解析仍认得出用户消息");
}

// ── 负对照：无用户消息 ⇒ 如实报 0、不造行 ────────────────────────────────────────────
{
  const atoms = parsed([atom("2026-09-07--120000-pkg-b.md", "pkg-b", "12:00:00", [actLine("pkg-b/y.js")])]);
  assert.deepEqual(wantUsers(atoms), [], "夹具本身应无用户消息");

  const ep = deriveEpisodes(atoms, { gapMinutes: 60 })[0];
  const text = consolidateText(ep, atoms);
  assert.equal(summaryUserCount(text), 0, `无用户消息 ⇒ 概况必须如实报 0：\n${text}`);
  assert.ok(!text.includes("用户："), `不得凭空造用户行、也不得留空标记：\n${text}`);
  const back = parseMemory(text, "D:/ws/.shadow/atoms/ep-y-consolidated.md", "ep-y-consolidated.md");
  assert.deepEqual(back.userMessages, [], "无用户消息 ⇒ 重解析也必须为空（负对照）");
  console.log("✔ 负对照（D1）：无用户消息 ⇒ 概况报 0、不造行、不留空标记");
}

// ── `V1` 边界登记（`adr/0113` §1.5 `V1` / §6 `V1`）：**收口正文里的用户消息是「摘要」不是「逐字」** ──
// `core/view/episode.ts` 的解析层把 `userMessages` 截到 **160 字**（无注释、无文档，见 §1.5 V1 的依据），
// 且**不自报**损失（对照：写侧 `core/retention/collect.ts` 的 600 上限会写「已截断：原文 N 字」）。
// 本块**锁住这个已知边界**：它红了等于「160 这条上限被改动过」——那是必须**显式决定**的事
// （改大 / 去掉 / 改成自报），不是可以顺手漂过去的。**逐字句柄是原原子**（`atoms/…`，`Forget≠Delete`）。
{
  const long = `${"甲".repeat(80)}${"乙".repeat(80)}${"丙".repeat(80)}`;   // 240 字 > 160
  const atoms = parsed([atom("2026-09-07--130000-pkg-c.md", "pkg-c", "13:00:00", [userLine(long)])]);
  const ep = deriveEpisodes(atoms, { gapMinutes: 60 })[0];
  const text = consolidateText(ep, atoms);
  assert.equal(summaryUserCount(text), 1, `长用户消息仍应计 1 条：\n${text}`);
  const back = parseMemory(text, "D:/ws/.shadow/atoms/ep-z-consolidated.md", "ep-z-consolidated.md");
  assert.equal(back.userMessages.length, 1, "长用户消息应出现在收口正文里");
  assert.equal(back.userMessages[0].length, 160, `收口正文里的用户消息应仍是**前 160 字**（V1 边界）：${back.userMessages[0].length}`);
  assert.notEqual(back.userMessages[0], long, "**收口正文里的用户消息是摘要，不是逐字**（V1：逐字句柄 = 原原子）");
  console.log("✔ V1 边界：收口正文的用户消息是「前 160 字摘要」而非逐字（改这条上限 ⇒ 本块变红，逼一次显式决定）");
}

console.log("ALL PASS ✅");
