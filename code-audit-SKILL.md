---
name: code-audit
description: >
  Deep code quality audit, fix, and improvement — companion skill to app-audit.
  Handles ALL code-touching concerns: format, naming, dead code, duplication,
  optimization, architecture, logic correctness, state management, error handling,
  async/concurrency, type safety, and cross-dimensional failure chains.
  Universal core with JS/React and Kotlin/Android stack modules.
  Trigger on: "audit my code", "code review", "code quality", "fix my code",
  "clean up code", "refactor", "optimize code", "check code health",
  "code standards", "naming review", "dead code", "duplication check",
  "performance audit code", "error handling review", "state management audit",
  "async patterns review", "type safety check", any request from app-audit
  delegating code work (§I, §L1-L2, §A1-A7, §B, §D code paths),
  or when a user shares source files and wants code-level analysis.
  Always use this skill for ANY code quality concern even if not explicitly
  called an "audit" — includes "why is my code slow", "is this code good",
  "review this function", "check for bugs", "improve this code".
---

# Code Quality Audit — Companion Skill

> **For Claude:** This skill handles all code-touching concerns. It operates standalone OR as a companion to `app-audit-SKILL.md`. When app-audit delegates code work (categories §A, §B, §I, §L1-L2, §D code paths), this skill takes over with deeper, more granular coverage.

---

## TABLE OF CONTENTS

| Code | Section | What It Does |
|------|---------|-------------|
| — | **ROUTING** | Determines mode: standalone vs companion, scope selection |
| §0 | **Code Context Block** | Tech stack, constraints, conventions — inherited or filled |
| §LAWS | **Iron Laws** | Governing rules for code auditing |
| §PRE | **Pre-Flight** | Mandatory steps before any finding |
| §D1 | **Dim 1: Format & Conventions** | Naming, casing, imports, comments, magic numbers |
| §D2 | **Dim 2: Health & Hygiene** | Dead code, duplication, debt, smells, deps, tests |
| §D3 | **Dim 3: Optimization** | Algorithms, memoization, bundle, memory, render, startup |
| §D4 | **Dim 4: Structure & Architecture** | SRP, modules, components, file org, state architecture |
| §D5 | **Dim 5: Logic & Correctness** | Business rules, types, precision, null, state machines |
| §D6 | **Dim 6: State & Data Integrity** | SSOT, derived state, schema, mutations, closures |
| §D7 | **Dim 7: Error Handling** | Try/catch, boundaries, retry, network, crash reporting |
| §D8 | **Dim 8: Async & Concurrency** | Races, cancellation, ordering, coroutines, cleanup |
| §CROSS | **Cross-Cutting Chains** | Compound failures spanning multiple dimensions |
| §FMT | **Finding Format** | Template for every finding |
| §DLVR | **Deliverables** | Required outputs |

---

## ROUTING

### Companion Mode (delegated from app-audit)

When app-audit delegates code work:
1. Inherit §0 from app-audit — do NOT re-ask
2. Run only the delegated dimensions
3. Output findings in app-audit's format (§V) with dimension cross-refs
4. Return findings to app-audit for the Summary Dashboard

### Standalone Mode

When invoked directly:
1. Fill §0 (lightweight — extract from code, ask only what's missing)
2. Ask which dimensions to run, or default to all
3. Output findings + deliverables independently

### Dimension Selection

| User Says | Run These |
|-----------|-----------|
| "audit my code" / "code review" / "full code audit" | All 8 dimensions |
| "fix naming" / "clean up format" | §D1 only |
| "dead code" / "code health" / "duplication" | §D2 only |
| "optimize" / "performance" / "too slow" | §D3 only |
| "refactor" / "restructure" / "architecture" | §D4 only |
| "check logic" / "verify correctness" / "find bugs" | §D5 only |
| "state management" / "data integrity" | §D6 only |
| "error handling" / "resilience" | §D7 only |
| "async" / "race conditions" / "concurrency" | §D8 only |
| "full deep code audit" | All 8 + §CROSS with maximum depth |

---

## §0. CODE CONTEXT BLOCK

> Extract from code first. Ask user only for what cannot be extracted. In companion mode, inherit from app-audit's §0.

```yaml
# ─── STACK ──────────────────────────────────────────
Language:       # e.g. "JavaScript (ES2022)" / "TypeScript 5.x" / "Kotlin 1.9"
Framework:      # e.g. "React 18" / "Next.js 14" / "Android (XML Views)" / "Compose"
State:          # e.g. "useState + Context" / "Zustand" / "ViewModel + StateFlow"
Build:          # e.g. "Vite 5" / "Gradle 8.x" / "None (CDN)"
Linting:        # e.g. "ESLint + Prettier" / "ktlint + detekt" / "None"
Testing:        # e.g. "Jest + RTL" / "JUnit5 + MockK" / "None"

# ─── CONVENTIONS (extract from code if not stated) ──
Naming Style:   # Detected casing patterns, prefix conventions
Import Order:   # Detected grouping pattern
Error Pattern:  # How errors are currently handled (try/catch, Result, etc.)
State Pattern:  # How state is currently managed

# ─── CONSTRAINTS ────────────────────────────────────
Architecture:   # e.g. "Single file" / "Feature-based" / "MVVM"
No TypeScript:  # If JS-only project, note this — affects type safety findings
Min SDK:        # Android: affects API availability findings

# ─── SCOPE ──────────────────────────────────────────
Files to Audit: # "All" / specific paths
Out of Scope:   # e.g. "node_modules" / "generated code" / "third-party"
```

**Stack Detection Protocol:**

```
1. Check for package.json → JS/TS project
   - Read "dependencies" for framework (react, next, vue)
   - Read "devDependencies" for tooling (eslint, prettier, jest, vitest)
   - Read tsconfig.json for TS strictness flags

2. Check for build.gradle / build.gradle.kts → Android/Kotlin project
   - Read compileSdk, minSdk, targetSdk
   - Read dependencies for architecture (lifecycle, navigation, room, hilt)
   - Check for detekt/ktlint plugins

3. Detect conventions from code:
   Grep(pattern: "(const|let|var|function|class) ", glob: "*.{js,ts,jsx,tsx}") → JS naming
   Grep(pattern: "(fun |val |var |class |object )", glob: "*.kt") → Kotlin naming
```

---

## §LAWS — IRON LAWS OF CODE AUDITING

### Law 1 — Specificity
Every finding names the exact function, variable, line, file. "Improve naming" is not a finding. "`const d = new Date()` at `utils.js:47` — `d` is non-descriptive; rename to `createdDate` or `expirationDate` based on intent" is a finding.

### Law 2 — Bugs Before Style
A function with a logic bug AND bad naming: fix the bug first. Style improvements are separate, lower-priority findings.

### Law 3 — Detect, Don't Assume
Every finding must cite code evidence. `[CODE: file:line]` for confirmed. `[LIKELY]` for strong inference. `[THEORETICAL]` for architectural risk. Never fabricate line numbers.

### Law 4 — Stack Awareness
Apply JS/React checks to JS/React code. Apply Kotlin/Android checks to Kotlin code. Never flag React patterns in Kotlin or vice versa.

### Law 5 — Minimum Footprint
Recommend the smallest safe change. A 2-line fix beats a refactor that happens to fix the problem. Scope creep in fixes creates regressions.

### Law 6 — Cross-Dimensional Awareness
A finding in one dimension must trigger investigation of related dimensions. Missing null check (§D5) → check error handling (§D7) → check state management (§D6) for the same code path.

### Law 7 — Convention Respect
If the codebase has an established pattern (even if non-standard), recommend consistency with that pattern unless it causes bugs. Switching naming conventions mid-codebase is worse than a slightly non-standard convention applied consistently.

### Law 8 — Compound Chain Priority
Findings that form cross-dimensional chains (§CROSS) are escalated above their individual severity. A LOW validation gap that chains into a HIGH display error is HIGH.

---

## §PRE — PRE-FLIGHT CHECKLIST

> Execute BEFORE writing any finding.

```
[ ] Read entire codebase (or scoped files)
    → Claude Code: Agent(Explore) for large codebases
    → Claude.ai: view tool on uploaded files

[ ] Detect stack → fill §0
    → Grep package.json / build.gradle / file extensions

[ ] Detect existing conventions
    → Sample 10+ functions for naming patterns
    → Sample import blocks for ordering patterns
    → Sample error handling for try/catch patterns

[ ] Identify hot paths (most-changed, most-imported files)
    → These get +1 severity for all findings

[ ] Build file inventory with LOC counts
    → Files >300 LOC are god-component candidates (§D4)
    → Files >500 LOC are near-certain god-components

[ ] Announce: detected stack, convention patterns, file count, planned dimensions
```

---

## DIMENSION PROTOCOLS

> All 8 dimensions + cross-cutting chains are defined below in this file. For each dimension you audit:
> 1. Go to the relevant section (§D1–§D8)
> 2. Follow the checklist in order
> 3. For each check: run the grep/detection, evaluate against criteria, write finding if issue found
> 4. After all dimensions: run §CROSS for cross-dimensional chains

---

## §FMT — FINDING FORMAT

Every finding uses this exact template:

```
F-{NNN} [{SEVERITY}] [{CONFIDENCE}] — {Title}

Dimension:    §D{N} — {Dimension Name}
Location:     {file}:{line} in {function/component}
Stack:        {JS/Kotlin/Universal}

Issue:
  {What is wrong. Names the exact variable, function, pattern.
   Never generic. Always references specific code.}

Evidence:
  {Code snippet or grep result demonstrating the issue.}

Impact:
  {What breaks, degrades, or compounds because of this.
   Concrete scenario — not abstract risk.}

Fix:
  {Specific code change. Before → After where feasible.
   Smallest safe change that resolves the issue.}

Effort:       Trivial (<5 min) | Small (<1 hr) | Medium (<1 day) | Large (>1 day)
Risk:         {What could break if fix applied incorrectly}
Chain:        {Cross-ref to related findings in other dimensions, if any}
```

### Severity Scale

| Level | Meaning | Examples |
|-------|---------|---------|
| **CRITICAL** | Crash, data corruption, security hole | Swallowed CancellationException, mutation of state, unhandled null→crash |
| **HIGH** | Likely bug, significant correctness risk | Stale closure, missing error handling, || instead of ??, race condition |
| **MEDIUM** | Maintainability/reliability concern | Code duplication, high complexity, inconsistent naming, missing types |
| **LOW** | Style, minor improvement | Format inconsistency, verbose import, minor naming |
| **NIT** | Purely cosmetic | Trailing whitespace, quote style |

**Modifiers:** Hot-path code (+1), shared utility with wide blast radius (+1), code handling PII/financial (+1).

### Confidence Scale

| Tag | Meaning |
|-----|---------|
| `[CONFIRMED]` | Verified by reading code and tracing execution |
| `[LIKELY]` | Strong code evidence, near-certain |
| `[THEORETICAL]` | Architectural risk, needs runtime verification |

---

## §DLVR — DELIVERABLES

### Required (always)

| Deliverable | Contents |
|-------------|---------|
| **Code Context Record** | §0 filled — stack, conventions, constraints |
| **Findings List** | All findings in §FMT format, grouped by severity |
| **Quick Wins** | Top 10 highest (severity × impact) / effort findings |

### Full Audit (all dimensions)

| Deliverable | Contents |
|-------------|---------|
| **Dimension Scorecard** | Per-dimension: finding count by severity, health grade (A-F) |
| **Cross-Cutting Chain Map** | Every compound chain documented with escalated severity |
| **Convention Violations Summary** | Detected conventions vs violations — consolidation plan |
| **Remediation Roadmap** | IMMEDIATE → SHORT-TERM → MEDIUM-TERM prioritized fix list |

### Companion Mode (delegated from app-audit)

| Deliverable | Contents |
|-------------|---------|
| **Findings in app-audit format** | Compatible with app-audit §V for merge into Summary Dashboard |
| **Dimension cross-refs** | Map code findings to app-audit categories (§A, §B, §I, §L) |

---

## EXECUTION PLAN

### Part Structure (Full Audit)

| Part | Dimensions | Focus |
|------|-----------|-------|
| **P1** | §PRE + §D1 + §D2 | Pre-flight, Format, Health — foundational scan |
| **P2** | §D5 + §D6 | Logic, State — correctness layer |
| **P3** | §D7 + §D8 | Errors, Async — resilience layer |
| **P4** | §D3 + §D4 | Optimization, Architecture — structural layer |
| **P5** | §CROSS + Summary | Cross-cutting chains, scorecard, roadmap |

### Audit Priority Order (for maximum bug-finding yield)

1. Error handling (§D7) — highest bug density
2. State management (§D6) — stale closures, races, mutations
3. Type/null safety (§D5) — coercion, missing checks
4. Async patterns (§D8) — cancellation, ordering
5. Logic correctness (§D5) — edge cases, boundaries
6. Performance (§D3) — re-renders, memory, N+1
7. Naming/readability (§D1) — misleading names cause bugs
8. Health (§D2) — dead code, duplication, debt
9. Architecture (§D4) — coupling, cohesion

---

## DIMENSION SUMMARY DASHBOARD

```
CODE QUALITY AUDIT — {App/Module Name}

STACK:      {from §0}
FILES:      {count} files, {total LOC} lines
DIMENSIONS: {which were audited}

SCORECARD:
  §D1 Format:       {grade A-F} — {N} findings ({crit}/{high}/{med}/{low})
  §D2 Health:        {grade A-F} — {N} findings
  §D3 Optimization:  {grade A-F} — {N} findings
  §D4 Structure:     {grade A-F} — {N} findings
  §D5 Logic:         {grade A-F} — {N} findings
  §D6 State:         {grade A-F} — {N} findings
  §D7 Errors:        {grade A-F} — {N} findings
  §D8 Async:         {grade A-F} — {N} findings

CHAINS:     {N} cross-dimensional compound chains identified
TOTAL:      {N} findings — {crit} CRITICAL, {high} HIGH, {med} MEDIUM, {low} LOW

TOP 5 QUICK WINS:
  1. F-{id} {title} — Effort: {X} — Fixes: {what it resolves}
  2. ...

REMEDIATION ROADMAP:
  IMMEDIATE (before next commit):
    [ ] F-{id} ...
  SHORT-TERM (this sprint):
    [ ] F-{id} ...
  MEDIUM-TERM (next 1-3 months):
    [ ] F-{id} ...
```

### Grading Scale

| Grade | Criteria |
|-------|---------|
| **A** | 0 CRITICAL, 0 HIGH, ≤2 MEDIUM |
| **B** | 0 CRITICAL, ≤2 HIGH, ≤5 MEDIUM |
| **C** | 0 CRITICAL, ≤5 HIGH, any MEDIUM |
| **D** | ≤2 CRITICAL or >5 HIGH |
| **F** | >2 CRITICAL |

---

## APP-AUDIT CATEGORY MAPPING

When returning findings to app-audit, map dimensions to its categories:

| Code Audit Dimension | App-Audit Category |
|---------------------|-------------------|
| §D1 Format | §I2 Naming, §L2 Standardization |
| §D2 Health | §I1 Dead Code, §I4 Duplication, §I6 Docs, §O3 Debt |
| §D3 Optimization | §L1 Optimization, §D1-D5 Performance |
| §D4 Structure | §I5 Architecture, §O2 Feature Addition Risk |
| §D5 Logic | §A1-A7 Domain Logic, §B3 Validation |
| §D6 State | §B1-B6 State & Data |
| §D7 Errors | §I3 Error Handling |
| §D8 Async | §A6 Async Patterns |
| §CROSS | §VIII Cross-Cutting Concern Map |
## §D1 — Format & Conventions

> **Purpose:** Detect naming violations, casing inconsistencies, import disorder, comment problems, magic numbers, and convention drift. These are LOW-MEDIUM severity individually but compound into readability debt that causes real bugs (misleading names → wrong usage → logic errors).

---

### D1.1 — NAMING QUALITY

#### Detection Protocol

```
SCAN 1 — Non-descriptive names (single-letter outside tiny loops):
  JS:     Grep(pattern: "(const|let|var)\s+[a-z]\s*=", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "(val|var)\s+[a-z]\s*[=:]", glob: "*.kt")
  FILTER: Exclude loop iterators (i, j, k, e in catch, _ for unused)
  SEVERITY: MEDIUM if in business logic, LOW if in utility/test

SCAN 2 — Misleading names (name implies different behavior):
  Manual review: functions named get* that mutate state, set* that return values,
  is* that aren't boolean, handle* that don't handle events
  SEVERITY: HIGH — misleading names cause bugs

SCAN 3 — Unclear abbreviations:
  Grep(pattern: "[a-z]{1,3}[A-Z]|_[a-z]{1,3}_", glob: "*.{js,ts,kt}")
  CHECK: Would a new developer understand this without context?
  SEVERITY: MEDIUM
```

#### Casing Rules

| Element | JS/TS | Kotlin | Violation Severity |
|---------|-------|--------|-------------------|
| Variables/functions | camelCase | camelCase | MEDIUM |
| Classes/components | PascalCase | PascalCase | MEDIUM |
| Constants | SCREAMING_SNAKE | SCREAMING_SNAKE (`const val`) | LOW |
| Files (components) | PascalCase | PascalCase (match class) | LOW |
| Files (utilities) | kebab-case | PascalCase | LOW |
| Enum values | PascalCase or SCREAMING_SNAKE | PascalCase | LOW |

```
DETECT casing violations:
  JS classes:     Grep(pattern: "class [a-z]", glob: "*.{js,ts}")
  JS components:  Grep(pattern: "function [a-z].*return.*<", glob: "*.{jsx,tsx}")
  Kotlin classes: Grep(pattern: "class [a-z]", glob: "*.kt")
  Constants:      Grep(pattern: "const\s+[a-z].*=\s*['\"]|const\s+[a-z].*=\s*\d", glob: "*.{js,ts}")
                  — filter out: destructuring, function assignments
```

#### Boolean Naming

```
CHECK: All boolean variables/props/functions use is/has/can/should prefix
  JS:     Grep(pattern: "(const|let|var)\s+\w+\s*=\s*(true|false)", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "(val|var)\s+\w+\s*[:=]\s*Boolean|=\s*(true|false)", glob: "*.kt")
  EVALUATE: Does the name start with is/has/can/should/will?
  SEVERITY: MEDIUM

CHECK: No negative booleans
  Grep(pattern: "(is|has|can|should)(Not|n't|No|Non)", glob: "*.{js,ts,kt}")
  FIX: isNotDisabled → isEnabled, hasNoErrors → isValid
  SEVERITY: MEDIUM
```

#### Event Handler Naming

```
CHECK (React): Props use on-prefix, handlers use handle-prefix
  Grep(pattern: "handle[A-Z].*=.*\(", glob: "*.{jsx,tsx}") → should exist
  Grep(pattern: "on[A-Z].*=.*\{(?!handle)", glob: "*.{jsx,tsx}") → potential violation
  SEVERITY: LOW

CHECK (Kotlin): Callback params use on-prefix
  Grep(pattern: ":\s*\(\)\s*->\s*Unit", glob: "*.kt") → verify naming
  SEVERITY: LOW
```

---

### D1.2 — IMPORT ORDERING

#### JS.TS Standard Order

```
Required grouping (blank line between groups):
  1. Side-effect imports (import 'polyfill')
  2. Built-in/Node modules (import fs from 'fs')
  3. External packages (import React from 'react')
  4. Internal/aliased (@/ imports)
  5. Parent (../ imports)
  6. Sibling (./ imports)
  7. Styles (.css, .scss)
  8. Type-only imports

DETECT: Check first 20 files for consistent import order
  Grep(pattern: "^import ", glob: "*.{js,ts,jsx,tsx}") → sample and evaluate
  SEVERITY: LOW (auto-fixable with eslint-plugin-import/order or simple-import-sort)
```

#### Kotlin Standard Order

```
Single ASCII-sorted block, no wildcards, no blank lines between imports.
  DETECT wildcards: Grep(pattern: "import .*\.\*$", glob: "*.kt")
  SEVERITY: LOW (auto-fixable with ktlint)
```

---

### D1.3 — MAGIC NUMBERS

```
DETECT unexplained numeric literals:
  JS:     Grep(pattern: "[^0-9.][0-9]{2,}[^0-9dpx%]", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "[^0-9.][0-9]{2,}[^0-9dpsp]", glob: "*.kt")
  FILTER: Exclude 0, 1, -1, 100 (percentage), common CSS values
  EVALUATE: Is this number explained by context or a named constant?

FIX: Extract to named constant at appropriate scope
  // BAD:  if (retries > 3) { ... }
  // GOOD: const MAX_RETRIES = 3; if (retries > MAX_RETRIES) { ... }

SEVERITY: MEDIUM for business logic, LOW for layout/styling values
```

---

### D1.4 — COMMENT QUALITY

```
SCAN 1 — Commented-out code:
  JS:     Grep(pattern: "^\s*//\s*(const|let|var|function|return|if|for|import)", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "^\s*//\s*(val|var|fun|return|if|for|import|class)", glob: "*.kt")
  SEVERITY: MEDIUM — delete it, VCS preserves history

SCAN 2 — TODO/FIXME without ticket:
  Grep(pattern: "(TODO|FIXME|HACK|XXX|TEMP)", glob: "*.{js,ts,kt,jsx,tsx}")
  CHECK: Does it include a ticket reference or author?
  SEVERITY: MEDIUM if no ticket, LOW if tracked

SCAN 3 — Stale/lying comments:
  Manual review: comments that describe what code USED TO do
  SEVERITY: HIGH — lying comments cause bugs

SCAN 4 — "What" comments on obvious code:
  // Increment counter ← useless
  // Apply 21% VAT as per EU Directive 2006/112/EC ← useful (explains WHY)
  SEVERITY: NIT
```

---

### D1.5 — FILE ORGANIZATION

#### React Component Internal Order

```
CHECK: Components follow consistent internal ordering:
  1. Type definitions/interfaces
  2. Constants/static data
  3. useState declarations
  4. useRef declarations
  5. useContext / custom hooks
  6. useMemo / useCallback
  7. useEffect
  8. Event handlers (handle*)
  9. Helper/render functions
  10. Return JSX

DETECT: Sample 5+ components. Are they consistent with each other?
  Inconsistency between components = MEDIUM
  No discernible pattern = MEDIUM
```

#### Kotlin Class Layout

```
CHECK: Classes follow Kotlin official ordering:
  1. Property declarations + initializer blocks
  2. Secondary constructors
  3. Method declarations
  4. Companion object (last)

DETECT: Grep(pattern: "companion object", glob: "*.kt") → verify it's at bottom
SEVERITY: LOW
```

---

### D1.6 — CONVENTION DRIFT

```
PROTOCOL: Sample 10+ similar constructs across codebase.
  Count how many follow Pattern A vs Pattern B.

If >80% follow one pattern → the minority is a violation
If 50-80% → flag as "convention not established" and recommend standardization
If <50% → flag as "no convention" — recommend establishing one

Examples to check:
  - String quotes (single vs double)
  - Trailing commas (present vs absent)
  - Semicolons (present vs absent in JS)
  - Arrow functions vs function declarations
  - Error handling patterns (try/catch shape)

SEVERITY: LOW for cosmetic, MEDIUM for behavioral patterns
```
## §D2 — Health & Hygiene

> **Purpose:** Detect dead code, duplication, technical debt, code smells, dependency risks, test gaps, and maintenance traps. These findings represent the codebase's long-term sustainability.

---

### D2.1 — DEAD CODE

#### Detection Protocol

```
SCAN 1 — Dev artifacts in production:
  JS:     Grep(pattern: "console\.(log|debug|info|table|dir)\(", glob: "*.{js,ts,jsx,tsx}")
          Grep(pattern: "\bdebugger\b", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "println\(|Log\.(d|v|i)\(", glob: "*.kt")
  SEVERITY: HIGH for production code (info leakage), LOW for dev-only paths
  FIX: Remove, or gate behind __DEV__ / BuildConfig.DEBUG

SCAN 2 — Unused imports:
  JS:     Grep(pattern: "^import .* from", glob: "*.{js,ts,jsx,tsx}")
          → Cross-reference: is the imported name used in the file?
  Kotlin: IDE/ktlint flags these. Grep(pattern: "^import ", glob: "*.kt")
  SEVERITY: LOW (auto-fixable)

SCAN 3 — Unused functions/variables:
  JS:     Grep(pattern: "^(export )?(function|const|let) \w+", glob: "*.{js,ts,jsx,tsx}")
          → Cross-reference: is it imported/called anywhere else?
          Use: Grep(pattern: "import.*{.*FUNCTION_NAME.*}", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "private (fun|val|var) \w+", glob: "*.kt")
          → If private, check usage within same file only
  SEVERITY: MEDIUM — dead code confuses, bloats bundle

SCAN 4 — Commented-out code blocks (>2 lines):
  JS:     Grep(pattern: "^\s*/\*[\s\S]*?\*/", glob: "*.{js,ts}") — multi-line comments containing code
          Grep(pattern: "^\s*//.*[=;{}()\[\]]", glob: "*.{js,ts,jsx,tsx}") — single-line code comments
  Kotlin: Same patterns adapted
  SEVERITY: MEDIUM
  FIX: Delete. VCS preserves history.

SCAN 5 — Unreachable code:
  Grep(pattern: "return [^;]*;\n\s+\w", glob: "*.{js,ts}") — code after return
  SEVERITY: MEDIUM
```

---

### D2.2 — CODE DUPLICATION

#### Detection Protocol

```
SCAN 1 — Near-identical functions:
  Manual review: Find functions with same structure, slightly different values
  CHECK: Are these TRUE duplicates (same concept, same reason to change)?
         Or ACCIDENTAL similarity (will diverge)?
  Rule of Three: Flag on 3rd occurrence, not 2nd

SCAN 2 — Copy-paste divergence:
  Find similar code blocks → check if one was updated and the other wasn't
  THIS is the dangerous duplication — silent inconsistency
  SEVERITY: HIGH (for diverged copies), MEDIUM (for identical copies)

SCAN 3 — Constant duplication:
  Grep(pattern: "['\"](SPECIFIC_VALUE)['\"]", glob: "*.{js,ts,kt}")
  → Count occurrences. Same string literal >3 times = extract to constant
  SEVERITY: MEDIUM

SCAN 4 — Pattern duplication (React):
  Find components with >70% structural similarity
  → Extract shared component with props, or use composition
  SEVERITY: MEDIUM

ABSTRACTION WARNING:
  "Duplication is far cheaper than the wrong abstraction." — Sandi Metz
  If an existing abstraction has >3 boolean params controlling behavior,
  it may be the WRONG abstraction. Recommend re-introducing duplication
  before re-extracting genuine patterns.
  SEVERITY of wrong abstraction: HIGH
```

---

### D2.3 — TECHNICAL DEBT CLASSIFICATION

```
For each identified debt item, classify:

INERT DEBT — stable, rarely-modified code
  Cost stays roughly constant over time
  Priority: LOW unless blocking a planned feature
  Example: Slightly verbose utility function that works

COMPOUNDING DEBT — frequently-changed code, cost GROWS
  Every new feature built on top deepens the coupling
  Priority: HIGH — fix before cost multiplies
  Mark with ⏱ COMPOUNDS

  Compounding indicators:
  - Foundation coupling: other features built directly on it
  - Terminology divergence: same concept, different names in different files
  - Schema without migration: stored data with no version field
  - Test debt on hot code: frequently-modified, never tested
  - Magic constants without registry: domain values scattered
  SEVERITY: MEDIUM base, +1 if on hot path
```

---

### D2.4 — CODE SMELLS

#### Detection Thresholds

```
GOD COMPONENT/CLASS:
  Grep file sizes → list files >300 LOC
  React: count useState hooks per component. >5 = smell
  React: count props. >10 = smell
  Kotlin: count functions per class. >20 = smell
  SEVERITY: HIGH

LONG FUNCTION/METHOD:
  Functions >50 LOC (JS) or >60 LOC (Kotlin) warrant review
  Functions >100 LOC = definite smell
  SEVERITY: MEDIUM

HIGH CYCLOMATIC COMPLEXITY:
  >10 branches in one function = hard to test and reason about
  >15 = near-certain maintenance trap
  COUNT: if/else + switch cases + ternary + && short-circuit + catch blocks
  SEVERITY: MEDIUM (>10), HIGH (>15)

LONG PARAMETER LIST:
  >4 parameters = introduce parameter object or builder
  SEVERITY: MEDIUM

DEEP NESTING:
  >4 levels of indentation in one function
  Grep(pattern: "^\s{16,}", glob: "*.{js,ts,kt}") — 4+ tabs/levels
  FIX: Early return, extract function, guard clauses
  SEVERITY: MEDIUM
```

---

### D2.5 — DEPENDENCY HEALTH

```
SCAN 1 — Outdated dependencies:
  JS:     Run: npm outdated (or check package.json vs latest)
  Kotlin: Check build.gradle dependency versions vs latest
  SEVERITY: LOW (minor behind), MEDIUM (major behind), HIGH (known CVEs)

SCAN 2 — Security vulnerabilities:
  JS:     npm audit --audit-level=high
  Kotlin: Check Gradle dependency scan / Snyk
  SEVERITY: CRITICAL for known exploits, HIGH for known CVEs

SCAN 3 — Unused dependencies:
  JS:     depcheck — lists packages in package.json not imported anywhere
  Kotlin: Manual check — dependencies in build.gradle not imported in code
  SEVERITY: LOW (bloat)

SCAN 4 — Heavy dependencies with lighter alternatives:
  moment (72KB) → dayjs (2KB) or date-fns
  lodash (full) → lodash-es (tree-shakeable) or native methods
  axios → fetch (native, no dependency)
  SEVERITY: MEDIUM for bundle impact

SCAN 5 — Abandoned dependencies:
  No release >18 months, single maintainer inactive, open CVEs unpatched
  SEVERITY: MEDIUM-HIGH
```

---

### D2.6 — TEST COVERAGE GAPS

```
IDENTIFY critical paths without tests:
  1. Business logic functions (calculations, transformations, validations)
  2. State transitions (reducers, state machines)
  3. Data formatting (display functions, locale handling)
  4. Error handling paths (what happens on failure?)
  5. Edge cases in hot paths (empty arrays, null inputs, boundary values)

FOR EACH untested critical path:
  SEVERITY: HIGH if business logic, MEDIUM if utility, LOW if pure UI

TESTING STRATEGY ASSESSMENT:
  Check test file existence:
    JS:     Glob(pattern: "**/*.{test,spec}.{js,ts,jsx,tsx}")
    Kotlin: Glob(pattern: "**/test/**/*.kt")
  
  Count test files vs source files
  Ratio <0.3 = significant test gap
  Ratio <0.1 = critical test gap
  SEVERITY: HIGH for critical gap, MEDIUM for significant gap
```

---

### D2.7 — MAINTENANCE TRAPS

```
TRAP 1 — Hidden side effects:
  Functions named get*/fetch*/calculate* that also WRITE state, storage, or cache
  DETECT: Grep for setState/localStorage/dispatch/emit inside get* functions
  SEVERITY: HIGH

TRAP 2 — Order-dependent initialization:
  Code that only works if functions called in specific sequence
  No enforcement mechanism (just "happens to work")
  DETECT: Manual review of initialization flows
  SEVERITY: HIGH

TRAP 3 — Load-bearing magic values:
  Constants whose specific values are critical but non-obvious
  Changing them "slightly" breaks unrelated functionality
  DETECT: Constants used in >3 files with no documentation
  SEVERITY: MEDIUM

TRAP 4 — Implicit coupling:
  Two modules that read/write the same global state with no coordination
  DETECT: Grep for shared state keys accessed from multiple files
  SEVERITY: HIGH

TRAP 5 — Kotlin lateinit traps:
  lateinit var without isInitialized check before access
  DETECT: Grep(pattern: "lateinit var", glob: "*.kt")
          Cross-ref: Grep(pattern: "::.*\.isInitialized", glob: "*.kt")
  SEVERITY: HIGH if no isInitialized check exists
```
## §D3 — Optimization & Performance

> **Purpose:** Detect algorithm inefficiency, over/under-memoization, bundle bloat, memory leaks, render bottlenecks, and startup problems. Performance findings are HIGH severity on hot paths, MEDIUM elsewhere.

---

### D3.1 — ALGORITHM EFFICIENCY

```
SCAN 1 — O(n²) patterns (find/filter/includes inside map/forEach):
  JS: Grep(pattern: "\.(map|forEach|filter|reduce)\(.*\.(find|filter|includes|indexOf)\(", glob: "*.{js,ts,jsx,tsx}")
  Also check multi-line: find .map() calls, then look inside for .find()/.includes()
  FIX: Build Map/Set index first, then iterate once
  SEVERITY: HIGH on data >100 items, MEDIUM otherwise

SCAN 2 — Spread-in-reduce O(n²) allocations:
  Grep(pattern: "\.reduce\(.*\{\.\.\.acc", glob: "*.{js,ts,jsx,tsx}")
  FIX: Use Object.fromEntries(), Map, or mutable accumulator inside reduce
  SEVERITY: MEDIUM

SCAN 3 — Repeated lookups without caching:
  Same function called with same args in tight loop or render cycle
  FIX: Cache result in variable before loop / useMemo for render
  SEVERITY: MEDIUM

SCAN 4 — Kotlin collection chain efficiency:
  Grep(pattern: "\.(filter|map|flatMap)\(.*\)\.(filter|map|flatMap)\(", glob: "*.kt")
  CHECK: Chain of 3+ operations on a List → should use .asSequence()
  SEVERITY: MEDIUM on large data sets

SCAN 5 — N+1 patterns:
  Loop that makes individual async call per item instead of batch
  Grep(pattern: "for.*\{[\s\S]*await\s+fetch", glob: "*.{js,ts}")
  FIX: Batch request or Promise.all()
  SEVERITY: HIGH
```

---

### D3.2 — MEMOIZATION

#### React Memoization Audit

```
SCAN 1 — Unnecessary useMemo/useCallback:
  Find useMemo wrapping cheap operations (addition, string concatenation, simple filter)
  Overhead of memo > cost of recomputation = net negative
  SEVERITY: LOW

SCAN 2 — Missing memoization on expensive operations:
  Sorting, filtering large arrays (>100 items), complex transformations
  inside component body without useMemo
  CHECK: Is this called on every render? Is input stable?
  SEVERITY: MEDIUM

SCAN 3 — React.memo without stable props:
  Component wrapped in React.memo but receives new object/array/function on every render
  React.memo is useless if props fail shallow equality every time
  FIX: Stabilize props with useMemo/useCallback in parent, or remove React.memo
  SEVERITY: MEDIUM

SCAN 4 — React Compiler compatibility:
  If React 19+ with compiler enabled: manual useMemo/useCallback may be redundant
  CHECK: Is react-compiler-runtime in dependencies?
  If YES: manual memos are noise — recommend removal unless "use no memo" directive needed
  SEVERITY: LOW (informational)
```

#### Kotlin Memoization

```
SCAN 1 — Missing lazy initialization:
  Expensive computation in property initializer that could use `by lazy`
  Grep(pattern: "val \w+ = [A-Z]\w+\.", glob: "*.kt") → check if expensive
  SEVERITY: LOW

SCAN 2 — Sequence vs List:
  Grep(pattern: "\.(filter|map|flatMap)\(.*\)\.(filter|map)", glob: "*.kt")
  3+ chained operations without .asSequence() = potential optimization
  SEVERITY: MEDIUM on large data, LOW otherwise
```

---

### D3.3 — BUNDLE SIZE (JS/TS)

```
SCAN 1 — Heavy imports:
  Grep(pattern: "import .* from ['\"]moment['\"]", glob: "*.{js,ts}") → recommend dayjs
  Grep(pattern: "import .* from ['\"]lodash['\"]", glob: "*.{js,ts}") → recommend lodash-es or native
  Grep(pattern: "import .* from ['\"]lodash/", glob: "*.{js,ts}") → OK (cherry-picked)
  SEVERITY: MEDIUM

SCAN 2 — Missing code splitting:
  All routes in single bundle without React.lazy/dynamic import
  Grep(pattern: "React\.lazy\(|import\(", glob: "*.{js,ts,jsx,tsx}")
  If 0 results AND app has >3 routes → recommend code splitting
  SEVERITY: MEDIUM

SCAN 3 — Barrel file re-exports pulling entire module:
  index.ts files that export everything from a module
  import { oneSmallThing } from '@/features/heavy-module' → pulls all exports
  SEVERITY: MEDIUM

SCAN 4 — Side-effect imports blocking tree-shaking:
  package.json missing "sideEffects": false
  import statements for their side effects only
  SEVERITY: LOW
```

---

### D3.4 — MEMORY MANAGEMENT

```
SCAN 1 — Event listener leaks (JS):
  addEventListener without corresponding removeEventListener
  Grep(pattern: "addEventListener\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-ref: Grep(pattern: "removeEventListener\(", glob: "*.{js,ts,jsx,tsx}")
  SEVERITY: HIGH in components (leak on unmount)

SCAN 2 — Timer leaks:
  setInterval without clearInterval
  Grep(pattern: "setInterval\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-ref: Grep(pattern: "clearInterval\(", glob: "*.{js,ts,jsx,tsx}")
  Also check: Is clearInterval in useEffect cleanup?
  SEVERITY: HIGH

SCAN 3 — Blob URL leaks:
  createObjectURL without revokeObjectURL
  Grep(pattern: "createObjectURL\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-ref: Grep(pattern: "revokeObjectURL\(", glob: "*.{js,ts,jsx,tsx}")
  SEVERITY: MEDIUM

SCAN 4 — useEffect without cleanup:
  Grep(pattern: "useEffect\(\s*\(\)\s*=>\s*\{", glob: "*.{jsx,tsx}")
  CHECK: Does the effect set up anything that needs cleanup?
  (subscriptions, timers, event listeners, abort controllers)
  If YES and no return function → LEAK
  SEVERITY: HIGH

SCAN 5 — Android Context/Activity leaks:
  Grep(pattern: "private.*context|private.*activity", glob: "*.kt")
  CHECK: Is Activity/Context stored in ViewModel, Singleton, or companion object?
  SEVERITY: CRITICAL (retains entire Activity view hierarchy)
  FIX: Use Application context, WeakReference, or remove reference

SCAN 6 — Kotlin coroutine leaks:
  Grep(pattern: "GlobalScope\.", glob: "*.kt")
  SEVERITY: HIGH — unstructured, no lifecycle, leaks
  FIX: Use viewModelScope / lifecycleScope
```

---

### D3.5 — RENDER PERFORMANCE

#### React Re-render Audit

```
SCAN 1 — Unstable references in JSX:
  Grep(pattern: "=\{\(\) =>|=\{\{|=\{\[", glob: "*.{jsx,tsx}")
  New arrow function / new object / new array created every render
  If passed to React.memo child → defeats memoization
  SEVERITY: MEDIUM

SCAN 2 — Context value without useMemo:
  Grep(pattern: "<\w+Context\.Provider value=\{\{", glob: "*.{jsx,tsx}")
  Inline object in Provider value → re-renders all consumers every render
  FIX: Wrap value in useMemo
  SEVERITY: HIGH (blast radius = all consumers)

SCAN 3 — Array index as key:
  Grep(pattern: "key=\{(i|index|idx)\}", glob: "*.{jsx,tsx}")
  SEVERITY: MEDIUM — causes DOM state leaks on reorder/insert
  FIX: Use stable unique identifier

SCAN 4 — Derived state in useEffect (double render):
  Pattern: useState + useEffect that sets state based on other state/props
  This causes: render → effect → setState → re-render (double render)
  FIX: Compute during render (useMemo or inline)
  SEVERITY: MEDIUM
```

#### Android Render Audit

```
SCAN 1 — Nested layout depth:
  Grep(pattern: "<(LinearLayout|RelativeLayout|FrameLayout)", glob: "*.xml")
  >3 levels of nesting → recommend ConstraintLayout
  SEVERITY: MEDIUM

SCAN 2 — RecyclerView without DiffUtil:
  Grep(pattern: "notifyDataSetChanged\(\)", glob: "*.kt")
  FIX: Use ListAdapter with DiffUtil.ItemCallback
  SEVERITY: HIGH (full rebuild instead of minimal update)

SCAN 3 — Main thread blocking:
  Grep(pattern: "Room\.|\.readText\(\)|\.writeText\(\)|URL\(.*\.openConnection", glob: "*.kt")
  CHECK: Is this inside a coroutine with Dispatchers.IO?
  If on Main thread → SEVERITY: CRITICAL (ANR risk)
```

---

### D3.6 — STARTUP OPTIMIZATION (Android)

```
SCAN 1 — Heavy Application.onCreate():
  Grep(pattern: "class \w+ : Application\(\)", glob: "*.kt") → read onCreate
  CHECK: Synchronous heavy work (Room.databaseBuilder.build, analytics init, image loader init)
  FIX: Defer non-critical init to background with Dispatchers.IO
  SEVERITY: HIGH

SCAN 2 — Missing Baseline Profiles:
  Glob(pattern: "**/baseline-prof.txt") → if missing, recommend adding
  Grep(pattern: "BaselineProfileRule", glob: "*.kt") → if missing in test/
  SEVERITY: MEDIUM — ~30% startup improvement

SCAN 3 — Splash screen configuration:
  Grep(pattern: "installSplashScreen\(\)|SplashScreen", glob: "*.kt")
  Android 12+ requires SplashScreen API — missing = white flash
  SEVERITY: MEDIUM
```
## §D4 — Structure & Architecture

> **Purpose:** Detect SRP violations, coupling problems, god components, prop drilling, circular dependencies, wrong abstractions, and structural decay. Architecture findings compound — they make every future change harder.

---

### D4.1 — SINGLE RESPONSIBILITY

```
SCAN 1 — God components/classes:
  List all files with LOC counts. Flag:
    JS/React: >300 LOC per component file
    Kotlin:   >600 LOC per class file
  
  FOR EACH flagged file, count:
    React: useState calls (>5 = smell), props (>10 = smell), useEffect (>3 = smell)
    Kotlin: function count (>20 = smell), injected dependencies (>5 = smell)
  SEVERITY: HIGH

  FIX strategy — decompose in this order (safest first):
    1. Extract pure utility functions (no state, no side effects)
    2. Extract custom hooks (state + logic without UI)
    3. Extract sub-components (focused UI pieces)
    4. Extract to compound component pattern (if prop explosion)

SCAN 2 — "And" test:
  For top 10 largest files, describe what each does.
  If description requires "and" → likely SRP violation
  "Fetches user data AND transforms it AND renders the profile AND handles editing"
  → at least 3 responsibilities
  SEVERITY: HIGH

SCAN 3 — Mixed concerns in single function:
  Functions that both compute AND produce side effects
  Grep(pattern: "function.*\{[\s\S]*setState.*[\s\S]*return\s+[^;]", glob: "*.{jsx,tsx}")
  = function that BOTH mutates state AND returns a value → split
  SEVERITY: MEDIUM
```

---

### D4.2 — MODULE BOUNDARIES & COUPLING

```
SCAN 1 — Circular dependencies:
  JS: Check imports for cycles. Module A imports B, B imports A.
      Grep(pattern: "import .* from", glob: "*.{js,ts,jsx,tsx}") → build import graph
      Look for mutual imports between files
  SEVERITY: HIGH — breaks tree-shaking, causes subtle bugs

SCAN 2 — Dependency direction violations:
  Principle: dependencies point INWARD (UI → Logic → Data → Domain)
  CHECK: Does any utility/data file import from a UI/component file?
  CHECK: Does any shared module import from a feature module?
  SEVERITY: HIGH

SCAN 3 — Feature leaking:
  Feature A directly imports internal module from Feature B
  Instead of using Feature B's public API (barrel export / interface)
  Grep(pattern: "from '.*features/(?!CURRENT_FEATURE).*/'", glob: "*.{js,ts}")
  SEVERITY: MEDIUM

SCAN 4 — Coupling via shared mutable state:
  Two+ modules both reading AND writing the same state
  Grep for shared state keys (localStorage keys, context, global store)
  accessed from multiple feature directories
  SEVERITY: HIGH — invisible coupling, race conditions
```

---

### D4.3 — FILE & FOLDER ORGANIZATION

```
ASSESS current structure type:
  FLAT: everything in src/ with no subdirectories → OK for <10 files
  TECHNICAL: components/, hooks/, utils/, services/ → OK for <30 files
  FEATURE-BASED: features/auth/, features/payment/ → recommended for 30+ files
  
  IF file count >30 AND structure is FLAT or TECHNICAL:
    Recommend migration to feature-based
    SEVERITY: MEDIUM — impacts developer navigation speed
    FIX: Group by feature domain, keep shared/ for cross-cutting

COLOCATION CHECK:
  Are test files next to source files? (preferred)
  Or in separate __tests__/ directory tree? (acceptable)
  Are style files next to components? (preferred)
  SEVERITY: LOW

ANDROID STRUCTURE CHECK:
  Grep(pattern: "package ", glob: "*.kt") → map package hierarchy
  Recommended: ui/, data/, domain/, di/
  CHECK: Are ViewModels in ui/? Are Repositories in data/? Are UseCases in domain/?
  SEVERITY: MEDIUM if mixed concerns in wrong packages
```

---

### D4.4 — COMPONENT ARCHITECTURE (React)

```
SCAN 1 — Prop drilling depth:
  Trace props from source to final consumer.
  >2 intermediate components that just pass through = prop drilling
  FIX: React Context for cross-cutting (theme, auth), or component composition
  SEVERITY: MEDIUM

SCAN 2 — Component composition opportunities:
  Components with >5 boolean props controlling layout variants
  FIX: Use children/slots pattern (compound components)
  SEVERITY: MEDIUM

SCAN 3 — Hook architecture:
  Find custom hooks. Verify each:
    - Does ONE thing (single responsibility)
    - Returns stable interface (not changing shape between renders)
    - Doesn't mix unrelated state
  Custom hook with >5 useState calls = god hook → split
  SEVERITY: MEDIUM

SCAN 4 — Unused/over-abstracted components:
  Components used exactly once → may not need extraction
  Components with >5 config props but only 1 usage → premature abstraction
  SEVERITY: LOW (informational)
```

---

### D4.5 — STATE ARCHITECTURE

#### React State Decision Audit

```
CHECK each piece of state against this decision tree:

  Is it server data? → Should use TanStack Query / SWR, NOT useState/Redux
    Grep(pattern: "useState.*fetch|useEffect.*fetch.*setState", glob: "*.{jsx,tsx}")
    If found → SEVERITY: MEDIUM — recommend server state library

  Is it derivable from other state? → Should compute, NOT store
    Grep(pattern: "useEffect\(.*set\w+\(.*\)", glob: "*.{jsx,tsx}")
    Pattern: "useEffect that sets state based on other state" = derived state bug
    SEVERITY: HIGH — causes double renders, sync bugs

  Is it local to one component? → Should be useState, NOT in global store
    Redux/Zustand stores containing form input state, UI toggles = over-lifting
    SEVERITY: MEDIUM

  Is it used by distant components? → Context or external store
    CHECK: Is the context provider wrapping too much? (re-render blast radius)
    SEVERITY: MEDIUM if context is too broad
```

#### Kotlin State Architecture Audit

```
CHECK ViewModel patterns:
  Grep(pattern: "class \w+ViewModel", glob: "*.kt")
  FOR EACH:
    - Uses StateFlow for UI state? (preferred over LiveData for new code)
    - Exposes immutable StateFlow publicly? (not MutableStateFlow)
    - SharedFlow for one-time events? (not LiveData which replays)
    
  DETECT exposed MutableStateFlow:
    Grep(pattern: "val \w+\s*=\s*MutableStateFlow", glob: "*.kt")
    Should be: private val _state = MutableStateFlow(); val state = _state.asStateFlow()
    SEVERITY: HIGH — allows external mutation, breaks SSOT

  DETECT LiveData for events:
    Grep(pattern: "MutableLiveData.*Event|LiveData.*navigation|LiveData.*snackbar", glob: "*.kt")
    SEVERITY: MEDIUM — events replay on rotation, use SharedFlow(replay=0)
```

---

### D4.6 — ABSTRACTION QUALITY

```
SCAN 1 — Wrong abstraction signals:
  Functions/components with >3 boolean parameters controlling behavior
  Grep(pattern: "function \w+\(.*boolean.*boolean.*boolean|: Boolean.*: Boolean.*: Boolean", glob: "*.{js,ts,kt}")
  = abstraction trying to do too many different things
  SEVERITY: HIGH
  FIX: Re-introduce duplication, delete unused paths, re-extract genuine patterns

SCAN 2 — Over-abstraction signals:
  Abstraction used in exactly 1 place
  Wrapper that just passes through to inner component/function with no added logic
  SEVERITY: LOW

SCAN 3 — Under-abstraction signals:
  Same pattern repeated 3+ times without shared implementation
  Same validation logic in multiple handlers
  Same formatting logic in multiple display components
  SEVERITY: MEDIUM on 3rd occurrence
```
## §D5 — Logic & Correctness

> **Purpose:** Detect type coercion bugs, floating-point errors, null/NaN propagation, boundary failures, state machine impossible states, and temporal bugs. Logic findings are HIGH-CRITICAL — they produce wrong output.

---

### D5.1 — TYPE SAFETY

#### JS.TS Type Audit

```
SCAN 1 — Loose equality (== instead of ===):
  Grep(pattern: "[^=!]==[^=]", glob: "*.{js,ts,jsx,tsx}")
  EXCLUDE: == null (acceptable for null/undefined check in non-strict codebases)
  SEVERITY: HIGH — coercion rules are unintuitive ("0" == false is true)
  FIX: Replace with ===

SCAN 2 — || where ?? is needed (falsy vs nullish):
  Grep(pattern: "\|\|", glob: "*.{js,ts,jsx,tsx}")
  CHECK: Is the left operand a number (could be 0), string (could be ""), or boolean?
  If YES → || swallows valid falsy values
  FIX: Replace with ?? for nullish-only coalescing
  SEVERITY: HIGH — 0, "", false are all valid values that || treats as fallback

  CRITICAL EXAMPLES:
    count || "No items"     → count=0 yields "No items" (WRONG)
    input || "Anonymous"    → input="" yields "Anonymous" (WRONG)
    enabled || true         → enabled=false yields true (WRONG)
  
  FIX:
    count ?? "No items"     → count=0 yields 0 (CORRECT)

SCAN 3 — TypeScript any/unknown escape hatches:
  Grep(pattern: ": any\b|as any\b", glob: "*.{ts,tsx}")
  Count occurrences. Each one is a type safety hole.
  SEVERITY: MEDIUM per occurrence, HIGH if >10 total or in critical path

SCAN 4 — Missing strict TypeScript flags:
  Read tsconfig.json. CHECK for:
    "strict": true (minimum)
    "noUncheckedIndexedAccess": true (arr[0] returns T | undefined)
    "noImplicitReturns": true
    "noFallthroughCasesInSwitch": true
  EACH missing flag = MEDIUM finding

SCAN 5 — Unsafe array access:
  Grep(pattern: "\w+\[0\]|\w+\[\w+\]", glob: "*.{js,ts,jsx,tsx}")
  CHECK: Is the array guaranteed to have that index?
  arr[0] on possibly-empty array = crash or undefined propagation
  SEVERITY: MEDIUM
```

#### Kotlin Null Safety Audit

```
SCAN 1 — !! operator abuse:
  Grep(pattern: "!!", glob: "*.kt")
  COUNT and LIST all occurrences
  CHECK: Is there a programmatic guarantee of non-null BEFORE the !!?
  If NO → SEVERITY: HIGH — will NPE at runtime
  FIX: Safe call + elvis (?:), requireNotNull with message, or smart cast

SCAN 2 — Platform types from Java interop:
  Grep(pattern: "import java\.|import javax\.|import android\.", glob: "*.kt")
  Java methods return platform types (String!) that compile but can NPE
  CHECK: Are return values from Java APIs treated as nullable?
  SEVERITY: HIGH

SCAN 3 — lateinit without isInitialized:
  Grep(pattern: "lateinit var (\w+)", glob: "*.kt")
  Cross-ref: Grep(pattern: "::$1\.isInitialized", glob: "*.kt")
  MISSING isInitialized check → crashes if accessed before init
  SEVERITY: HIGH

SCAN 4 — Unsafe casts:
  Grep(pattern: "\bas\b(?!\?)", glob: "*.kt") — unsafe cast (as) vs safe cast (as?)
  SEVERITY: MEDIUM
  FIX: Use "as?" with null check / elvis
```

---

### D5.2 — FLOATING-POINT PRECISION

```
SCAN 1 — Float for money:
  Grep(pattern: "price|cost|amount|total|balance|payment|fee|tax|discount", glob: "*.{js,ts,kt}")
  CHECK: Is the value stored/computed as float?
  IF YES → SEVERITY: CRITICAL
  FIX: Store as integer cents. Display by dividing by 100 at final step only.
  Kotlin: Use BigDecimal with explicit RoundingMode

SCAN 2 — Equality comparison on floats:
  JS:     Grep(pattern: "===?\s*0\.\d|===?\s*\d+\.\d", glob: "*.{js,ts}")
  Kotlin: Grep(pattern: "==\s*\d+\.\d", glob: "*.kt")
  FIX: Use epsilon comparison: Math.abs(a - b) < Number.EPSILON
  SEVERITY: MEDIUM

SCAN 3 — Accumulated rounding errors:
  Loop that performs repeated arithmetic on float values
  Error compounds with each iteration
  FIX: Compute on integers, convert at display
  SEVERITY: HIGH if financial/scientific
```

---

### D5.3 — NULL/NaN/UNDEFINED PROPAGATION

```
SCAN 1 — NaN creation and propagation:
  JS: Grep(pattern: "parseInt\(|parseFloat\(|Number\(|\.toFixed\(", glob: "*.{js,ts}")
  CHECK: Is result checked for NaN before use?
  parseInt("abc") → NaN → NaN * 1.08 → NaN → displays "$NaN"
  FIX: Validate with Number.isNaN() (NOT global isNaN which coerces)
  SEVERITY: HIGH

SCAN 2 — Unsafe isNaN usage:
  Grep(pattern: "[^.]isNaN\(|[^r]isNaN\(", glob: "*.{js,ts}")
  isNaN("abc") returns true (coerces), Number.isNaN("abc") returns false (correct)
  FIX: Always use Number.isNaN()
  SEVERITY: MEDIUM

SCAN 3 — JSON.stringify data loss:
  JSON.stringify({v: undefined}) → '{}' — key disappears
  JSON.stringify({v: Infinity}) → '{"v":null}' — silent data loss
  JSON.stringify({v: NaN}) → '{"v":null}' — silent data loss
  CHECK: Are these values possible in serialized data?
  SEVERITY: HIGH if data is persisted/transmitted

SCAN 4 — Optional chaining without fallback:
  user?.address?.city used directly in computation without ?? fallback
  Result is undefined → propagates through math as NaN
  SEVERITY: MEDIUM
```

---

### D5.4 — BOUNDARY VALUES

```
FOR EACH function that accepts numeric input:
  TEST these boundaries mentally:
    0, 1, -1
    max valid value
    max valid + 1
    null, undefined, NaN
    empty string (for string inputs)
    empty array (for collection inputs)

SCAN 1 — Off-by-one patterns:
  Grep(pattern: "< \w+\.length|<= \w+\.length|> 0|>= 0|== 0|=== 0", glob: "*.{js,ts,kt}")
  CHECK: Is the boundary inclusive or exclusive? Is it correct?
  arr.length as index = out of bounds (should be length - 1)
  SEVERITY: HIGH

SCAN 2 — Division without zero check:
  Grep(pattern: "/ \w+| /\w+", glob: "*.{js,ts,kt}")
  CHECK: Can the divisor be 0?
  JS: 1/0 = Infinity (no crash, but wrong), 0/0 = NaN
  Kotlin: ArithmeticException for integers, Infinity for doubles
  SEVERITY: HIGH
```

---

### D5.5 — STATE MACHINE CORRECTNESS

```
SCAN 1 — Boolean soup (impossible states possible):
  Grep(pattern: "isLoading.*isError|isError.*isLoading|status.*loading.*error", glob: "*.{js,ts,jsx,tsx}")
  CHECK: Can isLoading AND isError both be true simultaneously?
  If YES → impossible state not prevented
  FIX: Discriminated union / sealed class

  JS/TS FIX:
    type State = 
      | { status: "idle" }
      | { status: "loading" }
      | { status: "success"; data: T }
      | { status: "error"; error: Error };

  Kotlin FIX:
    sealed class UiState {
      object Idle : UiState()
      object Loading : UiState()
      data class Success(val data: T) : UiState()
      data class Error(val error: Throwable) : UiState()
    }
  SEVERITY: HIGH

SCAN 2 — Exhaustiveness gaps:
  Switch/when on state without default/else handling all cases
  TS: Missing case in switch → enable noFallthroughCasesInSwitch
  Kotlin: when() without else on non-sealed types → compiler warning
  SEVERITY: MEDIUM
```

---

### D5.6 — TEMPORAL CORRECTNESS

```
SCAN 1 — Hardcoded time constants:
  Grep(pattern: "86400|3600|60000|1440|525600", glob: "*.{js,ts,kt}")
  86400 = seconds in day — WRONG across DST transitions
  FIX: Use date library (date-fns, java.time) for calendar math
  SEVERITY: MEDIUM

SCAN 2 — Date without timezone:
  JS: Grep(pattern: "new Date\(\)|Date\.now\(\)", glob: "*.{js,ts}")
  CHECK: Is timezone context clear? Is UTC used for storage?
  SEVERITY: MEDIUM

SCAN 3 — Stale hardcoded dates:
  Grep(pattern: "202[0-9]|201[0-9]", glob: "*.{js,ts,kt}")
  CHECK: Are these dates still in the future/valid?
  SEVERITY: MEDIUM if past dates used for future logic
```
## §D6 — State Management & Data Integrity

> **Purpose:** Detect SSOT violations, derived state anti-patterns, mutation bugs, stale closures, schema migration gaps, and concurrent state corruption. State bugs are the hardest to debug — they produce intermittent, unreproducible failures.

---

### D6.1 — SINGLE SOURCE OF TRUTH

```
SCAN 1 — Duplicated state (same data in two places):
  CHECK: Is the same value stored in BOTH:
    - Parent useState AND child useState?
    - Redux/Zustand store AND component state?
    - Server response cache AND manual state?
    - URL params AND store?
  If YES → sync drift is inevitable
  SEVERITY: CRITICAL

SCAN 2 — Prop-to-state copy (React anti-pattern):
  Grep(pattern: "useState\(props\.|useState\(.*\bprops\b", glob: "*.{jsx,tsx}")
  Copies prop into state → state never updates when prop changes
  FIX: Use prop directly, or use key to reset state on prop change
  SEVERITY: HIGH

SCAN 3 — Kotlin exposed mutable state:
  Grep(pattern: "val \w+\s*=\s*MutableStateFlow|val \w+\s*=\s*MutableLiveData", glob: "*.kt")
  CHECK: Is it public? Can external code mutate it?
  FIX: private val _state = MutableStateFlow(X); val state = _state.asStateFlow()
  SEVERITY: HIGH
```

---

### D6.2 — DERIVED STATE

```
SCAN 1 — useEffect for derived state (the #1 React state anti-pattern):
  PATTERN:
    const [items, setItems] = useState([]);
    const [filtered, setFiltered] = useState([]);
    useEffect(() => { setFiltered(items.filter(match)); }, [items]);
  
  DETECT:
    Grep(pattern: "useEffect\(.*=>\s*\{[\s\S]*?set[A-Z]\w+\(", glob: "*.{jsx,tsx}")
    CHECK: Does the effect ONLY set state based on other state/props?
    If YES → this is derived state computed via effect = double render + sync bug
  
  FIX:
    const filtered = useMemo(() => items.filter(match), [items]);
    // Or inline if cheap: const filtered = items.filter(match);
  SEVERITY: HIGH

SCAN 2 — Kotlin stored derived state:
  ViewModel stores computed value instead of deriving from source
  Grep(pattern: "\.collect\s*\{[\s\S]*?_\w+\.value\s*=", glob: "*.kt")
  CHECK: Is the collected value just a transformation of another flow?
  FIX: Use Flow.combine or Flow.map
  SEVERITY: MEDIUM
```

---

### D6.3 — MUTATION & REFERENCE INTEGRITY

```
SCAN 1 — Direct state mutation (React):
  Grep(pattern: "\.push\(|\.pop\(|\.splice\(|\.sort\(\)|\.reverse\(\)", glob: "*.{jsx,tsx}")
  CHECK: Is this on a state variable or state-derived array?
  state.items.push(x) → mutation invisible to React → no re-render
  FIX: setItems(prev => [...prev, x])
  SEVERITY: CRITICAL

SCAN 2 — Shallow copy pitfall:
  Grep(pattern: "\{\.\.\.state|\.\.\.user|\.\.\.data\}", glob: "*.{js,ts,jsx,tsx}")
  CHECK: Does the spread target have nested objects?
  {...state, user: {...state.user}} ← still shares nested refs
  state.user.address.city = 'X' ← MUTATES original
  FIX: Use Immer's produce(), or structured clone
  SEVERITY: HIGH

SCAN 3 — Kotlin data class copy with nested mutation:
  Grep(pattern: "\.copy\(", glob: "*.kt")
  CHECK: copy() is shallow — nested objects share reference
  state.copy(user = state.user) ← user is SAME object
  FIX: Deep copy nested objects, or use immutable data structures
  SEVERITY: HIGH
```

---

### D6.4 — STALE CLOSURES (React)

```
SCAN 1 — Missing useEffect dependencies:
  Grep(pattern: "useEffect\(", glob: "*.{jsx,tsx}")
  FOR EACH useEffect:
    List all state/prop variables referenced inside the callback
    Check dependency array — are ALL referenced variables included?
    MISSING dep = stale closure = uses value from OLD render
  
  SEVERITY: HIGH — this is the #1 React hooks bug
  FIX: Add missing deps, or use functional state update: setState(prev => prev + 1)

SCAN 2 — Stale closure in event handlers:
  Event handler defined inside component but references state
  without useCallback or functional update
  CHECK: Does the handler use a state value that could be stale?
  SEVERITY: MEDIUM

SCAN 3 — eslint-disable for exhaustive-deps:
  Grep(pattern: "eslint-disable.*exhaustive-deps", glob: "*.{jsx,tsx}")
  EACH suppression = potential stale closure. Review every one.
  SEVERITY: HIGH per suppression — treat as guilty until proven innocent
```

---

### D6.5 — PERSISTENCE & SCHEMA

```
SCAN 1 — Persistence without schema version:
  JS: Grep(pattern: "localStorage\.(set|get)Item", glob: "*.{js,ts}")
      CHECK: Is there a schema version stored alongside data?
      No version → no migration path → breaking changes lose user data
  Kotlin: Grep(pattern: "SharedPreferences|getSharedPreferences", glob: "*.kt")
  SEVERITY: MEDIUM (compounds over time ⏱)

SCAN 2 — JSON.parse without try/catch:
  Grep(pattern: "JSON\.parse\((?!.*catch|.*try)", glob: "*.{js,ts}")
  Corrupted localStorage → crash on app load → data loss
  FIX: Wrap in try/catch, return default on failure
  SEVERITY: HIGH

SCAN 3 — Room migration gaps (Android):
  Grep(pattern: "fallbackToDestructiveMigration", glob: "*.kt")
  SEVERITY: CRITICAL — deletes all user data on schema change
  FIX: Write explicit Migration objects, test with MigrationTestHelper

SCAN 4 — localStorage quota awareness:
  Grep(pattern: "localStorage\.setItem", glob: "*.{js,ts}")
  CHECK: Is QuotaExceededError handled?
  5MB limit → exceeded → setItem throws → unhandled = crash
  SEVERITY: MEDIUM
```

---

### D6.6 — CONCURRENT STATE RISKS

```
SCAN 1 — Multi-tab state conflicts (JS):
  Grep(pattern: "localStorage", glob: "*.{js,ts}")
  CHECK: Are multiple tabs possible? Do they share localStorage?
  If YES → race condition on read/write
  FIX: Listen to 'storage' event, or use BroadcastChannel for sync
  SEVERITY: MEDIUM

SCAN 2 — Double-submit on rapid clicks:
  Grep(pattern: "onClick.*=.*\{[\s\S]*?fetch\(|onClick.*=.*\{[\s\S]*?dispatch\(", glob: "*.{jsx,tsx}")
  CHECK: Is the button disabled during async operation?
  Is there a loading state preventing re-entry?
  FIX: Set loading state before async, disable button
  SEVERITY: HIGH

SCAN 3 — Android process death state loss:
  Grep(pattern: "class \w+ViewModel", glob: "*.kt")
  CHECK: Does the ViewModel use SavedStateHandle for critical UI state?
  (form inputs, scroll position, selected tab, filter state)
  Without SavedStateHandle → state lost on process death
  SEVERITY: HIGH for user-input state, MEDIUM for navigation state

SCAN 4 — Configuration change state loss:
  CHECK: Does the app handle rotation/dark mode toggle?
  Activity recreated → anything NOT in ViewModel is lost
  Grep(pattern: "var \w+\s*=.*(?:mutableListOf|arrayListOf|HashMap)", glob: "*.kt")
  If this is in Activity/Fragment (not ViewModel) → lost on config change
  SEVERITY: HIGH
```
## §D7 — Error Handling & Resilience

> **Purpose:** Detect empty catches, missing error boundaries, swallowed exceptions, absent retry logic, crash-on-network-failure patterns, and unhandled promise rejections. Error handling has the highest bug density of any dimension.

---

### D7.1 — TRY/CATCH COVERAGE

```
SCAN 1 — JSON.parse without try/catch:
  Grep(pattern: "JSON\.parse\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-ref: Is it inside a try block?
  Any JSON.parse on untrusted input without try/catch = crash
  SEVERITY: HIGH
  FIX: try { JSON.parse(x) } catch { return defaultValue; }

SCAN 2 — Async without error handling:
  JS: Grep(pattern: "await\s+\w+", glob: "*.{js,ts,jsx,tsx}")
      CHECK: Is the await inside try/catch OR chained with .catch()?
      Unhandled async error → unhandled rejection → silent failure or crash
  SEVERITY: HIGH

SCAN 3 — Empty catch blocks:
  JS:     Grep(pattern: "catch\s*\(\w*\)\s*\{\s*\}", glob: "*.{js,ts}")
  Kotlin: Grep(pattern: "catch\s*\(\w+:\s*\w+\)\s*\{\s*\}", glob: "*.kt")
  Swallowed error = invisible bug. At minimum: log, or rethrow
  SEVERITY: HIGH

SCAN 4 — Over-broad catch:
  JS:     catch(e) that catches ALL errors including programmer bugs
  Kotlin: Grep(pattern: "catch\s*\(\w+:\s*Exception\)", glob: "*.kt")
          Should catch specific exceptions, not generic Exception
  SEVERITY: MEDIUM

SCAN 5 — Kotlin runCatching in suspend functions:
  Grep(pattern: "runCatching\s*\{", glob: "*.kt")
  CHECK: Is this inside a suspend function?
  runCatching swallows CancellationException → zombie coroutine → resource leak
  SEVERITY: CRITICAL
  FIX: Use explicit try/catch that rethrows CancellationException
    try { ... } catch (e: CancellationException) { throw e } catch (e: Exception) { ... }
```

---

### D7.2 — ERROR BOUNDARIES (React)

```
SCAN 1 — Error boundary existence:
  Grep(pattern: "ErrorBoundary|componentDidCatch|getDerivedStateFromError|react-error-boundary", glob: "*.{jsx,tsx}")
  If 0 results → NO error boundaries → any render error crashes entire app
  SEVERITY: HIGH

SCAN 2 — Error boundary placement:
  CHECK: Are boundaries at multiple levels?
    Route-level: catches page crashes
    Feature-level: isolates widget failures
    Third-party component level: protects against library bugs
  Single top-level boundary only → entire app blanks on any error
  SEVERITY: MEDIUM

SCAN 3 — Error boundary limitations awareness:
  Error boundaries do NOT catch:
    - Event handler errors
    - Async errors (setTimeout, fetch)
    - Server-side rendering errors
  CHECK: Are event handlers and async ops wrapped in their own try/catch?
  SEVERITY: MEDIUM (informational if not handled)
```

---

### D7.3 — ERROR PROPAGATION

```
SCAN 1 — Silent failures:
  Functions that return undefined/null on error instead of throwing or returning error
  User sees blank/empty state instead of error message
  CHECK: Does every error path produce user-visible feedback?
  SEVERITY: HIGH

SCAN 2 — Error message quality:
  Grep(pattern: "catch.*\{[\s\S]*?(alert|toast|snackbar|setError)", glob: "*.{js,ts,kt}")
  CHECK: Does the message:
    - Explain WHAT went wrong? (not "Something went wrong")
    - Suggest WHAT to do? (retry, check input, contact support)
    - Avoid developer jargon? (no stack traces, no error codes for users)
  SEVERITY: MEDIUM

SCAN 3 — Error types (Kotlin):
  CHECK: Are custom exception/error classes used for domain errors?
  Or is everything thrown as generic Exception/RuntimeException?
  FIX: Sealed class hierarchy for expected failures
    sealed class AppError : Exception()
    data class NetworkError(val code: Int) : AppError()
    data class ValidationError(val field: String) : AppError()
  SEVERITY: MEDIUM
```

---

### D7.4 — UNHANDLED PROMISES (JS/TS)

```
SCAN 1 — Floating promises:
  Grep(pattern: "(?<!await |return )\w+\.(then|catch)\(|(?<!await |return )fetch\(", glob: "*.{js,ts}")
  Promise returned but not awaited or caught → unhandled rejection
  SEVERITY: HIGH
  FIX: Add await, or .catch(), or void keyword if intentionally fire-and-forget

SCAN 2 — Async in non-async context:
  Grep(pattern: "onClick=\{async|onChange=\{async", glob: "*.{jsx,tsx}")
  Async event handlers that throw → unhandled promise rejection
  CHECK: Is there try/catch inside the async handler?
  SEVERITY: HIGH

SCAN 3 — Promise.all partial failure:
  Grep(pattern: "Promise\.all\(", glob: "*.{js,ts}")
  Promise.all fails fast — one rejection rejects all
  CHECK: Should this be Promise.allSettled for partial failure tolerance?
  SEVERITY: MEDIUM
```

---

### D7.5 — RETRY & TIMEOUT

```
SCAN 1 — Network calls without timeout:
  JS: Grep(pattern: "fetch\(", glob: "*.{js,ts}")
      CHECK: Is AbortController with setTimeout used?
      Default fetch has NO timeout — hangs forever on dead server
  Kotlin: Grep(pattern: "OkHttpClient|HttpURLConnection|Retrofit", glob: "*.kt")
      CHECK: connectTimeout, readTimeout, writeTimeout configured?
  SEVERITY: HIGH
  
  FIX (JS):
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try { await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(timeout); }

SCAN 2 — Missing retry for transient failures:
  CHECK: Do network calls retry on 5xx or network error?
  FIX: Exponential backoff with jitter
    delay = min(baseDelay × 2^attempt + random(0, jitter), maxDelay)
    max 3-5 attempts
  SEVERITY: MEDIUM

SCAN 3 — Retry of non-idempotent operations:
  CHECK: POST/PUT/DELETE requests retried without idempotency token
  = duplicate operations (double payment, double create)
  SEVERITY: CRITICAL for mutation operations
```

---

### D7.6 — NETWORK RESILIENCE

```
SCAN 1 — No offline handling:
  CHECK: What happens when network unavailable?
    Blank screen? Spinner forever? Crash?
  FIX: Show cached/stale data with offline indicator, queue mutations for replay
  SEVERITY: MEDIUM

SCAN 2 — No loading state:
  Grep(pattern: "fetch\(|await\s+\w+Api\.", glob: "*.{js,ts,kt}")
  CHECK: Is there a loading indicator during the request?
  No feedback >200ms feels broken
  SEVERITY: MEDIUM

SCAN 3 — Kotlin request cancellation on navigation:
  Grep(pattern: "viewModelScope\.launch\s*\{[\s\S]*?(fetch|api|repository)\.", glob: "*.kt")
  CHECK: viewModelScope auto-cancels on ViewModel clear ✓
  CHECK: lifecycleScope used correctly with repeatOnLifecycle?
  Grep(pattern: "lifecycleScope\.launch\s*\{[\s\S]*?collect", glob: "*.kt")
  Should use: lifecycleScope.launch { repeatOnLifecycle(STARTED) { flow.collect {} } }
  SEVERITY: HIGH if collecting without repeatOnLifecycle
```
## §D8 — Async & Concurrency

> **Purpose:** Detect race conditions, stale data from out-of-order responses, missing request cancellation, coroutine lifecycle bugs, useEffect cleanup gaps, and improper promise handling. Async bugs are intermittent and hard to reproduce — they must be caught by code analysis.

---

### D8.1 — RACE CONDITIONS

```
SCAN 1 — Check-then-act on async:
  Pattern: read value → await something → use value (value may have changed)
  JS:  const count = state.count;
       await saveData();
       setState({ count: count + 1 }); // STALE — count may have changed during await
  FIX: Functional update: setState(prev => ({ count: prev.count + 1 }))
  SEVERITY: HIGH

SCAN 2 — Double-submit without guard:
  Grep(pattern: "onClick.*=.*\{[\s\S]*?await", glob: "*.{jsx,tsx}")
  CHECK: Is button disabled or is loading state set BEFORE the await?
  Rapid clicks during async → duplicate operations
  FIX: Set loading=true synchronously before await, disable button
  SEVERITY: HIGH

SCAN 3 — Out-of-order responses:
  Component fetches data, user changes input, component fetches again
  Slow first response arrives AFTER fast second response → stale data displayed
  
  CHECK: Is there cancellation of previous request?
  Grep(pattern: "AbortController|controller\.abort", glob: "*.{js,ts,jsx,tsx}")
  If absent in fetch-on-change patterns → SEVERITY: HIGH
  
  Kotlin equivalent: Grep(pattern: "collectLatest|flatMapLatest", glob: "*.kt")
  If collecting user-triggered searches without Latest variant → SEVERITY: HIGH

SCAN 4 — React 18 concurrent mode awareness:
  Grep(pattern: "startTransition|useTransition|useDeferredValue", glob: "*.{jsx,tsx}")
  If used → verify they're applied to non-urgent updates (search filtering, list updating)
  If NOT used on heavy re-renders → SEVERITY: LOW (optimization opportunity)
```

---

### D8.2 — REQUEST CANCELLATION

#### JS.React Cancellation

```
SCAN 1 — useEffect fetch without AbortController:
  Grep(pattern: "useEffect\(.*=>\s*\{[\s\S]*?fetch\(", glob: "*.{jsx,tsx}")
  CHECK: Does the effect return a cleanup function that calls controller.abort()?
  
  CORRECT PATTERN:
    useEffect(() => {
      const controller = new AbortController();
      fetch(url, { signal: controller.signal })
        .then(r => r.json()).then(setData)
        .catch(e => { if (e.name !== 'AbortError') throw e; });
      return () => controller.abort();
    }, [url]);
  
  MISSING cleanup → request completes after unmount → wasted bandwidth + potential error
  SEVERITY: HIGH

SCAN 2 — isMounted boolean instead of AbortController:
  Grep(pattern: "isMounted|mountedRef|isComponentMounted", glob: "*.{jsx,tsx}")
  isMounted only prevents setState — request still runs to completion
  AbortController actually cancels the network request
  SEVERITY: MEDIUM (works but wastes resources)
  FIX: Replace with AbortController pattern

SCAN 3 — Async in useEffect without cancellation awareness:
  useEffect(() => {
    async function load() { const data = await fetchData(); setData(data); }
    load();
  }, []);
  MISSING: no way to cancel fetchData on unmount
  FIX: Pass AbortController.signal through, or use boolean guard
  SEVERITY: MEDIUM
```

#### Kotlin Cancellation

```
SCAN 1 — GlobalScope usage:
  Grep(pattern: "GlobalScope\.", glob: "*.kt")
  Unstructured coroutine → no lifecycle → leaks
  FIX: viewModelScope / lifecycleScope / custom CoroutineScope
  SEVERITY: HIGH

SCAN 2 — CancellationException swallowing:
  Grep(pattern: "catch\s*\(\w+:\s*(Exception|Throwable)\)\s*\{(?![\s\S]*throw)", glob: "*.kt")
  Generic catch without rethrowing CancellationException → zombie coroutine
  SEVERITY: CRITICAL
  FIX: catch (e: CancellationException) { throw e } catch (e: Exception) { handle(e) }

SCAN 3 — Suspend in finally without NonCancellable:
  Grep(pattern: "finally\s*\{[\s\S]*?suspend|finally\s*\{[\s\S]*?delay|finally\s*\{[\s\S]*?emit", glob: "*.kt")
  Suspend functions in finally block won't execute if coroutine is cancelled
  FIX: withContext(NonCancellable) { /* cleanup */ }
  SEVERITY: HIGH

SCAN 4 — Blocking calls in coroutines:
  Grep(pattern: "Thread\.sleep|\.join\(\)|\.get\(\)|runBlocking", glob: "*.kt")
  CHECK: Is this inside a coroutine?
  Thread.sleep blocks the dispatcher thread → SEVERITY: HIGH
  FIX: Use delay() instead of Thread.sleep(), withContext(Dispatchers.IO) for blocking IO

SCAN 5 — Wrong dispatcher:
  Grep(pattern: "withContext\(Dispatchers\.(Main|IO|Default)\)", glob: "*.kt")
  CHECK: CPU-bound work on IO? (wastes IO pool threads)
  CHECK: IO work on Main? (blocks UI)
  CHECK: UI work on Default? (crash — can't touch views from background)
  SEVERITY: HIGH for Main-thread IO, MEDIUM for wrong pool
```

---

### D8.3 — USEEFFECT CLEANUP (React)

```
SCAN 1 — Effects that create subscriptions without cleanup:
  Grep(pattern: "useEffect\(", glob: "*.{jsx,tsx}")
  FOR EACH useEffect, check: does it create any of these?
    addEventListener → needs removeEventListener in cleanup
    setInterval → needs clearInterval
    setTimeout → needs clearTimeout
    WebSocket → needs close()
    EventSource → needs close()
    observer.observe → needs observer.disconnect()
    subscription.subscribe → needs subscription.unsubscribe()
    AbortController → needs controller.abort()
  
  CHECK: Does the effect return a cleanup function?
  Grep inside useEffect for "return () =>" or "return function"
  
  MISSING cleanup for any of above = LEAK
  SEVERITY: HIGH

SCAN 2 — Cleanup function ordering:
  Cleanup runs BEFORE the next effect execution AND on unmount
  CHECK: Does cleanup handle both cases correctly?
  A cleanup that only cleans up "on unmount" but not "on dependency change" = partial leak
  SEVERITY: MEDIUM
```

---

### D8.4 — PROMISE PATTERNS (JS/TS)

```
SCAN 1 — Sequential await in loop (accidental serialization):
  for (const item of items) { await processItem(item); }
  If items are independent → this is N serial requests instead of parallel
  FIX: await Promise.all(items.map(item => processItem(item)))
  SEVERITY: MEDIUM (performance)

SCAN 2 — Promise.all vs Promise.allSettled:
  Grep(pattern: "Promise\.all\(", glob: "*.{js,ts}")
  Promise.all: one rejection rejects all → remaining results lost
  Promise.allSettled: returns all results (fulfilled + rejected)
  CHECK: Is partial failure acceptable? If YES → use allSettled
  SEVERITY: MEDIUM

SCAN 3 — Async forEach (fire-and-forget):
  Grep(pattern: "\.forEach\(async", glob: "*.{js,ts}")
  forEach doesn't await the returned promises → all fire in parallel uncontrolled
  FIX: for...of with await (sequential) or Promise.all(arr.map(...)) (parallel)
  SEVERITY: HIGH — likely unintentional

SCAN 4 — Missing Promise.race for timeouts:
  Long-running operations without timeout
  FIX: Promise.race([fetchData(), timeout(10000)])
  SEVERITY: MEDIUM
```

---

### D8.5 — DEBOUNCE & THROTTLE

```
SCAN 1 — Missing debounce on search/filter input:
  Grep(pattern: "onChange.*=.*\{[\s\S]*?(fetch|filter|search|query)", glob: "*.{jsx,tsx}")
  CHECK: Is there a debounce (200-500ms) before triggering the action?
  Typing "hello" without debounce = 5 separate requests/computations
  FIX: useDebounce hook or lodash.debounce
  SEVERITY: MEDIUM

SCAN 2 — Missing throttle on scroll/resize handlers:
  Grep(pattern: "addEventListener\(['\"]scroll|addEventListener\(['\"]resize", glob: "*.{js,ts}")
  CHECK: Is handler throttled? Scroll fires 60+ times per second
  FIX: requestAnimationFrame or throttle(handler, 16)
  SEVERITY: MEDIUM

SCAN 3 — Debounce in wrong location:
  Debounce created inside component body (new instance every render)
  Grep(pattern: "debounce\(|useMemo.*debounce", glob: "*.{jsx,tsx}")
  CHECK: Is the debounced function stable across renders?
  FIX: useMemo or useRef to persist debounce instance
  SEVERITY: HIGH (broken debounce = no debounce)
```

---

### D8.6 — KOTLIN FLOW PATTERNS

```
SCAN 1 — Collecting Flow without lifecycle awareness:
  Grep(pattern: "\.collect\s*\{", glob: "*.kt")
  CHECK: Is collection inside repeatOnLifecycle(STARTED)?
  Without lifecycle gate → collection continues when app is backgrounded
  = wasted resources, potential crashes
  
  CORRECT:
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { state -> updateUI(state) }
      }
    }
  SEVERITY: HIGH

SCAN 2 — StateFlow not using collectAsState (Compose):
  Grep(pattern: "\.collect\s*\{[\s\S]*?mutableStateOf", glob: "*.kt")
  In Compose, use .collectAsStateWithLifecycle() instead of manual collection
  SEVERITY: MEDIUM

SCAN 3 — SharedFlow replay for events:
  Grep(pattern: "MutableSharedFlow\(replay\s*=\s*[1-9]", glob: "*.kt")
  Events (navigation, snackbar) should use replay=0
  replay>0 → event replays on new subscriber (screen rotation)
  SEVERITY: HIGH for navigation/snackbar events
```
## §CROSS — Cross-Cutting Compound Chains

> **Purpose:** After auditing individual dimensions, trace failures ACROSS dimensions. A finding in one dimension often reveals (or causes) failures in others. Compound chains are escalated above individual severity because their combined impact is multiplicative, not additive.

---

### PROTOCOL

```
After completing all requested dimensions:
1. For each CRITICAL/HIGH finding, trace forward: what does this break downstream?
2. For each CRITICAL/HIGH finding, trace backward: what upstream issue causes this?
3. Document each chain with combined severity
4. Escalate: a chain of 3 LOW findings can be HIGH combined
```

---

### DOCUMENTED CHAIN PATTERNS

#### Chain 1 — Validation → State → Logic → Display

```
TRIGGER: Missing input validation (§D5)
TRACE:
  [§D5 LOW]  Input "abc" accepted where number expected
  [§D6 MED]  Invalid value stored in state
  [§D5 HIGH] Computation uses NaN → all downstream math is NaN
  [§D7 HIGH] No error handling catches the NaN
  → User sees "$NaN" or blank where a price should be

COMBINED SEVERITY: HIGH (escalated from LOW)
DETECT: Find validation gaps → trace the value through state → to display
```

#### Chain 2 — Type Coercion → Wrong Branch → Wrong Output

```
TRIGGER: || instead of ?? (§D5)
TRACE:
  [§D5 HIGH] count || "default" where count=0 is valid
  [§D5 HIGH] Falsy 0 triggers fallback → wrong branch taken
  → User sees "default" instead of "0"

COMBINED SEVERITY: HIGH
DETECT: Every || usage → check if left operand can be 0, "", or false
```

#### Chain 3 — Stale Closure → Missing Dep → Silent Feature Break

```
TRIGGER: Missing useEffect dependency (§D6)
TRACE:
  [§D6 HIGH] Variable captured in closure but not in dep array
  [§D8 MED]  Effect doesn't re-run when value changes
  [§D5 HIGH] Computation uses stale value → wrong result
  → Feature appears to work but uses outdated data

COMBINED SEVERITY: HIGH (silent — no crash, just wrong output)
DETECT: Every eslint-disable exhaustive-deps → trace what's stale → what uses it
```

#### Chain 4 — Mutation → Stale Reference → No Re-render → Data Loss

```
TRIGGER: Direct state mutation (§D6)
TRACE:
  [§D6 CRIT] array.push() on state array
  [§D3 HIGH] React doesn't detect change (same reference)
  [§D6 HIGH] UI shows stale data
  [§D6 CRIT] On next state update, mutation is overwritten → data loss

COMBINED SEVERITY: CRITICAL
DETECT: .push()/.splice()/.sort() on state → trace to UI → trace to persistence
```

#### Chain 5 — CancellationException Swallow → Zombie → Leak → OOM

```
TRIGGER: Generic catch swallows CancellationException (§D8)
TRACE:
  [§D8 CRIT] catch(e: Exception) without rethrow CancellationException
  [§D8 HIGH] Coroutine continues executing after cancellation
  [§D3 HIGH] Resources not released (network connections, file handles)
  [§D3 CRIT] Memory leak accumulates → OOM crash

COMBINED SEVERITY: CRITICAL
DETECT: Every catch(Exception) in suspend functions → check for CancellationException rethrow
```

#### Chain 6 — Missing Cleanup → Leak → State Corruption

```
TRIGGER: useEffect without cleanup (§D8)
TRACE:
  [§D8 HIGH] Event listener not removed on unmount
  [§D3 HIGH] Listener fires on unmounted component
  [§D6 HIGH] setState called on unmounted component → React warning
  [§D6 CRIT] If handler modifies shared state → corrupts state for mounted components

COMBINED SEVERITY: HIGH-CRITICAL
DETECT: useEffect creating subscriptions → check for return cleanup → trace handler effects
```

#### Chain 7 — No Error Boundary → Render Error → White Screen

```
TRIGGER: Missing error boundary (§D7)
TRACE:
  [§D7 HIGH] No ErrorBoundary components in app
  [§D5 MED]  Component receives unexpected null prop
  [§D5 HIGH] .toString() on null → TypeError
  [§D7 CRIT] Unhandled error in render → entire React tree unmounts → white screen

COMBINED SEVERITY: CRITICAL
DETECT: ErrorBoundary count = 0 → any runtime error in any component = full crash
```

#### Chain 8 — Out-of-Order Response → Stale Data Display

```
TRIGGER: Missing request cancellation (§D8)
TRACE:
  [§D8 HIGH] No AbortController on search-as-you-type
  [§D8 HIGH] User types "ab" then "abc" — two requests fire
  [§D8 HIGH] "abc" response arrives first (faster), then "ab" arrives (slower)
  [§D6 HIGH] "ab" response overwrites "abc" results → wrong data displayed

COMBINED SEVERITY: HIGH
DETECT: Search/filter patterns → check for abort/cancel/collectLatest
```

#### Chain 9 — Process Death → State Loss → Data Loss

```
TRIGGER: Missing SavedStateHandle (§D6)
TRACE:
  [§D6 HIGH] Form data in ViewModel without SavedStateHandle
  [§D6 HIGH] Android kills process in background (memory pressure)
  [§D6 CRIT] User returns → ViewModel recreated → form data gone
  → User loses 5 minutes of work

COMBINED SEVERITY: HIGH-CRITICAL
DETECT: ViewModel with form state → check SavedStateHandle usage
```

#### Chain 10 — Naming → Misunderstanding → Wrong Usage → Logic Bug

```
TRIGGER: Misleading function name (§D1)
TRACE:
  [§D1 HIGH] Function named getData() that also WRITES to cache
  [§D4 MED]  Caller assumes getData() is pure → calls it in a loop
  [§D6 HIGH] Cache written N times → performance + potential state corruption
  [§D5 HIGH] Stale cache data returned on next read → wrong output

COMBINED SEVERITY: HIGH
DETECT: Functions named get*/is*/calculate* → check for side effects (writes, dispatches)
```

#### Chain 11 — Missing Types → Missing Validation → Runtime Crash

```
TRIGGER: any/missing types (§D5)
TRACE:
  [§D5 MED]  API response typed as `any`
  [§D5 HIGH] No runtime validation at boundary
  [§D5 HIGH] Backend returns unexpected shape → property access on undefined
  [§D7 HIGH] No error handling → unhandled TypeError
  → App crashes or displays broken UI

COMBINED SEVERITY: HIGH
DETECT: any types at API boundaries → check for Zod/io-ts validation → check error handling
```

#### Chain 12 — Schema Change → No Migration → Data Corruption

```
TRIGGER: Missing schema versioning (§D6)
TRACE:
  [§D6 MED]  localStorage/SharedPrefs data has no version field
  [§D6 HIGH] Developer changes data shape in code update
  [§D6 CRIT] Old data parsed with new schema → fields missing/wrong type
  [§D5 CRIT] App uses corrupted data → wrong output or crash

COMBINED SEVERITY: CRITICAL (⏱ COMPOUNDS with every release)
DETECT: persistence read → check for version check → check for migration path
```

---

### SIGNAL CORRELATION TABLE

> When you find issue X, also investigate Y — they frequently co-occur.

| Finding X | Also investigate Y |
|-----------|-------------------|
| `any` types (§D5) | Missing API validation, unhandled errors (§D7) |
| God component (§D4) | Stale closures (§D6), re-render performance (§D3) |
| eslint-disable (§D6) | Every other dimension — suppressed warnings hide real bugs |
| Dead code (§D2) | Duplication in live code (§D2) — abandoned refactoring signal |
| GlobalScope (§D8) | Memory leaks (§D3), missing cancellation (§D8) |
| console.log in prod (§D2) | Missing error handling (§D7) — logs used instead of error handling |
| Empty catch (§D7) | NaN/null propagation (§D5) — errors swallowed, bad values propagate |
| lateinit (§D5) | Missing null checks (§D5), crash paths (§D7) |
| .push() on state (§D6) | Missing re-renders (§D3), data loss (§D6) |
| No tests (§D2) | Logic bugs (§D5) — untested code has 5-10× higher defect rate |

---

### CHAIN DOCUMENTATION FORMAT

When a chain is found, document it:

```
CHAIN-{N}: {Descriptive Name}
  Combined Severity: {escalated severity}
  Steps:
    Step 1: [F-{id}] [§D{n}] [{severity}] — {description}
    Step 2: [F-{id}] [§D{n}] [{severity}] — {description}
    Step 3: [F-{id}] [§D{n}] [{severity}] — {description}
  User Impact: {what the user actually experiences}
  Root Cause: {the upstream issue that starts the chain}
  Fix Priority: Fix Step {N} first — it breaks the chain
```
