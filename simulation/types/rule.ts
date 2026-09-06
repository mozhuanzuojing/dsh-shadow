// dsh-shadow —— simulation/types/rule.ts：SimulationRule（模拟器采用的推演规则；Rule ≠ Reality Relation）。
export interface SimulationRule {
  id: string;
  inputPattern: string;
  transformation: string;
  confidence: number;
  source: string;
}
