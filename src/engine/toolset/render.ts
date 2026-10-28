/**
 * v2 engine/toolset — 渲染（巡检 / 安装结果 / 能力预检）。
 *
 * 三条渲染纪律（少一条，输出就会被误读）：
 *   ① 「未探测」与「未检出」必须可区分；「未检出」≠「未安装」。
 *   ② 台账版本号必须带出处（v1 快照，非本机实测）；不声称版本的条目不渲染版本。
 *   ③ 能力预检必须带三条硬边界（不是闸门 / 装完本进程不可见 / 缺件只能上报），
 *      且**不给主体打分**（只答「机器上有没有」，不排优劣、不产能力等级）。
 */

import { LEDGER_SNAPSHOT, remedyFor } from "./catalog.js";
import { CATEGORY_ORDER } from "./types.js";
import type { Capability, InstallOutcome, InstallStatus, PrecheckRow, SurveyRow } from "./types.js";

const badge = (available: boolean | null): string => (available === true ? "✅" : available === false ? "⬜" : "·");

const provenanceLine = (): string =>
  `> 数据来源：**v1 台账快照**（${LEDGER_SNAPSHOT.at}；${LEDGER_SNAPSHOT.source}；扩源条目核验于 ${LEDGER_SNAPSHOT.expansionAt}）` +
  " —— **不是本机实测**；版本会随时间变化，winget ID 稳定。";

/** 巡检渲染（按分类分组；provider 与 reference 两级边界在行内写清）。 */
export const renderSurvey = (
  rows: SurveyRow[],
  req: { survey?: "providers" | "all"; category?: string } = {},
): string => {
  const lines = ["# 工具集台账", "", provenanceLine()];
  if (req.category) lines.push(`> 过滤：分类 = 「${req.category}」`);
  lines.push("");

  const groups = new Map<string, SurveyRow[]>();
  for (const r of rows) {
    const k = r.capability.category;
    const g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }
  const order = [...CATEGORY_ORDER, ...[...groups.keys()].filter((k) => !CATEGORY_ORDER.includes(k))];
  for (const cat of order) {
    const group = groups.get(cat);
    if (!group || !group.length) continue;
    lines.push(`## ${cat}`, "");
    for (const row of group) {
      const c = row.capability;
      const state = row.available === true ? `可用（${row.detail}）` : row.available === false ? "未检出" : "（未探测）";
      const unwired = c.kind === "provider" && c.wired === false ? "（v2 未接线）" : "";
      lines.push(`- ${badge(row.available)} ${c.label} —— ${state}${unwired}`);
      lines.push(`    \`${c.id}\`${c.note ? ` · ${c.note}` : ""}`);
      if (c.kind === "provider") lines.push(`    提供：${c.provides}｜缺件时：${c.degradesTo}`);
    }
    lines.push("");
  }

  const notProbed = rows.filter((r) => r.available === null).length;
  const providerRows = rows.filter((r) => r.capability.kind === "provider");
  if (req.survey !== "all" && notProbed) {
    lines.push(
      `> 通用工具共 ${notProbed} 项**未探测**（默认只探插件内接线的 ${providerRows.length} 项）。要探测全部：\`shadow_toolset({survey:"all"})\`。`,
    );
  }
  const missingWired = providerRows.filter((r) => r.capability.wired !== false && r.available !== true);
  if (missingWired.length) {
    lines.push(
      `> 插件内接线缺件：可用 \`shadow_toolset({install:"<id>"})\` 安装（会先申请宿主审批）；id ∈ ${missingWired.map((r) => r.capability.id).join(" / ")}。`,
    );
  }
  if (providerRows.length && providerRows.every((r) => r.capability.wired === false)) {
    lines.push("> 插件内接线：v2 **尚未接线**（zg / semble 为预留）——装了也不改变当前插件行为；可用的是 reference 通用工具本身。");
  }
  lines.push(`> 装法（Windows 口径）：\`shadow_toolset({install:"<id>"})\`（需宿主 allowed-once 审批）；reference 条目也可按各自处置命令自行安装。`);
  lines.push(
    "> 注意：**探测失败 ≠ 未安装** —— 可能是该工具没有探测用的版本旗标，或宿主进程的 PATH 是启动时快照（宿主起来之后装的要重启才可见）。",
  );
  return lines.join("\n");
};

const INSTALL_STATUS_LABEL: Record<InstallStatus, string> = {
  "already-available": "✅ 已可用",
  installed: "✅ 已安装（重探通过）",
  unverified: "⚠ 已执行但未验证（重探未检出，可能要重启宿主）",
  failed: "❌ 失败",
  rejected: "⛔ 用户拒绝",
  cancelled: "⛔ 已取消",
  "no-approval": "⚠ 无审批通道",
  "approval-unavailable": "⚠ 审批未授予",
  "unknown-capability": "❌ 未登记",
  "no-recipe": "⚠ 无可靠装法",
};

/** 安装结果渲染：结果、命令、说明三行，拒绝路径的说明里一定带「未安装」与可复制命令。 */
export const renderInstall = (o: InstallOutcome): string =>
  [
    `# 工具集台账 · 安装 ${o.id || "（空）"}`,
    "",
    `- 结果：${INSTALL_STATUS_LABEL[o.status]}`,
    `- 命令：${o.display || "（未解析）"}`,
    `- 说明：${o.detail}`,
  ].join("\n");

/**
 * **本进程可见性约束** —— 为什么「先装再派」在一个会话内收益为零。
 * 宿主进程的 PATH 是启动时快照：新装的工具通常要重启宿主才能被本进程看到；
 * 而同进程内的子 Agent / teammate 同样看不见。故预检后应**降级**或**告知需重启**，不要按「装上就能用」做计划。
 */
export const PROCESS_LOCAL_VISIBILITY =
  "宿主进程的 PATH 是启动时快照：**本进程内新装的工具通常要重启宿主才可见**（同进程内的子 Agent 同样看不见）。" +
  "故预检后**不要**按「先装再派」做计划——处置是**降级**或**告知用户需重启**。";

/** 能力预检渲染：只读事实 + 三条硬边界；未命中不编造命令。 */
export const renderPrecheck = (rows: PrecheckRow[], platform: string = process.platform): string => {
  const lines = [
    "# 工具集台账 · 能力预检",
    "",
    "> 只读：预检**只探测、不安装**；回答「机器上有没有 / 缺了退到哪」，不是派活闸门。",
    "",
  ];
  const missing: Capability[] = [];
  for (const r of rows) {
    if (!r.hit || !r.capability) {
      lines.push(`- ⚠ ${r.need} —— **台账未登记**（不编造装法；台账条目见 \`shadow_toolset()\`）`);
      continue;
    }
    const c = r.capability;
    const state = r.available === true ? "就位" : r.available === false ? "未检出" : "（未探测）";
    const unwired = c.kind === "provider" && c.wired === false ? "（v2 未接线，眼下装了也用不上）" : "";
    lines.push(`- ${badge(r.available)} ${r.need} → ${c.label}（\`${c.id}\`）—— ${state}${unwired}${r.available === true ? `（${r.detail}）` : ""}`);
    if (r.available !== true) {
      lines.push(`    - 缺件时退到：${c.degradesTo}`);
      const rem = remedyFor(c.id, platform);
      if (rem) lines.push(`    - 装法（**需用户显式要求 + 宿主审批**）：\`${rem.cmd}\``);
      missing.push(c);
    }
    if (r.hits.length > 1) {
      lines.push(`    - 同能力多条目：${r.hits.map((h) => `\`${h.id}\``).join(" / ")}（择一即可，勿全装）`);
    }
  }
  if (missing.length) {
    lines.push("");
    const providerMissing = missing.filter((c) => c.kind === "provider");
    const referenceMissing = missing.filter((c) => c.kind === "reference");
    if (providerMissing.length) {
      lines.push(`> **插件内接线缺件**：${providerMissing.map((c) => `\`${c.id}\``).join(" / ")}。`);
    }
    if (referenceMissing.length) {
      lines.push(`> **通用工具缺件**（\`kind:"reference"\`，不影响插件行为）：${referenceMissing.map((c) => `\`${c.id}\``).join(" / ")}。`);
    }
  }
  lines.push("");
  lines.push(
    "> **预检不是闸门**：\`reference\` 是通用工具目录，**不影响插件行为**；缺它**不构成**不派活的理由——只说明该走降级路径（见每行的「退到」）。",
  );
  lines.push(`> ${PROCESS_LOCAL_VISIBILITY}`);
  lines.push(
    "> **缺件的处置权不在被委派者**：安装要经用户显式要求 + 宿主审批（只有 \`allowed-once\` 是授予）；被派出去的子代理 / teammate 发现缺件，**只上报、不自装**——自装等于把「改机器」塞进委派范围，撞「委派范围不得在执行中隐式扩大」。",
  );
  return lines.join("\n");
};
