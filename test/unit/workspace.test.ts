import assert from "node:assert/strict";
import { isRemoteWorkspace, resolveWorkspace } from "../../dist/surface/workspace.js";
import { normalizeConfig } from "../../dist/contract/config.js";

// UNC / WSL / 网络共享 → 判为远端（这类路径上 SQLite 无法加锁，必须跳过派生索引）
assert.equal(isRemoteWorkspace("\\\\wsl.localhost\\debian-u8-1\\home\\g\\project\\X"), true, "反斜杠 UNC（WSL）应判为远端");
assert.equal(isRemoteWorkspace("//wsl.localhost/debian-u8-1/home/g/project/X"), true, "正斜杠 UNC（WSL）应判为远端");
assert.equal(isRemoteWorkspace("\\\\wsl$\\Ubuntu\\home\\g"), true, "\\wsl$ UNC 应判为远端");
assert.equal(isRemoteWorkspace("\\\\server\\share\\proj"), true, "SMB UNC 应判为远端");

// Windows 宿主上的 POSIX 绝对路径（WSL 里的 /home/...）没有本地盘根 → 远端/异世界
assert.equal(isRemoteWorkspace("/home/g/project/X", "win32"), true, "win32 上的 POSIX 绝对路径应判为远端");
// Linux 宿主上的 /home/... 是本地 → 不应误判（否则本地也丢索引）
assert.equal(isRemoteWorkspace("/home/g/project/X", "linux"), false, "linux 本地路径不得误判为远端");

// Windows 本地盘符 → 本地，绝不误判
assert.equal(isRemoteWorkspace("D:/project/dsh1", "win32"), false);
assert.equal(isRemoteWorkspace("C:\\Users\\l\\proj", "win32"), false);
assert.equal(isRemoteWorkspace("d:\\proj", "win32"), false);

// 真实会话 cwd 是反斜杠 UNC：resolveWorkspace 归一化后 isRemoteWorkspace 仍要认出
const resolved = resolveWorkspace(
  { agent: { session: { header: { cwd: "\\\\wsl.localhost\\debian-u8-1\\home\\g\\project\\OpenAPI-Gateway" } } } },
  normalizeConfig({}),
);
assert.ok(resolved, "应能解析工作区");
assert.equal(resolved!.kind, "session");
assert.equal(isRemoteWorkspace(resolved!.ws), true, "会话 UNC cwd 归一化后应判为远端");

console.log("✔ workspace：UNC/WSL/网络路径判为远端（跳过 SQLite 索引）· 本地盘符与 Linux 本地路径不误判");
