// dsh-shadow —— tools/clean.ts：删除 `dist/`（= `npm run clean`；A26）。
//
// 为什么要有这个文件而不是内联 `node -e "…"`：本仓口径是「脚本一律 TypeScript、且复审者能重放」
// （`adr/0064`），而内联 `-e` 恰好落在 `npm run audit:scripts` 的盲区 —— 它既不是文件、也不是 TS，
// 却是**每个 build / 发版都会跑**的一条命令（`build` / `build:watch` 都内含它）。
// 判据：`dist/` 是本地/发包产物（不进 git），删它必须能一键重放；`force: true` 让「本来就没有」也不报错。
//
// ⚠ **路径必须相对本文件解析，不能写 `rmSync("dist")`**（v1.22.2 修）：原实现用**相对路径** ⇒ 从别的
// 工作目录调用（`node dsh-shadow/tools/clean.ts`、CI 里 `cd` 到别处、或 `--prefix` 方式跑 npm）时，
// 它删的是**调用方 CWD 下的** `dist/` —— 要么什么都没删（构建接着把旧产物留在原地，正是 `adr/0056`
// 那条「幽灵产物」的成因），要么**删错目录**。判据与本仓「写死的路径会随换盘静默变死」同源：
// 路径要么由调用方显式给，要么由**自己所在的位置**推出来。
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(REPO_ROOT, "dist"), { recursive: true, force: true });
