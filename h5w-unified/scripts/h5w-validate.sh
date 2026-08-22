#!/bin/bash
# ═══════════════════════════════════════════════════
# H5W Validate — Verify skill installation integrity
# ═══════════════════════════════════════════════════
#
# Usage: ./h5w-validate.sh
#
# Checks that all files are present, cross-references resolve,
# and the skill is ready to use.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }

echo -e "${GREEN}H5W Skill Validation${NC}"
echo "  Location: $SKILL_DIR"
echo ""

# 1. Required files
echo "=== Files ==="
for f in \
    SKILL.md \
    CHANGELOG.md \
    h5w-autoloop.sh \
    scripts/h5w-init.sh \
    scripts/h5w-validate.sh \
    templates/H5W-LOG.md \
    templates/H5W-QUEUE.md \
    templates/H5W-ASSUMPTIONS.md \
    templates/COMPACT-RESUME.md \
    templates/H5W-REPORT.md \
    templates/PRODUCT-BRIEF.md \
    templates/ci/android-build.yml \
    templates/ci/web-deploy.yml \
    templates/CLAUDE.md \
    references/mod-app-audit.md \
    references/mod-code-audit.md \
    references/mod-design-audit.md \
    references/mod-art-direction.md \
    references/mod-restructuring.md \
    references/mod-scope-context.md \
    references/sim-engine.md \
    references/product-lifecycle.md \
    references/build-protocol.md \
    references/deliver-infrastructure.md \
    references/obstacle-protocol.md \
    references/meta-protocol.md \
    references/auto-mode.md; do
    if [ -f "$SKILL_DIR/$f" ]; then
        pass "$f"
    else
        fail "$f MISSING"
    fi
done

echo ""

# 2. Script permissions
echo "=== Permissions ==="
for s in h5w-autoloop.sh scripts/h5w-init.sh scripts/h5w-validate.sh; do
    if [ -x "$SKILL_DIR/$s" ]; then
        pass "$s is executable"
    else
        warn "$s not executable — run: chmod +x $SKILL_DIR/$s"
    fi
done

echo ""

# 3. Cross-reference check
echo "=== Cross-References ==="

# Old filenames
old=$(grep -r '\w*-SKILL\.md' "$SKILL_DIR/references/" 2>/dev/null | wc -l)
if [ "$old" -eq 0 ]; then
    pass "No old skill filenames in modules"
else
    fail "$old old skill filename references found"
fi

# Module/protocol references in Chief Guide
for mod in mod-app-audit mod-code-audit mod-design-audit mod-art-direction mod-restructuring mod-scope-context \
           sim-engine product-lifecycle build-protocol deliver-infrastructure obstacle-protocol meta-protocol auto-mode; do
    refs=$(grep -c "$mod" "$SKILL_DIR/SKILL.md" 2>/dev/null || true)
    if [ "$refs" -gt 0 ]; then
        pass "SKILL.md references $mod ($refs refs)"
    else
        warn "SKILL.md has no references to $mod"
    fi
done

echo ""

# 4. Module headers
echo "=== Module Headers ==="
for f in "$SKILL_DIR"/references/*.md; do
    name=$(basename "$f")
    invoked=$(grep -c "Invoked when" "$f" 2>/dev/null)
    auto=$(grep -cE "§AUTO mode|§AUTO FULL or UNCHAINED|the §AUTO protocol" "$f" 2>/dev/null)
    if [ "$invoked" -ge 1 ] && [ "$auto" -ge 1 ]; then
        pass "$name has invocation + §AUTO override"
    else
        fail "$name missing invocation ($invoked) or §AUTO ($auto)"
    fi
done

echo ""

# 5. Key sections in Chief Guide
echo "=== Chief Guide Sections ==="
for section in TRIAGE "§0" "§I" "§LAW" "§SRC" "§FMT" "§REV" "§VER" \
    "§SIM" "§PRODUCT" "§BUILD" "§DELIVER" "§WORKFLOW" "§SESSION" \
    "§OBSTACLE" "§META" "§AUTO" "§DOC" "§PLAT" "§MODE" "§ANTI" \
    "§XCUT" "§DLVR" "§MANDATE"; do
    found=$(grep -c "^## §*$section\|^## .*$section" "$SKILL_DIR/SKILL.md" 2>/dev/null)
    if [ "$found" -ge 1 ]; then
        pass "$section defined"
    else
        fail "$section NOT FOUND in Chief Guide"
    fi
done

echo ""

# 6. Internal consistency
echo "=== Consistency ==="

# 6a. Code-fence parity in SKILL.md and modules
for f in "$SKILL_DIR/SKILL.md" "$SKILL_DIR"/references/*.md; do
    name=$(basename "$f")
    fences=$(grep -c '^```' "$f" || true)
    if [ $((fences % 2)) -eq 0 ]; then
        pass "$name code fences balanced ($fences)"
    else
        fail "$name has UNCLOSED code fence ($fences fences — must be even)"
    fi
done

# 6b. 50/55 Questions consistency — body defines 50, references must match.
# Skip the CHANGELOG entry that documents the fix itself.
fifty_five=$(grep -lE "55 [Qq]uestion" "$SKILL_DIR/SKILL.md" "$SKILL_DIR"/templates/CLAUDE.md 2>/dev/null | wc -l)
if [ "$fifty_five" -eq 0 ]; then
    pass "No stale '55 Questions' references"
else
    fail "Found '55 Questions' references in $fifty_five files (canonical is 50)"
fi
shuf_55=$(grep -c "1-55" "$SKILL_DIR/h5w-autoloop.sh" || true)
if [ "$shuf_55" -eq 0 ]; then
    pass "autoloop shuf range matches 50 Questions"
else
    fail "autoloop has 'shuf -i 1-55' but body defines 50 questions"
fi

# 6c. Anti-pattern count: TOC line and section header must agree
toc_count=$(grep -oE "[0-9]+ things Claude must never do" "$SKILL_DIR/SKILL.md" | head -1 | grep -oE "^[0-9]+" || true)
hdr_count=$(grep -oE "ANTI-PATTERNS — [0-9]+ Things" "$SKILL_DIR/SKILL.md" | head -1 | grep -oE "[0-9]+" || true)
body_count=$(awk '/^## §ANTI/,/^## §XCUT/' "$SKILL_DIR/SKILL.md" | grep -cE "^\| [0-9]+ \| \*\*" || true)
if [ "$toc_count" = "$hdr_count" ] && [ "$hdr_count" = "$body_count" ]; then
    pass "Anti-pattern count consistent (TOC=$toc_count, header=$hdr_count, rows=$body_count)"
else
    fail "Anti-pattern count mismatch: TOC=$toc_count, header=$hdr_count, rows=$body_count"
fi

# 6d. SKILL.md line count matches CHANGELOG claim (first/newest claim wins)
actual_lines=$(wc -l < "$SKILL_DIR/SKILL.md")
claimed=$(grep -oE "Chief Guide — [0-9,]+ lines" "$SKILL_DIR/CHANGELOG.md" | head -1 | grep -oE "[0-9,]+" || true)
claimed_clean=$(echo "$claimed" | tr -d ',')
if [ -n "$claimed_clean" ] && [ "$actual_lines" -eq "$claimed_clean" ]; then
    pass "CHANGELOG line count matches SKILL.md ($actual_lines)"
else
    warn "CHANGELOG claims $claimed lines, actual is $actual_lines"
fi

# 6e. Stale "Chief Guide §X" references for sections that were extracted
# to references/. Sections that LIVE in SKILL.md remain valid.
# Skip the meta-audit report and changelog (which document the fix).
extracted_sections="§SIM §AUTO §META §OBSTACLE §BUILD §DELIVER §PRODUCT"
stale_refs=0
for section in $extracted_sections; do
    count=$(grep -rE "Chief Guide ${section}\\b" "$SKILL_DIR" --include="*.md" \
        --exclude="META-AUDIT-REPORT.md" \
        --exclude="CHANGELOG.md" \
        --exclude="CHANGE-MANIFEST.md" \
        --exclude="AUDIT-REPORT.md" \
        2>/dev/null | wc -l || true)
    stale_refs=$((stale_refs + count))
done
if [ "$stale_refs" -eq 0 ]; then
    pass "No stale 'Chief Guide §X' refs to extracted sections"
else
    fail "$stale_refs stale 'Chief Guide §X' references to sections now in references/"
fi

# 6f. Empty sections (### header followed immediately by another ### header)
empty_sections=$(awk '
    /^### / { if (prev_was_heading && prev_line) print FILENAME ":" prev_lineno ": " prev_line; prev_was_heading=1; prev_line=$0; prev_lineno=NR; next }
    /^[[:space:]]*$/ { next }
    { prev_was_heading=0; prev_line=""; prev_lineno=0 }
' "$SKILL_DIR/SKILL.md" "$SKILL_DIR"/references/*.md 2>/dev/null | wc -l || true)
if [ "$empty_sections" -eq 0 ]; then
    pass "No empty sections (### immediately followed by ###)"
else
    warn "$empty_sections likely-empty section header(s) detected"
fi

# 6g. Autoloop AUTO_RULES drift — both modes should reference auto-mode.md
auto_pointer=$(grep -c "references/auto-mode.md" "$SKILL_DIR/h5w-autoloop.sh" || true)
if [ "$auto_pointer" -ge 2 ]; then
    pass "autoloop AUTO_RULES point at references/auto-mode.md (2+ refs)"
else
    warn "autoloop has $auto_pointer pointer(s) to references/auto-mode.md (expected >= 2)"
fi

# 6h. UNCHAINED gate must require two distinct phrases.
unchained_phrase=$(grep -c "UNCHAINED_PHRASE=" "$SKILL_DIR/h5w-autoloop.sh" || true)
unchained_confirm=$(grep -c "UNCHAINED_CONFIRM=" "$SKILL_DIR/h5w-autoloop.sh" || true)
unchained_check=$(grep -c "i accept full responsibility" "$SKILL_DIR/h5w-autoloop.sh" || true)
if [ "$unchained_phrase" -ge 1 ] && [ "$unchained_confirm" -ge 1 ] && [ "$unchained_check" -ge 1 ]; then
    pass "UNCHAINED gate has trigger phrase + distinct confirmation phrase"
else
    fail "UNCHAINED gate missing components (phrase=$unchained_phrase confirm=$unchained_confirm check=$unchained_check)"
fi

# 6i. UNCHAINED docs warn about removed protections.
unchained_doc=$(grep -lE "§AUTO-UNCHAINED|UNCHAINED" "$SKILL_DIR/SKILL.md" "$SKILL_DIR"/references/auto-mode.md 2>/dev/null | wc -l)
if [ "$unchained_doc" -ge 2 ]; then
    pass "UNCHAINED documented in SKILL.md and references/auto-mode.md"
else
    warn "UNCHAINED documentation incomplete ($unchained_doc files)"
fi

# 6j. BRAINSTORM modifier gate must require three phrases:
# UNCHAINED_PHRASE + UNCHAINED_CONFIRM + BRAINSTORM_FLAG + BRAINSTORM_CONFIRM
bs_flag=$(grep -c 'BRAINSTORM_FLAG=' "$SKILL_DIR/h5w-autoloop.sh" || true)
bs_confirm=$(grep -c 'BRAINSTORM_CONFIRM=' "$SKILL_DIR/h5w-autoloop.sh" || true)
bs_check=$(grep -c "this is my sandbox" "$SKILL_DIR/h5w-autoloop.sh" || true)
bs_doc=$(grep -lE "§BRAINSTORM|BRAINSTORM-PIVOT" "$SKILL_DIR/SKILL.md" "$SKILL_DIR"/references/auto-mode.md "$SKILL_DIR"/references/sim-engine.md 2>/dev/null | wc -l)
if [ "$bs_flag" -ge 1 ] && [ "$bs_confirm" -ge 1 ] && [ "$bs_check" -ge 1 ]; then
    pass "BRAINSTORM gate has flag + distinct confirmation phrase"
else
    fail "BRAINSTORM gate missing components (flag=$bs_flag confirm=$bs_confirm check=$bs_check)"
fi
if [ "$bs_doc" -ge 3 ]; then
    pass "§BRAINSTORM documented in SKILL.md, auto-mode.md, sim-engine.md"
else
    warn "§BRAINSTORM documentation incomplete ($bs_doc files)"
fi

# 6k. SF-011: Iron Laws 6, 7, 9 must declare mode-conditionality.
# Look for the "Law application by mode" subsection or per-law caveats.
mode_aware=$(grep -cE "Law application by mode|In §AUTO-UNCHAINED.*advisory|mode-conditional" "$SKILL_DIR/SKILL.md" || true)
if [ "$mode_aware" -ge 2 ]; then
    pass "Iron Laws declare mode-conditionality (SF-011 closed)"
else
    fail "Iron Laws 6/7/9 stated as absolute without UNCHAINED mode-conditionality (SF-011)"
fi

# 6l. SF-016: module headers should say "In §AUTO FULL or UNCHAINED",
# not blanket "In §AUTO mode" (which would include GUIDED).
stale_auto_mode=$(grep -rE "^> \*\*In §AUTO mode:\*\*" "$SKILL_DIR"/references/mod-*.md 2>/dev/null | wc -l)
if [ "$stale_auto_mode" -eq 0 ]; then
    pass "Module headers correctly scope §AUTO override to FULL/UNCHAINED (SF-016 closed)"
else
    fail "$stale_auto_mode module headers use blanket 'In §AUTO mode' (SF-016 — wrong for GUIDED)"
fi

# 6m. SF-017: AUTO_RULES injection alone is insufficient — need MODE_REMINDER
# in CONT messages so post-compaction Claude retains mode awareness.
mode_reminder=$(grep -c "MODE_REMINDER" "$SKILL_DIR/h5w-autoloop.sh" || true)
if [ "$mode_reminder" -ge 4 ]; then
    pass "MODE_REMINDER constructed and injected in CONT messages (SF-017 closed)"
else
    fail "MODE_REMINDER missing or under-used in autoloop ($mode_reminder refs, expected 4+ — SF-017)"
fi

# 6n. SF-013: BRAINSTORM diversity check helper exists and is wired.
if [ -x "$SKILL_DIR/scripts/h5w-brainstorm-check.sh" ]; then
    pass "scripts/h5w-brainstorm-check.sh exists and is executable (SF-013)"
else
    warn "scripts/h5w-brainstorm-check.sh missing or not executable (SF-013 enforcement absent)"
fi

# 6o. SF-021: BUILD-LOOP modifier gate must require flag + distinct
# confirmation phrase. Three components: BUILD_FLAG, BUILD_CONFIRM, the
# literal "ship features" check.
build_flag=$(grep -c 'BUILD_FLAG=' "$SKILL_DIR/h5w-autoloop.sh" || true)
build_confirm_var=$(grep -c 'BUILD_CONFIRM=' "$SKILL_DIR/h5w-autoloop.sh" || true)
build_check=$(grep -c "ship features" "$SKILL_DIR/h5w-autoloop.sh" || true)
if [ "$build_flag" -ge 1 ] && [ "$build_confirm_var" -ge 1 ] && [ "$build_check" -ge 1 ]; then
    pass "BUILD-LOOP gate has flag + distinct confirmation phrase (SF-021)"
else
    fail "BUILD-LOOP gate missing components (flag=$build_flag confirm_var=$build_confirm_var check=$build_check — SF-021)"
fi

# 6p. SF-021: BUILD template exists for bootstrapping H5W-BUILD.md.
if [ -f "$SKILL_DIR/templates/H5W-BUILD.md.template" ]; then
    pass "templates/H5W-BUILD.md.template exists (SF-021 bootstrap)"
else
    warn "templates/H5W-BUILD.md.template missing (SF-021 bootstrap unavailable)"
fi

# 6q. SF-021: §BUILD-LOOP documented in SKILL.md and references/auto-mode.md.
build_doc=$(grep -lE "§BUILD-LOOP|BUILD-LOOP" "$SKILL_DIR/SKILL.md" "$SKILL_DIR"/references/auto-mode.md 2>/dev/null | wc -l)
if [ "$build_doc" -ge 2 ]; then
    pass "§BUILD-LOOP documented in SKILL.md and auto-mode.md (SF-021)"
else
    warn "§BUILD-LOOP documentation incomplete ($build_doc files — SF-021)"
fi

echo ""

# 7. Activation gate behavior tests
if [ -x "$SCRIPT_DIR/h5w-test-gate.sh" ]; then
    echo "=== Activation Gate ==="
    if bash "$SCRIPT_DIR/h5w-test-gate.sh" >/tmp/gate-test-output.log 2>&1; then
        gate_passed=$(grep -c "✓" /tmp/gate-test-output.log || true)
        pass "Activation gate: $gate_passed cases pass"
    else
        gate_failed=$(grep -c "✗" /tmp/gate-test-output.log || true)
        fail "Activation gate: $gate_failed cases failed (see /tmp/gate-test-output.log)"
    fi
    rm -f /tmp/gate-test-output.log
    echo ""
fi

# 8. Summary
echo "═══════════════════════════════════════════"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}  PASSED — Skill installation is valid${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}  PASSED with $WARNINGS warnings${NC}"
else
    echo -e "${RED}  FAILED — $ERRORS errors, $WARNINGS warnings${NC}"
fi
echo "═══════════════════════════════════════════"
