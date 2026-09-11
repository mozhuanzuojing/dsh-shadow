// 检测 B 需要的**第二个夹具文件**：与 `drift-fixture.ts` 共享 `phase === "ghost"`,
// 但另有一个只在本文出现的 `only2 === "elsewhere"`（反向断言：跨文件才报）。
export const gateThere = (p: any) => p?.phase === "ghost";   // MARK:B-SHARED
export const onlyLocal2 = (p: any) => p?.only2 === "elsewhere";
