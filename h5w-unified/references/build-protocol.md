---
name: build-protocol
description: >
  From-scratch app build pipeline (B1–B9): discovery, spike, architecture, design system, scaffold, implement, integrate, quality, polish, launch gate. Loaded on demand by Chief Guide §TRIAGE.
---

> **MODULE: build-protocol** — Domain protocol for the H5W unified system.
>
> **Invoked when:** Chief Guide §TRIAGE detects build-from-scratch work — phrases like "build", "create", "from scratch", "new app", "build me a". Often follows §PRODUCT P3.
>
> **Receives:** Chief Guide §0 (filled), §I calibration (classified).
> **Uses:** Chief Guide §LAW, §FMT, §SRC, §REV, §VER, §DOC — do NOT re-derive.
> **Returns:** Findings/actions in §FMT format → H5W-QUEUE.md and H5W-LOG.md.
>
> **In §AUTO mode:** the §AUTO protocol (references/auto-mode.md) governs interactive vs autonomous behavior.
> See the §AUTO protocol (references/auto-mode.md) for FULL/GUIDED routing and the activation gate.

---

## §BUILD — BUILD FROM SCRATCH PROTOCOL

When the user wants to build a new app, H5W orchestrates the full pipeline from
discovery through launch-readiness. This is not "generate some code" — this is a
structured engineering process with verification gates between every phase.

### Build Phases

| Phase | What Happens | Owner | Gate |
|-------|-------------|-------|------|
| B1. Discovery | Problem, audience, constraints, features, non-goals | Chief Guide | User approves brief |
| B2. Architecture | Stack, data model, state, API, error strategy, file org | Chief Guide | User approves architecture |
| B3. Design System | Art direction, tokens, palette, typography, components | MOD-ART | User approves design |
| B4. Scaffold | File structure, routing, state stores, build config, tooling | Chief Guide + MOD-REST | Builds clean |
| B5. Implement | Feature-by-feature vertical slices with per-feature gates | Direct coding | Per-feature gate |
| B6. Integrate | Cross-feature flows, shared state, navigation, data sync | Direct coding | Integration gate |
| B7. Quality | Full MOD-CODE audit + H5W simulation on complete codebase | MOD-CODE + §SIM | Passes audit |
| B8. Polish | Visual refinement, interaction polish, copy, a11y, perf | MOD-DESG + MOD-APP | Passes design + a11y |
| B9. Launch Gate | Full H5W simulation + MOD-APP security/perf/compat | MOD-APP + §SIM | Ready to ship |

---

### B1. Discovery — Define the Problem

**If §PRODUCT was run first:** B1 is already done. Use the Product Brief (P1),
Validation (P2), and Plan (P3) to fill §0 and proceed to B2.

**If jumping straight to §BUILD:** Run §PRODUCT P1 (Think) at minimum.
Fill §0 from the product brief.

### B1.5. Spike — Test Feasibility Before Committing

> **From GSD/Superpowers:** Don't plan extensively then discover the core
> approach doesn't work. Spike first. Validate the risky technical bets.

Before committing to architecture (B2), identify the riskiest technical
assumption and spike-test it:

```
SPIKE PROTOCOL:
  1. Identify the riskiest assumption:
     "Can we render Spine animations in React?"
     "Can we get data from this API without auth?"
     "Can we run this on the target device?"

  2. Write a Given/When/Then hypothesis:
     GIVEN: a .skel file loaded via spine-player.js
     WHEN: rendered in a React component
     THEN: animation plays at 30fps with correct bone hierarchy

  3. Build a MINIMAL test (30 min max):
     - Smallest possible code that tests the hypothesis
     - Not production code — throwaway
     - One file, no architecture

  4. Result:
     PASS → proceed to B2 with confidence
     FAIL → pivot approach, spike alternative
     PARTIAL → document limitations, adjust plan

  5. Save spike to .planning/spikes/:
     .planning/spikes/001-spine-rendering/
       README.md    — hypothesis, result, learnings
       spike.js     — the test code
```

**In §AUTO:** Run spikes automatically for any high-risk technical bet.
Log: `[SPIKE] Tested [hypothesis] — result: [pass/fail/partial]`

**Mandatory questions (ask via `AskUserQuestion` if not provided):**

```yaml
DISCOVERY BRIEF:
  Problem Statement:    # What problem does this solve? (one sentence)
  Target User:          # Who uses this? Be specific — not "everyone"
  User Goal:            # What does the user accomplish with this app?
  Stakes:               # LOW | MEDIUM | HIGH | CRITICAL
  Core Features:        # 3–5 features, priority-ordered
    1.                  # MVP — the one feature that makes the app useful
    2.                  # Second priority
    3.                  # Third priority
  Non-Goals:            # Explicitly exclude — "NOT a social network"
  Primary Device:       # Phone? Desktop? Tablet? Which one FIRST?
  Visual Direction:     # "Dark and atmospheric" / "Clean and minimal" / reference
  Data Persistence:     # Where does data live? Local? Server? Both?
  Offline Required:     # Must it work without network?
  Auth Required:        # Does it need user accounts?
  Deployment Target:    # Vercel? Play Store? App Store? Self-hosted?
```

**Gate:** Present the brief to the user. Get explicit "yes, build this."

---

### B2. Architecture — Design the System

Every decision logged in H5W-LOG.md with rationale. These are T2 decisions —
reversible but costly. Get user confirmation on the full architecture before coding.

#### B2.1 Stack Selection

| Requirement | Decision Path |
|------------|---------------|
| Web + SEO critical | → Next.js (App Router, SSR) |
| Web + SPA, modern tooling | → Vite + React 18 / Vue 3 |
| Web + zero-build simplicity | → CDN React (single file, no node_modules) |
| Web + content-heavy, minimal JS | → Astro + islands |
| Android native, stable ecosystem | → Kotlin + XML Views + Material Design 3 |
| Android native, modern declarative | → Kotlin + Jetpack Compose + Material 3 |
| iOS native | → SwiftUI (iOS 15+) or UIKit (legacy compat) |
| Cross-platform, perf-critical | → Flutter + Dart |
| Cross-platform, JS ecosystem | → React Native + Expo |
| CLI tool | → Node.js or Python |
| Simple calculator/tool | → Vanilla HTML/CSS/JS |

**Log:** `DECISION: Stack = [choice]. Rationale: [why]. Alternatives considered: [what and why not].`

#### B2.2 Data Modeling

Define every entity the app works with before writing code.

```yaml
DATA MODEL:
  Entities:
    - name: [Entity]
      fields:
        - name: id          type: string    required: true    generated: true
        - name: createdAt   type: datetime  required: true    generated: true
        - name: [field]     type: [type]    required: [bool]  validation: [rules]
      relationships:
        - type: hasMany | belongsTo | hasOne
          target: [OtherEntity]
          through: [field]

  Derived Data:
    - name: [computed value]
      from: [which entities/fields]
      formula: [how computed]
      cache: [yes/no — recompute on every render or cache?]
```

**Validation rules per field:** Define at model level, not at UI level. UI just renders the model's validation. This prevents validation-at-A-but-not-at-B bugs.

#### B2.3 State Architecture

| Question | Decision |
|----------|----------|
| What state is UI-only? (form inputs, modals, tooltips) | → Component-local state |
| What state is shared across screens? | → Global store (Zustand/Context/ViewModel) |
| What state persists across sessions? | → Persistence layer (localStorage/Room/CoreData) |
| What state comes from a server? | → Server state (React Query/SWR/Retrofit) |
| What state is derived from other state? | → Computed/derived — NEVER stored independently |

**State shape spec:**
```yaml
STATE STORES:
  - name: [storeName]
    scope: global | feature | screen
    persistence: none | localStorage | Room | API
    shape:
      [field]: [type]    # with initial value
    actions:
      [actionName]: [what it does]
    selectors:
      [selectorName]: [what it derives]
```

**Iron rule:** Derived state is NEVER stored. It is computed from source state.
Storing derived state creates synchronization bugs — the #1 state management failure.

#### B2.4 Error Strategy

Define before coding — not as afterthought.

| Error Type | Strategy |
|-----------|----------|
| Network failure | Retry with backoff → fallback UI → user notification |
| Validation failure | Inline field errors → prevent submission → preserve input |
| Unexpected crash | Error boundary (React) / try-catch (imperative) → crash report → recovery UI |
| Data corruption | Validate on read → repair or discard → notify user |
| Permission denied | Explain why → offer alternative → never silent fail |
| Empty state | Explicit empty-state UI per screen — NEVER blank |

**Per screen, define:** What happens when the primary data source fails?
This prevents the most common build gap: screens that work on success but
crash/blank on failure.

#### B2.5 API & Data Contract (if backend-connected)

```yaml
API CONTRACTS:
  - endpoint: [path]
    method: [GET/POST/PUT/DELETE]
    request: [shape]
    response: [shape]
    error: [error shape]
    auth: [required/optional/none]
    cache: [strategy]
    offline: [behavior when offline]
```

If building client-only: define the persistence contract instead —
what goes to localStorage/Room/CoreData, what format, what migration
path when schema changes.

#### B2.6 Component Architecture

| Level | What | Naming | State |
|-------|------|--------|-------|
| Page/Screen | Route entry point | `[Name]Page` / `[Name]Screen` / `[Name]Fragment` | Owns data fetching, passes to children |
| Container | Feature logic wrapper | `[Name]Container` | Owns feature state, passes UI props |
| Component | Reusable UI element | `[Name]` (no suffix) | Stateless or UI-only state |
| Primitive | Design system atom | `Button`, `Input`, `Card` | Stateless, style-only props |

**Prop flow rule:** Data flows down. Events flow up. No prop drilling beyond
2 levels — at level 3, use context/store. This prevents prop drilling debt
that compounds as the app grows.

#### B2.7 Testing Strategy

| Layer | What to Test | Tool | When |
|-------|-------------|------|------|
| Unit | Business logic, utils, formatters | Jest/JUnit | Per function |
| Component | Render output, interaction | RTL/Compose Test | Per component |
| Integration | Multi-component flows | RTL/Espresso | Per feature |
| E2E | Full user journeys | Playwright/Maestro | Pre-launch |

For MVPs: minimum = unit tests on business logic + H5W simulation (no E2E).

**Architecture document:**
```yaml
ARCHITECTURE DECISION RECORD:
  Stack:        [from B2.1]
  Data Model:   [from B2.2]
  State:        [from B2.3]
  Errors:       [from B2.4]
  API/Persist:  [from B2.5]
  Components:   [from B2.6]
  Testing:      [from B2.7]
```

**Gate:** Present architecture to user. Confirm before coding.

---

### B3. Design System (→ MOD-ART)

Load `references/mod-art-direction.md`. Execute: §BRIEF → §BUILD → §CHECK.

**Required outputs from MOD-ART:**

| Deliverable | What It Contains |
|-------------|------------------|
| Color tokens | Background, surface (2-3 levels), text (3 levels), accent, semantic (error, success, warning, info), dark mode variants |
| Typography scale | Font families (display + body + mono), size scale (6-8 steps), weight scale, line heights, letter spacing |
| Spacing scale | 4px base unit (or 8px), scale: 4/8/12/16/24/32/48/64 |
| Component library | Button (primary/secondary/ghost/destructive × default/hover/active/disabled), Input, Card, Modal, Navigation, List item, Empty state, Loading skeleton |
| Motion vocabulary | Duration scale (instant/fast/normal/slow), easing curves, entry/exit patterns |
| Iconography | Icon style (outlined/filled/duotone), size scale, source library |

**Gate:** User approves the design system before implementation.

---

### B4. Scaffold — Create the Structure

Based on B2 architecture decisions, create the file structure.

**Web / React scaffold:**
```
src/
├── app/                    # Routes/pages
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home
│   └── [feature]/
│       └── page.tsx
├── components/
│   ├── ui/                 # Design system primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── Input.tsx
│   └── [feature]/          # Feature-specific components
├── lib/
│   ├── store.ts            # State management
│   ├── types.ts            # Data model types
│   ├── utils.ts            # Pure utility functions
│   └── constants.ts        # App constants
├── hooks/                  # Custom hooks
└── styles/
    ├── tokens.css          # Design tokens as CSS vars
    └── globals.css         # Global styles
```

**Android / Kotlin scaffold:**
```
app/src/main/
├── java/.../
│   ├── data/
│   │   ├── model/          # Data classes
│   │   ├── repository/     # Data access
│   │   └── local/          # Room DAOs, SharedPrefs
│   ├── ui/
│   │   ├── theme/          # Colors, Typography, Theme
│   │   ├── components/     # Reusable composables / custom views
│   │   └── [feature]/
│   │       ├── [Feature]Fragment.kt  (or [Feature]Screen.kt)
│   │       └── [Feature]ViewModel.kt
│   └── util/               # Extensions, formatters
├── res/
│   ├── values/             # colors.xml, strings.xml, dimens.xml, themes.xml
│   ├── values-night/       # Dark theme overrides
│   ├── layout/             # XML layouts (if not Compose)
│   └── navigation/         # nav_graph.xml
└── AndroidManifest.xml
```

**Scaffold includes:**
1. File structure created
2. Build config (package.json / build.gradle) with dependencies
3. Design tokens applied (from B3)
4. Navigation/routing skeleton
5. State store skeleton (empty stores with correct shape)
6. Empty-state and loading-state components
7. Dev environment configured:
   - Linting: ESLint + Prettier / ktlint + detekt (match §0 conventions)
   - Formatting: auto-format on save configured
   - Git: `.gitignore`, initial commit, branch strategy
   - TypeScript: `strict: true` if TS project (no `any` escapes)
   - Editor config: `.editorconfig` for consistent whitespace
8. **Delivery infrastructure configured (§DELIVER):**
   - CI/CD pipeline (GitHub Actions / equivalent)
   - Build artifact generation (APK / IPA / deploy script)
   - Signing config (if applicable)
   - Deployment target configured (Vercel / Play Store / etc.)
   - README with build + run + deploy instructions

**Gate:** `npm run build` / `./gradlew build` succeeds. Linting passes. App launches to blank home screen.

---

### B5. Implement — Per-Feature Vertical Slices

Build ONE feature at a time. Complete it end-to-end before starting the next.

**Feature implementation order:**
1. Core data model + persistence (the foundation everything else depends on)
2. MVP feature (Feature #1 from discovery — the reason the app exists)
3. Second feature (builds on core data)
4. Third feature
5. ...repeat until all features complete

**Per-feature implementation sequence:**
```
1. DATA:  Define types/models for this feature
2. STATE: Create store/ViewModel for this feature's state
3. UI:    Build the screen — start with the happy path
4. LOGIC: Wire data flow: user action → state mutation → re-render
5. ERROR: Add error handling per B2.4 strategy
6. EMPTY: Add empty-state UI
7. LOAD:  Add loading-state UI
8. GATE:  Run per-feature quality gate
```

**Per-feature gate (mandatory before next feature):**
```
[ ] Happy path works: user can accomplish the feature's goal
[ ] Error path works: every failure scenario from B2.4 is handled
[ ] Empty state: screen looks correct with no data
[ ] Loading state: screen shows feedback during async operations
[ ] MOD-CODE §D5 (logic): no logic errors in new code
[ ] MOD-CODE §D7 (errors): error handling present and correct
[ ] H5W Stage 1 (arrival): first render is correct for P1 (first-time)
[ ] H5W Stage 2 (interaction): goal achievable for P2 (power user)
[ ] H5W Stage 3 (disruption): P3 (hostile-env) can recover from failure
[ ] Types: all data flows are typed — no `any`, no implicit coercion
[ ] No T2+ changes to already-gated features
[ ] Commit: atomic commit for this feature — "feat: [feature name]"
```

---

### B6. Integrate — Cross-Feature Flows

After all features are built individually, wire them together:

```
[ ] Navigation: every screen reachable, back-nav works, deep links resolve
[ ] Shared state: features that share data are synchronized
[ ] Cross-feature flows: multi-step journeys work end-to-end
[ ] Data consistency: creating/editing/deleting in one feature reflects in others
[ ] Loading orchestration: no waterfall loads — parallel where possible
[ ] Error propagation: error in shared data surfaces in all consuming features
```

**Gate:** All cross-feature workflows from §0 work end-to-end.

---

### B7. Quality — Full System Audit

Load MOD-CODE. Run all 8 dimensions on the complete codebase:

```
[ ] MOD-CODE §D1 Format & Conventions: naming consistent, imports ordered
[ ] MOD-CODE §D2 Health & Hygiene: no dead code, no duplication, no dependency issues
[ ] MOD-CODE §D3 Optimization: no render waste, no unnecessary re-computations
[ ] MOD-CODE §D4 Structure & Architecture: SRP, clean module boundaries
[ ] MOD-CODE §D5 Logic & Correctness: every formula correct, types sound
[ ] MOD-CODE §D6 State & Data: single source of truth, no derived state stored
[ ] MOD-CODE §D7 Error Handling: every failure path covered
[ ] MOD-CODE §D8 Async & Concurrency: no races, proper cleanup, cancellation
```

Then run full H5W simulation:
```
[ ] All personas (P1–P5) walk through all entry points
[ ] All states from state map explored
[ ] All 4 stages × 6 lenses applied
[ ] All findings entered in H5W-QUEUE.md
[ ] All T0/T1 findings fixed
[ ] All T2 findings fixed with rationale
[ ] T3 findings surfaced to user
```

---

### B8. Polish — Refinement Pass

Load MOD-DESG. Run quick visual audit:

```
[ ] Token consistency: all colors from palette, no hardcoded values
[ ] Typography consistency: all text uses type scale
[ ] Spacing consistency: all spacing from spacing scale
[ ] Component consistency: all instances of same component look identical
[ ] Dark mode: if applicable, every screen verified in dark mode
[ ] Empty states: every screen has a designed empty state (not just blank)
[ ] Loading states: every async screen has skeleton/spinner
[ ] Error states: every error has a designed error UI
[ ] Micro-interactions: button feedback, form validation, transitions
[ ] Responsive: primary device + 2 others verified
```

Load MOD-APP for targeted checks:
```
[ ] MOD-APP §G Accessibility: keyboard nav, contrast ratios, screen reader labels
[ ] MOD-APP §D Performance: load time within budget, no memory leaks, no jank
[ ] MOD-APP §F4 Copy: all labels clear, all error messages helpful
```

---

### B9. Launch Gate — Ship Readiness

```
[ ] H5W simulation: 0 critical, 0 high findings remaining
[ ] MOD-APP §C (security): no critical security findings
[ ] MOD-APP §D (performance): within §0 budget
[ ] MOD-APP §G (accessibility): WCAG 2.1 AA minimum
[ ] MOD-APP §H (compatibility): primary device + 2 others
[ ] All T3 decisions resolved with user
[ ] H5W-QUEUE.md: empty or only low/enhancement remaining
[ ] Documentation: README with setup, architecture, deployment
[ ] Deployment config: verified on target platform
[ ] Error tracking: crash reporting configured (if applicable)
```

**The build is complete when:** A new developer could clone the repo, read the
README, understand the architecture, and add a new feature without asking the
builder. The code explains itself. The design is consistent. The errors are
handled. The states are covered.

### Build Reversibility

| Phase | Tier | Rationale |
|-------|------|-----------|
| B1–B3 (Discovery, Architecture, Design) | T0 | Planning documents only |
| B4 (Scaffold) | T1 | New files only — trivially reversible |
| B5 (Implement features) | T1 per feature | New code — git revert per feature |
| B6 (Integration) | T2 | Cross-feature wiring harder to revert cleanly |
| B7–B8 (Quality, Polish) | T1 | Fixes are small and surgical |
| B9 (Launch config) | T2 | Deployment config affects production |

---

