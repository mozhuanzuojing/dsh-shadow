/**
 * mode registry 打印器（只读）：core 10 / lab 51 / 写型 31。
 *
 * 用法：
 *   node tools/mode-registry.ts --list
 *   node tools/mode-registry.ts --writes
 *   node tools/mode-registry.ts --group lab
 */

import { ALL_MODES, CORE_MODES, LAB_MODES } from "../dist/contract/modes.js";
import { LAB_GROUPS, LAB_WRITE_MODES } from "../dist/lab/registry.js";

const args = new Set(process.argv.slice(2));
if (args.size === 0 || args.has("--list")) {
  console.log(`core ${CORE_MODES.length}: ${CORE_MODES.join(", ")}`);
  console.log(`lab  ${LAB_MODES.length}: ${LAB_MODES.join(", ")}`);
  console.log(`all  ${ALL_MODES.length}`);
  for (const g of LAB_GROUPS) console.log(`  ${g.name} (${g.modes.length}): ${g.modes.join(", ")}`);
}
if (args.has("--writes")) {
  console.log(`write modes ${LAB_WRITE_MODES.size}: ${[...LAB_WRITE_MODES].sort().join(", ")}`);
}
if (args.has("--group")) {
  const idx = process.argv.indexOf("--group");
  const name = process.argv[idx + 1];
  const g = LAB_GROUPS.find((x) => x.name.toLowerCase().includes(String(name).toLowerCase()));
  if (!g) {
    console.error(`未知分组：${name}`);
    process.exit(2);
  }
  console.log(`${g.name} (${g.modes.length}): ${g.modes.join(", ")}`);
}
