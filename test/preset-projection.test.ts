// dsh-shadow —— 投影预设的迁移与纪律棘轮（v1.20.0 / ADR-0098）。
//
// 锁四件事：
//   ① **形态**：0.1.7 起 agent 预设只能是 `@deepseek-ai/dsh-agent-preset` 声明行，随 bundle 的
//      `dsh.bundle.patch`（**数组**）里的 patch 文件发布。旧形态是 `$DSH_HOME/.agent-presets/<id>/`
//      目录（`preset.yml` + `agent.cordis.yml`）—— **0.1.7 上没有任何读取者**（官方 shipped skill
//      原文 *Nothing reads that directory any more*）⇒ 本仓不再保留它，且不得悄悄长回来。
//   ② **T1 不变量**：本预设**不含任何委派平面行**（无 `tool-subagent*`、无 `tool-agent-team`）。
//      Agent Teams 由 profile 层的 `@deepseek-ai/dsh-experimental-agent-team-profile` bundle 提供，
//      它自己就 disable 了 `tool-subagent*`。用户 2026-09-16 定调「如非必要，不得轻易开子代理」——
//      这条纪律现在是**上游**在执行，而不是靠本预设手工删行。
//   ③ **忠实性**：预设是 0.1.7 shipped `standard` 的忠实副本（F1），只允许两处有意偏差
//      （persona 文本、delegation 组）。行清单被逐字锁住：上游漂移 → 本测试红 → 人裁决，
//      而不是让预设悄悄落后于宿主。
//   ④ **描述前置 + Team 纪律锚点（v1.20.4 / v1.20.5）**：预设选择器的卡片把描述**截到 4 行**
//      （`dsh-client-ui-agent-preset` 的 `cardDesc { -webkit-line-clamp: 4 }`）⇒ Agent Teams
//      必须出现在**前置窗口**里，否则「文件里有、界面看不见」（用户 2026-09-23 报的就是这个）；
//      v1.20.5 起卡片文案压短，④a **不再**要求 description 点名 bundle / maxMembers；
//      且 persona 必须携带 0.1.7 `team:policy` 的执行口径锚点，掉了就红。
//
// ⚠ 为什么行清单是**写死**的：这正是「棘轮」的形态（同 `test/recall-envelope.test.ts` 的
//   `modes.size === 62`）。它**故意**会在上游增删行时变红 —— 那是要人裁决的信号，不是腐烂。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  DESCRIPTION_FRONT_WINDOW,
  DESCRIPTION_MUST_INCLUDE,
  PERSONA_TEAM_POLICY_ANCHORS,
  PERSONA_CAPABILITY_ANCHORS,
  FORBIDDEN_DELEGATION_ID_PREFIX,
  FORBIDDEN_DELEGATION_IDS,
} from "./fixtures/projection-contract.ts";

const patchUrl = new URL("../presets/projection.patch.yml", import.meta.url);
const pkgUrl = new URL("../package.json", import.meta.url);
const legacyDir = new URL("../agent-presets/", import.meta.url);

// ── ① 形态与发布面 ────────────────────────────────────────────────────────────
{
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));
  const patches = pkg?.dsh?.bundle?.patch;

  assert.ok(Array.isArray(patches), "dsh.bundle.patch 必须是**数组**：0.1.7 的 bundle 可以带多个 patch（插件行 + 预设声明行）");
  assert.ok(
    patches.includes("./cordis.patch.yml"),
    "bundle patch 必须含插件行 patch ./cordis.patch.yml",
  );
  assert.ok(
    patches.includes("./presets/projection.patch.yml"),
    "bundle patch 必须含预设声明行 patch ./presets/projection.patch.yml",
  );
  for (const rel of patches) {
    // 正对照：patch 路径必须真的存在 —— 否则 loader 在装配时才炸（缺件不静默，见 ADR-0049）
    assert.ok(existsSync(new URL(`../${rel.replace(/^\.\//, "")}`, import.meta.url)), `bundle patch 路径必须存在：${rel}`);
  }
  assert.ok(!patches.some((p) => String(p).includes("agent-presets")), "bundle patch 不得再指向已退役的 agent-presets/ 形态");
  console.log(`✔ ① dsh.bundle.patch 是数组且两个 patch 都在（${patches.join(", ")}）`);
}

// ── ①b 旧形态必须已退役 ───────────────────────────────────────────────────────
{
  assert.equal(
    existsSync(legacyDir),
    false,
    "agent-presets/ 必须已删除：0.1.7 不读该目录（旧形态留着只会误导，见 ADR-0098）",
  );
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));
  assert.ok(!(pkg.files || []).includes("agent-presets"), "package.json 的 files 不得再发布 agent-presets");
  assert.ok((pkg.files || []).includes("presets"), "package.json 的 files 必须发布 presets/（否则装完没有预设声明行）");
  console.log("✔ ①b agent-presets/ 已退役；files 改为发布 presets/");
}

// ── ②③ 预设声明行与行清单 ─────────────────────────────────────────────────────
{
  const src = readFileSync(patchUrl, "utf8");

  // 声明行身份（`agentPresets.standingKeyFor('projection')` 靠它解析）
  assert.match(src, /-\s+id:\s*preset-projection\b/, "声明行 id 必须是 preset-projection");
  assert.match(src, /name:\s*'@deepseek-ai\/dsh-agent-preset'/, "预设必须由 @deepseek-ai/dsh-agent-preset 声明");
  assert.match(src, /config:\s*\n\s*id:\s*projection\b/, "config.id 必须是 projection");
  assert.match(src, /order:\s*20\b/, "config.order 必须是 20（沿用旧 preset.yml 的 order）");
  assert.match(src, /name:\s*投影模式/, "config.name 必须是「投影模式」（沿用旧 preset.yml 的展示名）");
  assert.match(src, /^\s*description:/m, "config.description 必须存在（预设选择器要用）");
  assert.match(src, /^\s*plugins:\s*$/m, "config.plugins 必须存在");

  // 行清单棘轮：逗号分隔的 id 序列
  const ids = [...src.matchAll(/^\s*-\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(
    ids,
    [
      "preset-projection",
      "persona",
      "agent-instructions",
      "tool-bash",
      "tool-pwsh",
      "tool-fs",
      "tool-fs-search",
      "tool-jobs",
      "skill-filesystem",
      "tool-skill",
      "command-goal",
      "tool-goal",
      "planning",
      "plan-mode",
      "compaction",
      "compaction-basic",
      "command-compact",
      "tool-result-pruner",
      "delegation",
      "workflow-ptc",
      "tool-workflow",
      "tool-ralph",
      "tool-ask-user",
      "tool-todo",
      "tool-web",
      "present",
      "tool-plugin-manager",
    ],
    "行清单漂移：上游 standard 增删了行，或本预设被改动 —— 人裁决后同步这里",
  );

  // ② T1 不变量（在**行 id** 上判，不受注释散文影响）
  assert.equal(
    ids.filter((id) => id.startsWith(FORBIDDEN_DELEGATION_ID_PREFIX)).length,
    0,
    "T1：不得出现任何 tool-subagent* 行（用户 2026-09-16「不得轻易开子代理」，Teams 已是唯一委派机制）",
  );
  for (const bad of FORBIDDEN_DELEGATION_IDS) {
    assert.equal(ids.includes(bad), false, `T1：不得出现 ${bad} 行 —— Teams 已移到 profile 层 bundle`);
  }
  assert.deepEqual(
    ["workflow-ptc", "tool-workflow", "tool-ralph"].filter((id) => ids.includes(id)),
    ["workflow-ptc", "tool-workflow", "tool-ralph"],
    "delegation 组必须保留 workflow-ptc / tool-workflow / tool-ralph（预设仍拥有它们）",
  );

  // ③ F1 忠实性：0.1.7 standard 的取值被照抄
  assert.match(src, /-\s+id:\s*tool-ralph[\s\S]*?disabled:\s*true/, "F1：tool-ralph 必须照抄 standard 的 disabled: true");
  assert.match(src, /-\s+id:\s*tool-web[\s\S]*?fetch:\s*true/, "F1：tool-web 必须照抄 standard 的 fetch: true");
  assert.match(src, /id:\s*command-goal/, "F1：必须含 standard 的 command-goal 行");
  assert.match(src, /'@deepseek-ai\/dsh-tool-present'/, "F1：必须含 standard 的 present 行");
  assert.match(
    src,
    /plugin-manager\/tools[\s\S]*?disabled:\s*true/,
    "F1：tool-plugin-manager 必须含且 disabled（标准件在标准预设里就是关的）",
  );

  // ③ persona：投影模式那段文本仍在，且用的仍是 prefix/suffix 键
  assert.match(src, /suffix:\s*Your working directory is \{\{cwd\}\}\./, "persona 必须用 suffix 键（v1.14.1 修过：旧 text: 键装不上）");
  assert.match(src, /prefix:\s*>-/, "persona 必须用 prefix 折叠块");
  assert.match(src, /你处于「投影模式」/, "persona 必须携带投影模式那段文本（这是本预设存在的全部理由）");

  console.log(`✔ ②③ 声明行身份 OK；行清单 ${ids.length} 项棘轮锁住；T1/F1 不变量全过`);
}

// ── ④ 描述前置窗口 + persona 的 Team 纪律锚点（v1.20.4） ──────────────────────
{
  const src = readFileSync(patchUrl, "utf8");

  // ④a 描述：GUI 卡片只显示约 4 行（≈90 字）⇒ Agent Teams 必须落在前置窗口里。
  // v1.20.5：卡片文案压短 —— 不再要求 description 点名 bundle / maxMembers（细节在 persona / README）。
  const desc = src.match(/^\s*description:\s*(.+)$/m)?.[1] ?? "";
  assert.notEqual(desc, "", "config.description 必须存在且是单行 plain scalar（不得含「冒号+空格」，那会让 YAML 解析直接失败）");
  assert.match(
    desc.slice(0, DESCRIPTION_FRONT_WINDOW),
    new RegExp(DESCRIPTION_MUST_INCLUDE),
    `④a 描述前 ${DESCRIPTION_FRONT_WINDOW} 字必须出现「${DESCRIPTION_MUST_INCLUDE}」——预设选择器的卡片把描述截到 4 行，写在末尾等于界面上看不见`,
  );

  // ④b persona：0.1.7 `team:policy` 的执行口径锚点（上游改口径时要回来核这一份）。
  const persona = src.match(/prefix:\s*>-\n([\s\S]*?)\n\s*-\s+id:/)?.[1] ?? "";
  assert.notEqual(persona, "", "④b persona prefix 折叠块必须能取到");
  for (const needle of PERSONA_TEAM_POLICY_ANCHORS) {
    assert.ok(persona.includes(needle), `④b persona 必须携带 0.1.7 team:policy 锚点：${needle}`);
  }
  console.log("✔ ④ 描述前置窗口含 Agent Teams；persona 携带 team:policy 六个锚点");
}

// ── ⑤ persona 的「宿主原生能力面」锚点（v1.21.5） ─────────────────────────────
{
  const src = readFileSync(patchUrl, "utf8");
  const persona = src.match(/prefix:\s*>-\n([\s\S]*?)\n\s*-\s+id:/)?.[1] ?? "";
  assert.notEqual(persona, "", "⑤ persona prefix 折叠块必须能取到");
  for (const needle of PERSONA_CAPABILITY_ANCHORS) {
    assert.ok(
      persona.includes(needle),
      `⑤ persona 必须携带能力面锚点：${needle} —— 真实浏览器 / 桌面操控要用宿主原生面（browser-use / computer-use），不要引第三方 harness`,
    );
  }
  console.log("✔ ⑤ persona 携带宿主原生能力面五个锚点（browser-use / computer-use）");
}
