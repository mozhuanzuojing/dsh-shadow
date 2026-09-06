// dsh-shadow —— action/types.ts：v0.33 Action Boundary Kernel 类型。
// Action 是"经过约束、授权、反馈闭环的现实交互提议"，不是 Simulation 的执行结果。ActionExecution 是事件（非 RealityClaim）。
export interface ActionCandidate {
  id: string;
  basedOnSimulation: string[];   // SimulationOutcome ids
  assumedConditions: string[];   // "Assume X"
  proposedChange: string;
  uncertainty: number;
  // 禁 expectedSuccess/confidence（会偷偷把 Simulation Outcome 升级成行动信念）
}

export interface ActionExecution {
  id: string;
  candidateId: string;
  executedAt: string;
  environmentChange: string;     // 某个行动发生了（不是"我改变了世界"）
  result: string;                // 事件，非 RealityClaim
}

export interface ActionFeedback {
  executionId: string;
  observedChanges: string[];
  successIndicator: string;      // "观察到符合某些预期结果"，非"我预测正确"
  unexpectedEffects: string[];
  validationRefs: string[];
}
