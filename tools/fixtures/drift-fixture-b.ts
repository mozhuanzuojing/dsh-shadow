// 检测 B 需要的**第二个夹具文件**：与 `drift-fixture.ts` 共享 `phase === "ghost"`,
// 但另有一个只在本文出现的 `only2 === "elsewhere"`（反向断言：跨文件才报）。
export const gateThere = (p: any) => p?.phase === "ghost";   // MARK:B-SHARED
export const onlyLocal2 = (p: any) => p?.only2 === "elsewhere";

// 与 `drift-fixture.ts` 的 `joinViaOptional` 配对：一侧用 `?.`、一侧用 `.`，
// 二者是**同一条访问路径** ⇒ 必须归到同一个键 `x.flag=join`（旧正则会漏，见对侧注释）。
export const joinViaPlain = (x: any) => x.flag === "join";   // MARK:B-OPT
