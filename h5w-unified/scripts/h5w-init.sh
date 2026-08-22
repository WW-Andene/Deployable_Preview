#!/bin/bash
# ═══════════════════════════════════════════════════
# H5W Init — Initialize H5W working documents in a project
# ═══════════════════════════════════════════════════
#
# Usage: ./h5w-init.sh [project-dir]
# Default: current directory
#
# Creates working documents from templates. Safe to re-run —
# will not overwrite existing files.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE_DIR="$SKILL_DIR/templates"
PROJECT_DIR="${1:-.}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}H5W Init — Setting up working documents${NC}"
echo "  Project: $(cd "$PROJECT_DIR" && pwd)"
echo "  Templates: $TEMPLATE_DIR"
echo ""

if [ ! -d "$TEMPLATE_DIR" ]; then
    echo -e "${RED}Error: Template directory not found at $TEMPLATE_DIR${NC}"
    echo "  Is the H5W skill installed correctly?"
    exit 1
fi

copy_template() {
    local template="$1"
    local dest="$2"
    local name=$(basename "$dest")

    if [ -f "$dest" ]; then
        echo -e "  ${YELLOW}SKIP${NC} $name (already exists)"
    else
        cp "$template" "$dest"
        echo -e "  ${GREEN}CREATE${NC} $name"
    fi
}

# Core working documents
copy_template "$TEMPLATE_DIR/H5W-LOG.md" "$PROJECT_DIR/H5W-LOG.md"
copy_template "$TEMPLATE_DIR/H5W-QUEUE.md" "$PROJECT_DIR/H5W-QUEUE.md"
copy_template "$TEMPLATE_DIR/H5W-ASSUMPTIONS.md" "$PROJECT_DIR/H5W-ASSUMPTIONS.md"
copy_template "$TEMPLATE_DIR/COMPACT-RESUME.md" "$PROJECT_DIR/COMPACT-RESUME.md"

# CLAUDE.md — project-level H5W configuration
mkdir -p "$PROJECT_DIR/.claude"
if [ -f "$PROJECT_DIR/CLAUDE.md" ]; then
    echo -e "  ${YELLOW}SKIP${NC} CLAUDE.md (already exists — append manually if needed)"
elif [ -f "$PROJECT_DIR/.claude/CLAUDE.md" ]; then
    echo -e "  ${YELLOW}SKIP${NC} .claude/CLAUDE.md (already exists)"
else
    copy_template "$TEMPLATE_DIR/CLAUDE.md" "$PROJECT_DIR/CLAUDE.md"
fi

echo ""

# Git policy for §AUTO mode
echo -e "${GREEN}Git policy for §AUTO mode${NC}"
echo "  branch — create h5w/auto-[date] branch (default; safest for team repos)"
echo "  main   — work directly on current branch (single-author / preview-deploy projects)"
echo "  none   — no git commands; review via diffs (sandboxes, scratch projects)"
read -p "Set git policy? [branch/main/none, blank=skip] " -r
if [[ "$REPLY" =~ ^(branch|main|none)$ ]]; then
    mkdir -p "$PROJECT_DIR/.h5w"
    echo "$REPLY" > "$PROJECT_DIR/.h5w/git-policy"
    echo -e "  ${GREEN}WROTE${NC} .h5w/git-policy = $REPLY"
fi

echo ""

# Optional: product brief
read -p "Create PRODUCT-BRIEF.md? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    copy_template "$TEMPLATE_DIR/PRODUCT-BRIEF.md" "$PROJECT_DIR/PRODUCT-BRIEF.md"
fi

# Optional: CI/CD templates
read -p "Set up CI/CD templates? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    mkdir -p "$PROJECT_DIR/.github/workflows"

    # Detect project type
    if [ -f "$PROJECT_DIR/build.gradle" ] || [ -f "$PROJECT_DIR/build.gradle.kts" ]; then
        copy_template "$TEMPLATE_DIR/ci/android-build.yml" "$PROJECT_DIR/.github/workflows/build.yml"
        echo -e "  ${GREEN}Detected:${NC} Android project"
    elif [ -f "$PROJECT_DIR/package.json" ]; then
        copy_template "$TEMPLATE_DIR/ci/web-deploy.yml" "$PROJECT_DIR/.github/workflows/build.yml"
        echo -e "  ${GREEN}Detected:${NC} Web/Node project"
    else
        echo -e "  ${YELLOW}Could not detect project type${NC}"
        echo "  Templates available in: $TEMPLATE_DIR/ci/"
    fi
fi

echo ""
echo -e "${GREEN}Done.${NC} Working documents ready."
echo ""
echo "Add to .gitignore:"
echo "  COMPACT-RESUME.md"
echo "  h5w-autoloop.log"
echo ""
echo "Keep in git (useful for continuity):"
echo "  H5W-LOG.md"
echo "  H5W-QUEUE.md"
echo "  H5W-ASSUMPTIONS.md"
