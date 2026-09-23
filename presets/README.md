# 投影模式 (projection) — package-owned agent preset

This preset is **package-owned**. It is the **single source of truth** shipped with
`dsh-shadow`. Local installs are deployment artifacts, not development sources.

- **Source of truth**: `presets/projection.patch.yml` in the `dsh-shadow` repository.
- **Runtime form**: a `preset-projection` declaration row composed from the installed package.

> **Do not edit the composed row directly.**
> Modify the source patch here and republish / re-install.

## Install (0.1.7+: the preset ships as a bundle patch)

Since `v1.20.0` / ADR-0098 this preset is a **`@deepseek-ai/dsh-agent-preset`
declaration row** published by the package's own bundle — not a directory copied
into `$DSH_HOME/.agent-presets/`. Installing the package **is** the install:

```bash
dsh plugin --profile <profile> add dsh-shadow
```

`package.json` → `dsh.bundle.patch` lists **two** patches: `./cordis.patch.yml`
(mounts the plugin row) and `./presets/projection.patch.yml` (declares the
`projection` preset). The roster resolves it via
`agentPresets.standingKeyFor('projection')` and validates the mount.

⚠ **The legacy form is dead.** Before declaration rows, a preset was a directory
`$DSH_HOME/.agent-presets/<id>/` holding `preset.yml` + `agent.cordis.yml`.
0.1.7 has **no reader** for that directory — the shipped
`editing-cordis-compositions` skill states it verbatim: *Nothing reads that
directory any more*. If you installed the old copy into a `≤0.1.6` home, that
copy is now a **frozen deployment artifact**: keep it only while you still run
`≤0.1.6`, and never hand-edit it (this package no longer ships its source).

## What it configures

`standard` preset + a projection persona: the agent is treated as an independent
thinking agent, everything is a file, and its thinking/context/decisions are
auto-persisted into the shadow memory tree by the `dsh-shadow` plugin, and it
should call `read_shadow` to retrace its own trajectory. `dsh-shadow` itself is
a host bundle and is always on; this preset only steers how the agent uses it.

> **Change note — v1.20.0 / ADR-0098: the preset became a declaration row, and Agent Teams moved
> to the profile plane.** Both changes are forced by DSH `0.1.7`:
> 1. The preset is no longer a `$DSH_HOME/.agent-presets/<id>/` directory — it is a
>    `@deepseek-ai/dsh-agent-preset` declaration row in `presets/projection.patch.yml`, applied
>    through `package.json` → `dsh.bundle.patch` (now an **array**). See「Install」above.
> 2. **This preset now carries no delegation-plane row at all** — the `tool-agent-team` row is
>    gone too. 0.1.7 ships Agent Teams as ONE profile-level bundle
>    (`@deepseek-ai/dsh-experimental-agent-team-profile`) which mounts `agent-team` /
>    `tool-agent-team` / `ui-agent-team` **and itself disables `tool-subagent*`**. So the
>    v1.15.96 discipline (「如非必要，不得轻易开子代理」) is now enforced *upstream* instead of by
>    hand here, and this preset is a faithful copy of the shipped `standard` preset except for the
>    persona. Both facts are locked by `test/preset-projection.test.ts`.

> **Change note — v1.20.3 / ADR-0099: the roster cap is back to the bundle default, and the Agent Team
> text is re-aligned to the 0.1.7 line.** Two things were wrong for a while:
> 1. **The cap.** This deployment used to override `maxMembers` to `4` (ADR-0056 §1). That value **never bound
>    anything** — over 23 local sessions (51.7 M characters) there were **zero** real `spawn_teammate` calls —
>    while it had no headroom for failed spawns and existed only in the `web` profile (`headless` never set it).
>    The override is **gone**: the roster follows the profile bundle's shipped **`maxMembers: 8`**.
> 2. **The description.** The numbers cited here for the upstream defaults and line numbers were read off
>    **`0.1.5-rc.2`** package bodies and were never re-read when the baseline moved to the 0.1.7 line. They are
>    now quoted **by symbol**, with the package version they were checked on. **`0.1.7-alpha.2` itself changed
>    one thing**: `spawn_teammate`'s first message now tells the teammate its own name, that the Lead is named
>    `lead`, and how to use `list_agents` / `send_message`.

> **Change note — v1.15.96+: Agent Team only, and「默认不派」.** 用户 2026-09-16 定调
> 「子代理特别耗时、消耗 token；如非必要，不得轻易开子代理」⇒ this preset **removed every
> `tool-subagent*` row** (`subagent`, `subagent_fork`, `subagent_codex`, `subagent_claude_code`,
> `tool-subagent-control`, `tool-subagent-list-agents`). The composition's **only** delegation
> mechanism is the Agent Team row (`@deepseek-ai/dsh-experimental-tool-agent-team`), and the
> persona says **默认不派人**（够不上门槛就自己做）. Older paragraphs below that mention
> "subagent experts", one-shot `subagent` / `subagent_fork` fallbacks, or the legacy name
> collision describe the **pre-v1.15.96** wiring and are kept as history.
> ⚠ Consequence: if the host does not provide `agentTeams`, this preset's agent has **no
> delegation tool at all** (it does the work itself) — see「Prerequisite, and it fails silently」.

The persona also carries the **delegation discipline** (v1.12.9, boundary tightened in
v1.13.2; mechanism changed in v1.15.96): the agent acts as an orchestrator rather than doing every
kind of work itself — split the task by type (implement / debug / review / research / docs / test /
config), dispatch to a **teammate** with a self-contained prompt, and dispatch independent work in
one batch. When review work is dispatched at all, two different lenses (correctness vs.
contract/docs) are worth the extra member.

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

### Reuse first, with a hard teammate budget (v1.15.11 — corrects v1.15.4)

v1.15.4 said **team-first**. That was wrong, and this version corrects it. The same release that
introduced the wording also recorded the finding that contradicts it: the `fresh`/`fork` axis is
**identical** on both surfaces, while Teams **adds** a fixed cost — a `team:policy` section plus
**nine** tool schemas carried by *every* member on *every* request. So "prefer Teams" is a **net
loss when the member is used once**. The corrected rule is:

> Decide by **how many times the member will be reused** — not by which mechanism feels more modern.

**Judgement:** use a teammate only when it will serve **≥ 2 dispatches** (or the shared task board is
genuinely needed); **for a single one-shot, do it yourself** — since v1.15.96 this preset mounts
**no** `subagent` / `subagent_fork` row at all (see the change note at the top of this file).

**The budget is a per-session lifetime cap, not a concurrency limit.** This is read off upstream
code (`dsh-experimental-agent-team/lib/index.js`), not documentation. Quoted **by symbol** because the
line numbers rot — see `adr/0099` §2 for the three that already did. Checked on the `0.1.7-alpha.1` /
`0.1.7-alpha.2` installed bodies (byte-identical to each other):

| Evidence | Consequence |
|---|---|
| `state.members.length >= this.maxMembers` is checked **at create** time inside the journal transaction (`TEAM_MEMBER_LIMIT`) | counts every teammate **ever created** |
| the roster's only write is `state.members.push(member)` | it grows in place; nothing is ever replaced wholesale |
| **`members.splice/pop/shift/delete` → 0 hits** (the single `members.filter(...)` is a **read-only** scan for members still `provisioning`) | **no removal path at all** |
| a duplicate name throws `TEAM_MEMBER_NAME_TAKEN`; `memberName()` rejects `name === "lead"` | **a failed spawn keeps its name AND consumes its slot**; `lead` is a reserved name |
| the failed path calls `settleProvisioning()`, which **appends a new version** with `phase: "failed"` | a failed creation permanently occupies a slot, not merely a name |

**Three values, never to be conflated:**

| Value | Where it comes from |
|---|---|
| **16** | the package's own `DEFAULT_MAX_MEMBERS` (what you get with no config at all) |
| **8** | the `@deepseek-ai/dsh-experimental-agent-team-profile` bundle's shipped `agent-team.config` |
| **8 (this deployment)** | v1.20.3 / ADR-0099: the profile override was **deleted**, so the bundle's 8 applies. The `headless` profile never had an override either — the two are now consistent. |

Why 4 was withdrawn: over **23 local sessions / 51 715 325 characters** of recorded transcript there were
**zero** real `spawn_teammate` calls (counted as `type == "tool/call"` with `data.name == "spawn_teammate"` —
*not* string matches, which count the per-request tool schema 205 times in the largest session), and **zero**
runtime `TEAM_MEMBER_LIMIT` throws. So 4 never bound anything, while ADR-0056 §1 itself recorded its only
defect: **no headroom for failed spawns**. Raising the fallback to the bundle's 8 relaxes **no** dispatch
threshold — the real spend control is the discipline below, not this cap.

**Exhausting the budget is not a dead end.** `workflow`, `workflow-worker-thread` and `ralph`
contain **zero** references to `agentTeams`, so they do **not** consume slots: the Lead can always
fall back to doing it itself, or to `workflow` fan-out. (After v1.15.96 there is no one-shot
`subagent` fallback left in this preset — and on the 0.1.7 line the profile bundle disables
`tool-subagent-control` / `tool-subagent-list-agents` / `tool-subagent` / `tool-subagent-fork`
**upstream** as well, so in this composition there is no `subagent` to fall back to at all.)

**Round-trip discipline** (the compounding half — there is no hard gate for this one): every peer
message **permanently appends to the target's history** and is re-sent on every later request. So:
one dispatch = **one** message (task / constraints / acceptance / output format all at once);
**≤ 2 round-trips** per dispatch (initial + one correction), beyond which the Lead takes over; and
prefer waking a `running` / `idle` member over an `inactive` one, because **cold-resume replays the
whole persisted conversation**.

> **Cost note, stated honestly:** the v1.15.11 discipline added **+235 characters** of always-on
> persona (2394 → 2629, YAML-parsed length — what actually enters the prompt). That is a real, permanent cost paid to prevent unbounded delegation spend —
> the trade is only worth it because the failure mode it guards against is a compounding one.
> ⚠ **Current length (measured 2026-09-23, after the v1.20.3 re-alignment): `3047` characters.**
> Re-measure with a YAML parse of `persona.config.prefix` whenever this persona changes — do not
> carry the old number forward.

What this preset adds in the composition, and what it requires:

| Piece | Plane | Row |
|---|---|---|
| Team domain service `ctx.agentTeams` + the nine Team tools + the Team Web UI | **profile bundle** (0.1.7+) | `@deepseek-ai/dsh-experimental-agent-team-profile` |
| Projection persona, plus the rest of the agent plane | **preset** (`presets/projection.patch.yml`) | `@deepseek-ai/dsh-agent-preset` |

The nine tools are `spawn_teammate`, `send_message`, `list_agents`, `wait_agent`,
`interrupt_agent`, `team_task_create`, `team_task_list`, `team_task_get`, `team_task_update`.
Since v1.20.0 they come entirely from that profile bundle; the bundle also disables
`tool-subagent-control` / `tool-subagent-list-agents` / `tool-subagent` / `tool-subagent-fork`,
which is what makes Agent Teams the only delegation mechanism.

**Prerequisite, and how it fails now.** Install the bundle into the profile and add it to
`dsh.profile.bundles`:

```bash
dsh plugin --profile <profile> add @deepseek-ai/dsh-experimental-agent-team-profile
```

To change the roster cap, override the `agent-team` row **by id** in the profile's `cordis.patch.yml` —
and restate **every** config key, because a patch replaces the whole `config`:
`maxMembers`, `maxTasks`, `maxPendingMessagesPerMember`, `maxMessageBytes`, `disposalTimeoutMs`
(a missing key silently falls back to the schema default).
⚠ **This deployment no longer does that** (v1.20.3 / ADR-0099): it follows the bundle's shipped
`maxMembers: 8`. The override used to exist only here and only in the `web` profile; deleting it also
deleted that "restate all five keys" maintenance burden. Package default vs bundle default vs this
deployment: **16 / 8 / 8** (see the budget table above).

Without the bundle the preset still mounts and `standingKeyFor` still reports success, but the
Team tools never appear — that is the ADR-0049「缺件不静默」gap. Since v1.20.0 what you must check
is the **bundle's install state**, not a hand-written host row.

**Name collision — no longer applicable (v1.15.96).** Upstream documents a deliberate collision
between the Team tools and the legacy continuable-subagent controls
(`@deepseek-ai/dsh-tool-subagent-control` + its `/list-agents` entry) for `send_message`,
`list_agents` and `interrupt_agent`. That collision **cannot arise here any more**, because this
preset removed every `tool-subagent*` row: in this composition those three names are provided by
the Team row alone. Historical note: before v1.15.96 the preset mounted both on purpose so that
non-Team children kept their controls.

**Mount only once per process.** Mounting `tool-agent-team` a second time in the same process
fails with `prompt section "team:policy" is already registered in this scope`. The package
(`dsh-experimental-tool-agent-team/lib/index.js`) dedupes with an **instance-level**
`installed = new Map()` while registering into the **member Agent's own scope**
(`const scoped = agent.ctx` → `scoped.systemPrompt.section({ name: "team:policy" })`). So a second
mount sees an empty Map and re-registers the same section name on the same live Agent. Consequences:
two presets both mounting this row collide on the second, and a same-process remount (HMR / loader
reload) carries the same risk. A cold start mounts once and is unaffected.

> Quoted **by symbol, not by line**: `installed` sat at `530` in `0.1.7-alpha.1` and `538` in
> `0.1.7-alpha.2` (the teammate-reminder insertion shifted it by 8), while `const scoped = agent.ctx`
> and `team:policy` did not move. Older revisions of this file cited `531` / `232` — those were
> `0.1.5-rc.2` readings (see `adr/0099` §2).

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

## Note on DSH preset management (current as of 0.1.7-alpha.2)

`dsh` still exposes **no** `dsh preset install/doctor` subcommand (verified: `dsh preset --help`
treats the args as profile boot args). An agent preset is declared as an
`@deepseek-ai/dsh-agent-preset` row inside a bundle's `dsh.bundle.patch` list and resolved by
`agentPresets.standingKeyFor` — the shipped `standard` / `ptc` / `minimal` / `cordis` presets are
exactly this shape in `dsh-web-app/presets/`. The registry row
(`@deepseek-ai/dsh-agent-preset-registry`, `config.default`) is inserted by `dsh-web-app`; a preset
bundle must **not** insert a second one.

⚠ The `$DSH_HOME/.agent-presets/<id>/` directory form is **gone**: 0.1.7 has no reader for it (see
「Install」). Any copy still sitting in a `≤0.1.6` home is a frozen deployment artifact, not a
source.
