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

From v1.14.1 the persona also carries **⑦ 创意与资源** (open-ended / creative work). The agent
dispatches a **resource scout** first and a **creative expert** second, and neither may take
over the other's job:

- **Resource scout — material only.** Check the library first (`shadow_query` with
  `scope: ["resource"]`; a hit skips external search), identify the kind of source needed
  (tool / GitHub / paper / official docs / article / case / dataset), expand keywords
  (core, synonyms, technical, implementation, problem, GitHub, paper, competitor terms plus
  **reverse keywords** — "how to avoid this problem"), with a stop rule (≤5 per class; stop
  after two rounds with no new material), then evaluate, star, and write the card to
  `.shadow/resources/<name>.md`. It does not solve the problem and does not judge options.
- **Two-layer card.** The stable layer (`source` / `type` / `authority` / `activity` / `risk` /
  one-liner) stays valid across questions; the per-question projection is a separate
  `## 投影 @ <question>` section (`相关性 / 新颖性 / 可用性 / 启发度 / 可复用性` + citation +
  conclusion), so scores given for an old question never contaminate a new one.
- **Two boundaries.** A card **must** carry `source`, otherwise it never enters cognitive
  queries (collected ≠ sourced); and `inspiration` is scored **only when a candidate option
  actually cites the card**, with a note on which option it changed.
- **Creative expert — divergence only.** Several options plus counter-intuitive ones, each with
  its assumptions and risks; it does not search, only reads the cards the scout produced.
  Convergence stays with the orchestrator (or an independent judge) as a comparison matrix
  with a rejection reason per option.

The card format and the `resource` NodeType are plugin-side (ADR-0051, v1.14.0); this preset
only steers how the agent uses them.

### Agent Teams first, subagents last (v1.15.4)

The persona's dispatch discipline is **team-first**: decide whether to delegate at all, and when
it does delegate, prefer a named long-lived teammate over opening a fresh one-shot subagent every
time. The stated reason is reuse, not magic: a new subagent pays the system prompt + tool-schema
prefix again, while an existing teammate keeps a reusable prefix and only receives the new message.
`subagent` / `subagent_fork` remain, but only for work that is genuinely one-shot with no follow-up.

What this preset adds in the composition, and what it requires:

| Piece | Plane | Row |
|---|---|---|
| Team domain service `ctx.agentTeams` | **host** (profile `cordis.patch.yml`) | `@deepseek-ai/dsh-experimental-agent-team` |
| Nine model-facing Team tools | **preset** (this file) | `@deepseek-ai/dsh-experimental-tool-agent-team` |

The nine tools are `spawn_teammate`, `send_message`, `list_agents`, `wait_agent`,
`interrupt_agent`, `team_task_create`, `team_task_list`, `team_task_get`, `team_task_update`
(`freshProvider: spawn` / `forkProvider: fork` mirror the preset's existing subagent providers).

**Prerequisite, and it fails silently.** The Team package injects `agentTeams`, so with no host row
the row never activates — but `standingKeyFor` still reports a successful mount, and the nine tools
simply never appear. That contradicts this repository's ADR-0049「缺件不静默」: the Teams wiring has
**no** visible degradation path. Install the host row (durable session storage is already in the
base profile) before expecting the tools.

**Name collision (deliberate, documented upstream).** `send_message`, `list_agents` and
`interrupt_agent` are also the legacy continuable-subagent controls from
`@deepseek-ai/dsh-tool-subagent-control` (+ its `/list-agents` entry), which this preset still
mounts. The Team registrations are scoped to Team member Agents and **shadow the globals for
them**; non-Team subagents keep the legacy catalog. Consequence: the Lead steers *teammates*, and
its plain `subagent` / `subagent_fork` children are no longer reachable through `send_message`.
Upstream says a composition wanting both "must disable the legacy definitions"; this preset keeps
them on purpose so non-Team children retain their controls.

**Mount only once per process.** Mounting `tool-agent-team` a second time in the same process
fails with `prompt section "team:policy" is already registered in this scope`. The package
(`dsh-experimental-tool-agent-team/lib/index.js`) dedupes with an **instance-level**
`installed = new Map()` (line 531) while registering into the **member Agent's own scope**
(`const scoped = agent.ctx`, line 232 → `scoped.systemPrompt.section({ name: "team:policy" })`,
line 238). So a second mount sees an empty Map and re-registers the same section name on the same
live Agent. Consequences: two presets both mounting this row collide on the second, and a
same-process remount (HMR / loader reload) carries the same risk. A cold start mounts once and is
unaffected.

### Persona row key (v1.14.1 fix)

The `persona` row must use the **current** `@deepseek-ai/dsh-persona` config keys —
`suffix` + `prefix`. The older `text:` key no longer exists in the deployed plugin
(0.1.5-rc.1 validates `prefix` as required), so a composition still carrying `text:` fails to
mount with `$.prefix missing required value` — and because the roster's `broken` field is only
a shape check, such a preset still *looks* fine in the picker until a session tries to compose
it. This preset carried `text:` for several versions and could not mount; v1.14.1 switched it to
the shipped presets' shape (`suffix: Your working directory is {{cwd}}.` + `prefix: >-`).

Check with a real composition, not a shape read — `copy` the preset to a fresh id and mount it:

```js
await agentPresets.copy('projection', 'projection-probe')
await agentPresets.standingKeyFor('projection-probe')   // 真组装；失败会抛错
await agentPresets.remove('projection-probe')
```

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
