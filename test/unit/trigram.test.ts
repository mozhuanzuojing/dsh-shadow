import assert from "node:assert/strict";
import { trigramsOf, termTrigrams, queryTerms } from "../../dist/domain/trigram.js";

assert.deepEqual(trigramsOf("abcd"), ["abc", "bcd"]);
assert.deepEqual(trigramsOf("ab"), []);
assert.deepEqual(termTrigrams("ABCabc"), ["abc", "bca", "cab"]);
assert.deepEqual(queryTerms("createSession Foo x 插件"), ["createsession", "foo"]);
assert.equal(trigramsOf("中文检索").length, 2);

console.log("✔ trigram：窗口/去重/query 切词");
