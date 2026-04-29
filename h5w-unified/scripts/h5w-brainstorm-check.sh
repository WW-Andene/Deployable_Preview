#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# H5W BRAINSTORM Diversity Check — best-effort enforcement
# ═══════════════════════════════════════════════════════════════
#
# When Claude declares GENUINELY-STUCK in BRAINSTORM mode, this helper
# scans H5W-LOG.md for [APPROACH-N: <class> — <result>] tags. If fewer
# than 5 distinct approach classes have been logged for the current
# finding, returns non-zero — telling the autoloop to push back instead
# of accepting the STUCK declaration.
#
# This is best-effort: it relies on Claude actually logging the tags.
# It does not enforce that "different class" means structurally
# different. But it raises the bar from "Claude can give up at 4
# attempts" to "Claude must at least *log* 5 distinct class names
# before BRAINSTORM accepts STUCK as genuine."
#
# Returns:
#   0 — STUCK is allowed (≥5 distinct classes found)
#   1 — push back (fewer than 5 distinct classes)
#   2 — H5W-LOG.md missing (can't check, allow STUCK)

set -e

LOG_FILE="${H5W_LOG_FILE:-H5W-LOG.md}"

if [ ! -f "$LOG_FILE" ]; then
    # Can't check; don't block. Claude is responsible.
    exit 2
fi

# Extract approach class strings from log. The expected tag format is:
#   [APPROACH-N: <class> — <result>]
# We grep for the class part (between ': ' and ' —').
distinct_classes=$(grep -oE '\[APPROACH-[0-9]+: [^—]+—' "$LOG_FILE" 2>/dev/null \
    | sed -E 's/^\[APPROACH-[0-9]+: //; s/[[:space:]]+—$//' \
    | sort -u \
    | wc -l)

if [ "$distinct_classes" -ge 5 ]; then
    # Enough diversity — STUCK is allowed
    exit 0
else
    # Not enough — push back
    echo "h5w-brainstorm-check: only $distinct_classes distinct approach class(es) logged; BRAINSTORM requires ≥5 before GENUINELY-STUCK." >&2
    exit 1
fi
