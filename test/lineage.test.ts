// dsh-shadow —— v1.8.0 Evidence Lineage：parseMemory 派生 lineage/kind + breakdown（纯函数）。
import assert from "node:assert/strict";
import { parseMemory, deriveAtomKind, deriveCreatedBy } from "../dist/core/episode.js";
import { evidenceBreakdownOf } from "../dist/query/observatory.js";

const SAMPLE = `# io/backend/src/main/java/com/openapi/io/dept/DeptMapService.java

> 完整线索
> 背景/材料：io/backend/DeptMapService.java、io/backend/DeptMapRepository.java
> 证据链：来源(动作) · 日期(2026-09-08) · 证据(io/backend/DeptMapService.java)
> 概况：6 动作 · 0 用户消息 · 0 决策
> 来源会话：session-abc
> 项目：OpenAPI-Gateway
> Agent：session-abc
- [11:04:04] [io/backend] 改/读 io/backend/DeptMapService.java
`;

const p = parseMemory(SAMPLE, ".shadow/2026-09-08/2026-09-08--110404-io-backend.md", "2026-09-08--110404-io-backend.md");
assert.ok(p.lineage, "应派生 lineage");
assert.equal(p.lineage.source, "session-abc", "source 来自「> 来源会话」");
assert.equal(p.lineage.evidence.length, 2, "证据 = 材料条数");
assert.equal(p.lineage.evidence[0].type, "file", "AtomEvidenceRef.type=file");
assert.ok(p.lineage.evidence[0].locator.includes("DeptMapService"), "AtomEvidenceRef.locator=路径");
assert.equal(p.lineage.evidence.length, p.materials.length, "evidence 与 materials 一一对应");
assert.equal(p.lineage.createdBy, "tool", "有材料(tool 触达)→tool");
assert.equal(p.kind, "experience", "有材料、无决策→experience");

// EvidenceBreakdown：按 type/kind/createdBy 统计带 evidence 比例
const bd = evidenceBreakdownOf([
  { type: "code", evidence: ["a"], kind: "experience", createdBy: "tool" },
  { type: "decision", evidence: [], kind: "experience", createdBy: "agent" },
  { type: "code", evidence: [], kind: "experience", createdBy: "agent" },
]);
assert.ok(bd.byType.code.total === 2 && bd.byType.code.ev === 1, "type 维度 code 1/2");
assert.ok(bd.byType.decision.total === 1 && bd.byType.decision.ev === 0, "type 维度 decision 0/1");
assert.ok(bd.byKind.experience.total === 3 && bd.byKind.experience.ev === 1, "kind 维度 experience 1/3");
assert.ok(bd.byCreatedBy.tool.total === 1 && bd.byCreatedBy.tool.ev === 1, "createdBy 维度 tool 1/1");
console.log("✔ lineage 派生（source/evidence/createdBy/kind）+ EvidenceBreakdown 三维");

// 边界：无材料决策 → evidence=[]；createdBy 由决策源/user 消息/材料决定
const dec = parseMemory(`# shadow

> 完整线索
> 决策：〔assistant〕采用 e-Builder 的 openApi + OAuth2 认证
> 证据链：来源(agent·决策) · 日期(2026-09-08) · 证据(—)
> 概况：0 动作 · 0 用户消息 · 1 决策
> 来源会话：session-xyz
- [11:02:27] [shadow] 决定 采用 e-Builder 的 openApi + OAuth2 认证
`, ".shadow/2026-09-08/2026-09-08--110227-shadow.md", "2026-09-08--110227-shadow.md");
assert.equal(dec.lineage.evidence.length, 0, "无材料决策→evidence=[]");
assert.equal(dec.lineage.createdBy, "agent", "〔assistant〕→agent");
assert.equal(dec.kind, "experience", "有决策→experience");
// 同回合带材料 + 决策 → evidence 非空（写侧把 fs/observed 材料写进同一原子，读侧派生为 evidence）
const decEv = parseMemory(`# adr/003

> 完整线索
> 背景/材料：adr/003.md、docs/sso-spec.pdf
> 决策：〔user〕采用 RSA 签名方案
> 概况：1 动作 · 0 用户消息 · 1 决策
> 来源会话：session-xyz
- [11:11:11] [adr/003] 改/读 adr/003.md
`, ".shadow/2026-09-08/2026-09-08--111111-decision.md", "2026-09-08--111111-decision.md");
assert.equal(decEv.lineage.evidence.length, 2, "带材料决策→evidence=2");
assert.equal(decEv.lineage.evidence[0].locator, "adr/003.md", "evidence locator=材料路径");
assert.equal(decEv.lineage.createdBy, "user", "〔user〕决策→user");
console.log("✔ lineage 边界：无材料决策 evidence=[] · createdBy 由决策源定 · 带材料决策 evidence 非空");

// 纯函数派生（独立验证 derived helpers）
assert.equal(deriveAtomKind({ entry: "tmp/dnw_todo.md", materials: [], decisions: [], goal: "", userMessages: [] }), "task", "todo 路径→task");
assert.equal(deriveCreatedBy({ decisionEvents: [{ statement: "a", source: "user", reason: "" }], userMessages: [], materials: [] }), "user", "用户拍板→user");

console.log("ALL PASS ✅");
