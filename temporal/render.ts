// dsh-shadow —— temporal/render.ts：Epistemic Render（Temporal 只报观察状态，不报人格）。
import type { TemporalNode } from "./types.js";

// 默认：event/perception（可见/隐藏/透镜）。永不输出人格结论（"所以我是怎样的人"）。
export const renderNodePerception = (n: TemporalNode) => {
  const lines = [`[Temporal Perception] ${String(n.timestamp).slice(0, 10)} · ${n.observerId}`];
  lines.push(`lens ${n.perceptionSnapshot.lens || "default"}`);
  lines.push(`visible ${n.perceptionSnapshot.visible.join("、") || "—"}`);
  lines.push(`hidden ${n.perceptionSnapshot.hidden.join("、") || "—"}`);
  lines.push(`distortion ${n.perceptionSnapshot.distortion.join(" · ") || "—"}`);
  return lines.join("\n");
};

// identity_context 显式请求：返回 identityVersion（不是 personality）。
export const renderNodeIdentityContext = (n: TemporalNode) => {
  const lines = [`[Temporal Identity Context] ${String(n.timestamp).slice(0, 10)}`];
  lines.push(`identityVersion ${n.stateSnapshot.identityVersion}`);  // 版本号，不输出人格标签
  if (n.stateSnapshot.intent?.goal) lines.push(`intent ${n.stateSnapshot.intent.goal}`);
  return lines.join("\n");
};
