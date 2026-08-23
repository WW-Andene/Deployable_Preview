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
  Always use this skill for ANY code quality concern even when the request
  is phrased informally — this includes "why is my code slow", "is this code good",
  "review this function", "check for bugs", "improve this code".
---

# Code Quality Audit — Companion Skill

## INSTRUCTIONS FOR CLAUDE

This skill handles all code-touching concerns. It operates standalone OR as a companion to `app-audit-SKILL.md`. When app-audit delegates code work (categories §A, §B, §I, §L1-L2, §D code paths), this skill takes over with deeper, more granular coverage.

**Execution contract:** Follow every instruction in this document literally. When a step says "always", execute it every time. When a step says "check X", read the actual code and verify X. When a step provides a grep pattern, run that exact grep. State what you found. If you found nothing, state "0 results found."

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

When app-audit delegates code work, follow these three steps in order:
1. Inherit §0 from app-audit. Do **not** re-ask the user for stack information.
2. Run only the delegated dimensions.
3. Output findings in app-audit's format (§V) with dimension cross-refs. Return findings to app-audit for the Summary Dashboard.

### Standalone Mode

When invoked directly, follow these three steps in order:
1. Fill §0 by extracting information from the code. Ask the user only for values you cannot extract from the code itself.
2. Ask the user which dimensions to run. If the user says "all" or does not specify, run all 8 dimensions.
3. Output findings and deliverables independently.

### Dimension Selection

Follow this table exactly. Match the user's words to the left column and run the dimensions in the right column.

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

**Rule:** Extract values from the code first. Ask the user only for values you cannot extract. In companion mode, inherit all values from app-audit's §0.

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

**Stack Detection Protocol — execute these checks in order:**

```
Step 1. Check for package.json.
   If found → this is a JS/TS project.
   - Read "dependencies" to identify the framework (react, next, vue, etc.).
   - Read "devDependencies" to identify tooling (eslint, prettier, jest, vitest, etc.).
   - Read tsconfig.json if it exists. Record the strictness flags.

Step 2. Check for build.gradle or build.gradle.kts.
   If found → this is an Android/Kotlin project.
   - Read compileSdk, minSdk, targetSdk.
   - Read dependencies for architecture libraries (lifecycle, navigation, room, hilt).
   - Check for detekt or ktlint plugins.

Step 3. Detect conventions from the actual code.
   Run: Grep(pattern: "(const|let|var|function|class) ", glob: "*.{js,ts,jsx,tsx}") → record JS naming patterns.
   Run: Grep(pattern: "(fun |val |var |class |object )", glob: "*.kt") → record Kotlin naming patterns.
```

---

## §LAWS — IRON LAWS OF CODE AUDITING

These 8 laws govern every finding you produce. Follow all of them for every finding.

### Law 1 — Specificity

Every finding must name the exact function, variable, line number, and file. A finding that says only "improve naming" is invalid. A valid finding looks like: "`const d = new Date()` at `utils.js:47` — `d` is non-descriptive; rename to `createdDate` or `expirationDate` based on intent."

### Law 2 — Bugs Before Style

When a function has both a logic bug AND a style issue, always report the bug as the primary finding with higher priority. Report the style improvement as a separate, lower-priority finding.

### Law 3 — Evidence Required

Every finding must cite code evidence. Use these tags to indicate confidence:
- `[CONFIRMED]` — you read the code and traced the execution path.
- `[LIKELY]` — strong code evidence supports this conclusion.
- `[THEORETICAL]` — this is an architectural risk that requires runtime verification.

Always provide the real file name and real line number. If you cannot determine the line number, state "line number unverified" explicitly.

### Law 4 — Stack Awareness

Apply JS/React checks only to JS/React code. Apply Kotlin/Android checks only to Kotlin code. Before writing any finding, verify that the check belongs to the stack the code is written in.

### Law 5 — Minimum Footprint

Always recommend the smallest safe change that resolves the issue. A 2-line fix is preferred over a refactor that also fixes the problem. Only recommend a larger change when the 2-line fix would introduce a new bug or is technically impossible.

### Law 6 — Cross-Dimensional Awareness

When you find an issue in one dimension, always check the related dimensions for the same code path. Example: a missing null check (§D5) requires you to also check error handling (§D7) and state management (§D6) for that same code path before moving on.

### Law 7 — Convention Respect

If the codebase consistently uses a pattern (even a non-standard one), recommend consistency with that established pattern. Only recommend changing the convention when the established pattern causes bugs. Switching conventions mid-codebase is worse than a slightly non-standard convention applied consistently.

### Law 8 — Compound Chain Priority

When findings from different dimensions form a chain (see §CROSS), escalate the combined severity above the individual severities. Example: a LOW validation gap that chains into a HIGH display error becomes a HIGH-severity chain.

---

## §PRE — PRE-FLIGHT CHECKLIST

Execute every step below BEFORE writing any finding. Complete all steps in order.

```
Step 1: Read the entire codebase (or all files in the specified scope).
   In Claude Code: use Agent(Explore) for large codebases.
   In Claude.ai: use the view tool on all uploaded files.

Step 2: Detect the stack and fill §0.
   Run the Stack Detection Protocol from §0.

Step 3: Detect existing conventions.
   Sample at least 10 functions and record the naming pattern used.
   Sample at least 5 import blocks and record the ordering pattern.
   Sample at least 5 error handling blocks and record the try/catch pattern.

Step 4: Identify hot paths.
   Find the most-imported files (used by the most other files).
   Find the most-changed files (if git history is available).
   Mark these files. Add +1 severity to all findings in these files.

Step 5: Build a file inventory with line counts.
   List every file and its LOC count.
   Flag files with more than 300 LOC as god-component candidates (§D4).
   Flag files with more than 500 LOC as near-certain god-components.

Step 6: Announce your findings to the user.
   State: the detected stack, the convention patterns found, the total file count, and which dimensions you will audit.
```

---

## DIMENSION PROTOCOLS

For each dimension you audit, follow this procedure:
1. Go to the relevant section (§D1 through §D8).
2. Follow every checklist item in the order it appears.
3. For each check: run the grep or detection step, evaluate the results against the stated criteria, and write a finding if an issue is found.
4. After completing all requested dimensions: run §CROSS to identify cross-dimensional chains.

---

## §FMT — FINDING FORMAT

Use this exact template for every finding. Fill in every field.

```
F-{NNN} [{SEVERITY}] [{CONFIDENCE}] — {Title}

Dimension:    §D{N} — {Dimension Name}
Location:     {file}:{line} in {function/component}
Stack:        {JS/Kotlin/Universal}

Issue:
  {What is wrong. Name the exact variable, function, or pattern.
   Always reference specific code. Always be concrete.}

Evidence:
  {Code snippet or grep result that demonstrates the issue.}

Impact:
  {What breaks, degrades, or compounds because of this.
   Describe a concrete scenario, not an abstract risk.}

Fix:
  {Specific code change. Show Before → After when the change is 5 lines or fewer.
   Always recommend the smallest safe change that resolves the issue.}

Effort:       Trivial (<5 min) | Small (<1 hr) | Medium (<1 day) | Large (>1 day)
Risk:         {What could break if the fix is applied incorrectly}
Chain:        {Cross-ref to related findings in other dimensions, or "None"}
```

### Severity Scale

| Level | Meaning | Examples |
|-------|---------|---------|
| **CRITICAL** | Crash, data corruption, security hole | Swallowed CancellationException, mutation of state, unhandled null→crash |
| **HIGH** | Likely bug, significant correctness risk | Stale closure, missing error handling, `\|\|` instead of `??`, race condition |
| **MEDIUM** | Maintainability or reliability concern | Code duplication, high complexity, inconsistent naming, missing types |
| **LOW** | Style or minor improvement | Format inconsistency, verbose import, minor naming |
| **NIT** | Purely cosmetic | Trailing whitespace, quote style |

**Severity modifiers — apply these additively:**
- Hot-path code (most-imported or most-changed file): +1 severity level.
- Shared utility with wide blast radius (imported by 5+ files): +1 severity level.
- Code that handles PII or financial data: +1 severity level.

### Confidence Scale

| Tag | Meaning |
|-----|---------|
| `[CONFIRMED]` | Verified by reading code and tracing execution |
| `[LIKELY]` | Strong code evidence, near-certain |
| `[THEORETICAL]` | Architectural risk, needs runtime verification |

---

## §DLVR — DELIVERABLES

### Required (always produce these)

| Deliverable | Contents |
|-------------|---------|
| **Code Context Record** | §0 filled — stack, conventions, constraints |
| **Findings List** | All findings in §FMT format, grouped by severity (CRITICAL first, then HIGH, then MEDIUM, then LOW, then NIT) |
| **Quick Wins** | Top 10 findings ranked by (severity × impact) / effort |

### Full Audit (when all dimensions are audited)

| Deliverable | Contents |
|-------------|---------|
| **Dimension Scorecard** | Per-dimension: finding count by severity, health grade (A through F) |
| **Cross-Cutting Chain Map** | Every compound chain documented with escalated severity |
| **Convention Violations Summary** | Detected conventions listed alongside violations — with a consolidation plan |
| **Remediation Roadmap** | IMMEDIATE → SHORT-TERM → MEDIUM-TERM prioritized fix list |

### Companion Mode (delegated from app-audit)

| Deliverable | Contents |
|-------------|---------|
| **Findings in app-audit format** | Compatible with app-audit §V for merge into Summary Dashboard |
| **Dimension cross-refs** | Map code findings to app-audit categories (§A, §B, §I, §L) |

---

## EXECUTION PLAN

### Part Structure (Full Audit)

Execute parts in this order. Complete each part before starting the next.

| Part | Dimensions | Focus |
|------|-----------|-------|
| **P1** | §PRE + §D1 + §D2 | Pre-flight, Format, Health — foundational scan |
| **P2** | §D5 + §D6 | Logic, State — correctness layer |
| **P3** | §D7 + §D8 | Errors, Async — resilience layer |
| **P4** | §D3 + §D4 | Optimization, Architecture — structural layer |
| **P5** | §CROSS + Summary | Cross-cutting chains, scorecard, roadmap |

### Audit Priority Order (for maximum bug-finding yield)

When time is limited, audit dimensions in this order (highest bug density first):

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

Produce this dashboard after completing all audited dimensions.

```
CODE QUALITY AUDIT — {App/Module Name}

STACK:      {from §0}
FILES:      {count} files, {total LOC} lines
DIMENSIONS: {list which were audited}

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
| **A** | 0 CRITICAL, 0 HIGH, 2 or fewer MEDIUM |
| **B** | 0 CRITICAL, 2 or fewer HIGH, 5 or fewer MEDIUM |
| **C** | 0 CRITICAL, 5 or fewer HIGH, any number of MEDIUM |
| **D** | 2 or fewer CRITICAL, or more than 5 HIGH |
| **F** | More than 2 CRITICAL |

---

## APP-AUDIT CATEGORY MAPPING

When returning findings to app-audit, use this mapping:

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

---

## §D1 — Format & Conventions

**Purpose:** Detect naming violations, casing inconsistencies, import disorder, comment problems, magic numbers, and convention drift. These findings are LOW-MEDIUM severity individually. They compound into readability debt that causes real bugs when misleading names lead to wrong usage which leads to logic errors.

---

### D1.1 — NAMING QUALITY

#### Detection Protocol

```
SCAN 1 — Non-descriptive names (single-letter variables outside tiny loops):
  JS:     Grep(pattern: "(const|let|var)\s+[a-z]\s*=", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "(val|var)\s+[a-z]\s*[=:]", glob: "*.kt")
  Exclude these from findings: loop iterators (i, j, k), catch parameter (e), unused parameter (_).
  SEVERITY: MEDIUM when found in business logic. LOW when found in utility or test code.

SCAN 2 — Misleading names (name implies different behavior than actual behavior):
  Manual review. Look for:
    - Functions named get* that also mutate state → misleading
    - Functions named set* that return values → misleading
    - Functions named is* that return non-boolean → misleading
    - Functions named handle* that are not event handlers → misleading
  SEVERITY: HIGH. Misleading names cause callers to use the function incorrectly.

SCAN 3 — Unclear abbreviations:
  Grep(pattern: "[a-z]{1,3}[A-Z]|_[a-z]{1,3}_", glob: "*.{js,ts,kt}")
  For each result, ask: would a developer reading this file for the first time understand this abbreviation without additional context?
  If the answer is no → flag it.
  SEVERITY: MEDIUM
```

#### Casing Rules

| Element | JS/TS Convention | Kotlin Convention | Violation Severity |
|---------|-------|--------|-------------------|
| Variables and functions | camelCase | camelCase | MEDIUM |
| Classes and components | PascalCase | PascalCase | MEDIUM |
| Constants | SCREAMING_SNAKE_CASE | SCREAMING_SNAKE_CASE (`const val`) | LOW |
| Files (components) | PascalCase | PascalCase (must match class name) | LOW |
| Files (utilities) | kebab-case | PascalCase | LOW |
| Enum values | PascalCase or SCREAMING_SNAKE_CASE | PascalCase | LOW |

```
Detect casing violations by running these greps:
  JS classes:     Grep(pattern: "class [a-z]", glob: "*.{js,ts}")
  JS components:  Grep(pattern: "function [a-z].*return.*<", glob: "*.{jsx,tsx}")
  Kotlin classes: Grep(pattern: "class [a-z]", glob: "*.kt")
  Constants:      Grep(pattern: "const\s+[a-z].*=\s*['\"]|const\s+[a-z].*=\s*\d", glob: "*.{js,ts}")
                  Exclude: destructuring assignments and function assignments.
```

#### Boolean Naming

```
CHECK: All boolean variables, props, and functions should use is/has/can/should prefix.
  JS:     Grep(pattern: "(const|let|var)\s+\w+\s*=\s*(true|false)", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "(val|var)\s+\w+\s*[:=]\s*Boolean|=\s*(true|false)", glob: "*.kt")
  For each result: verify the name starts with is, has, can, should, or will.
  SEVERITY: MEDIUM

CHECK: Boolean names should use positive framing.
  Grep(pattern: "(is|has|can|should)(Not|n't|No|Non)", glob: "*.{js,ts,kt}")
  Rename negatives to positives: isNotDisabled → isEnabled, hasNoErrors → isValid.
  SEVERITY: MEDIUM
```

#### Event Handler Naming

```
CHECK (React): Props should use on-prefix. Handlers should use handle-prefix.
  Grep(pattern: "handle[A-Z].*=.*\(", glob: "*.{jsx,tsx}") → these should exist.
  Grep(pattern: "on[A-Z].*=.*\{(?!handle)", glob: "*.{jsx,tsx}") → these are potential violations.
  SEVERITY: LOW

CHECK (Kotlin): Callback parameters should use on-prefix.
  Grep(pattern: ":\s*\(\)\s*->\s*Unit", glob: "*.kt") → verify the parameter name starts with "on".
  SEVERITY: LOW
```

---

### D1.2 — IMPORT ORDERING

#### JS/TS Standard Order

```
Required grouping (one blank line between each group):
  1. Side-effect imports (import 'polyfill')
  2. Built-in/Node modules (import fs from 'fs')
  3. External packages (import React from 'react')
  4. Internal/aliased (@/ imports)
  5. Parent (../ imports)
  6. Sibling (./ imports)
  7. Styles (.css, .scss)
  8. Type-only imports

DETECT: Check the first 20 files for consistent import order.
  Grep(pattern: "^import ", glob: "*.{js,ts,jsx,tsx}") → sample results and evaluate.
  SEVERITY: LOW. This is auto-fixable with eslint-plugin-import/order or simple-import-sort.
```

#### Kotlin Standard Order

```
Kotlin imports should be a single ASCII-sorted block with no wildcard imports and no blank lines between imports.
  DETECT wildcards: Grep(pattern: "import .*\.\*$", glob: "*.kt")
  SEVERITY: LOW. Auto-fixable with ktlint.
```

---

### D1.3 — MAGIC NUMBERS

```
DETECT unexplained numeric literals:
  JS:     Grep(pattern: "[^0-9.][0-9]{2,}[^0-9dpx%]", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "[^0-9.][0-9]{2,}[^0-9dpsp]", glob: "*.kt")
  Exclude these values: 0, 1, -1, 100 (percentage), common CSS values (e.g. 16, 24, 48 when used as px).
  For each remaining result: check whether the number is explained by surrounding context or by a named constant.

FIX: Extract to a named constant at the appropriate scope.
  Before: if (retries > 3) { ... }
  After:  const MAX_RETRIES = 3; if (retries > MAX_RETRIES) { ... }

SEVERITY: MEDIUM for numbers in business logic. LOW for numbers in layout/styling code.
```

---

### D1.4 — COMMENT QUALITY

```
SCAN 1 — Commented-out code:
  JS:     Grep(pattern: "^\s*//\s*(const|let|var|function|return|if|for|import)", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "^\s*//\s*(val|var|fun|return|if|for|import|class)", glob: "*.kt")
  SEVERITY: MEDIUM. Delete commented-out code. Version control preserves history.

SCAN 2 — TODO/FIXME without ticket reference:
  Grep(pattern: "(TODO|FIXME|HACK|XXX|TEMP)", glob: "*.{js,ts,kt,jsx,tsx}")
  For each result: check whether it includes a ticket reference or author name.
  SEVERITY: MEDIUM when there is no ticket reference. LOW when a ticket is referenced.

SCAN 3 — Stale or inaccurate comments:
  Manual review. Look for comments that describe what the code used to do, not what it currently does.
  SEVERITY: HIGH. Inaccurate comments cause bugs because developers trust the comment over reading the code.

SCAN 4 — Obvious "what" comments:
  Look for comments that restate the code in English without adding any context.
  Example of useless comment: // Increment counter
  Example of useful comment:  // Apply 21% VAT as per EU Directive 2006/112/EC
  SEVERITY: NIT
```

---

### D1.5 — FILE ORGANIZATION

#### React Component Internal Order

```
CHECK: Components should follow a consistent internal ordering:
  1. Type definitions and interfaces
  2. Constants and static data
  3. useState declarations
  4. useRef declarations
  5. useContext and custom hooks
  6. useMemo and useCallback
  7. useEffect
  8. Event handlers (handle*)
  9. Helper and render functions
  10. Return JSX

DETECT: Sample 5 or more components. Check whether they follow the same internal order.
  If components are inconsistent with each other → SEVERITY: MEDIUM.
  If no discernible ordering pattern exists → SEVERITY: MEDIUM.
```

#### Kotlin Class Layout

```
CHECK: Classes should follow official Kotlin ordering:
  1. Property declarations and initializer blocks
  2. Secondary constructors
  3. Method declarations
  4. Companion object (always last)

DETECT: Grep(pattern: "companion object", glob: "*.kt") → verify it appears at the bottom of the class.
SEVERITY: LOW
```

---

### D1.6 — CONVENTION DRIFT

```
PROTOCOL: Sample 10 or more similar constructs across the codebase.
  Count how many follow Pattern A versus Pattern B.

Decision rules:
  - More than 80% follow one pattern → the minority instances are violations. Report them.
  - 50% to 80% follow one pattern → flag as "convention not established" and recommend the codebase standardize on the majority pattern.
  - Less than 50% follow one pattern → flag as "no convention exists" and recommend establishing one.

Constructs to check:
  - String quotes (single vs double)
  - Trailing commas (present vs absent)
  - Semicolons (present vs absent in JS)
  - Arrow functions vs function declarations
  - Error handling shape (try/catch patterns)

SEVERITY: LOW for cosmetic conventions. MEDIUM for behavioral pattern conventions.
```

---

## §D2 — Health & Hygiene

**Purpose:** Detect dead code, duplication, technical debt, code smells, dependency risks, test gaps, and maintenance traps. These findings represent the codebase's long-term sustainability.

---

### D2.1 — DEAD CODE

#### Detection Protocol

```
SCAN 1 — Dev artifacts in production code:
  JS:     Grep(pattern: "console\.(log|debug|info|table|dir)\(", glob: "*.{js,ts,jsx,tsx}")
          Grep(pattern: "\bdebugger\b", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "println\(|Log\.(d|v|i)\(", glob: "*.kt")
  SEVERITY: HIGH for production code (leaks internal information). LOW for dev-only code paths.
  FIX: Remove the statement, or gate it behind __DEV__ (JS) or BuildConfig.DEBUG (Kotlin).

SCAN 2 — Unused imports:
  JS:     Grep(pattern: "^import .* from", glob: "*.{js,ts,jsx,tsx}")
          Cross-reference: check whether each imported name is actually used in the file.
  Kotlin: Grep(pattern: "^import ", glob: "*.kt")
  SEVERITY: LOW. Auto-fixable.

SCAN 3 — Unused functions and variables:
  JS:     Grep(pattern: "^(export )?(function|const|let) \w+", glob: "*.{js,ts,jsx,tsx}")
          Cross-reference: check whether each exported name is imported anywhere.
          Run: Grep(pattern: "import.*{.*FUNCTION_NAME.*}", glob: "*.{js,ts,jsx,tsx}")
  Kotlin: Grep(pattern: "private (fun|val|var) \w+", glob: "*.kt")
          For private members: check usage within the same file only.
  SEVERITY: MEDIUM. Dead code confuses developers and bloats the bundle.

SCAN 4 — Commented-out code blocks (more than 2 lines):
  JS:     Grep(pattern: "^\s*/\*[\s\S]*?\*/", glob: "*.{js,ts}") — multi-line comments containing code
          Grep(pattern: "^\s*//.*[=;{}()\[\]]", glob: "*.{js,ts,jsx,tsx}") — single-line code comments
  Kotlin: Same patterns adapted for Kotlin syntax.
  SEVERITY: MEDIUM
  FIX: Delete. Version control preserves history.

SCAN 5 — Unreachable code:
  Grep(pattern: "return [^;]*;\n\s+\w", glob: "*.{js,ts}") — code after a return statement.
  SEVERITY: MEDIUM
```

---

### D2.2 — CODE DUPLICATION

#### Detection Protocol

```
SCAN 1 — Near-identical functions:
  Manual review. Find functions with the same structure but slightly different values.
  Evaluate: Are these TRUE duplicates (same concept, same reason to change)?
  Or are they ACCIDENTAL similarity (they will diverge in the future)?
  Rule: flag on the 3rd occurrence. Two occurrences alone are not necessarily duplication.

SCAN 2 — Copy-paste divergence:
  Find similar code blocks. Check whether one copy was updated and the other was not.
  This is the most dangerous form of duplication — silent inconsistency between copies.
  SEVERITY: HIGH for diverged copies. MEDIUM for still-identical copies.

SCAN 3 — Constant duplication:
  Grep(pattern: "['\"](SPECIFIC_VALUE)['\"]", glob: "*.{js,ts,kt}")
  Count occurrences. If the same string literal appears more than 3 times → extract to a named constant.
  SEVERITY: MEDIUM

SCAN 4 — Pattern duplication (React):
  Find components with more than 70% structural similarity.
  FIX: Extract a shared component with props, or use composition.
  SEVERITY: MEDIUM

ABSTRACTION WARNING:
  A valid finding is "wrong abstraction." If an existing abstraction has more than 3 boolean
  parameters controlling its behavior, the abstraction is likely wrong.
  The correct fix is: re-introduce duplication first, delete the boolean-heavy abstraction,
  then re-extract genuine shared patterns.
  SEVERITY of wrong abstraction: HIGH
```

---

### D2.3 — TECHNICAL DEBT CLASSIFICATION

```
For each identified debt item, classify it as one of these two types:

INERT DEBT — stable, rarely-modified code.
  Cost stays roughly constant over time.
  Priority: LOW. Only elevate if it blocks a planned feature.
  Example: a slightly verbose utility function that works correctly.

COMPOUNDING DEBT — frequently-changed code whose cost GROWS with each modification.
  Every new feature built on top deepens the coupling.
  Priority: HIGH. Fix before the cost multiplies further.
  Mark compounding debt with the label ⏱ COMPOUNDS.

  Compounding indicators (check for all of these):
  - Foundation coupling: other features are built directly on top of this code.
  - Terminology divergence: the same concept has different names in different files.
  - Schema without migration: stored data has no version field.
  - Test debt on hot code: frequently-modified code that has no tests.
  - Magic constants without registry: domain-specific values scattered across multiple files.
  SEVERITY: MEDIUM base. Add +1 if found on a hot path.
```

---

### D2.4 — CODE SMELLS

#### Detection Thresholds

```
GOD COMPONENT/CLASS:
  List all files with their line counts. Flag files exceeding these thresholds:
  React: count useState hooks per component. More than 5 = smell.
  React: count props. More than 10 = smell.
  Kotlin: count functions per class. More than 20 = smell.
  SEVERITY: HIGH

LONG FUNCTION/METHOD:
  JS: functions with more than 50 LOC warrant review. More than 100 LOC = definite smell.
  Kotlin: functions with more than 60 LOC warrant review. More than 100 LOC = definite smell.
  SEVERITY: MEDIUM

HIGH CYCLOMATIC COMPLEXITY:
  Count branches per function: if/else + switch cases + ternary + && short-circuit + catch blocks.
  More than 10 branches = hard to test and reason about. SEVERITY: MEDIUM.
  More than 15 branches = maintenance trap. SEVERITY: HIGH.

LONG PARAMETER LIST:
  More than 4 parameters → recommend introducing a parameter object or builder.
  SEVERITY: MEDIUM

DEEP NESTING:
  More than 4 levels of indentation in one function.
  Grep(pattern: "^\s{16,}", glob: "*.{js,ts,kt}") — 4+ levels.
  FIX: Use early returns, extract helper functions, or use guard clauses.
  SEVERITY: MEDIUM
```

---

### D2.5 — DEPENDENCY HEALTH

```
SCAN 1 — Outdated dependencies:
  JS:     Run: npm outdated (or compare package.json versions to latest).
  Kotlin: Compare build.gradle dependency versions to latest releases.
  SEVERITY: LOW (minor version behind). MEDIUM (major version behind). HIGH (known CVEs exist).

SCAN 2 — Security vulnerabilities:
  JS:     npm audit --audit-level=high
  Kotlin: Check Gradle dependency scan or Snyk results.
  SEVERITY: CRITICAL for known exploits. HIGH for known CVEs.

SCAN 3 — Unused dependencies:
  JS:     Run depcheck — it lists packages in package.json that are not imported anywhere.
  Kotlin: Manual check — dependencies in build.gradle not imported in any .kt file.
  SEVERITY: LOW (bundle bloat).

SCAN 4 — Heavy dependencies with lighter alternatives:
  moment (72KB) → recommend dayjs (2KB) or date-fns.
  lodash (full) → recommend lodash-es (tree-shakeable) or native methods.
  axios → recommend fetch (native, zero dependency).
  SEVERITY: MEDIUM for measurable bundle impact.

SCAN 5 — Abandoned dependencies:
  Check: no release in more than 18 months, single maintainer inactive, open CVEs unpatched.
  SEVERITY: MEDIUM to HIGH depending on criticality of the dependency.
```

---

### D2.6 — TEST COVERAGE GAPS

```
IDENTIFY critical paths that have no tests:
  1. Business logic functions (calculations, transformations, validations).
  2. State transitions (reducers, state machines).
  3. Data formatting (display functions, locale handling).
  4. Error handling paths (what happens on failure?).
  5. Edge cases in hot paths (empty arrays, null inputs, boundary values).

For each untested critical path:
  SEVERITY: HIGH if it contains business logic. MEDIUM if it is a utility. LOW if it is pure UI.

TESTING STRATEGY ASSESSMENT:
  Check for test files:
    JS:     Glob(pattern: "**/*.{test,spec}.{js,ts,jsx,tsx}")
    Kotlin: Glob(pattern: "**/test/**/*.kt")
  
  Count test files and compare to source files.
  Ratio below 0.3 = significant test gap. SEVERITY: MEDIUM.
  Ratio below 0.1 = critical test gap. SEVERITY: HIGH.
```

---

### D2.7 — MAINTENANCE TRAPS

```
TRAP 1 — Hidden side effects:
  Functions named get*/fetch*/calculate* that also WRITE to state, storage, or cache.
  DETECT: Grep for setState, localStorage, dispatch, or emit inside functions whose name starts with get, fetch, or calculate.
  SEVERITY: HIGH

TRAP 2 — Order-dependent initialization:
  Code that only works when functions are called in a specific sequence, with no enforcement mechanism.
  DETECT: Manual review of initialization flows.
  SEVERITY: HIGH

TRAP 3 — Load-bearing magic values:
  Constants whose specific values are critical to correctness but have no documentation explaining why.
  Changing them by a small amount would break unrelated functionality.
  DETECT: Constants used in more than 3 files with no documentation.
  SEVERITY: MEDIUM

TRAP 4 — Implicit coupling:
  Two modules that both read and write the same global state with no coordination between them.
  DETECT: Grep for shared state keys accessed from multiple files.
  SEVERITY: HIGH

TRAP 5 — Kotlin lateinit traps:
  lateinit var declarations that have no isInitialized check before access.
  DETECT: Grep(pattern: "lateinit var", glob: "*.kt")
  Cross-reference: Grep(pattern: "::.*\.isInitialized", glob: "*.kt")
  If no isInitialized check exists for a lateinit var → SEVERITY: HIGH
```

---

## §D3 — Optimization & Performance

**Purpose:** Detect algorithm inefficiency, over-memoization, under-memoization, bundle bloat, memory leaks, render bottlenecks, and startup problems. Performance findings are HIGH severity on hot paths, MEDIUM elsewhere.

---

### D3.1 — ALGORITHM EFFICIENCY

```
SCAN 1 — O(n²) patterns (find/filter/includes inside map/forEach):
  JS: Grep(pattern: "\.(map|forEach|filter|reduce)\(.*\.(find|filter|includes|indexOf)\(", glob: "*.{js,ts,jsx,tsx}")
  Also check multi-line patterns: find .map() calls, then look inside the callback for .find() or .includes().
  FIX: Build a Map or Set index first, then iterate once.
  SEVERITY: HIGH when data can exceed 100 items. MEDIUM otherwise.

SCAN 2 — Spread-in-reduce O(n²) allocations:
  Grep(pattern: "\.reduce\(.*\{\.\.\.acc", glob: "*.{js,ts,jsx,tsx}")
  FIX: Use Object.fromEntries(), Map, or a mutable accumulator inside the reduce callback.
  SEVERITY: MEDIUM

SCAN 3 — Repeated lookups without caching:
  Look for the same function called with the same arguments in a tight loop or render cycle.
  FIX: Cache the result in a variable before the loop. In React, use useMemo.
  SEVERITY: MEDIUM

SCAN 4 — Kotlin collection chain efficiency:
  Grep(pattern: "\.(filter|map|flatMap)\(.*\)\.(filter|map|flatMap)\(", glob: "*.kt")
  A chain of 3 or more operations on a List should use .asSequence() to avoid intermediate allocations.
  SEVERITY: MEDIUM on large data sets. LOW otherwise.

SCAN 5 — N+1 patterns:
  A loop that makes an individual async call per item instead of a single batch request.
  Grep(pattern: "for.*\{[\s\S]*await\s+fetch", glob: "*.{js,ts}")
  FIX: Use a batch request or Promise.all().
  SEVERITY: HIGH
```

---

### D3.2 — MEMOIZATION

#### React Memoization Audit

```
SCAN 1 — Unnecessary useMemo/useCallback:
  Find useMemo wrapping cheap operations (addition, string concatenation, simple filter on fewer than 20 items).
  When the overhead of memoization exceeds the cost of recomputation, the memoization is a net negative.
  SEVERITY: LOW

SCAN 2 — Missing memoization on expensive operations:
  Sorting or filtering arrays with more than 100 items, or complex transformations,
  inside the component body without useMemo.
  Check: Is this code executed on every render? Are the inputs stable?
  SEVERITY: MEDIUM

SCAN 3 — React.memo with unstable props:
  A component wrapped in React.memo that receives a new object, array, or function reference on every render.
  React.memo is useless when props fail shallow equality on every render.
  FIX: Stabilize props with useMemo/useCallback in the parent component, or remove React.memo.
  SEVERITY: MEDIUM

SCAN 4 — React Compiler compatibility:
  If React 19+ with the compiler enabled: manual useMemo and useCallback may be redundant.
  Check: Is react-compiler-runtime in the dependencies?
  If YES: manual memos are noise. Recommend removal unless a "use no memo" directive is needed.
  SEVERITY: LOW (informational)
```

#### Kotlin Memoization

```
SCAN 1 — Missing lazy initialization:
  Expensive computation in a property initializer that could use `by lazy`.
  Grep(pattern: "val \w+ = [A-Z]\w+\.", glob: "*.kt") → check whether the computation is expensive.
  SEVERITY: LOW

SCAN 2 — Sequence vs List:
  Grep(pattern: "\.(filter|map|flatMap)\(.*\)\.(filter|map)", glob: "*.kt")
  3 or more chained operations without .asSequence() = optimization opportunity.
  SEVERITY: MEDIUM on large data. LOW otherwise.
```

---

### D3.3 — BUNDLE SIZE (JS/TS)

```
SCAN 1 — Heavy imports:
  Grep(pattern: "import .* from ['\"]moment['\"]", glob: "*.{js,ts}") → recommend dayjs.
  Grep(pattern: "import .* from ['\"]lodash['\"]", glob: "*.{js,ts}") → recommend lodash-es or native methods.
  Grep(pattern: "import .* from ['\"]lodash/", glob: "*.{js,ts}") → OK (cherry-picked import).
  SEVERITY: MEDIUM

SCAN 2 — Missing code splitting:
  All routes in a single bundle without React.lazy or dynamic import().
  Grep(pattern: "React\.lazy\(|import\(", glob: "*.{js,ts,jsx,tsx}")
  If 0 results found AND the app has more than 3 routes → recommend code splitting.
  SEVERITY: MEDIUM

SCAN 3 — Barrel file re-exports pulling entire modules:
  index.ts files that re-export everything from a module.
  import { oneSmallThing } from '@/features/heavy-module' → pulls all exports.
  SEVERITY: MEDIUM

SCAN 4 — Side-effect imports blocking tree-shaking:
  Check whether package.json has "sideEffects": false.
  Look for import statements that exist solely for their side effects.
  SEVERITY: LOW
```

---

### D3.4 — MEMORY MANAGEMENT

```
SCAN 1 — Event listener leaks (JS):
  Grep(pattern: "addEventListener\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-reference: Grep(pattern: "removeEventListener\(", glob: "*.{js,ts,jsx,tsx}")
  Every addEventListener must have a matching removeEventListener.
  SEVERITY: HIGH in components (leaks on unmount).

SCAN 2 — Timer leaks:
  Grep(pattern: "setInterval\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-reference: Grep(pattern: "clearInterval\(", glob: "*.{js,ts,jsx,tsx}")
  Check: Is clearInterval called in a useEffect cleanup function?
  SEVERITY: HIGH

SCAN 3 — Blob URL leaks:
  Grep(pattern: "createObjectURL\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-reference: Grep(pattern: "revokeObjectURL\(", glob: "*.{js,ts,jsx,tsx}")
  SEVERITY: MEDIUM

SCAN 4 — useEffect without cleanup:
  Grep(pattern: "useEffect\(\s*\(\)\s*=>\s*\{", glob: "*.{jsx,tsx}")
  For each useEffect, check: does it create a subscription, timer, event listener, or abort controller?
  If YES and there is no return function → this is a leak.
  SEVERITY: HIGH

SCAN 5 — Android Context/Activity leaks:
  Grep(pattern: "private.*context|private.*activity", glob: "*.kt")
  Check: Is an Activity or Context reference stored in a ViewModel, Singleton, or companion object?
  SEVERITY: CRITICAL. This retains the entire Activity view hierarchy in memory.
  FIX: Use Application context, WeakReference, or remove the stored reference entirely.

SCAN 6 — Kotlin coroutine leaks:
  Grep(pattern: "GlobalScope\.", glob: "*.kt")
  SEVERITY: HIGH. GlobalScope is unstructured and has no lifecycle. It leaks.
  FIX: Use viewModelScope or lifecycleScope instead.
```

---

### D3.5 — RENDER PERFORMANCE

#### React Re-render Audit

```
SCAN 1 — Unstable references in JSX:
  Grep(pattern: "=\{\(\) =>|=\{\{|=\{\[", glob: "*.{jsx,tsx}")
  A new arrow function, new object, or new array created every render.
  When passed to a React.memo child, this defeats the memoization.
  SEVERITY: MEDIUM

SCAN 2 — Context value without useMemo:
  Grep(pattern: "<\w+Context\.Provider value=\{\{", glob: "*.{jsx,tsx}")
  An inline object in the Provider value causes all consumers to re-render on every render.
  FIX: Wrap the value in useMemo.
  SEVERITY: HIGH. Blast radius = all context consumers.

SCAN 3 — Array index as key:
  Grep(pattern: "key=\{(i|index|idx)\}", glob: "*.{jsx,tsx}")
  SEVERITY: MEDIUM. Causes DOM state leaks on reorder or insert.
  FIX: Use a stable unique identifier as the key.

SCAN 4 — Derived state in useEffect (double render):
  Pattern: useState + useEffect that sets state based on other state or props.
  This causes: render → effect runs → setState → re-render (two renders instead of one).
  FIX: Compute the derived value during render using useMemo or inline computation.
  SEVERITY: MEDIUM
```

#### Android Render Audit

```
SCAN 1 — Nested layout depth:
  Grep(pattern: "<(LinearLayout|RelativeLayout|FrameLayout)", glob: "*.xml")
  More than 3 levels of nesting → recommend ConstraintLayout.
  SEVERITY: MEDIUM

SCAN 2 — RecyclerView without DiffUtil:
  Grep(pattern: "notifyDataSetChanged\(\)", glob: "*.kt")
  FIX: Use ListAdapter with DiffUtil.ItemCallback.
  SEVERITY: HIGH. notifyDataSetChanged causes a full rebuild instead of a minimal update.

SCAN 3 — Main thread blocking:
  Grep(pattern: "Room\.|\.readText\(\)|\.writeText\(\)|URL\(.*\.openConnection", glob: "*.kt")
  Check: Is this code inside a coroutine with Dispatchers.IO?
  If it runs on the Main thread → SEVERITY: CRITICAL (ANR risk).
```

---

### D3.6 — STARTUP OPTIMIZATION (Android)

```
SCAN 1 — Heavy Application.onCreate():
  Grep(pattern: "class \w+ : Application\(\)", glob: "*.kt") → read the onCreate method.
  Check: Is there synchronous heavy work? (Room.databaseBuilder.build, analytics init, image loader init)
  FIX: Defer non-critical initialization to a background thread with Dispatchers.IO.
  SEVERITY: HIGH

SCAN 2 — Missing Baseline Profiles:
  Glob(pattern: "**/baseline-prof.txt") → if missing, recommend adding one.
  Grep(pattern: "BaselineProfileRule", glob: "*.kt") → if missing in test/.
  SEVERITY: MEDIUM. Baseline profiles provide approximately 30% startup improvement.

SCAN 3 — Splash screen configuration:
  Grep(pattern: "installSplashScreen\(\)|SplashScreen", glob: "*.kt")
  Android 12+ requires the SplashScreen API. If missing, the app shows a white flash on launch.
  SEVERITY: MEDIUM
```

---

## §D4 — Structure & Architecture

**Purpose:** Detect SRP violations, coupling problems, god components, prop drilling, circular dependencies, wrong abstractions, and structural decay. Architecture findings compound over time — each one makes every future change harder.

---

### D4.1 — SINGLE RESPONSIBILITY

```
SCAN 1 — God components and classes:
  List all files with LOC counts. Flag:
    JS/React: files with more than 300 LOC per component.
    Kotlin:   files with more than 600 LOC per class.
  
  For each flagged file, count:
    React: useState calls (more than 5 = smell), props (more than 10 = smell), useEffect calls (more than 3 = smell).
    Kotlin: function count (more than 20 = smell), injected dependencies (more than 5 = smell).
  SEVERITY: HIGH

  FIX strategy — decompose in this order (safest changes first):
    1. Extract pure utility functions (no state, no side effects).
    2. Extract custom hooks (state + logic without UI).
    3. Extract sub-components (focused UI pieces).
    4. Extract to compound component pattern (when there is a prop explosion).

SCAN 2 — "And" test:
  For the 10 largest files, write a one-sentence description of what each file does.
  If the description requires the word "and" → this is likely an SRP violation.
  Example: "Fetches user data AND transforms it AND renders the profile AND handles editing"
  → that file has at least 3 responsibilities.
  SEVERITY: HIGH

SCAN 3 — Mixed concerns in single function:
  Functions that both compute a return value AND produce side effects.
  Grep(pattern: "function.*\{[\s\S]*setState.*[\s\S]*return\s+[^;]", glob: "*.{jsx,tsx}")
  A function that both mutates state AND returns a value should be split into two functions.
  SEVERITY: MEDIUM
```

---

### D4.2 — MODULE BOUNDARIES & COUPLING

```
SCAN 1 — Circular dependencies:
  JS: Check imports for cycles. Module A imports from B, and B imports from A.
  Grep(pattern: "import .* from", glob: "*.{js,ts,jsx,tsx}") → build an import graph.
  Look for mutual imports between any pair of files.
  SEVERITY: HIGH. Circular dependencies break tree-shaking and cause subtle initialization bugs.

SCAN 2 — Dependency direction violations:
  Correct direction: UI → Logic → Data → Domain (dependencies point INWARD).
  Check: Does any utility or data file import from a UI or component file? If YES → violation.
  Check: Does any shared module import from a feature module? If YES → violation.
  SEVERITY: HIGH

SCAN 3 — Feature leaking:
  Feature A directly imports an internal module from Feature B,
  instead of using Feature B's public API (barrel export or interface).
  Grep(pattern: "from '.*features/(?!CURRENT_FEATURE).*/'", glob: "*.{js,ts}")
  SEVERITY: MEDIUM

SCAN 4 — Coupling via shared mutable state:
  Two or more modules both reading AND writing the same state.
  Grep for shared state keys (localStorage keys, context, global store)
  accessed from multiple feature directories.
  SEVERITY: HIGH. This creates invisible coupling and race conditions.
```

---

### D4.3 — FILE & FOLDER ORGANIZATION

```
ASSESS the current structure type:
  FLAT: everything in src/ with no subdirectories → acceptable for fewer than 10 files.
  TECHNICAL: components/, hooks/, utils/, services/ → acceptable for fewer than 30 files.
  FEATURE-BASED: features/auth/, features/payment/ → recommended for 30 or more files.
  
  If file count exceeds 30 AND the structure is FLAT or TECHNICAL:
    Recommend migration to feature-based organization.
    SEVERITY: MEDIUM. Impacts developer navigation speed.
    FIX: Group files by feature domain. Keep a shared/ directory for cross-cutting code.

COLOCATION CHECK:
  Are test files located next to source files? (preferred)
  Or are they in a separate __tests__/ directory tree? (acceptable)
  Are style files located next to components? (preferred)
  SEVERITY: LOW

ANDROID STRUCTURE CHECK:
  Grep(pattern: "package ", glob: "*.kt") → map the package hierarchy.
  Recommended structure: ui/, data/, domain/, di/.
  Check: Are ViewModels in the ui/ package? Are Repositories in data/? Are UseCases in domain/?
  SEVERITY: MEDIUM when concerns are mixed across wrong packages.
```

---

### D4.4 — COMPONENT ARCHITECTURE (React)

```
SCAN 1 — Prop drilling depth:
  Trace props from their source to their final consumer.
  If more than 2 intermediate components just pass the prop through without using it → prop drilling.
  FIX: Use React Context for cross-cutting data (theme, auth), or use component composition.
  SEVERITY: MEDIUM

SCAN 2 — Component composition opportunities:
  Components with more than 5 boolean props controlling layout variants.
  FIX: Use children/slots pattern (compound components).
  SEVERITY: MEDIUM

SCAN 3 — Hook architecture:
  Find all custom hooks. Verify each one:
    - Does it do ONE thing (single responsibility)?
    - Does it return a stable interface (shape does not change between renders)?
    - Does it avoid mixing unrelated state?
  A custom hook with more than 5 useState calls = god hook. Split it.
  SEVERITY: MEDIUM

SCAN 4 — Unused or over-abstracted components:
  Components used exactly once → may not need extraction into a separate file.
  Components with more than 5 configuration props but only 1 usage → premature abstraction.
  SEVERITY: LOW (informational)
```

---

### D4.5 — STATE ARCHITECTURE

#### React State Decision Audit

```
Check each piece of state against this decision tree:

  Question 1: Is this server data?
    If YES → it should use TanStack Query or SWR, not useState or Redux.
    Grep(pattern: "useState.*fetch|useEffect.*fetch.*setState", glob: "*.{jsx,tsx}")
    If found → SEVERITY: MEDIUM. Recommend a server state library.

  Question 2: Is this value derivable from other state?
    If YES → it should be computed during render, not stored as separate state.
    Grep(pattern: "useEffect\(.*set\w+\(.*\)", glob: "*.{jsx,tsx}")
    Pattern: "useEffect that sets state based on other state" = derived state anti-pattern.
    SEVERITY: HIGH. Causes double renders and state synchronization bugs.

  Question 3: Is this state used only by one component?
    If YES → it should be useState in that component, not in a global store.
    Redux/Zustand stores containing form input state or UI toggles = over-lifted state.
    SEVERITY: MEDIUM

  Question 4: Is this state used by distant components?
    If YES → use Context or an external store.
    Check: Is the Context provider wrapping too many components? (large re-render blast radius)
    SEVERITY: MEDIUM when the context scope is too broad.
```

#### Kotlin State Architecture Audit

```
CHECK ViewModel patterns:
  Grep(pattern: "class \w+ViewModel", glob: "*.kt")
  For each ViewModel, verify:
    - It uses StateFlow for UI state (preferred over LiveData for new code).
    - It exposes an immutable StateFlow publicly (not MutableStateFlow).
    - It uses SharedFlow for one-time events (not LiveData, which replays on rotation).
    
  DETECT exposed MutableStateFlow:
    Grep(pattern: "val \w+\s*=\s*MutableStateFlow", glob: "*.kt")
    Correct pattern: private val _state = MutableStateFlow(initial); val state = _state.asStateFlow()
    SEVERITY: HIGH. External code can mutate this directly, which breaks single source of truth.

  DETECT LiveData used for events:
    Grep(pattern: "MutableLiveData.*Event|LiveData.*navigation|LiveData.*snackbar", glob: "*.kt")
    SEVERITY: MEDIUM. Events replay on screen rotation. Use SharedFlow(replay=0) instead.
```

---

### D4.6 — ABSTRACTION QUALITY

```
SCAN 1 — Wrong abstraction signals:
  Functions or components with more than 3 boolean parameters controlling behavior.
  Grep(pattern: "function \w+\(.*boolean.*boolean.*boolean|: Boolean.*: Boolean.*: Boolean", glob: "*.{js,ts,kt}")
  This indicates the abstraction is trying to do too many different things.
  SEVERITY: HIGH
  FIX: Re-introduce duplication. Delete the boolean-heavy abstraction. Re-extract genuine shared patterns.

SCAN 2 — Over-abstraction signals:
  An abstraction used in exactly 1 place.
  A wrapper that passes through to an inner component or function with no added logic.
  SEVERITY: LOW

SCAN 3 — Under-abstraction signals:
  The same pattern repeated 3 or more times without a shared implementation.
  The same validation logic in multiple handlers.
  The same formatting logic in multiple display components.
  SEVERITY: MEDIUM on the 3rd occurrence.
```

---

## §D5 — Logic & Correctness

**Purpose:** Detect type coercion bugs, floating-point errors, null/NaN propagation, boundary failures, state machine impossible states, and temporal bugs. Logic findings are HIGH to CRITICAL because they produce wrong output.

---

### D5.1 — TYPE SAFETY

#### JS/TS Type Audit

```
SCAN 1 — Loose equality (== instead of ===):
  Grep(pattern: "[^=!]==[^=]", glob: "*.{js,ts,jsx,tsx}")
  Exclude: == null (acceptable in non-strict codebases for null/undefined check).
  SEVERITY: HIGH. Type coercion rules are unintuitive ("0" == false evaluates to true).
  FIX: Replace with ===.

SCAN 2 — || where ?? is needed (falsy vs nullish):
  Grep(pattern: "\|\|", glob: "*.{js,ts,jsx,tsx}")
  For each result, check: Can the left operand be 0 (number), "" (empty string), or false (boolean)?
  If YES → the || operator will discard the valid falsy value and use the fallback instead.
  FIX: Replace with ?? for nullish-only coalescing.
  SEVERITY: HIGH. Values 0, "", and false are all valid values that || treats as falsy.

  Concrete examples of this bug:
    count || "No items"     → when count=0, this produces "No items" (WRONG, should produce 0)
    input || "Anonymous"    → when input="", this produces "Anonymous" (WRONG, should produce "")
    enabled || true         → when enabled=false, this produces true (WRONG, should produce false)
  
  Correct fix:
    count ?? "No items"     → when count=0, this produces 0 (CORRECT)

SCAN 3 — TypeScript any/unknown escape hatches:
  Grep(pattern: ": any\b|as any\b", glob: "*.{ts,tsx}")
  Count all occurrences. Each one is a type safety hole.
  SEVERITY: MEDIUM per occurrence. HIGH when more than 10 total or when found in critical paths.

SCAN 4 — Missing strict TypeScript flags:
  Read tsconfig.json. Check for these flags:
    "strict": true (minimum requirement)
    "noUncheckedIndexedAccess": true (arr[0] returns T | undefined)
    "noImplicitReturns": true
    "noFallthroughCasesInSwitch": true
  Each missing flag = MEDIUM finding.

SCAN 5 — Unsafe array access:
  Grep(pattern: "\w+\[0\]|\w+\[\w+\]", glob: "*.{js,ts,jsx,tsx}")
  For each result: Is the array guaranteed to have that index?
  arr[0] on a possibly-empty array produces undefined, which then propagates.
  SEVERITY: MEDIUM
```

#### Kotlin Null Safety Audit

```
SCAN 1 — !! operator abuse:
  Grep(pattern: "!!", glob: "*.kt")
  Count and list all occurrences.
  For each: Is there a programmatic guarantee of non-null BEFORE the !! usage?
  If there is no guarantee → SEVERITY: HIGH. This will throw NullPointerException at runtime.
  FIX: Use safe call + elvis operator (?:), requireNotNull() with a message, or smart cast.

SCAN 2 — Platform types from Java interop:
  Grep(pattern: "import java\.|import javax\.|import android\.", glob: "*.kt")
  Java methods return platform types (e.g. String!) that compile without error but can NPE at runtime.
  Check: Are return values from Java APIs treated as nullable?
  SEVERITY: HIGH

SCAN 3 — lateinit without isInitialized:
  Grep(pattern: "lateinit var (\w+)", glob: "*.kt")
  Cross-reference: Grep(pattern: "::$1\.isInitialized", glob: "*.kt")
  If no isInitialized check exists → accessing the property before initialization crashes.
  SEVERITY: HIGH

SCAN 4 — Unsafe casts:
  Grep(pattern: "\bas\b(?!\?)", glob: "*.kt") — this finds unsafe cast (as) while excluding safe cast (as?).
  SEVERITY: MEDIUM
  FIX: Use "as?" with a null check or elvis operator.
```

---

### D5.2 — FLOATING-POINT PRECISION

```
SCAN 1 — Float used for money:
  Grep(pattern: "price|cost|amount|total|balance|payment|fee|tax|discount", glob: "*.{js,ts,kt}")
  For each result: Is the value stored or computed as a float?
  If YES → SEVERITY: CRITICAL.
  FIX: Store monetary values as integer cents. Divide by 100 only at the final display step.
  Kotlin alternative: Use BigDecimal with an explicit RoundingMode.

SCAN 2 — Equality comparison on floats:
  JS:     Grep(pattern: "===?\s*0\.\d|===?\s*\d+\.\d", glob: "*.{js,ts}")
  Kotlin: Grep(pattern: "==\s*\d+\.\d", glob: "*.kt")
  FIX: Use epsilon comparison: Math.abs(a - b) < Number.EPSILON
  SEVERITY: MEDIUM

SCAN 3 — Accumulated rounding errors:
  A loop that performs repeated arithmetic on float values.
  The error compounds with each iteration.
  FIX: Perform computation on integers. Convert to float only at display time.
  SEVERITY: HIGH when the values are financial or scientific.
```

---

### D5.3 — NULL/NaN/UNDEFINED PROPAGATION

```
SCAN 1 — NaN creation and propagation:
  JS: Grep(pattern: "parseInt\(|parseFloat\(|Number\(|\.toFixed\(", glob: "*.{js,ts}")
  For each result: Is the return value checked for NaN before it is used in further computation?
  Example chain: parseInt("abc") → NaN → NaN * 1.08 → NaN → displays "$NaN" to user.
  FIX: Validate with Number.isNaN() (not the global isNaN() which coerces its argument).
  SEVERITY: HIGH

SCAN 2 — Unsafe isNaN usage:
  Grep(pattern: "[^.]isNaN\(|[^r]isNaN\(", glob: "*.{js,ts}")
  Global isNaN("abc") returns true (coerces the argument). Number.isNaN("abc") returns false (correct behavior).
  FIX: Always use Number.isNaN().
  SEVERITY: MEDIUM

SCAN 3 — JSON.stringify data loss:
  JSON.stringify({v: undefined}) → '{}' — the key disappears silently.
  JSON.stringify({v: Infinity}) → '{"v":null}' — silent data loss.
  JSON.stringify({v: NaN}) → '{"v":null}' — silent data loss.
  Check: Can these values exist in the serialized data?
  SEVERITY: HIGH when data is persisted or transmitted over a network.

SCAN 4 — Optional chaining without fallback:
  user?.address?.city used directly in a computation without a ?? fallback value.
  The result is undefined. If used in math, it becomes NaN.
  SEVERITY: MEDIUM
```

---

### D5.4 — BOUNDARY VALUES

```
For each function that accepts numeric input, mentally test these boundary values:
  0, 1, -1
  Maximum valid value
  Maximum valid value + 1
  null, undefined, NaN
  Empty string (for string inputs)
  Empty array (for collection inputs)

SCAN 1 — Off-by-one patterns:
  Grep(pattern: "< \w+\.length|<= \w+\.length|> 0|>= 0|== 0|=== 0", glob: "*.{js,ts,kt}")
  For each result: Is the boundary inclusive or exclusive? Is it correct for this use case?
  arr.length used as an index = out of bounds (the correct last index is length - 1).
  SEVERITY: HIGH

SCAN 2 — Division without zero check:
  Grep(pattern: "/ \w+| /\w+", glob: "*.{js,ts,kt}")
  For each result: Can the divisor be 0?
  JS behavior: 1/0 produces Infinity (no crash, but wrong result). 0/0 produces NaN.
  Kotlin behavior: Integer division by zero throws ArithmeticException. Double division by zero produces Infinity.
  SEVERITY: HIGH
```

---

### D5.5 — STATE MACHINE CORRECTNESS

```
SCAN 1 — Boolean soup (impossible states are representable):
  Grep(pattern: "isLoading.*isError|isError.*isLoading|status.*loading.*error", glob: "*.{js,ts,jsx,tsx}")
  Check: Can isLoading AND isError both be true at the same time?
  If YES → the data model allows impossible states. This is a design bug.
  FIX: Use a discriminated union (JS/TS) or sealed class (Kotlin).

  JS/TS fix:
    type State = 
      | { status: "idle" }
      | { status: "loading" }
      | { status: "success"; data: T }
      | { status: "error"; error: Error };

  Kotlin fix:
    sealed class UiState {
      object Idle : UiState()
      object Loading : UiState()
      data class Success(val data: T) : UiState()
      data class Error(val error: Throwable) : UiState()
    }
  SEVERITY: HIGH

SCAN 2 — Exhaustiveness gaps:
  switch/when statements on state that do not handle all cases.
  TS: Enable noFallthroughCasesInSwitch to catch missing cases at compile time.
  Kotlin: when() without else on non-sealed types produces a compiler warning.
  SEVERITY: MEDIUM
```

---

### D5.6 — TEMPORAL CORRECTNESS

```
SCAN 1 — Hardcoded time constants:
  Grep(pattern: "86400|3600|60000|1440|525600", glob: "*.{js,ts,kt}")
  86400 (seconds in a day) is WRONG across DST transitions.
  FIX: Use a date library (date-fns for JS, java.time for Kotlin) for calendar arithmetic.
  SEVERITY: MEDIUM

SCAN 2 — Date without timezone:
  JS: Grep(pattern: "new Date\(\)|Date\.now\(\)", glob: "*.{js,ts}")
  Check: Is the timezone context clear? Is UTC used for storage?
  SEVERITY: MEDIUM

SCAN 3 — Stale hardcoded dates:
  Grep(pattern: "202[0-9]|201[0-9]", glob: "*.{js,ts,kt}")
  Check: Are any of these dates in the past but used for future-oriented logic?
  SEVERITY: MEDIUM when past dates are used for future logic.
```

---

## §D6 — State Management & Data Integrity

**Purpose:** Detect SSOT violations, derived state anti-patterns, mutation bugs, stale closures, schema migration gaps, and concurrent state corruption. State bugs are the hardest to debug because they produce intermittent, unreproducible failures.

---

### D6.1 — SINGLE SOURCE OF TRUTH

```
SCAN 1 — Duplicated state (same data stored in two places):
  Check: Is the same value stored in BOTH:
    - Parent useState AND child useState?
    - Redux/Zustand store AND component state?
    - Server response cache AND manual state?
    - URL params AND store?
  If YES → synchronization drift is inevitable.
  SEVERITY: CRITICAL

SCAN 2 — Prop-to-state copy (React anti-pattern):
  Grep(pattern: "useState\(props\.|useState\(.*\bprops\b", glob: "*.{jsx,tsx}")
  This copies a prop value into local state. The local state will not update when the prop changes.
  FIX: Use the prop directly. Or use a key prop to reset the component state when the prop changes.
  SEVERITY: HIGH

SCAN 3 — Kotlin exposed mutable state:
  Grep(pattern: "val \w+\s*=\s*MutableStateFlow|val \w+\s*=\s*MutableLiveData", glob: "*.kt")
  Check: Is the MutableStateFlow or MutableLiveData public? Can external code mutate it?
  FIX: private val _state = MutableStateFlow(X); val state = _state.asStateFlow()
  SEVERITY: HIGH
```

---

### D6.2 — DERIVED STATE

```
SCAN 1 — useEffect for derived state (the most common React state anti-pattern):
  PATTERN that constitutes this bug:
    const [items, setItems] = useState([]);
    const [filtered, setFiltered] = useState([]);
    useEffect(() => { setFiltered(items.filter(match)); }, [items]);
  
  DETECT:
    Grep(pattern: "useEffect\(.*=>\s*\{[\s\S]*?set[A-Z]\w+\(", glob: "*.{jsx,tsx}")
    For each result: Does the effect ONLY set state based on other state or props?
    If YES → this is derived state computed via an effect. It causes a double render and sync bugs.
  
  FIX:
    const filtered = useMemo(() => items.filter(match), [items]);
    Or, if the computation is cheap: const filtered = items.filter(match);
  SEVERITY: HIGH

SCAN 2 — Kotlin stored derived state:
  ViewModel stores a computed value instead of deriving it from the source flow.
  Grep(pattern: "\.collect\s*\{[\s\S]*?_\w+\.value\s*=", glob: "*.kt")
  For each result: Is the collected value just a transformation of another flow?
  FIX: Use Flow.combine or Flow.map instead of collecting and storing.
  SEVERITY: MEDIUM
```

---

### D6.3 — MUTATION & REFERENCE INTEGRITY

```
SCAN 1 — Direct state mutation (React):
  Grep(pattern: "\.push\(|\.pop\(|\.splice\(|\.sort\(\)|\.reverse\(\)", glob: "*.{jsx,tsx}")
  For each result: Is this called on a state variable or a state-derived array?
  state.items.push(x) mutates the array. React does not detect this change. No re-render occurs.
  FIX: setItems(prev => [...prev, x])
  SEVERITY: CRITICAL

SCAN 2 — Shallow copy pitfall:
  Grep(pattern: "\{\.\.\.state|\.\.\.user|\.\.\.data\}", glob: "*.{js,ts,jsx,tsx}")
  For each result: Does the spread target contain nested objects?
  {...state, user: {...state.user}} — the spread is shallow. Nested objects still share references.
  state.user.address.city = 'X' mutates the original object.
  FIX: Use Immer's produce(), or structuredClone().
  SEVERITY: HIGH

SCAN 3 — Kotlin data class copy with nested mutation:
  Grep(pattern: "\.copy\(", glob: "*.kt")
  copy() is shallow. Nested objects inside the data class share the same reference.
  state.copy(user = state.user) — the user object is the SAME instance.
  FIX: Deep copy nested objects, or use immutable data structures.
  SEVERITY: HIGH
```

---

### D6.4 — STALE CLOSURES (React)

```
SCAN 1 — Missing useEffect dependencies:
  Grep(pattern: "useEffect\(", glob: "*.{jsx,tsx}")
  For each useEffect:
    List all state and prop variables referenced inside the callback.
    Check the dependency array — are ALL referenced variables included?
    A missing dependency = stale closure. The effect uses a value captured from an OLD render.
  
  SEVERITY: HIGH. This is the most common React hooks bug.
  FIX: Add the missing dependency. Or use a functional state update: setState(prev => prev + 1).

SCAN 2 — Stale closure in event handlers:
  An event handler defined inside a component that references state
  without useCallback or a functional update pattern.
  Check: Does the handler use a state value that could be stale?
  SEVERITY: MEDIUM

SCAN 3 — eslint-disable for exhaustive-deps:
  Grep(pattern: "eslint-disable.*exhaustive-deps", glob: "*.{jsx,tsx}")
  Each suppression is a potential stale closure. Review every single one.
  SEVERITY: HIGH per suppression. Treat each as a confirmed bug until you verify otherwise.
```

---

### D6.5 — PERSISTENCE & SCHEMA

```
SCAN 1 — Persistence without schema version:
  JS: Grep(pattern: "localStorage\.(set|get)Item", glob: "*.{js,ts}")
      Check: Is there a schema version stored alongside the data?
      Without a version field → there is no migration path → breaking changes will lose user data.
  Kotlin: Grep(pattern: "SharedPreferences|getSharedPreferences", glob: "*.kt")
  SEVERITY: MEDIUM. This debt compounds with every release (⏱ COMPOUNDS).

SCAN 2 — JSON.parse without try/catch:
  Grep(pattern: "JSON\.parse\((?!.*catch|.*try)", glob: "*.{js,ts}")
  Corrupted localStorage data → crash on app load → data loss.
  FIX: Wrap in try/catch. Return a default value on failure.
  SEVERITY: HIGH

SCAN 3 — Room migration gaps (Android):
  Grep(pattern: "fallbackToDestructiveMigration", glob: "*.kt")
  SEVERITY: CRITICAL. This deletes all user data when the database schema changes.
  FIX: Write explicit Migration objects. Test with MigrationTestHelper.

SCAN 4 — localStorage quota awareness:
  Grep(pattern: "localStorage\.setItem", glob: "*.{js,ts}")
  Check: Is QuotaExceededError handled?
  localStorage has a 5MB limit. If exceeded, setItem throws. If unhandled, the app crashes.
  SEVERITY: MEDIUM
```

---

### D6.6 — CONCURRENT STATE RISKS

```
SCAN 1 — Multi-tab state conflicts (JS):
  Grep(pattern: "localStorage", glob: "*.{js,ts}")
  Check: Can the app be open in multiple tabs? Do the tabs share localStorage?
  If YES → there is a race condition on read/write operations.
  FIX: Listen to the 'storage' event, or use BroadcastChannel for synchronization.
  SEVERITY: MEDIUM

SCAN 2 — Double-submit on rapid clicks:
  Grep(pattern: "onClick.*=.*\{[\s\S]*?fetch\(|onClick.*=.*\{[\s\S]*?dispatch\(", glob: "*.{jsx,tsx}")
  Check: Is the button disabled during the async operation?
  Is there a loading state that prevents re-entry?
  FIX: Set loading state before the async call. Disable the button.
  SEVERITY: HIGH

SCAN 3 — Android process death state loss:
  Grep(pattern: "class \w+ViewModel", glob: "*.kt")
  Check: Does the ViewModel use SavedStateHandle for critical UI state?
  Critical UI state includes: form inputs, scroll position, selected tab, filter state.
  Without SavedStateHandle → this state is lost when Android kills the process.
  SEVERITY: HIGH for user-input state. MEDIUM for navigation state.

SCAN 4 — Configuration change state loss:
  Check: Does the app handle screen rotation and dark mode toggle?
  The Activity is recreated on configuration changes. Anything NOT in a ViewModel is lost.
  Grep(pattern: "var \w+\s*=.*(?:mutableListOf|arrayListOf|HashMap)", glob: "*.kt")
  If this declaration is in an Activity or Fragment (not a ViewModel) → it is lost on config change.
  SEVERITY: HIGH
```

---

## §D7 — Error Handling & Resilience

**Purpose:** Detect empty catches, missing error boundaries, swallowed exceptions, absent retry logic, crash-on-network-failure patterns, and unhandled promise rejections. Error handling has the highest bug density of any dimension.

---

### D7.1 — TRY/CATCH COVERAGE

```
SCAN 1 — JSON.parse without try/catch:
  Grep(pattern: "JSON\.parse\(", glob: "*.{js,ts,jsx,tsx}")
  Cross-reference: Is each JSON.parse inside a try block?
  Any JSON.parse on untrusted input without try/catch will crash when input is malformed.
  SEVERITY: HIGH
  FIX: try { JSON.parse(x) } catch { return defaultValue; }

SCAN 2 — Async operations without error handling:
  JS: Grep(pattern: "await\s+\w+", glob: "*.{js,ts,jsx,tsx}")
  For each result: Is the await inside a try/catch block OR chained with .catch()?
  An unhandled async error becomes an unhandled promise rejection → silent failure or crash.
  SEVERITY: HIGH

SCAN 3 — Empty catch blocks:
  JS:     Grep(pattern: "catch\s*\(\w*\)\s*\{\s*\}", glob: "*.{js,ts}")
  Kotlin: Grep(pattern: "catch\s*\(\w+:\s*\w+\)\s*\{\s*\}", glob: "*.kt")
  A swallowed error is an invisible bug. At minimum: log the error, or rethrow it.
  SEVERITY: HIGH

SCAN 4 — Over-broad catch:
  JS:     catch(e) that catches ALL errors including programmer bugs.
  Kotlin: Grep(pattern: "catch\s*\(\w+:\s*Exception\)", glob: "*.kt")
  Should catch specific exceptions, not generic Exception.
  SEVERITY: MEDIUM

SCAN 5 — Kotlin runCatching in suspend functions:
  Grep(pattern: "runCatching\s*\{", glob: "*.kt")
  Check: Is this inside a suspend function?
  runCatching swallows CancellationException → creates a zombie coroutine → causes resource leaks.
  SEVERITY: CRITICAL
  FIX: Use explicit try/catch that rethrows CancellationException:
    try { ... } catch (e: CancellationException) { throw e } catch (e: Exception) { handle(e) }
```

---

### D7.2 — ERROR BOUNDARIES (React)

```
SCAN 1 — Error boundary existence:
  Grep(pattern: "ErrorBoundary|componentDidCatch|getDerivedStateFromError|react-error-boundary", glob: "*.{jsx,tsx}")
  If 0 results → the app has NO error boundaries. Any render error crashes the entire app.
  SEVERITY: HIGH

SCAN 2 — Error boundary placement:
  Check: Are boundaries placed at multiple levels?
    Route-level boundary: catches page-level crashes.
    Feature-level boundary: isolates individual widget failures.
    Third-party component boundary: protects against library bugs.
  A single top-level boundary only → the entire app goes blank on any component error.
  SEVERITY: MEDIUM

SCAN 3 — Error boundary limitation awareness:
  Error boundaries do NOT catch these error types:
    - Event handler errors
    - Async errors (setTimeout, fetch)
    - Server-side rendering errors
  Check: Are event handlers and async operations wrapped in their own try/catch?
  SEVERITY: MEDIUM (informational when not handled)
```

---

### D7.3 — ERROR PROPAGATION

```
SCAN 1 — Silent failures:
  Functions that return undefined or null on error instead of throwing or returning an error object.
  The user sees a blank or empty state instead of an error message.
  Check: Does every error path produce user-visible feedback?
  SEVERITY: HIGH

SCAN 2 — Error message quality:
  Grep(pattern: "catch.*\{[\s\S]*?(alert|toast|snackbar|setError)", glob: "*.{js,ts,kt}")
  For each error message, check:
    - Does the message explain WHAT went wrong? (Not just "Something went wrong")
    - Does the message suggest WHAT the user can do? (retry, check input, contact support)
    - Does the message avoid developer jargon? (No stack traces, no error codes shown to end users)
  SEVERITY: MEDIUM

SCAN 3 — Error types (Kotlin):
  Check: Are custom exception classes used for domain errors?
  Or is everything thrown as generic Exception or RuntimeException?
  FIX: Use a sealed class hierarchy for expected failures:
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
  A promise returned but not awaited or caught → unhandled rejection.
  SEVERITY: HIGH
  FIX: Add await, or .catch(), or the void keyword if intentionally fire-and-forget.

SCAN 2 — Async in non-async context:
  Grep(pattern: "onClick=\{async|onChange=\{async", glob: "*.{jsx,tsx}")
  Async event handlers that throw produce an unhandled promise rejection.
  Check: Is there a try/catch inside the async handler?
  SEVERITY: HIGH

SCAN 3 — Promise.all partial failure:
  Grep(pattern: "Promise\.all\(", glob: "*.{js,ts}")
  Promise.all fails fast — one rejection rejects the entire set.
  Check: Should this be Promise.allSettled() to tolerate partial failure?
  SEVERITY: MEDIUM
```

---

### D7.5 — RETRY & TIMEOUT

```
SCAN 1 — Network calls without timeout:
  JS: Grep(pattern: "fetch\(", glob: "*.{js,ts}")
      Check: Is an AbortController with setTimeout used?
      The fetch API has NO default timeout — it hangs forever on a dead server.
  Kotlin: Grep(pattern: "OkHttpClient|HttpURLConnection|Retrofit", glob: "*.kt")
      Check: Are connectTimeout, readTimeout, and writeTimeout configured?
  SEVERITY: HIGH
  
  FIX (JS):
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try { await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(timeout); }

SCAN 2 — Missing retry for transient failures:
  Check: Do network calls retry on 5xx errors or network errors?
  FIX: Implement exponential backoff with jitter:
    delay = min(baseDelay × 2^attempt + random(0, jitter), maxDelay)
    Maximum 3 to 5 attempts.
  SEVERITY: MEDIUM

SCAN 3 — Retry of non-idempotent operations:
  Check: Are POST/PUT/DELETE requests retried without an idempotency token?
  Retrying non-idempotent operations causes duplicate operations (double payment, double creation).
  SEVERITY: CRITICAL for mutation operations.
```

---

### D7.6 — NETWORK RESILIENCE

```
SCAN 1 — No offline handling:
  Check: What happens when the network is unavailable?
  Does the app show a blank screen? A spinner that never stops? A crash?
  FIX: Show cached or stale data with an offline indicator. Queue mutations for replay when online.
  SEVERITY: MEDIUM

SCAN 2 — No loading state:
  Grep(pattern: "fetch\(|await\s+\w+Api\.", glob: "*.{js,ts,kt}")
  Check: Is there a loading indicator displayed during the request?
  No user feedback for more than 200ms feels broken.
  SEVERITY: MEDIUM

SCAN 3 — Kotlin request cancellation on navigation:
  Grep(pattern: "viewModelScope\.launch\s*\{[\s\S]*?(fetch|api|repository)\.", glob: "*.kt")
  Check: viewModelScope auto-cancels when the ViewModel is cleared ✓
  Check: Is lifecycleScope used correctly with repeatOnLifecycle?
  Grep(pattern: "lifecycleScope\.launch\s*\{[\s\S]*?collect", glob: "*.kt")
  Correct pattern: lifecycleScope.launch { repeatOnLifecycle(STARTED) { flow.collect {} } }
  SEVERITY: HIGH when collecting without repeatOnLifecycle.
```

---

## §D8 — Async & Concurrency

**Purpose:** Detect race conditions, stale data from out-of-order responses, missing request cancellation, coroutine lifecycle bugs, useEffect cleanup gaps, and improper promise handling. Async bugs are intermittent and hard to reproduce. They must be caught by code analysis because they rarely appear in manual testing.

---

### D8.1 — RACE CONDITIONS

```
SCAN 1 — Check-then-act on async:
  Pattern: read a value → await something → use the value (the value may have changed during the await).
  JS example:
    const count = state.count;
    await saveData();
    setState({ count: count + 1 }); // STALE — count may have changed during the await
  FIX: Use a functional update: setState(prev => ({ count: prev.count + 1 }))
  SEVERITY: HIGH

SCAN 2 — Double-submit without guard:
  Grep(pattern: "onClick.*=.*\{[\s\S]*?await", glob: "*.{jsx,tsx}")
  Check: Is the button disabled or is a loading state set BEFORE the await call?
  Rapid clicks during an async operation → duplicate operations.
  FIX: Set loading=true synchronously before the await. Disable the button.
  SEVERITY: HIGH

SCAN 3 — Out-of-order responses:
  Component fetches data. User changes input. Component fetches again.
  The slow first response arrives AFTER the fast second response → stale data is displayed.
  
  Check: Is there cancellation of the previous request?
  Grep(pattern: "AbortController|controller\.abort", glob: "*.{js,ts,jsx,tsx}")
  If absent in fetch-on-change patterns → SEVERITY: HIGH
  
  Kotlin equivalent: Grep(pattern: "collectLatest|flatMapLatest", glob: "*.kt")
  If collecting user-triggered searches without the Latest variant → SEVERITY: HIGH

SCAN 4 — React 18 concurrent mode awareness:
  Grep(pattern: "startTransition|useTransition|useDeferredValue", glob: "*.{jsx,tsx}")
  If used → verify they are applied to non-urgent updates (search filtering, list updating).
  If NOT used on heavy re-renders → SEVERITY: LOW (optimization opportunity).
```

---

### D8.2 — REQUEST CANCELLATION

#### JS/React Cancellation

```
SCAN 1 — useEffect fetch without AbortController:
  Grep(pattern: "useEffect\(.*=>\s*\{[\s\S]*?fetch\(", glob: "*.{jsx,tsx}")
  Check: Does the effect return a cleanup function that calls controller.abort()?
  
  CORRECT PATTERN:
    useEffect(() => {
      const controller = new AbortController();
      fetch(url, { signal: controller.signal })
        .then(r => r.json()).then(setData)
        .catch(e => { if (e.name !== 'AbortError') throw e; });
      return () => controller.abort();
    }, [url]);
  
  Missing cleanup → the request completes after unmount → wasted bandwidth and potential errors.
  SEVERITY: HIGH

SCAN 2 — isMounted boolean instead of AbortController:
  Grep(pattern: "isMounted|mountedRef|isComponentMounted", glob: "*.{jsx,tsx}")
  isMounted only prevents setState. The request still runs to completion and consumes bandwidth.
  AbortController actually cancels the network request.
  SEVERITY: MEDIUM (works but wastes resources).
  FIX: Replace with the AbortController pattern.

SCAN 3 — Async in useEffect without cancellation awareness:
  Pattern:
    useEffect(() => {
      async function load() { const data = await fetchData(); setData(data); }
      load();
    }, []);
  This pattern provides no way to cancel fetchData on unmount.
  FIX: Pass AbortController.signal through to the async function, or use a boolean guard.
  SEVERITY: MEDIUM
```

#### Kotlin Cancellation

```
SCAN 1 — GlobalScope usage:
  Grep(pattern: "GlobalScope\.", glob: "*.kt")
  GlobalScope creates an unstructured coroutine with no lifecycle. It leaks.
  FIX: Use viewModelScope, lifecycleScope, or a custom CoroutineScope.
  SEVERITY: HIGH

SCAN 2 — CancellationException swallowing:
  Grep(pattern: "catch\s*\(\w+:\s*(Exception|Throwable)\)\s*\{(?![\s\S]*throw)", glob: "*.kt")
  A generic catch that does not rethrow CancellationException creates a zombie coroutine.
  SEVERITY: CRITICAL
  FIX: catch (e: CancellationException) { throw e } catch (e: Exception) { handle(e) }

SCAN 3 — Suspend in finally without NonCancellable:
  Grep(pattern: "finally\s*\{[\s\S]*?suspend|finally\s*\{[\s\S]*?delay|finally\s*\{[\s\S]*?emit", glob: "*.kt")
  Suspend functions in a finally block will not execute if the coroutine is already cancelled.
  FIX: withContext(NonCancellable) { /* cleanup */ }
  SEVERITY: HIGH

SCAN 4 — Blocking calls in coroutines:
  Grep(pattern: "Thread\.sleep|\.join\(\)|\.get\(\)|runBlocking", glob: "*.kt")
  Check: Is this inside a coroutine?
  Thread.sleep blocks the dispatcher thread. SEVERITY: HIGH.
  FIX: Use delay() instead of Thread.sleep(). Use withContext(Dispatchers.IO) for blocking IO.

SCAN 5 — Wrong dispatcher:
  Grep(pattern: "withContext\(Dispatchers\.(Main|IO|Default)\)", glob: "*.kt")
  Check: CPU-bound work on IO dispatcher? (wastes IO pool threads)
  Check: IO work on Main dispatcher? (blocks UI)
  Check: UI work on Default dispatcher? (crash — views cannot be touched from a background thread)
  SEVERITY: HIGH for Main-thread IO. MEDIUM for wrong pool.
```

---

### D8.3 — USEEFFECT CLEANUP (React)

```
SCAN 1 — Effects that create subscriptions without cleanup:
  Grep(pattern: "useEffect\(", glob: "*.{jsx,tsx}")
  For each useEffect, check: does it create any of these?
    addEventListener → needs removeEventListener in cleanup
    setInterval → needs clearInterval
    setTimeout → needs clearTimeout
    WebSocket → needs close()
    EventSource → needs close()
    observer.observe → needs observer.disconnect()
    subscription.subscribe → needs subscription.unsubscribe()
    AbortController → needs controller.abort()
  
  Check: Does the effect return a cleanup function?
  Grep inside useEffect for "return () =>" or "return function".
  
  Missing cleanup for any of the above = LEAK.
  SEVERITY: HIGH

SCAN 2 — Cleanup function ordering:
  Cleanup runs BEFORE the next effect execution AND on unmount.
  Check: Does the cleanup handle both cases correctly?
  A cleanup that only handles the "on unmount" case but not the "on dependency change" case = partial leak.
  SEVERITY: MEDIUM
```

---

### D8.4 — PROMISE PATTERNS (JS/TS)

```
SCAN 1 — Sequential await in loop (accidental serialization):
  Pattern: for (const item of items) { await processItem(item); }
  If items are independent → this serializes N requests instead of running them in parallel.
  FIX: await Promise.all(items.map(item => processItem(item)))
  SEVERITY: MEDIUM (performance)

SCAN 2 — Promise.all vs Promise.allSettled:
  Grep(pattern: "Promise\.all\(", glob: "*.{js,ts}")
  Promise.all: one rejection rejects all. Remaining results are lost.
  Promise.allSettled: returns all results (both fulfilled and rejected).
  Check: Is partial failure acceptable for this use case? If YES → use allSettled.
  SEVERITY: MEDIUM

SCAN 3 — Async forEach (fire-and-forget):
  Grep(pattern: "\.forEach\(async", glob: "*.{js,ts}")
  forEach does not await the returned promises. All callbacks fire in parallel with no control.
  FIX: Use for...of with await (for sequential). Or Promise.all(arr.map(...)) (for controlled parallel).
  SEVERITY: HIGH. This is almost always unintentional.

SCAN 4 — Missing Promise.race for timeouts:
  Long-running operations without a timeout.
  FIX: Promise.race([fetchData(), timeout(10000)])
  SEVERITY: MEDIUM
```

---

### D8.5 — DEBOUNCE & THROTTLE

```
SCAN 1 — Missing debounce on search/filter input:
  Grep(pattern: "onChange.*=.*\{[\s\S]*?(fetch|filter|search|query)", glob: "*.{jsx,tsx}")
  Check: Is there a debounce (200-500ms) before triggering the action?
  Typing "hello" without debounce fires 5 separate requests or computations.
  FIX: Use a useDebounce hook or lodash.debounce.
  SEVERITY: MEDIUM

SCAN 2 — Missing throttle on scroll/resize handlers:
  Grep(pattern: "addEventListener\(['\"]scroll|addEventListener\(['\"]resize", glob: "*.{js,ts}")
  Check: Is the handler throttled? Scroll events fire 60+ times per second.
  FIX: Use requestAnimationFrame or throttle(handler, 16).
  SEVERITY: MEDIUM

SCAN 3 — Debounce created in wrong location:
  Debounce created inside the component body creates a new instance on every render.
  Grep(pattern: "debounce\(|useMemo.*debounce", glob: "*.{jsx,tsx}")
  Check: Is the debounced function stable across renders?
  FIX: Use useMemo or useRef to persist the debounce instance.
  SEVERITY: HIGH. A new debounce instance on every render means the debounce has no effect.
```

---

### D8.6 — KOTLIN FLOW PATTERNS

```
SCAN 1 — Collecting Flow without lifecycle awareness:
  Grep(pattern: "\.collect\s*\{", glob: "*.kt")
  Check: Is the collection inside repeatOnLifecycle(STARTED)?
  Without a lifecycle gate → collection continues when the app is backgrounded → wasted resources and potential crashes.
  
  CORRECT PATTERN:
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { state -> updateUI(state) }
      }
    }
  SEVERITY: HIGH

SCAN 2 — StateFlow collected without collectAsState (Compose):
  Grep(pattern: "\.collect\s*\{[\s\S]*?mutableStateOf", glob: "*.kt")
  In Compose, use .collectAsStateWithLifecycle() instead of manual collection.
  SEVERITY: MEDIUM

SCAN 3 — SharedFlow replay for events:
  Grep(pattern: "MutableSharedFlow\(replay\s*=\s*[1-9]", glob: "*.kt")
  Events (navigation, snackbar) should use replay=0.
  replay greater than 0 → the event replays on new subscriber (e.g. after screen rotation).
  SEVERITY: HIGH for navigation and snackbar events.
```

---

## §CROSS — Cross-Cutting Compound Chains

**Purpose:** After auditing individual dimensions, trace failures ACROSS dimensions. A finding in one dimension often reveals or causes failures in others. Compound chains are escalated above individual severity because their combined impact is multiplicative.

---

### PROTOCOL

Execute this protocol after completing all requested dimensions:

```
Step 1: For each CRITICAL and HIGH finding, trace forward:
        What does this issue break downstream in other dimensions?

Step 2: For each CRITICAL and HIGH finding, trace backward:
        What upstream issue in another dimension causes or enables this issue?

Step 3: Document each chain using the CHAIN DOCUMENTATION FORMAT below.

Step 4: Escalate severity: a chain of 3 LOW findings can combine to HIGH severity.
```

---

### DOCUMENTED CHAIN PATTERNS

These are the 12 most common chain patterns. When you identify a finding, check whether it matches any of these patterns and trace the full chain.

#### Chain 1 — Validation → State → Logic → Display

```
TRIGGER: Missing input validation (§D5)
TRACE:
  [§D5 LOW]  Input "abc" accepted where number expected
  [§D5 HIGH] Computation uses NaN → all downstream math produces NaN
  [§D7 HIGH] No error handling catches the NaN
  → User sees "$NaN" or blank where a price should be

COMBINED SEVERITY: HIGH (escalated from LOW)
DETECT: Find validation gaps → trace the value through state → trace to display
```

#### Chain 2 — Type Coercion → Wrong Branch → Wrong Output

```
TRIGGER: || instead of ?? (§D5)
TRACE:
  [§D5 HIGH] count || "default" where count=0 is a valid value
  [§D5 HIGH] Falsy 0 triggers the fallback → wrong branch taken
  → User sees "default" instead of "0"

COMBINED SEVERITY: HIGH
DETECT: Every || usage → check whether the left operand can be 0, "", or false
```

#### Chain 3 — Stale Closure → Missing Dep → Silent Feature Break

```
TRIGGER: Missing useEffect dependency (§D6)
TRACE:
  [§D6 HIGH] Variable captured in closure but missing from dependency array
  [§D8 MED]  Effect does not re-run when the value changes
  [§D5 HIGH] Computation uses the stale value → produces wrong result
  → Feature appears to work but uses outdated data

COMBINED SEVERITY: HIGH (silent — no crash, just wrong output)
DETECT: Every eslint-disable exhaustive-deps → trace what value is stale → trace what uses it
```

#### Chain 4 — Mutation → Stale Reference → No Re-render → Data Loss

```
TRIGGER: Direct state mutation (§D6)
TRACE:
  [§D6 CRIT] array.push() called on a state array
  [§D3 HIGH] React does not detect the change (same reference)
  [§D6 HIGH] UI shows stale data
  [§D6 CRIT] On next legitimate state update, the mutation is overwritten → data loss

COMBINED SEVERITY: CRITICAL
DETECT: .push()/.splice()/.sort() on state → trace to UI → trace to persistence
```

#### Chain 5 — CancellationException Swallow → Zombie → Leak → OOM

```
TRIGGER: Generic catch swallows CancellationException (§D8)
TRACE:
  [§D8 CRIT] catch(e: Exception) without rethrow of CancellationException
  [§D8 HIGH] Coroutine continues executing after cancellation was requested
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
  [§D6 CRIT] If the handler modifies shared state → corrupts state for mounted components

COMBINED SEVERITY: HIGH to CRITICAL
DETECT: useEffect creating subscriptions → check for return cleanup → trace handler effects
```

#### Chain 7 — No Error Boundary → Render Error → White Screen

```
TRIGGER: Missing error boundary (§D7)
TRACE:
  [§D7 HIGH] No ErrorBoundary components in the app
  [§D5 MED]  Component receives an unexpected null prop
  [§D5 HIGH] .toString() on null → TypeError
  [§D7 CRIT] Unhandled error in render → entire React tree unmounts → white screen

COMBINED SEVERITY: CRITICAL
DETECT: ErrorBoundary count = 0 → any runtime error in any component = full app crash
```

#### Chain 8 — Out-of-Order Response → Stale Data Display

```
TRIGGER: Missing request cancellation (§D8)
TRACE:
  [§D8 HIGH] No AbortController on search-as-you-type
  [§D8 HIGH] User types "ab" then "abc" — two requests fire
  [§D8 HIGH] "abc" response arrives first (faster), then "ab" response arrives (slower)
  [§D6 HIGH] "ab" response overwrites "abc" results → wrong data displayed

COMBINED SEVERITY: HIGH
DETECT: Search/filter patterns → check for abort/cancel/collectLatest
```

#### Chain 9 — Process Death → State Loss → Data Loss

```
TRIGGER: Missing SavedStateHandle (§D6)
TRACE:
  [§D6 HIGH] Form data stored in ViewModel without SavedStateHandle
  [§D6 HIGH] Android kills the process in the background (memory pressure)
  [§D6 CRIT] User returns → ViewModel is recreated → form data is gone
  → User loses 5 minutes of work

COMBINED SEVERITY: HIGH to CRITICAL
DETECT: ViewModel with form state → check SavedStateHandle usage
```

#### Chain 10 — Naming → Misunderstanding → Wrong Usage → Logic Bug

```
TRIGGER: Misleading function name (§D1)
TRACE:
  [§D1 HIGH] Function named getData() that also WRITES to cache
  [§D4 MED]  Caller assumes getData() is pure → calls it in a loop
  [§D6 HIGH] Cache written N times → performance degradation and potential state corruption
  [§D5 HIGH] Stale cache data returned on next read → wrong output

COMBINED SEVERITY: HIGH
DETECT: Functions named get*/is*/calculate* → check whether they have side effects (writes, dispatches)
```

#### Chain 11 — Missing Types → Missing Validation → Runtime Crash

```
TRIGGER: any/missing types (§D5)
TRACE:
  [§D5 MED]  API response typed as `any`
  [§D5 HIGH] No runtime validation at the API boundary
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
  [§D6 HIGH] Developer changes data shape in a code update
  [§D6 CRIT] Old data parsed with new schema → fields missing or wrong type
  [§D5 CRIT] App uses corrupted data → wrong output or crash

COMBINED SEVERITY: CRITICAL (⏱ COMPOUNDS with every release)
DETECT: persistence read → check for version check → check for migration path
```

---

### SIGNAL CORRELATION TABLE

When you find issue X, always also investigate issue Y. They frequently co-occur.

| Finding X | Also investigate Y |
|-----------|-------------------|
| `any` types (§D5) | Missing API validation, unhandled errors (§D7) |
| God component (§D4) | Stale closures (§D6), re-render performance (§D3) |
| eslint-disable (§D6) | Every other dimension — suppressed warnings hide real bugs |
| Dead code (§D2) | Duplication in live code (§D2) — this signals an abandoned refactoring |
| GlobalScope (§D8) | Memory leaks (§D3), missing cancellation (§D8) |
| console.log in prod (§D2) | Missing error handling (§D7) — logs used as a substitute for error handling |
| Empty catch (§D7) | NaN/null propagation (§D5) — errors are swallowed, bad values propagate silently |
| lateinit (§D5) | Missing null checks (§D5), crash paths (§D7) |
| .push() on state (§D6) | Missing re-renders (§D3), data loss (§D6) |
| No tests (§D2) | Logic bugs (§D5) — untested code has 5-10x higher defect rate |

---

### CHAIN DOCUMENTATION FORMAT

When you find a chain, document it using this exact format:

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
