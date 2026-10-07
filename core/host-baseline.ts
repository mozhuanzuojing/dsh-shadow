// dsh-shadow —— core/host-baseline.ts：**验证基线的运行时派生**（A1）。
//
// 为什么要有这个文件：`index.ts` 是 `audit:complexity` 的**棘轮热点**（行数只能降），而验证基线的
// 「为什么这么写」需要一段长注释 —— 把这两件事放在同一个文件里必然二选一。派生逻辑与它的判据同住
// 这里，`index.ts` 只 `import` 一个常量。
//
// **为什么基线必须在运行时从 `package.json` 派生、而不是写常量**：
//   `index.ts` 原先写的是 `const HOST_BASELINE = "0.2.0-rc.2"; // 与 package.json 的 engines.dsh 同步维护`，
//   而本包 `package.json` 的 description 自述「验证基线见 package.json 的 engines.dsh……此处**不手写版本号**，
//   避免它随抬基线腐烂（v1.21.36 立的写法）」。同一个版本号因此有过 **4 处副本**
//   （`package.json` / `README` 两行 / `CONTEXT` / 这处常量），而 `audit:docs` ⑦ 只守前三处
//   ⇒ **这一处的漂移永远不会有门报警**，偏偏它正是印给用户看的降级横幅文案（`reportHostGap` 的 tail）。
//
// **派生之后不要再给 `audit:docs` ⑦ 加比对面**：那道门存在的理由是「同一事实被写了多处」，
// 现在这里已经没有第二份 —— 读到什么就是什么，比对面本身也会成为一份要维护的副本。
//
// **读不到 ⇒ `"unknown"`**：不伪造一个版本让横幅看起来正常（ADR-0049「缺件不静默」）。
//
// **读法（v1.22.1 实测修）**：不能写死相对层数 —— 本模块在**源码**里是 `core/host-baseline.ts`、
// 在**产物**里是 `dist/core/host-baseline.js`，两者到包根的距离**不同**（`../` 在产物里会落到 `dist/`，
// 那里没有 package.json ⇒ 横幅会印出 `DSH unknown`；这一版起初就是这么错的，被 `test/host-probe` 抓到）。
// ⇒ 从本模块所在目录向上**最多 4 层**找第一个 `package.json`，取到 `engines.dsh` 即停。
// `engines.dsh` 允许 `>=` / `^` / `~` 前缀（当前值 `>=0.2.0-rc.2`）⇒ 只取其中的版本号主体。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const readHostBaseline = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 4; depth++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const m = String(pkg?.engines?.dsh ?? "").match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/);
      if (m) return m[0];
    } catch { /* 这一层没有可读的 package.json：继续向上 */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "unknown";
};

export const HOST_BASELINE: string = readHostBaseline();
