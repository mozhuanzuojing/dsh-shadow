// dsh-shadow —— simulation/explain/explain.ts：Simulation lineage 解释（为什么系统认为这个可能世界会这样演化）。
import type { SimulationOutcome } from "../types/outcome.js";

export const renderOutcome = (o: SimulationOutcome) => {
  const lines = ["[Simulation Outcome]"];
  lines.push(`status ${o.status}（hypothetical，禁 predicted/confirmed/expected） · uncertainty ${o.uncertainty.toFixed(2)}`);
  for (const s of o.stateAfter) lines.push(`  ${s}`);
  lines.push(`derivedFrom ${o.derivedFrom.join("、") || "—"} · assumptions ${o.assumptions.join("、") || "—"} · rules ${o.rules.join("、")}`);
  return lines.join("\n");
};
