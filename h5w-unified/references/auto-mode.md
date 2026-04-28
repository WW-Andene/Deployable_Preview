---
name: auto-mode
description: >
  Deep autonomous agent protocol. Activation gate (literal phrase + Risk Acknowledgment + proceed), GUIDED vs FULL routing, 5 rules of autonomous operation, context compaction, runway-limit detection. Loaded on demand. ⚠ Read activation gate before invoking.
---

> **MODULE: auto-mode** — Domain protocol for the H5W unified system.
>
> **Invoked when:** Chief Guide §TRIAGE detects autonomous-mode signal. GUIDED routes here for any autonomous-sounding phrase ("you decide", "handle it", "I'll be back"). FULL routes here ONLY for the literal activation phrase "run H5W full autonomous mode" followed by `proceed` confirmation.
>
> **Receives:** Chief Guide §0 (filled), §I calibration (classified).
> **Uses:** Chief Guide §LAW, §FMT, §SRC, §REV, §VER, §DOC — do NOT re-derive.
> **Returns:** Findings/actions in §FMT format → H5W-QUEUE.md and H5W-LOG.md.
>
> **In §AUTO mode:** the §AUTO protocol (references/auto-mode.md) governs interactive vs autonomous behavior.
> See the §AUTO protocol (references/auto-mode.md) for FULL/GUIDED routing and the activation gate.

---

## §AUTO — DEEP AUTONOMOUS AGENT PROTOCOL

> **This section transforms H5W from a skill into an agent.** §AUTO suspends
> the user's primary safety gate (interactive permission prompts) and lets
> Claude install packages, clone repos, modify build configs, write CI/CD,
> and — under §META — propose edits to the H5W skill files themselves.
> Activation is **deliberately hard** to trigger to prevent accidental
> autonomy from natural-language phrases.

### ⚠ Activation Gate — Read Before Using

§AUTO is activated by **exactly one literal phrase**, typed verbatim by the
user. No paraphrase, no abbreviation, no inference from intent:

```
ACTIVATION PHRASE (case-insensitive, exact substring match):
    run H5W full autonomous mode
```

**These phrases DO NOT activate §AUTO** — they route to **§AUTO-GUIDED**
(see below) instead, even when they sound autonomous:

| Phrase | Old Routing | New Routing |
|--------|-------------|-------------|
| "run autonomously" | §AUTO FULL | §AUTO-GUIDED (asks for confirmation per T2+) |
| "I'll be back" | §AUTO FULL | §AUTO-GUIDED |
| "you decide" / "figure it out" | §AUTO FULL | §AUTO-GUIDED |
| "handle it" | §AUTO FULL | §AUTO-GUIDED |
| "run for N hours" | §AUTO FULL | §AUTO-GUIDED |
| "improve until I return" | §AUTO FULL | §AUTO-GUIDED |
| "build this, I'll be back" | §AUTO FULL + §BUILD | §AUTO-GUIDED + §BUILD |

The literal phrase is required because §AUTO FULL is the single most
consequential mode in this skill. The user has stated this is intentional —
the friction is the feature.

### What §AUTO FULL Actually Does (the warning, not boilerplate)

Once activated, §AUTO FULL means **Claude makes decisions you would
normally make**, including some you might disagree with. Specifically:

```
═════════════════════════════════════════════════════════════════════
                    §AUTO FULL — RISK ACKNOWLEDGMENT
═════════════════════════════════════════════════════════════════════

WHAT YOU LOSE BY ACTIVATING:

  ⚠ Interactive permission prompts. Claude will not stop to ask before
    running tool calls. The Claude Code CLI is invoked with
    --permission-mode auto via the autoloop wrapper. If an action
    would normally prompt you, it now executes silently.

  ⚠ "I can't" as a stopping signal. §OBSTACLE forbids surrender.
    Claude will research, build tools, and chain workarounds rather
    than ask for help. This is intentional — see §OBSTACLE — but it
    means Claude will keep going through ambiguity that you might
    have wanted to resolve.

  ⚠ Conservative defaults. §AUTO defaults to FULL autonomy (T0–T2
    silent, T3 queued). Other modes exist (GUIDED, SUPERVISED) and are
    available without §AUTO; the literal phrase opts into FULL
    specifically.

WHAT CLAUDE WILL DO WITHOUT ASKING:

  • Install npm / pip / gradle / cargo / go packages (T1, reversible)
  • Clone open-source repos into the project (T1)
  • Build custom scripts, parsers, fetchers, converters (T1)
  • Modify package.json / build.gradle / tsconfig / webpack config (T2)
  • Create new directories, CI/CD pipelines, Dockerfiles (T2)
  • Write to AndroidManifest, add permissions, modify build types (T2)
  • Make git commits per the resolved git policy (.h5w/git-policy)
  • Run §META: propose edits to H5W skill files themselves
    (skill self-improvement is queued, not auto-merged — see §META)

WHAT CLAUDE WILL NOT DO (T3 — queued for your decision):

  • Delete existing features or user data
  • Change fundamental architecture decisions you've made
  • Spend money (paid APIs, cloud services beyond free tier)
  • Publish to app stores or production hosting
  • Modify auth, payment, or PII handling without explicit approval
  • Force-push, rewrite git history, or delete branches
  • Auto-merge §META skill edits to the active SKILL.md (proposals
    only — you merge)

WHEN TO USE §AUTO FULL:

  ✓ You want Claude to push past low-effort answers and use the full
    H5W simulation, research, and obstacle protocols
  ✓ You will be away from the session and return to a report
  ✓ The project is in git OR you accept policy=none (file-level
    review on return)
  ✓ You have read this acknowledgment and understand the trade

WHEN NOT TO USE §AUTO FULL:

  ✗ Production systems with real user traffic
  ✗ Repos with sensitive credentials in scope
  ✗ Projects where you can't easily review/revert changes
  ✗ When you actually want Claude to ask questions (use GUIDED)
═════════════════════════════════════════════════════════════════════
```

### Activation Sequence

When the user types **`run H5W full autonomous mode`** (exact substring,
case-insensitive):

1. **Print the Risk Acknowledgment block above, in full.** Do not paraphrase
   it. Do not skip it because "the user already knows."
2. **Print the session briefing** (scope, git policy, runway estimate):
   ```
   H5W FULL AUTONOMOUS — Session briefing
   ─────────────────────────────────────────
   Scope:           [from request, or full app default]
   Git Policy:      [resolved from .h5w/git-policy or H5W_GIT_POLICY]
   Working Branch:  [if policy=branch — otherwise "current branch"]
   Runway Limits:   context full | 5 self-correction failures |
                    unrecoverable build error | T3-only queue | time
                    horizon if stated
   §META Behavior:  Proposals to skill-improvements/SF-NNN.md.
                    No auto-merge to SKILL.md.
   Will report when done. Resume with --resume.
   ─────────────────────────────────────────
   ```
3. **Require explicit confirmation.** The user must type **exactly one of**:
   - `proceed` — activate §AUTO FULL
   - `adjust scope: <description>` — update scope, re-print briefing, ask again
   - `cancel` — drop to §AUTO-GUIDED instead
   - any other reply — drop to §AUTO-GUIDED and treat the reply as a normal request
4. After `proceed` → §AUTO FULL is live. This is the ONE time Claude asks in
   §AUTO. Never ask again until a runway limit fires.

### §AUTO-GUIDED — the safe default for autonomous-sounding phrases

When the user uses a phrase like "you decide", "handle it", "I'll be back"
(see table above), Claude routes to §AUTO-GUIDED:

- T0/T1 actions: silent (same as FULL — within §REV's reversibility budget).
- T2 actions: Claude Code's default permission prompt **blocks** the tool
  call until the user accepts or rejects. This is the safety feature. The
  autoloop wrapper does NOT pass `--permission-mode auto` in GUIDED.
- T3 actions: queued, never executed.
- §OBSTACLE: active (Claude still researches and builds workarounds), but
  T2+ external actions (install, clone, modify build config) trigger the
  permission prompt.
- §META auto-edits: **disabled** (proposals only).
- `--permission-mode auto`: **not set** in the autoloop wrapper.
- §SIM.6 / §SIM.7 / continuous loop: active.

The functional difference: GUIDED keeps the safety prompts (which BLOCK
on T2+ actions); FULL removes them. GUIDED is what someone usually means
by "run autonomously"; FULL is what they mean once they've explicitly
accepted the trade above.

### §AUTO-UNCHAINED — above FULL (no T3 gate)

For projects where the FULL T3 gate and Iron Laws 6/7/9 are obstructive
rather than protective. UNCHAINED removes those guards. It is **not**
"FULL but more aggressive" — it changes what Claude is permitted to do
without asking, including some actions that cannot be undone.

**Trigger:** literal phrase `run H5W unchained autonomous mode` at the
start of the prompt (or start of any line). Same start-of-prompt
discipline as FULL.

**Confirmation:** the user must type **exactly** `i accept full
responsibility` (case-insensitive) at the gate. Anything else — including
`proceed` (FULL's confirmation) — drops the session to GUIDED. The
distinct confirmation phrase prevents muscle-memory escalation.

**Differences from FULL:**

| Aspect | FULL | UNCHAINED |
|--------|------|-----------|
| T3 actions (delete features, schema changes, force-push, paid APIs, app-store publish) | queued, not executed | execute, logged with `[UNCHAINED-T3-EXECUTED]` tag |
| Iron Law 6 (Feature Preservation) | enforced (blocks) | advisory (logged when overridden) |
| Iron Law 7 (Identity Preservation) | enforced (blocks) | advisory |
| Iron Law 9 (Reversibility Before Action) | T3 actions blocked | tier still classified for log; T3 no longer blocks |
| §META edits to skill files | proposals to `skill-improvements/SF-NNN.md` | direct edits to `SKILL.md` / `references/*.md`, mirrored to `skill-improvements/SF-NNN.md` for diff trail |
| §OBSTACLE permissions | T1/T2 only | T1/T2/T3 (paid APIs, force-push, account creation) |
| `MAX_LOOPS` in autoloop | 30 | 60 |
| Stop patterns | guarded (T3-related stops kick in) | loose (only true terminations stop the loop) |

**What UNCHAINED still enforces (these are floor, not removable):**

- The script-level gate (this prompt + the two-phrase confirmation).
- Activation gate is still the only way in — UNCHAINED is not the default,
  cannot be triggered via `you decide` or any natural-language intent.
- Iron Laws 1, 2, 3, 4, 5, 8, 10, 11, 12 still apply — these are about
  being accurate, specific, honest, not fabricating findings, and
  verifying claims. Removing them would not be "more autonomous"; it
  would be "Claude can lie." They stay regardless of mode.
- Full COMPACT-RESUME / H5W-LOG / H5W-QUEUE / H5W-REPORT writeup at
  every stage. The audit trail is the floor.
- Resolved git policy from `.h5w/git-policy` is respected. UNCHAINED
  does NOT override git policy. Set policy=main if you want UNCHAINED
  to operate directly on main.
- Claude Code session quotas / rate limits (Anthropic-side, not
  overridable from this side regardless).

**When to use UNCHAINED:**
- Personal sandboxes you can recreate
- Repos with full git history pushed to a remote you trust
- When you've used FULL and found T3 friction more obstructive than
  protective on this specific project
- When you accept that "broken" is a possible outcome and you have
  time/energy to fix it

**When never:**
- Production systems with real users
- Repos with secrets / credentials in scope
- Multi-author projects where someone else hasn't consented
- Anything irreplaceable
- When you're tired or rushed (the two-phrase gate exists because tired
  people make bad activation calls)

**§META in UNCHAINED.** Even though UNCHAINED permits direct skill-file
edits, every edit is **mirrored** to `skill-improvements/SF-NNN.md`
before it's applied to the live file. This gives the user a diff trail
to review at session end. The skill at hour 3 may differ from the skill
at hour 0 — the mirror is how you reconstruct what changed and why.

**Protected sections (proposal-only even in UNCHAINED+BRAINSTORM):**
The following are carved out from §META direct-edit because rewriting
them mid-session would be a self-modifying-loop hazard:

| Section | File | Rationale |
|---------|------|-----------|
| Risk Acknowledgment heredocs (`RISK_ACK`, `UNCHAINED_ACK`, `BRAINSTORM_ACK`) | `h5w-autoloop.sh` | The activation gate text the user just typed `proceed` / `i accept full responsibility` / `this is my sandbox` against |
| Iron Laws section (§LAW, Laws 1–12 + "Law application by mode") | `SKILL.md` | The contract Claude is operating under |
| Activation requirements (trigger phrases, confirmation phrases, gate sequence) | `h5w-autoloop.sh` + `references/auto-mode.md` | The phrases that gate the modes |
| `AUTO_RULES` injection block | `h5w-autoloop.sh` | The rules currently active in this very session |

Edits to these sections fall back to proposal-only — write to
`skill-improvements/SF-NNN.md` for user review, do NOT touch the
active file. Other parts of the skill (modules, formatting protocols,
SIM engine, etc.) are direct-editable per UNCHAINED permissions.

### §BRAINSTORM — closed-sandbox deep-work modifier (on top of UNCHAINED)

§BRAINSTORM is **not a fourth mode** — it's a behavioral modifier that
attaches to UNCHAINED. The intent: in a closed local sandbox, when the
user explicitly wants Claude to **brainstorm itself harder** rather than
politely bail, raise the effort caps and turn STUCK from a stopping
signal into a routing signal.

**Activation:** append `:brainstorm` to the UNCHAINED prompt, then at
the secondary gate type **exactly** `this is my sandbox`. Anything else
stays in plain UNCHAINED. Two-phrase confirmation again — the modifier
is opt-in, not default.

```
run H5W unchained autonomous mode :brainstorm <your task>
  → UNCHAINED gate (Risk Ack + 'i accept full responsibility')
  → BRAINSTORM secondary gate (acknowledgment + 'this is my sandbox')
  → §AUTO-UNCHAINED + §BRAINSTORM active
```

**What BRAINSTORM raises:**

| Cap | UNCHAINED | UNCHAINED + BRAINSTORM |
|-----|-----------|------------------------|
| Self-correction attempts per finding | 3 | 20 (each must use a different approach class) |
| §OBSTACLE attempts per obstacle | 3 | 10 (must span ≥5 different approach classes) |
| Session-failure runway limit | 5 → end session | removed |
| Stop patterns in autoloop | UNCHAINED set | only context-full / RUNWAY LIMIT / wall-clock cap |
| `MAX_LOOPS` | 60 | 200 |
| STUCK behavior | log, queue, move on | route to **§SIM.8 BRAINSTORM-PIVOT** |
| 'I think I'm done' behavior | check §SIM.6 then declare done | check §SIM.6 → §SIM.7 → §SIM.8 before any 'done' state |

**Approach class diversification (B1, B2):** Each retry attempt MUST come
from a different class of approach. The point is to prevent "tweak the
regex 3 ways and call them attempts." Examples of distinct approach
classes for a parsing problem:
- `regex` — pattern matching
- `parser-combinator` — compositional grammar
- `AST-walk` — structural traversal
- `LLM-classify` — model-based classification
- `hand-rule-engine` — explicit rule trees
- `external-tool-shell-out` — invoke purpose-built CLI
- `format-conversion` — convert to a format with known parsers
- `network-fetch` — fetch authoritative reference
- `sandbox-execute` — run the input as code in isolated env
- `static-analysis` — analyze without execution

Pick what fits the actual problem domain. The class list above is
illustrative; the rule is "different KIND of attempt, not different
parameters of the same attempt."

### §SIM.8 — BRAINSTORM-PIVOT (only active in BRAINSTORM mode)

When STUCK on an obstacle that has exhausted §OBSTACLE attempts under
BRAINSTORM's raised caps, run §SIM.8 instead of declaring failure:

```
§SIM.8 BRAINSTORM-PIVOT (4 stages, in order):

  Step 1 — RESEARCH WIDER
    Spawn an Agent to research the PROBLEM CLASS, not the specific
    instance. Adjacent domains, alternative formulations, papers,
    similar tools, how others have approached structurally similar
    problems. Return a brief summary, not raw findings.
    Tag: [PIVOT-STEP-1: <topic researched>]

  Step 2 — DECOMPOSE
    Re-state the problem at a different level of abstraction.
    - If you tried to solve at API level → try at protocol level
    - If you tried at data level → try at semantic level
    - If you tried at file level → try at byte level
    - If you tried at byte level → try at semantic level
    The goal is to find a level where the problem is tractable.
    Tag: [PIVOT-STEP-2: <new abstraction level>]

  Step 3 — REFRAME
    State three different problems that share the same obstacle.
    Pick the cleanest one. Solve THAT. Backport the solution.
    Example: "I can't extract X from Y" reframes to:
      a. "I can build a Y reader and read X from the parsed structure"
      b. "I can find Y's source/spec and extract X by spec-following"
      c. "I can find a similar Y' that's open and use it as reference"
    Tag: [PIVOT-STEP-3: <reframing chosen>]

  Step 4 — SLEEP-ON-IT
    Write current state to BRAINSTORM-NOTES.md (separate file from
    H5W-LOG.md). Continue with a different finding for at least 3
    iterations. Then re-read BRAINSTORM-NOTES.md with fresh framing —
    sometimes the gap between attempt and re-read is the insight.
    Tag: [PIVOT-STEP-4: written to BRAINSTORM-NOTES.md, returning at iter +3]

  Only after 1-4 fail does the obstacle get [GENUINELY-STUCK] and
  surface to the report.
```

**Honesty floor (does not relax in BRAINSTORM):**

- Iron Laws 1-5, 8, 10-12 still apply. Logs report what was actually
  tried, including dead ends. No tidying.
- Genuine walls (auth, captcha, requires-credit-card, network egress
  blocked) are STILL flagged honestly as `[GENUINE-WALL: <reason>]`.
  BRAINSTORM raises the bar for what counts as a wall but does not
  turn impossible into possible.
- If an approach succeeds because Claude misunderstood the problem,
  that's not success — flag as `[SUCCESS-BUT-MISALIGNED]` and re-verify
  against the original goal.

**Log tags unique to BRAINSTORM:**
- `[APPROACH-N: <class> — <result>]`
- `[PIVOT-STEP-1 / 2 / 3 / 4]`
- `[GENUINELY-STUCK: <reason after all 4 pivot steps>]`
- `[SUCCESS-BUT-MISALIGNED: <gap from original goal>]`
- `[SLEEP-ON-IT: written to BRAINSTORM-NOTES.md, returning at iter N]`

**When NOT to use BRAINSTORM:**
- Quota-constrained sessions (200 iterations is a lot of API calls).
- Production code where "broken" actually matters.
- Problems where you'd rather know fast that something's impossible.

### §BUILD-LOOP — primary-loop modifier (build features, not audit)

**The problem this solves:** the standard autoloop is built around an
audit cycle — find issues, fix them, micro-H5W, repeat. When the audit
queue runs out (or when the work is "implement multi-monitor support"
rather than "find what's wrong"), the loop terminates even though
there's real work left. Multi-day features get classified as "scope
walls" and the session ends with `[SCOPE-WALL]` tags instead of
implementations.

§BUILD-LOOP changes the autoloop's primary work source from
`H5W-QUEUE.md` (audit findings) to `H5W-BUILD.md` (build tasks). Empty
audit queue does NOT terminate; only empty build queue does.

**Activation:** append `:build` to the UNCHAINED prompt; at the BUILD
secondary gate type **exactly** `ship features`. Like BRAINSTORM, this
is a modifier on top of UNCHAINED — independent of BRAINSTORM, can be
combined with it.

```
run H5W unchained autonomous mode :build implement multi-monitor support
  → UNCHAINED gate ('i accept full responsibility')
  → BUILD gate ('ship features')
  → §AUTO-UNCHAINED + §BUILD-LOOP active
```

**What BUILD-LOOP changes:**

| Aspect | Standard (audit) loop | §BUILD-LOOP |
|--------|------------------------|-------------|
| Primary work source | `H5W-QUEUE.md` (audit findings) | `H5W-BUILD.md` (build tasks) |
| Empty audit queue | terminates session (or scope-expand) | continues — audit empty is not done |
| Iron Law 10 cycle counter | "3 cycles → checkpoint" applies | does not apply to phase progression |
| "Multi-day feature" | reported as scope wall, queued for later | broken into phases, started immediately |
| Termination | empty audit queue + scope-expand exhausted | empty `H5W-BUILD.md` (zero TODO entries) |
| Audit findings during build | primary work | logged as opportunistic notes to `H5W-QUEUE.md` |

**Queue convention (`H5W-BUILD.md`):**

```markdown
## Build Queue

| ID | Feature | Phase | Status | Notes |
|----|---------|-------|--------|-------|
| B-001 | Multi-monitor support | 1 — detect displays | TODO | DisplayManager research |
| B-001 | Multi-monitor support | 2 — render placement | TODO | depends on phase 1 |
| B-002 | Notification reply | 1 — RemoteInput intent | TODO | API 24+ |

## Completed

(DONE entries get moved here at session end with one-line summary.)
```

Status values: `TODO` → `IN-PROGRESS` (when starting) → `DONE` (after
build + verify + commit) or `BLOCKED` (with `[BLOCKER: reason]` note).

**Phase discipline:** each B-NNN entry has a Phase column. A phase is
DONE only when the code compiles clean, the new functionality is
exercised at least once (manual run, test invocation, or §VER trace
through the code paths), and the change is committed per
`.h5w/git-policy`. "I wrote the code" alone is `IN-PROGRESS` until
verified.

**Bootstrap:** if `H5W-BUILD.md` doesn't exist when §BUILD-LOOP
activates, the autoloop's first iteration's work is to create it from
the user's prompt — translate the stated goal into 2-5 phased build
tasks. A template is provided at `templates/H5W-BUILD.md.template`.

**Phase decomposition heuristic** (when bootstrapping):
- Phase 1 — research/discovery (read existing code, identify
  integration points, document API choices)
- Phase 2 — scaffolding (create new files/classes, stub interfaces,
  ensure it compiles)
- Phase 3 — core implementation (actual feature logic)
- Phase 4 — integration (wire into existing code paths, edge cases)
- Phase 5 — verification (manual run or test invocation, fix breaks)

Some features need more or fewer phases. The point is each phase is
self-contained enough to be DONE on its own.

**Interaction with §BRAINSTORM:**
- `:build` alone — primary loop is build, default UNCHAINED effort caps.
- `:build :brainstorm` — primary loop is build, raised effort caps
  apply to build obstacles. If a phase implementation gets stuck,
  §SIM.8 PIVOT applies (research the problem class wider, decompose
  the phase further, reframe the phase, sleep on it). This is the
  "deep build" combination.
- In both cases, the loop continues until `H5W-BUILD.md` has zero
  TODO entries.

**Termination signals (BUILD-LOOP):**
- `H5W-BUILD.md` TODO/IN-PROGRESS count = 0
- Genuine wall (auth, network, requires-credit-card)
- `MAX_LOOPS` exhausted
- User-typed runway limit
- Explicit `BUILD-COMPLETE` marker in Claude's output

**NOT termination signals:** empty audit queue, "cycle 3 reached",
"no new actionable findings", "scope walls identified", "diminishing
yield." All of these were the audit-loop's give-up thresholds.
§BUILD-LOOP doesn't have them.

**When to use:**
- ✓ Implementing real features from a spec
- ✓ Multi-day work the audit-loop would call "scope walls"
- ✓ When you want to start building, not auditing
- ✓ When you've already audited and now you want to ship

**When NOT to use:**
- ✗ You actually want an audit pass — use plain UNCHAINED or
  UNCHAINED+BRAINSTORM
- ✗ The work is genuinely undefined — BUILD-LOOP needs at least
  the prompt to be specific enough to bootstrap H5W-BUILD.md

### Quick Reference

| User says | Claude routes to | Permission prompts | §META edits | autoloop flag |
|-----------|------------------|--------------------|-----------:|--------------:|
| "run H5W unchained autonomous mode :brainstorm :build" + `i accept full responsibility` + `this is my sandbox` + `ship features` | **§AUTO-UNCHAINED + §BRAINSTORM + §BUILD-LOOP** | suppressed | direct + mirror | `--permission-mode auto`, `MAX_LOOPS=200`, build queue |
| "run H5W unchained autonomous mode :build" + `i accept full responsibility` + `ship features` | **§AUTO-UNCHAINED + §BUILD-LOOP** | suppressed | direct + mirror | `--permission-mode auto`, build queue |
| "run H5W unchained autonomous mode :brainstorm" + `i accept full responsibility` + `this is my sandbox` | **§AUTO-UNCHAINED + §BRAINSTORM** | suppressed | direct + mirror | `--permission-mode auto`, `MAX_LOOPS=200` |
| "run H5W unchained autonomous mode" + `i accept full responsibility` | **§AUTO-UNCHAINED** | suppressed | direct + mirror | `--permission-mode auto` |
| "run H5W full autonomous mode" + `proceed` | **§AUTO FULL** | suppressed | proposed only | `--permission-mode auto` |
| "run autonomously" / "I'll be back" / "you decide" | §AUTO-GUIDED | active | proposed only | (default) |
| anything else autonomous-sounding | §AUTO-GUIDED | active | proposed only | (default) |
| no autonomous signal | interactive mode | active | n/a | n/a |

### Full Autonomous Execution Sequence — EVERY STEP IS MANDATORY

When §AUTO FULL is confirmed, Claude executes this EXACT sequence.
No step is optional. No step is skippable. Every step produces output.

```
FULL AUTONOMOUS SEQUENCE:
═══════════════════════════════════════════════════════════════

RESPONSE 1: SETUP
  □ Copy templates to project (H5W-LOG, QUEUE, ASSUMPTIONS, COMPACT-RESUME)
  □ Copy CLAUDE.md to project root (if not exists)
  □ Resolve git policy (§AUTO Git Branch Strategy): branch | main | none
  □ Apply policy: create branch h5w/auto-[date] OR stay on current branch OR skip git
  □ Fill §0 from codebase (read package.json/build.gradle, src structure)
  □ Run §I calibration (domain, architecture, scope, aesthetic)
  □ Log: AUTO CHECKPOINT [0] in H5W-LOG.md
  NEXT: baseline build check

RESPONSE 2: BASELINE BUILD
  □ Run build command (./gradlew assembleDebug OR npm run build)
  □ If fails → §BUILD-DIAG → fix → rebuild (may take multiple responses)
  □ If passes → baseline is green
  □ Check §DELIVER: does CI/CD exist? If NO → create (HIGH priority)
  NEXT: persona generation

RESPONSE 3: PERSONA GENERATION
  □ Generate 3 mandatory + 2 domain-specific personas (§SIM.1)
  □ Write walkthrough scripts for each persona
  □ Log personas in H5W-LOG.md
  NEXT: state space mapping

RESPONSE 4: STATE SPACE MAPPING
  □ Enumerate all screens/routes (§SIM.2 Step 1)
  □ Map state variables per screen (Step 2)
  □ Build transition matrix (Step 3)
  □ Mark investigation targets (Step 4)
  NEXT: walkthrough persona P1

RESPONSES 5-9: WALKTHROUGHS (one persona per response)
  □ P1: Stage 1 (Arrival) + Stage 2 (Interaction) + Stage 3 (Disruption) + Stage 4 (Edge)
  □ Apply all 6 lenses at each stage
  □ Write findings to H5W-QUEUE.md as discovered
  □ Repeat for P2, P3, P4, P5
  NEXT: walkthrough persona P[N+1] OR module routing

RESPONSE 10: MODULE ROUTING
  □ Count findings by type → route to appropriate modules
  □ 3+ code findings → spawn Agent for MOD-CODE audit
  □ 3+ visual findings → spawn Agent for MOD-DESG audit
  □ Structural issues → spawn Agent for MOD-REST diagnosis
  □ Pattern repetitions → spawn Agent for MOD-SCOP
  □ Module findings enter H5W-QUEUE.md
  NEXT: priority sort and fix F-001

RESPONSES 11+: FIX LOOP (one finding per response)
  □ Read target file
  □ Plan fix
  □ Execute fix
  □ §VER: Stage 1 (spec) + Stage 2 (quality) + Stage 3 (run build)
  □ §SIM.4: Micro-H5W (6 lenses on the fix)
  □ Log in H5W-LOG.md
  □ Every 5 fixes: write COMPACT-RESUME.md → /compact
  □ Hit obstacle? → §OBSTACLE (research → build → chain)
  NEXT: fix F-[next in queue]

WHEN QUEUE EMPTIES — ESCALATION (every step mandatory):
  □ §SIM.5 Step 2: Re-scan all modified files
  □ §SIM.5 Step 3: Scope expansion to adjacent files
  □ §SIM.5 Step 4: Depth escalation (optimization, a11y, polish, perf)
  □ §SIM.6: 50 Questions (one layer per response, all 5 layers)
  □ §SIM.7 R1: Domain deep dive (WebSearch + WebFetch)
  □ §SIM.7 R2: Competitive analysis (WebSearch + WebFetch)
  □ §SIM.7 R3: Audience deep dive (WebSearch)
  □ §SIM.7 R4: Technology research (per planned feature)
  □ §SIM.7 R5: Design research
  □ §SIM.7 R6: Convert research → findings → build top features
  □ §META: Self-audit skill for improvements from this session
  □ RESTART: New simulation (app has changed — find new issues)

RUNWAY LIMIT → REPORT:
  □ Write H5W-REPORT.md (comprehensive — from template)
  □ Write final H5W-QUEUE.md state
  □ Write final H5W-ASSUMPTIONS.md state
  □ Commit all changes to git branch
  □ State: RUNWAY LIMIT: [reason]

═══════════════════════════════════════════════════════════════
```

**"Literally everything possible" means every checkbox above gets checked.**
If a step is skipped, that's a violation. If the loop stops before
escalation, that's premature completion (anti-pattern #14). If research
is skipped, that's surrender (anti-pattern #15). If the build isn't run,
that's response bloat avoidance gone wrong (anti-pattern #16).

```
AUTONOMOUS SESSION START
─────────────────────────
Scope:           [from user or self-selected per §I.3]
Autonomy Level:  [GUIDED (default) | FULL (explicit phrase only)]
Session Budget:  [time horizon if stated, else "until done or blocked"]
Working Branch:  [from git policy: branch | main | none]
Report Target:   [H5W-REPORT.md — written at end]
─────────────────────────
Proceeding autonomously. Will report when done.
```

**On activation, Claude immediately:**
1. Locates skill directory: `find /mnt/skills -name 'SKILL.md' -path '*/h5w-unified/*'`
2. Copies working document templates to project: `cp templates/*.md ./`
3. Resolves git policy and applies it (see §AUTO Git Branch Strategy below).
   Default `branch` creates `git checkout -b h5w/auto-[date]`; `main` and `none`
   skip the branch creation. Project policy lives in `.h5w/git-policy`.
4. Fills §0 from codebase (first response)
5. Begins work (second response onwards)

### Autonomy Levels

| Level | What Claude Decides | What Waits for User | How Activated |
|-------|--------------------|--------------------|--------------|
| **FULL** | Everything T0–T2. Module routing. Scope expansion. Build decisions. §META proposals (no auto-merge). | T3 only (queued, not blocking) | **Literal phrase + `proceed` confirmation.** See Activation Gate. |
| **GUIDED** (default) | T0–T1. Module routing within stated scope. | T2+, scope changes, build architecture, §META edits to skill files | "you decide", "handle it", "I'll be back" — anything autonomous-sounding except the literal FULL phrase. |
| **SUPERVISED** | T0 only. | Everything else logged as recommendations | Explicit request: "supervised mode" / "review every change" |

**Default is GUIDED.** FULL is opt-in only via the Activation Gate. The
literal phrase is required because the autoloop wrapper passes
`--permission-mode auto` only in FULL — in GUIDED, Claude Code's normal
permission prompts remain active.

User can narrow either level: "autonomous but don't touch the API layer"
→ same level, T3 escalation on any API-touching change.

### The Five Rules of Autonomous Operation

**Rule 0 — Never End Without a Next Action (THE LOOP RULE)**
Every response in §AUTO mode MUST end with an explicit next action statement.
This is what keeps the loop alive. Without it, Claude stops and waits.

```
WRONG (Claude stops):
  "I've fixed F-012 and F-013. The empty states are now handled correctly."
  [Claude waits for user input]

RIGHT (Claude continues):
  "Fixed F-012 and F-013. Empty states handled.
   NEXT: F-014 (race condition in team deletion) — reading TeamService.js now."
  [Loop continues to next iteration]
```

The last line of EVERY response must be one of:
- `NEXT: [specific action — what file to read, what finding to fix]`
- `NEXT: Queue empty — starting §SIM.5 re-scan on modified files`
- `NEXT: §SIM.6 Layer [N] — checking [specific question]`
- `NEXT: §SIM.7 R[N] — researching [topic]`
- `NEXT: Compacting — writing COMPACT-RESUME.md first`
- `RUNWAY LIMIT: [reason] — writing H5W-REPORT.md` (only true termination)

If Claude forgets this rule and ends without NEXT: → the autoloop wrapper
sends "continue" which re-activates the loop.

**Rule 0b — One Unit of Work Per Response (THE PACING RULE)**
API timeouts are the #1 killer of autonomous sessions. A response that tries
to do everything at once will be cut off mid-execution, losing work and
breaking the loop.

**One response = ONE of these:**
- Read a file + plan a fix for ONE finding
- Execute + verify ONE fix + log it + micro-H5W
- Generate personas OR map state space (not both)
- Run ONE walkthrough stage for ONE persona
- Check ONE layer of the 50 Questions (10 questions, not 50)
- Research ONE topic from §SIM.7
- Build ONE stage of an §OBSTACLE pipeline

**Target response length: 100–300 lines.** Not 30 (too short — wasted turn).
Not 500+ (timeout risk). Medium, focused, complete.

**Chunking rules for large operations:**

| Operation | How to Chunk |
|-----------|-------------|
| §0 filling + classification | Response 1: read codebase, fill §0. Response 2: classify + generate personas. |
| Walkthrough (5 personas × 3 entries) | One persona per response. 5 responses total. |
| Finding generation (20+ findings) | Report findings as you find them during walkthrough — not all at end. |
| 50 Questions | One layer (10 questions) per response. 5 responses for all layers. |
| §SIM.7 Research | One research phase (R1–R6) per response. |
| §BUILD scaffold | One section per response (files, then config, then CI, then tokens). |
| Large fix (multi-file) | Response 1: plan + first file. Response 2: remaining files + verify. |

**Why this matters:** The autoloop wrapper (`h5w-autoloop.sh`) sets
`--max-turns 15` per iteration. Each iteration = one response from Claude
+ up to 15 tool calls within that response. If Claude tries to do 50 things
in one response, it hits the turn limit or the API timeout. One unit of work
per response keeps the loop stable across hours of operation.

**Rule 1 — Never Stop, Always Log**
Checkpoints (§SIM.5) switch from STOP-AND-ASK to LOG-AND-CONTINUE.
Instead of printing "Continue? [yes/no]" and waiting, Claude:
- Writes the checkpoint report to H5W-LOG.md
- Continues to the next cycle
- Stopping only on termination triggers (see below)

**Rule 2 — T3 Items Queue, Don't Block**
When a T3 decision is encountered:
- Log it in H5W-QUEUE.md with tag `[T3-BLOCKED]`
- Log the full context: what decision is needed, what the options are, Claude's recommendation
- SKIP to the next non-blocked finding
- Continue working on everything that ISN'T blocked by T3
- T3 items are presented in the final report for user decision

**Rule 3 — No Questions, Best Judgment**
In autonomous mode, Claude NEVER uses `AskUserQuestion`. Instead:
- Make the best decision based on available evidence
- Log the decision and rationale in H5W-LOG.md
- Tag: `[AUTO-DECIDED: chose X because Y. Override if wrong.]`
- If confidence < 3/5 → also log in H5W-ASSUMPTIONS.md

**Rule 4 — Self-Correct Before Moving On**
After every fix, the verification protocol (§VER) runs. If verification FAILS:
```
SELF-CORRECTION PROTOCOL:
  Attempt 1: Revert the fix. Re-read the code. Re-plan from scratch.
  Attempt 2: Try alternative approach (different fix strategy).
  Attempt 3: If still failing → log as [STUCK], add to T3 queue,
             move to next finding. Do NOT keep retrying.
```
Maximum 3 attempts per finding. After 3 failures → skip and log.

**Rule 5 — Manage Context Proactively**
### Context Window Management — Structured Compaction

Long autonomous sessions WILL exceed context. This is not a failure — it's
expected. Compaction is a scheduled maintenance operation, not an emergency.

**COMPACTION SCHEDULE:**

| Trigger | Action |
|---------|--------|
| After every 5 fixes | Evaluate: is context > 60% capacity? If yes → compact. |
| After every Phase completion (1→2, 2→3, etc.) | Mandatory compact. |
| After every module unload (finished with MOD-CODE, etc.) | Compact. |
| After every §SIM.5 escalation stage | Compact before next stage. |
| Before loading a large module reference file | Compact first. |
| Whenever Claude notices repetition in its own output | Emergency compact. |

**In practice: compact roughly every 3–5 cycles.** Don't wait until context
is full. Proactive compaction preserves coherence. Reactive compaction loses state.

**PRE-COMPACTION PROTOCOL (write to files BEFORE compacting):**

```
BEFORE /compact or context reset:
  1. Write FULL current state to H5W-LOG.md:
     - What phase am I in?
     - What was I working on (current finding ID)?
     - What files have I modified this session? (list all)
     - How many findings fixed / queued / blocked?
     - Which modules have been loaded and unloaded?
     - What assumptions are active?
     - What §OBSTACLE tools were built?

  2. Write queue state to H5W-QUEUE.md:
     - Current priority-sorted queue (must be up to date)

  3. Write assumptions to H5W-ASSUMPTIONS.md:
     - All active assumptions with confidence

  4. Write a COMPACT-RESUME.md file:
     ───────────────────────────────────
     COMPACT RESUME POINT
     ───────────────────────────────────
     Session:     [app name, mode, scope]
     Phase:       [current phase number and name]
     Current Fix: [F-NNN — what I was working on]
     Next Action: [exactly what to do next after resuming]
     Files Changed: [list every file modified]
     Modules Used: [which modules loaded this session]
     Cycles Completed: [N]
     Fixes Applied: [N]
     Queue Size: [N remaining]
     T3 Blocked: [N]
     Context Note: [anything important that's in context
                    but not in files — conversations, decisions]
     ───────────────────────────────────

  5. THEN run /compact (CLI) or summarize and discard (web)
```

**POST-COMPACTION PROTOCOL (reload state AFTER compacting):**

```
AFTER /compact or context reset:
  1. Read COMPACT-RESUME.md — this tells you where you are
  2. Read H5W-QUEUE.md — this is your work queue
  3. Read H5W-ASSUMPTIONS.md — these are active beliefs
  4. Read the LAST 20 lines of H5W-LOG.md — recent context
  5. Read §0 in SKILL.md — app identity (always needed)
  6. DO NOT re-read module reference files unless needed for next fix
  7. DO NOT re-read files you've already modified unless the next fix
     touches them
  8. Resume from "Next Action" in COMPACT-RESUME.md

  FIRST ACTION after resume: log in H5W-LOG.md:
  "[COMPACTED] Resumed from COMPACT-RESUME.md. Cycle [N].
   Context was at ~[X]% capacity. State restored from files."
```

**COMPACT-RESUME.md is the brain transplant file.** Everything Claude needs
to continue working after losing its in-context memory goes here. It must
be written BEFORE every compaction and read AFTER every compaction.

**What survives compaction (in files):**
- Full finding queue (H5W-QUEUE.md)
- Full assumption list (H5W-ASSUMPTIONS.md)
- Full activity log (H5W-LOG.md)
- Resume point (COMPACT-RESUME.md)
- §0 context (SKILL.md)
- All code changes (in the actual files)

**What is lost and must be recovered:**
- Which module sections were relevant (re-derive from next finding)
- Detailed reasoning about past fixes (summarized in LOG)
- Conversation context with user (irrelevant in §AUTO mode)

**Context Budget Rules:**
- Module reference files (2,000+ lines each) are the biggest context consumers.
  Load ONLY when needed. Read ONLY the relevant sections (grep for § codes).
  Unload after use (don't keep in context).
- After unloading a module: compact.
- COMPACT-RESUME.md + H5W-QUEUE.md + H5W-LOG.md (tail) = ~200 lines.
  This is the minimum context needed to continue. Everything else is on-demand.

### Autonomous Checkpoint (replaces §SIM.5 in auto mode)

Instead of stopping, Claude writes to H5W-LOG.md:

```
──── AUTO CHECKPOINT [N] ────
Time: [timestamp]
Cycle: [N] | Files changed: [N] | Findings fixed: [N]
Queue: [remaining] | Blocked: [T3 count]
Context health: [ok / compacting / heavy]
Re-scans completed: [N] (0 = first pass still running)
Decision: [continuing to cycle N+1 / re-scanning / expanding scope / escalating depth / hit runway limit]
────────────────────────────
```

### Autonomous Module Routing

In autonomous mode, Claude doesn't ask which module — it routes based on
the finding pattern:

| Pattern Detected | Action |
|-----------------|--------|
| No CI/CD or delivery infrastructure | Run §DELIVER FIRST — before any feature work |
| 3+ code quality findings | Load MOD-CODE, run relevant dimensions |
| 3+ visual findings in same area | Load MOD-DESG, run targeted analysis |
| Structural anti-patterns found | Load MOD-REST, run diagnosis |
| 3+ instances of same pattern | Load MOD-SCOP, run concept scaffold |
| All modules return clean | Expand scope to adjacent areas |
| §SIM.6 exhausted (50 Questions done) | Activate §SIM.7 Research & Study |
| §SIM.7 produces features | Build highest-value features |
| App work complete, runway remains | Activate §META — self-audit skill for improvements |

No confirmation needed. Log the routing decision in H5W-LOG.md.

### Autonomous Build (§BUILD in auto mode)

Build gates that normally require user approval become:

| Gate | Normal Mode | Autonomous Mode |
|------|------------|-----------------|
| B1 Discovery brief | User approves | Claude writes best brief, logs `[AUTO-DECIDED]`, proceeds |
| B2 Architecture | User approves | Claude selects per decision trees, logs all decisions |
| B3 Design system | User approves | Claude runs MOD-ART with best judgment, logs results |
| B5 Per-feature | User reviews | Gate auto-passes if all checks ✓, fails → self-correct |
| B9 Launch gate | User signs off | Claude runs all checks, presents results in report |

### Termination Triggers

Claude stops autonomous execution ONLY when hitting a runway limit.
**There is no "I'm done" trigger.** Queue empty → re-scan → scope expand →
depth escalate → 50 Questions → research (§SIM.5 Continuous Improvement Loop).

| Runway Limit | What Happens |
|-------------|-------------|
| All remaining items are T3-blocked | Nothing Claude can do alone. Write report, wait. |
| Context window approaching limit | Compact, write progress report, indicate "resume needed" |
| Self-correction failures > 5 total | System hitting issues it can't solve. Write report. |
| Build/compile error unrecoverable | Revert last change. Write report. |
| Time budget exhausted | If user set a time horizon — respect it. |
| User returns | Switch to interactive mode. Present report. |

**If none of these fire, keep working.**

### REAL vs FAKE Runway Limits

Claude's #2 autonomous failure (after premature completion) is inventing
a reason to stop that SOUNDS legitimate but isn't.

**These are FAKE — never valid reasons to stop:**

| Claude Says | Why It's Fake | What to Do Instead |
|------------|---------------|-------------------|
| "This feature is too large for this session" | Size isn't a limit. Compaction handles context. | Break into pieces. Build piece 1. Compact. Continue. |
| "Multi-day work that doesn't fit the context budget" | Context budget is managed by compaction, not by quitting. | Write COMPACT-RESUME.md. Compact. Resume. Keep building. |
| "This would require a separate session" | Sessions span compactions via COMPACT-RESUME.md. | There is no session boundary. Compact and continue. |
| "Beyond the scope of this improvement pass" | Scope expands automatically (§SIM.5 step 3). | The improvement loop has no scope ceiling. |
| "This is more of a v2.0 feature" | Version labels are the user's decision, not Claude's. | Log as enhancement. Build it if §AUTO FULL. |
| "I've done significant work, updating the report" | "Significant" is not a stop condition. | Check actual runway. Context ok? Continue. |
| "The remaining improvements are more complex" | Complexity isn't a stop condition. §OBSTACLE exists. | Break down. Spike if uncertain. Build. |
| "Good stopping point to review" | There are no "good stopping points" in §AUTO. | Runway limits are the ONLY stopping points. |
| "Let me wrap up and summarize" | Summarizing is quitting with extra steps. | Write to H5W-LOG.md (ongoing), don't "wrap up." |

**The test for a REAL runway limit:** Can Claude literally not continue?
- Context window ACTUALLY full (not "might be getting heavy" — check)
- Build ACTUALLY unrecoverable after 5 §BUILD-DIAG cycles (not "seems hard")
- ALL remaining items ACTUALLY require T3 permission (not "some do")
- Time budget ACTUALLY expired (not "we've been working a while")

If Claude can still read files, write code, and run builds → **continue.**
"Seems like a good stopping point" is NEVER a runway limit. It is anti-pattern #17.

### Build Error Handling (§AUTO)

**Use §BUILD-DIAG (in §VER section).** Static analysis is primary — Claude
finds errors by reading code, not by waiting for builds to fail.

In §AUTO mode:
- Run §BUILD-DIAG Step 1 (static scan) after every multi-file change
- If CI is available, push and check results via `gh run list --limit 1`
- If CI fails, read logs: `gh run view [id] --log-failed`
- Pre-existing errors → HIGH finding, fix before feature work
- After 5 failed fix attempts → forensics, then continue other work

### Git Branch Strategy (§AUTO) — configurable

Default behavior is project-dependent. On activation, Claude reads
project policy in this order:

1. **`.h5w/git-policy`** in the project root (highest priority — file content is one of):
   - `branch` — create `h5w/auto-[date]-[scope]`, work there, merge later
   - `main`   — work directly on the current branch (typically `main`)
   - `none`   — do not run any git commands; log file changes in H5W-REPORT.md only
2. **`H5W_GIT_POLICY` environment variable** if the file is absent (same values).
3. **Default if neither is set:** `branch`.

```
RESOLUTION:
  if [ -f .h5w/git-policy ]; then policy=$(cat .h5w/git-policy)
  elif [ -n "$H5W_GIT_POLICY" ]; then policy=$H5W_GIT_POLICY
  else policy=branch
  fi
```

**Why this matters.** Some projects (e.g. preview-deploy tools, personal
sandboxes, single-author repos) merge directly to `main`. Forcing a branch
on those creates surprise diffs. Some projects must always branch (team
repos with PR review). The policy file lets the project owner decide
once and forget — Claude obeys.

```
policy=branch:
  git checkout -b h5w/auto-[date]-[scope]
  # All autonomous work happens here
  # User reviews branch, merges to main when satisfied

policy=main:
  # Work directly on current branch
  # Atomic commits per fix (Law 5/8 still apply)
  # Push freely if upstream is configured

policy=none:
  # No git commands at all
  # Log every file changed in H5W-REPORT.md
  # User reviews via diff tool of choice
```
If git is not available (no repo), behave as `policy=none`.

### The Autonomous Report (H5W-REPORT.md)

Written at session end. This is what the user reads when they return.

```markdown
# H5W Autonomous Session Report

## Session Parameters
- Started: [timestamp]
- Scope: [what was worked on]
- Autonomy: [FULL/GUIDED/SUPERVISED]
- Termination: [why it stopped]

## Executive Summary
[3-5 sentences: what was accomplished, what remains, what needs your decision]

## What Was Done
[chronological list of all fixes applied, grouped by area]

### Fixes Applied ([count])
| ID | Sev | File | Summary | Verified |
|----|-----|------|---------|----------|
| F-001 | high | TeamCard.jsx:84 | Added empty state | ✓ |
| ...

### Modules Invoked ([count])
| Module | Why | Findings Produced |
|--------|-----|-------------------|
| MOD-CODE | 4 code quality findings | F-020 through F-025 |
| ...

## What Needs Your Decision ([count] T3 items)
| ID | Decision Needed | Claude's Recommendation | Why T3 |
|----|----------------|------------------------|--------|
| F-005 | Delete legacy export? | Keep it (users may depend) | Irreversible |
| ...

## Autonomous Decisions Made ([count])
[Every [AUTO-DECIDED] item — review these for correctness]
| Decision | Rationale | Confidence | Override? |
|----------|-----------|------------|-----------|
| Stack: Next.js | SEO needed, React ecosystem | 4/5 | Change if wrong |
| ...

## What Remains
- Queue: [N] findings remaining
- Assumptions: [N] active (review H5W-ASSUMPTIONS.md)
- Recommended next: [what to focus on]

## Files Changed
[git diff --stat or equivalent]

## How to Review
1. Read "What Needs Your Decision" — resolve T3 items
2. Scan "Autonomous Decisions" — override any you disagree with
3. Run the app — verify nothing feels wrong
4. Say "continue" to resume, or "revert [F-NNN]" to undo specific fixes
```

### Context Strategy (see §AUTO Rule 5 for full protocol)

```
COMPACTION SCHEDULE:
  - Every 5 fixes → evaluate
  - Every phase completion → mandatory compact
  - Every module unload → compact
  - Before loading large module → compact first
  - Write COMPACT-RESUME.md BEFORE every compaction
  - Read COMPACT-RESUME.md AFTER every compaction
  - Module files: grep for § codes, read sections, not whole file
```

### Integration with Existing Protocols

| Protocol | Interactive Mode | Autonomous Mode |
|----------|-----------------|-----------------|
| §SIM.5 Checkpoints | Stop, report, wait | Log, continue |
| §SIM.6 Anti-Exhaustion | Mandatory before "no findings" | Mandatory — runs automatically |
| §SIM.7 Research | User-triggered or after §SIM.6 | Auto-triggers after §SIM.6 exhausts code-level |
| §OBSTACLE MacGyver | Activates on any limitation | Auto-resolves: 3 attempts, then T3 queue |
| §META Self-improve | User-triggered | Auto-triggers after app work if runway remains |
| §REV T3 decisions | Stop, ask | Queue, skip, report at end |
| §BUILD gates | User approves | Auto-pass with logging |
| §WORKFLOW handoffs | May ask which module | Auto-route by pattern |
| §VER failures | Report to user | Self-correct (3 attempts) |
| §SESSION continuity | Resume on user command | Resume automatically |
| `AskUserQuestion` | Used freely | **NEVER used** |

