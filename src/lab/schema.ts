/**
 * v2 lab — 51 mode 的输入 schema（唯一契约）。
 *
 * 为什么逐 mode 拆开：v1「read_shadow」把上百个参数并集发给所有 mode；v2 Phase 3 沿用了同一张并集
 * 白名单 ⇒ ① 调用方无法从契约知道某 mode 实际读哪些字段；② v1 已登记的一类缺陷是「builder 读、
 * schema 不声明」的字段被 host 剥掉（validations / visible / hidden / hiddenA/B / distortion /
 * workspace / runId / observerRef / startedAt，见 docs/v1/BACKLOG.md 的「不在工具 schema 里」行）
 * —— builder 只会拿到默认值而不报错，看起来执行了、其实是另一组参数。
 *
 * 本文件按 src/lab/vendor/** 里**实际读取 args?.x 的位置**逐 mode 推导字段：每个 mode 的 source
 * 指向执行器/builder，字段 description 末尾的「读点」指向具体文件，禁止按 mode 名猜语义。
 *
 * 校验在 run.ts 里分两级（顺序是契约的一部分）：
 *   ① 未知字段（本文件 fields 之外的键）→ INVALID_INPUT，并列出**该 mode** 允许字段；
 *   ② 写闸通过后：类型/枚举/必填 → INVALID_INPUT。
 * 不做强转：v1 的 String(args?.x || "") / Number(...) || 默认值 会把对象变成 "[object Object]"、
 * 把显式 0 变成默认值；schema 在进入 builder 之前拒绝，避免「参数被静默改写」。
 *
 * required 只收「缺了 builder 必返回 [X Rejected]…」的字段（每个 mode 的推导理由写在 mode 注释里），
 * 不替 builder 发明语义必填。跨字段约束（simulate 的 basedOn/subject 二者其一、recall-event 的顶层
 * triggerType 与 trigger 二选一、agency-select 的 candidates 与 selectedCandidateId 二者其一）由
 * builder 的 Rejected 文本兜底，并在 note 里写明 —— schema 不假装能表达「或」。
 *
 * permissive：builder 把某字段原样透传给算法、只读其中少量子键、其余子键不校验时，对应 mode 显式标
 * permissive 并说明「额外子字段透传」：只校验容器类型，不对嵌套结构假装严格。顶层字段一律
 * additionalProperties:false（PARITY §5.2），permissive 不豁免未知**顶层**字段。
 */

import type { JsonSchema } from "../contract/schema.js";
import type { LabMode } from "../contract/modes.js";
import { err, ok, type Outcome } from "../contract/outcome.js";

export type LabFieldKind = "string" | "number" | "boolean" | "string_array" | "object_array" | "object";

export interface LabField {
  kind: LabFieldKind;
  /** 语义 + builder 读点；是契约的一部分（调用方从这里知道字段干什么）。 */
  description: string;
  /** 封闭枚举（只对 kind:"string"）：取自 builder 的联合类型/正则白名单，不在值域内即拒绝。 */
  enum?: readonly string[];
  /** 形态约束（只对 kind:"string"）：值会被拼进存储路径/文件名时必须锁定形态（路径安全）。 */
  pattern?: RegExp;
  /** pattern 不满足时给人的可执行提示（进错误文本）。 */
  patternHint?: string;
}

export interface LabModeSchema {
  /** 执行器/builder 来源（vendor 相对路径）——字段从这里的 args?.x 读取点推导，不是按 mode 名猜。 */
  source: string;
  /** 允许的顶层字段；不在表里的键 → INVALID_INPUT（错误里列出这张表）。 */
  fields: Readonly<Record<string, LabField>>;
  /** 缺了 builder 必拒绝的字段（只收无条件必拒的；条件/跨字段约束写在 note）。 */
  required?: readonly string[];
  /** builder 对某字段原样透传（只读少量子键）时的显式声明；见文件头。 */
  permissive?: string;
  /** 其它契约说明（跨字段约束、v1 已知缺口、风险）。 */
  note?: string;
}

const S = (description: string, enumValues?: readonly string[]): LabField =>
  enumValues ? { kind: "string", description, enum: enumValues } : { kind: "string", description };
/** 会被拼进路径/文件名的字符串字段：形态约束是**路径安全**，不是风格偏好。 */
const SP = (description: string, pattern: RegExp, patternHint: string): LabField => ({
  kind: "string",
  description: `${description}（形态约束：${patternHint}）`,
  pattern,
  patternHint,
});
const N = (description: string): LabField => ({ kind: "number", description });
const B = (description: string): LabField => ({ kind: "boolean", description });
const SA = (description: string): LabField => ({ kind: "string_array", description });
const OA = (description: string): LabField => ({ kind: "object_array", description });
const O = (description: string): LabField => ({ kind: "object", description });

/** 51 mode 各一份 schema。Record<LabMode, …> 让漏写/多写 mode 在类型层直接失败。 */
export const LAB_MODE_SCHEMAS: Readonly<Record<LabMode, LabModeSchema>> = {
  // ── Adaptation（3；写）────────────────────────────────────────────────────────────
  "adapt-change": {
    source: "vendor/query/adaptation.ts → vendor/trajectory/adaptation/engine/adaptation.ts",
    fields: {
      target: S(
        "调整对象；封闭集 method/strategy/execution_pattern（Adaptation Scope Boundary，禁 objective/authority/identity/value/preference/goal）。读点：trajectory/adaptation/guard/scope-guard.ts 的 TARGET_SET",
        ["method", "strategy", "execution_pattern"],
      ),
      basedOn: SA("Adaptation→Experience→Observation→Validation 的 lineage 引用；空数组被 builder 拒绝（须非空）。读点：buildAdaptationChange"),
      sourceExperience: S("调整依据来自哪个 Experience（Experience ≠ Knowledge）；空串被 builder 拒绝。读点：buildAdaptationChange"),
      before: S("调整前的行为描述（可空）。读点：buildAdaptationChange"),
      after: S("调整后的行为描述；builder 守卫禁止 better-self／authority／epistemic／objective-change／preference／agency-upgrade 措辞。读点：buildAdaptationChange"),
    },
    required: ["target", "basedOn", "sourceExperience"],
    note: "after 的漂移守卫、target 的 identity 守卫仍在 builder（schema 只锁枚举与类型）。",
  },
  "adapt-context": {
    source: "vendor/query/adaptation.ts → vendor/trajectory/adaptation/engine/adaptation.ts",
    fields: {
      sourceExperience: S("调整依据（为什么允许调整）；空串被 builder 拒绝。读点：buildAdaptationContext"),
      adaptationScope: S(
        "调整域；封闭集 method/strategy/execution_pattern；越界（identity/objective/…）被 builder 拒绝。读点：trajectory/adaptation/guard/scope-guard.ts 的 TARGET_SET",
        ["method", "strategy", "execution_pattern"],
      ),
      validationRefs: SA("支持这次调整的验证引用列表。读点：buildAdaptationContext"),
    },
    required: ["sourceExperience"],
  },
  "adapt-validation": {
    source: "vendor/query/adaptation.ts → vendor/trajectory/adaptation/engine/adaptation.ts",
    fields: {
      changeObserved: B("是否观察到行为策略发生变化（弱语义：变化发生了，不是「变化正确」）。读点：validateAdaptation"),
      validationReferences: SA("支撑「变化发生 + 现实反馈」的引用列表。读点：validateAdaptation"),
      sideEffectsObserved: SA("观察到的副作用列表。读点：validateAdaptation"),
    },
    note: "builder 守卫只拦「change was correct」类措辞，不拒绝空字段。",
  },

  // ── Agency（3；2 写）──────────────────────────────────────────────────────────────
  "agency-context": {
    source: "vendor/query/agency.ts → vendor/stance/agency/engine.ts",
    fields: {
      authoritySource: S(
        "授权来源；封闭集 external/human/system/user/delegated（Agency 不自造目的、不自我授权）。读点：stance/agency/guards.ts 的 isExternalObjectiveSource",
        ["external", "human", "system", "user", "delegated"],
      ),
      objectiveRef: S("外部目标引用；空串或含 observer/self/自身/自主 的自指被 builder 拒绝（Invariant 166）。读点：buildAgencyContext"),
      authorityScope: S("授权范围（what I am allowed）。读点：buildAgencyContext"),
      constraints: SA("不可逾越的约束列表。读点：buildAgencyContext"),
    },
    required: ["authoritySource", "objectiveRef"],
  },
  "agency-event": {
    source: "vendor/query/agency.ts → vendor/stance/agency/engine.ts",
    fields: {
      actionCandidate: S("被执行的候选（Action→Candidate→Plan→Objective→External Authority 的 lineage）。读点：buildAgencyEvent"),
      authorityRef: S("授权引用；须与 identityRef 不同（Authority ≠ Identity）。读点：buildAgencyEvent"),
      objectiveRef: S("外部目标引用；须非空且非自指，否则 lineage 不成立。读点：buildAgencyEvent"),
      constraintCheck: SA("已通过的约束列表。读点：buildAgencyEvent"),
      executionResult: S("执行结果（事件描述）；禁 autonomy/所有权/扩权/身份/内部理由措辞。读点：buildAgencyEvent"),
      identityRef: S("身份引用：仅用于 Authority ≠ Identity 对照；传非空且与 authorityRef 相同会被拒。读点：buildAgencyEvent"),
    },
    required: ["actionCandidate", "authorityRef", "objectiveRef"],
  },
  "agency-select": {
    source: "vendor/query/agency.ts → vendor/stance/agency/engine.ts",
    fields: {
      reason: S("选中理由；只允许 constraint_satisfied（禁 more valuable/meaningful/better/preferred）。读点：pickAgencySelection"),
      candidates: OA("候选对象数组：builder 只读 id/satisfiedConstraints/violatedConstraints。读点：pickAgencySelection"),
      selectedCandidateId: S("显式指定选中的候选 id（与 candidates 二者其一即可）。读点：pickAgencySelection"),
    },
    required: ["reason"],
    permissive: "candidates：builder 只读 id/satisfiedConstraints/violatedConstraints，其余子字段原样透传（不校验）。",
    note: "candidates 为空且 selectedCandidateId 为空时 builder 拒绝「无候选可选中」；该跨字段约束不在 schema 表达。",
  },

  // ── Simulation / Action（4）───────────────────────────────────────────────────────
  candidate: {
    source: "vendor/query/sim-action.ts → vendor/epistemic/action/guard.ts",
    fields: {
      assumptions: SA("假设条件列表（Assume X）；缺省时用 condition 兜底。读点：sim-action.ts 的 mode:candidate"),
      condition: S("当 assumptions 缺省时作为默认假设来源。读点：sim-action.ts 的 mode:candidate"),
      basedOnSimulation: SA("派生自哪些 SimulationOutcome。读点：sim-action.ts 的 mode:candidate"),
      proposedChange: S("提议变更（候选 ≠ 已执行）。读点：sim-action.ts 的 mode:candidate"),
      uncertainty: N("不确定性（弱值量纲；builder 缺省 0.5）。读点：sim-action.ts 的 mode:candidate"),
    },
    note: "builder 守卫只拦 expectedSuccess/confidence 这类「模拟→行动信念」字段，不拒绝空字段。",
  },
  execute: {
    source: "vendor/query/sim-action.ts → vendor/epistemic/action/guard.ts",
    fields: {
      candidateId: S("要执行的候选 id；空 → builder 立即拒绝（SimulationOutcome 不直接执行 Action）。读点：sim-action.ts 的 mode:execute"),
      environmentChange: S("环境变化描述（某个行动发生了，非「我改变了世界」）。读点：sim-action.ts 的 mode:execute"),
      result: S("执行结果；禁 RealityClaim/RealityEvidence/should_exist/is correct 措辞。读点：sim-action.ts 的 mode:execute"),
    },
    required: ["candidateId"],
  },
  feedback: {
    source: "vendor/query/sim-action.ts → vendor/epistemic/action/guard.ts",
    fields: {
      executionId: S("对应的 ActionExecution id。读点：sim-action.ts 的 mode:feedback"),
      observedChanges: SA("观察到的变化列表。读点：sim-action.ts 的 mode:feedback"),
      successIndicator: S("成功指标（观察结果，非「我预测正确」）；相关措辞被 builder 拒绝。读点：feedbackIsNeutral"),
      unexpectedEffects: SA("意外效果列表。读点：sim-action.ts 的 mode:feedback"),
      validationRefs: SA("验证引用列表。读点：sim-action.ts 的 mode:feedback"),
    },
  },
  simulate: {
    source: "vendor/query/sim-action.ts → vendor/epistemic/simulation/engine/simulator.ts",
    fields: {
      condition: S('假设条件；须以 "Assume" 开头，禁 "will cause" 等事实断言（Assumption ≠ Fact）。读点：assertAssumptionAndNotFact'),
      basedOn: SA("派生自哪些 Representation（lineage）；缺省时用 subject 兜底。读点：sim-action.ts 的 mode:simulate"),
      subject: S("basedOn 缺省时的 lineage 来源。读点：sim-action.ts 的 mode:simulate"),
    },
    required: ["condition"],
    note: "basedOn 与 subject 二者其一须非空，否则 SimulationOutcome 无 derivedFrom 被拒（跨字段；schema 不表达）。",
  },

  // ── Continuity / Observer（写 6 + 只读 3）──────────────────────────────────────────
  "continuity-index": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {},
    note: "无 input 字段（只读全局 recall-index/index.json，根由 observerGlobalRoot 决定）；任何字段 → INVALID_INPUT。",
  },
  "observer-boundary": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {
      planningCannotCreateObjective: B("Planning 不得自造 objective（写入 boundary 的恒真声明）。读点：buildObserverBoundary"),
      recallCannotCreateKnowledge: B("Recall 不得生产 Knowledge。读点：buildObserverBoundary"),
      adaptationCannotIncreaseAuthority: B("Adaptation 不得提升 authority。读点：buildObserverBoundary"),
      delegationCannotExpandAuthority: B("Delegation 不得扩张 authority。读点：buildObserverBoundary"),
      agencyCannotCreatePurpose: B("Agency 不得创造 purpose。读点：buildObserverBoundary"),
    },
    note: "builder 对缺失项按 Boolean(undefined)=false 落盘（v1 行为）；schema 不把它们标必填 —— 但 false 等于「边界不成立」，调用方应显式给 true。",
  },
  "observer-config": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {
      interactionStyle: S('交互风格配置；缺省 "default"（configuration ≠ preference model）。读点：buildObserverConfig'),
      outputPreference: S('输出偏好配置；缺省 "adr"。读点：buildObserverConfig'),
      defaultProtocol: S('默认协议；缺省 "boundary-first"。读点：buildObserverConfig'),
    },
    note: "写前经 assertObserverLayerClean + assertConfigNotPreference；禁 goal/objective/knowledge/content/memory/preference/identity/value 类内容。",
  },
  "observer-context": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {},
    note: "无 input 字段（读全局 observer/boundary.json + lineage/continuity.json + recall-index/index.json）；任何字段 → INVALID_INPUT。",
  },
  "observer-lineage": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {
      observerId: S('observer 标识；缺省 "observer"。读点：buildLineage'),
      continuityRef: S("continuity 引用。读点：buildLineage"),
    },
    note: "写前经 assertObserverLayerClean + assertObserverLayerNoWorkspaceFact（禁项目代码知识进 observer 层）。",
  },
  "recall-index": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {
      workspace: S("导航索引指向的工作区。读点：buildRecallIndex"),
      records: OA("导航条目数组；builder 严格校验每项恰为 {id, location} 两个字符串键（Recall Index ≠ Recall Content）。读点：recallIndexIsNav"),
    },
    note: "builder 对空 records/空 workspace 不拒绝；records 的元素形状由 guard 校验（不是透传）。",
  },
  verification: {
    source: "vendor/query/contverify.ts → vendor/epistemic/verification/engine.ts",
    fields: {
      evidenceRefs: SA("运行的观察事件（非空；Verification 须 evidenceRefs）。内容禁 self-optim/权限/身份变化措辞。读点：runVerification"),
      runId: S("运行 id；缺省生成 vr-<id>。读点：runVerification"),
      runtimeVersion: S('runtime 版本号；缺省 "v1.0.2"。读点：runVerification'),
      observerRef: S('被验证的 observer 引用；缺省 "observer"。读点：runVerification'),
      startedAt: S("开始时间（YYYY-MM-DD）；缺省 today()。读点：runVerification"),
    },
    required: ["evidenceRefs"],
    note: "只读只报：输出 VerificationRun + DriftReport；写 .shadow/lab/observer/verification/，失败即 Rejected（不渲染内存对象）。",
  },
  "workspace-context": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {
      workspace: S("要读取的 world 层工作区；缺省当前工作区。读点：contverify.ts 的 mode:workspace-context"),
    },
    note: "只返回 workspace 匹配的记录（World 层按项目隔离）；读不全/坏件会显式披露。",
  },
  "workspace-record": {
    source: "vendor/query/contverify.ts → vendor/trajectory/continuity/engine.ts",
    fields: {
      workspace: S("这条 world 记录属于哪个工作区；空串被 builder 拒绝（禁跨项目/落全局）。读点：buildWorkspaceRecord"),
      kind: SP(
        '记录 kind；决定落盘子目录 .shadow/<kind>/（缺省 "observation"）。读点：buildWorkspaceRecord',
        /^(?!atoms$|indexes$|audit$|soul$|taste$)[a-z][a-z0-9_-]{0,31}$/,
        '小写字母开头，仅 a-z0-9_-；禁路径分隔符/点，禁保留目录（atoms/indexes/audit/soul/taste）',
      ),
      content: S("记录内容（world 层事实；与 observer 层的「无具体内容」边界相反）。读点：buildWorkspaceRecord"),
    },
    required: ["workspace"],
    note: "kind 会被拼进存储路径：schema 锁形态（禁 ../、分隔符、保留目录）；lab fs 门面另有兜底——任何写 .shadow/atoms 的路径一律 WRITE_DENIED。",
  },

  // ── Delegation（3；2 写）──────────────────────────────────────────────────────────
  "delegation-check": {
    source: "vendor/query/delegation.ts → vendor/stance/delegation/engine/delegated-execution.ts",
    fields: {
      delegationId: S("要检查的委派 id；空串/不存在 → builder 返回 Rejected（Delegation Lineage 不可断）。读点：checkDelegation"),
      action: S("拟执行动作；须落在 allowedScope 内。读点：checkDelegation"),
      objectiveRef: S("拟执行目标；与委派目标不一致会被拒（Adaptation ≠ Objective Change）。读点：checkDelegation"),
      now: S("检查时刻（YYYY-MM-DD）；缺省 today()，用于过期/撤销判定。读点：checkDelegation"),
      satisfiedConstraints: SA("调用方声明的「已满足约束」；未满足的委派约束会拒绝执行。读点：checkDelegation"),
    },
    required: ["delegationId"],
    note: 'action 为空串时 builder 的 scope 匹配退化为 includes("") ⇒ 恒真；这是 v1 既有语义，本轮不改（见报告遗留风险）。',
  },
  "delegation-context": {
    source: "vendor/query/delegation.ts → vendor/stance/delegation/engine/delegated-execution.ts",
    fields: {
      delegationId: S("委派 id；缺省生成 dlg-<ts>-<rand>。读点：buildDelegationContext"),
      authoritySource: S(
        "授权来源；封闭集 external/human/system/user/delegated，禁 observer/self。读点：delegated-execution.ts 的 AUTHORITY_SOURCE",
        ["external", "human", "system", "user", "delegated"],
      ),
      objectiveRef: S("外部目标引用；空串或自指被 builder 拒绝。读点：buildDelegationContext"),
      allowedScope: SA("被允许做什么（如 update_service_config）；禁所有权措辞。读点：buildDelegationContext"),
      constraints: SA("不可逾越的约束；禁所有权措辞。读点：buildDelegationContext"),
      expiration: S("过期日（YYYY-MM-DD）；空 = 无限期。读点：buildDelegationContext"),
      revocation: B("撤销信号（优先于执行历史）。读点：buildDelegationContext"),
    },
    required: ["authoritySource", "objectiveRef"],
  },
  "delegation-event": {
    source: "vendor/query/delegation.ts → vendor/stance/delegation/engine/delegated-execution.ts",
    fields: {
      delegationId: S("对应委派 id；空串/不存在 → builder 返回 Rejected。读点：recordDelegationEvent"),
      candidateAction: S("被委派执行的动作；须在 allowedScope 内。读点：recordDelegationEvent"),
      executionResult: S("执行结果；禁所有权/身份声称/权限升级/长期运行→更多权威措辞。读点：recordDelegationEvent"),
      objectiveRef: S("执行目标；与委派目标不一致会被拒。读点：recordDelegationEvent"),
      satisfiedConstraints: SA("调用方声明的「已满足约束」；未满足则拒绝记录。读点：recordDelegationEvent"),
    },
    required: ["delegationId"],
  },

  // ── Federation（7；1 写）──────────────────────────────────────────────────────────
  distortion: {
    source: "vendor/query/federation.ts → vendor/epistemic/federation/guard.ts",
    fields: {
      sourceObserverId: S('Observer A 的 id；缺省 "A"。读点：compareProjections'),
      targetObserverId: S('Observer B 的 id；缺省 "B"。读点：compareProjections'),
      visibleA: SA("A 的可见条目。读点：compareProjections"),
      hiddenA: SA("A 的隐藏条目（v1 schema 未声明、builder 直读；见 docs/v1/BACKLOG 的「不在工具 schema 里」行）。读点：compareProjections"),
      visibleB: SA("B 的可见条目。读点：compareProjections"),
      hiddenB: SA("B 的隐藏条目（同上，v1 schema 未声明）。读点：compareProjections"),
    },
    note: "Agreement ≠ 找一致：输出的是 distortion（谁看到了什么/漏了什么），无 winner。",
  },
  federation: {
    source: "vendor/query/federation.ts → vendor/epistemic/federation/contract.ts",
    fields: {
      sourceObserverId: S('观察者 id；缺省 agent.id 或 "unknown"。读点：packetOf'),
      obsClaim: S("ObservationClaim：该观察者此刻看到什么（Federation 只交换投影，不交换 Identity/Memory/Dream）。读点：packetOf"),
      lens: S("投影透镜标签。读点：packetOf"),
      visible: SA("投影可见条目；v1 schema 未声明、builder 直读（见 docs/v1/BACKLOG）。读点：packetOf"),
      hidden: SA("投影隐藏条目；同上（v1 schema 未声明）。读点：packetOf"),
      distortion: SA("投影失真条目；同上（v1 schema 未声明）。读点：packetOf"),
    },
    note: "builder 总会把 boundary 三字段置 true（identity/memory/dream excluded）；本题材只交换 ObservationClaim。",
  },
  "federation-diff": {
    source: "vendor/query/federation.ts → vendor/epistemic/federation/difference.ts",
    fields: {
      sourceObserverId: S('Observer A 的 id；缺省 "A"。读点：differenceOf 前的 perspectiveOf'),
      targetObserverId: S('Observer B 的 id；缺省 "B"。读点：perspectiveOf'),
      obsClaim: S('A 的 ObservationClaim；缺省 "claim-A"。读点：perspectiveOf'),
      obsClaimB: S('B 的 ObservationClaim；缺省 "claim-B"。读点：perspectiveOf'),
      lensA: S("A 的投影透镜。读点：perspectiveOf"),
      lensB: S("B 的投影透镜。读点：perspectiveOf"),
      visibleA: SA("A 的可见条目。读点：perspectiveOf"),
      hiddenA: SA("A 的隐藏条目（v1 schema 未声明、builder 直读）。读点：perspectiveOf"),
      visibleB: SA("B 的可见条目。读点：perspectiveOf"),
      hiddenB: SA("B 的隐藏条目（同上，v1 schema 未声明）。读点：perspectiveOf"),
      realEvidenceRef: S("用于对照的现实证据引用。读点：differenceOf"),
    },
    note: "输出 difference/blindSpot/unresolvedQuestion，不是 winner。",
  },
  "federation-perspective": {
    source: "vendor/query/federation.ts → vendor/epistemic/federation/perspective.ts",
    fields: {
      sourceObserverId: S('观察者 id；缺省 agent.id 或 "unknown"。读点：perspectiveOf'),
      temporalReference: S("观察发生的时间参照（「某时间某观察位置」）。读点：perspectiveOf"),
      obsClaim: S("ObservationClaim 文本。读点：perspectiveOf"),
      lens: S("投影透镜标签。读点：perspectiveOf"),
      visible: SA("投影可见条目。读点：perspectiveOf"),
      hidden: SA("投影隐藏条目（v1 schema 未声明、builder 直读）。读点：perspectiveOf"),
      obsConfidence: N("观察确信（缺省 0.5；显式 0 保留为 0，不经 || 改写）。读点：confidenceOfInput"),
      valConfidence: N("验证确信（拆分：看到确信 ≠ 解释确信）。读点：confidenceOfInput"),
    },
  },
  "real-evidence": {
    source: "vendor/query/federation.ts → vendor/epistemic/federation/reality.ts",
    fields: {
      observedAt: S("观察日期（YYYY-MM-DD）；缺省 today()。读点：registerRealityEvidence"),
      sourceObserverId: S('来源 observer；缺省 "unknown"。读点：registerRealityEvidence'),
      observation: S("弱事实文本（只记录「某事件在某时间被观察到」，不解释规律）。读点：registerRealityEvidence"),
      linkedHypothesis: SA("关联 hypothesis 列表。读点：registerRealityEvidence"),
    },
    note: "Append-only 弱事实；builder 不拒绝空 observation（会写出空观测）。",
  },
  "real-refer": {
    source: "vendor/query/federation.ts → vendor/epistemic/federation/reality.ts",
    fields: {
      realityId: S("要引用的 RealityEvidence id；不存在/坏件在输出里显式区分。读点：referenceEvidence"),
      sourceObserverId: S('引用者 observer id；缺省 "unknown"。读点：referenceEvidence'),
    },
    note: "只追加 referencedBy，不改 observation/observedAt（弱事实不可篡改）。",
  },
  stability: {
    source: "vendor/query/federation.ts → vendor/epistemic/federation/stability.ts",
    fields: {
      realityId: S("要跟踪稳定性的 RealityEvidence id。读点：federation.ts 的 mode:stability"),
      hasValidation: B("该证据是否已有未来验证（决定 corroborated→validated）。读点：perspectiveStateOf"),
    },
    note: "shared(==corroborated) != true；只有 shared evidence + 未来验证才进 validated。",
  },

  // ── Horizon / Reflection / Identity / Index / Model / World / Recall 的其余 mode ───
  "horizon-context": {
    source: "vendor/query/horizon.ts → vendor/trajectory/long-horizon/engine/interaction.ts",
    fields: {
      basedOnHistory: SA("当前长期交互基于哪些历史（HistoryRef）；空数组被 builder 拒绝。读点：buildInteractionContext"),
      from: S("历史窗口起点（YYYY-MM-DD）。读点：buildInteractionContext"),
      to: S("历史窗口终点；缺省 today()。读点：buildInteractionContext"),
      recallRefs: SA("Recall Continuity 引用列表。读点：buildInteractionContext"),
      adaptationRefs: SA("Adaptation 引用列表。读点：buildInteractionContext"),
    },
    required: ["basedOnHistory"],
  },
  "horizon-event": {
    source: "vendor/query/horizon.ts → vendor/trajectory/long-horizon/engine/interaction.ts",
    fields: {
      historyRef: S("历史引用（continuity 可追溯）；空串被 builder 拒绝。读点：buildContinuityEvent"),
      result: S("连续性事件的结果描述；禁 authority/confidence/preference/identity/objective 漂移措辞。读点：buildContinuityEvent"),
      previousAccessibility: S('变更前访问状态；缺省 "forgotten"。读点：buildContinuityEvent'),
      currentAccessibility: S('变更后访问状态；缺省 "available"。读点：buildContinuityEvent'),
      recallRef: S("关联的 Recall 引用（可选）。读点：buildContinuityEvent"),
      adaptationRef: S("关联的 Adaptation 引用（可选）。读点：buildContinuityEvent"),
    },
    required: ["historyRef"],
  },
  "horizon-link": {
    source: "vendor/query/horizon.ts → vendor/trajectory/long-horizon/engine/interaction.ts",
    fields: {
      historyRef: S("History 引用；空串被 builder 拒绝。读点：buildInteractionAdaptationLink"),
      recallRef: S("Recall 引用；空串被 builder 拒绝。读点：buildInteractionAdaptationLink"),
      adaptationRef: S("Adaptation 引用；空串被 builder 拒绝。读点：buildInteractionAdaptationLink"),
      identityRef: S("身份引用：History→Identity 禁，传非空即被 builder 拒绝。读点：buildInteractionAdaptationLink"),
      result: S("链路结果描述；禁 authority/confidence/preference/identity/objective 漂移措辞。读点：buildInteractionAdaptationLink"),
    },
    required: ["historyRef", "recallRef", "adaptationRef"],
  },
  "horizon-summary": {
    source: "vendor/query/horizon.ts → vendor/trajectory/long-horizon/engine/interaction.ts",
    fields: {
      sourceRefs: SA("摘要压缩自哪些 ObservationRef；空数组被 builder 拒绝（摘要是访问辅助，不是新事实源）。读点：buildHistorySummary"),
      compressionMethod: S("压缩方法；空串被 builder 拒绝。读点：buildHistorySummary"),
      accessibility: S(
        "压缩时的访问状态；封闭集 available/forgotten/recalled（非法值 v1 会静默回落 available，这里显式拒绝）。读点：accessibilityOf",
        ["available", "forgotten", "recalled"],
      ),
    },
    required: ["sourceRefs", "compressionMethod"],
  },
  "identity-advance": {
    source: "vendor/query/observer-kernel.ts → vendor/selfhood/identity/evaluator.ts",
    fields: {
      minCount: N("触发闸门的最小样本数（≥1；缺省 5）。读点：advanceIdentity 的 opts"),
      minRecency: N("最小近因分（缺省 0.4）。读点：advanceIdentity 的 opts"),
      maxContradiction: N("允许的最大矛盾度（缺省 0.3）。读点：advanceIdentity 的 opts"),
      halfLifeDays: N("近因半衰期天数（≥1；缺省 90）。读点：advanceIdentity 的 opts"),
    },
  },
  index: {
    source: "vendor/query/index-budget.ts",
    fields: {
      max_tokens: N("诊断预算（token）；run.ts 夹到 256–8000 再 ×4 换算字符预算。读点：run.ts 的 dispatch"),
    },
    note: "index 是只读诊断；重建走 ops 命令，不是本 mode 的写面。",
  },
  model: {
    source: "vendor/query/reality-model.ts → vendor/epistemic/reality/claim/persist.ts",
    fields: {
      subject: S("按 subject 过滤 RealityClaim。读点：reality-model.ts 的 mode:model"),
      claimId: S("按 claim id 精确取用。读点：reality-model.ts 的 mode:model"),
    },
  },
  "model-claim": {
    source: "vendor/query/reality-model.ts → vendor/epistemic/reality/claim/engine.ts",
    fields: {
      subject: S("按 subject 读取 RealityObservation（无 subject 则读全部）。读点：readObservationsDetailed"),
      validations: OA("验证历史对象数组：builder 只读 id/outcome，outcome 含 validated 才可能把 claim 推进 supported。读点：claimOf"),
    },
    permissive:
      "validations：builder 只读 id/outcome，其余子字段原样透传（不校验）。⚠ 这是 v1 已登记缺口：outcome 由调用方给、不与 .shadow/validation 历史交叉核对 ⇒ 可声明 validated 造出 supported claim（docs/v1/BACKLOG「supported 由调用方参数决定」）；本任务只恢复字段可达性，不修语义。",
    note: "没有任何 RealityObservation 时 builder 输出「无 RealityObservation」而不写 claim；predicate 非 observable 时输出 [Rejected]。",
  },
  "model-observation": {
    source: "vendor/query/reality-model.ts → vendor/epistemic/reality/observation.ts",
    fields: {
      observedAt: S("观察日期（YYYY-MM-DD）；缺省 today()。读点：observationOf"),
      subject: S("被观察对象引用（subjectRef）。读点：observationOf"),
      sourcePerspectives: SA("指向同一事件的观察者视角列表；缺省时用 [sourceObserverId] 兜底。读点：reality-model.ts 的 mode:model-observation"),
      sourceObserverId: S("sourcePerspectives 缺省时的唯一视角来源。读点：reality-model.ts 的 mode:model-observation"),
      observation: S("弱事实文本（多个 Observer 指向同一事件，非世界事实）。读点：observationOf"),
      temporalContext: S("时间上下文；缺省 observedAt/today()。读点：observationOf"),
      validationRefs: SA("验证引用列表。读点：observationOf"),
    },
  },
  offline: {
    source: "vendor/query/observer-kernel.ts → vendor/selfhood/dream/sleep.ts",
    fields: {
      from: S("SleepWindow 起点（YYYY-MM-DD）。读点：buildSleepWindow"),
      to: S("SleepWindow 终点；缺省 today()。读点：buildSleepWindow"),
      trigger: S(
        "睡眠触发类型；封闭集 scheduled/resource_idle/manual（缺省 scheduled）。读点：selfhood/dream/types.ts 的 DreamTrigger",
        ["scheduled", "resource_idle", "manual"],
      ),
    },
    note: "压缩窗口恒排除当前会话与外部输入（防观察污染）；写入失败会走 unwrittenWarn 同段披露。",
  },
  plan: {
    source: "vendor/query/planning.ts → vendor/stance/planning/guard.ts",
    fields: {
      objective: S("外部目标描述；空串或含 observer/generateObjective 自生成语义被 builder 拒绝（Planning 不自造目标）。读点：planning.ts 的 mode:plan"),
      objectiveSource: S('目标来源；传 "observer" 明确被拒（objective 只能外部）。读点：planning.ts 的 mode:plan'),
      criteria: S("比较标准；禁 better/optimal/best/preferred（criteria ≠ value）。读点：assertCriteriaNotValue"),
      constraints: SA("外部约束列表。读点：planning.ts 的 mode:plan"),
      candidates: OA("候选对象数组：builder 只读 basedOnSimulation/actionSequence/assumptions/constraints/satisfiedConstraints/violatedConstraints/uncertainty。读点：planning.ts 的 mode:plan"),
      simulationRefs: SA("SimulationOutcome 引用列表。读点：planning.ts 的 mode:plan"),
    },
    required: ["objective"],
    permissive:
      "candidates：builder 只读上述 7 个子键，其余子字段原样透传（不校验；渲染器只报读到的值）。",
    note: "输出是 constrained comparison（无 score/winner）；candidate 的 score/optimal 会被 builder 拒绝。",
  },
  "recall-event": {
    source: "vendor/query/recall.ts → vendor/trajectory/recall/engine/recall-continuity.ts",
    fields: {
      recalledRef: S("被忆起的 ForgottenRecord 引用；无对应记录 → builder 拒绝（Recall 须引用已遗忘记录，即非新观察）。读点：buildRecallEvent"),
      triggerType: S("外部触发类型（须含 external/conversation/explicit/association/cue/request；禁 internal/certainty/intuition）。读点：buildRecallEvent + recall-guard.ts"),
      trigger: O("v1 嵌套形态 {type, sourceRef}；顶层 triggerType/sourceRef 缺省时从这里取。读点：buildRecallEvent"),
      sourceRef: S("外部线索来源；Recall Lineage 要求非空。读点：buildRecallEvent"),
      accessibilityBefore: S(
        "忆起前访问状态；封闭集 accessible/forgotten/latent（非法值 v1 会静默回落 forgotten，这里显式拒绝）。读点：recall-continuity.ts 的 BEFORE",
        ["accessible", "forgotten", "latent"],
      ),
      accessibilityAfter: S(
        "忆起后访问状态；封闭集 accessible/recalled（非法值 v1 会静默回落 recalled，这里显式拒绝）。读点：recall-continuity.ts 的 AFTER",
        ["accessible", "recalled"],
      ),
      originalRecord: S("原记录引用；缺省用 ForgottenRecord.originalRef。读点：buildRecallEvent"),
      observationRefs: SA("关联 observation 引用列表。读点：buildRecallEvent"),
      validationRefs: SA("原验证链引用；缺省继承 ForgottenRecord.validationRefs。读点：buildRecallEvent"),
      status: S("epistemic status 声明；仅用于「忆起不提升证据等级」守卫（禁 supported/validated/stable/high confidence）。读点：assertRecallNoStatusIncrease"),
      epistemicStatus: S("status 的 v1 别名（同上，仅参与守卫）。读点：buildRecallEvent"),
      support: S("status 的另一个 v1 别名（同上）。读点：buildRecallEvent"),
    },
    required: ["recalledRef"],
    permissive: "trigger：builder 只读 type/sourceRef，其余子字段原样透传（但会进 Confabulation 守卫的 JSON 扫描）。",
    note: "triggerType/sourceRef 可由顶层字段或 trigger.{type,sourceRef} 提供；两者都缺时 builder 返回 Rejected（跨字段「或」，schema 不表达）；recalledRef 无条件必填。",
  },
  "recall-forget": {
    source: "vendor/query/recall.ts → vendor/trajectory/recall/engine/recall-continuity.ts",
    fields: {
      originalRef: S("遗忘的是哪个原记录；空串被 builder 拒绝。读点：buildForgottenRecord"),
      reason: S("为什么遗忘；空串被 builder 拒绝。禁 deleted/invalid/已删除/失效（Forget ≠ Delete）。读点：buildForgottenRecord"),
      id: S("记录 id；缺省生成 fr-<ts>-<rand>。读点：buildForgottenRecord"),
      forgottenAt: S("遗忘日期；缺省 today()。读点：buildForgottenRecord"),
      lastAccessibleAt: S("最后一次可访问日期；缺省 today()。读点：buildForgottenRecord"),
      validationRefs: SA("原验证链引用（遗忘不抹除）。读点：buildForgottenRecord"),
    },
    required: ["originalRef", "reason"],
  },
  "recall-validation": {
    source: "vendor/query/recall.ts → vendor/trajectory/recall/engine/recall-continuity.ts",
    fields: {
      recalledRef: S("要验证的 ForgottenRecord 引用；无对应记录 → builder 拒绝（无 lineage）。读点：validateRecall"),
      sourceRef: S("本次验证的外部来源引用。读点：validateRecall"),
    },
    required: ["recalledRef"],
    note: "Recall ≠ 重新证明：输出恒 mapsExistingLineage/createsNewClaim=false/epistemicStatusUnchanged=true。",
  },
  reflection: {
    source: "vendor/query/observer-kernel.ts → vendor/reflection/engine.ts",
    fields: {
      from: S("反思周期起点（YYYY-MM-DD）。读点：observer-kernel.ts 的 mode:reflection"),
      to: S("反思周期终点；缺省 today()。读点：observer-kernel.ts 的 mode:reflection"),
    },
  },
  temporal: {
    source: "vendor/query/observer-kernel.ts → vendor/selfhood/temporal/builder.ts",
    fields: {
      from: S("图构建窗口起点（YYYY-MM-DD）。读点：buildTemporalGraph 的 range"),
      to: S("图构建窗口终点。读点：buildTemporalGraph 的 range"),
      at: S("replay 时刻（YYYY-MM-DD）；nearest node ≤ at。读点：queryTemporal"),
      perceptionOnly: B("只渲染单节点感知快照（优先于 at/from+to 分支）。读点：observer-kernel.ts 的 mode:temporal"),
      identityContext: B("只渲染单节点身份上下文（优先级最高）。读点：observer-kernel.ts 的 mode:temporal"),
    },
    note: "多个查询字段同时给时，builder 按固定优先级取一个分支：identityContext > perceptionOnly > at > (from+to)。",
  },
  timeline: {
    source: "vendor/query/validation.ts → vendor/epistemic/validation/history.ts",
    fields: {
      hypothesisId: S("按 hypothesis 读 append-only 验证时间线；坏件会显式报出（不渲染成 events 0）。读点：readTimelineDetailed"),
    },
  },
  validate: {
    source: "vendor/query/validation.ts → vendor/epistemic/validation/validate.ts",
    fields: {
      hypothesisId: S("要验证的 hypothesis id；不存在时提示「请先 mode:offline 生成假设」，坏件/读失败单独报。读点：readHypothesis"),
    },
  },
  evidence: {
    source: "vendor/query/validation.ts → vendor/epistemic/validation/evidence.ts",
    fields: {
      hypothesisId: S("这条 FutureEvidence 属于哪个 hypothesis。读点：registerFutureEvidence"),
      observedAt: S("观察到该结果的日期（YYYY-MM-DD）；缺省 today()。读点：registerFutureEvidence"),
      actualOutcome: S("实际结果（现实反馈，不是预测）。读点：registerFutureEvidence"),
      observationType: S('观察类型标签；缺省 "observation"。读点：registerFutureEvidence'),
    },
    note: "builder 不拒绝空 hypothesisId/actualOutcome（v1 行为）：空归属会写出无主证据 —— schema 不替它加语义必填（没有 builder 拒绝点），调用方自行保证。",
  },
  world: {
    source: "vendor/query/world.ts → vendor/epistemic/world/*",
    fields: {
      subject: S("按 subject 过滤 RealityClaim → 表示图/lineage。读点：world.ts 的 mode:world"),
    },
    note: "图是派生索引（可重建）；坏件时本次不覆盖落盘图。",
  },
  "world-relation": {
    source: "vendor/query/world.ts → vendor/epistemic/world/guard/relation-guard.ts",
    fields: {
      from: S("关系起点。读点：relationHypothesisOf"),
      to: S("关系终点。读点：relationHypothesisOf"),
      relation: S("关系谓词（自由文本；须保留 Relation≠Causality 语义）。读点：relationHypothesisOf"),
      evidence: SA("支持该关系假设的证据引用列表。读点：relationHypothesisOf"),
    },
    note: '输出恒 status:"hypothesis"；禁 fact/reality/confirmed_causal/truth。',
  },
  "world-represent": {
    source: "vendor/query/world.ts → vendor/epistemic/world/guard/claim-admission.ts",
    fields: {
      subject: S("按 subject 过滤 RealityClaim；仅 supported 可进 Representation。读点：world.ts 的 mode:world-represent"),
    },
  },
};

/** 该 mode 允许的顶层字段（排序后）。 */
export const labAllowedFields = (mode: LabMode): readonly string[] =>
  Object.keys(LAB_MODE_SCHEMAS[mode].fields).sort();

/** 不在该 mode 允许集里的顶层字段（run.ts 在写闸之前调用）。 */
export const labUnknownFields = (mode: LabMode, input: Record<string, unknown>): string[] =>
  Object.keys(input).filter((k) => !(k in LAB_MODE_SCHEMAS[mode].fields)).sort();

/** 全部 mode 允许字段的并集（派生自逐 mode schema，供文档/诊断展示；不参与校验）。 */
export const LAB_INPUT_FIELD_UNION: readonly string[] = [
  ...new Set(Object.values(LAB_MODE_SCHEMAS).flatMap((s) => Object.keys(s.fields))),
].sort();

const KIND_LABEL: Record<LabFieldKind, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  string_array: "string[]",
  object_array: "object[]",
  object: "object",
};

const typeOfValue = (v: unknown): string => {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v;
};

const matchesKind = (kind: LabFieldKind, v: unknown): boolean => {
  switch (kind) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "boolean":
      return typeof v === "boolean";
    case "string_array":
      return Array.isArray(v) && v.every((x) => typeof x === "string");
    case "object_array":
      return Array.isArray(v) && v.every((x) => typeof x === "object" && x !== null && !Array.isArray(x));
    case "object":
      return typeof v === "object" && v !== null && !Array.isArray(v);
  }
};

const allowedText = (mode: LabMode): string => {
  const names = labAllowedFields(mode);
  return names.length ? names.join(", ") : "（无）";
};

const requiredEmpty = (kind: LabFieldKind, v: unknown): boolean =>
  (kind === "string" && v === "") ||
  ((kind === "string_array" || kind === "object_array") && Array.isArray(v) && v.length === 0);

/**
 * 类型/枚举/必填校验（run.ts 在写闸之后调用）。
 *
 * 顺序：① 先逐字段查「已提供值的类型」（{evidenceRefs:"x"} 报类型不符，而不是「缺必填」）；
 * ② 再查必填（缺失或空串/空数组 —— 必填字段给了空值视为没给，报「缺必填」）；
 * ③ 最后查封闭枚举（只在值真的给了且非空时才有意义）。
 * 不做任何强转/裁剪：字符串不 trim、数字不夹取，那属于 builder 的语义层
 * （例如 max_tokens 的 256–8000 夹取在 run.ts，不在 schema）。
 */
export const validateLabInput = (mode: LabMode, input: Record<string, unknown>): Outcome<Record<string, unknown>> => {
  const schema = LAB_MODE_SCHEMAS[mode];
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (!(field in input)) continue;
    const value = input[field];
    if (!matchesKind(spec.kind, value)) {
      return err(
        "INVALID_INPUT",
        'mode "' + mode + '" 字段 "' + field + '" 类型应为 ' + KIND_LABEL[spec.kind] + "（实际 " + typeOfValue(value) + "）；允许字段：" + allowedText(mode),
        { mode, field, expected: KIND_LABEL[spec.kind], actual: typeOfValue(value) },
      );
    }
  }
  const missing = (schema.required ?? []).filter((field) => {
    if (!(field in input)) return true;
    const spec = schema.fields[field];
    return spec ? requiredEmpty(spec.kind, input[field]) : false;
  });
  if (missing.length) {
    return err(
      "INVALID_INPUT",
      'mode "' + mode + '" 缺必填字段：' + missing.join(", ") + "；允许字段：" + allowedText(mode),
      { mode, missing },
    );
  }
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (!spec.pattern || !(field in input)) continue;
    const value = input[field];
    if (typeof value === "string" && value !== "" && !spec.pattern.test(value)) {
      return err(
        "INVALID_INPUT",
        'mode "' + mode + '" 字段 "' + field + '" 形态不合法：' + (spec.patternHint ?? spec.pattern.source) + "（实际 " + JSON.stringify(value) + "）",
        { mode, field, pattern: spec.pattern.source, actual: value },
      );
    }
  }
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (!spec.enum || !(field in input)) continue;
    const value = input[field];
    if (!spec.enum.includes(value as string)) {
      return err(
        "INVALID_INPUT",
        'mode "' + mode + '" 字段 "' + field + '" 只接受 ' + spec.enum.join(" / ") + "（实际 " + JSON.stringify(value) + "）；允许字段：" + allowedText(mode),
        { mode, field, allowed: spec.enum, actual: value },
      );
    }
  }
  return ok(input);
};

const fieldJsonSchema = (field: LabField): JsonSchema => {
  switch (field.kind) {
    case "string":
      if (field.enum) return { type: "string", description: field.description, enum: [...field.enum] };
      if (field.pattern) return { type: "string", description: field.description, pattern: field.pattern.source };
      return { type: "string", description: field.description };
    case "number":
      return { type: "number", description: field.description };
    case "boolean":
      return { type: "boolean", description: field.description };
    case "string_array":
      return { type: "array", description: field.description, items: { type: "string" } };
    case "object_array":
      return { type: "array", description: field.description, items: { type: "object" } };
    case "object":
      return { type: "object", description: field.description };
  }
};

/**
 * 该 mode 的输入 JSON Schema（additionalProperties:false + required）。
 *
 * 运行时校验由 validateLabInput 直接读 LAB_MODE_SCHEMAS，本函数只为契约展示/文档生成服务
 * （ADR-0006：schema 是生成的，不手写第二份）。
 */
export const labInputJsonSchema = (mode: LabMode): JsonSchema => ({
  type: "object",
  description: 'mode "' + mode + '" 的 input 字段；未知字段 → INVALID_INPUT。',
  properties: Object.fromEntries(Object.entries(LAB_MODE_SCHEMAS[mode].fields).map(([k, f]) => [k, fieldJsonSchema(f)])),
  required: [...(LAB_MODE_SCHEMAS[mode].required ?? [])],
  additionalProperties: false,
});
