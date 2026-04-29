# H5W-LOG — DeployView Audit Session

Mode: §AUTO-UNCHAINED + §BRAINSTORM + §BUILD-LOOP
Date: 2026-04-28

---

## Audit Findings

### CSS Issues

| # | File | Line | Finding | Severity |
|---|------|------|---------|----------|
| C-001 | style.css | 45 | Redundant `@import` for Space Grotesk — already loaded via `<link>` in index.html; causes extra render-blocking network request inside stylesheet | Medium |
| C-002 | style.css | 262-264 | Empty `@media (prefers-reduced-motion: no-preference)` block with misleading comment — dead code | Low |
| C-003 | style.css | 1689 | `.error-text` uses `font-family: monospace` instead of `var(--font-mono)` — breaks design-token contract | Medium |
| C-004 | style.css | 1718 | `.label-hint-12` uses `font-family: monospace` instead of `var(--font-mono)` | Medium |
| C-005 | style.css | 2399 | `.preview-empty-text` uses `font-family: monospace` instead of `var(--font-mono)` | Medium |
| C-006 | style.css | 2407 | `.select-inline` uses `font-family: monospace` instead of `var(--font-mono)` | Medium |
| C-007 | style.css | 2506 | `.frame-branch-status` uses `font-family: monospace` instead of `var(--font-mono)` | Medium |
| C-008 | style.css | 1564 | First `.empty-state` definition (`padding: 100px 20px; text-align: center`) is dead — overridden in full by D3 component definition at line 2104 | Low |
| C-009 | style.css | 1568-1600 | `.empty-logo`, `.empty-title`, `.empty-subtitle`, `.empty-cta` — dead CSS (zero JS references found) | Low |
| C-010 | style.css | 1645-1647 | `.color-stat-ok`, `.color-stat-accent`, `.color-stat-err` — dead CSS (dashboard uses `.color-ok/accent/err` directly) | Low |
| C-011 | style.css | 1559-1563 | `.dashboard-page` class defined but `dashboard.js` uses `.container` — dead | Low |
| C-012 | style.css | 3087 | `.color-warn { color: var(--accent) }` identical output to `.color-accent` — no semantic separation between "accent" and "warning" tones | Low |

### UI / Design Issues

| # | File | Line | Finding | Severity |
|---|------|------|---------|----------|
| U-001 | dashboard.js | 69 | Empty-dashboard state uses `setup-logo` class — class from setup page leaks into dashboard context; mixes component boundaries | Medium |
| U-002 | dashboard.js | 424 | Bundle-size growth indicator uses `color-warn` (= amber accent) which is visually indistinct from any other accented element | Low |
| U-003 | dashboard.js | 88 | Search bar shown only when `S.repos.length > 2`; with 2 repos + many branches, filter is still useful | Low |
| U-004 | modals/edit.js | 73 | `mode-chip-row` container for language/mode chip rows has no `flex-wrap` — chips can overflow on narrow modal widths | Low |

### Code Issues

| # | File | Line | Finding | Severity |
|---|------|------|---------|----------|
| K-001 | app.js | 345-365 | `installErrorCountSync` fires N×M individual API requests (one per repo×branch) every 15s — no batch endpoint | Medium |
| K-002 | dashboard.js | 504-517 | Action menu `_item` handler calls `DV.render()` after `opts.run()`, but `opts.run()` (e.g. `DV.openShare`) may already call `DV.render()` internally — double render on those paths | Low |
| K-003 | index.html | 17 | Both `Space Grotesk` and `JetBrains Mono` loaded via HTML `<link>`, but style.css also `@import`s Space Grotesk — double-loading Space Grotesk | Medium |

---

## Session Actions

| Time | Action | Tag |
|------|--------|-----|
| Start | Audit scan: read all JS views, full CSS, server entry, key API routes | [AUDIT] |
| B-001 | Fix CSS design-token inconsistencies | TODO |
| B-002 | Remove dead CSS | TODO |
| B-003 | Fix dashboard class mismatch | TODO |
| B-004 | `color-warn` token clarity | TODO |
| B-005 | Write AUDIT-REPORT.md | TODO |
