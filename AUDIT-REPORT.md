# DeployView — Code & UI Audit Report

**Session:** §AUTO-UNCHAINED + §BRAINSTORM + §BUILD-LOOP  
**Date:** 2026-04-28  
**Scope:** `public/css/style.css`, `public/js/views/`, `public/index.html`, `server/`  
**Auditor:** H5W v1.4.0 autonomous audit

---

## Summary

| Category | Found | Fixed | Open |
|----------|-------|-------|------|
| CSS — design-token violations | 5 | 5 | 0 |
| CSS — dead/redundant rules | 10 | 10 | 0 |
| CSS — semantic token gaps | 1 | 1 | 0 |
| UI — component boundary leaks | 1 | 1 | 0 |
| UI — minor UX issues | 3 | 0 | 3 |
| Code — performance | 2 | 0 | 2 |
| Code — minor bugs | 1 | 0 | 1 |

---

## Fixed Findings

### CSS — Design Token Violations

| ID | File | Line (original) | Finding | Fix | Commit |
|----|------|-----------------|---------|-----|--------|
| C-003 | `public/css/style.css` | 1689 | `.error-text` used `font-family: monospace` instead of `var(--font-mono)` — breaks design-token contract | Replaced with `var(--font-mono)` | `1b5576f` |
| C-004 | `public/css/style.css` | 1718 | `.label-hint-12` used `font-family: monospace` | Replaced with `var(--font-mono)` | `1b5576f` |
| C-005 | `public/css/style.css` | 2399 | `.preview-empty-text` used `font-family: monospace` | Replaced with `var(--font-mono)` | `1b5576f` |
| C-006 | `public/css/style.css` | 2407 | `.select-inline` used `font-family: monospace` | Replaced with `var(--font-mono)` | `1b5576f` |
| C-007 | `public/css/style.css` | 2506 | `.frame-branch-status` used `font-family: monospace` | Replaced with `var(--font-mono)` | `1b5576f` |

### CSS — Dead / Redundant Rules

| ID | File | Line (original) | Finding | Fix | Commit |
|----|------|-----------------|---------|-----|--------|
| C-001 | `public/css/style.css` | 45 | Redundant `@import url('…Space+Grotesk…')` — font already loaded via `<link>` in `index.html`; extra render-blocking request inside stylesheet | Removed `@import`; left explanatory comment | `1b5576f` |
| C-002 | `public/css/style.css` | 262–264 | Empty `@media (prefers-reduced-motion: no-preference)` block with misleading comment — dead code | Removed block | `1b5576f` |
| C-008 | `public/css/style.css` | 1563 | First `.empty-state { text-align:center; padding:100px 20px }` — overridden entirely by D3 component definition at line 2103 | Removed | `82085fe` |
| C-009 | `public/css/style.css` | 1567–1593 | `.empty-logo`, `.empty-title`, `.empty-subtitle`, `.empty-cta` — zero JS references; predated D3 empty-state component | Removed all four rules | `82085fe` |
| C-010 | `public/css/style.css` | 1644–1646 | `.color-stat-ok`, `.color-stat-accent`, `.color-stat-err` — zero JS references (dashboard uses `.color-ok/accent/err` directly) | Removed | `82085fe` |
| C-011 | `public/css/style.css` | 1558 | `.dashboard-page` defined but `dashboard.js` uses `.container` — dead | Removed | `82085fe` |

### CSS — Semantic Token Gaps

| ID | File | Line (original) | Finding | Fix | Commit |
|----|------|-----------------|---------|-----|--------|
| C-012 | `public/css/style.css` | 3087 | `.color-warn { color: var(--accent) }` identical output to `.color-accent` — no perceptual difference between "accent" and "warning" states | Added `--hue-warn: 55`, `--warn: oklch(65% 0.155 55)` token (orange, visually distinct from amber accent at hue 75); `.color-warn` now uses `var(--warn)`; added semantic comment | `82085fe` |

### UI — Component Boundary Leak

| ID | File | Line (original) | Finding | Fix | Commit |
|----|------|-----------------|---------|-----|--------|
| U-001 | `public/js/views/dashboard.js` | 69 | Dashboard empty-state used `setup-logo` CSS class — class belongs to the setup page, not a shared design-system token | Renamed `.setup-logo` → `.brand-monogram` in CSS + `setup.js` + `dashboard.js` | `82085fe` |

---

## Open Findings

These findings were catalogued but not fixed in this session. Recommended for follow-up.

### UI — Minor UX

| ID | File | Line | Finding | Severity | Recommended Fix |
|----|------|------|---------|----------|-----------------|
| U-002 | `public/js/views/dashboard.js` | 424 | Bundle-size growth indicator uses `.color-warn` (now orange) — previously was visually indistinct from any accented element. Token fix (C-012) improves this incidentally, but the indicator itself has no tooltip or threshold context | Low | Add `title` attribute with growth delta and threshold info |
| U-003 | `public/js/views/dashboard.js` | 88 | Search bar shown only when `S.repos.length > 2`; with 2 repos + many branches the filter is still useful | Low | Change threshold to `> 1` or always show when any repo has branches |
| U-004 | `public/js/views/modals/edit.js` | 73 | `mode-chip-row` container has no `flex-wrap` — chips overflow on narrow modal widths | Low | Add `flex-wrap: wrap` to `.mode-chip-row` in CSS |

### Code — Performance

| ID | File | Lines | Finding | Severity | Recommended Fix |
|----|------|-------|---------|----------|-----------------|
| K-001 | `public/js/app.js` | 345–365 | `installErrorCountSync` fires N×M individual API requests (one per repo×branch) every 15 s — no batch endpoint | Medium | Add a `GET /api/error-counts?repos=…` batch endpoint; or debounce + aggregate client-side before firing |
| K-003 | `public/index.html` | 17 | Both `Space Grotesk` and `JetBrains Mono` loaded via `<link>`, but `style.css` previously also `@import`ed Space Grotesk — double-loading. `@import` now removed (C-001), but the HTML `<link>` order should be audited to ensure `display=swap` is present on both | Medium | Confirmed `display=swap` present on both `<link>` tags — no further action needed |

### Code — Minor Bugs

| ID | File | Lines | Finding | Severity | Recommended Fix |
|----|------|-------|---------|----------|-----------------|
| K-002 | `public/js/views/dashboard.js` | 504–517 | Action-menu `_item` handler calls `DV.render()` after `opts.run()`, but some `opts.run()` implementations (e.g. `DV.openShare`) already call `DV.render()` internally — causes double render on those code paths | Low | Guard with a `let rendered = false` flag inside `opts.run` contract, or audit each `opts.run` implementation and remove the trailing `DV.render()` call where redundant |

---

## Design System Health

### Token Coverage (post-fix)

| Token family | Status |
|---|---|
| Typography — `--font-mono` / `--font-sans` | ✓ All uses now go through tokens |
| Colour — accent, err, ok, run, stop | ✓ All tokenised |
| Colour — warn | ✓ Fixed — now `--warn` (hue 55 orange), not reusing `--accent` |
| Spacing — `--sp` multiples | ✓ Consistent |
| Radii — `--r-*` | ✓ Consistent |

### Dead Code Removed

- 6 dead CSS rule blocks removed (41 lines net)
- 1 redundant `@import` removed
- 1 empty `@media` block removed
- 1 component-boundary class rename (`setup-logo` → `brand-monogram`)

---

## Commits in This Session

| Commit | Description |
|--------|-------------|
| `c7dc6a9` | Fix h5w-autoloop.sh AUTO_RULES heredoc quote bug |
| `1b5576f` | B-001: monospace→var(--font-mono), remove @import and empty @media |
| `98de2fa` | Snapshot H5W audit trail (iter 1–2 findings + build queue) |
| `82085fe` | B-002–B-004: dead CSS removal, brand-monogram rename, --warn token |
