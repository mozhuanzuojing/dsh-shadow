// dsh-shadow —— tools/clean.ts：删除 `dist/`（= `npm run clean`；A26）。
//
// 为什么要有这个文件而不是内联 `node -e "…"`：本仓口径是「脚本一律 TypeScript、且复审者能重放」
// （`adr/0064`），而内联 `-e` 恰好落在 `npm run audit:scripts` 的盲区 —— 它既不是文件、也不是 TS，
// 却是**每个 build / 发版都会跑**的一条命令（`build` / `build:watch` 都内含它）。
// 判据：`dist/` 是本地/发包产物（不进 git），删它必须能一键重放；`force: true` 让「本来就没有」也不报错。
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
