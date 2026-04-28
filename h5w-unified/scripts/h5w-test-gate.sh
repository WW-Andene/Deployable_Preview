#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# H5W Activation Gate Test — verifies the §AUTO mode resolution
# ═══════════════════════════════════════════════════════════════
#
# Tests the literal-phrase activation gate in h5w-autoloop.sh without
# actually invoking the Claude Code CLI. Builds a stub that exposes the
# resolved MODE / PERMISSION_MODE so we can assert correct routing.
#
# Run directly:  ./scripts/h5w-test-gate.sh
# Run via validator: bash scripts/h5w-validate.sh  (calls this at the end)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
AUTOLOOP="$SKILL_DIR/h5w-autoloop.sh"

G='\033[0;32m'; R='\033[0;31m'; N='\033[0m'
PASS=0; FAIL=0

# Build a test stub: replicate the autoloop's mode-resolution logic but
# stub out claude invocation and the interactive read for the gate.
# TEST_CONFIRM env var simulates what the user would type at the gate.
build_stub() {
    cat > /tmp/h5w-gate-stub.sh <<'STUB_EOF'
#!/bin/bash
set -e
ACTIVATION_PHRASE="run H5W full autonomous mode"
UNCHAINED_PHRASE="run H5W unchained autonomous mode"
UNCHAINED_CONFIRM="i accept full responsibility"
BRAINSTORM_FLAG=":brainstorm"
BRAINSTORM_CONFIRM="this is my sandbox"
BUILD_FLAG=":build"
BUILD_CONFIRM="ship features"
PERMISSION_MODE="default"
MODE="GUIDED"
BRAINSTORM=false
BUILD=false
PROMPT="$1"
CONTINUE_MODE=false
[ "$PROMPT" = "--resume" ] && CONTINUE_MODE=true && PROMPT="resume prompt"

phrase_at_start() {
    local p="$1" needle="$2"
    local pl="${p,,}" nl="${needle,,}"
    [[ "$pl" == "$nl"* ]] && return 0
    [[ "$pl" == *$'\n'"$nl"* ]] && return 0
    return 1
}

if phrase_at_start "$PROMPT" "$UNCHAINED_PHRASE"; then
    CONFIRM="${TEST_CONFIRM:-no}"
    if [ "${CONFIRM,,}" = "$UNCHAINED_CONFIRM" ]; then
        MODE="UNCHAINED"; PERMISSION_MODE="auto"
        if echo "$PROMPT" | grep -qiE "(^|[[:space:]])${BRAINSTORM_FLAG}([[:space:]]|$)"; then
            BS_CONFIRM="${TEST_BS_CONFIRM:-no}"
            if [ "${BS_CONFIRM,,}" = "$BRAINSTORM_CONFIRM" ]; then
                BRAINSTORM=true
            fi
        fi
        if echo "$PROMPT" | grep -qiE "(^|[[:space:]])${BUILD_FLAG}([[:space:]]|$)"; then
            BU_CONFIRM="${TEST_BUILD_CONFIRM:-no}"
            if [ "${BU_CONFIRM,,}" = "$BUILD_CONFIRM" ]; then
                BUILD=true
            fi
        fi
    fi
elif phrase_at_start "$PROMPT" "$ACTIVATION_PHRASE"; then
    CONFIRM="${TEST_CONFIRM:-no}"
    case "${CONFIRM,,}" in
        proceed) MODE="FULL"; PERMISSION_MODE="auto" ;;
        *) ;;
    esac
elif [ "$2" = "--unchained" ] && [ "$3" = "--brainstorm" ] && [ "$4" = "--build" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"; PERMISSION_MODE="auto"; BRAINSTORM=true; BUILD=true
elif [ "$2" = "--unchained" ] && [ "$3" = "--brainstorm" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"; PERMISSION_MODE="auto"; BRAINSTORM=true
elif [ "$2" = "--unchained" ] && [ "$3" = "--build" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"; PERMISSION_MODE="auto"; BUILD=true
elif [ "$2" = "--unchained" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="UNCHAINED"; PERMISSION_MODE="auto"
elif [ "$2" = "--full" ] && [ "$CONTINUE_MODE" = true ]; then
    MODE="FULL"; PERMISSION_MODE="auto"
fi
echo "MODE=$MODE PERMISSION=$PERMISSION_MODE BRAINSTORM=$BRAINSTORM BUILD=$BUILD"
STUB_EOF
    chmod +x /tmp/h5w-gate-stub.sh
}

assert() {
    local desc="$1" expected="$2" actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo -e "  ${G}✓${N} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${R}✗${N} $desc"
        echo -e "    expected: $expected"
        echo -e "    actual:   $actual"
        FAIL=$((FAIL + 1))
    fi
}

run_case() {
    local desc="$1" prompt="$2" extra_arg="$3" confirm="$4" expected="$5"
    local actual=$(TEST_CONFIRM="$confirm" bash /tmp/h5w-gate-stub.sh "$prompt" "$extra_arg" 2>/dev/null)
    assert "$desc" "$expected" "$actual"
}

run_case3() {
    # Three-arg invocation for --resume --unchained --brainstorm
    local desc="$1" arg1="$2" arg2="$3" arg3="$4" confirm="$5" expected="$6"
    local actual=$(TEST_CONFIRM="$confirm" bash /tmp/h5w-gate-stub.sh "$arg1" "$arg2" "$arg3" 2>/dev/null)
    assert "$desc" "$expected" "$actual"
}

run_bs_case() {
    # BRAINSTORM-aware: takes both confirm phrases
    local desc="$1" prompt="$2" arg2="$3" arg3="$4" confirm="$5" bs_confirm="$6" expected="$7"
    local actual=$(TEST_CONFIRM="$confirm" TEST_BS_CONFIRM="$bs_confirm" bash /tmp/h5w-gate-stub.sh "$prompt" "$arg2" "$arg3" 2>/dev/null)
    assert "$desc" "$expected" "$actual"
}

run_build_case() {
    # BUILD-aware: takes UNCHAINED confirm + BUILD confirm (no BRAINSTORM)
    local desc="$1" prompt="$2" confirm="$3" build_confirm="$4" expected="$5"
    local actual=$(TEST_CONFIRM="$confirm" TEST_BUILD_CONFIRM="$build_confirm" bash /tmp/h5w-gate-stub.sh "$prompt" 2>/dev/null)
    assert "$desc" "$expected" "$actual"
}

run_full_combo_case() {
    # All three modifiers: UNCHAINED + BRAINSTORM + BUILD
    local desc="$1" prompt="$2" confirm="$3" bs_confirm="$4" build_confirm="$5" expected="$6"
    local actual=$(TEST_CONFIRM="$confirm" TEST_BS_CONFIRM="$bs_confirm" TEST_BUILD_CONFIRM="$build_confirm" bash /tmp/h5w-gate-stub.sh "$prompt" 2>/dev/null)
    assert "$desc" "$expected" "$actual"
}

run_case4() {
    # Four-arg invocation for --resume --unchained --brainstorm --build
    local desc="$1" arg1="$2" arg2="$3" arg3="$4" arg4="$5" expected="$6"
    local actual=$(bash /tmp/h5w-gate-stub.sh "$arg1" "$arg2" "$arg3" "$arg4" 2>/dev/null)
    assert "$desc" "$expected" "$actual"
}

echo "=== H5W Activation Gate Tests ==="
echo "  Stub of: $AUTOLOOP (mode-resolution logic only)"
echo

build_stub

# Default behavior — autonomous-sounding phrases route to GUIDED
run_case "GUIDED on 'improve my app autonomously'" \
    "improve my app autonomously" "" "" "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "GUIDED on 'you decide, I'll be back'" \
    "you decide what to do, I'll be back later" "" "" "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "GUIDED on 'handle it'" \
    "handle it yourself" "" "" "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "GUIDED on 'run for 2 hours'" \
    "run autonomously for the next 2 hours" "" "" "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

# FULL — literal phrase at start + 'proceed'
run_case "FULL on literal phrase + proceed" \
    "run H5W full autonomous mode and improve everything" "" "proceed" \
    "MODE=FULL PERMISSION=auto BRAINSTORM=false BUILD=false"

run_case "FULL case-insensitive + PROCEED" \
    "Run H5W FULL autonomous Mode now" "" "PROCEED" \
    "MODE=FULL PERMISSION=auto BRAINSTORM=false BUILD=false"

run_case "FULL on phrase as entire prompt + proceed" \
    "run H5W full autonomous mode" "" "proceed" \
    "MODE=FULL PERMISSION=auto BRAINSTORM=false BUILD=false"

# Phrase at start but user does NOT confirm → GUIDED
run_case "Phrase + cancel → GUIDED" \
    "run H5W full autonomous mode" "" "cancel" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "Phrase + empty confirm → GUIDED" \
    "run H5W full autonomous mode" "" "" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "Phrase + 'yes' (not 'proceed') → GUIDED" \
    "run H5W full autonomous mode" "" "yes" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

# Metalinguistic mention — phrase NOT at start of prompt → GUIDED
run_case "Metalinguistic mid-prompt mention → GUIDED" \
    "should I run H5W full autonomous mode for this project?" "" "proceed" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "Phrase quoted in middle → GUIDED" \
    "explain what 'run H5W full autonomous mode' does" "" "proceed" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

# Resume path
run_case "--resume alone → GUIDED (safe default)" \
    "--resume" "" "" "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "--resume --full → FULL" \
    "--resume" "--full" "" "MODE=FULL PERMISSION=auto BRAINSTORM=false BUILD=false"

run_case "--resume --unchained → UNCHAINED" \
    "--resume" "--unchained" "" "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

# UNCHAINED — two-phrase gate (phrase + literal confirmation)
run_case "UNCHAINED literal phrase + correct confirm" \
    "run H5W unchained autonomous mode and rebuild this app" "" "i accept full responsibility" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_case "UNCHAINED case-insensitive" \
    "Run H5W UNCHAINED autonomous Mode" "" "I Accept Full Responsibility" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_case "UNCHAINED phrase + 'proceed' (FULL's word) → GUIDED" \
    "run H5W unchained autonomous mode" "" "proceed" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "UNCHAINED phrase + 'yes' → GUIDED" \
    "run H5W unchained autonomous mode" "" "yes" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "UNCHAINED phrase + empty confirm → GUIDED" \
    "run H5W unchained autonomous mode" "" "" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "UNCHAINED phrase + partial confirm 'i accept' → GUIDED" \
    "run H5W unchained autonomous mode" "" "i accept" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "UNCHAINED metalinguistic mention → GUIDED" \
    "what does 'run H5W unchained autonomous mode' do?" "" "i accept full responsibility" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case "UNCHAINED checked BEFORE FULL — phrase containing both" \
    "run H5W unchained autonomous mode" "" "i accept full responsibility" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

# BRAINSTORM — three-phrase gate (UNCHAINED phrase + :brainstorm flag +
# UNCHAINED confirm + BRAINSTORM confirm)
run_bs_case "BRAINSTORM full happy path: phrase + :brainstorm + both confirms" \
    "run H5W unchained autonomous mode :brainstorm and push hard" "" "" \
    "i accept full responsibility" "this is my sandbox" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=true BUILD=false"

run_bs_case "BRAINSTORM case-insensitive on both confirms" \
    "Run H5W UNCHAINED autonomous Mode :BRAINSTORM" "" "" \
    "I Accept Full Responsibility" "This Is My Sandbox" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=true BUILD=false"

run_bs_case "BRAINSTORM phrase + UNCHAINED confirm but BS confirm wrong → plain UNCHAINED" \
    "run H5W unchained autonomous mode :brainstorm" "" "" \
    "i accept full responsibility" "yes please" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_bs_case "BRAINSTORM phrase + UNCHAINED confirm but no BS confirm → plain UNCHAINED" \
    "run H5W unchained autonomous mode :brainstorm" "" "" \
    "i accept full responsibility" "" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_bs_case "BRAINSTORM phrase but UNCHAINED confirm wrong → GUIDED, BS not even reached" \
    "run H5W unchained autonomous mode :brainstorm" "" "" \
    "proceed" "this is my sandbox" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_bs_case "BRAINSTORM phrase + 'i accept' partial → GUIDED" \
    "run H5W unchained autonomous mode :brainstorm" "" "" \
    "i accept" "this is my sandbox" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_bs_case "BRAINSTORM partial confirm 'this is my' → plain UNCHAINED" \
    "run H5W unchained autonomous mode :brainstorm" "" "" \
    "i accept full responsibility" "this is my" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

# Resume paths for BRAINSTORM
run_case3 "--resume --unchained --brainstorm → UNCHAINED + BRAINSTORM" \
    "--resume" "--unchained" "--brainstorm" "" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=true BUILD=false"

# :brainstorm flag without UNCHAINED phrase → has no effect
run_case ":brainstorm flag alone (no UNCHAINED phrase) → GUIDED" \
    "improve my app :brainstorm" "" "" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_case ":brainstorm with FULL phrase → just FULL (BRAINSTORM only attaches to UNCHAINED)" \
    "run H5W full autonomous mode :brainstorm" "" "proceed" \
    "MODE=FULL PERMISSION=auto BRAINSTORM=false BUILD=false"

# SF-018 — boundary tightening
run_bs_case "SF-018: ':brainstormy' (embedded suffix) does NOT activate flag" \
    "run H5W unchained autonomous mode :brainstormy" "" "" \
    "i accept full responsibility" "this is my sandbox" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_bs_case "SF-018: 'test:brainstormstuff' (embedded both sides) does NOT activate" \
    "run H5W unchained autonomous mode test:brainstormstuff" "" "" \
    "i accept full responsibility" "this is my sandbox" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_bs_case "SF-018: ':brainstorm' at end of prompt activates flag" \
    "run H5W unchained autonomous mode and try :brainstorm" "" "" \
    "i accept full responsibility" "this is my sandbox" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=true BUILD=false"

# SF-021 — BUILD-LOOP modifier (audit-loop → build-loop primary)
run_build_case "BUILD: literal phrase + :build + both confirms → UNCHAINED+BUILD" \
    "run H5W unchained autonomous mode :build implement multi-monitor support" \
    "i accept full responsibility" "ship features" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=true"

run_build_case "BUILD: case-insensitive on both confirms" \
    "Run H5W UNCHAINED autonomous Mode :BUILD" \
    "I Accept Full Responsibility" "Ship Features" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=true"

run_build_case "BUILD: UNCHAINED confirmed but build confirm wrong → UNCHAINED only" \
    "run H5W unchained autonomous mode :build" \
    "i accept full responsibility" "yes" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_build_case "BUILD: 'proceed' (FULL's word) → drops to GUIDED, BUILD never activated" \
    "run H5W unchained autonomous mode :build" \
    "proceed" "ship features" \
    "MODE=GUIDED PERMISSION=default BRAINSTORM=false BUILD=false"

run_build_case "BUILD: ':buildy' (embedded suffix) does NOT activate flag" \
    "run H5W unchained autonomous mode :buildy" \
    "i accept full responsibility" "ship features" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_build_case "BUILD: 'test:buildstuff' (embedded both sides) does NOT activate" \
    "run H5W unchained autonomous mode test:buildstuff" \
    "i accept full responsibility" "ship features" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=false"

run_build_case "BUILD: ':build' alone with FULL phrase → just FULL, BUILD ignored" \
    "run H5W full autonomous mode :build" \
    "proceed" "ship features" \
    "MODE=FULL PERMISSION=auto BRAINSTORM=false BUILD=false"

# All three modifiers
run_full_combo_case "TRIPLE: UNCHAINED + BRAINSTORM + BUILD all activate" \
    "run H5W unchained autonomous mode :brainstorm :build implement features hard" \
    "i accept full responsibility" "this is my sandbox" "ship features" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=true BUILD=true"

run_full_combo_case "TRIPLE: only BUILD confirm matches → UNCHAINED + BUILD (no BRAINSTORM)" \
    "run H5W unchained autonomous mode :brainstorm :build" \
    "i accept full responsibility" "wrong sandbox" "ship features" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=true"

run_full_combo_case "TRIPLE: only BRAINSTORM confirm matches → UNCHAINED + BRAINSTORM (no BUILD)" \
    "run H5W unchained autonomous mode :brainstorm :build" \
    "i accept full responsibility" "this is my sandbox" "wrong" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=true BUILD=false"

# Resume paths for BUILD
run_case3 "--resume --unchained --build → UNCHAINED + BUILD" \
    "--resume" "--unchained" "--build" "" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=false BUILD=true"

run_case4 "--resume --unchained --brainstorm --build → all three" \
    "--resume" "--unchained" "--brainstorm" "--build" \
    "MODE=UNCHAINED PERMISSION=auto BRAINSTORM=true BUILD=true"

echo
echo "═══════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
    echo -e "${G}  PASSED — $PASS/$((PASS + FAIL)) gate cases${N}"
else
    echo -e "${R}  FAILED — $FAIL/$((PASS + FAIL)) gate cases failed${N}"
fi
echo "═══════════════════════════════════════════"

# Cleanup
rm -f /tmp/h5w-gate-stub.sh

[ "$FAIL" -eq 0 ]
