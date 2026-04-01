---
name: app-restructuring
description: >
  Live, incremental restructuring of any frontend/fullstack application regardless of stack.
  Activated on-demand when the user explicitly asks for restructuring. Covers: codebase
  archaeology, architecture mapping, structural diagnosis, dependency analysis, module
  boundary redefinition, file/folder reorganization, state management migration, route
  restructuring, and shared code consolidation — all executed incrementally with verification
  gates between every phase. Works with app-audit and scope-context companion skills.
  Trigger on: "restructure my app", "reorganize my codebase", "fix my app structure",
  "my app is a mess restructure it", "move things around properly", "clean up the architecture",
  "restructure the file structure", "reorganize modules", "untangle my code", "fix the
  folder structure", "decouple my features", "break up this god component", "my app grew
  messy fix the structure", "restructure", "the architecture doesn't make sense", "nothing
  is where it should be", "split this into proper modules", "the codebase is incoherent",
  "make the structure logical", "this file does too much break it up".
---

# App Restructuring — Universal Live Execution Skill

---

## TABLE OF CONTENTS — What's in This File, How to Use It

> **How to use this table**: Find the phase you need, then tell Claude:
> - `"Run §R3"` — to run a specific phase
> - `"Start restructuring"` — to begin from §TRIAGE
> - `"Continue restructuring"` — to resume from where you left off
> - `"Just restructure [specific thing]"` — to jump to targeted restructuring
> - Or use any **trigger phrase** listed below to jump directly to what you need.

---

### SETUP & ROUTING (read once, then jump to what you need)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| — | **QUICK START** | How to invoke this skill (for you and Claude) | — |
| — | **SKILL MAP** | Section index + common execution paths | "what phases are there", "show the skill map" |
| §TRIAGE | **Restructuring Routing** | Asks which restructuring mode you want | "restructure my app", "reorganize my codebase" |
| §R0 | **App Context Block** | Captures app identity, tech stack, constraints, current structure | "fill the context", "set up restructuring" |

---

### ANALYSIS & DIAGNOSIS (understand before changing)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §R1 | **Codebase Archaeology** | Deep read of codebase: what exists, why, how it grew | "analyze my codebase", "understand my app" |
| §R2 | **Architecture Mapping** | Maps actual vs intended architecture, dependency graph | "map my architecture", "show dependencies" |
| §R3 | **Structural Diagnosis** | Identifies anti-patterns, God components, coupling, responsibility violations | "diagnose structure", "find structural problems" |
| §R4 | **Technical Debt Triage** | Classifies and prioritizes structural debt | "prioritize tech debt", "what to fix first" |

---

### PLANNING (decide what to do)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §R5 | **Target Architecture Design** | Defines the restructured architecture: modules, boundaries, conventions | "design target architecture", "what should the structure look like" |
| §R6 | **Migration Plan** | Ordered sequence of restructuring operations with dependency tracking | "create migration plan", "plan the restructuring" |

---

### LIVE EXECUTION (implement with gates)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §R7 | **Phase 1 — Foundation** | Safety net: tests, baselines, backup | "start executing", "begin restructuring" |
| §R8 | **Phase 2 — Extract & Relocate** | Move files, extract modules, create boundaries | "extract modules", "move files" |
| §R9 | **Phase 3 — Rewire** | Update imports, fix references, create re-exports | "update imports", "fix references" |
| §R10 | **Phase 4 — Decouple** | Break circular deps, invert dependencies, isolate state | "decouple modules", "break dependencies" |
| §R11 | **Phase 5 — Consolidate** | Unify conventions, clean shared code, normalize patterns | "unify conventions", "consolidate code" |
| §R12 | **Phase 6 — Cleanup** | Remove re-exports, dead code, verify metrics | "cleanup", "remove scaffolding" |

---

### VERIFICATION & REFERENCE

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §R13 | **Verification Protocol** | Per-operation and per-phase verification gates | — |
| §R14 | **Rollback Protocol** | How to revert if something breaks | "rollback", "undo restructuring" |
| §R15 | **Anti-Pattern Catalog** | 35+ architecture anti-patterns with detection and resolution | "what anti-patterns", "detect anti-patterns" |
| §R16 | **Refactoring Pattern Library** | Named refactoring operations with step-by-step procedures | "how to extract", "refactoring patterns" |
| §R17 | **Platform-Specific Patterns** | React/Next.js, Android/Kotlin, Flutter, general mobile | "React restructuring", "Android restructuring" |
| §R18 | **File Organization Reference** | Naming conventions, colocation rules, barrel file guidance | "naming conventions", "folder organization" |
| §R19 | **Metrics & Success Criteria** | What to measure, how to measure, target values | "metrics", "how to measure success" |
| §R20 | **Dependency Management Reference** | Coupling types, breaking cycles, interface patterns | "fix circular deps", "reduce coupling" |

---

### TARGETED RESTRUCTURING (jump to specific operations)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §T1 | **God Component Decomposition** | Break up a single oversized component/class | "break up this component", "this file is too big" |
| §T2 | **State Management Migration** | Restructure state from monolithic to modular | "restructure state", "fix state management" |
| §T3 | **Route/Navigation Restructuring** | Reorganize navigation graph and route structure | "restructure routes", "fix navigation" |
| §T4 | **Shared Code Extraction** | Extract genuinely shared code into proper modules | "extract shared code", "consolidate utilities" |
| §T5 | **Feature Module Extraction** | Extract a feature into a self-contained module | "extract feature", "isolate this feature" |
| §T6 | **Layer-to-Feature Migration** | Convert layer-based to feature-based organization | "convert to feature folders", "reorganize by feature" |
| §T7 | **Barrel File Elimination** | Remove barrel/index files and switch to direct imports | "remove barrel files", "fix index files" |
| §T8 | **Convention Unification** | Make naming, patterns, and conventions consistent | "unify conventions", "standardize naming" |

---

### QUICK REFERENCE — "I want to..." → Run this

| I want to... | Run this |
|--------------|----------|
| **Full restructuring of everything** | `"restructure my app"` → §TRIAGE → full pipeline |
| **Just understand the current mess** | `"analyze my codebase"` → §R1–§R4 only |
| **Plan but don't execute yet** | `"plan restructuring"` → §R1–§R6 |
| **Break up one huge file** | `"break up [filename]"` → §T1 |
| **Fix circular dependencies** | `"fix circular deps"` → §T1 within §R10 |
| **Reorganize folders** | `"restructure folders"` → §R5 + §R8 |
| **Fix state management mess** | `"restructure state"` → §T2 |
| **Switch to feature-based structure** | `"convert to feature folders"` → §T6 |
| **Continue from audit findings** | `"restructure based on audit"` → load findings → §R5 |

---

## QUICK START — How to Use This Skill

> **For Claude**: When this skill activates, follow these steps:
> 1. **Check if a prior app-audit exists.** If yes, load findings — skip §R1–§R3 diagnosis and use audit data.
> 2. **If no prior audit**: Run §R0 (context) → §R1 (archaeology) → §R2 (mapping) → §R3 (diagnosis)
> 3. **Always present the restructuring plan (§R6) before executing anything.** Get explicit user approval.
> 4. **Execute one operation at a time.** Each operation = one commit. Verify after each.
> 5. **Never mix restructuring with feature work or bug fixes.** Restructuring commits are structure-only.
>
> **For the User**: Say "restructure my app" and Claude will guide you through analysis, planning, and incremental execution. You approve every major decision. Nothing changes without your permission.

---

## SKILL MAP — Quick Reference

### Section Index

| Section | Purpose | When to Read |
|---------|---------|-------------|
| §TRIAGE | Route to the right mode | **Always first** |
| §R0 | App identity, stack, current structure | **Always** — fill before any work |
| §R1–§R4 | Analysis and diagnosis | **Full restructuring** or **analysis-only** mode |
| §R5–§R6 | Target architecture and migration plan | **Full restructuring** or **planning-only** mode |
| §R7–§R12 | Live execution phases with gates | **Full restructuring** — the actual work |
| §R13–§R14 | Verification and rollback | **During execution** — reference as needed |
| §R15–§R20 | Reference catalogs | **During execution** — look up patterns as needed |
| §T1–§T8 | Targeted operations | **Targeted restructuring** — jump to specific need |

### Common Execution Paths

```
"Restructure my app" (full pipeline)
  → §TRIAGE → §R0 → §R1 → §R2 → §R3 → §R4 → §R5 → §R6 → [approval] → §R7–§R12
  Claude: present plan at §R6, get approval, then execute one operation at a time.

"Analyze my codebase / what's wrong with my structure"
  → §R0 → §R1 → §R2 → §R3 → §R4
  Claude: analysis-only. Present findings. Ask if user wants to proceed to planning.

"Restructure based on the audit" (continues from app-audit)
  → Load audit findings → §R4 (triage from findings) → §R5 → §R6 → [approval] → §R7–§R12
  Claude: skip §R1–§R3 — audit already covers this.

"Break up [specific file/component]"
  → §T1 (God Component Decomposition)
  Claude: targeted operation. Still verify before and after.

"Convert to feature folders"
  → §R0 (lightweight) → §T6 (Layer-to-Feature Migration)
  Claude: targeted but significant — requires migration plan.

"Fix circular dependencies"
  → §R2 (map deps) → §R10 / §R20 (decouple using reference patterns)
  Claude: diagnosis-first, then targeted fixes.
```

### Claude Execution Notes

- **§R1 (Archaeology) is the most important analysis phase.** Never skip it in full restructuring. It prevents "clean but soulless" restructuring that breaks the app's logic.
- **§R5 (Target Architecture) requires user approval.** Never execute without explicit sign-off.
- **§R6 (Migration Plan) is the contract.** Every operation listed. Every dependency tracked. User reviews this.
- **For apps > 5,000 lines:** always confirm with user after §R3 before continuing to planning.
- **When in doubt about scope:** ask the user. Use `AskUserQuestion` with options.
- **Restructuring and feature work NEVER happen in the same commit.** This is an Iron Law.

---

## Claude Code Tool Integration Protocol

> **These instructions are specific to Claude Code (CLI/web).** Use the right tool for each restructuring task.

### Tool Usage Map

| Restructuring Task | Tool to Use | Why |
|-------------------|-------------|-----|
| **Read the codebase** | `Agent` (subagent_type: Explore) | Explores files in parallel without bloating main context |
| **Map file structure** | `Bash` (`find`, `tree`) | Generate directory trees and file lists |
| **Search for patterns** | `Grep` / `Glob` | Find imports, usage patterns, naming conventions |
| **Analyze dependencies** | `Bash` (custom scripts) | Generate import graphs, detect cycles |
| **Ask user decisions** | `AskUserQuestion` | Present restructuring options with trade-offs |
| **Track progress** | `TodoWrite` | Multi-phase progress tracker |
| **Move/rename files** | `Bash` (`mv`, `cp`) | File system operations |
| **Update imports** | `Edit` / `Bash` (`sed`) | Rewrite import paths after moves |
| **Create new files** | `Write` | New module files, re-export scaffolds, index files |
| **Edit existing files** | `Edit` | Extract code, update references, clean up |
| **Verify builds** | `Bash` (`npm run build`, `./gradlew build`) | Confirm nothing broke |
| **Run tests** | `Bash` (`npm test`, `./gradlew test`) | Regression verification |
| **Git operations** | `Bash` (`git add`, `git commit`) | Atomic commits per operation |

### Parallel Analysis Strategy

For large codebases (> 3,000 lines), launch parallel Explore agents:

```
Agent(subagent_type: Explore, prompt: "Read all files in src/components/ — list each file's exports, imports, and primary responsibility in 1 line each")
Agent(subagent_type: Explore, prompt: "Read all files in src/utils/ and src/lib/ — list what each exports and who imports it")
Agent(subagent_type: Explore, prompt: "Read all route/page files — list the navigation structure and data requirements per route")
```

### Multi-Phase Progress Protocol

At the start of any restructuring, create a progress tracker:

```
TodoWrite([
  { content: "§R0 — Fill App Context Block", status: "in_progress" },
  { content: "§R1 — Codebase Archaeology", status: "pending" },
  { content: "§R2 — Architecture Mapping", status: "pending" },
  { content: "§R3 — Structural Diagnosis", status: "pending" },
  { content: "§R4 — Technical Debt Triage", status: "pending" },
  { content: "§R5 — Target Architecture Design", status: "pending" },
  { content: "§R6 — Migration Plan [APPROVAL GATE]", status: "pending" },
  { content: "§R7 — Foundation (tests, baselines)", status: "pending" },
  { content: "§R8 — Extract & Relocate", status: "pending" },
  { content: "§R9 — Rewire Imports", status: "pending" },
  { content: "§R10 — Decouple", status: "pending" },
  { content: "§R11 — Consolidate", status: "pending" },
  { content: "§R12 — Cleanup & Verify", status: "pending" }
])
```

Update status to `completed` as each phase finishes.

### Commit Protocol

**Every restructuring operation gets its own atomic commit.** Format:

```
refactor: [operation type] [what was moved/extracted/renamed]

Examples:
refactor: extract UserProfile feature module from components/
refactor: move auth utilities to features/auth/utils/
refactor: break up GodComponent into ProfileHeader + ProfileStats + ProfileActions
refactor: replace barrel exports with direct imports in features/calculator/
refactor: decouple circular dependency between auth and user modules
refactor: unify button naming convention across all features
```

**Rules:**
- NEVER combine restructuring with functional changes in the same commit
- Each commit must leave the app in a buildable, runnable state
- If a commit breaks the build, revert immediately (§R14)
- Commit message explains WHAT moved and WHY

---

## Platform Awareness

> This skill is stack-agnostic. When restructuring non-web apps, adapt terminology:

| Concept | React/Next.js | Android/Kotlin | Flutter | iOS/Swift |
|---------|--------------|----------------|---------|-----------|
| Component | React Component | Fragment/Composable | Widget | View/ViewController |
| State management | useState/Context/Zustand | ViewModel/LiveData/StateFlow | BLoC/Provider/Riverpod | @State/@ObservedObject |
| Route/Navigation | Next.js pages/app router | Navigation Component/Graph | GoRouter/auto_route | UINavigationController |
| Module/Package | ES module / npm package | Gradle module | Dart package | Swift Package/Module |
| Build tool | Webpack/Turbopack/Vite | Gradle | Flutter build | Xcode/SPM |
| Test runner | Jest/Vitest | JUnit/Espresso | flutter_test | XCTest |
| Dependency injection | Props/Context/providers | Hilt/Dagger/Koin | get_it/injectable | Swinject/Resolver |
| Layout system | CSS/Tailwind/Flexbox | XML layouts/Compose | Widget tree | Auto Layout/SwiftUI |
| Config files | package.json, tsconfig | build.gradle, AndroidManifest | pubspec.yaml | Info.plist, .xcconfig |
| Style tokens | CSS variables | colors.xml/themes.xml/dimens.xml | ThemeData | Asset catalogs |

---

## §TRIAGE — MANDATORY ROUTING (execute BEFORE anything else)

**Always ask first** using `AskUserQuestion`:

```
AskUserQuestion(
  question: "What kind of restructuring do you need?",
  options: [
    "Full restructuring — analyze everything, plan, then execute incrementally",
    "Analysis only — understand the current mess, get a report, decide later",
    "Targeted — I know what's wrong, just fix [specific thing]",
    "Continue from audit — use prior audit findings as the starting point"
  ]
)
```

**Route based on answer:**

| Choice | Execution Path |
|--------|---------------|
| **Full restructuring** | §R0 → §R1 → §R2 → §R3 → §R4 → §R5 → §R6 → [APPROVAL] → §R7–§R12 |
| **Analysis only** | §R0 → §R1 → §R2 → §R3 → §R4 → Present findings → STOP |
| **Targeted** | Ask what specifically → route to §T1–§T8 |
| **Continue from audit** | Load prior findings → §R4 → §R5 → §R6 → [APPROVAL] → §R7–§R12 |

If the user already specified a mode (e.g., "restructure my app"), skip the triage question and route directly.

---

## IRON LAWS — Governing Rules for All Restructuring

> **These are inviolable.** Every decision, every operation, every commit is tested against these laws. Violating any Iron Law is grounds for immediate rollback.

### Law 1 — UNDERSTAND BEFORE CHANGING

**Never restructure code you haven't fully read and understood.** This means:
- Read every file that will be affected by the restructuring operation
- Understand WHY the code is organized the way it is (§R1 Archaeology)
- Identify hidden dependencies that aren't visible in imports (event listeners, global state, dynamic imports, string-based lookups, reflection)
- If you don't understand something, ASK THE USER before touching it

**Violation indicator:** Claude moves a file and something breaks because of a dependency Claude didn't see.

### Law 2 — ONE OPERATION, ONE COMMIT

**Every restructuring change is atomic.** One rename = one commit. One extraction = one commit. One move = one commit.

- Each commit evolves the codebase from one valid state to another
- The app MUST build and run after every single commit
- If a commit breaks something, revert it — don't try to fix forward
- Never combine restructuring with functional changes

**Violation indicator:** A commit contains both a file move AND a bug fix, or multiple unrelated moves.

### Law 3 — VERIFY AFTER EVERY OPERATION

**After every restructuring operation, verify:**
1. The app builds without errors
2. All existing tests pass
3. The affected feature works manually (if no tests exist)
4. No circular dependencies were introduced
5. Import paths resolve correctly

**Violation indicator:** Claude proceeds to the next operation without running build/test.

### Law 4 — PRESERVE BEFORE RESTRUCTURE

**Never delete or overwrite without a safety net:**
- Git commit before starting each operation (revert point)
- Re-export files at old paths when moving files (backwards compatibility)
- Characterization tests for behavior you're about to restructure
- Feature Preservation Ledger tracking what works and must continue working

**Violation indicator:** A working feature breaks during restructuring because there was no test or re-export.

### Law 5 — THE USER APPROVES THE PLAN

**Claude proposes. The user disposes.** Specifically:
- The Target Architecture (§R5) must be presented and approved before execution
- The Migration Plan (§R6) must be reviewed before the first operation
- Any restructuring that changes how the user interacts with the app (routes, navigation, visible behavior) requires explicit approval
- If Claude discovers mid-execution that the plan needs to change, STOP and ask

**Violation indicator:** Claude restructures something the user didn't approve or wasn't informed about.

### Law 6 — NEVER RESTRUCTURE INTO THE UNKNOWN

**Don't restructure toward a vague target.** The Target Architecture (§R5) must be concrete:
- Every module named
- Every boundary defined
- Every convention documented
- Every file placement decided

If you can't describe where something should go, you're not ready to move it.

**Violation indicator:** Claude moves a file to a location not specified in the Target Architecture, or creates a module boundary that wasn't planned.

### Law 7 — COLOCATION OVER CONVENTION

**Things that change together live together.** When deciding where code belongs:
- A component's styles, tests, types, and helpers live next to it — never in a distant global folder
- Feature-specific utilities live in the feature — not in a global `utils/`
- Only genuinely shared code (used by 3+ features) goes in `shared/`
- When in doubt, keep it colocated — you can always extract later

**Violation indicator:** Claude creates a global utility file for code used by only one feature.

### Law 8 — NAMING IS ARCHITECTURE

**Names must communicate structure.** Every file, folder, component, function, and variable name must tell the reader:
- What it does (responsibility)
- Where it belongs (domain/feature)
- How it relates to other things (hierarchy)

Unclear names cause future developers (including Claude) to put things in the wrong place, compounding structural degradation.

**Violation indicator:** Claude creates a file called `helpers.ts` or `utils.ts` or `misc.ts` without a domain qualifier.

### Law 9 — RESPECT THE EXISTING ARCHITECTURE

**Restructuring is surgery, not demolition.** Specifically:
- Preserve architectural systems that work (orbital patterns, design token systems, established conventions)
- Make surgical changes — don't rewrite
- If the user's existing patterns work but are inconsistent, UNIFY them toward the best existing pattern — don't invent a new one
- When multiple conventions exist, the user chooses which one wins

**Violation indicator:** Claude rewrites a working system because it prefers a different pattern.

### Law 10 — STOP WHEN YOU'RE AHEAD

**Restructuring has diminishing returns.** Know when to stop:
- Cold code (unchanged in months) that works = leave it alone
- Local debt with zero contagion = ignore it
- Premature abstraction (extracting before patterns emerge) = don't do it
- 80% improvement in structure is often better than 100% that takes 3× longer
- If the user says "that's enough," it's enough

**Violation indicator:** Claude restructures stable, rarely-changed code that nobody complained about.

---

## §R0 — APP CONTEXT BLOCK (mandatory)

> **Claude execution note**: Extract as much as possible from the codebase before asking the user. Only ask for information that cannot be determined from code. Use `Agent` (Explore) and `Bash` (`tree`, `find`, `wc`) to gather data automatically.

### R0.1 — Auto-Extracted Context (Claude fills this by reading the codebase)

```yaml
App Identity:
  Name:               # from package.json, build.gradle, pubspec.yaml, or README
  Description:        # from README or manifest
  Primary purpose:    # inferred from routes, features, main entry point
  Version:            # from config files

Tech Stack:
  Language:           # TypeScript, Kotlin, Dart, Swift, etc.
  Framework:          # Next.js, React, Android SDK, Flutter, SwiftUI, etc.
  Build tool:         # Webpack, Turbopack, Vite, Gradle, Flutter CLI, Xcode
  Package manager:    # npm, yarn, pnpm, Gradle, pub, CocoaPods, SPM
  Test framework:     # Jest, Vitest, JUnit, flutter_test, XCTest
  State management:   # Zustand, Redux, Context, ViewModel, BLoC, Provider
  Router/Navigation:  # Next.js App Router, React Router, Navigation Component, GoRouter
  Styling:            # Tailwind, CSS Modules, XML themes, ThemeData
  CI/CD:              # GitHub Actions, Vercel, Netlify, Fastlane

Codebase Metrics:
  Total files:        # `find src -type f | wc -l` (or equivalent)
  Total LOC:          # `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l` (or equivalent)
  Source directories:  # top-level directory listing
  Entry points:       # main files, route definitions, manifest activities
  Config files:       # list of configuration files found
  Test files:         # count and location of test files
  Test coverage:      # if measurable

Current Structure:
  Organization style: # layer-based / feature-based / mixed / flat / chaotic
  Top-level folders:  # actual directory tree (2 levels deep)
  Route structure:    # actual page/route/activity listing
  Shared code:        # location and contents of shared/common/utils
  State locations:    # where state is defined and managed
  Type definitions:   # where types/interfaces live
```

### R0.2 — User-Provided Context (ask the user for what can't be extracted)

```yaml
User Context:
  Deployment target:  # Vercel, Netlify, Play Store, App Store, self-hosted
  Team size:          # solo, 2-3, small team, large team
  Users:              # personal, internal, public
  Growth expectation: # stable, moderate growth, rapid scaling

Restructuring Intent:
  Pain points:        # what specifically is bothering the user about current structure
  Off-limits:         # what should NOT be changed (sacred features, external constraints)
  Priorities:         # what matters most — speed, cleanliness, scalability, maintainability
  Time budget:        # how much restructuring is acceptable right now
  Prior attempts:     # has the user tried restructuring before? what happened?

Constraints:
  Breaking changes OK: # can the restructuring change public APIs/URLs/routes?
  Downtime OK:         # can the app be broken temporarily during restructuring?
  Deployment limits:   # any CI/CD constraints (e.g., Vercel deploy limits)
  Git strategy:        # main branch, feature branches, how they deploy
```

### R0.3 — Feature Preservation Ledger

> **Claude execution note**: Build this by walking through the app. Every named feature gets an entry. This is the CONTRACT — no WORKING feature may degrade during restructuring. Verify this ledger after every execution phase.

```yaml
Feature: {name}
  Location:       # file(s) implementing this feature
  Status:         WORKING / PARTIALLY WORKING / BROKEN
  Has tests:      YES ({count}) / NO
  Complexity:     LOW / MEDIUM / HIGH
  Dependencies:   # what this feature depends on (other features, shared code, state)
  Dependents:     # what depends on this feature
  Risk during restructuring: HIGH (shared state, deep coupling) / MEDIUM (some coupling) / LOW (isolated)
```

**Exit criteria for §R0**: Context block filled, Feature Preservation Ledger complete, user has confirmed any unclear items.

---

## §R1 — CODEBASE ARCHAEOLOGY

> **Claude execution note**: This is the UNDERSTANDING phase. Read deeply. Don't judge yet — understand. Use `Agent` (Explore) for parallel reading. Use `Grep` to find patterns. Use `Bash` for quantitative analysis. Present findings to the user as a narrative, not a list.

### R1.1 — Growth Archaeology

Reconstruct the probable development timeline from code evidence:

```yaml
Growth Timeline:
  Era 1 — {description}:
    Evidence:       # older coding patterns, simpler architecture
    Files from era: # list of files that likely date to this era
    Conventions:    # what naming/structure conventions were used

  Era 2 — {description}:
    Evidence:       # pattern changes, new approaches
    Files from era: # list
    Conventions:    # may differ from Era 1

  Era N — {description}:
    Evidence:       # latest patterns
    Files from era: # list
    Conventions:    # current conventions

  Turning Points:
    # Where did the developer change their mind mid-implementation?
    # Where did a quick fix become permanent?
    # Where did a new feature not fit the existing architecture?

  Convention Fractures:
    # Same problem solved differently in different places
    Pattern A: {how it's done in older code} — files: {list}
    Pattern B: {how it's done in newer code} — files: {list}
    Winner:    {which pattern is better, and why}
```

### R1.2 — Responsibility Map

For every file with significant logic (not just re-exports or types), document:

```yaml
File: {path}
  LOC:              # line count
  Primary role:     # what this file's main job is
  Secondary roles:  # what else it does (smell: 2+ roles)
  Exports:          # what it provides to other modules
  Imports from:     # what it depends on
  Imported by:      # who depends on it (use grep to find)
  State owned:      # what state this file creates/manages
  State accessed:   # what external state this file reads/writes
  Coupling score:   # LOW (0-2 imports) / MEDIUM (3-5) / HIGH (6+)
  Cohesion:         # HIGH (all exports serve one purpose) / LOW (mixed purposes)
  Change frequency: # from git log — HIGH/MEDIUM/LOW/UNKNOWN
```

### R1.3 — Hotspot Identification

Cross-reference complexity with change frequency:

```yaml
Hotspots (high complexity + high change frequency):
  1. {file} — LOC: {n}, changes: {n}, reason: {why this changes often}
  2. ...

Complexity Anchors (high complexity + low change frequency):
  1. {file} — LOC: {n}, reason: {why it's complex but stable}
  # These are usually OK to leave alone (Law 10)

Churn Zones (low complexity + high change frequency):
  1. {file} — changes: {n}, reason: {why this changes often despite being simple}
  # These may indicate poor placement — feature in wrong location
```

### R1.4 — Hidden Dependency Discovery

> **Claude execution note**: These are the dependencies that DON'T show up in import statements. They are the #1 cause of restructuring breakage. Be thorough here.

Search for:
- **Dynamic imports**: `import()`, `require()`, `lazy()` — may reference paths by string
- **String-based lookups**: route strings, component registries, event names, store keys
- **Global state**: `window.`, `globalThis.`, static class properties, module-level variables
- **Event listeners**: `addEventListener`, `EventEmitter`, `on()`, `subscribe()`
- **Reflection/introspection**: `getClass()`, property access by string, `eval()`
- **Build-time references**: Webpack aliases, tsconfig paths, Babel module resolver
- **Test fixtures**: Tests that import from specific paths and will break if those paths change
- **Documentation/comments**: References to file locations in comments, READMEs, configs
- **CI/CD configs**: Build scripts, deployment configs that reference specific paths

```yaml
Hidden Dependencies Found:
  H-{N}:
    Type:     # dynamic import / string lookup / global state / event / build config / etc.
    Source:   # file containing the reference
    Target:   # file/module being referenced
    Risk:     # what breaks if the target moves
    Mitigation: # how to handle this during restructuring
```

**Exit criteria for §R1**: Growth timeline reconstructed, responsibility map complete for all significant files, hotspots identified, hidden dependencies catalogued.

---

## §R2 — ARCHITECTURE MAPPING

> **Claude execution note**: This phase produces the structural picture. Use `Bash` to generate import graphs. Use `Grep` to find all import/require statements. Visualize mentally or describe textually.

### R2.1 — Actual Architecture Model

Map the current module structure — not how it's supposed to work, but how it actually works:

```yaml
Actual Module Map:
  Module: {name/folder}
    Type:           # feature / utility / shared / config / UI / data / routing
    Files:          # count and listing
    Public surface:  # what this module exposes (exports)
    Dependencies:    # what modules it imports from
    Dependents:      # what modules import from it
    Ca (afferent):   # number of external modules depending on this one
    Ce (efferent):   # number of external modules this one depends on
    Instability:     # Ce / (Ca + Ce) — 0 = stable, 1 = unstable
    Responsibility:  # what this module is supposed to do
    Reality:         # what this module actually does (may differ)
```

### R2.2 — Dependency Graph Analysis

Generate the import graph:

```bash
# JavaScript/TypeScript — find all imports
grep -rn "import .* from\|require(" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" | grep -v node_modules

# Kotlin — find all imports
grep -rn "^import " app/src/ --include="*.kt"

# Dart — find all imports
grep -rn "^import " lib/ --include="*.dart"
```

Analyze the graph for:

```yaml
Dependency Analysis:
  Total unique import relationships: #
  Average imports per file: #
  Maximum imports in one file: {file} with {n} imports

  Layer violations:
    # Imports that go the wrong direction
    - {file A} imports from {file B} but shouldn't because {reason}

  Circular dependencies:
    # A → B → A cycles
    Cycle {N}: {A} → {B} → {C} → {A}
      Strongest link: {which dependency is most used}
      Weakest link:   {which dependency could be broken most easily}
      Impact:         {what breaks if we break the cycle at the weak link}

  Hub files (high Ca — many things depend on them):
    1. {file} — Ca: {n}, risk: {changing this breaks {n} consumers}

  Satellite files (high Ce — depend on many things):
    1. {file} — Ce: {n}, smell: {may have too many responsibilities}

  Orphan files (Ca=0, Ce=0 or very low):
    1. {file} — may be dead code or poorly integrated
```

### R2.3 — Intended Architecture vs. Reality (Reflexion Model)

> **Claude execution note**: Ask the user what the architecture is SUPPOSED to be. If they don't have a clear picture, infer from folder names, README, and conventions.

```yaml
Reflexion Model:
  Intended modules:
    - {module name}: {intended responsibility}
    - ...

  Convergences (actual matches intended):
    - {module}: correctly implements {intended responsibility}

  Divergences (code dependencies not in the model — violations):
    - {file} in {module A} imports from {module B} — not intended
      Impact:  {what this violation means}
      Cause:   {why this happened — convenience, shared utility, oversight}

  Absences (intended dependencies with no code equivalent):
    - {module A} should depend on {module B} but doesn't
      Impact:  {what this means — e.g., direct database access bypassing repository}
```

### R2.4 — State Architecture Map

```yaml
State Architecture:
  State stores / providers / ViewModels:
    Store: {name}
      Location:     # file path
      Type:         # global / feature-scoped / component-local
      Contains:     # what data it holds
      Consumers:    # who reads from it
      Mutators:     # who writes to it
      Persistence:  # if/how it's persisted
      Appropriate scope: # should this be global/feature/local?
      Problem:      # if scope is wrong, describe the issue

  State flow:
    # How data flows through the app
    Entry points:  # where data enters (API calls, user input, storage)
    Transforms:    # where data is processed/computed
    Display:       # where data is rendered to the user
    Side effects:  # what happens when state changes (API calls, storage, analytics)

  State smells:
    - Prop drilling:     # state passed through 3+ component levels
    - Redundant state:   # same data stored in multiple places
    - Derived state stored: # computed values stored instead of derived
    - Global for local:  # state that should be component-local but is global
    - Missing normalization: # nested/denormalized data causing sync issues
```

**Exit criteria for §R2**: Module map complete, dependency graph analyzed, reflexion model documented, state architecture mapped, all circular dependencies identified.

---

## §R3 — STRUCTURAL DIAGNOSIS

> **Claude execution note**: This is the judgment phase. Using data from §R1 and §R2, identify specific structural problems. Each problem gets a severity, category, and recommended resolution strategy. Present grouped by category. DO NOT present generic advice — every finding must point to specific files, specific dependencies, specific violations.

### R3.1 — Anti-Pattern Detection

For each anti-pattern detected, fill this template:

```yaml
Finding: AP-{N}
  Anti-pattern:    # name from §R15 catalog
  Severity:        CRITICAL / HIGH / MEDIUM / LOW
  Location:        # specific file(s) or module(s)
  Evidence:        # measurable indicators (LOC, coupling count, import count, etc.)
  Impact:          # what this causes (slow builds, hard to modify, bugs, confusion)
  Root cause:      # why this happened (organic growth, missing pattern, team change)
  Resolution:      # which restructuring pattern from §R16 addresses this
  Effort:          HIGH / MEDIUM / LOW
  Risk:            HIGH / MEDIUM / LOW
  Dependencies:    # what other findings does this interact with
```

### R3.2 — God Component / God Class Detection

> **Claude execution note**: Use these thresholds. If a file exceeds ANY of these, it's a candidate for decomposition.

**Detection thresholds:**

| Metric | Threshold | How to Measure |
|--------|-----------|---------------|
| Lines of code | > 300 (component) / > 500 (class/module) | `wc -l` |
| Exports | > 8 named exports | Count export statements |
| Imports | > 10 imports | Count import statements |
| State variables | > 5 state declarations | Count useState/state fields |
| Responsibilities | > 2 distinct concerns | Semantic analysis |
| Props/Parameters | > 7 | Count interface fields |
| Methods/Functions | > 15 | Count function declarations |
| Cyclomatic complexity | > 20 | Nesting depth as proxy |

```yaml
God Components Found:
  GC-{N}:
    File:           # path
    LOC:            # line count
    Exports:        # count
    Imports:        # count
    Responsibilities: # list each distinct responsibility
    Decomposition strategy: # how to break it up (see §T1)
    Priority:       HIGH / MEDIUM / LOW
```

### R3.3 — Coupling Violations

```yaml
Coupling Violations:
  CV-{N}:
    Type:       # circular / content coupling / common coupling / control coupling
    Between:    # module A ↔ module B
    Mechanism:  # direct import / shared mutable state / event coupling / etc.
    Strength:   # how many touchpoints (count imports/references)
    Resolution: # interface extraction / event bus / shared abstraction / merge modules
    Priority:   HIGH (circular or content) / MEDIUM (common) / LOW (stamp)
```

### R3.4 — Responsibility Violations

```yaml
Responsibility Violations:
  RV-{N}:
    File:           # path
    Violation type: # too many responsibilities / wrong location / duplicated elsewhere
    Current roles:  # what it currently does
    Should do:      # what it should be limited to
    Excess code:    # what should be extracted and where it should go
```

### R3.5 — Organization Violations

```yaml
Organization Violations:
  OV-{N}:
    Type:       # misplaced file / orphaned utility / scattered concern / naming mismatch
    File:       # path
    Current:    # where it is and what it's called
    Should be:  # where it should be and what it should be called
    Reason:     # why the current location/name is wrong
    Blocked by: # what prevents moving it right now (hidden deps, consumers, tests)
```

### R3.6 — Diagnostic Summary

```yaml
Diagnostic Summary:
  Total findings:     #
  CRITICAL:           # (blocks further development)
  HIGH:               # (significant structural harm)
  MEDIUM:             # (noticeable but manageable)
  LOW:                # (minor improvement opportunity)

  Dominant pattern:   # what's the single biggest structural problem
  Root cause:         # what systemic cause produced most findings
  Estimated effort:   # total restructuring effort (hours/days/sprints)

  Top 5 priorities:
    1. {finding ID} — {reason it's #1}
    2. ...
```

**Exit criteria for §R3**: All structural problems identified with specific file references, severity assigned, resolution strategy named, priorities established.

---

## §R4 — TECHNICAL DEBT TRIAGE

> **Claude execution note**: Not all debt is worth fixing. This phase separates "must fix" from "can ignore." Use the three-axis model: Impact × Contagion × Fix Cost.

### R4.1 — Debt Classification

For each finding from §R3, classify:

```yaml
Debt Item: {finding ID}
  Type:       LOCAL / MACGYVER / FOUNDATIONAL / DATA
    # LOCAL — contained within one module, low contagion
    # MACGYVER — two systems duct-taped together at interface
    # FOUNDATIONAL — deep assumptions baked into the core
    # DATA — code debt with massive data/content built on top

  Impact (1–5):     # 1=negligible, 5=blocks development
  Contagion (1–5):  # 1=isolated, 5=spreads to everything it touches
  Fix Cost (1–5):   # 1=trivial, 5=multi-day effort with high risk

  Score:            # Impact × Contagion (higher = more urgent)
  Adjusted:         # Score / Fix Cost (higher = better ROI)

  Classification:
    # HIGH Impact + HIGH Contagion + LOW Cost → FIX NOW (quick win)
    # HIGH Impact + HIGH Contagion + HIGH Cost → SCHEDULE (strategic)
    # HIGH Impact + LOW Contagion → SCHEDULE (important but contained)
    # LOW Impact + LOW Contagion → DEFER (regardless of cost)
    # Any debt in COLD CODE (unchanged >3 months) → DEFER unless contagious
```

### R4.2 — Code Temperature Map

```yaml
Code Temperature:
  HOT (changed frequently — core business logic):
    Files: {list}
    Debt here: FIX FIRST — highest ROI

  WARM (changed occasionally):
    Files: {list}
    Debt here: FIX OPPORTUNISTICALLY — when nearby for other reasons

  COLD (rarely changed):
    Files: {list}
    Debt here: DEFER — unless contagious
```

### R4.3 — Prioritized Action List

```yaml
Priority Queue:
  Tier 1 — Fix Now (quick wins with high impact):
    1. {finding ID}: {one-line description} — effort: {estimate}
    2. ...

  Tier 2 — Schedule (high impact, higher effort):
    1. {finding ID}: {one-line description} — effort: {estimate}
    2. ...

  Tier 3 — Opportunistic (fix when nearby):
    1. {finding ID}: {one-line description} — effort: {estimate}
    2. ...

  Tier 4 — Defer (not worth fixing now):
    1. {finding ID}: {reason to defer}
    2. ...

  DO NOT TOUCH (Law 10 — stable, working, rarely changed):
    1. {file/module}: {reason to leave alone}
    2. ...
```

**Exit criteria for §R4**: Every finding classified, prioritized, and assigned to a tier. User has reviewed and adjusted priorities.

---

## §R5 — TARGET ARCHITECTURE DESIGN

> **Claude execution note**: This is the DESIGN phase. Produce a concrete, specific, file-level blueprint of the restructured app. Every file must have a target location. Every module must have defined boundaries. Every convention must be documented. **Present this to the user for approval before any execution.**

### R5.1 — Architecture Style Decision

> If the user hasn't specified, recommend based on app characteristics:

```yaml
Architecture Decision:
  Current style:    # layer-based / feature-based / mixed / flat / chaotic
  Recommended style: # feature-based (most apps) / hybrid (large apps) / domain-driven (complex business logic)
  Rationale:        # why this style fits this app
  User approved:    # YES / NO — MUST be YES before continuing
```

**Decision heuristic:**
- Solo developer, < 20 files → flat or simple feature-based
- Solo developer, 20–100 files → feature-based
- Small team, 50–500 files → feature-based with shared modules
- Large team, 500+ files → hybrid (feature-first, layer-second within features) or domain-driven
- Complex business logic → domain-driven with bounded contexts

### R5.2 — Module Boundary Map

Define every module in the target architecture:

```yaml
Module: {name}
  Type:           FEATURE / SHARED / CORE / CONFIG / ROUTING
  Responsibility: # one-sentence description of what this module owns
  Public API:     # what it exports (components, hooks, functions, types)
  Internal only:  # what stays private within the module
  Dependencies:   # what other modules it may import from
  Forbidden deps: # what it must NEVER import from (enforces boundaries)
  Directory:      # target directory path
  Files:          # list of files that belong here (current → target mapping)
```

### R5.3 — Directory Structure Blueprint

```yaml
Target Directory Structure:
  {root}/
    {feature-a}/
      components/       # UI components specific to this feature
      hooks/            # Custom hooks specific to this feature
      utils/            # Utility functions specific to this feature
      types.ts          # Types specific to this feature
      index.ts          # Public API (ONLY if this is a library package boundary)
      {feature-a}.test.ts  # Tests colocated

    {feature-b}/
      ...

    shared/
      components/       # UI components used by 3+ features
      hooks/            # Hooks used by 3+ features
      utils/            # Utilities used by 3+ features
      types/            # Shared type definitions
      constants/        # App-wide constants

    core/
      # App-wide infrastructure (auth, API client, theme, i18n)

    config/
      # Configuration files
```

### R5.4 — Convention Standard

> **Claude execution note**: Derive conventions from the BEST existing patterns in the codebase (Law 9). Don't invent new conventions — unify toward the best one that already exists.

```yaml
Convention Standard:
  File naming:        # kebab-case / PascalCase / camelCase — pick ONE
  Component naming:   # PascalCase (universal)
  Hook naming:        # camelCase with use- prefix
  Utility naming:     # camelCase
  Type naming:        # PascalCase
  Constant naming:    # UPPER_SNAKE_CASE
  Test naming:        # {filename}.test.{ext} colocated / __tests__/ folder
  Style naming:       # {filename}.module.css / {filename}.styles.ts / inline

  Import style:       # direct imports (no barrels) / barrels at package boundary only
  Export style:        # named exports (no default) / default for components
  State convention:    # local first, then feature store, then global only if needed
  Error handling:      # try/catch pattern / Result type / error boundary

  Winner sources:      # which existing code exemplifies the target conventions
    Best feature:      # {feature name} — this is the gold standard, everything else rises to this level
    Best component:    # {component name} — reference for component structure
    Best utility:      # {file name} — reference for utility organization
```

### R5.5 — File Migration Table

> **Claude execution note**: This is the most important artifact. Every file that moves gets an entry. This table IS the migration plan's source of truth.

```yaml
Migration Table:
  | Current Path | Target Path | Operation | Depends On | Blocked By |
  |-------------|-------------|-----------|------------|------------|
  | src/components/UserProfile.tsx | src/features/profile/components/UserProfile.tsx | MOVE | — | — |
  | src/utils/formatDate.ts | src/shared/utils/format-date.ts | MOVE+RENAME | — | — |
  | src/components/Dashboard.tsx | DECOMPOSE into 3 files | EXTRACT | — | GC-1 |
  | src/hooks/useAuth.ts | src/core/auth/use-auth.ts | MOVE+RENAME | — | — |
  | src/helpers/index.ts | DELETE (barrel file) | DELETE | all consumers updated | T7 |
  | — | src/features/profile/types.ts | CREATE | — | — |
```

Operations: MOVE, MOVE+RENAME, EXTRACT (decompose), MERGE (combine), DELETE, CREATE, REWRITE (rare — only when structure is fundamentally wrong)

**Exit criteria for §R5**: Architecture style approved by user, every module defined, directory blueprint complete, convention standard documented, file migration table complete. **User has explicitly approved this plan.**

---

## §R6 — MIGRATION PLAN

> **Claude execution note**: Convert the file migration table into an ordered sequence of operations. Each operation is one atomic commit. Order matters — dependencies flow forward. Present the full plan to the user for final approval before executing anything.

### R6.1 — Operation Sequencing

Sequence operations using these rules:

1. **Shared/core modules first** — extract shared code before features that depend on it
2. **Leaf modules before hub modules** — move things with few dependents before things with many
3. **Extract before move** — decompose God components before relocating pieces
4. **Create before delete** — new modules exist before old paths are removed
5. **Re-exports before consumer updates** — backwards compatibility bridge is in place during transition
6. **Consumer updates before re-export removal** — all imports updated before removing bridges
7. **Convention changes last** — rename/standardize after structural changes are stable

### R6.2 — Operation Plan

```yaml
Operation Plan:
  Phase 1 — Foundation (§R7):
    OP-001: Record baseline metrics (build time, test count, bundle size)
    OP-002: Verify all tests pass on current state
    OP-003: Git tag/bookmark as rollback point

  Phase 2 — Extract & Relocate (§R8):
    OP-{N}:
      Type:         MOVE / EXTRACT / CREATE / MERGE
      Description:  # what specifically happens
      Files:        # which files are affected
      From:         # current location
      To:           # target location
      Re-exports:   # temporary re-export files needed at old paths
      Consumers:    # files that import from the affected paths
      Test:         # how to verify this operation succeeded
      Rollback:     # how to undo if it fails
      Depends on:   # OP-{N} — must complete first
      Blocked by:   # condition that must be true

  Phase 3 — Rewire (§R9):
    OP-{N}:
      Type:         UPDATE_IMPORTS
      Description:  # update imports in {files} from {old path} to {new path}
      Files:        # which files are updated
      Old path:     # import being replaced
      New path:     # import replacing it
      Test:         # build + existing tests

  Phase 4 — Decouple (§R10):
    OP-{N}:
      Type:         BREAK_CYCLE / INVERT_DEPENDENCY / EXTRACT_INTERFACE
      Description:  # specific decoupling operation
      Cycle:        # which cycle is being broken
      Strategy:     # from §R20 — interface extraction / event bus / shared abstraction
      Test:         # verify cycle is broken and functionality preserved

  Phase 5 — Consolidate (§R11):
    OP-{N}:
      Type:         UNIFY_CONVENTION / NORMALIZE_NAMING / MERGE_DUPLICATES
      Description:  # what's being unified
      Affected:     # list of files
      Before:       # current inconsistent state
      After:        # target consistent state

  Phase 6 — Cleanup (§R12):
    OP-{N}:
      Type:         REMOVE_REEXPORT / DELETE_DEAD_CODE / FINAL_VERIFICATION
      Description:  # what's being removed
      Safe because: # why this is safe to remove now
```

### R6.3 — Risk Assessment

```yaml
Risk Assessment:
  Total operations:   #
  HIGH risk ops:      # (God component decomposition, state migration, route changes)
  MEDIUM risk ops:    # (moves with many consumers)
  LOW risk ops:       # (isolated moves, naming changes)

  Highest risk operation: OP-{N} — {why}
  Mitigation:            {what safeguards are in place}

  Estimated time:
    Phase 1 (Foundation):   {estimate}
    Phase 2 (Extract):      {estimate}
    Phase 3 (Rewire):       {estimate}
    Phase 4 (Decouple):     {estimate}
    Phase 5 (Consolidate):  {estimate}
    Phase 6 (Cleanup):      {estimate}
    Total:                  {estimate}

  Abort conditions:
    # When to stop and reassess
    - 3+ operations fail verification in a row
    - A WORKING feature breaks and can't be immediately fixed
    - The migration plan proves fundamentally wrong (target architecture doesn't work)
    - User says stop
```

### R6.4 — Approval Gate

> **Claude execution note**: THIS IS A HARD GATE. Do not proceed past this point without explicit user approval. Present the operation plan, risk assessment, and estimated time. Ask:

```
AskUserQuestion(
  question: "I've prepared the restructuring plan with {N} operations across 6 phases. Ready to review and approve?",
  options: [
    "Show me the full plan — I want to review everything",
    "Show me just the high-risk operations",
    "I trust the plan — let's execute",
    "I want to modify the plan first"
  ]
)
```

**If the user wants modifications:** update the plan, re-present, re-ask.
**If the user approves:** proceed to §R7.
**If the user rejects:** ask what's wrong, revise §R5 if needed, regenerate §R6.

**Exit criteria for §R6**: User has explicitly approved the migration plan.

---

## §R7 — PHASE 1: FOUNDATION

> **Claude execution note**: This phase creates the safety net. Do not skip any step. These safeguards are what make live restructuring safe instead of reckless.

### R7.1 — Baseline Metrics

```bash
# Record these BEFORE any changes:
echo "=== BUILD TIME ===" && time {build command}
echo "=== TEST RESULTS ===" && {test command}
echo "=== FILE COUNT ===" && find {src} -type f | wc -l
echo "=== LOC ===" && find {src} -name '*.{ext}' | xargs wc -l | tail -1
echo "=== BUNDLE SIZE ===" && {bundle analysis command if applicable}
echo "=== IMPORT COUNT ===" && grep -rn "import " {src} --include="*.{ext}" | wc -l
```

### R7.2 — Rollback Point

```bash
git add -A && git commit -m "chore: pre-restructuring snapshot"
git tag restructuring-start
```

### R7.3 — Test Verification

```bash
# Run full test suite
{test command}

# If tests fail BEFORE restructuring:
# - Document which tests fail and why
# - Do NOT fix them as part of restructuring (Law 2)
# - Note them in the Feature Preservation Ledger as "KNOWN FAILING"
```

### R7.4 — Characterization Tests (if coverage is low)

> **Claude execution note**: If test coverage is below 50% for files being restructured, write characterization tests for critical paths. These document CURRENT behavior (right or wrong) so we can detect if restructuring changes it.

For each critical path without tests:
```yaml
Characterization Test: CT-{N}
  Feature:    # what user-visible feature this covers
  File:       # what file's behavior is being captured
  Input:      # what triggers this behavior
  Expected:   # what currently happens (not what SHOULD happen — what DOES happen)
  Test file:  # where the test lives
```

**Exit criteria for §R7**: Baselines recorded, rollback tag created, all existing tests pass (or known failures documented), characterization tests written for critical uncovered paths.

---

## §R8 — PHASE 2: EXTRACT & RELOCATE

> **Claude execution note**: Execute operations from §R6 Phase 2 one at a time. After EACH operation: build, test, commit. If any operation fails verification, STOP and diagnose before continuing.

### R8.1 — Operation Execution Protocol

For each operation in the plan:

```
1. ANNOUNCE to user: "Executing OP-{N}: {description}"
2. CHECK prerequisites: all dependencies (Depends on) completed
3. EXECUTE the file operation (move/extract/create)
4. CREATE re-export at old path if consumers exist:
   // Old path: src/components/UserProfile.tsx
   export { UserProfile } from '../features/profile/components/UserProfile';
   // This preserves backwards compatibility during migration
5. BUILD: Run build command, verify zero errors
6. TEST: Run test suite, verify zero new failures
7. COMMIT: git add -A && git commit -m "refactor: {description}"
8. REPORT: "OP-{N} complete. Build: ✓ Tests: ✓ ({N} passing)"
9. UPDATE TodoWrite progress
```

### R8.2 — God Component Decomposition (when encountered in plan)

> Full protocol at §T1. Summary here for inline reference:

```
1. Read the entire God component
2. Identify responsibility clusters (groups of related state + functions + JSX/XML)
3. Name each cluster — if naming is hard, the boundary is wrong
4. Present decomposition plan to user:
   "I'm going to split {GodComponent} into:
    - {ComponentA}: handles {responsibility}
    - {ComponentB}: handles {responsibility}
    - {ComponentC}: handles {responsibility}
   The parent will compose them. Approve?"
5. Extract each cluster into its own file, one at a time
6. Create parent component that composes the children
7. Verify: build, test, manual check that the feature looks/works identically
8. Commit each extraction separately
```

### R8.3 — Feature Module Extraction (when encountered in plan)

> Full protocol at §T5. Summary here:

```
1. Create target directory structure for the feature
2. Move the primary component/screen file
3. Move associated hooks, utils, types, styles
4. Move or create feature-specific state management
5. Create re-exports at ALL old paths
6. Verify: build, test
7. Commit: "refactor: extract {feature} module to features/{feature}/"
```

### R8.4 — Shared Code Extraction (when encountered in plan)

> Full protocol at §T4. Summary here:

```
1. Identify code used by 3+ features (grep for import paths)
2. Create shared/{category}/ directory
3. Move shared code to new location
4. Create re-exports at old paths
5. Verify: build, test
6. Commit: "refactor: extract shared {category} to shared/{category}/"
```

**Verification gate for §R8**: All Phase 2 operations complete. Every operation has passed build + test. Feature Preservation Ledger verified — all WORKING features still work.

---

## §R9 — PHASE 3: REWIRE

> **Claude execution note**: Now update all import paths from old locations to new locations. Work through consumers systematically. This is the phase where re-exports are consumed and eventually removed.

### R9.1 — Import Update Protocol

For each re-export created in §R8:

```
1. LIST all consumers: grep -rn "{old import path}" {src}
2. For each consumer file:
   a. Open the file
   b. Replace old import path with new direct import path
   c. Verify the import resolves correctly
3. BUILD after updating all consumers for one re-export
4. TEST
5. COMMIT: "refactor: update imports for {moved module} ({N} files updated)"
6. Do NOT delete the re-export yet — that happens in §R12
```

### R9.2 — Build Config Updates

Check and update:
- **TypeScript**: `tsconfig.json` paths, `baseUrl`, project references
- **Webpack/Vite**: Aliases in build config
- **Jest/Vitest**: `moduleNameMapper`, `roots`, `testMatch`
- **ESLint**: Import resolver configuration
- **Gradle**: Module dependencies, source sets
- **Flutter**: Package imports in `pubspec.yaml`

```bash
# Verify no stale path references remain:
grep -rn "{old path pattern}" {config files}
```

### R9.3 — Test Path Updates

```
1. Find all test files referencing moved modules
2. Update import paths in test files
3. Update test configuration if test location changed
4. Run full test suite
5. Commit: "refactor: update test imports for restructured modules"
```

**Verification gate for §R9**: All imports updated. Build passes. Tests pass. No remaining references to old paths (except intentional re-exports to be cleaned up in §R12).

---

## §R10 — PHASE 4: DECOUPLE

> **Claude execution note**: Break circular dependencies and reduce coupling. These are the highest-risk operations. Execute one cycle-break at a time. Full reference at §R20.

### R10.1 — Circular Dependency Resolution

For each cycle identified in §R2:

```yaml
Cycle: {A} → {B} → {C} → {A}
  Weakest link:   {B} → {C} (least used, least essential)
  Strategy:       {from §R20 — pick one}
  Steps:
    1. {specific step}
    2. {specific step}
    3. {specific step}
  Verify:         grep for the old import pattern — should be gone
  Test:           build + test suite
  Commit:         "refactor: break circular dependency between {A} and {C}"
```

### R10.2 — Dependency Inversion

For each dependency flowing the wrong direction:

```yaml
Inversion: {high-level module} depends on {low-level module}
  Current:    {file A} imports {concrete implementation} from {file B}
  Target:     {file A} imports {interface} defined in {file A's domain}
              {file B} implements {interface}
  Steps:
    1. Define interface in {file A's module}
    2. Update {file A} to import from interface
    3. Update {file B} to implement the interface
    4. Wire via DI / props / provider
  Verify:     {file A} no longer imports from {file B} directly
  Commit:     "refactor: invert dependency — {A} no longer depends on {B}"
```

### R10.3 — State Decoupling

For each state coupling issue from §R2.4:

```yaml
State Issue: {description}
  Current:    {how state is currently coupled}
  Target:     {how it should be scoped}
  Strategy:   # See §T2 for full state migration protocol
  Steps:
    1. {specific step}
    2. {specific step}
  Verify:     state changes in one feature don't trigger renders in unrelated features
  Commit:     "refactor: decouple {state} from {module}"
```

**Verification gate for §R10**: Zero circular dependencies remain. Dependency direction matches target architecture. State scoping matches plan.

---

## §R11 — PHASE 5: CONSOLIDATE

> **Claude execution note**: Unify conventions, merge duplicates, normalize patterns. This is the "make it consistent" phase. Lower risk than Phase 4, but high volume.

### R11.1 — Convention Unification

For each convention fracture from §R1:

```
1. IDENTIFY the canonical convention (from §R5.4)
2. LIST all deviations:
   grep -rn "{deviation pattern}" {src}
3. UPDATE each deviation to match the canonical convention
4. GROUP changes by type — all naming changes in one commit, all pattern changes in another
5. BUILD + TEST after each group
6. COMMIT: "refactor: unify {convention type} to {canonical pattern}"
```

### R11.2 — Duplicate Elimination

For each duplication found in §R3:

```
1. COMPARE duplicates to identify the best version
2. KEEP the best version in the most appropriate location
3. UPDATE all consumers of duplicates to import from the single source
4. DELETE duplicates
5. BUILD + TEST
6. COMMIT: "refactor: consolidate duplicate {name} implementations"
```

### R11.3 — Naming Normalization

```
1. LIST all files that don't match the naming convention (§R5.4)
2. RENAME one file at a time:
   a. Create re-export at old name (backwards compat)
   b. Update imports (if few consumers, do immediately; if many, batch in §R9 style)
   c. Remove re-export once all consumers updated
3. BUILD + TEST after each rename
4. COMMIT: "refactor: rename {old} to {new} ({convention} convention)"
```

### R11.4 — Index/Barrel File Policy

> See §T7 for full barrel elimination protocol.

```yaml
Barrel File Decision:
  Application code:  REMOVE all barrel files, use direct imports
  Library packages:  KEEP one barrel at package root as public API
  Type-only barrels: KEEP (types are erased at compile time, no bundle impact)
```

**Verification gate for §R11**: All conventions unified. No duplicates remain. All files follow naming convention. Barrel files handled per policy.

---

## §R12 — PHASE 6: CLEANUP

> **Claude execution note**: Remove temporary scaffolding, verify everything, measure improvement.

### R12.1 — Remove Re-Exports

```
1. For each re-export file created during restructuring:
   a. VERIFY zero consumers remain: grep -rn "{old path}" {src}
   b. If consumers exist, update them first (go back to §R9)
   c. DELETE the re-export file
   d. BUILD + TEST
   e. COMMIT: "refactor: remove {re-export} — all consumers migrated"
```

### R12.2 — Dead Code Removal

```
1. SCAN for unreachable code:
   - Unused exports (no import found anywhere)
   - Empty files
   - Commented-out code blocks
   - Disabled features with no toggle
2. VERIFY each candidate is truly dead (search for dynamic references, string-based lookups)
3. DELETE confirmed dead code
4. BUILD + TEST
5. COMMIT: "refactor: remove dead code ({N} files, {N} LOC)"
```

### R12.3 — Documentation Update

```
1. UPDATE README if file structure references changed
2. UPDATE any architecture diagrams
3. UPDATE contributing guides if they reference file locations
4. UPDATE CI/CD configs if paths changed
5. COMMIT: "docs: update documentation for restructured codebase"
```

### R12.4 — Final Metrics Comparison

```bash
# Record post-restructuring metrics and compare to §R7.1 baselines:
echo "=== BUILD TIME ===" && time {build command}
echo "=== TEST RESULTS ===" && {test command}
echo "=== FILE COUNT ===" && find {src} -type f | wc -l
echo "=== LOC ===" && find {src} -name '*.{ext}' | xargs wc -l | tail -1
echo "=== BUNDLE SIZE ===" && {bundle analysis command}
echo "=== IMPORT COUNT ===" && grep -rn "import " {src} --include="*.{ext}" | wc -l
```

```yaml
Metrics Comparison:
  | Metric | Before | After | Change | Target Met? |
  |--------|--------|-------|--------|-------------|
  | Build time | {X}s | {Y}s | {diff} | {YES/NO} |
  | Test count | {X} | {Y} | {diff} | {YES/NO} |
  | Total files | {X} | {Y} | {diff} | — |
  | Total LOC | {X} | {Y} | {diff} | — |
  | Bundle size | {X}KB | {Y}KB | {diff} | {YES/NO} |
  | Max file LOC | {X} | {Y} | {diff} | {YES/NO} |
  | Circular deps | {X} | {Y} | {diff} | 0? |
  | God components | {X} | {Y} | {diff} | 0? |
  | Average imports/file | {X} | {Y} | {diff} | — |
```

### R12.5 — Feature Preservation Final Check

```
For each entry in the Feature Preservation Ledger:
  Feature: {name}
    Pre-restructuring status:  {from §R0.3}
    Post-restructuring status: {verify now}
    Regression:                YES / NO
    If YES:                    STOP — investigate and fix before declaring restructuring complete
```

### R12.6 — Final Git Tag

```bash
git tag restructuring-complete
```

**Verification gate for §R12**: All re-exports removed. Dead code cleaned. Documentation updated. Metrics measured and compared. Feature Preservation Ledger fully verified. Zero regressions.

---

## §R13 — VERIFICATION PROTOCOL

> **Claude execution note**: This section defines what verification means at each level. Reference this during execution.

### Per-Operation Verification (after every single operation)

```
□ Build passes (zero errors, zero new warnings)
□ All existing tests pass (zero new failures)
□ No circular dependencies introduced (check with grep or tooling)
□ Import paths resolve correctly (no "module not found" errors)
□ Affected feature works (manual check if no automated test)
```

### Per-Phase Verification (after completing each §R7–§R12 phase)

```
□ All per-operation verifications passed for every operation in this phase
□ Feature Preservation Ledger checked — every WORKING feature still works
□ No regressions in build time (build should be same or faster)
□ No regressions in bundle size (should be same or smaller)
□ Dependency graph improved (fewer cycles, lower coupling)
□ Progress tracker updated
□ User informed of phase completion
```

### Final Verification (after all restructuring complete)

```
□ All phases verified
□ All re-exports and temporary scaffolding removed
□ Metrics comparison shows improvement (§R12.4)
□ Feature Preservation Ledger final check — zero regressions
□ Documentation updated
□ Git history clean — atomic commits, meaningful messages
□ No references to old paths remain anywhere in codebase
□ No dead code introduced during restructuring
□ The app does EXACTLY what it did before, but the code is structured better
```

---

## §R14 — ROLLBACK PROTOCOL

### Per-Operation Rollback

```bash
# If an operation fails verification:
git checkout -- .          # discard all uncommitted changes
# OR if already committed:
git revert HEAD            # revert the last commit
```

### Per-Phase Rollback

```bash
# If a phase has gone wrong and multiple operations need reverting:
git log --oneline          # find the last good commit
git revert HEAD~{N}..HEAD  # revert the last N commits
# OR for a clean slate:
git reset --hard {last-good-commit}
```

### Full Rollback

```bash
# Return to pre-restructuring state:
git reset --hard restructuring-start
```

### Rollback Decision Rules

```yaml
When to rollback one operation:
  - Build fails after the operation
  - A test that was passing now fails
  - The affected feature visibly breaks

When to rollback a phase:
  - 3+ operations in the phase fail verification
  - A systemic problem is discovered (e.g., wrong module boundaries)
  - The user requests it

When to rollback everything:
  - The target architecture proves fundamentally wrong
  - The app is worse after restructuring than before
  - The user requests full rollback
```

---

## §R15 — ANTI-PATTERN CATALOG

> **Reference section.** Look up specific anti-patterns during §R3 diagnosis.

### Architecture Anti-Patterns

| ID | Name | Detection | Impact | Resolution |
|----|------|-----------|--------|-----------|
| AP-01 | **Big Ball of Mud** | No discernible module boundaries, everything imports everything | Impossible to reason about, change, or test in isolation | Full restructuring — define modules, extract features, enforce boundaries |
| AP-02 | **God Component/Class** | LOC > 300, exports > 8, responsibilities > 2, imports > 10 | Hard to understand, test, modify; attracts more code over time | §T1 — Decompose into focused components |
| AP-03 | **Circular Dependencies** | A imports B imports A (direct or transitive) | Can't isolate modules, bundle size inflation, confusing data flow | §R20 — Interface extraction, event bus, shared abstraction |
| AP-04 | **Scattered Concern** | Same concept implemented in 3+ separate locations | Inconsistency, bugs from partial updates, duplication | Extract to shared module, single source of truth |
| AP-05 | **Golden Hammer** | Same tool/pattern used for everything regardless of fit | Overcomplicated solutions for simple problems | Evaluate each use case independently |
| AP-06 | **Lava Flow** | Dead code retained because nobody dares remove it | Confusion, increased cognitive load, bundle bloat | Verify dead (grep + git blame), then delete |
| AP-07 | **Prop Drilling** | State passed through 3+ component levels without use | Brittle, hard to refactor, coupling between distant components | Context, composition, or state management at appropriate level |
| AP-08 | **Premature Abstraction** | Abstraction created before pattern emerged, used in 1 place | Unnecessary complexity, wrong abstraction boundary | Inline the abstraction, wait for 3+ uses before re-extracting |
| AP-09 | **Feature Envy** | Code in module A mostly accesses data/methods from module B | Wrong placement, tight coupling to foreign module | Move code to the module it's most interested in |
| AP-10 | **Shotgun Surgery** | One logical change requires modifying 5+ files across modules | Hidden coupling, fragile architecture | Colocate related code, extract shared module |
| AP-11 | **Divergent Change** | One file changes for many unrelated reasons | Multiple responsibilities in one file | Extract each responsibility into its own file |
| AP-12 | **Poltergeist** | Class/component that only passes through to another | Unnecessary indirection, no added value | Remove the intermediary, connect directly |
| AP-13 | **Functional Decomposition** | OO/Component system designed as procedural pipeline | Poor encapsulation, state management issues | Restructure around domain objects/components |
| AP-14 | **Inappropriate Intimacy** | Two modules access each other's internals | Fragile, hard to change independently | Define public API, hide internals, use dependency inversion |
| AP-15 | **Swiss Army Knife** | Interface/component that tries to do everything via configuration | Cognitive overload, impossible to understand all modes | Split into focused interfaces/components per use case |
| AP-16 | **Barrel File Hell** | Barrel files re-exporting barrel files, creating massive import chains | Slow builds (75% slower per Atlassian), inflated bundles, circular risk | §T7 — Remove barrels, use direct imports |
| AP-17 | **Util Junk Drawer** | Single `utils.ts` or `helpers.ts` file with unrelated functions | No cohesion, attracts more junk over time, naming gives no information | Split by domain: `format-date.ts`, `string-utils.ts`, etc. |
| AP-18 | **Context Hell** | Deeply nested Context/Provider tree causing render cascading | Performance issues, hard to trace state flow | Split state/dispatch, push providers down, use atomic state |
| AP-19 | **Monolithic State** | Single global store holding all application state | Re-renders everywhere, impossible to reason about, hard to test | §T2 — Classify and split by scope: local, feature, server, global |
| AP-20 | **Stovepipe Feature** | Feature built as isolated silo, not integrated with app conventions | Inconsistent UX, duplicated utilities, different coding style | Integrate into app conventions, extract shared code |
| AP-21 | **Copy-Paste Architecture** | Features built by copying an existing feature and modifying | Hidden coupling to original, divergent evolution, bug duplication | Extract common patterns to shared, diverge only what's different |
| AP-22 | **Over-Modularization** | Excessive decomposition into tiny modules with 1 file each | Import hell, cognitive overhead from too many files, indirection | Merge related micro-modules into cohesive feature modules |
| AP-23 | **Under-Modularization** | Too few modules, each containing too much | Low cohesion, high coupling within module, hard to find things | Extract features into proper modules with clear boundaries |
| AP-24 | **Spaghetti Navigation** | Routes/navigation with no clear hierarchy, random deep links | Users get lost, developers can't predict flow, hard to add screens | Restructure navigation into clear hierarchical graph (§T3) |
| AP-25 | **Domain Allergy** | Architecture that ignores domain concepts, organized only by technology | Hard to map business concepts to code, poor discoverability | Reorganize by domain/feature, name modules after business concepts |

### Detection Commands

```bash
# God components (files over 300 LOC)
find {src} -name '*.{ext}' -exec sh -c 'wc -l "$1" | awk "{if (\$1 > 300) print}"' _ {} \;

# Circular dependencies (JavaScript/TypeScript)
# Use madge: npx madge --circular {src}
# Or manually: grep -rn "import.*from" {src} | sort | analyze

# Barrel files
find {src} -name "index.ts" -o -name "index.tsx" -o -name "index.js" | head -20

# Files with most imports
for f in $(find {src} -name '*.{ext}'); do echo "$(grep -c "^import" "$f") $f"; done | sort -rn | head -20

# Files imported most (most depended on)
for f in $(find {src} -name '*.{ext}'); do
  name=$(basename "$f" .{ext})
  echo "$(grep -rl "$name" {src} --include='*.{ext}' | wc -l) $f"
done | sort -rn | head -20

# Dead exports (exported but never imported elsewhere)
# Requires per-export analysis
```

---

## §R16 — REFACTORING PATTERN LIBRARY

> **Reference section.** Named operations with step-by-step procedures.

### Move Operations

#### MOVE-FILE — Relocate a file to a new path

```
1. Identify all consumers: grep -rn "{filename}" {src}
2. Create target directory if needed: mkdir -p {target}
3. Move the file: mv {old path} {new path}
4. Create re-export at old path:
   export { default, namedExport1, namedExport2 } from '{relative path to new location}';
5. Build → verify zero errors
6. Test → verify zero failures
7. Commit: "refactor: move {filename} to {target directory}"
```

#### MOVE-MULTIPLE — Relocate a group of related files

```
1. Identify all files in the group
2. Identify all consumers of all files in the group
3. Create target directory structure
4. Move all files
5. Create re-exports at all old paths
6. Build + Test
7. Commit: "refactor: move {feature/concern} files to {target}"
```

### Extract Operations

#### EXTRACT-COMPONENT — Extract part of a component into its own file

```
1. Identify the code to extract:
   - Related state declarations
   - Related event handlers
   - Related JSX/template section
   - Related helper functions
2. Name the new component (if naming is hard, boundary is wrong)
3. Determine props interface:
   - What data does the extracted code need from the parent?
   - What callbacks does it need to communicate back?
4. Create new file with the extracted component
5. Import and use the new component in the parent
6. Build + Test
7. Commit: "refactor: extract {ComponentName} from {ParentName}"
```

#### EXTRACT-HOOK — Extract logic into a custom hook (React/Compose/Flutter)

```
1. Identify related state + effects + handlers that form a cohesive unit
2. Name the hook: use{PurposeName}
3. Determine the hook's return interface: { values, handlers, computed }
4. Create hook file: {feature}/hooks/use-{purpose-name}.ts
5. Move state, effects, handlers into the hook
6. Replace in parent with: const { ... } = use{PurposeName}()
7. Build + Test
8. Commit: "refactor: extract use{PurposeName} hook from {ParentName}"
```

#### EXTRACT-UTILITY — Extract helper functions into utilities

```
1. Identify pure functions (no side effects, no state access)
2. Determine if this utility is:
   - Feature-specific → stays in feature/utils/
   - Used by 3+ features → goes to shared/utils/
3. Create utility file with clear name: {domain}-utils.ts or {verb}-{noun}.ts
4. Move functions, add proper exports
5. Update imports in original file
6. Build + Test
7. Commit: "refactor: extract {utility name} to {location}"
```

#### EXTRACT-TYPES — Extract type definitions into a types file

```
1. Identify all types/interfaces defined inline or scattered
2. Determine scope:
   - Component-specific → stays in component file or adjacent .types.ts
   - Feature-wide → feature/types.ts
   - Shared across features → shared/types/{domain}.ts
3. Move types to appropriate file
4. Update imports
5. Build + Test (type-only changes rarely break runtime)
6. Commit: "refactor: extract {domain} types to {location}"
```

### Merge Operations

#### MERGE-FILES — Combine small related files into one cohesive module

```
1. Verify files are genuinely related (same feature, same concern)
2. Verify combined LOC stays reasonable (< 300)
3. Create the merged file with a clear name
4. Move content from source files into merged file
5. Create re-exports at old paths
6. Update consumers to import from merged file
7. Remove re-exports and old files
8. Build + Test
9. Commit: "refactor: merge {files} into {merged file}"
```

### Delete Operations

#### DELETE-DEAD-CODE — Remove unreachable code

```
1. VERIFY the code is truly dead:
   - No static imports found: grep -rn "{export name}" {src}
   - No dynamic references: grep -rn '"{export name}"' {src}
   - No string-based lookups that could reference it
   - git blame shows no recent changes (nobody is actively using/developing it)
2. Delete the code
3. Build + Test
4. Commit: "refactor: remove dead code — {description} ({N} LOC)"
```

### Rename Operations

#### RENAME-FILE — Change a file's name to match conventions

```
1. Create re-export at old name (if consumers exist)
2. Rename the file: mv {old name} {new name}
3. Update the re-export to point to new name
4. Update all consumers to use new name
5. Remove re-export
6. Build + Test
7. Commit: "refactor: rename {old} to {new} ({reason})"
```

---

## §R17 — PLATFORM-SPECIFIC PATTERNS

### React / Next.js Restructuring

#### Component Tree Restructuring

**Container/Presentational Split**:
```
1. Identify components mixing data fetching/state with rendering
2. Extract rendering into a Presentational component (props-only, no hooks)
3. Keep data logic in a Container component (hooks, state, effects)
4. Container passes data to Presentational via props
5. Benefit: Presentational components are reusable, testable, previewable
```

**Compound Component Pattern**:
```
1. Identify related components that work together (Tabs + Tab + TabPanel)
2. Create a parent component that provides shared context
3. Each child accesses context implicitly
4. Export as a namespace: Tabs.Tab, Tabs.Panel
5. Benefit: Components compose flexibly without prop drilling
```

#### Next.js App Router Organization

**Three strategies:**

```yaml
Strategy A — App-only (simplest):
  app/
    (auth)/          # Route group for auth pages
      login/page.tsx
      register/page.tsx
    (main)/          # Route group for main app
      dashboard/page.tsx
      profile/page.tsx
    layout.tsx
    components/      # Colocated components
    hooks/           # Colocated hooks
    lib/             # Colocated utilities

Strategy B — Shared root (recommended for medium apps):
  app/               # Purely routing — pages are thin wrappers
    (auth)/login/page.tsx
    (main)/dashboard/page.tsx
    layout.tsx
  components/        # Shared UI components
  features/          # Feature modules
    auth/
    dashboard/
    profile/
  lib/               # Shared utilities
  hooks/             # Shared hooks

Strategy C — Hybrid (recommended for large apps):
  app/
    (auth)/
      login/
        page.tsx
        _components/   # Page-specific components (private folder)
    (main)/
      dashboard/
        page.tsx
        _components/
  features/           # Complex feature logic
  shared/             # Cross-cutting shared code
```

#### Server vs Client Component Boundaries

```yaml
Rules:
  - Default to Server Components (zero client JS)
  - Add 'use client' ONLY when you need: useState, useEffect, event handlers, browser APIs
  - Push 'use client' DOWN to leaf components, not up to parents
  - Pattern: Server parent → passes children to Client wrapper
    // ServerParent.tsx (server)
    <ClientInteractiveWrapper>
      <ServerContent />  // Still renders on server
    </ClientInteractiveWrapper>
  - Use `server-only` package to protect server code from accidental client import
```

#### Context Consolidation

```yaml
Problem: Provider Hell — 10+ nested providers wrapping the app
Solution:
  1. Audit each provider:
     - Is this truly global? (auth, theme, i18n = yes)
     - Is this feature-scoped? (cart state, form state = push down)
     - Is this server state? (API data = use React Query instead of context)
  2. Split state and dispatch into separate contexts:
     const StateCtx = createContext(state);
     const DispatchCtx = createContext(dispatch);  // stable reference
  3. Combine remaining global providers into a single Providers component
  4. Use useMemo for object/array values to prevent unnecessary re-renders
```

### Android / Kotlin Restructuring

#### Single Activity Migration

```yaml
Steps:
  1. Introduce Fragments (one per screen):
     - Move UI logic from Activity to Fragment
     - Activity retains only navigation and shared chrome (toolbar, bottom nav)
  2. Add Navigation Component:
     - Create nav_graph.xml with Fragment destinations
     - Replace FragmentTransaction with Navigation actions
     - Replace startActivity with navController.navigate()
  3. Group into nested navigation graphs:
     - Auth flow: login, register, forgot password
     - Main flow: home, profile, settings
     - Feature flows: one nested graph per feature
  4. ONE MAJOR CHANGE AT A TIME:
     - Do NOT adopt Jetpack Navigation + ViewModels + Repository + Room simultaneously
     - Migrate navigation first, then state management, then data layer
```

#### MVVM + Repository Pattern

```yaml
Target Architecture:
  View (Fragment/Composable)
    → ViewModel (business logic, state)
      → Repository (data coordination)
        → Remote DataSource (API)
        → Local DataSource (Room/SharedPreferences)

Migration steps:
  1. Extract business logic from Fragments into ViewModels
  2. Create Repository interfaces in domain layer
  3. Implement repositories coordinating Remote + Local sources
  4. ViewModels depend on Repository interfaces (not implementations)
  5. Use Hilt/Dagger for dependency injection
  6. Expose state via StateFlow (preferred) or LiveData
  7. Fragments observe state reactively — no direct data access
```

#### Navigation Graph Restructuring

```yaml
Rules:
  - One top-level nav_graph.xml
  - Nested graphs for each feature (<navigation> elements)
  - External navigation goes to the nested graph's START destination, never internal
  - Use <include> to split graphs across files for large apps
  - Deep links defined in nav graph, not scattered across code
  - SafeArgs for type-safe argument passing
```

### Flutter Clean Architecture

```yaml
Target Structure:
  lib/
    core/
      database/
      network/
      di/              # get_it + injectable setup
      error/
      theme/
      widgets/         # Shared widgets
    features/
      {feature}/
        data/
          datasources/
          models/        # JSON serialization models
          repositories/  # Repository implementations
        domain/
          entities/      # Pure Dart objects
          repositories/  # Repository interfaces (abstract)
          usecases/      # Single-purpose use cases
        presentation/
          bloc/          # BLoC/Cubit classes
          pages/
          widgets/

Migration steps:
  1. Create domain layer first (pure Dart, no Flutter imports)
  2. Define repository interfaces in domain
  3. Implement data layer (datasources + repository implementations)
  4. Create BLoC/Cubit for each screen
  5. Wire with dependency injection (get_it)
  6. Migrate one feature at a time
```

---

## §R18 — FILE ORGANIZATION REFERENCE

### Naming Conventions

```yaml
Files and folders:
  Convention:     kebab-case (universal, filesystem-safe)
  Examples:       user-profile.tsx, checkout-summary.vue, use-auth.ts
  Suffixes:       .service.ts, .controller.ts, .hook.ts, .types.ts, .test.ts, .styles.ts
  Symmetry:       user.service.ts exports class UserService

Code entities:
  Components:     PascalCase — UserProfile, NavigationBar
  Functions:      camelCase — fetchUserData, calculateTotal
  Variables:      camelCase — userSettings, isLoading
  Constants:      UPPER_SNAKE_CASE — API_URL, MAX_RETRIES
  Types:          PascalCase — type User, interface CheckoutStatus
  Enums:          PascalCase — enum UserRole { Admin, Member }
  Hooks:          camelCase with use- prefix — useAuth, useTabState
  Contexts:       PascalCase with Context suffix — AuthContext, ThemeContext
  Stores:         camelCase with Store/Slice suffix — userStore, cartSlice
  Test files:     {filename}.test.{ext} — colocated next to source
  Style files:    {filename}.module.css or {filename}.styles.ts — colocated next to source

Android/Kotlin:
  Activities:     PascalCase + Activity — MainActivity, ProfileActivity
  Fragments:      PascalCase + Fragment — HomeFragment, SettingsFragment
  ViewModels:     PascalCase + ViewModel — HomeViewModel, AuthViewModel
  Repositories:   PascalCase + Repository — UserRepository, AuthRepository
  XML layouts:    snake_case — activity_main.xml, fragment_home.xml, item_user.xml
  XML resources:  snake_case — colors.xml, dimens.xml, strings.xml
```

### Colocation Rules

```yaml
Rule 1 — Default colocated:
  Component + test + styles + types + helpers = same directory
  feature/
    user-profile.tsx
    user-profile.test.tsx
    user-profile.styles.ts
    user-profile.types.ts
    format-user-name.ts    # helper used only by this component

Rule 2 — Feature-scoped shared:
  When 2+ components in the same feature share code:
  feature/
    components/
      user-avatar.tsx
      user-badge.tsx
    hooks/
      use-user-data.ts     # shared within feature
    utils/
      format-user.ts       # shared within feature
    types.ts               # feature-wide types

Rule 3 — App-wide shared (3+ features):
  shared/
    components/
      button.tsx           # used by auth, profile, settings
    hooks/
      use-debounce.ts      # used by search, filter, form
    utils/
      format-date.ts       # used by events, history, dashboard
    types/
      common.ts            # used everywhere

Rule 4 — Core infrastructure:
  core/
    auth/                  # auth provider, token management
    api/                   # API client, interceptors
    theme/                 # design tokens, theme provider
    i18n/                  # translation setup
    config/                # environment config
```

### Barrel File Guidance

```yaml
IN APPLICATION CODE — DO NOT USE BARREL FILES:
  Reason 1: Build performance — Atlassian saw 75% faster builds after removing barrels
  Reason 2: Bundle size — TkDodo found 68% module count reduction after removing barrels
  Reason 3: Circular dependency risk — barrels create import cycles within directories
  Reason 4: IDE confusion — auto-imports often pick barrel instead of direct path

  Instead: Use direct imports everywhere
    BAD:  import { Button } from '@/components'        // barrel
    GOOD: import { Button } from '@/components/button'  // direct

IN LIBRARIES/PACKAGES — USE ONE BARREL AT PACKAGE ROOT:
  The barrel IS the public API of the package
  Use package.json "exports" field for granular subpath exports

TYPE-ONLY BARRELS — ACCEPTABLE:
  Types are erased at compile time, zero runtime cost
  export type { User, UserRole, UserSettings } from './user.types';
```

---

## §R19 — METRICS & SUCCESS CRITERIA

### What to Measure

```yaml
Structural Metrics:
  Max file LOC:              # target: < 300 for components, < 500 for modules
  Average file LOC:          # target: 50–150
  Circular dependencies:     # target: 0
  God components (>300 LOC): # target: 0
  Average imports per file:  # target: < 8
  Max imports in one file:   # target: < 15
  Orphan files (0 importers): # target: only entry points and configs

Build Metrics:
  Build time:                # should improve or stay same
  Bundle size:               # should improve or stay same
  Test execution time:       # should improve or stay same

Quality Metrics:
  Test count:                # should increase (characterization tests added)
  Test coverage:             # should increase or stay same
  Lint errors:               # should decrease

Developer Experience Metrics:
  Time to find a file:       # qualitative — should improve
  Time to add a feature:     # qualitative — should improve
  Onboarding clarity:        # qualitative — new developer can understand structure
  Confidence in changes:     # qualitative — less fear of breaking things
```

### Success Criteria

```yaml
Minimum success (restructuring was worthwhile):
  □ Zero feature regressions
  □ Build time not worse
  □ Zero circular dependencies
  □ Zero God components
  □ File structure communicates app purpose (Screaming Architecture)

Good success:
  □ All minimum criteria
  □ Build time improved
  □ Bundle size same or smaller
  □ Average file LOC < 150
  □ All features have clear module boundaries
  □ Shared code properly extracted and deduplicated
  □ Conventions unified throughout

Excellent success:
  □ All good criteria
  □ Module boundaries enforced by lint rules / build config
  □ Dependency direction matches architecture (no violations)
  □ Every file follows naming convention
  □ Developer reports higher confidence and faster navigation
  □ New feature can be added by creating a new feature folder without modifying existing code
```

---

## §R20 — DEPENDENCY MANAGEMENT REFERENCE

### Coupling Hierarchy (best to worst)

```yaml
1. Message Coupling (BEST):    Components communicate via messages/events only
2. Data Coupling:              Components share data through parameters/props
3. Stamp Coupling:             Components share common data structures
4. Control Coupling:           One component controls another's flow via flags
5. External Coupling:          Shared format/protocol/external dependency
6. Common Coupling:            Shared global data (global state, singletons)
7. Content Coupling (WORST):   One component accesses another's internals
```

### Breaking Circular Dependencies — Five Patterns

#### Pattern 1 — Interface Extraction (most common)

```
Problem: A imports B, B imports A
Solution:
  1. Determine which dependency is weaker (less used)
  2. Extract an interface from the class creating the problematic dependency
  3. Place interface in the CONSUMING module (or shared abstractions)
  4. Both modules depend on the abstraction; cycle broken

Before: feature-a/service.ts imports from feature-b/utils.ts
        feature-b/utils.ts imports from feature-a/service.ts
After:  feature-a/service.ts imports interface from shared/interfaces.ts
        feature-b/utils.ts imports interface from shared/interfaces.ts
        Both implement/use the shared interface
```

#### Pattern 2 — Extract Shared Code to Third Module

```
Problem: A and B each have code the other needs
Solution:
  1. Identify the shared concern
  2. Extract to a new module C
  3. Both A and B depend on C, not each other

Before: auth/ ↔ user/ (both need user types)
After:  auth/ → types/ ← user/ (shared types in neutral module)
```

#### Pattern 3 — Event/Observer Pattern

```
Problem: A needs to notify B, and B needs to notify A
Solution:
  1. Create an event bus/emitter in a shared module
  2. A publishes events, B subscribes (and vice versa)
  3. Neither module imports the other

Before: order.service.ts imports inventory.service.ts (to check stock)
        inventory.service.ts imports order.service.ts (to update on order)
After:  order.service.ts emits 'order:placed' event
        inventory.service.ts listens for 'order:placed' event
        Shared event-bus.ts provides pub/sub infrastructure
```

#### Pattern 4 — Dependency Inversion

```
Problem: High-level module depends on low-level module
Solution:
  1. Define interface in the high-level module
  2. Low-level module implements the interface
  3. High-level module depends on its own interface
  4. DI/props provides the implementation at runtime

Before: Dashboard imports DatabaseService directly
After:  Dashboard defines IDataProvider interface
        DatabaseService implements IDataProvider
        Dashboard receives IDataProvider via DI/props
```

#### Pattern 5 — Merge Modules

```
Problem: Two modules are so tightly coupled they can't be separated
Solution:
  If two modules have bidirectional dependencies on 5+ touchpoints,
  they might actually be ONE module that was artificially split.
  Merge them and define a clear single public API.

Assessment: Count cross-references. If > 50% of module A's exports
  are consumed by module B and vice versa, they belong together.
```

### Detecting Cycles

```bash
# JavaScript/TypeScript with madge:
npx madge --circular src/

# Manual detection:
# 1. For each file, list its imports
# 2. For each import, check if it (transitively) imports the original file
# This is O(n²) but works for small codebases

# grep-based quick check (direct cycles only):
for f in $(find src -name '*.ts'); do
  imports=$(grep "from '" "$f" | sed "s/.*from '//;s/'.*//")
  for imp in $imports; do
    # Resolve relative import to file path
    # Check if that file imports back to $f
    # Report if found
  done
done
```

---

## §T1 — GOD COMPONENT DECOMPOSITION

> **Targeted operation.** Use when a single component/class is too large and handles too many responsibilities.

### Prerequisites

```
□ The God component is identified (LOC > 300 or responsibilities > 2)
□ The component's feature works correctly (we're restructuring, not fixing)
□ Git is clean (no uncommitted changes)
```

### Step-by-Step Protocol

```
STEP 1 — READ AND UNDERSTAND
  Read the entire God component. Identify:
  - State declarations (useState, class fields, etc.)
  - Event handlers / methods
  - Side effects (useEffect, lifecycle methods)
  - Render sections (JSX blocks, XML layouts, Widget builds)
  - Internal helper functions

STEP 2 — IDENTIFY RESPONSIBILITY CLUSTERS
  Group related items. A "cluster" is:
  - State variables that change together
  - Functions that use those state variables
  - The part of the render that displays those state variables
  - Effects that synchronize those state variables

  Example:
  Cluster A: {profileName, profileImage, handleNameChange, handleImageUpload, <ProfileSection>}
  Cluster B: {stats, isLoading, fetchStats, <StatsSection>}
  Cluster C: {tabs, activeTab, handleTabChange, <TabNavigation>}

STEP 3 — NAME EACH CLUSTER
  If naming is hard, the boundary is WRONG. Revisit the grouping.
  Names should be specific: ProfileHeader, ProfileStats, ProfileTabs
  NOT generic: Section1, TopPart, ContentArea

STEP 4 — DETERMINE COMMUNICATION
  For each cluster:
  - What data does it need from the parent? (props)
  - What does it need to communicate back? (callbacks)
  - What shared state needs to remain in the parent? (composition state)

STEP 5 — PRESENT PLAN TO USER
  "I'm going to decompose {GodComponent} (currently {LOC} lines) into:
   - {ComponentA} ({responsibility}) — ~{LOC} lines
   - {ComponentB} ({responsibility}) — ~{LOC} lines
   - {ComponentC} ({responsibility}) — ~{LOC} lines
   - {ParentComponent} composes all three — ~{LOC} lines
   Total: {LOC} lines (approximately same, distributed across focused files)
   Approve?"

STEP 6 — EXTRACT ONE CLUSTER AT A TIME
  For each cluster (start with the most independent):
  a. Create new file: {feature}/components/{cluster-name}.{ext}
  b. Move state, handlers, effects, render section
  c. Define props interface for data and callbacks
  d. In parent: import and render the extracted component, passing props
  e. BUILD + TEST
  f. COMMIT: "refactor: extract {ClusterName} from {GodComponent}"

STEP 7 — VERIFY THE DECOMPOSITION
  □ Parent component is now primarily composition (< 100 LOC ideally)
  □ Each extracted component has a single clear responsibility
  □ No circular dependencies between extracted components
  □ The feature looks and works identically to before
  □ All tests pass
```

### Common Decomposition Patterns

```yaml
Pattern: Container + Presentational
  When: Component mixes data fetching with rendering
  Split: Container (hooks, state, effects) + Presentational (props → JSX)

Pattern: Composition Root
  When: Component orchestrates multiple sub-features
  Split: Root (state + composition) + Sub-components (focused rendering)

Pattern: Hook Extraction
  When: Component has complex state/effect logic
  Split: Custom hook (logic) + Component (rendering)

Pattern: Page → Sections
  When: Page component renders multiple distinct sections
  Split: Page (layout + data) + Section components (rendering)

Pattern: Form → Fields
  When: Form component handles many fields
  Split: Form (submission, validation) + Field components (input UI)
```

---

## §T2 — STATE MANAGEMENT MIGRATION

> **Targeted operation.** Use when state management is monolithic, poorly scoped, or disorganized.

### State Classification Protocol

```
STEP 1 — INVENTORY ALL STATE
  For each state declaration in the app:
    State: {name}
      Location:     # file where it's declared
      Type:         # what data it holds
      Scope:        # current scope (global/feature/local)
      Readers:      # who reads this state (list files)
      Writers:      # who writes this state (list files)
      Persistence:  # is it persisted? where?
      Source:       # where does the initial data come from? (API/user input/derived/hardcoded)

STEP 2 — CLASSIFY BY TYPE
  For each state item, assign ONE classification:

  LOCAL UI STATE:
    - Component-level toggles, form inputs, scroll position
    - Used by ONE component
    - Action: useState / component state

  SERVER STATE:
    - Data from an API that needs caching and sync
    - Multiple components may read it
    - Action: React Query / TanStack Query / Apollo / equivalent
    - This classification typically removes 50%+ of global store code

  FEATURE STATE:
    - Client state shared within ONE feature
    - Multiple components in the same feature read/write
    - Action: Feature-scoped store (Zustand slice, BLoC, ViewModel)

  GLOBAL APP STATE:
    - Truly app-wide client state (auth status, theme, user preferences)
    - Read/written by components across MULTIPLE features
    - Action: Global store (minimal — only truly global items)

  URL STATE:
    - Route parameters, query strings, hash fragments
    - Derived from the URL
    - Action: Router state / searchParams

  DERIVED STATE:
    - Computed from other state (totals, filtered lists, formatted values)
    - Should NOT be stored — should be computed on read
    - Action: Selectors, useMemo, computed properties

STEP 3 — IDENTIFY MISCLASSIFICATIONS
  For each state item:
    Current scope:    {what it is now}
    Correct scope:    {what it should be based on classification}
    Misclassified:    YES / NO
    Migration needed: YES / NO
    Priority:         HIGH (causes re-render storms) / MEDIUM / LOW

STEP 4 — MIGRATE (one state item at a time)
  a. Extract server state FIRST (biggest impact, lowest risk)
     - Replace global store entries with React Query / equivalent
     - Remove manual loading/error state (library handles it)
     - Remove manual cache invalidation (library handles it)
  b. Push local state DOWN next
     - Move component-specific state from global → component-local
  c. Create feature stores for feature state
     - One store per feature, not one giant store
  d. Minimize remaining global state
     - Only auth, theme, user preferences, i18n remain global
  e. Replace stored derived state with computed values
     - Delete stored computed values
     - Add selectors/memoization for derived values

STEP 5 — NORMALIZE DATA
  If state holds nested/denormalized data:
  - Store entities by ID: { [id]: entity }
  - Store relationships as ID references, not nested objects
  - Derive nested views from normalized data using selectors
```

---

## §T3 — ROUTE/NAVIGATION RESTRUCTURING

> **Targeted operation.** Use when navigation is chaotic, deep-linked incorrectly, or doesn't match user mental model.

### Web (React/Next.js)

```
STEP 1 — MAP CURRENT ROUTES
  List every route/page in the app:
    Route: {path}
      Page component: {file}
      Layout:         {shared layout if any}
      Auth required:  YES / NO
      Data needed:    {what data this page fetches}
      Children:       {nested routes if any}

STEP 2 — MAP USER JOURNEYS
  For each primary user flow:
    Flow: {name} (e.g., "Sign up → Dashboard → Profile → Settings")
      Steps: {ordered list of routes}
      Gaps:  {where the flow feels broken or illogical}

STEP 3 — DESIGN TARGET ROUTE STRUCTURE
  Group by:
    (auth)/        # Route group — unauthenticated pages
      login/
      register/
      forgot-password/
    (app)/         # Route group — authenticated pages
      dashboard/
      profile/
      settings/
    (public)/      # Route group — public pages
      about/
      pricing/

STEP 4 — IMPLEMENT
  a. Create route groups (parenthesized folders in Next.js App Router)
  b. Add shared layouts per group
  c. Implement auth guards at the layout level
  d. Add loading.tsx and error.tsx per route group
  e. Set up lazy loading for route-level code splitting
  f. Verify all existing links and redirects still work
```

### Android (Navigation Component)

```
STEP 1 — MAP CURRENT NAVIGATION
  List every Activity/Fragment and how they're reached:
    Screen: {name}
      Type:      Activity / Fragment
      Reached by: startActivity / FragmentTransaction / NavController
      Arguments:  {what data it receives}
      Back behavior: {what happens on back press}

STEP 2 — DESIGN NAVIGATION GRAPH
  Create hierarchical nav graph:
    nav_graph.xml (root)
      ├── auth_nav_graph.xml (nested)
      │   ├── LoginFragment (start)
      │   ├── RegisterFragment
      │   └── ForgotPasswordFragment
      ├── main_nav_graph.xml (nested)
      │   ├── HomeFragment (start)
      │   ├── ProfileFragment
      │   └── SettingsFragment
      └── feature_nav_graph.xml (nested)
          └── ...

STEP 3 — IMPLEMENT
  a. Create Fragment for each screen (if still using Activities)
  b. Create nav_graph XML files
  c. Define actions (transitions between destinations)
  d. Use SafeArgs for type-safe arguments
  e. Replace startActivity with navController.navigate()
  f. Replace FragmentTransaction with Navigation actions
  g. Test back stack behavior
```

---

## §T4 — SHARED CODE EXTRACTION

> **Targeted operation.** Extract genuinely shared code into proper shared modules.

```
STEP 1 — IDENTIFY CANDIDATES
  For each utility/helper/component in the codebase:
    grep -rl "{export name}" {src} --include="*.{ext}" | wc -l
  If count >= 3 → candidate for shared/
  If count == 2 → maybe (evaluate if both features are unrelated)
  If count == 1 → NOT shared, keep colocated

STEP 2 — CATEGORIZE
  Shared utilities:    shared/utils/     (pure functions)
  Shared components:   shared/components/ (UI elements)
  Shared hooks:        shared/hooks/     (reusable logic)
  Shared types:        shared/types/     (type definitions)
  Shared constants:    shared/constants/  (app-wide constants)
  Core infrastructure: core/             (auth, API, theme, i18n)

STEP 3 — EXTRACT
  For each candidate:
  a. Create target file in shared/{category}/
  b. Move the code
  c. Create re-export at old path
  d. Verify: grep all consumers still work
  e. Build + Test
  f. Commit: "refactor: extract {name} to shared/{category}/"

STEP 4 — ENFORCE DIRECTION
  shared/ NEVER imports from features/
  features/ CAN import from shared/
  This is one-directional. Violations = circular dependency risk.
```

---

## §T5 — FEATURE MODULE EXTRACTION

> **Targeted operation.** Extract a feature into a self-contained module.

```
STEP 1 — DEFINE FEATURE BOUNDARY
  Feature: {name}
    Screens/pages:   {list}
    Components:      {list}
    Hooks:           {list}
    State:           {list}
    Utils:           {list}
    Types:           {list}
    API calls:       {list}
    External deps:   {what it needs from outside itself}
    Public API:      {what other features need from it}

STEP 2 — CREATE FEATURE DIRECTORY
  features/{feature-name}/
    components/
    hooks/
    utils/
    types.ts
    (state/ or store/ if feature has its own state)
    (api/ if feature has its own API calls)

STEP 3 — MOVE FILES
  One file at a time. For each:
  a. Move file to feature directory
  b. Create re-export at old path
  c. Build + Test
  d. Commit

STEP 4 — INTERNALIZE DEPENDENCIES
  Move feature-specific dependencies INTO the feature directory:
  - If a utility is only used by this feature → move it inside
  - If a type is only used by this feature → move it inside
  - If a component is only used by this feature → move it inside

STEP 5 — DEFINE PUBLIC API
  The feature's public surface = what other features can import.
  Everything else is internal (convention-enforced or lint-enforced).
```

---

## §T6 — LAYER-TO-FEATURE MIGRATION

> **Targeted operation.** Convert from layer-based (components/, hooks/, utils/) to feature-based (features/auth/, features/profile/) organization.

```
STEP 1 — MAP FEATURES
  List every distinct feature in the app.
  A feature = a user-visible capability with its own screen/page/section.

STEP 2 — MAP FILES TO FEATURES
  For each file in components/, hooks/, utils/:
    File: {path}
      Belongs to feature: {feature name}
      OR shared across:   {list of features}
      OR orphan:          {no clear feature ownership}

STEP 3 — CREATE FEATURE DIRECTORIES
  features/
    {feature-a}/
    {feature-b}/
    ...
  shared/
    components/
    hooks/
    utils/

STEP 4 — MIGRATE ONE FEATURE AT A TIME
  For each feature (start with the most isolated):
  a. Create the feature directory structure
  b. Move feature-specific files from components/, hooks/, utils/
  c. Create re-exports at all old paths
  d. Build + Test
  e. Commit: "refactor: extract {feature} from layer structure to features/{feature}/"

STEP 5 — HANDLE SHARED CODE
  Files that belong to 2+ features:
  - If 3+ features: move to shared/{category}/
  - If exactly 2 features: evaluate — maybe one feature should own it

STEP 6 — HANDLE ORPHANS
  Files with no clear feature ownership:
  - Core infrastructure → core/
  - General utility → shared/utils/
  - Dead code → verify and delete

STEP 7 — REMOVE EMPTY DIRECTORIES
  Once all files migrated, delete empty components/, hooks/, utils/ directories.

STEP 8 — UPDATE ALL IMPORTS
  Follow §R9 protocol to update all import paths.
  Remove re-exports once all consumers updated.
```

---

## §T7 — BARREL FILE ELIMINATION

> **Targeted operation.** Remove index.ts/index.js barrel files and switch to direct imports.

```
STEP 1 — INVENTORY BARREL FILES
  find {src} -name "index.ts" -o -name "index.tsx" -o -name "index.js" -o -name "index.jsx"

STEP 2 — CLASSIFY EACH BARREL
  For each barrel file:
    Barrel: {path}
      Re-exports:  {count of re-exported items}
      Consumers:   {count of files importing from this barrel}
      Type:        APPLICATION (should remove) / PACKAGE_API (may keep) / TYPE_ONLY (may keep)
      Circular risk: {does this barrel create or risk creating import cycles?}

STEP 3 — REMOVE ONE BARREL AT A TIME
  For each APPLICATION barrel (start with leaf directories, work up):
  a. List all consumers: grep -rn "from '{barrel directory}'" {src}
  b. For each consumer:
     - Identify which specific exports they use
     - Replace barrel import with direct file import:
       BAD:  import { Button, Icon } from '@/components'
       GOOD: import { Button } from '@/components/button'
             import { Icon } from '@/components/icon'
  c. Delete the barrel file
  d. Build + Test
  e. Commit: "refactor: remove barrel file {path}, switch to direct imports"

STEP 4 — UPDATE LINT CONFIG
  Add ESLint rule to prevent new barrel files:
  "no-restricted-imports": ["error", {
    "patterns": ["*/index", "*/index.*"]
  }]
```

---

## §T8 — CONVENTION UNIFICATION

> **Targeted operation.** Make naming, patterns, and conventions consistent across the codebase.

```
STEP 1 — INVENTORY CONVENTIONS
  For each convention type (file naming, component naming, state pattern, etc.):
    Convention: {type}
      Variant A: {pattern} — used in: {files}
      Variant B: {pattern} — used in: {files}
      Variant C: {pattern} — used in: {files}

STEP 2 — CHOOSE CANONICAL (ask user if unclear)
  For each convention with multiple variants:
    Winner:     {which variant}
    Reason:     {why — usually "most common" or "best practice" or "user preference"}
    Source:     {which existing file exemplifies this convention}

STEP 3 — UNIFY ONE CONVENTION AT A TIME
  For each convention type:
  a. List all deviations from the canonical pattern
  b. Update each deviation
  c. Build + Test
  d. Commit: "refactor: unify {convention type} to {canonical pattern}"

  Order:
  1. File naming (renames — most visible, sets tone)
  2. Export style (named vs default)
  3. Component patterns (hooks, state, props)
  4. Error handling patterns
  5. Import style (absolute vs relative, aliases)
  6. Code formatting (if not handled by Prettier/formatter)
```

---

## FINAL NOTES FOR CLAUDE

### What Makes This Skill Different from app-audit

- **app-audit** finds problems and documents them
- **app-restructuring** fixes structural problems through live code changes
- They complement each other: audit first, restructure based on findings
- This skill CHANGES CODE. app-audit only READS code

### The #1 Rule

**Every change must be verifiable and reversible.** If you can't verify it (no build, no tests, no manual check), don't make it. If you can't reverse it (no git, no re-exports, no rollback plan), don't make it.

### When This Skill Activates Alongside Other Skills

- If **scope-context** is relevant (e.g., "restructure all buttons"): read scope-context FIRST for the Concept Scaffold protocol, then return here for the restructuring methodology
- If **app-audit** was recently run: load audit findings and skip §R1–§R3
- If **design-aesthetic-audit** was recently run: cross-reference design findings with structural diagnosis
- If **art-direction-engine** is active: restructuring must preserve design system integrity — coordinate with art direction constraints

### Emergency Abort

If at any point during live execution:
1. A WORKING feature breaks and cannot be immediately fixed
2. The build fails and the cause is unclear
3. The user says "stop" or "undo"

→ Immediately execute §R14 Rollback Protocol
→ Inform the user what happened
→ Reassess the migration plan before continuing
