# 投影模式 (projection) — package-owned agent preset

This preset is **package-owned**. It is the **single source of truth** shipped with
`dsh-shadow`. Local installs are deployment artifacts, not development sources.

- **Source of truth**: `agent-presets/projection/` in the `dsh-shadow` repository.
- **Runtime copy**: `~/.dsh/.agent-presets/projection/` is a **deployment artifact**.

> **Do not edit the installed copy directly.**
> Modify the source preset here and republish / re-install.

## Install (deploy from package)

```bash
cp -r agent-presets/projection ~/.dsh/.agent-presets/projection
```

The DSH roster mounts it via `agentPresets.standingKeyFor('projection')` and
validates the mount. If you only use the runtime copy, re-copy from the package
after each upgrade — never hand-edit it.

## What it configures

`standard` preset + a projection persona: the agent is treated as an independent
thinking agent, everything is a file, and its thinking/context/decisions are
auto-persisted into the shadow memory tree by the `dsh-shadow` plugin, and it
should call `read_shadow` to retrace its own trajectory. `dsh-shadow` itself is
a host bundle and is always on; this preset only steers how the agent uses it.

The persona also carries the **delegation discipline** (v1.12.9): the agent acts as
an orchestrator rather than doing every kind of work itself — split the task by type
(implement / debug / review / research / docs / test / config), activate the matching
subagent expert with a self-contained prompt, dispatch independent work in one batch,
and **verify every expert claim itself** (run the command, write a probe, read the
code) instead of trusting an unverified assertion. Two reviewers with different
lenses (correctness vs. contract/docs) are required for review work. Full text:
`~/.agents/rules/moe-subagent-dispatch.md` (user-level) — this preset ships the
self-contained short form, so it works on a machine without that rules directory.

## Boundaries (mirrors Observer Runtime)

```
Configuration ≠ Identity
Persona ≠ Purpose
Preset ≠ Agent Evolution
```

The preset only configures how an agent uses `read_shadow` / shadow memory. It does
**not** redefine the Observer's boundaries (see ADR-0029 … ADR-0034). It references
DSH built-in plugins (`@deepseek-ai/dsh-*`) and `{{model}}` / `{{cwd}}`; it carries
no user-machine-specific paths or keys, so it is portable.

## Note on DSH preset management

`dsh` currently exposes **no** `dsh preset install/doctor` subcommand (verified:
`dsh preset --help` treats the args as profile boot args). Agent presets are loaded
from `~/.dsh/.agent-presets/<id>/` and validated by `agentPresets.standingKeyFor`.
This package does **not** reinvent that mechanism — it documents the package-owned
install flow instead.
