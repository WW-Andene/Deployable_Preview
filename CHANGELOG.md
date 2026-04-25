# Changelog

## [Unreleased]

### Security
- **F-C001** Bearer-token auth gate on `/api/*` for non-localhost callers
  (auto-generated `apiSecret`; localhost remains unauthenticated).
- **F-C002** `WEBHOOK_SECRET` is now mandatory; server returns **403** if unset.
- **F-C004** `/api/live/*` tokens are now scoped to a specific
  (owner, repo, slug) triple — leaked tokens no longer replay on other previews.
- **F-C007** GitHub token no longer appears in `git clone` argv (uses
  `credential.helper=store --file=` against a 0600 temp file).
- **F-C011** SSRF blocklist extended to IPv6 ULA (`fc00::/7`) and link-local
  (`fe80::/10`).
- **F-C012** DNS-rebinding guard via custom `lookup` callback on
  `http(s).request` — TOCTOU-safe.
- **F-C015** Secret mask reduced to last-4-only (was `4+last4`, leaking 8 chars).
- **F-C018** Cap of 200 stored secrets per instance.
- **F-C026** Stack traces no longer leaked in error responses.
- **F-C028** Tunnel URL no longer printed in plain text — SHA-prefix only.

### Accessibility
- **G1-001** `iconBtn(label, opts, icon)` helper auto-emits `aria-label`.
- **G1-002** Status dots get `role="img"` + `aria-label="Status: …"`.
- **G1-003 / G1-004 / G3-002** Modals get `role=dialog`, `aria-modal=true`,
  focus trap, focus restoration on close.
- **G1-005** `<label for=>` + `aria-describedby` on the setup token input.
- **G1-006** Command palette is a proper `combobox`/`listbox` with
  `role=option` + `aria-selected`.
- **G1-007** Toasts gain `role=alert` (errors) / `role=status`, manual
  dismiss button, error toasts no longer auto-dismiss.
- **G3-001** Bulk-select checkboxes are keyboard-toggleable (Space/Enter).

### Reliability
- **F-A006** `getSessionPage` recursion depth cap (was infinite if browser
  crashed mid-session).
- **F-K003** APK workflow upsert is content-aware idempotent — no duplicate
  no-op commits to user's main branch.
- **F-M024** Windows server-mode now uses `cmd.exe /c` instead of failing
  on missing `sh`.

### Operations
- **F-M015** Built-in `.env` / `.env.local` loader (no dotenv dependency).
- **F-J007** `apiSecret` redacted from `/api/config/export` along with
  `token`/`secrets`.
- **F-O005** Engines bumped to `node >= 20.0.0`.
- New `SETUP.md`, `.env.example`, this changelog.

## [1.1.0] — earlier
- Restructure: 4 god-files split into focused modules behind re-export
  shims (build, dv/session, fetch, enrichments).
- Inline SVG icon set replaces 14 emoji glyphs; tabular-nums on numbers.
- Design-token sweep (70+ CSS custom properties; zero stray rgba).
- Auto-poll feature removed entirely.
- Web-fetch limits raised: 1 GB body / 15-min default timeout / 100 M chars.
