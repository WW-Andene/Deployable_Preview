# H5W Unified System — Changelog

## v1.4.0 — §BUILD-LOOP modifier (build features, not audit)

Adds **§BUILD-LOOP** — a primary-loop modifier on top of UNCHAINED that
switches the autoloop's primary work source from `H5W-QUEUE.md` (audit
findings) to `H5W-BUILD.md` (build tasks). For sessions where the goal
is shipping features, not auditing existing code.

### The problem this release closes (SF-021)

The skill went through three audit cycles (v1.0.0→v1.1.0, v1.1.1,
v1.3.1). Across all of them, the autoloop assumed the work was an
**audit cycle** — find issues, fix issues, micro-H5W, repeat until
queue empties. When the work was instead "build feature X from spec,"
the loop terminated at "no new actionable findings" / "scope walls
identified" with the multi-day work still unimplemented.

The user named this directly: "what the point if i cant start going
seriously into work?" The audit-loop's "scope walls" framing was wrong
for build sessions — those weren't walls, they were the work.

§BUILD-LOOP fixes this. The loop's idea of "done" changes from "audit
candidates exhausted" to "build queue (`H5W-BUILD.md`) has zero TODO
entries."

### Activation (three-phrase gate, parallel to BRAINSTORM)

- Append `:build` to the UNCHAINED prompt.
- At the UNCHAINED gate, type `i accept full responsibility`.
- At the BUILD secondary gate, type `ship features`.

`:build` is independent of `:brainstorm` — they can be combined.

```
./h5w-autoloop.sh "run H5W unchained autonomous mode :build implement multi-monitor support"
  → UNCHAINED gate: 'i accept full responsibility'
  → BUILD gate: 'ship features'
  → §AUTO-UNCHAINED + §BUILD-LOOP active

./h5w-autoloop.sh "run H5W unchained autonomous mode :brainstorm :build implement notification reply"
  → UNCHAINED gate: 'i accept full responsibility'
  → BRAINSTORM gate: 'this is my sandbox'
  → BUILD gate: 'ship features'
  → §AUTO-UNCHAINED + §BRAINSTORM + §BUILD-LOOP (deep build)
```

### What BUILD-LOOP changes

| Aspect | Standard (audit) loop | §BUILD-LOOP |
|--------|------------------------|-------------|
| Primary work source | `H5W-QUEUE.md` (audit findings) | `H5W-BUILD.md` (build tasks) |
| Empty audit queue | terminates session (or scope-expand) | continues — audit empty is not done |
| Iron Law 10 cycle counter | "3 cycles → checkpoint" applies | does not apply to phase progression |
| "Multi-day feature" | reported as scope wall, queued for later | broken into phases, started immediately |
| Termination | empty audit queue + scope-expand exhausted | empty `H5W-BUILD.md` (zero TODO entries) |
| Audit findings during build | primary work | logged as opportunistic notes to `H5W-QUEUE.md` |

### Queue convention (`H5W-BUILD.md`)

```markdown
## Build Queue

| ID | Feature | Phase | Status | Notes |
|----|---------|-------|--------|-------|
| B-001 | Multi-monitor support | 1 — detect displays | TODO | DisplayManager research |
| B-001 | Multi-monitor support | 2 — render placement | TODO | depends on phase 1 |
| B-002 | Notification reply | 1 — RemoteInput intent | TODO | API 24+ |

## Completed
```

Status values: TODO → IN-PROGRESS → DONE (after build + verify +
commit) or BLOCKED.

### Phase discipline

Each B-NNN entry is broken into 2-5 phases. A phase is DONE only when:
- The code compiles/builds clean
- The new functionality is exercised at least once (manual run, test
  invocation, or §VER trace through the code paths)
- The change is committed per `.h5w/git-policy`

"I wrote the code" alone is IN-PROGRESS until verified.

### Bootstrap

If `H5W-BUILD.md` doesn't exist when §BUILD-LOOP activates, the
autoloop's first iteration creates it from the user's prompt —
translating the stated goal into 2-5 phased build tasks. A template
is provided at `templates/H5W-BUILD.md.template` with the table format,
status values, and phase decomposition heuristic.

### What does NOT change in BUILD-LOOP

- All Iron Laws (1-12) apply at UNCHAINED's relaxation level.
- All BRAINSTORM honesty floor rules apply when combined with
  `:brainstorm`.
- `.h5w/git-policy` is still respected.
- Anthropic-side rate limits / quotas still apply.
- Genuine walls (auth, captcha, paid-account, blocked egress) are
  still flagged honestly. BUILD-LOOP doesn't pretend impossibilities
  are tractable — it just refuses to call multi-day feature work
  "out of scope."

### Termination signals (BUILD-LOOP)

- `H5W-BUILD.md` TODO/IN-PROGRESS count = 0
- Genuine wall (auth, network, requires-credit-card)
- `MAX_LOOPS` exhausted
- User-typed runway limit
- Explicit `BUILD-COMPLETE` marker in Claude's output

**NOT termination signals:** empty audit queue, "cycle 3 reached", "no
new actionable findings", "scope walls identified", "diminishing
yield." All of these were the audit-loop's give-up thresholds.
§BUILD-LOOP doesn't have them.

### Test coverage (48/48 cases pass)

`scripts/h5w-test-gate.sh` extended with 12 new BUILD cases on top of
v1.3.1's 36:
- Full happy path (three-phrase gate completes)
- Case-insensitive on both confirms
- BUILD confirm wrong → drops to UNCHAINED only
- UNCHAINED confirm wrong → drops to GUIDED, BUILD never reached
- `:buildy` and `test:buildstuff` boundary cases (substring rejection)
- `:build` with FULL phrase ignores BUILD (UNCHAINED-only modifier)
- All-three-modifiers (UNCHAINED + BRAINSTORM + BUILD) TRIPLE cases
  including partial-confirm rejection of individual modifiers
- `--resume --unchained --build` and `--resume --unchained --brainstorm
  --build` resume paths

New helpers in test infrastructure: `run_build_case`, `run_full_combo_case`,
`run_case4`.

### Validator additions (3 new checks)

- **6o:** BUILD gate has flag + distinct confirmation phrase in source.
- **6p:** `templates/H5W-BUILD.md.template` exists (bootstrap available).
- **6q:** §BUILD-LOOP documented in SKILL.md and auto-mode.md.

### Files changed

```
SKILL.md                              +57 lines  (§BUILD-LOOP section, five-mode escalation table, QUICK START update)
references/auto-mode.md               +95 lines  (§BUILD-LOOP full section + Quick Reference rows)
h5w-autoloop.sh                      +180 lines  (BUILD config, BUILD detection block, BUILD AUTO_RULES injection, mode-aware STOP_PATTERNS, MODE_REMINDER append, BUILD CONT routing, BUILD resume flags, summary banner)
scripts/h5w-test-gate.sh              +85 lines  (12 BUILD test cases + run_build_case + run_full_combo_case + run_case4 helpers + stub extension)
scripts/h5w-validate.sh               +30 lines  (checks 6o, 6p, 6q)
templates/H5W-BUILD.md.template       NEW (60 lines, queue format + bootstrap notes)
CHANGELOG.md                         +160 lines  (this entry)
```

### Validator on v1.4.0

```
PASSED — 0 errors, 0 warnings (after CHANGELOG line-count update)
=== Activation Gate ===
  ✓ Activation gate: 48 cases pass
```

### Note from author

The user ran an UNCHAINED+BRAINSTORM session and hit the ceiling at
cycle 3 with 8 verified fixes from 30+ candidates. The session output
read "scope walls identified for next sprint" — but those scope walls
(multi-monitor, notification reply, find-my-phone) were exactly the
work the user wanted to do. The audit-loop terminated correctly per
its own logic; the logic was wrong for the use case.

I missed this in three meta-audit cycles because I was auditing the
audit machinery and not asking whether the audit framing was right
for what the user actually wanted to ship. SF-021 names the missing
piece: an autoloop primary-loop pivot for build sessions. v1.4.0 is
what closing it looks like.

The five-mode escalation now has six configurations:

| Configuration | Primary loop | When to use |
|---------------|--------------|-------------|
| GUIDED | audit | default — supervised audit/improve work |
| FULL | audit | unattended audit/improve, conservative |
| UNCHAINED | audit | unattended audit/improve, no T3 gate |
| UNCHAINED + BRAINSTORM | audit | "push past STUCK" audit work |
| **UNCHAINED + BUILD** | **build** | **ship features from spec** |
| **UNCHAINED + BRAINSTORM + BUILD** | **build** | **deep build of multi-day features** |

The bottom row is the deepest configuration. UNCHAINED removes the
safety guards. BRAINSTORM removes the politeness give-up thresholds.
BUILD pivots the loop's idea of "done" from audit-empty to
build-empty. Together they're what "let me start going seriously
into work" actually requires.

### Chief Guide — 2,352 lines (post-split, post-meta-audit ×2, post-UNCHAINED, post-BRAINSTORM, post-BUILD)

---

## v1.3.1 — Meta-audit response (self-audit on v1.3.0)

Ran §META on v1.3.0 (the BRAINSTORM release). Validator passed clean
with the new check 6j catching only the three components it was
designed for. The meta-audit found **8 SF findings the validator
couldn't see** — primarily about the new modes' interaction with
existing operational lifecycle (subagent dispatch, internal
compaction, module loading).

This is the third audit-then-fix pass on the skill. Pattern continues:
validator stamps `PASSED` on the structure; semantic and operational
drift go undetected until §META runs.

### Findings closed (8 of 8)

**SF-017 (HIGH) — Mode awareness lost on compaction.**
The autoloop's `AUTO_RULES` injection happens **only at iteration 1**;
subsequent CONT messages were just "Continue. NEXT: [action]." When
Claude internally compacted (every ~5 fixes per the docs), the
AUTO_RULES context was summarized away and Claude reverted to default
§AUTO behavior — losing UNCHAINED's relaxed Iron Laws, BRAINSTORM's
raised effort caps, and §SIM.8 routing. Long BRAINSTORM sessions
silently downgraded to plain §AUTO post-compaction. **Fix:** added
`MODE_REMINDER` variable constructed once with the active mode's rule
pointer, **appended to every CONT message**. Token cost ~30-50 per
iteration vs full re-injection. Mode awareness now survives compaction.

**SF-011 (HIGH) — Iron Laws stated absolute, overridden silently.**
SKILL.md stated Laws 6, 7, 9 with absolute language ("must not", "no
exceptions"). The autoloop's UNCHAINED injection demoted them to
advisories. Subagents loading SKILL.md fresh, or post-compaction
Claude, had no signal these laws were mode-conditional. **Fix:** added
per-law caveats `(In UNCHAINED+: advisory only — see §AUTO)` to Laws
6, 7, 9; added new "Law application by mode" subsection at the end of
the Iron Laws block with an explicit per-mode enforcement table.
Includes safe-fallback note: "When in doubt, default to the enforced
interpretation. The mode override is opt-in; the absolute reading is
the safe fallback."

**SF-013 (MEDIUM) — BRAINSTORM effort caps were instructional only.**
"20 attempts," "10 obstacle attempts," "≥5 different approach classes"
existed only as text in `AUTO_RULES`. No counter, no enforcement.
**Fix:** added `scripts/h5w-brainstorm-check.sh` — best-effort helper
that scans H5W-LOG.md for `[APPROACH-N: <class> — <result>]` tags,
counts distinct class strings, and refuses GENUINELY-STUCK if fewer
than 5 distinct classes are logged. Wired into the autoloop's
between-iteration check. Best-effort: it nudges, doesn't force, since
"different class" is semantic. Three exit codes (0=allowed,
1=push-back, 2=log-missing) tested directly.

**SF-014 (LOW-MED) — SLEEP-ON-IT had no reminder mechanism.**
§SIM.8 step 4 wrote BRAINSTORM-NOTES.md and required Claude to
remember to re-read after ≥3 iterations. Across compaction this
state was lost. **Fix:** autoloop's CONT message now includes a
reminder when BRAINSTORM-NOTES.md exists.

**SF-015 (MEDIUM) — Self-modifying-loop hazard.**
UNCHAINED+BRAINSTORM permitted §META to direct-edit any skill file,
including the activation gate text and Iron Laws section. Claude could
rewrite its own gate mid-session. **Fix:** carved out four protected
sections in both AUTO_RULES injection and references/auto-mode.md:
Risk Acknowledgment heredocs, Iron Laws section, activation
requirements (trigger/confirmation phrases), AUTO_RULES injection
block itself. Edits to those sections fall back to proposal-only
even in UNCHAINED+BRAINSTORM. Other parts remain direct-editable.

**SF-016 (MEDIUM) — Module headers overgeneralized.**
All 6 module files had `In §AUTO mode: AskUserQuestion is overridden`
— but "§AUTO mode" includes GUIDED, where AskUserQuestion is
explicitly allowed. **Fix:** mass-replaced "In §AUTO mode" → "In §AUTO
FULL or UNCHAINED" across all 6 modules. Validator existing check
updated to accept the new phrasing alongside the old one.

**SF-018 (LOW) — `:brainstorm` flag substring match.**
Same class as v1.1.1's SF-004 (metalinguistic trigger). Embedded
usage like `:brainstormy` or `test:brainstormstuff` activated the
flag detection. **Fix:** tightened to require whitespace boundary
or end-of-string (`grep -qiE "(^|[[:space:]])${BRAINSTORM_FLAG}([[:space:]]|$)"`).
Three new gate test cases (`:brainstormy`, `test:brainstormstuff`,
`:brainstorm at end of prompt`) — all routing correctly. Test count
now 36/36.

**SF-012 (LOW-MED) — UNCHAINED documentation oversold.**
v1.2.0 docs claimed UNCHAINED "loops more" past STUCK, but its
STOP_PATTERNS still include `^STUCK.*cannot proceed`. UNCHAINED's
runway advantage is mostly MAX_LOOPS=60 vs FULL's 30. The actual
"push past STUCK" behavior is BRAINSTORM. **Fix:** added "WHAT
UNCHAINED DOES NOT CHANGE" block to UNCHAINED Risk Acknowledgment
clarifying that STUCK still terminates at the 3-attempt cap and
referring users to BRAINSTORM for the give-up-threshold removal.

### Validator additions (5 new checks)

- **6k:** Iron Laws declare mode-conditionality (SF-011 regression net)
- **6l:** Module headers correctly scope §AUTO to FULL/UNCHAINED (SF-016)
- **6m:** MODE_REMINDER constructed in CONT messages (SF-017)
- **6n:** scripts/h5w-brainstorm-check.sh exists (SF-013)
- Existing check 4 updated to accept both old and new §AUTO override phrasing

### Test coverage

`scripts/h5w-test-gate.sh` extended to 36 cases (was 33 in v1.3.0):
- 3 new SF-018 boundary cases for `:brainstorm` flag tightening

### Files changed

```
SKILL.md                            +47 lines  (SF-011: per-law caveats + "Law application by mode" subsection)
references/auto-mode.md             +18 lines  (SF-015: protected sections table)
references/mod-*.md                  0 net    (SF-016: 6 header rewrites)
h5w-autoloop.sh                    +60 lines  (SF-012, SF-014, SF-015, SF-017, SF-018)
scripts/h5w-brainstorm-check.sh    NEW (53 lines, SF-013 helper)
scripts/h5w-test-gate.sh           +35 lines  (3 SF-018 cases + test stub fix)
scripts/h5w-validate.sh            +50 lines  (checks 6k/6l/6m/6n + check 4 update)
META-AUDIT-REPORT-v1.3.0.md        NEW       (full §META findings report)
CHANGELOG.md                       +130 lines (this entry)
```

### Validator on v1.3.1

```
PASSED — 0 errors, 0 warnings (after CHANGELOG line-count update)
=== Activation Gate ===
  ✓ Activation gate: 36 cases pass
```

### Honest take

The pattern across three audit cycles (v1.0.0→v1.1.0, v1.1.0→v1.1.1,
v1.3.0→v1.3.1) is consistent: **a release lands, validator says
PASSED, §META on the same release finds 8-10 real issues**. Most are
not "wrong code" — they're integration drift between newly-added
features and existing operational lifecycle (compaction, subagents,
module loading). The validator catches what it was designed to catch;
new code introduces new failure surfaces it wasn't.

The fix isn't just "do more validation" — that's a treadmill. The
real lesson: the audit-then-fix cycle should be the default release
process, not an emergency response. Every minor version should ship
with a §META pass on itself, even when the changes look small.

This release is the result of taking that seriously.

### Chief Guide — 2,296 lines at v1.3.1 (superseded — see v1.4.0 entry)

---

## v1.3.0 — §BRAINSTORM modifier (closed-sandbox deep-work)

Adds **§BRAINSTORM** — a behavioral modifier that attaches to UNCHAINED.
For closed local sandboxes where the user wants Claude to brainstorm
itself harder rather than politely bail on hard problems. The user is
the only one who eats the cost of failure and explicitly wants to see
how far the system can actually go.

§BRAINSTORM is **not a fourth mode** — it's an effort-cap reconfiguration
on top of UNCHAINED. UNCHAINED removes the safety guards; BRAINSTORM
removes the give-up thresholds.

### Activation (three-phrase gate)
- Append `:brainstorm` to the UNCHAINED prompt.
- At the UNCHAINED gate, type `i accept full responsibility`.
- At the BRAINSTORM secondary gate, type `this is my sandbox`.
- Anything else at either gate downgrades or stays in plain UNCHAINED.

```
./h5w-autoloop.sh "run H5W unchained autonomous mode :brainstorm <task>"
  → UNCHAINED gate: 'i accept full responsibility'
  → BRAINSTORM gate: 'this is my sandbox'
  → §AUTO-UNCHAINED + §BRAINSTORM active
```

### What BRAINSTORM raises (effort caps)

| Cap | UNCHAINED | UNCHAINED + BRAINSTORM |
|-----|-----------|------------------------|
| Self-correction attempts per finding | 3 | 20 (each must use a different approach class) |
| §OBSTACLE attempts per obstacle | 3 | 10 (must span ≥5 different approach classes) |
| Session-failure runway limit | 5 → end session | removed |
| Stop patterns in autoloop | UNCHAINED set | only context-full / RUNWAY LIMIT / wall-clock cap |
| `MAX_LOOPS` | 60 | 200 |
| STUCK behavior | log + queue + move on | route to **§SIM.8 BRAINSTORM-PIVOT** |
| 'I think I'm done' behavior | check §SIM.6 then declare done | check §SIM.6 → §SIM.7 → §SIM.8 before any 'done' state |

### §SIM.8 — BRAINSTORM-PIVOT (new escalation, BRAINSTORM only)

When STUCK on an obstacle that has exhausted §OBSTACLE attempts at
BRAINSTORM's raised caps, run §SIM.8 instead of declaring failure:

1. **RESEARCH WIDER** — spawn an Agent on the problem CLASS, not the
   instance. Adjacent domains, alternative formulations, papers,
   structurally similar problems.
2. **DECOMPOSE** — re-state at a different level of abstraction. API →
   protocol → byte → semantic.
3. **REFRAME** — find three problems sharing the obstacle, solve the
   cleanest one, backport.
4. **SLEEP-ON-IT** — write state to `BRAINSTORM-NOTES.md`, work on a
   different finding for ≥3 iterations, return with fresh framing.

Only after all 4 fail does the obstacle get tagged
`[GENUINELY-STUCK: <reason after all 4 pivot steps>]` and surface to
the report.

### Approach class diversification (B1, B2)

Each retry attempt MUST come from a different approach **class** (not
parameter tweaks). Logged as `[APPROACH-N: <class> — <result>]`.
Example classes for parsing problems:
- regex / parser-combinator / AST-walk / LLM-classify
- hand-rule-engine / external-tool-shell-out / format-conversion
- network-fetch / sandbox-execute / static-analysis

Class list is illustrative — the rule is "different KIND of attempt,
not different parameters of the same attempt."

### What does NOT change in BRAINSTORM (honesty floor preserved)

- **Iron Laws 1-5, 8, 10-12** still apply. These are the honesty/
  accuracy laws (specificity, read-before-act, source integrity,
  bugs-before-refactors, minimum footprint, expansion boundaries,
  honesty over completeness, verify-or-don't-claim). Removing them
  would not be "more autonomous" — it would just be lying.
- **Genuine walls** (auth, captcha, requires-credit-card, network egress
  blocked) are STILL flagged honestly as `[GENUINE-WALL: <reason>]`.
  BRAINSTORM raises the bar for what counts as a wall — it does not
  pretend impossibilities are tractable.
- **Misaligned success** flagged as `[SUCCESS-BUT-MISALIGNED]` if Claude
  succeeds via misunderstanding the original problem.
- All audit logging (`H5W-LOG`, `H5W-QUEUE`, `H5W-REPORT`, the new
  `BRAINSTORM-NOTES.md` for sleep-on-it state).

### New log tags (BRAINSTORM-only)

```
[APPROACH-N: <class> — <result>]
[PIVOT-STEP-1 / 2 / 3 / 4]
[GENUINELY-STUCK: <reason after all 4 pivot steps>]
[SUCCESS-BUT-MISALIGNED: <gap from original goal>]
[SLEEP-ON-IT: written to BRAINSTORM-NOTES.md, returning at iter N]
```

### Test coverage (33/33 gate cases pass)

`scripts/h5w-test-gate.sh` extended with 10 new cases on top of v1.2.0's
23. New cases verify:
- Full happy path (three-phrase gate completes)
- Case-insensitive on both confirms
- BRAINSTORM confirm wrong → drops to plain UNCHAINED
- UNCHAINED confirm wrong → drops to GUIDED, BRAINSTORM never reached
- Partial confirmations rejected
- `--resume --unchained --brainstorm` resume path
- `:brainstorm` flag without UNCHAINED phrase has no effect
- `:brainstorm` with FULL phrase activates only FULL (BRAINSTORM is
  UNCHAINED-only)

### Validator additions (check 6j)

- BRAINSTORM gate must have `BRAINSTORM_FLAG`, `BRAINSTORM_CONFIRM`,
  and the literal `this is my sandbox` check in source.
- §BRAINSTORM must be documented in SKILL.md, auto-mode.md, and
  sim-engine.md (§SIM.8 pointer).

### Files

```
SKILL.md                                    +29 lines  (BRAINSTORM section + four-mode escalation table + QUICK START update)
references/auto-mode.md                     +112 lines (§BRAINSTORM full section + §SIM.8 BRAINSTORM-PIVOT + Quick Reference row)
references/sim-engine.md                    +18 lines  (§SIM.8 pointer to auto-mode.md)
h5w-autoloop.sh                             +95 lines  (BRAINSTORM detection inside UNCHAINED gate, secondary acknowledgment, MAX_LOOPS_BRAINSTORM=200, mode-aware STOP_PATTERNS, summary banner, --brainstorm resume flag)
scripts/h5w-test-gate.sh                    +50 lines  (10 BRAINSTORM cases + run_bs_case + run_case3 helpers + stub extension)
scripts/h5w-validate.sh                     +18 lines  (check 6j)
CHANGELOG.md                                +130 lines (this entry)
```

### Validator on v1.3.0

```
PASSED — 0 errors, 0 warnings (after CHANGELOG line-count update)
=== Activation Gate ===
  ✓ Activation gate: 33 cases pass
```

### Note from author

§BRAINSTORM exists because UNCHAINED, on inspection, was still hedged
for "this could break someone else's project." The user clarified that
the skill is personal-use only and the goal is making Claude brainstorm
itself in a closed local environment — push through hard problems
rather than bail at the 3-attempt cap.

The reframe matters: the previous caps weren't safety, they were
politeness. UNCHAINED removed the safety guards but kept the politeness
ones (3 attempts and you give up gracefully). BRAINSTORM removes those
too. The honesty floor stays — Claude still reports what it actually
tried, including the dead ends, and still flags genuine walls. What
changes is the bar for what counts as a wall in the first place.

For closed-sandbox use this should hit harder. The two-phrase gate is
deliberately friction — the modifier is not the default for a reason.

### Chief Guide — 2,249 lines at v1.3.0 (superseded — see v1.3.1 entry)

---

## v1.2.0 — UNCHAINED mode

Adds **§AUTO-UNCHAINED** — a third autonomy mode above FULL, intended
for personal sandboxes / scratch projects where FULL's T3 gate and
preservation laws are obstructive rather than protective.

**This mode removes safety guards. Use only on projects you can
recreate or fully recover via git.** The two-phrase activation gate
exists specifically to prevent accidental escalation.

### Activation
- Trigger phrase: `run H5W unchained autonomous mode` at start of prompt.
- Confirmation: type **exactly** `i accept full responsibility`. Anything
  else (including `proceed` — FULL's confirmation) drops to GUIDED. The
  distinct confirmation phrase prevents muscle-memory escalation.
- Resume: `./h5w-autoloop.sh --resume --unchained`. Plain `--resume`
  drops to GUIDED for safety.

### Differences from FULL

| Aspect | FULL | UNCHAINED |
|--------|------|-----------|
| T3 actions (delete, schema migrations, force-push, paid APIs, app-store publish) | queued | execute, logged with `[UNCHAINED-T3-EXECUTED]` tag |
| Iron Laws 6 / 7 / 9 (Feature Preservation, Identity Preservation, Reversibility) | enforced | demoted to advisories (logged when overridden) |
| §META edits to skill files | `skill-improvements/SF-NNN.md` proposals only | direct edits to `SKILL.md` / `references/*.md`, **mirrored** to `skill-improvements/SF-NNN.md` for diff trail |
| §OBSTACLE permissions | T1/T2 | T1/T2/T3 |
| `MAX_LOOPS` in autoloop | 30 | 60 |
| Stop patterns | guarded (T3 stops included) | loose (only true terminations) |

### What UNCHAINED still enforces (floor, not removable in this mode)
- Two-phrase activation gate at script level.
- Iron Laws 1, 2, 3, 4, 5, 8, 10, 11, 12 — these are about being
  accurate and honest (specificity, read-before-act, source integrity,
  bugs-before-refactors, minimum footprint, expansion boundaries,
  honesty over completeness, verify-or-don't-claim). Removing them
  wouldn't be "more autonomous"; it would just be "Claude lies."
- Full COMPACT-RESUME / H5W-LOG / H5W-QUEUE / H5W-REPORT writeup.
- Resolved git policy (`.h5w/git-policy`) — UNCHAINED does NOT
  override git policy.
- Claude Code session quotas (Anthropic-side).

### Test coverage
- `scripts/h5w-test-gate.sh` extended: 9 new UNCHAINED cases on top of
  v1.1.1's 14 FULL/GUIDED cases. **23/23 cases pass.**
- New cases verify: literal phrase + correct confirmation → UNCHAINED;
  case-insensitive matching; `proceed` (FULL's word) does NOT activate
  UNCHAINED → GUIDED; partial confirmation strings → GUIDED;
  metalinguistic mention → GUIDED; UNCHAINED checked before FULL when
  phrase contains both substrings; `--resume --unchained`.

### Validator additions
- 6h: UNCHAINED gate has both trigger phrase AND distinct confirmation
  phrase in source. Catches accidental removal of the two-step gate.
- 6i: UNCHAINED is documented in both SKILL.md and references/auto-mode.md.
  Catches doc/code drift.

### Files

```
SKILL.md                                    +52 lines  (UNCHAINED summary, escalation table, decision tree, quick refs)
references/auto-mode.md                     +66 lines  (§AUTO-UNCHAINED full section + Quick Reference row)
h5w-autoloop.sh                             +95 lines  (UNCHAINED gate block, AUTO_RULES branch, mode-aware STOP_PATTERNS, summary banner)
scripts/h5w-test-gate.sh                    +33 lines  (9 UNCHAINED test cases + UNCHAINED stub logic)
scripts/h5w-validate.sh                     +20 lines  (checks 6h, 6i)
CHANGELOG.md                                +75 lines  (this entry)
```

### Notes from author
The mode exists because FULL's T3 gate, on inspection, was sometimes
genuinely getting in the way for personal-project work where the
"protection" mostly meant "Claude queued the obvious next step instead
of doing it." UNCHAINED is the answer for those cases. It is **not**
the answer for production code, multi-author repos, anything with
secrets, or anything irreplaceable. The two-phrase gate is a deliberate
speed bump. Treat it as one.

---

## v1.1.1 — Meta-audit response (self-audit on v1.1.0)

Ran §META on v1.1.0 (the audit-response release) using the skill's own
protocols. Found 10 SF findings; closed 9 in this release (one — line-count
drift on continued edits — is structural and superseded by automated check).

### Safety fixes
- **SF-003 closed (HIGH).** The activation gate is now enforced **at the
  script level** in `h5w-autoloop.sh`. The wrapper:
  1. Detects the literal phrase as the **start** of the prompt
     (not embedded — see SF-004).
  2. Prints the Risk Acknowledgment block to the terminal.
  3. Reads typed `proceed` from stdin BEFORE invoking Claude.
  4. Sets `--permission-mode auto` only after confirmation.

  This eliminates the contradiction where Claude was told both "wait for
  proceed" (gate) and "NEVER use AskUserQuestion" (FULL injection)
  simultaneously. The gate is now a script invariant, not a Claude
  behavior request.

- **SF-004 closed (MEDIUM).** Trigger now requires the literal phrase to
  be the **start of the prompt** (or start of any line), not anywhere
  inside the prompt. Sentences ABOUT the phrase ("should I run H5W full
  autonomous mode?", "explain what 'run H5W full autonomous mode' does")
  no longer activate FULL.

### Correctness fixes
- **SF-001 closed (HIGH).** Mass-relabel of "Chief Guide §X" → "the §X
  protocol (references/X.md)" for the 7 sections extracted in v1.1.0.
  Affected: §SIM, §AUTO, §META, §OBSTACLE, §BUILD, §DELIVER, §PRODUCT.
  23 stale references corrected across SKILL.md and all module files.
- **SF-002 closed (MEDIUM-HIGH).** SKILL.md §AUTO stub now contains a
  visible **Activation Gate summary** describing the two-layer
  enforcement (script + Claude) and the trigger flow. Full text remains
  in `references/auto-mode.md`.
- **SF-005 closed (LOW).** Removed empty `### Context Window Strategy`
  header in `references/auto-mode.md`.
- **SF-006 closed (MEDIUM).** Corrected the GUIDED documentation: T2
  actions trigger Claude Code's permission prompt, which **blocks**
  until the user accepts/rejects. (Was incorrectly described as
  non-blocking.)
- **SF-007 closed (MEDIUM).** Autoloop `AUTO_RULES` injection is now a
  short pointer to `references/auto-mode.md §The Five Rules` plus the
  mode-specific differences. Eliminates the duplicate-source-of-truth
  drift between the wrapper and the protocol file.
- **SF-008 closed (LOW).** Documented `--resume --full` for resuming
  a confirmed FULL session. QUICK START expanded with all three
  invocation modes.

### Test coverage
- **SF-010 closed (MEDIUM).** Added `scripts/h5w-test-gate.sh` —
  14-case regression test for the activation gate. Tests stub the
  resolution logic (no Claude Code CLI required) and exercise:
  GUIDED defaults, FULL via literal phrase, case-insensitive triggers,
  metalinguistic mention rejection, decline behavior, `--resume` /
  `--resume --full` paths.
- **SF-009 partially closed (MEDIUM).** Validator extended with three
  new structural checks: stale "Chief Guide §X" cross-refs to extracted
  sections, empty section headers (### → ###), autoloop pointer drift
  to `references/auto-mode.md`. Validator now also runs the gate test
  suite as the last block. Total checks now: 18 file-existence + 7
  consistency + gate suite (14 cases).

### Files

```
SKILL.md                                    +47 lines  (Activation Gate summary, --resume --full docs)
references/auto-mode.md                      -3 lines  (empty section, GUIDED bullet rewrite)
references/mod-*.md                          0 net    (Chief Guide § relabel)
h5w-autoloop.sh                            +71 lines  (script-level gate, narrowed phrase trigger, slim AUTO_RULES)
scripts/h5w-test-gate.sh                   NEW       (130 lines, 14 cases)
scripts/h5w-validate.sh                    +44 lines  (3 new checks + gate runner)
CHANGELOG.md                               +90 lines  (this entry)
```

### Validator on v1.1.1

```
PASSED — 0 errors, 0 warnings (after CHANGELOG line-count update)
=== Activation Gate ===
  ✓ Activation gate: 14 cases pass
```

The validator now contains the regression net for both v1.1.0 fixes and
v1.1.1 fixes. Re-introducing any of the 16 closed findings would fail it.

---

## v1.1.0 — Audit response

### Bug fixes (from senior-engineer audit)
- **Markdown rendering** — closed unclosed code fence in §VER; renamed
  duplicate "Stage 3" to "Stage 4 — Find Errors Before Build". Fence
  parity restored across all files.
- **50 Questions consistency** — standardised on 50 Questions / 5 layers
  across SKILL.md, references, autoloop, CLAUDE.md template, and CHANGELOG
  (was a mix of 50 and 55, with autoloop rolling into nonexistent IDs).
- **Anti-pattern count** — TOC now agrees with section header (18, 18, 18).
- **COMPACT-RESUME field name** — template field renamed `Cycles` →
  `Cycles Completed` to match SKILL.md instructions.
- **autoloop STOP_PATTERNS** — anchored with `^` to prevent false-positive
  termination on legitimate finding descriptions containing
  "needs your decision".

### Architecture changes
- **Chief Guide split (R-001)** — extracted 7 heavyweight protocol sections
  to `references/`. SKILL.md is now ~2,100 lines (was ~5,000):
  - `references/sim-engine.md` (§SIM)
  - `references/product-lifecycle.md` (§PRODUCT)
  - `references/build-protocol.md` (§BUILD)
  - `references/deliver-infrastructure.md` (§DELIVER)
  - `references/obstacle-protocol.md` (§OBSTACLE)
  - `references/meta-protocol.md` (§META)
  - `references/auto-mode.md` (§AUTO)
  Routing stubs remain in SKILL.md.
- **Module law re-derivation removed (R-002)** — `mod-code-audit.md` and
  `mod-restructuring.md` no longer redefine the Iron Laws. Their
  domain-specific principles are renamed `§DOMAIN — Code-Audit Domain
  Principles` / `§DOMAIN — Restructuring Domain Principles` and
  cross-reference Chief §LAW. `§LAW` now exists in exactly one place.
- **§ reference convention (R-003)** — added explicit convention note in
  §TRIAGE: Chief Guide § codes referenced bare (`§LAW`, `§I.4`, `§H`);
  module-internal codes always module-prefixed when referenced from
  outside (`MOD-APP §C5`, `MOD-CODE §D5`). All bare MOD-APP / MOD-CODE
  references in SKILL.md disambiguated.
- **Git policy configurable (R-006)** — §AUTO now resolves git policy
  from `.h5w/git-policy` file or `H5W_GIT_POLICY` env var (`branch` |
  `main` | `none`). Default `branch`. Init script prompts for policy.
- **User-specific examples sanitized (R-007)** — Whispering Wishes,
  Wuthering Waves, DeployView replaced with placeholders
  (`<your-app>`, `<game>`, `<specific-game>`).
- **Frontmatter (R-008)** — added `target: claude-code` and inline
  comment on `allowed-tools` clarifying it's a Claude Code agent-spec
  field, ignored elsewhere.

### §AUTO activation gate hardened (the rules R-004 and R-005 still apply by design)
- **FULL is opt-in via literal phrase only** — `run H5W full autonomous mode`,
  case-insensitive substring match. Other phrases ("you decide", "I'll be
  back", "handle it") route to **§AUTO-GUIDED**, the new safe default.
- **Risk Acknowledgment block** — printed in full on FULL activation,
  before any action. Explains exactly what permission prompts /
  judgmental "I can't" / etc. are being suspended.
- **§AUTO-GUIDED added** — same protocols as FULL but permission prompts
  active, no `--permission-mode auto`, §META proposals only (no edits to
  skill files).
- **§META × §AUTO** — proposals only in any mode. §META writes to
  `skill-improvements/SF-NNN.md`; never edits SKILL.md or `references/*.md`
  on its own. User merges manually.
- **autoloop wrapper** — `--permission-mode auto` is now gated on
  detection of the literal phrase. GUIDED mode keeps Claude Code's
  standard prompts. `--full` flag added for resuming a confirmed FULL
  session.

### Validator improvements
- Added `=== Consistency ===` block: code-fence parity, stale "55 Questions"
  scan, autoloop shuf-range check, anti-pattern count cross-check,
  CHANGELOG line-count match.
- Now catches every bug fixed in this release on the v1.0.0 source tree.
- File list extended to include all 7 new protocol references.

---

## v1.0.0 — Initial Unified Release

### Architecture
- Unified 6 standalone skills into one agent skill with Chief Guide orchestrator
- Eliminated all duplicate shared protocols (§0, §LAW, §SRC, §FMT, §REV, §VER)
- Fixed 42+ cross-references, 0 broken refs remaining
- Restored 314 lines of module-specific content incorrectly stripped
- All 6 module headers declare invocation, receives, returns, §AUTO override

### Chief Guide — 2,220 lines at v1.2.0 (superseded — see v1.3.0 entry)
- §TRIAGE: Decision tree routing for any request
- §0: Unified context block (app identity, stack, design, delivery, domain rules)
- §I: Adaptive calibration (domain, architecture, scope, five-axis aesthetic)
- §LAW: 12 Iron Laws with violation examples
- §SRC: Source integrity with 7 rules, quality tiers, auto-escalation
- §FMT: Finding format with good/bad examples
- §REV + §VER: Reversibility tiers + verification protocol with scenarios
- §SIM.1–5: Simulation engine (personas, state mapping, walkthroughs, expansion, checkpoints)
- §SIM.6: Anti-Exhaustion — 50 Questions across 5 layers to prevent premature completion
- §SIM.7: Research & Study — 6-phase domain/competitive/audience/tech/design research
- §H/§W/§P/§T/§N/§L: 6 lens categories, 30 sub-codes mapped to modules
- §PRODUCT: Full product lifecycle (Think → Validate → Plan → Build → Ship → Grow → Maintain → Evolve)
- §BUILD: 9-phase build pipeline (discovery, architecture, design, scaffold, implement, integrate, quality, polish, launch)
- §DELIVER: CI/CD, APK builder, signing, deployment, build-run-install test
- §WORKFLOW: 4 concrete inter-module handoff examples
- §SESSION: Cross-session continuity with conflict resolution
- §OBSTACLE: MacGyver protocol — pipeline engineering, compound obstacles, full authorization
- §META: Self-improvement protocol — audit skills, fix instructions, evolve
- §AUTO: Deep autonomous agent — 5 rules, never-stop loop, self-correction, structured compaction

### Modules (6 reference files)
- MOD-APP (2,918 lines): 120+ audit dimensions, R&D mode, polish mode
- MOD-CODE (2,001 lines): 8 code dimensions, JS/React + Kotlin stack modules
- MOD-DESG (3,174 lines): 21-step visual analysis
- MOD-ART (2,188 lines): Art direction engine
- MOD-REST (2,621 lines): Live restructuring pipeline
- MOD-SCOP (1,007 lines): Scope awareness + disambiguation

### Installation
Uninstall the 6 standalone skills before installing this system:
app-audit, code-audit, design-aesthetic-audit, art-direction-engine,
scope-context, app-restructuring.

Load the entire h5w-unified/ folder into Claude Code skills directory.
