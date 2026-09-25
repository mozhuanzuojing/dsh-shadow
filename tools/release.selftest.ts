// dsh-shadow —— tools/release.selftest.ts：**发版闸门**的标定（v1.21.26 立，起因就是 v1.21.26 事故本身）。
//
// 一个抓不到已知违规的检查器等于没有（本仓 v1.15.36 的教训）⇒ 每组都给**负对照**：
// 尤其「verify 红了照样往下走」那一条 —— 它是这起事故的唯一判据，必须有正反两面。
import assert from "node:assert/strict";
import {
  FORBIDDEN_ARGS,
  gateDecision,
  localTagsToDelete,
  parseReleaseArgs,
  planRelease,
  planViolations,
  remoteTagsToDelete,
  tailLines,
  versionTag,
} from "./release.lib.ts";

const base = { version: "1.21.26", branch: "main", dirty: true, localTags: ["v1.21.25"], remoteTags: ["v1.21.25"], message: "feat(T6): v1.21.26 兜底根可见信号" };

// ── ① 参数解析 ───────────────────────────────────────────────────────────────
{
  const d = parseReleaseArgs([]);
  assert.ok(d.ok && d.value.dryRun === false && d.value.message === undefined, "默认：不 dry-run、无自定义提交信息");
  const m = parseReleaseArgs(["--message", "x y"]);
  assert.ok(m.ok && m.value.message === "x y", "--message <值> 应原样收下（含空格）");
  const me = parseReleaseArgs(["--message=z"]);
  assert.ok(me.ok && me.value.message === "z", "--message=<值> 等价形态");
  const dr = parseReleaseArgs(["--dry-run"]);
  assert.ok(dr.ok && dr.value.dryRun === true, "--dry-run 生效");
  const miss = parseReleaseArgs(["--message"]);
  assert.ok(!miss.ok, "**负对照**：--message 缺值必须报错，不得静默吞掉");
  const skip = parseReleaseArgs(["--skip-verify"]);
  assert.ok(!skip.ok, "**负对照**：--skip-verify 必须被拒（它正是 v1.21.26 事故的成因）");
  console.log("✔ ① 参数解析：默认 / --message / --message= / --dry-run 收下；缺值与 --skip-verify 报错");
}

// ── ② 闸门判据（**这起事故的判据**）─────────────────────────────────────────
{
  assert.equal(gateDecision(0).proceed, true, "verify exit 0 ⇒ 唯一放行条件");
  assert.equal(gateDecision(1).proceed, false, "**正对照**：verify exit 1（门红）⇒ **不许**往下走 —— v1.21.26 就是死在这里");
  assert.equal(gateDecision(2).proceed, false, "verify exit 2（结构缺失 / 语料根缺失 ⇒ 假绿）同样不许发版");
  assert.match(gateDecision(2).reason, /假绿/, "exit 2 的理由必须点名「假绿」（否则读者会以为只是慢）");
  assert.match(gateDecision(1).reason, /不许发生/, "exit 1 的理由必须写明「任何 commit/tag/push 都不许发生」");
  console.log("✔ ② 闸门：exit 0 放行；exit 1 / 2 **都不放行**（2 单独点名「假绿」）");
}

// ── ③ tag 清理：每版只留一个 ─────────────────────────────────────────────────
{
  const local = ["v1.21.25", "v1.21.24", "v0.9.0"];
  const remote = ["v1.21.25", "v1.21.26"];
  assert.deepEqual(localTagsToDelete(local, "1.21.26"), ["v0.9.0", "v1.21.24", "v1.21.25"], "本地：除当前版本外全删（升序）");
  assert.deepEqual(remoteTagsToDelete(remote, "1.21.26"), ["v1.21.25"], "远端：除当前版本外全删（否则远端攒住两个以上）");
  assert.deepEqual(remoteTagsToDelete(["v1.21.26"], "1.21.26"), [], "**负对照**：远端已是唯一 tag ⇒ 无旧 tag 可删");
  assert.deepEqual(localTagsToDelete(["v1.21.26"], "1.21.26"), [], "**负对照**：已经是唯一 tag ⇒ 一个都不删");
  assert.deepEqual(localTagsToDelete(["v1.21.25", "v1.21.25"], "1.21.26"), ["v1.21.25"], "重复名去重");
  assert.equal(versionTag("1.21.26"), "v1.21.26", "tag 名 = v + version");
  console.log("✔ ③ tag 清理：只留当前版本（本地/远端各自判）、去重、稳态不删");
}

// ── ④ 计划：顺序与内容 ───────────────────────────────────────────────────────
{
  const plan = planRelease(base);
  const flat = plan.map((c) => c.cmd + " " + c.args.join(" "));
  assert.equal(flat[0], "git add -A", "脏工作区 ⇒ 先 add");
  assert.equal(flat[1], "git commit -m " + base.message, "再提交（tag 必须指向发布提交）");
  assert.equal(flat[flat.length - 2], "git push origin main", "倒数第二条：推分支");
  assert.equal(flat[flat.length - 1], "git push origin v1.21.26", "**末条**：精确推新 tag");
  const iCommit = flat.findIndex((f) => f.startsWith("git commit"));
  const iTag = flat.findIndex((f) => f === "git tag v1.21.26");
  const iPushTag = flat.length - 1;
  assert.ok(iCommit < iTag && iTag < iPushTag, "顺序必须是 提交 → 打 tag → 推 tag；实测 " + iCommit + "/" + iTag + "/" + iPushTag);
  assert.ok(flat.includes("git tag -d v1.21.25"), "旧 tag 必须删（每版只留一个）");
  assert.ok(flat.includes("git push origin :refs/tags/v1.21.25"), "远端旧 tag 也要删，否则远端攒住");
  assert.deepEqual(planViolations(plan), [], "**正对照**：合法计划必须零违例");

  const clean = planRelease({ ...base, dirty: false });
  assert.ok(!clean.some((c) => c.args[0] === "add" || c.args[0] === "commit"), "干净工作区 ⇒ 不 add、不 commit（tag 指向现有 HEAD）");
  assert.equal(clean[clean.length - 1].args.join(" "), "push origin v1.21.26", "干净工作区末条同样是精确推 tag");

  const one = planRelease({ ...base, localTags: ["v1.21.26"], remoteTags: ["v1.21.26"] });
  assert.ok(!one.some((c) => c.args[0] === "tag" && c.args[1] === "-d"), "**负对照**：已是唯一 tag ⇒ 计划里没有删 tag 这一步");
  console.log("✔ ④ 计划：add/commit → 删旧 tag（本地+远端）→ 打新 tag → 推分支 → 推 tag；干净工作区跳过提交");
}

// ── ⑤ 计划自检：**抓得到**已知违例（负对照）────────────────────────────────
{
  const badTags = [{ cmd: "git", args: ["push", "origin", "--tags"], why: "违规" }];
  assert.ok(planViolations(badTags).length > 0, "**负对照**：--tags 必须被抓到（会误推无关标签）");
  const badForce = [{ cmd: "git", args: ["push", "origin", "main", "--force"], why: "违规" }];
  assert.ok(planViolations(badForce).length > 0, "**负对照**：--force 必须被抓到（本工具不改写历史）");
  const badBare = [{ cmd: "git", args: ["push"], why: "违规" }];
  assert.ok(planViolations(badBare).length > 0, "**负对照**：裸 push 必须被抓到（没点名要推什么）");
  const empty = [{ cmd: "git", args: [], why: "违规" }];
  assert.ok(planViolations(empty).length > 0, "**负对照**：空参数必须被抓到");
  assert.deepEqual(planViolations([]), [], "空计划不算违例（但 CLI 侧不可能走到）");
  assert.ok(FORBIDDEN_ARGS.includes("--tags") && FORBIDDEN_ARGS.includes("--force"), "禁用清单至少含 --tags / --force");
  console.log("✔ ⑤ 计划自检：--tags / --force / 裸 push / 空参数 都抓得到；空计划不算违例");
}

// ── ⑥ 日志尾巴 ───────────────────────────────────────────────────────────────
{
  assert.equal(tailLines("a\nb\nc\nd", 2), "c\nd", "取末 n 行");
  assert.equal(tailLines("a\r\nb\r\nc", 1), "c", "CRLF 归一化后再切（本仓工作副本是 CRLF）");
  assert.equal(tailLines("x", 5), "x", "行数不足时原样返回");
  console.log("✔ ⑥ 日志尾巴：末 n 行 + CRLF 归一化");
}

console.log("ALL PASS ✅");
