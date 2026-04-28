# H5W-BUILD — DeployView App Audit & Fix Queue

Session: §AUTO-UNCHAINED + §BRAINSTORM + §BUILD-LOOP
Goal: Audit every code and UI issue, design incoherence and inconsistency — fix them all.

## Build Tasks

| ID | Phase | Description | Status |
|----|-------|-------------|--------|
| B-001 | CSS Token Fixes | Fix 5× `font-family: monospace` → `var(--font-mono)`; remove redundant `@import`; remove empty `@media` dead block | TODO |
| B-002 | Dead CSS Removal | Remove first `.empty-state` definition (overridden by D3 at line 2104); remove dead `.empty-logo/.empty-title/.empty-subtitle/.empty-cta/.dashboard-page` classes; remove dead `.color-stat-ok/accent/err` rules | TODO |
| B-003 | Dashboard Class Mismatch | `setup-logo` class used in dashboard empty-state (dashboard.js:69) — wrong class context; fix to use design-system neutral | TODO |
| B-004 | `color-warn` Token Clarity | `.color-warn { color: var(--accent) }` is identical to `.color-accent` — add a CSS comment making the semantic intent explicit, and give warn a distinct tint (hue 55 orange, more saturated than accent at hue 75) | TODO |
| B-005 | Audit Report | Write AUDIT-REPORT.md: full categorised findings list with file+line citations, severity, and fix status | TODO |

## Completed
(none yet)
