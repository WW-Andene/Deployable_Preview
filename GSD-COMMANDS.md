# GSD Commands Reference

A grouped index of every `/gsd-*` slash command, captured from the
get-shit-done-cc v1.38.5 install.

## Onboarding / project setup

- `gsd-new-project` — initialize a new project with PROJECT.md
- `gsd-new-milestone` — start a new milestone cycle
- `gsd-new-workspace` / `gsd-list-workspaces` / `gsd-remove-workspace` — isolated worktree-based workspaces
- `gsd-ingest-docs` — bootstrap `.planning/` from existing ADRs / PRDs / SPECs / DOCs
- `gsd-from-gsd2` — migrate a GSD-2 project back to GSD-1
- `gsd-map-codebase` — parallel mapper agents to produce `.planning/codebase/` docs
- `gsd-scan` — lighter-weight codebase assessment
- `gsd-graphify` — build/query a knowledge graph in `.planning/graphs/`
- `gsd-intel` — query / inspect / refresh `.planning/intel/` files
- `gsd-profile-user` — generate developer behavioral profile

## Phase lifecycle (the core loop)

- `gsd-spec-phase` — Socratic spec refinement, lock falsifiable requirements
- `gsd-discuss-phase` — adaptive questioning before planning (`--auto`, `--chain`, `--power`)
- `gsd-research-phase` — research how to implement (usually folded into plan)
- `gsd-list-phase-assumptions` — surface Claude's assumptions before planning
- `gsd-plan-phase` — create detailed PLAN.md with verification loop
- `gsd-ai-integration-phase` — AI-SPEC.md for AI-system phases
- `gsd-ui-phase` — UI-SPEC.md for frontend phases
- `gsd-execute-phase` — execute all plans in a phase with wave-based parallelism
- `gsd-add-phase` / `gsd-insert-phase` / `gsd-remove-phase` — roadmap manipulation
- `gsd-analyze-dependencies` — suggest "Depends on" entries
- `gsd-pause-work` / `gsd-resume-work` — handoff + restoration
- `gsd-thread` — persistent context threads across sessions

## Quick paths (no full lifecycle)

- `gsd-fast` — trivial inline task, no agents, no planning
- `gsd-quick` — atomic commits + state, skip optional agents
- `gsd-do` — route freeform text to the right command
- `gsd-next` — auto-advance to next logical step
- `gsd-autonomous` — run all remaining phases unattended

## Audit / review / verification

- `gsd-code-review` + `gsd-code-review-fix` — review changed source, then auto-fix
- `gsd-review` — cross-AI peer review of plans
- `gsd-plan-review-convergence` — replan until reviewers stop flagging HIGH
- `gsd-eval-review` — evaluation coverage on AI phases
- `gsd-ui-review` — 6-pillar visual audit retroactively
- `gsd-secure-phase` — verify threat mitigations
- `gsd-validate-phase` — fill Nyquist validation gaps retroactively
- `gsd-audit-milestone` — audit completion against original intent
- `gsd-audit-uat` — cross-phase UAT audit
- `gsd-audit-fix` — autonomous audit→fix→test→commit pipeline
- `gsd-verify-work` — conversational UAT
- `gsd-add-tests` — generate tests from UAT criteria
- `gsd-forensics` — post-mortem on failed workflows

## Exploration / ideation

- `gsd-explore` — Socratic ideation + idea routing
- `gsd-spike` + `gsd-spike-wrap-up` — experiential spikes, package as skill
- `gsd-sketch` + `gsd-sketch-wrap-up` — throwaway HTML mockups, package as skill
- `gsd-plant-seed` — capture forward-looking ideas with trigger conditions
- `gsd-note` — zero-friction idea capture
- `gsd-add-todo` / `gsd-check-todos` — todos from conversation
- `gsd-add-backlog` / `gsd-review-backlog` — 999.x parking lot
- `gsd-inbox` — triage GitHub issues / PRs

## Status / progress

- `gsd-progress` — show context, route to next action (`--forensic` for integrity audit)
- `gsd-stats` — phases, plans, requirements, git metrics, timeline
- `gsd-health` — diagnose `.planning/` directory health
- `gsd-session-report` — token usage + work summary
- `gsd-extract_learnings` — decisions, lessons, patterns from phase artifacts
- `gsd-manager` — interactive command center for multi-phase work
- `gsd-workstreams` — parallel workstream management

## Shipping / release

- `gsd-pr-branch` — clean PR branch filtering out `.planning/` commits
- `gsd-ship` — PR + review + prep for merge
- `gsd-undo` — git revert via phase manifest with dependency checks
- `gsd-cleanup` — archive completed milestone phase dirs
- `gsd-complete-milestone` — archive milestone, prep next version
- `gsd-milestone-summary` — onboarding/review summary
- `gsd-plan-milestone-gaps` — phases to close milestone-audit gaps
- `gsd-docs-update` — verified docs

## System / config

- `gsd-help` — usage guide
- `gsd-update` + `gsd-reapply-patches` — keep GSD current
- `gsd-settings` / `gsd-settings-advanced` / `gsd-settings-integrations` — workflow toggles, runtime knobs, third-party API keys
- `gsd-set-profile` — switch model profile (quality/balanced/budget/inherit)
- `gsd-sync-skills` — sync managed skills across runtime roots
- `gsd-import` — ingest external plans with conflict detection
- `gsd-ultraplan-phase` — offload planning to cloud (BETA, Claude Code only)
- `gsd-debug` — systematic debugging with persistent state
- `gsd-join-discord` — community link
