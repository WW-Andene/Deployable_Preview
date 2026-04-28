#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# H5W AUTO-LOOP — Autonomous Claude Code session manager
# ═══════════════════════════════════════════════════════════════
#
# Usage:
#   ./h5w-autoloop.sh "Improve my app autonomously"
#   ./h5w-autoloop.sh --resume
#
# Requires: Claude Code CLI (claude) installed and authenticated
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Configuration ────────────────────────────────────────────
MAX_LOOPS=30               # Max auto-continue iterations (FULL/GUIDED)
MAX_LOOPS_UNCHAINED=60     # UNCHAINED mode runs longer
MAX_LOOPS_BRAINSTORM=200   # BRAINSTORM mode runs much longer (closed sandbox use)
MAX_TURNS=15               # Turns per iteration (prevents timeout)
COOLDOWN=3                 # Seconds between iterations
LOG="h5w-autoloop.log"
ACTIVATION_PHRASE="run H5W full autonomous mode"
UNCHAINED_PHRASE="run H5W unchained autonomous mode"
UNCHAINED_CONFIRM="i accept full responsibility"
BRAINSTORM_FLAG=":brainstorm"   # Append to UNCHAINED phrase to enable
BRAINSTORM_CONFIRM="this is my sandbox"
BUILD_FLAG=":build"             # Append to switch primary loop from audit to build
BUILD_CONFIRM="ship features"   # Confirmation phrase for BUILD modifier

# Default: GUIDED mode (permission prompts active). FULL or UNCHAINED only
# when the user's prompt contains the corresponding literal activation phrase.
PERMISSION_MODE="default"  # overridden below if FULL/UNCHAINED is opted into
MODE="GUIDED"
BRAINSTORM=false           # Set true when UNCHAINED + :brainstorm flag triggers
BUILD=false                # Set true when UNCHAINED + :build flag triggers (build-loop primary)

# UNCHAINED stop patterns are looser — only true terminations stop the loop.
STOP_PATTERNS="^RUNWAY LIMIT|^SESSION END|H5W-REPORT\.md (written|complete)|^STUCK.*cannot proceed"
STOP_PATTERNS_GUARDED="$STOP_PATTERNS|^All remaining.*T3|^## What Needs Your Decision"

# ─── Colors ───────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; N='\033[0m'

# ─── Prerequisite check ───────────────────────────────────
if ! command -v claude &>/dev/null; then
    echo -e "${R}Error: Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code${N}"
    exit 1
fi

# ─── Argument handling ────────────────────────────────────────
[ $# -eq 0 ] && echo -e "${R}Usage:${N} ./h5w-autoloop.sh \"your prompt\"" && exit 1

PROMPT="$1"
CONTINUE_MODE=false

if [ "$PROMPT" = "--resume" ]; then
    CONTINUE_MODE=true
    PROMPT="Resume H5W autonomous session. Read COMPACT-RESUME.md and H5W-QUEUE.md. Continue working per §AUTO. End every response with NEXT: [action]."
fi

# ─── §AUTO mode resolution ────────────────────────────────────
# FULL mode requires the literal activation phrase as a top-level instruction
# OR a --full flag for --resume after a previously-confirmed FULL session.
# The gate (Risk Acknowledgment + typed `proceed`) is enforced HERE, at the
# script level, BEFORE claude is invoked. This prevents the contradiction
# between "NEVER use AskUserQuestion" (in the AUTO_RULES injection) and the
# gate's confirmation requirement.

# Detect the literal phrase as a top-level instruction (start of prompt or
# its own line) — not embedded in metalinguistic mentions like "should I run
# H5W full autonomous mode?". This narrows the trigger surface.
phrase_at_start() {
    local p="$1" needle="$2"
    local pl="${p,,}" nl="${needle,,}"
    [[ "$pl" == "$nl"* ]] && return 0
    [[ "$pl" == *$'\n'"$nl"* ]] && return 0
    return 1
}

# UNCHAINED check FIRST — if both phrases somehow match, UNCHAINED is the
# more deliberate signal. UNCHAINED also requires a second confirmation
# phrase ("i accept full responsibility") that's distinct from FULL's
# "proceed" so muscle memory can't escalate accidentally.
if phrase_at_start "$PROMPT" "$UNCHAINED_PHRASE"; then
    echo -e "${R}═══ §AUTO-UNCHAINED — Activation Gate ═══${N}" >&2
    cat <<'UNCHAINED_ACK' >&2
═════════════════════════════════════════════════════════════════════
              §AUTO-UNCHAINED — UNRESTRICTED MODE
═════════════════════════════════════════════════════════════════════

  ⚠⚠⚠  THIS MODE REMOVES PROTECTIONS THAT MAKE LONG SESSIONS  ⚠⚠⚠
  ⚠⚠⚠  RECOVERABLE. READ THIS BEFORE TYPING THE CONFIRMATION.  ⚠⚠⚠

WHAT UNCHAINED DOES THAT FULL DOES NOT:

  ⚠ T3 actions execute without queueing. This includes:
    - Deleting features, files, branches, user data
    - Schema migrations and breaking API changes
    - Force-push and git history rewrites (Δ from FULL)
    - Modifying auth / payment / PII handling code
    - Publishing to app stores or production hosting if configured
    - Spending money on paid APIs / cloud services
    Some of these cannot be undone by 'git checkout'. Some lose work
    that isn't yet in your reflog. You will not be asked first.

  ⚠ Iron Laws 6, 7, 9 are demoted to advisories.
    - Law 6 (Feature Preservation): no longer blocks. Working features
      can be replaced or removed if §META/§OBSTACLE judges it warranted.
    - Law 7 (Identity Preservation): no longer blocks. Visual identity
      and architectural conventions can be overwritten.
    - Law 9 (Reversibility Before Action): the tier system still
      classifies actions for the log, but T3 no longer gates execution.
    Laws 1-5, 8, 10-12 still apply (specificity, read-before-act,
    source integrity, bugs-before-refactors, minimum footprint,
    expansion boundaries, honesty, verify-or-don't-claim).

  ⚠ §META can write directly to SKILL.md and references/*.md.
    Proposals are still also written to skill-improvements/SF-NNN.md
    for review, but the active rules CAN change mid-session. The rules
    at hour 3 are not necessarily the rules you read at hour 0.

  ⚠ §OBSTACLE permissions extended to T3.
    Tool-building authorization now covers force-push, history
    rewrites, irreversible API calls, and external services that
    aren't free-tier.

  ⚠ Loop runs longer. MAX_LOOPS=60 (vs 30 in FULL). Roughly
    4-6 hours of wall-clock work before the runway report.

WHAT UNCHAINED DOES NOT CHANGE (still bails like FULL on these):

  • [STUCK] from §OBSTACLE's 3-attempt cap still terminates the
    loop. UNCHAINED has slightly more runway than FULL but behaves
    the same on STUCK. To push past the give-up thresholds, see
    §AUTO-UNCHAINED + §BRAINSTORM (separate gate).
  • Self-correction protocol still allows 3 attempts per finding
    before logging [STUCK]. BRAINSTORM raises this to 20.
  • The 5-failures-and-stop session runway limit still applies in
    UNCHAINED. BRAINSTORM removes it.

WHAT UNCHAINED STILL DOES (these are floor, not removable here):

  • Activation gate (this prompt + the two-phrase confirmation)
  • Full COMPACT-RESUME / H5W-LOG / H5W-QUEUE writeup of every action
  • Resolved git policy (.h5w/git-policy) is still respected for
    branch behavior — set it to 'main' if you want UNCHAINED to
    work directly on main without a working branch
  • Iron Laws 1, 2, 3, 4, 5, 8, 10, 11, 12 (the laws about being
    accurate, specific, honest, and not fabricating findings).
    Removing these wouldn't be "more autonomous"; it would just be
    making Claude lie. They stay.
  • H5W-REPORT.md at session end with full audit trail
  • Claude Code session quotas / rate limits (Anthropic-side, not
    overridable from this side regardless)

WHEN TO USE UNCHAINED:

  ✓ Personal / scratch projects you can recreate
  ✓ Repos with full git history pushed to a remote you trust
  ✓ When you've already used FULL and found T3 friction more
    obstructive than protective on this specific project
  ✓ When you accept that "broken" is a possible outcome and you
    have time/energy to fix it

WHEN NEVER TO USE UNCHAINED:

  ✗ Production systems with real users
  ✗ Repos with secrets / credentials in scope
  ✗ Multi-author projects where someone else hasn't consented
  ✗ Anything irreplaceable (writing drafts, photo metadata, configs
    you don't have backups of)
  ✗ When you're tired or rushed — the two-phrase gate exists
    specifically because tired people make bad activation calls

═════════════════════════════════════════════════════════════════════
UNCHAINED_ACK
    echo -en "${R}Type EXACTLY: i accept full responsibility${N}\n${R}(anything else drops to FULL or GUIDED):${N} " >&2
    read -r CONFIRM
    if [ "${CONFIRM,,}" = "$UNCHAINED_CONFIRM" ]; then
        MODE="UNCHAINED"
        PERMISSION_MODE="auto"
        MAX_LOOPS="$MAX_LOOPS_UNCHAINED"
        echo -e "${R}═══ §AUTO-UNCHAINED ACTIVATED — MAX_LOOPS=$MAX_LOOPS ═══${N}" >&2
        echo "[$(date)] §AUTO-UNCHAINED activated. Confirmation phrase received. T3 gate disabled. Iron Laws 6/7/9 demoted. §META can edit skill files." >> "$LOG"

        # Check for :brainstorm flag in original prompt — UNCHAINED + BRAINSTORM
        # is for closed-sandbox deep-work where the goal is "burn turns until
        # you actually solve it" rather than "fail gracefully and stop."
        # SF-018: require whitespace boundary or end-of-string around the
        # flag — substring match would catch :brainstormy or test:brainstormstuff.
        if echo "$PROMPT" | grep -qiE "(^|[[:space:]])${BRAINSTORM_FLAG}([[:space:]]|$)"; then
            echo "" >&2
            cat <<'BRAINSTORM_ACK' >&2
─────────────────────────────────────────────────────────────────────
                §BRAINSTORM — closed-sandbox deep-work modifier
─────────────────────────────────────────────────────────────────────

DETECTED: ':brainstorm' flag in prompt.

§BRAINSTORM is a behavioral modifier on top of UNCHAINED. It changes how
Claude responds to obstacles — from "try 3 times then give up" to "try
many angles, pivot, research, decompose, retry from a different shape."

WHAT IT CHANGES (effort knobs):

  • Self-correction attempts: 3 → 20 per finding
  • §OBSTACLE attempts: 3 → 10 per obstacle, REQUIRED to be from
    different approach classes (regex / parser / AST / LLM / ML /
    manual rule engine — not "tweak the regex 3 ways")
  • Session runway: 5-failures-and-stop limit REMOVED. The only
    runway is context-full or wall-clock cap (MAX_LOOPS=200).
  • [STUCK] is no longer a queue entry — it's a routing signal to
    §BRAINSTORM-PIVOT (research → decompose → reframe → retry).
  • Premature-completion pressure removed. "I think I'm done"
    triggers §SIM.6 (50 Questions) THEN §SIM.7 (research) THEN
    §SIM.8 (BRAINSTORM-PIVOT) before any "done" state is allowed.

WHAT IT DOES NOT CHANGE:

  • The 12 Iron Laws still apply at UNCHAINED's relaxation level.
  • Honesty still applies — Claude reports what it actually tried,
    including dead ends. Logs do not get "tidied" to look productive.
  • Genuine walls (auth, captcha, requires-credit-card) still get
    flagged honestly. §BRAINSTORM doesn't turn impossible into
    possible — it raises the bar for what counts as impossible.
  • Cost-bearing actions (paid APIs) are still gated by .h5w/git-policy
    and the user's environment. §BRAINSTORM doesn't override account
    creation or payment.

WHEN TO USE:

  ✓ Closed local sandbox you control end-to-end
  ✓ Problem you genuinely want Claude to push through, not bail on
  ✓ You have hours of runway and real interest in seeing how far it gets
  ✓ You're comfortable reading 200+ iterations of log to see the path

WHEN NOT TO USE:

  ✗ You need a bounded session (use UNCHAINED without :brainstorm)
  ✗ You're rate-limited and 200 iterations would burn your quota
  ✗ The problem is genuinely impossible and you'd rather know fast

─────────────────────────────────────────────────────────────────────
BRAINSTORM_ACK
            echo -en "${R}Type EXACTLY: this is my sandbox${N}\n${R}(anything else stays in plain UNCHAINED):${N} " >&2
            read -r BS_CONFIRM
            if [ "${BS_CONFIRM,,}" = "$BRAINSTORM_CONFIRM" ]; then
                BRAINSTORM=true
                MAX_LOOPS="$MAX_LOOPS_BRAINSTORM"
                echo -e "${R}═══ §BRAINSTORM ENABLED — MAX_LOOPS=$MAX_LOOPS ═══${N}" >&2
                echo "[$(date)] §BRAINSTORM modifier enabled. Effort caps raised. STUCK becomes routing signal." >> "$LOG"
            else
                echo -e "${Y}═══ §BRAINSTORM not confirmed — staying in plain UNCHAINED ═══${N}" >&2
                echo "[$(date)] :brainstorm flag detected but sandbox confirmation not matched — staying in plain UNCHAINED" >> "$LOG"
            fi
        fi

        # Check for :build flag — pivots primary loop from audit to build.
        # This is independent of BRAINSTORM (you can have :build alone, or
        # :build :brainstorm together). The :build modifier addresses the
        # "audit queue empties → terminate even though there's real work
        # left" problem (SF-021).
        if echo "$PROMPT" | grep -qiE "(^|[[:space:]])${BUILD_FLAG}([[:space:]]|$)"; then
            echo "" >&2
            cat <<'BUILD_ACK' >&2
─────────────────────────────────────────────────────────────────────
                §BUILD-LOOP — primary-loop modifier (build, not audit)
─────────────────────────────────────────────────────────────────────

DETECTED: ':build' flag in prompt.

§BUILD-LOOP changes the autoloop's primary work source from "audit
findings queue (H5W-QUEUE.md)" to "build tasks queue (H5W-BUILD.md)."
This is for sessions where the goal is implementing real features —
not finding-then-fixing existing code, but writing new code from
specs.

WHAT IT CHANGES:

  • Primary loop reads H5W-BUILD.md, not H5W-QUEUE.md.
  • Empty audit queue does NOT terminate the session — only empty
    BUILD queue does. Audit findings still happen as side-output
    (logged to H5W-QUEUE.md as opportunistic notes).
  • §SIM.5 checkpoint cycle counter (Law 10) does NOT apply to
    build progression. Cycles count "scope expansion in audit
    mode" — building feature phases is not expansion, it's
    advancement through a planned spec.
  • "Scope walls" (multi-day features the audit loop refuses to
    start) ARE the work in §BUILD-LOOP. The autoloop will not
    terminate them as out-of-scope.
  • Termination: H5W-BUILD.md empty, OR runway limit, OR genuine
    walls (auth, network, etc).

WHAT IT REQUIRES:

  ✓ H5W-BUILD.md must exist and contain at least one task before
    activation. If absent, the autoloop will help create it from
    your prompt as the first iteration's work.
  ✓ Tasks should be phased — "implement multi-monitor: phase 1
    detect displays, phase 2 render placement, phase 3 persistence"
    rather than "implement multi-monitor." Phases give the loop
    something concrete to iterate against.

QUEUE CONVENTION (H5W-BUILD.md):

  ## Build Queue
  | ID | Feature | Phase | Status | Notes |
  |----|---------|-------|--------|-------|
  | B-001 | Multi-monitor support | 1 — detect displays | TODO | DisplayManager API research first |
  | B-001 | Multi-monitor support | 2 — render placement | TODO | depends on phase 1 |
  | B-002 | Notification reply | 1 — RemoteInput intent setup | TODO | API 24+ |

  Status values: TODO, IN-PROGRESS, BLOCKED, DONE
  When DONE: move to # Completed section, log to H5W-LOG.md

INTERACTION WITH §BRAINSTORM:

  :build alone — primary loop is build, default effort caps.
  :build :brainstorm — primary loop is build, raised effort caps
                       AND §SIM.8 routing on stuck-during-build.
                       This is the "deep build" combination.

─────────────────────────────────────────────────────────────────────
BUILD_ACK
            echo -en "${R}Type EXACTLY: ship features${N}\n${R}(anything else stays in audit-loop mode):${N} " >&2
            read -r BUILD_CONF
            if [ "${BUILD_CONF,,}" = "$BUILD_CONFIRM" ]; then
                BUILD=true
                echo -e "${R}═══ §BUILD-LOOP ENABLED — primary work source: H5W-BUILD.md ═══${N}" >&2
                echo "[$(date)] §BUILD-LOOP enabled. Primary loop is build, not audit. Cycle 3 termination disabled." >> "$LOG"
                # Bootstrap: if H5W-BUILD.md doesn't exist, instruct Claude
                # to create it from the prompt on iteration 1.
                if [ ! -f "H5W-BUILD.md" ]; then
                    echo -e "${Y}    H5W-BUILD.md not present — first iteration will create it from your prompt.${N}" >&2
                fi
            else
                echo -e "${Y}═══ §BUILD-LOOP not confirmed — staying in audit-loop mode ═══${N}" >&2
                echo "[$(date)] :build flag detected but ship-features confirmation not matched — staying in audit-loop mode" >> "$LOG"
            fi
        fi
    else
        echo -e "${C}═══ Dropped to §AUTO-GUIDED (confirmation phrase not matched) ═══${N}" >&2
        echo "[$(date)] UNCHAINED phrase detected but confirmation not matched — running GUIDED" >> "$LOG"
    fi
elif phrase_at_start "$PROMPT" "$ACTIVATION_PHRASE"; then
    echo -e "${Y}═══ §AUTO FULL — Activation Gate ═══${N}" >&2
    cat <<'RISK_ACK' >&2
═════════════════════════════════════════════════════════════════════
                    §AUTO FULL — RISK ACKNOWLEDGMENT
═════════════════════════════════════════════════════════════════════

WHAT YOU LOSE BY ACTIVATING:

  ⚠ Interactive permission prompts. Claude Code is invoked with
    --permission-mode auto. If a tool action would normally prompt
    you, it now executes silently.

  ⚠ "I can't" as a stopping signal. §OBSTACLE forbids surrender.
    Claude will research, build tools, and chain workarounds rather
    than ask for help.

  ⚠ Conservative defaults. Default mode is GUIDED (permission prompts
    active). FULL is opt-in only via this gate.

WHAT CLAUDE WILL DO WITHOUT ASKING:
  • Install npm / pip / gradle / cargo / go packages (T1)
  • Clone open-source repos into the project (T1)
  • Build custom scripts, parsers, fetchers, converters (T1)
  • Modify package.json / build.gradle / tsconfig / webpack config (T2)
  • Create new directories, CI/CD pipelines, Dockerfiles (T2)
  • Write to AndroidManifest, add permissions, modify build types (T2)
  • Make git commits per resolved git policy (.h5w/git-policy)
  • Run §META: propose edits to skill files (proposals only — no merge)

WHAT CLAUDE WILL NOT DO (T3 — queued for your decision):
  • Delete existing features or user data
  • Change fundamental architecture decisions you've made
  • Spend money (paid APIs, cloud services beyond free tier)
  • Publish to app stores or production hosting
  • Modify auth, payment, or PII handling without explicit approval
  • Force-push, rewrite git history, or delete branches
  • Auto-merge §META skill edits to the active SKILL.md

For a higher-autonomy mode that removes these T3 gates, see
§AUTO-UNCHAINED (different activation phrase + two-step confirmation).

═════════════════════════════════════════════════════════════════════
RISK_ACK
    echo -en "${Y}Type 'proceed' to activate §AUTO FULL, or anything else to drop to GUIDED:${N} " >&2
    read -r CONFIRM
    case "${CONFIRM,,}" in
        proceed)
            MODE="FULL"
            PERMISSION_MODE="auto"
            echo -e "${Y}═══ §AUTO FULL ACTIVATED ═══${N}" >&2
            echo "[$(date)] §AUTO FULL activated by user typed 'proceed'" >> "$LOG"
            ;;
        *)
            echo -e "${C}═══ Dropped to §AUTO-GUIDED ═══${N}" >&2
            echo "[$(date)] Activation phrase detected but user did not confirm with 'proceed' — running GUIDED" >> "$LOG"
            ;;
    esac
elif [ "$2" = "--unchained" ] && [ "$3" = "--brainstorm" ] && [ "$4" = "--build" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"
    PERMISSION_MODE="auto"
    BRAINSTORM=true
    BUILD=true
    MAX_LOOPS="$MAX_LOOPS_BRAINSTORM"
    echo -e "${R}═══ §AUTO-UNCHAINED + §BRAINSTORM + §BUILD-LOOP resume ═══${N}" >&2
    echo "[$(date)] §AUTO-UNCHAINED + §BRAINSTORM + §BUILD-LOOP resumed via flags" >> "$LOG"
elif [ "$2" = "--unchained" ] && [ "$3" = "--brainstorm" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"
    PERMISSION_MODE="auto"
    BRAINSTORM=true
    MAX_LOOPS="$MAX_LOOPS_BRAINSTORM"
    echo -e "${R}═══ §AUTO-UNCHAINED + §BRAINSTORM resume (--unchained --brainstorm) ═══${N}" >&2
    echo "[$(date)] §AUTO-UNCHAINED + §BRAINSTORM resumed via flags" >> "$LOG"
elif [ "$2" = "--unchained" ] && [ "$3" = "--build" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"
    PERMISSION_MODE="auto"
    BUILD=true
    MAX_LOOPS="$MAX_LOOPS_UNCHAINED"
    echo -e "${R}═══ §AUTO-UNCHAINED + §BUILD-LOOP resume (--unchained --build) ═══${N}" >&2
    echo "[$(date)] §AUTO-UNCHAINED + §BUILD-LOOP resumed via flags" >> "$LOG"
elif [ "$2" = "--unchained" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"
    PERMISSION_MODE="auto"
    MAX_LOOPS="$MAX_LOOPS_UNCHAINED"
    echo -e "${R}═══ §AUTO-UNCHAINED resume (--unchained flag) ═══${N}" >&2
    echo "[$(date)] §AUTO-UNCHAINED resumed via --unchained flag" >> "$LOG"
elif [ "$2" = "--full" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="FULL"
    PERMISSION_MODE="auto"
    echo -e "${Y}═══ §AUTO FULL resume (--full flag) ═══${N}" >&2
    echo "[$(date)] §AUTO FULL resumed via --full flag" >> "$LOG"
else
    echo -e "${C}═══ §AUTO-GUIDED mode (default) ═══${N}" >&2
    echo -e "${C}Permission prompts active.${N}" >&2
    echo -e "${C}To activate FULL:       type '$ACTIVATION_PHRASE' at start of prompt → 'proceed'${N}" >&2
    echo -e "${C}To activate UNCHAINED:  type '$UNCHAINED_PHRASE' at start of prompt → '$UNCHAINED_CONFIRM'${N}" >&2
    echo -e "${C}To add :brainstorm:     append '$BRAINSTORM_FLAG' to UNCHAINED prompt → '$BRAINSTORM_CONFIRM'${N}" >&2
    echo -e "${C}To add :build:          append '$BUILD_FLAG' to UNCHAINED prompt → '$BUILD_CONFIRM' (build features, not audit)${N}" >&2
fi

# ─── §AUTO injection (concise pointer; full rules in references/auto-mode.md) ─
if [ "$MODE" = "UNCHAINED" ]; then
AUTO_RULES="

=== §AUTO-UNCHAINED — runtime context ===
You are in §AUTO-UNCHAINED mode. The user typed the activation phrase AND
the explicit confirmation phrase 'i accept full responsibility' at the
script-level gate. They have read and accepted the unchained risk
acknowledgment.

Binding rules — RELAXATIONS from §AUTO FULL:
1. T3 actions execute without queueing. Force-push, history rewrite,
   feature deletion, schema changes, auth/payment/PII edits, paid API
   calls, app-store publish — all execute. Log each with tag
   [UNCHAINED-T3-EXECUTED] and a one-line rationale before acting.
2. Iron Laws 6 (Feature Preservation), 7 (Identity Preservation), and 9
   (Reversibility Before Action) are ADVISORIES, not blocks. Note in
   H5W-LOG.md when you override one and why.
3. §META can write directly to SKILL.md and references/*.md, EXCEPT
   for these PROTECTED SECTIONS which remain proposal-only even in
   UNCHAINED+BRAINSTORM (write to skill-improvements/SF-NNN.md, do
   NOT direct-edit):
     a. The Risk Acknowledgment heredocs in h5w-autoloop.sh
        (RISK_ACK, UNCHAINED_ACK, BRAINSTORM_ACK heredoc blocks)
     b. The Iron Laws section in SKILL.md (§LAW, lines covering
        Laws 1-12 + "Law application by mode")
     c. The §AUTO-UNCHAINED and §BRAINSTORM activation requirements
        (the trigger phrases, confirmation phrases, gate sequence)
     d. The AUTO_RULES injection block in h5w-autoloop.sh itself
   Editing these sections during the active session would be a
   self-modifying-loop hazard (rules at hour 4 ≠ rules at hour 0).
   Mirror every other §META edit to skill-improvements/SF-NNN.md
   so the user has a diff trail at session end.
4. §OBSTACLE: T3 external actions are authorized — paid APIs, force
   pushes, account creation, etc.

Binding rules — STILL APPLY (these are not removed):
5. NEVER use AskUserQuestion. Decide and log [AUTO-DECIDED].
6. ONE unit of work per response. End EVERY response with NEXT: [action].
7. Iron Laws 1-5, 8, 10-12 still apply (specificity, read-before-act,
   source integrity, bugs-before-refactors, minimum footprint, expansion
   boundaries, honesty over completeness, verify-or-don't-claim). These
   are about being accurate and honest, not about caution. Removing them
   would just make Claude lie.
8. When queue empties: §SIM.5 re-scan → §SIM.6 (50 Q) → §SIM.7 research.
9. Compact every 5 fixes via COMPACT-RESUME.md.
10. Resolve git policy from .h5w/git-policy or H5W_GIT_POLICY env.
    Default branch. (UNCHAINED does NOT override git policy — set
    policy=main if you want UNCHAINED to work directly on main.)
11. Every action goes in H5W-LOG.md. Every T3 execution gets
    [UNCHAINED-T3-EXECUTED] tag. The audit trail is the floor.

THE RUNWAY IS LONGER (MAX_LOOPS=60) but the same termination triggers
apply: context full, 5 self-correction failures, unrecoverable build,
stop patterns. UNCHAINED does NOT loop forever — it loops more.
=== END §AUTO-UNCHAINED ==="

# Append BRAINSTORM behavioral modifier when enabled.
if [ "$BRAINSTORM" = true ]; then
AUTO_RULES="$AUTO_RULES

=== §BRAINSTORM — closed-sandbox deep-work modifier ===
The user typed ':brainstorm' on UNCHAINED activation AND confirmed with
'this is my sandbox'. They want Claude to push much harder on hard
problems before declaring STUCK or done. This is for closed local
environments — the user is the only one who eats the cost of failure
and wants to see how far the system can actually go.

Effort caps RAISED:
B1. Self-correction: up to 20 attempts per finding (was 3). Each
    attempt MUST try a different approach class (not 'tweak the same
    regex 20 ways'). Track approach classes in H5W-LOG.md as
    [APPROACH-N: <class> — <result>].
B2. §OBSTACLE attempts: up to 10 per obstacle (was 3). REQUIRED to
    span at least 5 different approach classes before declaring STUCK.
    Class examples: regex / parser-combinator / AST-walk / LLM-classify
    / hand-rule-engine / external-tool-shell-out / format-conversion /
    network-fetch / sandbox-execute / static-analysis. Pick what fits.
B3. Session runway: 5-failures-and-stop limit REMOVED. The only true
    runway in BRAINSTORM is context-full (compact and continue) or the
    MAX_LOOPS=200 wall-clock cap.
B4. STUCK is not a queue entry. STUCK = routing signal to §SIM.8
    (BRAINSTORM-PIVOT — see below).
B5. 'I think I'm done' triggers §SIM.6 → §SIM.7 → §SIM.8 in sequence
    BEFORE any 'done' state. Three escalations of 'no, look harder'
    before runway can fire on its own.

§SIM.8 — BRAINSTORM-PIVOT (new escalation, only in BRAINSTORM mode):
When STUCK on an obstacle that has exhausted §OBSTACLE attempts:
  Step 1. RESEARCH WIDER. Spawn an Agent to research the PROBLEM CLASS
          (not the specific instance). Adjacent domains, alternative
          formulations, papers, similar tools.
  Step 2. DECOMPOSE. Re-state the problem at a different level of
          abstraction. If you tried to solve at API level, try at
          protocol level. If you tried at data level, try at semantic
          level.
  Step 3. REFRAME. State three different problems that share the same
          obstacle. Pick the cleanest one. Solve THAT. Backport.
  Step 4. SLEEP-ON-IT. Write current state to BRAINSTORM-NOTES.md
          (separate from H5W-LOG). Continue with a different finding
          for at least 3 iterations. Then re-read BRAINSTORM-NOTES.md
          with fresh framing.
  Step 5. Only after 1-4 fail does the obstacle get [GENUINELY-STUCK]
          and surface to the report.

HONESTY FLOOR (still applies, do not relax):
H1. Iron Laws 1-5, 8, 10-12 still apply — accuracy, specificity,
    source integrity, honest tagging. Logs report what was actually
    tried, including dead ends. No tidying.
H2. Genuine walls (auth, captcha, requires-credit-card, network egress
    blocked) are STILL flagged honestly as [GENUINE-WALL: <reason>].
    BRAINSTORM raises the bar for what counts as a wall but does not
    turn impossible into possible.
H3. If an approach succeeds because Claude misunderstood the problem,
    that's not success — flag as [SUCCESS-BUT-MISALIGNED] and re-verify
    against the original goal.

LOG TAGS unique to BRAINSTORM:
  [APPROACH-N: <class> — <result>]
  [PIVOT-STEP-1 / 2 / 3 / 4]
  [GENUINELY-STUCK: <reason after 4 pivot steps>]
  [SUCCESS-BUT-MISALIGNED: <gap>]
  [SLEEP-ON-IT: written to BRAINSTORM-NOTES.md]

=== END §BRAINSTORM ==="
fi

# Append BUILD-LOOP modifier when enabled. This is independent of BRAINSTORM
# — they can be active together (deep build) or BUILD alone (standard build).
if [ "$BUILD" = true ]; then
AUTO_RULES="$AUTO_RULES

=== §BUILD-LOOP — primary-loop modifier ===
The user typed ':build' on UNCHAINED activation AND confirmed with
'ship features'. The autoloop's primary work source is now H5W-BUILD.md
(build tasks queue), NOT H5W-QUEUE.md (audit findings queue). This
session's purpose is shipping features, not auditing existing code.

PRIMARY LOOP CHANGES:

L1. Read H5W-BUILD.md as the primary queue. If it doesn't exist, your
    first action is to create it from the user's prompt — translate
    their stated goal into 2-5 phased build tasks (B-001 through
    B-NNN). Use the table format documented in BUILD_ACK.

L2. Empty H5W-QUEUE.md (audit findings) does NOT terminate this
    session. Only empty H5W-BUILD.md does. If you find yourself
    'done with audit work', that is NOT a termination — pivot to
    the next BUILD task.

L3. §SIM.5 checkpoint cycle counter (Iron Law 10) does NOT apply to
    build progression. 'Cycle 1, 2, 3' counts apply when you are
    expanding audit scope. Advancing through B-001 phase 1 → B-001
    phase 2 → B-002 phase 1 is build progression, not expansion.
    Do not terminate at 'cycle 3' if there are TODO entries in
    H5W-BUILD.md.

L4. 'Multi-day features' / 'scope walls' are NOT walls in §BUILD-LOOP
    — they ARE the work. Do not terminate them as out-of-scope.
    Break them into phases and start phase 1.

L5. Audit findings that arise WHILE building (e.g., 'this existing
    function has a bug I just noticed') get appended to H5W-QUEUE.md
    as opportunistic notes — do NOT pivot to fixing them. The build
    task is the priority. Audit can run in a separate session.

L6. Termination conditions for §BUILD-LOOP:
    - H5W-BUILD.md has zero TODO entries (all DONE or BLOCKED)
    - Genuine wall (auth, network, requires-credit-card)
    - MAX_LOOPS exhausted
    - User-typed runway limit
    NOT terminating conditions: empty audit queue, 'cycle 3 reached',
    'no new actionable findings', 'scope walls identified'.

L7. Phase status tracking. Each B-NNN entry has a Status column.
    Update it as you work:
      TODO → IN-PROGRESS (when starting)
      IN-PROGRESS → DONE (after verification)
      IN-PROGRESS → BLOCKED (with [BLOCKER: reason] note)
    Move DONE entries to '## Completed' section at session end.

L8. Phase verification. A phase is DONE only when:
    - The code compiles/builds clean
    - The new functionality is exercised at least once (manual run,
      test invocation, or §VER trace through the code paths)
    - The change is committed per .h5w/git-policy
    Do not mark DONE on 'I wrote the code' alone — that's IN-PROGRESS
    until verified.

L9. Audit-as-side-effect. While building, you'll touch existing code.
    If §SIM.4 micro-H5W after a build phase finds an audit issue
    BLOCKING the build phase, fix it inline (it's part of the build).
    If it finds an issue UNRELATED to the build phase, log to
    H5W-QUEUE.md and continue building.

INTERACTION WITH §BRAINSTORM:
  - BUILD alone: standard effort caps within build phases.
  - BUILD + BRAINSTORM: raised caps apply to build obstacles. If
    phase implementation gets stuck, §SIM.8 PIVOT applies (research
    wider, decompose phase further, reframe the phase, sleep on it).
  - In both cases, the loop continues until H5W-BUILD.md is empty,
    not until audit findings run out.

=== END §BUILD-LOOP ==="
fi
elif [ "$MODE" = "FULL" ]; then
AUTO_RULES="

=== §AUTO FULL — runtime context ===
You are in §AUTO FULL mode. The activation gate has already been passed at
the script level — the user has typed 'proceed' after the Risk
Acknowledgment. Do NOT re-print the Risk Acknowledgment.

Binding rules (full text in references/auto-mode.md §The Five Rules):
1. NEVER use AskUserQuestion in this mode. Decide and log [AUTO-DECIDED].
2. ONE unit of work per response. End EVERY response with NEXT: [action].
3. When queue empties: §SIM.5 re-scan → §SIM.6 (50 Q) → §SIM.7 research.
4. §OBSTACLE: research → build → chain. Authorized for T1/T2 actions.
5. §META: write proposals to skill-improvements/SF-NNN.md ONLY. Do NOT
   edit SKILL.md or references/*.md.
6. Resolve git policy from .h5w/git-policy or H5W_GIT_POLICY env. Default branch.
7. Compact every 5 fixes via COMPACT-RESUME.md.
=== END §AUTO FULL ==="
else
AUTO_RULES="

=== §AUTO-GUIDED — runtime context ===
You are in §AUTO-GUIDED mode (default). Claude Code's permission prompts
remain active and WILL block on T2+ actions.

Binding rules (full text in references/auto-mode.md):
1. T0/T1 actions: silent (per §REV).
2. T2 actions: Claude Code's permission prompt blocks until user accepts/rejects.
3. T3 actions: queue, never execute.
4. Use AskUserQuestion when scope is genuinely ambiguous; do not abuse it.
5. ONE unit of work per response. End EVERY response with NEXT: [action].
6. §OBSTACLE: research and build tools, but ask before T2+ external actions.
7. §META: write proposals to skill-improvements/SF-NNN.md ONLY. Do NOT
   edit SKILL.md or references/*.md.
8. Resolve git policy from .h5w/git-policy or H5W_GIT_POLICY env. Default branch.
=== END §AUTO-GUIDED ==="
fi

# ─── First iteration ─────────────────────────────────────────
echo -e "${G}═══ H5W AUTO-LOOP STARTING ═══${N}"
echo "[$(date)] Start: ${PROMPT:0:80}..." >> "$LOG"

ITER=0

run_claude() {
    local prompt="$1"
    local flags=""

    if [ "$CONTINUE_MODE" = true ]; then
        flags="-c"
    fi

    claude $flags -p "$prompt" \
        --max-turns "$MAX_TURNS" \
        --permission-mode "$PERMISSION_MODE" \
        2>&1 | tee -a "$LOG"
}

# Mode-aware stop patterns. BRAINSTORM strips STUCK; BUILD additionally
# strips audit-completion patterns since BUILD-LOOP terminates on empty
# H5W-BUILD.md, not on audit-queue completion.
if [ "$BUILD" = true ]; then
    # In BUILD-LOOP, the only termination signals are runway / session-end /
    # report-written / explicit BUILD-COMPLETE marker.
    ACTIVE_STOP_PATTERNS="^RUNWAY LIMIT|^SESSION END|H5W-REPORT\.md (written|complete)|^BUILD-COMPLETE"
elif [ "$BRAINSTORM" = true ]; then
    ACTIVE_STOP_PATTERNS="^RUNWAY LIMIT|^SESSION END|H5W-REPORT\.md (written|complete)"
elif [ "$MODE" = "UNCHAINED" ]; then
    ACTIVE_STOP_PATTERNS="$STOP_PATTERNS"
else
    ACTIVE_STOP_PATTERNS="$STOP_PATTERNS_GUARDED"
fi

# First run
ITER=$((ITER + 1))
echo -e "${C}── Iteration $ITER / $MAX_LOOPS ──${N}"
OUTPUT=$(run_claude "${PROMPT}${AUTO_RULES}")
CONTINUE_MODE=true  # All subsequent runs continue the session

# Build a compact mode reminder appended to every CONT message. This survives
# compaction (the AUTO_RULES injection only happens on iteration 1; without
# this, post-compaction Claude can lose mode awareness — see SF-017).
if [ "$BRAINSTORM" = true ]; then
    MODE_REMINDER=" [MODE-CONTEXT: §AUTO-UNCHAINED + §BRAINSTORM. Caps: 20 self-correction attempts, 10 §OBSTACLE attempts (≥5 distinct approach classes), MAX_LOOPS=$MAX_LOOPS. STUCK routes to §SIM.8 BRAINSTORM-PIVOT. See references/auto-mode.md §BRAINSTORM. Iron Laws 6/7/9 advisories; 1-5,8,10-12 enforced. §META direct-edits exclude gate text and Iron Laws section.]"
elif [ "$MODE" = "UNCHAINED" ]; then
    MODE_REMINDER=" [MODE-CONTEXT: §AUTO-UNCHAINED. T3 executes (logged [UNCHAINED-T3-EXECUTED]). Iron Laws 6/7/9 advisories; 1-5,8,10-12 enforced. §META edits skill files with mirror to skill-improvements/. See references/auto-mode.md §AUTO-UNCHAINED.]"
elif [ "$MODE" = "FULL" ]; then
    MODE_REMINDER=" [MODE-CONTEXT: §AUTO FULL. T3 queues. All Iron Laws enforced. §META proposals only. See references/auto-mode.md.]"
else
    MODE_REMINDER=""
fi

# Append BUILD-LOOP context when active (orthogonal to BRAINSTORM).
if [ "$BUILD" = true ]; then
    MODE_REMINDER="$MODE_REMINDER [BUILD-LOOP: primary work source is H5W-BUILD.md, NOT H5W-QUEUE.md. Empty audit queue does NOT terminate. Iron Law 10 cycle counter does NOT apply to build progression. 'Scope walls' / 'multi-day features' ARE the work — break into phases and start phase 1. Phase status: TODO → IN-PROGRESS → DONE (after build+verify+commit) or BLOCKED. Termination: H5W-BUILD.md TODO count = 0, OR runway, OR genuine wall.]"
fi

# ─── Main loop ────────────────────────────────────────────────
while [ $ITER -lt $MAX_LOOPS ]; do
    # Check for stop signals
    if echo "$OUTPUT" | grep -qiE "$ACTIVE_STOP_PATTERNS"; then
        echo -e "${Y}Stop signal detected.${N}"
        break
    fi

    # SF-013: best-effort BRAINSTORM enforcement — count distinct approach
    # classes logged for the current finding before allowing GENUINELY-STUCK
    # to terminate. Helper script returns 0 if STUCK is allowed, 1 if it
    # needs more attempt diversity.
    if [ "$BRAINSTORM" = true ] && [ -x "$(dirname "$0")/scripts/h5w-brainstorm-check.sh" ] 2>/dev/null; then
        if echo "$OUTPUT" | grep -qE "GENUINELY-STUCK|cannot proceed"; then
            if ! bash "$(dirname "$0")/scripts/h5w-brainstorm-check.sh" 2>/dev/null; then
                # Approach diversity insufficient — do NOT terminate, push back
                CONT="GENUINELY-STUCK declared but H5W-LOG shows fewer than 5 distinct [APPROACH-N: <class>] tags for the current finding. BRAINSTORM requires ≥5 different approach classes before declaring STUCK. List the approach classes you have actually tried so far, then try one from a class you have NOT tried yet. NEXT: [approach class N+1]."
                sleep $COOLDOWN
                ITER=$((ITER + 1))
                echo -e "${C}── Iteration $ITER / $MAX_LOOPS (BRAINSTORM diversity push) ──${N}"
                OUTPUT=$(run_claude "${CONT}${MODE_REMINDER}")
                continue
            fi
        fi
    fi

    # Check for very short response (stuck). Routing depends on active mode:
    # - BUILD: push toward H5W-BUILD.md and current phase
    # - BRAINSTORM (no BUILD): push toward §SIM.8 pivot
    # - default: push toward audit queue / §SIM.6 nudge
    if [ ${#OUTPUT} -lt 50 ]; then
        echo -e "${Y}Short response — sending specific continue...${N}"
        if [ "$BUILD" = true ] && [ "$BRAINSTORM" = true ]; then
            CONT="Your last response was too short. Read H5W-BUILD.md — find the IN-PROGRESS task or the next TODO. If you're stuck on the current phase, run §SIM.8 BRAINSTORM-PIVOT on it. DO NOT declare BUILD-COMPLETE unless H5W-BUILD.md has zero TODO entries. NEXT: [phase action or pivot step]."
        elif [ "$BUILD" = true ]; then
            CONT="Your last response was too short. Read H5W-BUILD.md — find the IN-PROGRESS task or the next TODO. If H5W-BUILD.md doesn't exist yet, create it from the user's prompt with phased B-NNN tasks. DO NOT declare done unless H5W-BUILD.md has zero TODO entries. NEXT: [phase action or task creation]."
        elif [ "$BRAINSTORM" = true ]; then
            CONT="Your last response was too short. If you're STUCK, run §SIM.8 BRAINSTORM-PIVOT (research wider → decompose → reframe → sleep-on-it). DO NOT declare done. NEXT: [pivot step or specific action]."
        else
            CONT="Your last response was too short. Read H5W-QUEUE.md. If findings remain, fix the next one. If empty, run §SIM.6 question $(shuf -i 1-50 -n 1) on the codebase. Do real work. NEXT: [action]."
        fi
    else
        CONT="Continue. Do the NEXT action you stated. ONE unit of work. Medium-length response. End with NEXT: [action]."
    fi

    # SF-014: BRAINSTORM-NOTES.md visibility reminder — re-read after sleep-on-it.
    if [ "$BRAINSTORM" = true ] && [ -f BRAINSTORM-NOTES.md ]; then
        BS_NOTES_LINES=$(wc -l < BRAINSTORM-NOTES.md)
        CONT="$CONT [BRAINSTORM-NOTES.md exists ($BS_NOTES_LINES lines). If ≥3 iterations have passed since the last entry, re-read the file before deciding NEXT.]"
    fi

    # BUILD-LOOP: surface build queue status in every CONT message.
    if [ "$BUILD" = true ] && [ -f H5W-BUILD.md ]; then
        TODO_COUNT=$(grep -cE '\| TODO \||\| IN-PROGRESS \|' H5W-BUILD.md 2>/dev/null || echo 0)
        CONT="$CONT [H5W-BUILD.md status: $TODO_COUNT TODO/IN-PROGRESS entries remaining. Session terminates only when this reaches 0.]"
    fi

    sleep $COOLDOWN
    ITER=$((ITER + 1))
    echo -e "${C}── Iteration $ITER / $MAX_LOOPS ──${N}"
    OUTPUT=$(run_claude "${CONT}${MODE_REMINDER}")
done

# ─── Summary ──────────────────────────────────────────────────
echo -e "${G}═══ H5W AUTO-LOOP ENDED ═══${N}"
MODE_LABEL="$MODE"
[ "$BRAINSTORM" = true ] && MODE_LABEL="$MODE_LABEL + BRAINSTORM"
[ "$BUILD" = true ] && MODE_LABEL="$MODE_LABEL + BUILD-LOOP"
echo "  Mode: $MODE_LABEL"
echo "  Iterations: $ITER / $MAX_LOOPS"
echo "  Log: $LOG"
[ -f H5W-REPORT.md ] && echo -e "  ${G}✓ H5W-REPORT.md generated${N}"
[ -f H5W-QUEUE.md ] && echo "  Audit queue: $(grep -c '^|' H5W-QUEUE.md 2>/dev/null || echo 0) items"
if [ -f H5W-BUILD.md ]; then
    BUILD_TODO=$(grep -cE '\| TODO \||\| IN-PROGRESS \|' H5W-BUILD.md 2>/dev/null || echo 0)
    BUILD_DONE=$(grep -cE '\| DONE \|' H5W-BUILD.md 2>/dev/null || echo 0)
    echo "  Build queue: $BUILD_TODO TODO/IN-PROGRESS, $BUILD_DONE DONE"
fi
[ -f BRAINSTORM-NOTES.md ] && echo "  Brainstorm notes: $(wc -l < BRAINSTORM-NOTES.md) lines"
[ -d skill-improvements ] && echo "  Skill proposals: $(ls skill-improvements/SF-*.md 2>/dev/null | wc -l) file(s)"
echo ""

# Resume hint construction — match the active modifier combination.
if [ "$BUILD" = true ] && [ "$BRAINSTORM" = true ]; then
    echo "  Resume UNCHAINED + BRAINSTORM + BUILD: ./h5w-autoloop.sh --resume --unchained --brainstorm --build"
elif [ "$BUILD" = true ]; then
    echo "  Resume UNCHAINED + BUILD: ./h5w-autoloop.sh --resume --unchained --build"
elif [ "$BRAINSTORM" = true ]; then
    echo "  Resume UNCHAINED + BRAINSTORM: ./h5w-autoloop.sh --resume --unchained --brainstorm"
else
    case "$MODE" in
        UNCHAINED) echo "  Resume UNCHAINED: ./h5w-autoloop.sh --resume --unchained" ;;
        FULL)      echo "  Resume FULL:      ./h5w-autoloop.sh --resume --full" ;;
        *)         echo "  Resume:           ./h5w-autoloop.sh --resume" ;;
    esac
fi
