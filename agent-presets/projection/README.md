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

The persona also carries the **delegation discipline** (v1.12.9, boundary tightened in
v1.13.2): the agent acts as an orchestrator rather than doing every kind of work itself
— split the task by type (implement / debug / review / research / docs / test / config),
activate the matching subagent expert with a self-contained prompt, and dispatch
independent work in one batch. Two reviewers with different lenses (correctness vs.
contract/docs) are required for review work.

**v1.13.2 draws the boundary between the orchestrator and its experts**, so neither side
redoes the other's work:

- **Decide whether to delegate at all** — work you can state in one sentence, that
  touches a single place and needs no second opinion, you do yourself. Reconnaissance
  (listing directories, searching code, reading key files) in order to split the work is
  *not* duplication; producing the deliverable first and then dispatching an expert to
  redo it *is*.
- **Do not paste the same source text into two experts' prompts** — give the others a
  summary plus the exact path, to read themselves if they need to check. Exception:
  reviewers with deliberately different lenses read the source themselves; that spends
  tokens to buy independence, which is not waste.
- **Verify only the claims that would force rework if wrong.** The dispatch prompt asks
  each expert to split its conclusions into "wrong ⇒ rework" and "the rest"; the
  orchestrator checks only the first group, accepts the rest **as unverified**, and must
  list them in the deliverable as「未复核：N 条」. An output that splits nothing is
  rejected and re-dispatched.

This replaces the earlier "verify every expert claim itself" rule (run every command,
read every file it mentioned): verifying every single claim meant redoing the expert's
reasoning, and that cost scaled with the number of experts.

Full text: `~/.agents/rules/moe-subagent-dispatch.md` (user-level) — this preset ships
the self-contained short form, so it works on a machine without that rules directory.

From v1.13.1 the persona also carries **⑥ 契约与根因卫生** (compressed from
`~/.agents/AGENTS.md` global work conventions + the ADR-0050 clarify audit): root-cause
triad → plain language / `CONTEXT.md` terms → write key findings into shadow or project
docs → four checks (易误解 / 遗漏 / 因果跌倒 / 注释断链) before handoff **and** after
changing modes/APIs/terms/doc contracts. This is a **projection-session reinforcement**,
not a full copy of global AGENTS (DSH already aggregates those into `~/.dsh/AGENTS.md`
via `sync-rules`). Wording in the persona uses「shadow / 项目文档」for the global
AGENTS「memory 存档」habit, so it stays executable in projection mode.

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
