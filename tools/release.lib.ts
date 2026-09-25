// dsh-shadow —— tools/release.lib.ts：**发版闸门与仪式**的纯判据（CLI `tools/release.ts` 与标定测试共用一份）。
//
// 由来（v1.21.26 事故，本会话第 4 次同类自身出错）：`v1.21.26` 被 commit、打 tag、**推到远端**，
// 而它的 `verify` 是 **exit 1**（`test/t8-silent-degradation.test.ts` + `test/writer-write.test.ts` 两条红）。
// 直接原因不是「测试红了」（那总能修），而是**出口没有闸门**：人手工走 commit/tag/push，
// `npm run verify` 的退出码**从未被当成继续/停止的判据**（此前只有「内容改动」上装了守卫）。
// `AGENTS.md` 早写着「凡『每次发版都要做一次』的动作，**要么写进清单、要么配一道门**」——
// 清单有，门没有，于是照旧停不住 ⇒ 本文件把那条判据固化成**可标定的纯函数**。
//
// ⚠ 刻意**不提供** `--skip-verify`：那等于把这起事故原样请回来。要跳过闸门只能不走本工具
// （而那样做的人至少已经知道自己在绕过什么）。

export type ReleaseArgs = { dryRun: boolean; message: string | undefined; help: boolean };

/**
 * 解析结果用**扁平字段**（`ok` / `value` / `error` 都在），不用判别联合 ——
 * `tsconfig.tools.json` 是 `strict: false`，实测那种联合在这里**收窄不了**
 * （`if (!r.ok) r.error` / 三元都会报 TS2339；本仓其它工具返回 `{ok, code, lines}` 同族）。
 */
export type ReleaseParse = { ok: boolean; value: ReleaseArgs; error: string };

/** 参数解析（纯）：**没有跳过 verify 的开关**，这是刻意的（见文件头）。 */
export const parseReleaseArgs = (argv: string[]): ReleaseParse => {
  const a: ReleaseArgs = { dryRun: false, message: undefined, help: false };
  const fail = (error: string): ReleaseParse => ({ ok: false, value: a, error });
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--dry-run") { a.dryRun = true; continue; }
    if (t === "--help" || t === "-h") { a.help = true; continue; }
    if (t === "--message" || t === "-m") {
      const v = argv[i + 1];
      if (!v) return fail(t + " 需要一个值（提交信息）");
      a.message = v;
      i++;
      continue;
    }
    if (t.startsWith("--message=")) { a.message = t.slice("--message=".length); continue; }
    return fail("不认识的参数 " + t + "（本工具**刻意不提供**跳过 verify 的开关）");
  }
  return { ok: true, value: a, error: "" };
};

export type GateVerdict = { proceed: boolean; reason: string };

/**
 * **闸门判据**（本文件存在的理由）：只有 `verify` 退出 0 才允许往下走。
 *
 * 1 = 门红；2 = 结构缺失 / 语料根缺失（`AGENTS.md` 明写：`eval:retrieval:check` 拿不到语料根就 exit 2，
 * **后面三步不跑** ⇒ 那一次「全绿」是**假绿**）—— 两者**同样不许发版**。
 */
export const gateDecision = (verifyExit: number): GateVerdict =>
  verifyExit === 0
    ? { proceed: true, reason: "verify exit 0（唯一放行条件）" }
    : {
        proceed: false,
        reason:
          verifyExit === 2
            ? "verify exit 2 —— **结构缺失 / 语料根缺失** ⇒ 那一次「绿」是假绿（AGENTS.md：后面三步不跑）⇒ 不发版"
            : "verify exit " + verifyExit + " —— 门红 ⇒ 不发版（先修红；任何 commit/tag/push 都不许发生）",
      };

/** 本仓 tag 名 = `v` + `package.json` 的 version（`AGENTS.md`「发版 tag 约定」）。 */
export const versionTag = (version: string): string => "v" + version;

/** 本地要删的旧 tag：**每版只留一个**（删旧建新）。 */
export const localTagsToDelete = (localTags: string[], version: string): string[] =>
  [...new Set(localTags)].filter((t) => t !== versionTag(version)).sort();

/** 远端要删的旧 tag：本地删了远端还在 ⇒ 远端会攒住两个以上，同样要删。 */
export const remoteTagsToDelete = (remoteTags: string[], version: string): string[] =>
  [...new Set(remoteTags)].filter((t) => t !== versionTag(version)).sort();

export type PlannedCommand = { cmd: string; args: string[]; why: string };

export type ReleasePlanInput = {
  version: string;
  branch: string;
  dirty: boolean;
  localTags: string[];
  remoteTags: string[];
  message: string;
};

/**
 * 把「绿了之后要做的事」排成命令清单（**纯函数**：不读盘、不 spawn，故可标定）。
 *
 * 顺序有语义：**先提交**（tag 必须指向**发布提交**）→ 删旧 tag（本地 + 远端）→ 打新 tag →
 * 推分支 + 推新 tag（**精确指定**，不用 `--tags` —— 那会误推无关标签）。
 */
export const planRelease = (input: ReleasePlanInput): PlannedCommand[] => {
  const tag = versionTag(input.version);
  const out: PlannedCommand[] = [];
  if (input.dirty) {
    out.push({ cmd: "git", args: ["add", "-A"], why: "把本次发版内容纳入提交（提交前会把清单打出来）" });
    out.push({ cmd: "git", args: ["commit", "-m", input.message], why: "**发布提交** —— 下面的 tag 必须指向它" });
  }
  for (const t of localTagsToDelete(input.localTags, input.version)) {
    out.push({ cmd: "git", args: ["tag", "-d", t], why: "本地旧 tag：口径是每版只留一个" });
  }
  for (const t of remoteTagsToDelete(input.remoteTags, input.version)) {
    out.push({ cmd: "git", args: ["push", "origin", ":refs/tags/" + t], why: "远端旧 tag：本地删了远端还在 = 远端攒住" });
  }
  out.push({ cmd: "git", args: ["tag", tag], why: "打新 tag（轻量 tag，名字 = package.json 的 version）" });
  out.push({ cmd: "git", args: ["push", "origin", input.branch], why: "推分支（AGENTS.md：提交后必须推送）" });
  out.push({ cmd: "git", args: ["push", "origin", tag], why: "推新 tag（精确指定该 ref）" });
  return out;
};

/**
 * 计划里**不许出现**的参数（`AGENTS.md`：tag 推送要精确指定；本工具也从不改写历史）。
 * 标定测试会拿一个**含违例**的计划来验「这个检测器抓得到」——抓不到已知违规的检查器等于没有。
 */
export const FORBIDDEN_ARGS = ["--tags", "--force", "-f", "--force-with-lease", "--mirror", "--all"];

/** 计划的**不变量**检查（CLI 自检 + 标定测试共用）。返回空数组 = 通过。 */
export const planViolations = (plan: PlannedCommand[]): string[] => {
  const bad: string[] = [];
  for (const c of plan) {
    if (!c.args.length) { bad.push(c.cmd + " 没有参数"); continue; }
    for (const f of FORBIDDEN_ARGS) {
      if (c.args.includes(f)) bad.push(c.cmd + " " + c.args.join(" ") + " 里出现 " + f + "（应精确指定 ref）");
    }
    // 推 tag 必须点名具体 ref，不许 `git push --tags` / 裸 push。
    if (c.args[0] === "push" && c.args.length < 3 && !c.args.some((a) => a.startsWith(":refs/tags/"))) {
      bad.push(c.cmd + " " + c.args.join(" ") + " 没有点名要推的 ref");
    }
  }
  return bad;
};

/** 取输出末 n 行（日志只回放尾巴，完整输出落盘给复审者）。 */
export const tailLines = (text: string, n: number): string => text.replace(/\r\n?/g, "\n").split("\n").slice(-n).join("\n");
