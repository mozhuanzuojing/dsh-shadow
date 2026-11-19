import assert from "node:assert/strict";
import { routingProvider, ROUTING_SKILL_NAME } from "../../dist/surface/skill-routing.js";

const list = (await routingProvider.list()) as any[];
assert.equal(list.length, 1, "bundled provider 应只提供一个 skill");
const c = list[0];
assert.equal(c.name, "dsh-shadow-routing", "skill 名应为 dsh-shadow-routing");
assert.equal(c.source, "bundled", "source 应为 bundled");
assert.equal(c.rank, 600, "应为 bundled rank 600");
assert.equal(ROUTING_SKILL_NAME, "dsh-shadow-routing");

const def = await routingProvider.get();
assert.equal(def.name, "dsh-shadow-routing");
assert.equal(typeof def.content, "string");
assert.ok((def.content as string).includes("路由"), "skill 正文应含『路由』");
assert.ok((def.content as string).includes("首轮必空"), "正文应含关键坑『首轮必空』");
assert.ok((def.resourceBase as any).path.includes("dsh-shadow-routing"), "resourceBase 指向包内 skill 目录");

console.log("✔ skill-routing：bundled provider 提供 dsh-shadow-routing（rank600/bundled，正文可读，包内路径正确）");
