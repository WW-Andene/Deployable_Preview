---
name: app-audit
description: >
  Exhaustive professional audit of any frontend app regardless of domain, stack, or
  complexity. Trigger on: "audit my app", "deep code review", "security review",
  "performance review", "UX review", "accessibility audit", "review before launch",
  "optimize my app", "make it more professional", "standardize my code", "check i18n",
  "review my AI integration", "my app is messy", "restructure my app", "polish my app",
  "what should I build next", "help me improve my app", "my app feels incoherent",
  "clean up my codebase", "evaluate my existing features", "unify my app's design",
  or when a user shares source files for analysis. Covers: domain correctness, security,
  privacy, performance, state management, UI/UX, visual design, brand identity, commercial
  readiness, polish, standardization, accessibility, code quality, data integrity, i18n,
  AI/LLM risks, architecture, feature evaluation, competitive research, R&D planning,
  and codebase restructuration. Works with design-aesthetic-audit and scope-context
  companion skills.
---

# Professional App Audit — Universal Framework

---

## BEHAVIORAL CONTRACT — Read This First, Obey It Always

> **This section defines binding behavioral rules for the entire skill.**
> Every instruction in this section applies to every action Claude takes during the audit.
> When any other section appears to conflict with this section, this section wins.

### Rule 1: Always Be Specific and Literal

Every finding, every recommendation, every domain fact must name the exact function, variable, line number, CSS class, XML attribute, or data value it references. Vague language like "improve error handling" or "consider adding validation" is a failure. The correct form is always: "`handleImport()` near line 847 calls `JSON.parse()` without a try/catch — any non-JSON clipboard paste throws an uncaught TypeError that crashes the React tree."

### Rule 2: Always Verify Before Citing

Before including any line number, function name, variable name, or code behavior in a finding:
1. Confirm the line number exists in the actual code that was read
2. Confirm the function name is spelled exactly as it appears in the code
3. Confirm the behavior described actually matches what the code does

If you cannot verify a detail, mark it explicitly as `[UNVERIFIED]` and state what you could not confirm.

### Rule 3: Always Source Domain Facts

Every domain fact (constant, formula, rate, threshold, business rule) must carry exactly one of these source tags:

| Tag | Meaning | Can it support a finding? |
|-----|---------|--------------------------|
| `[CODE: line N]` | Value read directly from the provided source file | Yes, for code behavior. Requires user confirmation to assert the value is *correct*. |
| `[§0-CONFIRMED]` | Value provided or confirmed by the user | Yes. This is the specification. |
| `[WEB: source, version, date]` | Value found via live web search from an official source | Yes, after version check. |
| `[UNVERIFIED]` | Value recalled from training data only | This is a question to the user. Present it as a question. |

**What to do with `[UNVERIFIED]` data**: Present it as a question. Example: "The code uses `BASE_RATE = 0.006` at line 412. I recall this may differ from the official value, but I am not certain. Can you confirm whether 0.006 is correct?" — then wait for the user's answer before writing any finding about that value.

### Rule 4: Always Preserve Working Features

Every working feature is protected. The Feature Preservation Ledger (built in Part 1) is a binding contract. Every recommendation must preserve every working feature. Before recommending any change, verify that the change does not break, remove, or diminish any feature listed as WORKING in the ledger. If a simplification would remove a working feature, reject that simplification.

### Rule 5: Always Preserve the Design Identity

The app's intentional design character (recorded in §0 Design Identity) is protected. Polishing means making the existing vision more refined and consistent. It means improving the app's own aesthetic, using the app's own design language. A dark cyberpunk aesthetic with glowing accents gets polished *as* a dark cyberpunk aesthetic. It is improved within its own identity. It is made more consistent with itself. It is made more refined as itself.

### Rule 6: Always Apply Stakes as a Severity Multiplier

The Stakes field from §0 multiplies severity across all categories. Wrong numbers in a hobby tracker = MEDIUM. The same wrong numbers in a medical dosing app = CRITICAL. Always check Stakes before assigning severity.

### Rule 7: Always Use the Smallest Safe Change

Every fix recommendation uses the smallest change that resolves the problem. A 3-line targeted fix is preferred over a refactor that happens to fix the problem as a side effect. If a larger structural improvement is also warranted, present it as a separate, explicitly lower-priority recommendation.

### Rule 8: Always Ask the Golden Question Before Recommending

Before every modification recommendation, ask yourself:
> "If the developer applies this change at 2 AM without carefully reviewing it, what is the worst realistic outcome?"

If the answer is anything other than "nothing bad," then: add explicit warnings to the recommendation, reduce the scope of the change, or split it into safer atomic steps.

### Rule 9: Always Consider Time

Before closing each section, ask:
> "If this issue stays unfixed, what does it cost in 6 months when the codebase is 2× larger?"

A small validation gap that costs 5 minutes to fix today may require a data migration affecting thousands of records in 6 months. Mark time-amplified findings with **⏱ COMPOUNDS** — these are higher priority than their individual severity alone suggests.

### Rule 10: Always Fix Bugs Before Refactoring

If a function has a bug AND is poorly structured: fix the bug first, with a minimal targeted change. The structural improvement is a separate, lower-priority recommendation. Always present them as two distinct items.

---

## TABLE OF CONTENTS — What's in This File, How to Use It

> **How to use this table**: Find the category you care about, then tell Claude:
> - `"Run §A1"` or `"Audit §C2"` — to audit a specific section
> - `"Fix §D5"` or `"Implement §E3 recommendations"` — to fix issues in a specific area
> - `"Audit Category C"` or `"Run the security audit"` — to audit an entire category
> - `"Run P3"` or `"Do Part 3"` — to run a full audit part
> - Or use any **trigger phrase** listed below to jump directly to what you need.

---

### SETUP & ROUTING (read once, then jump to what you need)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| — | **BEHAVIORAL CONTRACT** | Binding behavioral rules for the entire audit | — |
| — | **QUICK START** | How to invoke this skill (for you and Claude) | — |
| — | **SKILL MAP** | Section index + common execution paths | "what sections are there", "show the skill map" |
| §TRIAGE | **Audit Routing** | Asks which audit mode you want | "audit my app", "review my app", "analyze my app" |
| §0 | **App Context Block** | Captures app identity, tech stack, constraints, design, domain rules | "fill the context", "set up the audit", "describe my app" |

---

### CALIBRATION & PHILOSOPHY (how the audit adapts to YOUR app)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §I.1 | **Domain Classification** | Maps your app type → severity multipliers | "what domain is my app", "classify my app" |
| §I.2 | **Architecture Classification** | Maps your architecture → failure modes to hunt | "what failure modes", "architecture risks" |
| §I.3 | **App Size → Scope** | Determines how many audit parts based on LOC | "how long will this audit be" |
| §I.4 | **Five-Axis Aesthetic Profile** | Classifies aesthetic goals across 5 independent axes | "what aesthetic profile", "classify my design goals" |
| §I.5 | **Domain Rule Extraction** | Extracts constants/formulas from code for verification | "extract domain rules", "find constants" |
| §I.6 | **Knowledge & Source Integrity** | Rules for sourcing domain facts (web, code, user) | — |
| §I.7 | **Adaptive Analysis Protocols** | Mid-audit reclassification triggers | — |
| §II | **Compound Finding Chains** | How individually minor bugs combine into escalating harm chains | — |

---

### EXECUTION PLAN (how the audit is structured)

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §III | **Pre-Flight Checklist** | Mandatory steps before any finding | "start the audit", "run pre-flight" |
| P1 | **Part 1: Inventory & Architecture** | Feature ledger, constraint map, workflow map | "run part 1", "do the inventory" |
| P2 | **Part 2: Domain Logic** | Rule-by-rule verification, formula test vectors | "run part 2", "check my business logic" |
| P3 | **Part 3: Security** | Threat model, attack surface, compliance gaps | "run part 3", "security audit" |
| P4 | **Part 4: State & Data** | State schema, validation gaps, corruption paths | "run part 4", "check state management" |
| P5 | **Part 5: Performance** | Web vitals, resource budget, memory leaks | "run part 5", "performance audit" |
| P6 | **Part 6: Visual Design** | Design tokens, visual rhythm, polish gaps | "run part 6", "design audit" |
| P7 | **Part 7: UX & IA** | Flow analysis, information architecture, copy | "run part 7", "UX audit" |
| P8 | **Part 8: Accessibility** | WCAG 2.1 AA, screen reader, keyboard nav | "run part 8", "accessibility audit" |
| P9 | **Part 9: Compatibility** | Cross-browser, PWA, mobile, network | "run part 9", "compatibility check" |
| P10 | **Part 10: Code Quality** | Dead code, duplication, naming, architecture | "run part 10", "code quality audit" |
| P11 | **Part 11: AI/LLM** | Prompt injection, output sanitization, costs | "run part 11", "audit AI integration" |
| P12 | **Part 12: i18n** | Hardcoded strings, locale formats, RTL | "run part 12", "i18n audit" |
| P13 | **Part 13: Projections** | Scale cliffs, tech debt, dependency decay | "run part 13", "future-proof my app" |
| Final | **Summary Dashboard** | Findings table, root cause, quick wins, roadmap | "show the summary", "give me the dashboard" |

---

### CATEGORY A — DOMAIN LOGIC & CORRECTNESS

> **When to use**: Your app produces wrong numbers, calculations are off, formulas seem broken, or you want to verify business rules are implemented correctly.
>
> **Trigger phrases**: "check my formulas", "verify calculations", "audit business logic", "my numbers are wrong", "check domain rules", "verify correctness"

| Code | Section | What It Audits |
|------|---------|---------------|
| §A1 | Business Rule & Formula Correctness | Constants, formulas, operator precision, rounding, units, invariants |
| §A2 | Probability & Statistical Correctness | RNG, distributions, pity systems, expected value, displayed odds |
| §A3 | Temporal & Timezone Correctness | Timezone handling, DST, date boundaries, scheduling, format |
| §A4 | State Machine Correctness | State transitions, unreachable states, deadlocks, illegal transitions |
| §A5 | Embedded Data Accuracy | Lookup tables, reference data, version currency, fallback values |
| §A6 | Async & Concurrency Bug Patterns | Race conditions, stale closures, debounce, cancellation, ordering |
| §A7 | JS Type Coercion & Implicit Conversion | `==` vs `===`, falsy traps, parseInt pitfalls, NaN propagation |

---

### CATEGORY B — STATE MANAGEMENT & DATA INTEGRITY

> **When to use**: Data gets lost, state behaves unexpectedly, imports/exports are broken, or persistence has issues.
>
> **Trigger phrases**: "fix state management", "data gets lost", "audit state", "persistence issues", "import/export broken", "data integrity"

| Code | Section | What It Audits |
|------|---------|---------------|
| §B1 | State Architecture | Single source of truth, derived state, initialization, schema |
| §B2 | Persistence & Storage | localStorage/SharedPreferences, quota, migration, concurrent access |
| §B3 | Input Validation & Sanitization | Boundary values, type coercion, injection through input |
| §B4 | Import & Export Integrity | Round-trip fidelity, version compatibility, corruption detection |
| §B5 | Data Flow Map | Data lifecycle from entry to display, transformation audit |
| §B6 | Mutation & Reference Integrity | Immutability discipline, shared reference bugs, deep copy |

---

### CATEGORY C — SECURITY & TRUST

> **When to use**: Security review before launch, handling sensitive data, API key management, compliance requirements.
>
> **Trigger phrases**: "security review", "security audit", "check for vulnerabilities", "is my app secure", "privacy audit", "GDPR check", "check permissions"

| Code | Section | What It Audits |
|------|---------|---------------|
| §C1 | Authentication & Authorization | Credential storage, session management, privilege escalation |
| §C2 | Injection & XSS | innerHTML, DOM XSS, eval, URL injection, CSS injection |
| §C3 | Prototype Pollution & Import Safety | JSON.parse safety, prototype pollution, property collision |
| §C4 | Network & Dependencies | HTTPS, SRI, CORS, CSP, third-party tracking |
| §C5 | Privacy & Data Minimization | PII inventory, URL leakage, fingerprinting, export sensitivity |
| §C6 | Compliance & Legal | GDPR/CCPA, age restrictions, IP/copyright, financial/medical disclaimers |
| §C7 | Mobile-Specific Security | Permission audit, exported components, WebView, ProGuard, deep links |

---

### CATEGORY D — PERFORMANCE & RESOURCES

> **When to use**: App is slow, uses too much memory, loads slowly, or has performance issues on mobile.
>
> **Trigger phrases**: "make it faster", "performance issues", "too slow", "memory leak", "optimize performance", "reduce load time", "app freezes", "ANR"

| Code | Section | What It Audits |
|------|---------|---------------|
| §D1 | Runtime Performance | Main thread blocking, worker offloading, re-renders, throttling |
| §D2 | Web Vitals & Loading | LCP, FID, CLS, critical rendering path, code splitting |
| §D3 | Resource Budget | Bundle size, image optimization, font loading, CDN assets |
| §D4 | Memory Management | Closure leaks, event listener leaks, timer leaks, blob URLs |
| §D5 | Mobile-Specific Performance | Coroutine lifecycle, RecyclerView, image loading, process death, ANR |

---

### CATEGORY E — VISUAL DESIGN QUALITY & POLISH

> **When to use**: App looks unprofessional, design feels inconsistent, colors/spacing are off, needs visual polish.
>
> **Trigger phrases**: "improve the design", "make it look professional", "design review", "polish the UI", "fix the colors", "design system", "make it premium", "visual consistency"

| Code | Section | What It Audits |
|------|---------|---------------|
| §E1 | Design Token System | CSS variables / theme attributes coverage, naming, gaps |
| §E2 | Visual Rhythm & Spatial Composition | Spacing consistency, grid alignment, whitespace |
| §E3 | Color Craft & Contrast | Contrast ratios, palette coherence, dark mode quality |
| §E4 | Typography Craft | Font scale, weight hierarchy, tracking, line height, rendering |
| §E5 | Component Visual Quality | Buttons, inputs, cards, modals — visual consistency |
| §E6 | Interaction Design Quality | Hover/active/focus/disabled states, transitions, feedback |
| §E7 | Overall Visual Professionalism | First-impression test, visual noise, alignment, polish gaps |
| §E8 | Product Aesthetics (Axis-Driven) | Commercial credibility, cognitive load, emotional safety, fidelity |
| §E9 | Visual Identity & Recognizability | Distinctiveness, brand signature, memorability |
| §E10 | Data Storytelling & Visual Communication | How data is presented visually, chart quality |

---

### CATEGORY F — UX, INFORMATION ARCHITECTURE & COPY

> **When to use**: Users get confused, flows feel broken, onboarding is bad, copy needs work, app doesn't feel intuitive.
>
> **Trigger phrases**: "UX review", "improve user experience", "fix the flow", "onboarding sucks", "improve copy", "make it intuitive", "information architecture"

| Code | Section | What It Audits |
|------|---------|---------------|
| §F1 | Information Architecture | Navigation clarity, grouping logic, discoverability, depth |
| §F2 | User Flow Quality | Critical path efficiency, dead ends, error recovery, back navigation |
| §F3 | Onboarding & First Use | First-run experience, progressive disclosure, value communication |
| §F4 | Copy Quality | Clarity, consistency, tone, technical jargon, error messages |
| §F5 | Micro-Interaction Quality | Feedback loops, state transitions, gesture responses |
| §F6 | Engagement, Delight & Emotional Design | Personality moments, reward patterns, celebration states |

---

### CATEGORY G — ACCESSIBILITY

> **When to use**: Making the app accessible, screen reader support, keyboard navigation, WCAG compliance.
>
> **Trigger phrases**: "accessibility audit", "a11y", "WCAG", "screen reader", "keyboard navigation", "make it accessible", "color blind support"

| Code | Section | What It Audits |
|------|---------|---------------|
| §G1 | WCAG 2.1 AA Compliance | Semantic HTML/views, ARIA/accessibility labels, focus management, contrast |
| §G2 | Screen Reader Trace | Content order, live regions, meaningful labels, hidden decorative elements |
| §G3 | Keyboard Navigation | Tab order, focus traps, skip links, custom component keyboard support |
| §G4 | Reduced Motion | `prefers-reduced-motion` / `ANIMATOR_DURATION_SCALE` respect, alternatives |

---

### CATEGORY H — BROWSER / PLATFORM COMPATIBILITY

> **When to use**: App breaks on certain browsers/devices, PWA issues, touch interactions don't work, offline problems.
>
> **Trigger phrases**: "browser compatibility", "doesn't work on Safari", "mobile broken", "PWA issues", "offline support", "touch not working"

| Code | Section | What It Audits |
|------|---------|---------------|
| §H1 | Cross-Browser Matrix | Feature detection, API availability, CSS compatibility, polyfills |
| §H2 | PWA & Service Worker | Manifest, SW lifecycle, cache strategy, update flow, install prompt |
| §H3 | Mobile & Touch | Touch targets, viewport, safe areas, gesture conflicts, orientation |
| §H4 | Network Resilience | Offline behavior, retry logic, degraded connectivity, sync |

---

### CATEGORY I — CODE QUALITY & ARCHITECTURE

> **When to use**: Codebase is messy, hard to maintain, has duplication, needs restructuring, poor naming.
>
> **Trigger phrases**: "clean up my code", "code review", "refactor", "reduce duplication", "improve architecture", "code quality", "naming review"

| Code | Section | What It Audits |
|------|---------|---------------|
| §I1 | Dead Code & Waste | Unreachable code, unused imports, disabled features, commented code |
| §I2 | Naming Quality | Variable/function/file naming consistency, domain vocabulary alignment |
| §I3 | Error Handling Coverage | Try/catch completeness, error propagation, user-facing error messages |
| §I4 | Code Duplication | Copy-paste code, near-duplicates, abstraction opportunities |
| §I5 | Component & Module Architecture | Separation of concerns, coupling, cohesion, dependency direction |
| §I6 | Documentation & Maintainability | Comments quality, self-documenting code, onboarding ease |

---

### CATEGORY J — DATA PRESENTATION & PORTABILITY

> **When to use**: Numbers display wrong, charts look bad, assets are poorly managed, real-time data is stale.
>
> **Trigger phrases**: "fix number formatting", "chart looks wrong", "data display issues", "asset management", "real-time data"

| Code | Section | What It Audits |
|------|---------|---------------|
| §J1 | Number & Data Formatting | Precision, locale formatting, currency, percentages, units |
| §J2 | Data Visualization Quality | Chart accuracy, axis labeling, color accessibility, empty states |
| §J3 | Asset Management | Image optimization, lazy loading, fallbacks, format selection |
| §J4 | Real-Time Data Freshness | Polling intervals, stale data indicators, update propagation |

---

### CATEGORY K — SPECIALIZED DOMAIN DEPTHS

> **When to use**: App handles money, health data, gambling mechanics, real-time collaboration, or AI integration.
>
> **Trigger phrases**: "audit financial logic", "medical safety check", "gambling compliance", "audit AI integration", "real-time sync issues"

| Code | Section | What It Audits |
|------|---------|---------------|
| §K1 | Financial Precision | Decimal arithmetic, currency rounding, tax calculation, audit trails |
| §K2 | Medical / Health Precision | Dosage safety, unit conversions, contraindication checks, disclaimers |
| §K3 | Probability & Gambling-Adjacent | RNG fairness, pity system correctness, disclosed rates, age gating |
| §K4 | Real-Time & Collaborative | Conflict resolution, sync ordering, presence, latency handling |
| §K5 | AI / LLM Integration | Prompt injection, output sanitization, streaming errors, token/cost risk, hallucination exposure |

---

### CATEGORY L — OPTIMIZATION, STANDARDIZATION & POLISH

> **When to use**: App works but feels rough, needs consistent standards, polish pass, or optimization sweep.
>
> **Trigger phrases**: "standardize my code", "polish everything", "make it consistent", "optimization pass", "unify the design", "clean up standards"

| Code | Section | What It Audits |
|------|---------|---------------|
| §L1 | Code Optimization Opportunities | Algorithm improvements, caching, lazy evaluation, batching |
| §L2 | Code Standardization | Coding conventions, formatting consistency, lint configuration |
| §L3 | Design System Standardization | Token consistency, component variants, spacing unification |
| §L4 | Copy & Content Standardization | Voice consistency, terminology, label conventions |
| §L5 | Interaction & Experience Polish | Micro-animation refinement, transition consistency, gesture polish |
| §L6 | Performance Polish | Perceived performance, skeleton screens, optimistic updates |
| §L7 | Accessibility Polish | Beyond compliance — toward excellent accessibility |

---

### CATEGORY M — DEPLOYMENT & OPERATIONS

> **When to use**: App needs versioning, monitoring, feature flags, or operational improvements.
>
> **Trigger phrases**: "deployment audit", "add monitoring", "feature flags", "version management", "operational readiness"

| Code | Section | What It Audits |
|------|---------|---------------|
| §M1 | Version & Update Management | Version strategy, changelog, migration paths, update notifications |
| §M2 | Observability | Error tracking, analytics, performance monitoring, crash reporting |
| §M3 | Feature Flags & Gradual Rollout | Flag architecture, rollback capability, A/B testing readiness |

---

### CATEGORY N — INTERNATIONALIZATION & LOCALIZATION

> **When to use**: App needs multi-language support, locale-aware formatting, or RTL layout support.
>
> **Trigger phrases**: "i18n audit", "add translations", "locale formatting", "RTL support", "internationalization", "localization check"

| Code | Section | What It Audits |
|------|---------|---------------|
| §N1 | Hardcoded String Inventory | All user-facing strings not in a translation system |
| §N2 | Locale-Sensitive Formatting | Dates, numbers, currency, pluralization, sort order |
| §N3 | RTL Layout | Bidirectional text, mirrored layouts, directional icons |
| §N4 | Locale Loading & Performance | Translation bundle size, lazy loading, fallback chains |

---

### CATEGORY O — DEVELOPMENT SCENARIO PROJECTION

> **When to use**: Planning for growth, worried about scaling, tech debt accumulating, future-proofing the app.
>
> **Trigger phrases**: "future-proof my app", "scale analysis", "tech debt audit", "dependency check", "what breaks at scale", "maintenance risks"

| Code | Section | What It Audits |
|------|---------|---------------|
| §O1 | Scale Cliff Analysis | Points where current architecture breaks under growth |
| §O2 | Feature Addition Risk Map | How hard it is to add the next likely features |
| §O3 | Technical Debt Compounding Map | Which debts compound over time and their cost trajectory |
| §O4 | Dependency Decay Forecast | Outdated dependencies, EOL risk, upgrade difficulty |
| §O5 | Constraint Evolution Analysis | When current constraints should be relaxed/changed |
| §O6 | Maintenance Trap Inventory | Patterns that are easy now but become costly to maintain |
| §O7 | Bus Factor & Knowledge Concentration | Single points of failure in codebase knowledge |

---

### DELIVERABLES & FORMAT

| Code | Section | What It Does | Trigger Phrases |
|------|---------|-------------|-----------------|
| §V | Finding Format | Standard template for all findings (severity, confidence, specifics) | — |
| §VI | Required Deliverables | Tier 1/2/3 deliverables by audit depth | — |
| §VII | Summary Dashboard | Final findings table, root cause, quick wins, roadmap | "show summary", "give me the roadmap" |
| §VIII | Cross-Cutting Concern Map | Patterns spanning multiple categories | — |

---

### R&D & IMPROVEMENT MODE (§X)

> **When to use**: You want to improve existing features, find what to build next, compare with competitors, or plan your roadmap.
>
> **Trigger phrases**: "what should I build", "improve my features", "competitive analysis", "feature roadmap", "R&D mode", "what to build next"

| Code | Section | What It Does |
|------|---------|-------------|
| §X.0 | Existing Feature Deep Evaluation | Health audit of every current feature across 6 dimensions |
| §X.1 | Competitive & Landscape Research | Direct competitor inventory, feature gap matrix, user signals |
| §X.2 | Improvement Prioritization | Impact × Effort matrix, strategic sequencing, experimentation protocol |
| §X.3 | R&D Roadmap Deliverable | Structured roadmap: immediate → short → medium → long term |

---

### POLISH & RESTRUCTURATION MODE (§XI)

> **When to use**: App grew messy over time, codebase needs restructuring, design feels incoherent, needs systematic polish.
>
> **Trigger phrases**: "my app is messy", "restructure my app", "polish my app", "clean up my codebase", "my app feels incoherent", "unify my app", "my app grew messy"

| Code | Section | What It Does |
|------|---------|-------------|
| §XI.0 | Deep Comprehension Phase | Reads and understands the app deeply before changing anything (MANDATORY) |
| §XI.1 | Pre-Polish Inventory | Maps all coherence fractures, inconsistencies, rough edges |
| §XI.2 | Systematic Polish Passes | 7 polish passes from structural to fine-grained |
| §XI.3 | Codebase Restructuration | File structure, module boundaries, naming, architecture cleanup |
| §XI.4 | Architecture Evolution | Incremental architecture improvements without rewrites |
| §XI.5 | Quality Gates | Verification that polish and restructuring preserved behavior |
| §XI.6 | Polish & Restructuration Deliverable | Structured delivery of all changes |

---

### QUICK REFERENCE — "I want to..." → Run this

| I want to... | Run this |
|--------------|----------|
| **Full audit of everything** | `"full app audit"` → all parts P1–P14 |
| **Just check security** | `"run Category C"` or `"security audit"` |
| **Just check performance** | `"run Category D"` or `"performance audit"` |
| **Just fix the design** | `"run Category E"` or `"design polish"` |
| **Verify my business logic** | `"run §A1"` or `"check my formulas"` |
| **Check one specific thing** | `"audit §C2"` (injection) or `"run §D5"` (mobile perf) |
| **Fix issues in a section** | `"fix §E3"` (color craft) or `"implement §G1 fixes"` |
| **Plan what to build next** | `"run §X"` or `"R&D mode"` |
| **Clean up a messy codebase** | `"run §XI"` or `"polish mode"` |
| **Compare with competitors** | `"run §X.1"` or `"competitive analysis"` |
| **Future-proof my app** | `"run Category O"` or `"projection analysis"` |
| **Check AI integration** | `"run §K5"` or `"audit AI integration"` |
| **Check mobile-specific issues** | `"run §C7 and §D5"` or `"mobile audit"` |

---

## QUICK START — How to Use This Skill

### For Claude — Execution Steps (follow in order)

1. **Check if the user already specified a mode.** If they said "audit my app" or "security review" or "polish my app" — you already know the mode. Skip triage and go directly to the matching routing in §TRIAGE.

2. **If the user's intent is ambiguous**, present the §TRIAGE options using `AskUserQuestion`. Wait for their selection before proceeding.

3. **Create a progress tracker** using `TodoWrite` with one todo per audit part you plan to execute.

4. **Read the entire codebase** using `Agent` (subagent_type: Explore) before writing any findings. Read all files in parallel for large codebases.

5. **Fill §0** by extracting information from the code first. Ask the user only for information that cannot be extracted from code (domain rules, design intent, constraints not visible in source).

6. **Work in parts.** Output one part per response. Update the todo list after each part.

7. **After completing all parts**, produce the Summary Dashboard (§VII).

### For the User

Say one of the trigger phrases (e.g., "audit my app", "review before launch", "help me improve my features") and Claude will guide you through the options. You can also jump directly to a mode: "do a full audit", "run R&D mode", "polish my app".

---

## SCOPE CONVENTION — "audit/fix" vs "full deep audit/fix"

> **This is a binding instruction.** The words "full deep" in a user request are a scope multiplier. They change what gets audited and fixed.

### The Rule

| User Says | Scope | What Claude Does |
|-----------|-------|-----------------|
| **"audit/fix [subject]"** | **Standard** | Run only the core SKILL or category for that subject. Stay within its boundaries. |
| **"full deep audit/fix [subject]"** | **Expanded — everything the subject touches** | Run the core SKILL/category PLUS every cross-cutting section from either SKILL that affects the subject. Follow every dependency chain. Leave nothing UI-adjacent unexamined. |

### The Principle

**"Full deep"** means: if the subject touches it, audit it. This includes the primary category AND every section in both `app-audit-SKILL.md` and `design-aesthetic-audit-SKILL.md` where the subject has a dependency, a side effect, or a shared concern.

### Subject-Specific Expansion Map

#### "full deep audit/fix art design aesthetic" — EVERYTHING UI

Standard scope: `design-aesthetic-audit-SKILL.md` 21-step path only.

Full deep adds from `app-audit-SKILL.md`:
| Added Section | Why — What It Touches |
|---------------|----------------------|
| §E (Visual Design Quality) | Structural/code side of design: tokens in code, spacing in layouts, contrast in implementation |
| §F1 (Information Architecture) | Navigation structure, grouping logic, discoverability — design depends on IA |
| §F2 (User Flow Quality) | Dead ends, error recovery, back navigation — aesthetic breaks if flow breaks |
| §F3 (Onboarding & First Use) | First-run experience, permission requests — first visual impression |
| §F4 (Copy Quality) | Labels, error messages, terminology — copy IS part of the visual surface |
| §F5 (Micro-Interactions) | Functional feedback loops — motion architecture needs interaction triggers |
| §F6 (Engagement & Delight) | Personality moments, reward patterns — aesthetic at its most expressive |
| §G1-G4 (Accessibility) | Content descriptions, TalkBack, focus order, contrast, reduced motion — design must be accessible |
| §H3 (Mobile & Touch) | Touch targets (48dp min), safe areas, gesture conflicts — design must be touchable |
| §L3 (Design System Standard.) | Token consistency, component variants, spacing unification — the system under the design |
| §L4 (Copy & Content Standard.) | Voice consistency, terminology — copy-visual alignment at scale |
| §L5 (Interaction & Experience Polish) | Micro-animation refinement, transition consistency — the polish layer |
| §D5 (Mobile Performance) | RecyclerView jank, animation frame drops — design that stutters is broken design |

#### "full deep audit/fix security" — EVERYTHING TRUST

Standard scope: §C (Security & Trust) only.

Full deep adds:
| Added Section | Why |
|---------------|-----|
| §B3 (Input Validation) | Validation gaps are security gaps |
| §C7 (Mobile Security) | Permissions, exported components, WebView, ProGuard |
| §K1-K5 (Domain Depths) | Financial precision, medical safety, AI prompt injection |
| §B2 (Persistence) | Storage security, encryption, concurrent access |
| §B4 (Import/Export) | Malformed import → prototype pollution → state corruption |
| §M2 (Observability) | Can you detect a breach? Crash reporting, error tracking |
| §O4 (Dependency Decay) | Outdated dependencies with known CVEs |
| §H4 (Network Resilience) | Retry logic, degraded connectivity — attack surface |

#### "full deep audit/fix performance" — EVERYTHING SPEED

Standard scope: §D (Performance & Resources) only.

Full deep adds:
| Added Section | Why |
|---------------|-----|
| §D5 (Mobile Performance) | Coroutines, RecyclerView, process death, ANR |
| §L6 (Performance Polish) | Perceived performance, skeleton screens, optimistic updates |
| §O1 (Scale Cliffs) | Where does it break under load? |
| §H4 (Network Resilience) | Retry, offline, degraded connectivity |
| §D3 (Resource Budget) | APK size, image optimization, font loading |
| §I1 (Dead Code) | Dead code = wasted bundle size = slower load |
| §A6 (Async & Concurrency) | Race conditions, stale closures, ordering bugs — perf symptoms |
| §J3 (Asset Management) | Image optimization, lazy loading, format selection |

#### "full deep audit/fix UX" — EVERYTHING USER-FACING

Standard scope: §F (UX, IA & Copy) only.

Full deep adds:
| Added Section | Why |
|---------------|-----|
| §E (Visual Design Quality) | UX and visual design are inseparable |
| §G1-G4 (Accessibility) | Accessibility IS UX for affected users |
| §H3 (Mobile & Touch) | Touch interaction IS UX |
| §L5 (Interaction Polish) | Polish IS the UX quality ceiling |
| §F6 (Engagement & Delight) | Emotional design IS UX at its best |
| Full `design-aesthetic-audit-SKILL.md` | The aesthetic layer IS part of the user experience |

#### "full deep audit/fix code quality" — EVERYTHING MAINTAINABLE

Standard scope: §I (Code Quality & Architecture) only.

Full deep adds:
| Added Section | Why |
|---------------|-----|
| §L1-L2 (Optimization & Standardization) | Standards are code quality infrastructure |
| §O1-O7 (All Projections) | Future maintainability depends on today's architecture |
| §M1-M3 (Deployment & Ops) | Versioning, monitoring, feature flags — operational code quality |
| §B1 (State Architecture) | State bugs are architecture bugs |
| §I5 (Module Architecture) | Coupling, cohesion, dependency direction |

### Claude Execution Note for "full deep"

When "full deep" is detected:
1. Use `TodoWrite` to list ALL sections (core + expanded) as individual tasks
2. Run core SKILL sections first, then expanded sections in order
3. Cross-reference findings — a design finding may reveal a UX gap, a UX gap may reveal an accessibility gap
4. Follow the Cross-Cutting Concern Map (§VIII) — it maps exactly these dependency chains

---

## SKILL MAP — Quick Reference

> **Read this first.** This is a ~3,800 line skill. You do not need all of it at once. Use this map.

### Section Index

| Section | Purpose | When to Read |
|---------|---------|-------------|
| BEHAVIORAL CONTRACT | Binding rules for all audit behavior | **Always first** — read before any work |
| §TRIAGE | Route to the right mode | **Always** — unless user already specified a mode |
| §0 | App identity, tech stack, constraints, design, domain rules | **Always** — fill before any work |
| §I | Classify domain, architecture, size, aesthetic axes | **Full audit** — determines depth |
| §II | Compound finding chains — escalating harm from combined minor bugs | **Full audit** — check during all dimensions |
| §III | Execution plan, part structure, pre-flight checklist | **Full audit** — determines pacing |
| §IV | 120+ checks across 15 categories (A–O) | **Full audit** — the core reference |
| §V–VII | Finding format, deliverables, summary dashboard | **Full audit** — templates |
| §VIII | Cross-cutting patterns spanning multiple categories | **Full audit** — check after all dimensions |
| §IX | Audit completion criteria — when is the audit done | **Full audit** — closing reference |
| §X | Existing feature evaluation + new feature planning | **R&D&I mode** — "what to improve and why" |
| §XI | Deep comprehension + coherence restoration + polish | **Polish mode** — "make it one thing again" |

### Common Execution Paths

```
"Audit my app"
  → §TRIAGE → §0 → §I → §III → Parts P1–P13+ → §VII
  Claude: Read §I as you classify. Read each category from §IV as you work through the corresponding part. Output in parts per §III.

"Help me improve my features" / "What should I build next?"
  → §TRIAGE → §0 (lightweight) → §I.1 classification only → §X
  Claude: §X.0 (existing features) runs first, always. §X.1 (competitive) runs second, only if web search is available.

"My app is messy, restructure it" / "Polish my app"
  → §TRIAGE → §0 → §XI
  Claude: §XI.0 (comprehension) runs first, always. It is mandatory. A prior audit is recommended but not required.

"Full treatment"
  → §0 → §I → Parts P1–P13+ → §VII → §X → §XI
  Claude: This takes 15+ parts. Confirm with user after Part 1 before continuing.

"Continue from audit → now improve"
  → Load prior audit findings → §X (builds on audit) → §XI (builds on both)
```

### Claude Execution Notes

- **§X and §XI can be run independently.** They work better with a prior audit, but they do not require one.
- **§X.0 (existing feature eval) always runs before §X.1 (competitive research).** Look inward first.
- **§XI.0 (comprehension) always runs before any §XI change.** It is mandatory. It prevents "clean but soulless" restructuring.
- **When uncertain about which section applies:** ask the user. Use `AskUserQuestion` with the triage options.
- **For apps > 3,000 lines:** always confirm with user after completing §0 + §I before continuing.

### Claude Code Tool Integration Protocol

> **These instructions are specific to Claude Code (CLI/web).** Use the right tool for each audit task.

#### Tool Usage Map

| Audit Task | Tool to Use | Why |
|------------|-------------|-----|
| **Read the codebase** | `Agent` (subagent_type: Explore) | Explores files in parallel without bloating the main context |
| **Search for patterns** (e.g., hardcoded strings, security issues) | `Grep` or `Glob` | Fast, targeted codebase searches |
| **Ask user which mode** | `AskUserQuestion` | Presents triage options with descriptions |
| **Track audit progress** | `TodoWrite` | Creates visible progress tracker for multi-part audits |
| **Research competitors/sources** | `WebSearch` / `WebFetch` | Live web research for §X.1 competitive analysis |
| **Present findings** | Direct text output | Findings are displayed directly to the user |
| **Implement fixes** | `Edit` / `Write` | Apply recommended changes to code |

#### Multi-Part Audit Progress Protocol

At the start of any multi-part audit, create a progress tracker:

```
TodoWrite([
  { content: "Fill §0 App Context Block", status: "in_progress", activeForm: "Filling §0 context" },
  { content: "§I Adaptive Calibration", status: "pending", activeForm: "Classifying domain and architecture" },
  { content: "Part 1: Core Logic & Domain", status: "pending", activeForm: "Auditing core logic" },
  { content: "Part 2: State & Data Integrity", status: "pending", activeForm: "Auditing state management" },
  ...continue for each part
])
```

Update status to `completed` as each part finishes. The user sees real-time progress.

#### Parallel Research Strategy

For large codebases (> 2,000 lines), launch parallel Explore agents to read different modules simultaneously:

```
Agent(subagent_type: Explore, prompt: "Read all UI/fragment files in app/src/main/java/.../ui/")
Agent(subagent_type: Explore, prompt: "Read all utility/service files in app/src/main/java/.../utils/")
Agent(subagent_type: Explore, prompt: "Read all data model files in app/src/main/java/.../data/")
```

This prevents context window bloat while ensuring thorough coverage.

### Platform Awareness

> This skill applies to **any frontend platform**. When auditing non-web apps, adapt the terminology:

| Web Concept | Android/Kotlin Equivalent | iOS/Swift Equivalent |
|-------------|--------------------------|---------------------|
| CSS variables / design tokens | `colors.xml`, `themes.xml`, `dimens.xml` | Asset catalogs, `UIColor` extensions |
| `localStorage` | `SharedPreferences`, Room DB | `UserDefaults`, CoreData |
| Components / React state | Fragments, ViewModels, LiveData | ViewControllers, SwiftUI State |
| `innerHTML` / XSS | `WebView.loadData()` injection | `WKWebView` injection |
| Bundle size | APK size, DEX method count | IPA size |
| Service Workers | WorkManager, Foreground Services | Background Tasks |
| CSS animations | `MotionLayout`, `ObjectAnimator`, `MotionUtil` | `UIView.animate`, SwiftUI `.animation` |
| `border-radius` | `cornerRadius` in ShapeableImageView / MaterialCardView | `layer.cornerRadius` |
| Tailwind/CSS classes | XML attributes, Material Design 3 theme | SwiftUI modifiers |
| `prefers-reduced-motion` | `Settings.Global.ANIMATOR_DURATION_SCALE` | `UIAccessibility.isReduceMotionEnabled` |

**When auditing Android apps specifically:**
- Check `AndroidManifest.xml` for permission issues (§C)
- Audit `proguard-rules.pro` for security implications
- Review `build.gradle` for dependency versions (§O4)
- Check `values/` and `values-night/` for theme completeness (§E)
- Review navigation graph (`nav_graph.xml`) for flow coherence (§H)
- Check for proper lifecycle handling in Fragments/ViewModels (§B)
- Verify Material Design 3 component usage and theming (§E, §L)

**When auditing iOS apps specifically:**
- Check `Info.plist` for permission descriptions
- Review asset catalogs for theme support
- Audit `Podfile`/`Package.swift` for dependencies
- Check for proper SwiftUI/UIKit lifecycle handling

---

## §TRIAGE — MANDATORY AUDIT ROUTING

### When to present triage options

Present triage options when the user says something general like "audit my app", "review my app", or "analyze my app" — and you cannot determine which specific mode they want.

### When to skip triage

Skip triage and go directly to the matching mode when:
- The user explicitly names the mode (e.g., "security audit", "polish my app", "R&D mode")
- The user has already selected a mode in a prior message
- The user says "continue" or "next part" during an in-progress session

### Triage options

Present using `AskUserQuestion`:

```
AskUserQuestion({
  questions: [{
    question: "What kind of audit would you like?",
    header: "Audit mode",
    options: [
      { label: "Full App Audit", description: "Code, security, performance, accessibility, UX, design, architecture, domain correctness, i18n, AI risks, future projections" },
      { label: "Design & Aesthetic Audit", description: "Deep visual analysis — color science, typography, motion, brand identity, competitive positioning" },
      { label: "R&D & Improvement", description: "Existing feature health evaluation, competitive analysis, improvement prioritization, R&D roadmap" },
      { label: "Polish & Restructure", description: "Deep app comprehension, coherence fracture healing, systematic polish, codebase restructuring" }
    ],
    multiSelect: false
  }]
})
```

### Routing after selection

| Selection | What Claude Does |
|-----------|-----------------|
| Full App Audit | Continue from §ORCHESTRATION. Use only this skill (app-audit-SKILL.md). |
| Design & Aesthetic Audit | Stop this skill. Load and follow `design-aesthetic-audit-SKILL.md` instead. |
| R&D & Improvement | Fill §0 → lightweight §I classification → skip to §X. If prior audit exists, reference its findings. |
| Polishing & Restructuration | Fill §0 → skip to §XI. Prior audit strongly recommended. If no prior audit exists, do Parts 1–3 first. |
| Companion Mode | Continue this skill AND load `design-aesthetic-audit-SKILL.md`. Follow companion protocol from both. |

---

## ORCHESTRATION — How This Skill Works

This skill adapts to the app's domain, stakes, architecture, and aesthetic identity. The auditor holds all specialist lenses simultaneously:

| Area | Lenses |
|------|--------|
| **Code** | Senior engineer · Security researcher · Performance engineer · QA lead |
| **Domain** | Domain specialist · Compliance officer · Forward-looking architect |
| **Design** | Visual designer · Product designer · Brand strategist · Copywriter |
| **UX** | UX designer · Accessibility specialist · Adversarial tester |
| **Strategy** | R&D strategist · Restructuring engineer · Refactoring expert |

A wrong displayed number is simultaneously a logic bug, a UX trust failure, a data integrity gap, and potentially a security issue depending on stakes. Always consider all lenses.

---

## §0. APP CONTEXT BLOCK

> **Fill before writing any findings.** Follow this exact sequence:
> 1. Extract what you can from the source code
> 2. Ask the user only for what cannot be extracted from code
> 3. Present extracted domain rules to the user for confirmation — the code may be wrong
> 4. Wait for user confirmation before using any domain rule as the basis for a finding

```yaml
# ─── CROSS-AUDIT CONTINUITY ───────────────────────────────────────────────────
# Complete this block only when this is NOT the first audit of this app.
# Its purpose: prevent silent contradiction between audit sessions.
# A finding that contradicts a previously confirmed domain rule is a CONFLICT, not a correction.
# Always surface conflicts explicitly. Always let the user arbitrate.
Prior Audit Reference:
  Version Audited:    # The version number from the previous audit's §0
  Session Date:       # Approximate date of the prior audit (helps identify which session)
  Confirmed Rules:    # List every domain rule confirmed [§0-CONFIRMED] in the prior session
    - # e.g. "BASE_RATE = 0.008 — confirmed by user, session 1"
    - # e.g. "MAX_SESSIONS = 5 — confirmed by user, session 1"
  Confirmed Findings: # Any findings from the prior audit confirmed as real bugs
    - # e.g. "F-007: rounding error in dose calculation — confirmed CRITICAL"
  Conflicts Flagged:  # Any place where this session's findings differ from the prior session's
    - # Format: "CONFLICT: [prior session claimed X] vs [this session finds Y] — needs user confirmation"

# ─── IDENTITY ─────────────────────────────────────────────────────────────────
App Name:      # e.g. "InvoiceFlow" / "HealthTrack" / "PixelEditor"
Version:       # e.g. "v2.1.4" — is this a single source of truth or scattered across the codebase?
Domain:        # e.g. "Invoice creation for EU freelancers" / "Medication dosage calculator"
Audience:      # e.g. "Small business owners" / "Nurses" / "Casual gamers" / "Data analysts"
Stakes:        # LOW (hobby/entertainment) | MEDIUM (productivity, money-adjacent) |
               # HIGH (real financial transactions, legal records) |
               # CRITICAL (medical, safety-critical, legal compliance required)
               # Stakes is a severity multiplier — wrong data in a CRITICAL app is always CRITICAL.

# ─── TECH STACK ───────────────────────────────────────────────────────────────
Framework:     # e.g. "React 18 (CDN)" / "Vue 3 + Vite" / "Vanilla JS" / "Svelte"
Styling:       # e.g. "Tailwind CSS (CDN)" / "CSS Modules" / "Styled Components" / "Plain CSS"
State:         # e.g. "useReducer + localStorage" / "Zustand" / "Redux Toolkit"
Persistence:   # e.g. "localStorage only" / "IndexedDB" / "REST API + localStorage cache"
Workers:       # e.g. "Blob Web Worker + Blob SW" / "Workbox SW" / "None"
Visualization: # e.g. "Recharts" / "D3.js" / "Chart.js" / "None"
Build:         # e.g. "Zero build tools — CDN only" / "Vite 5" / "Webpack 5"
External APIs: # e.g. "None" / "Stripe" / "OpenWeather" / "Anthropic Claude API"
AI/LLM:        # e.g. "None" / "OpenAI GPT-4o via fetch" / "Claude claude-sonnet-4-6, streaming"

# ─── MOBILE / NATIVE STACK (fill if applicable) ──────────────────────────────
Platform:      # e.g. "Android" / "iOS" / "Flutter" / "React Native" / "Web only"
Language:      # e.g. "Kotlin 1.9.0" / "Swift 5.9" / "Dart 3.2" / "TypeScript"
Min SDK:       # e.g. "Android 29 (10)" / "iOS 15.0" / "N/A"
Target SDK:    # e.g. "Android 35 (15)" / "iOS 17.0" / "N/A"
Architecture:  # e.g. "MVVM (ViewModel + LiveData)" / "MVI (Compose)" / "VIPER" / "BLoC"
UI Framework:  # e.g. "Material Design 3 (XML Views)" / "Jetpack Compose" / "SwiftUI" / "UIKit"
Navigation:    # e.g. "Navigation Component 2.7.4" / "NavigationStack" / "go_router"
DI:            # e.g. "Manual" / "Hilt/Dagger" / "Koin" / "Swinject"
Testing:       # e.g. "JUnit 4 + Espresso" / "XCTest" / "flutter_test"
CI/CD:         # e.g. "GitHub Actions" / "Fastlane" / "Bitrise" / "None"

# ─── PLATFORM & LOCALE ────────────────────────────────────────────────────────
Target Platforms: # e.g. "Desktop-first" / "Mobile-first PWA" / "Both (responsive)"
                  # Determines: touch targets, viewport units, safe-area-inset, hover media query
Locale / i18n:    # e.g. "English only, US" / "EN + FR + DE, LTR" / "Multi-locale + RTL (AR, HE)"
                  # None = i18n ignored. Any locale = §N activated.
Performance Budget: # e.g. "None defined" / "LCP < 2.5s, TTI < 5s on 3G" / "Bundle < 200kb gz"

# ─── ARCHITECTURE CONSTRAINTS ─────────────────────────────────────────────────
# Non-negotiable. Every recommendation must respect these — even if they are suboptimal.
# Suggestions to change constraints are welcome but must be clearly marked as architectural
# proposals, separate from standard findings.
Constraints:
  - # e.g. "Single-file: ALL code in App.jsx — no multi-file imports"
  - # e.g. "Zero build tools — no bundling, minification, tree-shaking"
  - # e.g. "CDN-only: React/libs loaded from CDN at runtime, no npm"
  - # e.g. "localStorage: sole persistence, 5MB limit, no server"

# ─── DESIGN IDENTITY ──────────────────────────────────────────────────────────
# The app's intentional visual and interactive character.
# This protects the aesthetic from being "standardized" into something generic.
# Extract from the code, or ask the user.
Design Identity:
  Theme:         # e.g. "Dark-first with cyan/teal accent" / "Clean minimal light" / "Playful colorful"
  Personality:   # e.g. "Precise and informative" / "Warm and approachable" / "Sleek and premium"
  Signature:     # e.g. "Animated background particles, OLED pitch-black mode, glowing accents"
                 # These are PROTECTED — the audit improves them but always preserves them.

  # ── PRODUCT & COMMERCIAL VISUAL IDENTITY ─────────────────────────────────
  # Used by §E8, §E9, §F6, §L4. Inferred from code + domain if not provided.
  # NOTE: Commercial fields (Visual Reference, Monetization Tier, Conversion) are
  # only activated for paid/freemium/professional products. Fan/free/community tools
  # use the aesthetic-fidelity framing instead — see §I.4 Aesthetic Context Analysis.
  Visual Reference:      # 2–3 apps or sources whose visual quality/feel this should match
  Emotional Target:      # The feeling the app should produce at first glance
  Visual Differentiator: # What makes this app visually memorable
  Monetization Tier:     # "Free (no revenue intent)" / "Free (community tool)" / "Freemium SaaS"
                         # "Paid consumer ($5–$30/mo)" / "Professional B2B ($50–$500/mo)" / "Enterprise"
                         # Determines which §E8 framing activates. "Free" = aesthetic framing only.
  Distribution Channel:  # Determines first-impression quality requirements

# ─── DOMAIN RULES ─────────────────────────────────────────────────────────────
# Every formula, constant, rate, threshold, and business rule the code MUST implement correctly.
# This is the specification. Wrong values here → wrong findings.
Domain Rules:
  - # List each as: RULE_NAME = value / formula / description
  - # e.g. "TAX_RATE = 0.21 (21% VAT, exclusive)"
  - # e.g. "All monetary values stored as integer cents — never float"

# ─── TEST VECTORS ─────────────────────────────────────────────────────────────
# Known input → expected output pairs for the app's core calculations.
# Pre-supply these if you have them — §A2 requires ≥3 for probability/financial apps.
Test Vectors:
  - # e.g. "Input: principal=1000, rate=0.05, years=10 → Expected: 1628.89 — Source: formula spec"

# ─── CRITICAL USER WORKFLOWS ──────────────────────────────────────────────────
# The 5–10 most important end-to-end user journeys. The audit traces each one step-by-step.
Workflows:
  1: # "New user → onboarding → first core action → result"
  2: # "Returning user → load state → update → verify output updates"
  3: # "Import external data → preview → confirm → verify correctness"
  4: # "Export → fresh device → import → verify round-trip fidelity"
  5: # "Power user with maximum data → performance still acceptable"

# ─── KNOWN ISSUES ─────────────────────────────────────────────────────────────
Known Issues:
  - # What the developer already suspects is broken

# ─── AUDIT SCOPE ──────────────────────────────────────────────────────────────
Audit Focus:   # e.g. "Full audit" / "Prioritize security and correctness" / "Design + polish only"
Out of Scope:  # e.g. "Backend code (not provided)" / "Third-party payment widget"

# ─── GROWTH CONTEXT ───────────────────────────────────────────────────────────
# Used by §O Projection Analysis. The audit reasons about the app's future, not just its present.
App Maturity:             # e.g. "Prototype/MVP" / "Active development" / "Stable/maintenance mode"
Expected Scale:           # e.g. "Single user forever" / "10–50 users" / "Scaling to thousands"
Likeliest Next Features:  # Top 3–5 features most likely to be added next
Planned Constraint Changes: # e.g. "Moving from localStorage to a backend in 6 months"
```

---

## I. ADAPTIVE CALIBRATION

Before writing any finding, classify the app along these axes. These classifications determine which dimensions get the deepest scrutiny and where severity multipliers apply.

### §I.1. Domain Classification → Severity Amplification

| Domain | Amplify These Dimensions | Stakes Default |
|--------|--------------------------|----------------|
| Medical / Health | §A1 Logic, §A-Rules, §B3 Validation, §C6 Compliance | CRITICAL |
| Financial / Fintech / Billing | §A1 Logic, §J1 Financial Precision, §C1 Auth, §C6 Compliance | HIGH→CRITICAL |
| Gambling-adjacent / Gacha | §A2 Probability, §L5 Ethical Design, §C6 Age/Compliance | MEDIUM→HIGH |
| E-commerce / Payments | §C1 Auth, §C2 XSS, §J1 Financial, §C6 PCI/GDPR | HIGH |
| Web3 / Crypto / Wallet | §C1 Key/Seed handling, §C2 Injection, §A1 Tx math, §C6 Jurisdiction | HIGH→CRITICAL |
| Social / Presence / Multi-user | §C5 Privacy, §J4 Real-time, §C6 GDPR/CCPA | MEDIUM→HIGH |
| Productivity / SaaS | §B State, §D Performance, §H Flows, §K Ops | MEDIUM |
| Creative / Media / Tools | §E Design, §D Assets, §G Compatibility | LOW→MEDIUM |
| Data / Analytics / Dashboards | §A1 Math, §B Data, §I Visualization | MEDIUM→HIGH |
| Game / Companion / Fan Tool | §A Domain Data, §E Design, §C Attribution | LOW→MEDIUM |
| AI / LLM-Powered | §K5 AI Integration, §C2 Prompt Injection, §C5 Privacy, §A1 Output Correctness | MEDIUM→HIGH |

### §I.2. Architecture Classification → Failure Modes

| Architecture | Primary Failure Modes to Hunt |
|--------------|-------------------------------|
| Single-file monolith (CDN React) | Dead code accumulation, blob Worker browser incompatibility, no code-splitting, CSS specificity at scale |
| Multi-file SPA (Vite/Webpack) | Bundle bloat, stale chunks, tree-shaking failures, import cycles |
| SSR / Next.js | Hydration mismatches, server/client state divergence, SEO gaps |
| Vanilla JS | Global scope pollution, event listener leaks, DOM coupling |
| PWA (any) | SW versioning, cache poisoning, offline-first edge cases |
| LocalStorage-only | Quota exhaustion, schema migration gaps, concurrent-tab conflicts |
| Backend-connected | Race conditions, optimistic update failures, token leaks, CORS |
| Android (MVVM/Kotlin) | Fragment lifecycle leaks, ViewModel scope misuse, coroutine cancellation gaps, permission model gaps, process death state loss, ProGuard stripping |
| Android (Compose) | Recomposition storms, state hoisting confusion, side-effect lifecycle, LazyColumn performance |
| iOS (UIKit) | Retain cycles, main-thread violations, lifecycle misuse, deep-link handling |
| iOS (SwiftUI) | @State/@StateObject confusion, view identity issues, NavigationStack complexity |
| Cross-platform (Flutter/RN) | Bridge bottleneck, platform-specific fallback gaps, native module versioning |

### §I.3. App Size → Audit Scope

| Lines of Code | Parts | Depth |
|---------------|-------|-------|
| < 500 | 4–5 | All dimensions, condensed findings |
| 500–2,000 | 6–8 | Full dimensions, moderate findings |
| 2,000–6,000 | 8–12 | Full dimensions, detailed findings |
| 6,000–15,000 | 12–16 | Full dimensions + domain deep dives |
| > 15,000 | 16+ | Full dimensions + per-module sub-audits |

### §I.4. Aesthetic Context Analysis — Five Independent Axes

> Aesthetic goals are derived from five independent dimensions that combine in any configuration. A meditation app, a nurse's calculator, a gacha companion, and a B2B dashboard all require different aesthetic reasoning. **Always classify all five axes before writing any §E/§F/§L finding.**

---

#### AXIS 1 — Commercial Intent
*What role does trust-building and conversion play in this app's visual goals?*

| Level | Signal | Aesthetic implication |
|-------|--------|-----------------------|
| **Revenue-generating** | Paid tier, subscription, in-app purchase, ad-supported | Visual trust signals actively matter — every design choice either supports or undermines willingness to pay or engage financially |
| **Institutional / grant-funded** | Non-profit, government, educational, healthcare org | Credibility and legitimacy signals matter — visual design must communicate seriousness and compliance |
| **Non-revenue / freely given** | Free tool, open-source, community gift | Commercial signals are irrelevant or actively harmful — visual goals shift entirely to craft, clarity, and authenticity |

---

#### AXIS 2 — Use Intensity & Emotional Context
*What is the user's cognitive and emotional state when using this app? This determines how much the design can demand of their attention.*

| Mode | Examples | Aesthetic implication |
|------|----------|-----------------------|
| **Focus-critical / high-frequency** | Daily work tool, professional instrument, developer IDE companion | Design must be nearly invisible — efficiency, scanability, and zero-distraction above all. Every animation is a tax. |
| **High-stakes / low-frequency** | Medical dosing calculator, legal document tool, emergency reference | Cognitive load reduction is the primary aesthetic goal. Visual noise = danger. Calm, high-contrast, unambiguous. |
| **Emotionally sensitive** | Mental health tool, grief support, therapy companion, crisis resource | Safety, warmth, and calm are structural requirements. Harsh colors, abrupt transitions, or playful copy cause harm. |
| **Creative / exploratory** | Art generator, music composition tool, design sandbox, writing tool | The aesthetic can be expressive and surprising — discovery and inspiration are valid goals. Delight is functional. |
| **Learning / progressive** | Educational app, tutorial tool, skill trainer | Visual design must communicate progress, reward effort, and reduce intimidation. Pacing and encouragement are aesthetic requirements. |
| **Leisure / casual** | Entertainment tracker, hobby companion, quiz app, idle tool | Delight is primary. Friction that would be tolerable in a work tool is unacceptable here. Polish and playfulness are both appropriate. |
| **Occasional / transactional** | Unit converter, flight tracker, calculator, lookup tool | Get in, get the answer, get out. Visual complexity above "clean and immediate" is waste. |

---

#### AXIS 3 — Audience Relationship to the Subject
*How much does the audience already know? This determines vocabulary, visual complexity, information density, and what "belonging" looks like.*

| Relationship | Examples | Aesthetic implication |
|--------------|----------|-----------------------|
| **Domain expert / practitioner** | Clinicians, engineers, developers, financial analysts | Information density is a feature. Precision vocabulary is required. Visual complexity can be high if it serves the data. |
| **Enthusiast / community member** | Hobbyists, fans, dedicated amateurs | Community vocabulary and aesthetic norms signal insider status. Generic design signals the maker is an outsider. |
| **Casual / general public** | Anyone unfamiliar with the domain | Progressive disclosure is mandatory. Domain jargon must be avoided or clearly explained. |
| **Mixed / bridging** | A tool that serves both experts and beginners | Progressive disclosure architecture is critical. The design must serve both without condescending to experts or overwhelming novices. |

---

#### AXIS 4 — Subject Visual Identity
*Does the subject the app is built around have an established visual language? This determines whether visual fidelity is a goal.*

| Identity strength | Examples | Aesthetic implication |
|-------------------|----------|-----------------------|
| **Strong established aesthetic** | A specific game, show, sport league, musical genre, cultural movement | The app has an opportunity to honor the visual language of its subject. Palette, typography weight, motion character, and copy tone should feel *inspired by* the source. |
| **Community-defined aesthetic norms** | Hacker/developer culture, speedrunning community, tabletop RPG players, street photography | The community has visual conventions that signal insider status. Violating them reads as outsider. |
| **Domain-defined visual conventions** | Medical interfaces, financial terminals, academic tools, engineering dashboards | Professional domains have established visual conventions. Departing without reason creates distrust. |
| **Neutral / no established identity** | Abstract SaaS, general productivity tool, new utility | Visual language must be invented. Coherence must come entirely from within. |
| **The aesthetic IS the subject** | Generative art tool, music visualizer, color palette builder, typography explorer | The product's visual output is its primary value. The UI chrome must recede. |

---

#### AXIS 5 — Aesthetic Role in the Product's Value
*Is design serving function, communicating identity, or is it the product itself?*

| Role | Examples | Aesthetic implication |
|------|----------|-----------------------|
| **Aesthetic IS the value** | Generative art, music player, creative tool, animation playground | The interface aesthetic is inseparable from the product. Compromise here is product failure. |
| **Aesthetic amplifies the value** | Well-designed productivity app, thoughtfully crafted community tool | Good aesthetic makes a working product better. Standard design investment applies. |
| **Aesthetic communicates identity** | Portfolio, cultural tool, brand-representing product, community-facing gift | The design is a statement about the maker and their relationship to the subject or audience. Authenticity matters as much as polish. |
| **Aesthetic must stay invisible** | Emergency tool, high-stress professional instrument, accessibility-first interface, crisis resource | Design that draws attention to itself is actively harmful. The goal is zero interference with the user's cognitive task. |

---

#### APPLYING THE FIVE AXES

**Step 1**: Classify each axis from §0 signals, code, and domain. Record the classification explicitly at the start of the audit.

**Step 2**: Identify axis conflicts. Some combinations create genuine tension that must be resolved deliberately:
- *High commercial intent + emotional sensitivity* (wellness app with subscription) → commercial signals must be handled with exceptional care — trust comes from emotional safety first, conversion second
- *Expert audience + strong subject identity* (developer tool with hacker culture norms) → density and terseness ARE the aesthetic — over-polishing violates community norms
- *Aesthetic IS the subject + high-stakes use* (medical imaging tool with visualization) → the visualization must be designed with craft; the UI chrome around it must disappear
- *Mixed audience + domain aesthetic conventions* (medical app for patients AND clinicians) → requires two visual registers in one product — acknowledge this as an architectural design challenge

**Step 3**: Derive the **Aesthetic Goal Profile** — a one-sentence summary for this specific app:
> *"The aesthetic goal for [app] is: [primary goal derived from axes], which means [2–3 specific implications for findings]."*

Example profiles:
- A free community tool for enthusiasts of a visually distinctive subject, used leisurely: *"Craft and subject fidelity — the app should feel made by someone who genuinely knows this world."*
- A high-frequency professional tool for domain experts, used in focus-critical contexts: *"Invisible efficiency — every design element must serve information retrieval speed. Delight is a distraction. Density is a feature."*
- A paid creative tool for mixed audiences: *"Expressive trust — the aesthetic must feel inspiring enough to justify the cost, accessible enough for newcomers, and restrained enough not to compete with what the user creates."*
- A free wellness app used in emotionally sensitive contexts: *"Calm safety — warmth and visual quiet are functional requirements."*

**Step 4**: Use the Aesthetic Goal Profile as the filter for every finding in §E, §F, and §L. A finding that contradicts the profile is wrong for this app, regardless of how valid it would be for a different app.

---

#### THE FIVE-AXIS LENS REFERENCE

Throughout §E, §F, and §L, findings are marked with the axis they primarily serve:

- `[A1]` Commercial intent axis — applies when revenue or institutional credibility is a goal
- `[A2]` Use context axis — applies when emotional state or cognitive load shapes the requirement
- `[A3]` Audience axis — applies when expertise level shapes vocabulary or density
- `[A4]` Subject identity axis — applies when the subject has visual conventions to honor
- `[A5]` Aesthetic role axis — applies when aesthetic investment level or restraint is the question

**How to handle axis tags**: When a finding is tagged `[A1]` and the app is non-revenue, skip that finding or substantially reframe it. When a finding is tagged `[A4]` and the subject has no established visual identity, skip that finding or substantially reframe it. The tags make the conditionality explicit.

---

### §I.5. Domain Rule Extraction

When the user has not provided domain rules, extract them from the code. Apply strict source discipline:

**Every extracted value starts as `[CODE]`.** It becomes `[§0-CONFIRMED]` only after the user explicitly confirms it. A code value is evidence of what the code *does*, which may differ from what it *should* do.

```javascript
// Named constants → immediate §0 candidates
const TAX_RATE = 0.21           // → [CODE: line N] — present to user for confirmation
const MAX_ITEMS = 50            // → [CODE: line N] — is this a spec value or an implementation guess?
const MAX_SESSIONS = 5          // → [CODE: line N] — verify against authoritative spec

// Hardcoded numbers in formulas → require verification
if (score > 100) { ... }                   // → [CODE: line N] — why 100? Spec rule or implementation assumption?
const rate = 0.08 + (i - 50) * ramp       // → [CODE: line N] — why 0.08? Why 50? Need source.
const total = items * 1.21                 // → [CODE: line N] — hardcoded tax rate? Which jurisdiction?
const dose = weight * 0.5                  // → [CODE: line N] — CRITICAL: present to user for confirmation. Do not guess the correct coefficient.
```

Present extracted rules in this format:
> ✓ `MAX_SESSIONS = 5` [CODE: line 342] — Matches [§0-CONFIRMED]. Verified.
> ⚠ `ramp_divisor = 15` [CODE: line 989] — Not in §0. Flagging for user confirmation before writing findings that use this value.
> 🚨 `dose = weight * 0.5` [CODE: line 1204] — Coefficient in code but unconfirmed. CRITICAL until confirmed. Presenting to user for confirmation. Not recalling a "correct" value from training data.
> 🔲 `BASE_RATE` — Needed for §A1 assessment but absent from code and §0. Deferring finding. Flagging as audit gap.

**Domain-specific escalation triggers** — when these patterns appear in code, escalate automatically:

| Code Pattern | Auto-Escalation |
|-------------|-----------------|
| `dose`, `dosage`, `medication`, `mg`, `mcg` | All §A1 findings → CRITICAL minimum |
| `payment`, `charge`, `billing`, `stripe` | All §C1, §C2 findings → CRITICAL minimum |
| `balance`, `transaction`, `transfer` | All §A1, §B3 findings → CRITICAL minimum |
| `float` used for monetary values | Automatic CRITICAL finding — money is stored as integers (cents), always |
| `age`, `minor`, `children` | All §C6 compliance findings → HIGH minimum |
| `password`, `token`, `secret` in localStorage | Automatic CRITICAL finding |
| Probability displayed without worst-case | §A2, §L5 — HIGH if real money involved |

---

### §I.6. Knowledge & Source Integrity

> Domain data fabrication is the most damaging audit error. It is worse than a missed bug, because fabricated facts produce false findings. Every domain fact must be sourced, evaluated, and cited.

#### Source Classification

Every domain fact must carry one of four source tags:

| Tier | Tag | Meaning | Action |
|------|-----|---------|--------|
| Code-verified | `[CODE: line N]` | Value read directly from the provided source file | Ground truth for code *behavior*. Still needs verification against §0 to confirm it is *correct*. |
| User-confirmed | `[§0-CONFIRMED]` | Value provided or confirmed by the user in §0 | The specification. Code is tested against this. |
| Web-sourced | `[WEB: source, version, date]` | Value found via live web search | Quality tier determines whether it supports a finding — see Web Source Quality below. |
| Training-recalled | `[UNVERIFIED]` | Value recalled from training data only | Present as a question to the user. Do not use as a finding basis. |

**Source hierarchy for correctness claims** (strongest → weakest):
`[§0-CONFIRMED]` → `[WEB: official-docs]` → `[WEB: patch-notes]` → `[WEB: official-wiki]` → `[CODE]` alone → `[WEB: community-wiki]` → `[WEB: forum]` → `[UNVERIFIED]`

Only `[§0-CONFIRMED]` and `[WEB: official-docs/patch-notes]` are strong enough to assert "the code is wrong." Everything below supports a question or a flag, not a definitive finding.

#### Web Source Quality

| Quality | Tag | Examples | Supports correctness finding? |
|---------|-----|----------|-------------------------------|
| Official documentation | `[WEB: official]` | Developer's own API docs, official site, medical publisher, standards body | Yes — after version check |
| Official patch / release notes | `[WEB: patch-notes, vX.Y]` | Dated changelogs from the developer | Yes — if version matches the app under audit |
| Developer-maintained wiki | `[WEB: official-wiki]` | Wiki explicitly maintained by the studio or org | Yes — with date check |
| Community wiki | `[WEB: community-wiki, date]` | Player-maintained wikis, fan wikis | Conditional — only if recently verified and internally sourced |
| Forum / community post | `[WEB: forum, date]` | Reddit, Discord, community guides | No — lead only; requires corroboration from a higher-quality source |
| Aggregator / secondary | `[WEB: aggregator]` | Sites summarizing other sources | No — locate and cite the original source directly |

**Seven rules for web-sourced domain facts:**

1. **Always prefer official sources.** When official docs exist, cite those. Not a wiki.
2. **Always record version and date.** Tag as `[WEB: official-docs, v1.8, 2024-03]`. A correct value from last year may be wrong today.
3. **When sources disagree, always surface the conflict. Always let the user decide.** Present both values and ask.
   > "⚠ SOURCE CONFLICT: Official API docs [WEB: official, 2025-01] state `MAX_TOKENS = 4096`. Community wiki [WEB: community-wiki, 2024-06] states `8192`. Please confirm which applies to your integration."
4. **When community wiki contradicts official docs, defer to official docs and flag the discrepancy.**
5. **When only community/forum sources exist, present as a question, not an assertion.**
   > "🔲 `BASE_RATE = 0.006` [CODE: line 412]. Only a community guide found — no official reference. Flagged as audit gap."
6. **Always surface discrepancies between a web value and a code value. Always let the user decide.**
7. **When web sources conflict, always let the user arbitrate.** Training memory is not a tiebreaker.

**Domain categories where web sources are especially unreliable:**
- Game mechanics and live-service constants: frequently updated per-patch; wiki edits lag announcements; community speculation presented as fact
- Third-party API limits: frequently tier-dependent and silently changed; documented limit ≠ enforced limit
- Medical reference ranges: cite peer-reviewed publication or official clinical guideline only
- Community-derived formulas (datamining, reverse-engineering): approximations, not specifications — tag `[WEB: community-derived]` and flag uncertainty explicitly

**Domain categories where training data is especially unreliable — always treat as `[UNVERIFIED]`:**
- Game mechanics, live-service constants, per-patch values (rates, thresholds, drop tables, cooldowns)
- Third-party API rate limits, pricing tiers, model context windows, service SLAs
- Medical reference ranges, drug interaction rules, clinical formula coefficients
- Financial regulation specifics (tax rates, reporting thresholds, jurisdiction rules)

#### Scenario Reference

| Situation | Correct output |
|-----------|----------------|
| Code matches §0 or official web source | ✓ `RATE = 0.006` [CODE: line 412] matches [§0-CONFIRMED] / [WEB: official, v1.8, 2024-11]. Verified. |
| Code value, no §0, official web source found | ⚠ Official docs confirm this value. Flagging for user confirmation that this is the correct reference version. |
| Code value, web sources conflict | ⚠ SOURCE CONFLICT: Official docs: X. Community wiki: Y. Presenting both — please confirm which source applies. |
| Code value, only community sources | 🔲 Only community sources found. Flagged as audit gap; presenting as question. |
| Value needed, no source anywhere | 🔲 Value needed for §A1 assessment. No §0, no reliable web source found. Deferring correctness finding — audit gap. |

#### Cross-Session Consistency

When a second or subsequent audit occurs on the same app or a different version:
1. Surface the Prior Audit Continuity block from §0 at the top of Part 1
2. Prior `[§0-CONFIRMED]` rules carry forward as confirmed until explicitly contradicted by new §0 input
3. Any conflict between this session's findings and a prior confirmed rule surfaces immediately as `[CONFLICT]` — present both values, let the user decide
4. Always re-derive domain rules from code + new user confirmation. Training data from the prior session is not a substitute.
5. Version differences are real: a constant correct in v1.2 may have changed in v1.3. Always check whether the app version has changed and flag which confirmed rules may be version-specific

---

### §I.7. Adaptive Analysis Protocols

#### Mid-Audit Reclassification Triggers
During the audit, if any of the following are discovered, **STOP and reclassify before continuing**. The initial §0 classification was based on incomplete information; these discoveries change the audit's severity baseline:

| Discovery | Reclassification Action |
|-----------|------------------------|
| Undisclosed financial transaction code | Escalate Stakes → HIGH; activate §K1, §C1 |
| Undisclosed health / dosage calculations | Escalate Stakes → CRITICAL immediately |
| State that persists PII to localStorage | Activate full §C5, §C6 GDPR review |
| CDN scripts without SRI in a payment/auth context | Immediate CRITICAL — supply chain attack surface |
| Code quality varies dramatically by section | Flag multiple-author / rush-commit sections; elevate confidence threshold for those sections |
| Dead code > 20% of total codebase | Adjust P10 scope — dead code analysis becomes primary; active/dead boundary must be mapped before other dimensions |
| Hardcoded credentials found | Surface as CRITICAL immediately; wait for developer acknowledgment before proceeding |
| Imports or calls to modules not present in provided files | Note as audit gap — affected findings are [THEORETICAL] until missing code is provided |

#### Partial Codebase Protocol
When only part of the codebase is provided:
1. Explicitly list what is not provided — `backend/`, auth module, worker file, etc.
2. Flag findings that depend on missing code as `[THEORETICAL]` — cannot confirm without full context
3. Record the absence of each missing file as a named audit gap
4. State which dimensions are affected by each gap and what would be needed to close it
5. Ask the user to provide the missing files before proceeding with deeply affected dimensions

#### Novel Pattern Protocol
When encountering a pattern not covered by the audit taxonomy:
1. Describe the pattern precisely — what it does, what it appears to intend, what it resembles
2. Classify by analogy: "behaves like a state machine implemented via X instead of Y"
3. Apply the nearest applicable dimension's criteria and note the approximation explicitly
4. Flag: `[NON-STANDARD PATTERN — audit criteria approximated via §X analogy]`
5. Note what cannot be assessed without understanding the original intent

#### Code Quality Variance Signal
If code quality varies significantly between sections:
- This is a strong signal of **multiple authors**, **time-pressure commits**, or **copy-paste from external sources**
- Identify which sections have lower quality and apply elevated scrutiny to those sections
- Critical risk flag: if lower-quality sections handle higher-stakes logic (payments, medical, auth), this is the **highest-risk combination** in the codebase — escalate all findings in those sections by one severity level

#### Signal Correlation — Connecting Distant Patterns
Some bugs are only visible when two distant code locations are read together:
- A constant defined early, used incorrectly hundreds of lines later
- A validation rule in one component that contradicts business logic in another
- State initialized correctly but reset incorrectly in a cleanup function far away
- A security assumption in one layer silently violated by a different layer

**Protocol**: For every validation rule, find every place that validates the same concept — verify they all agree. For every security assumption, trace whether anything downstream silently violates it. Cross-reference findings across sections before finalizing severity.

---

## II. COMPOUND FINDING CHAINS

Some bugs are individually minor but form chains of escalating harm when combined. Always look for:
- Validation gap [LOW] → invalid value in engine [MEDIUM] → wrong output displayed [HIGH] → user makes bad real-world decision [CRITICAL given stakes]
- Missing cache invalidation [LOW] → stale data served [MEDIUM] → user acts on outdated info [HIGH] → financial/health consequence [CRITICAL]

When a chain exists: document it, escalate the combined severity, and number the chain.

---

## III. EXECUTION PLAN

### Pre-Flight Checklist (Mandatory — Before Any Finding)

> **Claude Code**: Use `Agent` (subagent_type: Explore) to read the entire codebase in parallel. For large apps, launch multiple agents targeting different directories. Use `TodoWrite` to create the audit progress tracker. Use `AskUserQuestion` for any §0 fields you cannot extract from code.

```
[ ] Read the entire source file(s) top-to-bottom without skipping
    → Claude Code: Use Agent(Explore) for large codebases, Glob + Read for small ones

[ ] Classify: domain type, architecture pattern, app size → determine part count

[ ] Extract all domain rules from code → present to user for verification → flag discrepancies
    → Claude Code: Use Grep with these patterns:
      Constants:      Grep(pattern: "(val|const|let|var|static|final)\\s+[A-Z_]{2,}\\s*=", type: "kotlin")
      Magic numbers:  Grep(pattern: "[^0-9][0-9]{2,}[^0-9dpsp]", glob: "*.kt")  — then filter non-obvious
      Hardcoded URLs: Grep(pattern: "https?://", glob: "*.{kt,java,xml}")
      Formulas:       Grep(pattern: "(Math\\.|ceil|floor|round|sqrt|pow|abs|max|min)", type: "kotlin")

[ ] Identify all architectural constraints → acknowledge them explicitly
    → Claude Code: Read build config files first:
      Android: Glob(pattern: "**/build.gradle*") + Read AndroidManifest.xml
      iOS:     Glob(pattern: "**/Podfile") or Glob(pattern: "**/Package.swift")
      Web:     Read package.json, vite.config.*, webpack.config.*

[ ] Extract Design Identity from code if not provided → confirm with user
    → Claude Code: Read theme/style files:
      Android: Glob(pattern: "**/res/values/colors.xml") + Glob(pattern: "**/res/values/themes.xml")
              + Glob(pattern: "**/res/values/styles.xml") + Glob(pattern: "**/res/values-night/**")
      Web:     Grep(pattern: "--[a-z]", glob: "*.css") for CSS variables
      iOS:     Glob(pattern: "**/*.xcassets/**")

[ ] Build Feature Preservation Ledger (every named feature: status + safety flags)
    → Claude Code: Use Grep(pattern: "class.*Fragment|class.*Activity|class.*ViewModel", type: "kotlin")
      to inventory all screens/features

[ ] Map each critical workflow from §0 through the actual code

[ ] Identify top 5 risk areas based on domain classification

[ ] Announce: domain class, architecture class, planned part count, top-risk areas

[ ] For apps > 3,000 lines: wait for user acknowledgment before Part 2
    → Claude Code: Use AskUserQuestion to confirm before proceeding

[ ] Create progress tracker with TodoWrite listing all planned parts
```

### Part Structure

| Part | Focus | Deliverables |
|------|-------|-----------------------------|
| **P1** | Pre-Flight · Inventory · Architecture | Feature Preservation Ledger, Constraint Map, Design Identity Confirmation, Domain Rule Verification Table, Workflow Map, Audit Plan |
| **P2** | Domain Logic & Business Rules | Rule-by-Rule Verification, Formula Test Vectors, Data Accuracy Report, Temporal/Timezone Audit |
| **P3** | Security · Privacy · Compliance | Threat Model, Sensitive Data Inventory, Attack Surface Map, Compliance Gap List |
| **P4** | State · Data Integrity · Persistence | State Schema Audit, Validation Gap Report, Data Flow Diagram, Corruption Paths |
| **P5** | Performance · Memory · Loading | Web Vitals Estimate, Resource Budget Table, Memory Leak Inventory, Computation Bottlenecks |
| **P6** | Visual Design · Polish · Design System | Design Token Audit, Visual Rhythm Analysis, Component Quality Scorecard, Polish Gap Inventory |
| **P7** | UX · Information Architecture · Copy | Flow Analysis, IA Audit, Copy Quality Inventory, Interaction Pattern Audit |
| **P8** | Accessibility | Full WCAG 2.1 AA Checklist, Screen Reader Trace, Keyboard Nav Map, ARIA Correctness |
| **P9** | Browser · Platform · Compatibility | Cross-Browser Matrix, PWA Audit, Mobile/Touch Audit, Network Resilience Matrix |
| **P10** | Code Quality · Architecture · Optimization | Dead Code Inventory, Duplication Map, Naming Audit, Structural Analysis, Optimization Opportunities |
| **P11** | AI / LLM Integration *(activated when External APIs or AI/LLM field in §0 references any AI provider)* | Prompt Injection Surface, Output Sanitization Audit, Streaming Error Handling, Token/Cost Risk, Hallucination Exposure |
| **P12** | Internationalization & Localization | Hardcoded String Inventory, Locale-Sensitive Format Audit, RTL Audit, i18n Completeness Report |
| **P13** | Development Scenario Projection *(§O — see Growth Context in §0)* | Scale Cliff Analysis, Feature Addition Risk Map, Technical Debt Compounding Map, Dependency Decay Forecast, Constraint Evolution Analysis, Maintenance Trap Inventory |
| **P14+** | Domain Deep Dives | App-specific: probability math, financial precision, medical logic, AI integration, API contracts, etc. |
| **P-R&D** | Research, Development & Improvement *(§X)* | Existing Feature Health Audit, Feature Gap Matrix, Improvement Prioritization, R&D Roadmap, Experimentation Protocol |
| **P-POL** | Polishing & Restructuration *(§XI)* | App Comprehension Record, Coherence Fracture Map, Polish Passes (0–6), Code Restructuring, Architecture Evolution, Quality Gates |
| **Final** | Summary Dashboard | Findings table, Root Cause Analysis, Compound Chains, Quick Wins, Optimization Roadmap, Polish Roadmap |
## IV. AUDIT DIMENSIONS

> 120+ dimensions across 15 categories. Every dimension applies to every app.
> Domain Classification (§I.1) determines depth and severity multipliers.

> **Claude:** This is the largest section (~1,400 lines). Read only the category you are currently auditing. Use this mini-index to jump to the category you need:
>
> | Category | Line Anchor | Sections |
> |----------|------------|----------|
> | **A** Domain Logic | `### CATEGORY A` | §A1–§A7 |
> | **B** State & Data | `### CATEGORY B` | §B1–§B6 |
> | **C** Security | `### CATEGORY C` | §C1–§C7 |
> | **D** Performance | `### CATEGORY D` | §D1–§D5 |
> | **E** Visual Design | `### CATEGORY E` | §E1–§E11 |
> | **F** UX & IA | `### CATEGORY F` | §F1–§F6 |
> | **G** Accessibility | `### CATEGORY G` | §G1–§G5 |
> | **H** Compatibility | `### CATEGORY H` | §H1–§H4 |
> | **I** Code Quality | `### CATEGORY I` | §I1–§I6 |
> | **J** Data Presentation | `### CATEGORY J` | §J1–§J4 |
> | **K** Domain Depths | `### CATEGORY K` | §K1–§K5 |
> | **L** Polish & Standard. | `### CATEGORY L` | §L1–§L7 |
> | **M** Deployment | `### CATEGORY M` | §M1–§M3 |
> | **N** i18n | `### CATEGORY N` | §N1–§N4 |
> | **O** Projections | `### CATEGORY O` | §O1–§O7 |
>
> Use `Grep` with the category header (e.g., `### CATEGORY E`) to jump directly.

---

### CATEGORY A — Domain Logic & Correctness

The most consequential category. An app that looks polished but produces wrong output is harmful. Every point here verifies against §0 Domain Rules.

#### §A1. BUSINESS RULE & FORMULA CORRECTNESS
- **Constants verification**: Compare every named constant to the §0 expected value. Flag every discrepancy immediately, regardless of size.
- **Formula reproduction**: For every non-trivial formula — reproduce it by hand with known inputs and compare to actual code output.
- **Operator precision**: Check `>` vs `>=`, `&&` vs `||`, `Math.floor` vs `Math.round` vs `Math.ceil` — each one changes behavior at boundaries.
- **Order of operations**: Check integer vs float division. Check parenthesization. Check associativity assumptions.
- **Precision strategy**: Identify where rounding happens — at computation, at display, or both. Check whether rounding errors accumulate across a multi-step pipeline.
- **Units consistency**: Check for values that look similar but differ (percentages as 0–1 vs 0–100, ms vs s, cents vs dollars). Verify each is handled correctly.
- **Domain invariants**: Identify properties that must always hold true (probabilities sum to 1.0, totals match line items, age ≥ 0). Check whether they are enforced or only assumed.
- **Boundary values**: Test the exact edges: `0`, `1`, `max_valid`, `max_valid + 1`, `-1`, `null`, `undefined`, `NaN`, empty string.

#### §A2. PROBABILITY & STATISTICAL CORRECTNESS *(deepened for gambling/gacha/actuarial/analytics)*
- **Model validity**: Verify the mathematical model is appropriate for the actual stochastic process (Markov, independence, memoryless).
- **CDF integrity**: Verify the cumulative distribution reaches ≥0.9999 within the supported domain. Check whether residual probability is accounted for.
- **Expected value verification**: Verify computed EV matches closed-form solution where one exists.
- **Monte Carlo adequacy**: Verify sufficient trial count for the required precision. Check whether standard error is reported to user.
- **Numerical stability**: Check for underflow at very small probabilities. Check for overflow at very large inputs.
- **Known-good test vectors**: Verify ≥3 manually-verified {input → expected output} pairs tested against the engine.
- **Uncertainty communication**: Check whether results are labeled as estimates. Check whether confidence intervals are disclosed.

#### §A3. TEMPORAL & TIMEZONE CORRECTNESS
- **UTC offset correctness**: Verify every region's offset. Prefer named timezones over hardcoded offsets (named are safer).
- **DST transitions**: For any region with DST (US, EU, AU, etc.) — verify spring-forward and fall-back are handled. Check countdowns crossing a DST boundary.
- **Epoch arithmetic**: Check for timestamps in ms vs s — are they mixed? Check for far-future overflow.
- **Relative time**: Check "X days until" for off-by-one at midnight. Verify timezone-awareness.
- **Scheduled events**: Check daily/weekly resets — verify correct simultaneously for all supported timezones.
- **Stale temporal data**: Check for hardcoded dates that were correct at write-time but have since passed.

#### §A4. STATE MACHINE CORRECTNESS
- **Reachable invalid states**: Check whether the app can arrive at a combination of state values that has no defined meaning.
- **Transition completeness**: For every event from every state — verify the transition is defined. Check for undefined behavior on any combination.
- **Guard conditions**: For transitions that should only fire under certain conditions — verify guards are actually enforced.
- **Race conditions**: Check rapid clicks, concurrent tabs, Worker messages arriving simultaneously — verify state consistency is maintained.
- **Idempotency**: Verify actions safe to repeat (refresh, double-click, re-import) produce the same result.

#### §A5. EMBEDDED DATA ACCURACY
- **Named entity correctness**: Verify every named item (character, product, rate, rule, material) against the authoritative source in §0.
- **Staleness**: Identify which version/date the data is accurate as of. Check whether that version is documented. Identify what has changed since.
- **Cross-reference integrity**: When Entity A references Entity B — verify B exists and has the expected attributes.
- **Completeness**: Check for all expected entities. Identify gaps in coverage.
- **Relationship correctness**: Check parent-child, lookup, many-to-many relationships for bidirectional consistency.

#### §A6. ASYNC & CONCURRENCY BUG PATTERNS

These bugs are invisible in single-path testing but surface reliably in real usage.

- **Stale closure captures (React)**: Check `useEffect` callbacks capturing state/props via closure. If the dependency array is missing or incomplete, the effect runs with stale values. Classic symptom: a `setInterval` inside `useEffect` reads state that never updates after the initial render.
- **`async` in `forEach`**: Check for `array.forEach(async item => { ... })`. `forEach` does not await Promises. All async operations fire simultaneously and errors are silently swallowed. The fix is `for...of` with `await` or `Promise.all()`.
- **Promise swallowing**: Check for `.catch(() => {})` or bare `.catch(console.error)` with no recovery path. The operation silently fails, the app continues in a broken state the user cannot detect or recover from.
- **Unhandled Promise rejections**: Check for `async` functions called without `await` and without `.catch()`. The rejection is unhandled. Search for every `asyncFn()` call pattern (no `await`, no `.then/.catch`).
- **Race condition on sequential async calls**: Two rapid user actions each fire an async request — the second resolves first, then the first overwrites the newer result. Fix: use `AbortController` to cancel the previous request, or track a request sequence number and discard stale responses.
- **Missing `useEffect` cleanup**: Check whether effects that create subscriptions, event listeners, timers, or WebSocket connections include a cleanup function (`return () => { ... }`). Missing cleanup causes resource leaks and "state update on unmounted component" warnings.
- **Concurrent state writes from multiple effects**: Check for multiple `useEffect` hooks each calling `setState` on the same state slice, triggered by the same event. One effect silently overwrites another's result.
- **`setTimeout`/`setInterval` drift**: Check for `setInterval` used for countdown timers. Each tick drifts slightly due to JS event loop variance. After minutes, a visible desynchronization appears. Fix: use absolute timestamp deltas (`targetTime - Date.now()`).
- **Async constructor / mount pattern**: Check for critical initialization logic placed in `useEffect`. The component renders once with empty/default state before the effect runs. If no loading state is shown, the user sees a flash of wrong data or empty UI.

#### §A7. JAVASCRIPT TYPE COERCION & IMPLICIT CONVERSION TRAPS

JS silently converts types in ways that produce wrong results without throwing errors — the code runs, the numbers look plausible, and the bug is invisible until edge cases hit.

- **`==` vs `===`**: `"0" == false` → `true`. `null == undefined` → `true`. `[] == false` → `true`. `"" == 0` → `true`. Search the entire codebase for `==` (excluding `===`) and assess each one.
- **`+` operator with mixed types**: `"5" + 3` → `"53"`. Any `+` operation touching user input or API response data (which arrives as strings) silently concatenates instead of adding. Always explicitly convert: `Number(input) + 3` or `parseInt(input, 10) + 3`.
- **`parseInt` without radix**: Always require `parseInt(str, 10)`. Also: `parseInt("3.5px")` → `3` — stops at the first non-numeric character. Check whether this is the intended behavior for inputs like "3.5rem", "10%", "N/A".
- **`parseFloat` on formatted numbers**: `parseFloat("1,234.56")` → `1`. Any user-formatted or locale-formatted number string must be normalized (strip commas, currency symbols) before parsing.
- **Falsy value cascade**: `0`, `""`, `null`, `undefined`, `NaN`, and `false` are all falsy. `if (count)` is `false` when `count === 0` — a common off-by-one source for zero-item states. `if (name)` is `false` when `name === ""`. Use explicit comparisons: `count !== null && count !== undefined` or `count != null` (intentional `!=`).
- **NaN propagation**: `NaN !== NaN` — the only value not equal to itself. `isNaN("hello")` returns `true`; so does `isNaN(undefined)` — they mean different things. Use `Number.isNaN()` for strict detection. Any arithmetic involving NaN silently produces NaN, which propagates through the entire calculation pipeline, ultimately displaying as `NaN` or `0` (after `|| 0` guards) with no error.
- **Array/object truth inconsistency**: `[]` and `{}` are truthy. `Boolean([])` → `true`, but `[] == false` → `true` via type coercion. Conditionals that expect to distinguish "no data" from "empty array" must use `.length` checks.
- **Numeric string comparisons**: `"10" > "9"` → `false` (string comparison: `"1" < "9"`). If sort comparators or range checks operate on uncoerced string inputs, ordering silently fails for numbers ≥ 10.
- **`typeof null === "object"`**: Historical JS bug, unfixable. `if (typeof x === "object")` is true for `null`. Always add `&& x !== null` for any object type check.
- **Implicit global variable creation**: A variable assigned without `let`/`const`/`var` inside a function silently becomes a property on `window`. Check whether `"use strict"` is enabled globally to catch this class at runtime.

---

### CATEGORY B — State Management & Data Integrity

#### §B1. STATE ARCHITECTURE
- **Schema completeness**: Verify every field has a documented type, valid range, default value, null/undefined behavior, and purpose.
- **Normalization**: Check for any piece of data represented in two places that can diverge. Verify single source of truth for everything.
- **Derived state staleness**: Check whether computed values are re-derived on demand or cached. If cached, identify what invalidates the cache.
- **Initialization correctness**: Verify default state is valid for both fresh install and state-restored-from-storage.
- **Reset completeness**: Check whether state reset/clear leaves orphaned storage keys or misses any field.

#### §B2. PERSISTENCE & STORAGE
- **Completeness**: Verify every user-meaningful state field is persisted. Check for any transient UI state accidentally persisted.
- **Schema versioning**: Check for a version identifier in stored data. Check for migration logic for schema evolution across app versions.
- **Quota management**: Check whether localStorage size is monitored. Check for user warning approaching 5MB. Check whether `QuotaExceededError` is caught gracefully.
- **Concurrent write safety**: Check for multiple tabs writing simultaneously. Identify race conditions and data loss potential.
- **Cold start validation**: Check whether persisted state is parsed and validated against current schema before use. Check whether corrupted state from a previous bug is handled.
- **Sensitive data in storage**: Check for tokens, passwords, PII stored unencrypted in localStorage.

#### §B3. INPUT VALIDATION & SANITIZATION
- **Coverage**: Verify every user-facing input is validated. Identify any that are bypassed.
- **Type enforcement**: Check for silent type coercion (`"0" == 0`, `parseInt(undefined)`) producing wrong values.
- **Range enforcement**: Check whether min/max limits are enforced at input layer, computation layer, or display layer (or none).
- **Boundary testing**: For each input: test `0`, `max`, `max+1`, `-1`, `""`, `null`, `NaN` — identify what happens.
- **NaN/Infinity propagation**: Check for division by zero. Check for `parseInt("")` returning NaN silently becoming 0 in downstream math.
- **Validation UX**: Verify error messages tell the user what went wrong and what they should enter instead.

#### §B4. IMPORT & EXPORT INTEGRITY
- **Import safety**: Verify `JSON.parse` is in try/catch everywhere. Check for prototype pollution via `__proto__`/`constructor`/`prototype` keys.
- **Size enforcement**: Check whether maximum import size is enforced before parsing begins.
- **Schema validation**: Verify imported data is validated against expected schema. Check that it is not blindly spread into state.
- **Preview before commit**: Check whether user sees what will change before confirming.
- **Rollback capability**: Check whether pre-import state snapshot is saved. Check whether import is undoable.
- **Round-trip fidelity**: Verify `export → import → export` produces identical exports.
- **Partial import**: Check whether user can import a subset without overwriting unrelated state.
- **Export completeness**: Verify 100% of user state is included in export. Identify anything missing.
- **Self-describing schema**: Check for version field and field descriptions in export JSON, so external tools can parse it.

#### §B5. DATA FLOW MAP
Produce a text diagram: `User Input → Validation → State → Computation → Display`
At every arrow: identify what can go wrong, what protection exists, and what the gap is.

#### §B6. MUTATION & REFERENCE INTEGRITY

Mutation bugs are among the hardest to find — the code looks correct but silently operates on shared references, causing distant, non-reproducible state corruption.

- **Direct state mutation (React/Vue)**: Check for `state.items.push(item)` or `state.count++` which mutates the existing reference. The framework's reconciler sees the same reference and may skip re-render, or render with partially updated state. Always produce new references: `setState(prev => ({ ...prev, items: [...prev.items, item] }))`.
- **`Object.assign` shallow copy trap**: `Object.assign({}, state)` creates a shallow copy. Nested objects and arrays are still shared references. Mutating a nested property mutates both the copy and the original. Use structured clone, spread recursively, or an immutability library for nested state.
- **`Array.sort()` and `Array.reverse()` mutate in place**: `items.sort(compareFn)` in a render path or derived value mutates the source array. Use `[...items].sort(compareFn)` to sort a copy.
- **Shared default parameter objects**: `function createItem(options = DEFAULT_OPTIONS)` where `DEFAULT_OPTIONS` is a module-level object — if any caller mutates `options`, subsequent callers receive the already-mutated object. Always spread defaults: `{ ...DEFAULT_OPTIONS, ...options }`.
- **Closure accumulation across calls**: A function closes over an array or object and mutates it on every call — each invocation accumulates state from all previous calls. Particularly subtle in callbacks registered during module initialization.
- **Props mutation (React)**: Directly mutating a prop value (e.g. `props.items.push(...)`) instead of triggering a parent state update — violates unidirectional data flow and causes stale state across renders.
- **Synthetic event object pooling (React < 17)**: Accessing `event.target.value` inside a `setTimeout` or async callback — React's synthetic event pool reuses the event object. React 17+ removed pooling, but if React version is unknown: check all async event accesses.
- **Immer `produce` misuse**: Mutations outside the Immer draft context, returning both a mutation and a value from the same producer, or forgetting to return from a non-mutating producer — all cause silent state corruption.

---

### CATEGORY C — Security & Trust

#### §C1. AUTHENTICATION & AUTHORIZATION
- **Credential storage**: Verify passwords, tokens, API keys are stored securely. They must not be in localStorage unencrypted or in source code.
- **Hash comparison**: Check for client-side hash comparisons. Verify constant-time comparison. Check whether hash is visible in source (extractable for offline brute-force).
- **Lockout bypass**: Check whether attempt-rate limiting is stored in localStorage (clearable by user to reset counter).
- **Session management**: Verify token expiry is handled. Check for idle logout. Check for session fixation.
- **Privilege escalation**: Check whether a user can manipulate localStorage/state to access features beyond their authorization.

#### §C2. INJECTION & XSS
- **innerHTML / dangerouslySetInnerHTML**: Identify every use. Check whether the content is user-supplied or from an external source.
- **DOM-based XSS**: Check for user strings inserted into `className`, `href`, `src`, `style`, `data-*` attributes.
- **Dynamic code execution**: Check for `eval()`, `Function()`, `setTimeout(string)`.
- **URL injection**: Check for user-controlled values concatenated into URLs. Check for open redirect.
- **CSS injection**: Check for user values in inline `style` strings.

#### §C3. PROTOTYPE POLLUTION & IMPORT SAFETY
- **JSON.parse safety**: Verify every parse call is in try/catch — including ones that "can't fail."
- **Prototype pollution**: Check for imported objects merged/spread without filtering `__proto__`, `constructor`, `prototype`.
- **Property collision**: Check whether imported data keys can shadow expected application properties.

#### §C4. NETWORK & DEPENDENCIES
- **All HTTPS**: Check for mixed-content risk from any HTTP resource.
- **SRI (Subresource Integrity)**: Check for `integrity` attributes on CDN `<script>` and `<link>` tags. Without SRI, a CDN compromise serves malicious code.
- **External data tracking**: Check whether third-party image hosts, CDNs log user IP/referrer without disclosure.
- **CORS**: Verify external API CORS handling. Check credentials in cross-origin requests.
- **CSP**: Check for Content Security Policy. Check for `unsafe-inline`/`unsafe-eval` requirements that undermine it.

#### §C5. PRIVACY & DATA MINIMIZATION
- **PII inventory**: Identify what personal data is collected, stored, or transmitted. Verify each piece is necessary.
- **URL leakage**: Check whether state in hash/query params leaks via browser history, referrer headers, server logs.
- **Third-party fingerprinting**: Check whether CDNs, analytics, presence systems are disclosed to user.
- **Export sensitivity**: Check whether export JSON contains data the user didn't know was being recorded.

#### §C6. COMPLIANCE & LEGAL
- **GDPR/CCPA**: Check for personal data processed. Verify right to deletion. Check for privacy policy link.
- **Age restrictions**: Check for gambling-adjacent, adult, or violence content. Verify age gating is present where required.
- **IP/Copyright**: Check for third-party copyrighted assets. Verify attribution and disclaimer are present.
- **Financial regulations**: If app gives financial advice, verify regulatory disclaimer.
- **Medical regulations**: If app gives health guidance, verify "Not medical advice" disclaimer is prominent.
- **Accessibility law**: Assess whether ADA/EN 301 549 obligations are relevant.

#### §C7. MOBILE-SPECIFIC SECURITY *(activated for Android/iOS apps)*
- **Permission audit**: Verify all declared permissions are actually used. Over-requesting permissions signals privacy issues and can trigger store rejection.
  - Android: Check `AndroidManifest.xml` `<uses-permission>` vs actual usage in code
  - iOS: Check `Info.plist` usage descriptions vs actual API calls
- **Exported components**: Android — check for Activities/Services/BroadcastReceivers unnecessarily exported. `android:exported="true"` without intent filters = attack surface.
- **Data storage security**: Check for sensitive data in SharedPreferences/UserDefaults without encryption. Use EncryptedSharedPreferences / Keychain.
- **WebView security**: `setJavaScriptEnabled(true)` + `addJavascriptInterface()` = injection surface. `setAllowFileAccess(true)` = local file read risk.
- **Network security config**: Android — check for `android:networkSecurityConfig`. Check whether it allows cleartext traffic unnecessarily.
- **ProGuard/R8 rules**: Check whether security-critical classes are excluded from obfuscation appropriately. Check whether reflection-dependent classes are kept.
- **Content Provider exposure**: Android — check `android:exported` on ContentProviders for proper permission checks.
- **Deep link validation**: Check whether deep links/app links are validated against expected patterns. Check whether arbitrary URIs can trigger sensitive actions.
- **Clipboard security**: Check whether sensitive data (passwords, tokens) is copied to clipboard without timeout/clearing.

---

### CATEGORY D — Performance & Resources

#### §D1. RUNTIME PERFORMANCE
- **Main thread blocking**: Identify computations >50ms on the main thread. Check for UI freeze during execution.
- **Worker offloading**: Check whether expensive algorithms are in a Worker. Verify message passing is correct. Check for fallback if Worker is unavailable.
- **Unnecessary re-renders** (React): Identify every component that re-renders when it should not. Check `memo()` comparators. Check for missing `useCallback`/`useMemo` deps.
- **List virtualization**: Check grids/lists with 100+ items. Assess whether virtualization is needed. Check for jank with current approach.
- **Layout thrashing**: Check for reading `offsetWidth`/`scrollHeight` inside a write loop. This forces repeated reflows.
- **Debounce/throttle**: Check whether high-frequency events (input, scroll, resize) are handled without overwhelming the main thread.
- **Cold start computations**: Check for expensive work triggered on mount instead of lazily on demand.

#### §D2. WEB VITALS & LOADING
- **LCP**: Identify the largest element on first load. Check whether it is blocked by scripts or an image without preload.
- **FID/INP**: Check for long tasks during load. Assess time to interactive.
- **CLS**: Check for images without `width`/`height`. Check for dynamic content injected above existing content. Check for font reflow.
- **Render-blocking scripts**: Identify CDN scripts without `defer`/`async`. Determine which ones block first paint.
- **FOUC**: Check whether CSS loads after content renders.
- **Parse time**: For large single-file apps, assess JS parse/compile time on low-end mobile (4× CPU throttle).
- **Resource hints**: Check for `preconnect`/`dns-prefetch` for CDN origins. Check for `preload` for hero images.

#### §D3. RESOURCE BUDGET
Produce this table for the app:

| Resource | Source | Est. Size | Load Strategy | Critical Path? | Optimization? |
|----------|--------|-----------|--------------|----------------|--------------|
| App code | inline/CDN | ? kb | blocking | yes | ? |
| Framework | CDN | ~130kb gz | blocking | yes | lighter alt? |
| … | … | … | … | … | … |
| **Total** | | **? kb** | | | |

- 3G first-load estimate (total / ~1.5 Mbps)?
- What % of app code executes in a typical session (unused code ratio)?

#### §D4. MEMORY MANAGEMENT
- **Closure leaks**: Check for closures holding references to large objects that should be GC'd.
- **Event listener leaks**: Verify every `addEventListener` has a corresponding `removeEventListener` in cleanup.
- **Timer leaks**: Verify every `setInterval`/`setTimeout` is cleared on unmount.
- **Worker lifecycle**: Check whether Workers are terminated when no longer needed. Check for multiple instances accidentally spawned.
- **Blob URL revocation**: Check for `URL.createObjectURL` — verify matching `URL.revokeObjectURL` is called.
- **Computation array retention**: Check whether heavy tables (DP, MC) are released after use or held in closure.
- **Canvas/WebGL cleanup**: Check whether contexts and canvases are disposed on unmount.

#### §D5. MOBILE-SPECIFIC PERFORMANCE *(activated for Android/iOS apps)*
- **Coroutine/async lifecycle**: Check whether coroutines are properly scoped to ViewModel/Fragment lifecycle. Check for orphaned coroutines running after fragment destruction.
- **RecyclerView / LazyColumn optimization**: Verify ViewHolder pattern is correct. Check for DiffUtil usage. Check for nested scrolling conflicts. Check ViewType reuse.
- **Image loading**: Check whether thumbnails are appropriately sized. Verify image caching is configured. Check for large bitmaps loaded on main thread.
- **Database queries on main thread**: Check whether Room/CoreData queries are dispatched to background. Check for `runBlocking` on main thread.
- **Fragment transaction overhead**: Check for excessive fragment replacements causing layout thrashing. Verify proper use of `replace` vs `add`.
- **APK/IPA size**: Check whether ProGuard/R8 shrinking is enabled. Check whether unused resources are stripped. Identify large assets that could be on-demand.
- **Process death recovery**: Check whether state is saved via `onSaveInstanceState` / ViewModel SavedState for critical user data. Process death = complete state loss without this.
- **ANR risk**: Check for any operation > 5s on main thread (triggers ANR dialog on Android). Check file I/O, network calls, heavy computation.
- **Battery impact**: Check for unnecessary background work. Check for wake locks held too long. Check for location updates too frequent.

---

### CATEGORY E — Visual Design Quality & Polish

> This category treats visual design as a professional discipline.
> The goal is to make the app's existing design vision more **refined, consistent, and polished** — always within the app's own aesthetic identity.
> §0 Design Identity is protected throughout. All findings improve toward the app's own aesthetic.

> **Deep visual work:** When this audit's §E findings reveal systemic visual design issues — or when the user specifically requests a design audit, asks to "make it feel like [X]", or references a named aesthetic — load the `design-aesthetic-audit-SKILL.md` skill as a companion. It covers 95 sections of visual-design-specific analysis that go beyond what §E covers here.

#### §E1. DESIGN TOKEN SYSTEM
- **Spacing scale**: Check whether every padding and margin value comes from a coherent mathematical scale (4/8/12/16/24/32/48/64). List every one-off value like `p-[13px]` or `margin: 7px`. Each one is a token debt.
- **Color palette architecture**: Check whether the color system is built on a small set of intentional tokens, or whether there are dozens of slightly-different hardcoded values. List near-duplicate colors and consolidate candidates.
- **Typography scale**: List every unique `font-size` in the codebase. Check whether they form an intentional modular scale (e.g., 12/14/16/20/24/32px). Identify arbitrary in-between values.
- **Font weight semantics**: Check whether each weight (`normal`, `medium`, `semibold`, `bold`) is used for a consistent semantic purpose. Mixing `font-bold` and `font-semibold` for "emphasis" is token inconsistency.
- **Border radius system**: Check whether `rounded-*` values are consistent by component type. Cards should all use the same radius. Buttons should all use the same radius.
- **Shadow hierarchy**: Check for a shadow scale (e.g., `sm` for cards, `md` for modals, `lg` for popovers). Check for arbitrary per-component shadows.
- **Z-index governance**: Check whether stacking order is explicitly managed. List every z-index value used. Check for collisions between layers (modals, toasts, dropdowns, sticky headers).
- **Animation token set**: Check whether duration values come from a consistent set (e.g., 100/200/300/500ms). Check whether easing curves are consistent for the same type of motion.
- **Token naming as documentation**: Check whether token names are semantic (what they *mean*) rather than presentational (what they *look like*). `--color-action-primary` scales to theming and dark mode; `--color-blue-500` does not.
- **Android theme attribute coverage**: Check whether colors are referenced via theme attributes (`?attr/colorPrimary`, `?attr/colorOnSurface`) or hardcoded hex values. Every hardcoded color is a dark mode bug. Check `themes.xml`, `colors.xml`, and all layout files for `#RRGGBB` literals vs `?attr/` or `@color/` references.
- **Dimension resource consistency**: Check whether dp/sp values are defined in `dimens.xml` as named resources, or scattered as literals across layouts. Audit `android:padding="16dp"` vs `@dimen/spacing_md`.
- **Style inheritance chain**: Check for a clean style hierarchy (`Theme.App` → `Widget.App.Button` → specific overrides). Check for flat-copied styles with minor variations.
- **Night mode token completeness**: Verify every color resource has a `-night` variant. Verify every drawable has a night-appropriate version. Missing night resources cause jarring fallbacks.

#### §E2. VISUAL RHYTHM & SPATIAL COMPOSITION
- **Vertical rhythm**: Check for consistent spacing between sections, between cards, between form groups. Inconsistent vertical spacing destroys the feeling of order.
- **Density consistency**: Verify similar components (cards, list items, table rows) have similar internal density. One card with 24px padding and another with 12px padding on the same screen reads as broken.
- **Alignment grid**: Check whether elements align to a consistent invisible grid. Identify elements that appear to "float" without visual anchoring.
- **Whitespace intention**: Check whether whitespace is used actively to group related items and separate unrelated ones. Identify areas that are cramped vs sparse without rhythm.
- **Proportion**: Check whether related elements (label + value, icon + text, header + content) feel proportionally balanced.
- **Focal point clarity**: On every key screen, identify one clear visual focal point that draws the eye first. If everything has equal visual weight, the design has no hierarchy.
- **Visual weight distribution**: Check whether visual mass (size, color saturation, contrast, bold weight) is distributed intentionally across the screen. Identify unintentional clustering.
- **Mobile screen real estate discipline**: Count how many primary-content items are visible without scrolling on a standard phone (360×640dp). If fewer than 3 items are visible, the density is likely too low.
- **Edge-to-edge content**: Check for edge-to-edge layouts behind system bars on modern platforms. Verify system bar insets are handled correctly.
- **Landscape layout quality**: If landscape is supported, check for dedicated layout vs stretched portrait.
- **Responsive grid breakpoints**: For tablets and foldables, check whether the layout adapts with proper constraints or responsive grids.

#### §E3. COLOR CRAFT & CONTRAST
- **Color harmony**: Check whether accent color works harmoniously with background and surface colors. Verify a clear hierarchy: background → surface → elevated surface → accent.
- **Dark mode craft**: For dark themes, check whether dark surfaces use near-black with slight hue (e.g., `#0f1117` with a hint of blue) rather than pure black (unless intentional OLED).
- **Accent consistency**: Check whether accent color is used consistently as an emphasis signal. If it appears too frequently, it loses meaning.
- **Color temperature coherence**: Check whether the palette stays within a consistent temperature range.
- **WCAG contrast compliance**: Verify every text/background combination meets 4.5:1 (normal text) or 3:1 (large/bold). Check: muted grays on dark, colored text on colored backgrounds, placeholder text on inputs.
- **Non-text contrast**: Verify UI components (input borders, icon buttons, focus rings) meet 3:1 (WCAG 1.4.11).
- **State colors**: Verify hover, active, disabled, error, success, warning states are distinct, consistent, and on-brand.
- **Color psychology alignment**: Check whether the palette's psychological character matches the app's emotional target (§0).
- **Material 3 color system adherence**: If using Material 3, verify colors are generated from a proper tonal palette. Verify `colorOnPrimary`, `colorOnSecondary`, etc. are properly set.
- **Dark mode color quality**: Verify dark mode is not just inverted light mode. Check for intentional tonal elevation, surface tint, contrast on every screen.
- **Color saturation calibration**: Check for oversaturated colors (`#FF0000`, `#00FF00`). These signal low craft regardless of product nature. Assess whether the saturation feels purposeful.

#### §E4. TYPOGRAPHY CRAFT
- **Heading hierarchy**: Verify a clear visual hierarchy between h1/h2/h3/body/caption levels. Check whether a user can scan the page and identify the most important information.
- **Line length**: Check body text lines for 45–75 character width. Very short or very long lines hurt readability.
- **Line height**: Check body text for 1.4–1.6× line height for readability.
- **Font pairing**: If using multiple typefaces, check whether they complement or conflict. Verify consistent use of primary/secondary/monospace roles.
- **Letter spacing**: Check whether display/heading text uses slightly negative tracking (`-0.01em` to `-0.03em`) for refinement.
- **Text rendering**: Check for `-webkit-font-smoothing: antialiased` applied for crispness on dark backgrounds.
- **Label quality**: Check form labels, column headers, section titles for conciseness and consistent sentence-case.
- **Typography as character signal** `[A2][A3][A4]`: Check whether the typeface matches the personality in §0. Use the axis profile to determine what "correct" means:
  - *High commercial intent (A1)*: Typeface credibility matters. Wrong tier here is a trust problem.
  - *Strong subject visual identity (A4)*: The typeface must feel tonally coherent with the subject.
  - *Expert/practitioner audience (A3)*: Type density and precision signal domain competence.
  - *Emotionally sensitive / high-stakes context (A2)*: Typeface warmth, weight, and size directly affect emotional register.
  - *Aesthetic IS the product (A5)*: Typeface is part of the output's visual experience — the bar is highest.
  If the typeface contradicts the intended personality, name a specific alternative within the app's constraints.
- **Type craft signals** `[A1][A3][A5]`:
  - *High commercial / professional audiences*: tabular nums for aligned number columns, optical size adjustments, consistent lining vs oldstyle figures.
  - *Expert/dense-data contexts*: monospaced or tabular numerals for scannable data columns.
  - *Aesthetic-primary / creative tools*: OpenType features as expressive tools — ligatures, alternates, stylistic sets.
  - *Any product*: Check for any typographic personality (weight contrast, tracked caps, a purposeful accent) that makes the app feel designed rather than defaulted.

#### §E5. COMPONENT VISUAL QUALITY

> Audit every UI component for visual consistency, state completeness, and craft. On Android: check both XML layout definitions AND runtime-applied styles.

**Core Interactive Components:**
- **Button states completeness**: Verify every button variant has all five states: default, hover, active/pressed, focus (keyboard-visible), disabled. On Android: check `StateListDrawable`, `ColorStateList`, ripple effects, Material Button styles.
- **FAB quality**: Verify correct elevation and shadow, consistent size, proper color contrast against all backgrounds, smooth hide/show animation on scroll.
- **Input field states**: Verify default, focus, filled, error, disabled states. On Android: `TextInputLayout` with proper hint animation, error text, helper text, character counter, prefix/suffix icons.
- **Checkbox and radio button quality**: Verify visual size consistency (minimum 48dp touch target). Check animation between checked/unchecked. Check indeterminate state.
- **Switch/toggle quality**: Verify track and thumb proportions, unambiguous on/off state, smooth animation, clearly distinguishable disabled state.
- **Slider quality**: Verify track, thumb, value label are styled consistently. Check discrete steps marking. Check touch target size.
- **Dropdown/spinner quality**: Verify consistent trigger appearance, proper menu elevation, selected item indication.
- **Search bar quality**: Verify consistent styling, clear/cancel button, search icon positioning, suggestion dropdown styling.

**Container Components:**
- **Card design quality**: Verify consistent internal padding, border or shadow (not both unless intentional), corner radius consistency. On Android: check MaterialCardView properties.
- **Bottom sheet quality**: Verify handle/drag indicator, peek height, expansion animation, backdrop dimming, system gesture conflict handling.
- **Modal/dialog quality**: Verify consistent backdrop opacity, corner radius, header/body/footer structure, close button positioning.
- **Tab bar/TabLayout quality**: Verify active and inactive tab states, smooth indicator animation, scroll behavior for many tabs.
- **Bottom navigation quality**: Verify active/inactive icon and label states, badge/notification dot positioning, animation between states.
- **Toolbar/AppBar quality**: Verify title alignment, overflow menu positioning, collapsing toolbar effects, status bar color coordination.
- **Navigation drawer quality**: Verify header design, item height/padding consistency, active item highlighting, drawer width.

**Informational Components:**
- **Badge/chip/tag design**: Verify consistent padding, radius, typography across all instances.
- **Snackbar/toast quality**: Verify consistent position, elevation, corner radius, action button styling, queue behavior.
- **Progress indicator quality**: Verify determinate and indeterminate variants, linear/circular consistency, progress color matching.
- **Tooltip quality**: Verify consistent appearance, correct arrow/caret positioning, no screen-edge clipping.
- **Banner/alert quality**: Verify distinct visual treatment for info, warning, error, success. Check for icon alongside color differentiation.

**Content Display Components:**
- **List item quality**: Verify consistent height for single/two/three-line variants, leading/trailing element alignment, divider consistency.
- **Icon quality**: Verify all icons from the same family at the same base size. Check for mixed icon families (visually noisy). On Android: check for consistent outlined vs filled style.
- **Avatar/thumbnail quality**: Verify consistent size, shape, placeholder/loading state, fallback for missing images.
- **Divider usage**: Verify dividers are structural separators, not decoration. Too many dividers fragment the layout.
- **Image presentation**: Verify consistent cropping (same aspect ratios for same context), corner radius treatment, loading placeholder, error state.
- **Empty state design quality**: Verify every empty state is designed (not default system text). Check illustration consistency, message helpfulness, primary action prominence.
- **Date/time picker quality**: Verify consistent styling with app theme, proper calendar view, format consistency.

**Structural/Layout Components:**
- **Status bar integration**: Verify color coordination with toolbar, correct light/dark status bar icons.
- **System navigation bar integration**: Verify color or transparency consistency, edge-to-edge handling.
- **Skeleton/shimmer loading quality**: Verify shimmer shapes match actual content layout, animation smoothness.
- **RecyclerView/list visual quality**: Verify smooth scroll performance, consistent item animations, overscroll effect.

#### §E6. INTERACTION DESIGN QUALITY
- **Hover feedback**: Verify every interactive element has a perceptible hover state that communicates interactivity.
- **Active/pressed feedback**: Verify pressing a button feels physically responsive — typically a slight scale-down or color deepening.
- **Transition quality**: Verify transitions feel deliberate and smooth. Check for abrupt appearance/disappearance or overly long/bouncy transitions.
- **Loading state quality**: Assess spinners vs skeleton screens. Skeleton screens preserve layout and feel more polished for content-loading.
- **Animation narrative**: Check whether every motion tells a story about the relationship between UI states. An element sliding in from the left implies it came from somewhere left. Fade-in implies creation.
- **Empty state design**: Verify empty states are designed, include a clear visual, helpful message, and a clear call to action.
- **Error state design**: Verify inline errors are positioned immediately adjacent to the field that caused them. Verify they include icon and descriptive text, not just color.
- **Animation as character signal** `[A2][A4][A5]`: The right motion vocabulary is derived from the axis profile:
  - *Focus-critical / high-stakes / high-frequency use (A2)*: Motion is a cognitive tax. Every animation must justify itself. Lean toward 100–150ms, ease-out.
  - *Emotionally sensitive contexts (A2)*: Abrupt or jarring transitions increase anxiety. Slow, smooth, and predictable motion is a safety requirement.
  - *Creative / exploratory / leisure contexts (A2)*: Expressive motion is appropriate — spring physics, slight overshoot, personality.
  - *Strong subject visual identity (A4)*: Motion character can honor the subject's tonal register.
  - *Aesthetic IS the product (A5)*: Animation may be the primary value — assess it as output quality.
  - *Any context*: Simple and consistent beats complex and inconsistent.
  Name the 1–2 specific timing or easing changes that would bring the motion vocabulary into alignment with this app's axis profile.
- **Delight moments** `[A1][A2][A4]`: Identify the highest-impact moments for craft investment, derived from the use context and subject identity:
  - *High-frequency tools (A2)*: The small moment that makes a daily tool feel good to use.
  - *Emotionally sensitive tools (A2)*: Warmth and gentleness at key moments.
  - *Creative / expressive tools (A2)*: Moments that feel generative and alive.
  - *Strong subject identity (A4)*: Moments that feel authentic to the subject and community.
  - *Any app*: The moment the app delivers its primary value — check whether it is presented with intentionality.
- **Physical responsiveness**: Assess whether the interaction model feels physical — buttons compress, drawers slide, modals lift — and whether that matches the product's personality.

#### §E7. OVERALL VISUAL PROFESSIONALISM
- **Design coherence**: Assess whether the app feels designed as a whole, or like different sections were designed independently.
- **Attention to detail**: Check for pixel-perfect alignment, 1-pixel misalignments on borders, slight gaps where elements should touch. On Android: check for inconsistent `layout_margin` values between similar components.
- **Brand consistency**: Verify the app's visual identity is consistent from section to section.
- **First-impression test**: Show the app for 7 seconds. Would a viewer say "it looks polished" or "it looks like a default/template app"?
- **Screenshot quality test**: Take a screenshot of each primary screen. Would each look good in an App Store listing or a presentation slide?
- **Visual noise inventory**: List every element on each primary screen that could be removed, reduced in visual weight, or hidden behind progressive disclosure without losing core functionality.
- **Cross-device visual consistency**: Check whether the app looks equally intentional on different screen densities, device sizes, and system themes.
- **Competitive credibility check**: Name 2–3 most polished apps in the same category. Compare specific craft elements side-by-side.
- **Polish delta**: For each section, list specific changes that would move it from "functional" to "intentional" within the existing design language and axis profile.
- **Polish level assessment** `[A1][A2][A5]`:
  - *High commercial intent (A1)*: Verify credibility signals — consistent 4/8-based spacing, subtle shadows, smooth transitions, letter-spacing on headings, antialiased type, hover states, skeleton loaders, contextual empty states, confirmation animations.
  - *Focus-critical / invisible-aesthetic contexts (A2)*: The absence of distraction IS the polish. Assess how little the interface demands of the user's attention.
  - *Emotionally sensitive contexts (A2)*: Polish means warmth and safety — gentle corners, calm palette, generous spacing, unhurried transitions.
  - *Aesthetic-primary contexts (A5)*: Polish means the UI chrome recedes so the output shines.
  - *Any app*: Check for at least one detail that clearly took extra effort. Check whether the app looks intentional rather than defaulted.

#### §E8. PRODUCT AESTHETICS — DERIVED FROM AXIS PROFILE

> **This section is driven entirely by the Five-Axis profile from §I.4.** Run every tagged item whose axis is active in the profile. Skip or substantially reframe items whose axis is inactive.

---

**`[A1]` COMMERCIAL INTENT ACTIVE** *(revenue-generating or institutional)*:
- **The first-impression credibility test**: Before the user reads a single word — does the composition signal "trusted tool" or "rough prototype"? List the 3 visual elements most undermining credibility and the specific change that would fix each.
- **Visual trust hierarchy**: Check whether the palette feels stable and intentional, the typography feels appropriate, and spacing feels designed.
- **Competitive visual benchmark**: Name 2–3 most credible tools in this category. Compare craft specifics.
- **Conversion or commitment blockers**: In any paid, sign-up, or institutional commitment flow — identify visual elements that undermine confidence.
- **Distribution channel fit** `[A1]`: Assess whether the visual design is compelling in the app's primary distribution context (App Store, sales demo, marketing page, Product Hunt).

---

**`[A2]` USE CONTEXT: FOCUS-CRITICAL OR HIGH-STAKES**:
- **Cognitive load audit**: Identify every visual element that demands attention beyond what the user's task requires. List everything that should be eliminated or minimized.
- **Information scannability**: Under time pressure, check whether the user can find the critical number, status, or action within 2 seconds.
- **Visual noise inventory**: List every element that could be removed or quieted without losing functional information.

**`[A2]` USE CONTEXT: EMOTIONALLY SENSITIVE**:
- **Safety signals**: Assess whether the visual design feels safe. Check: corner radius, color temperature, spacing, animation speed.
- **Warmth calibration**: Check whether the palette is warm enough without feeling saccharine. Check whether the empty state feels welcoming.
- **Tone-design coherence**: Check whether the visual language matches the emotional register the copy is attempting.

**`[A2]` USE CONTEXT: CREATIVE OR EXPRESSIVE**:
- **Inspiration quality**: Assess whether the interface itself feels inspiring, or purely functional.
- **Expressive range**: Check for room in the visual design for personality and surprise.
- **Chrome vs canvas**: Assess how much visual space the interface takes from the user's creative work.

**`[A2]` USE CONTEXT: LEISURE OR CASUAL**:
- **Delight calibration**: Assess whether the experience is genuinely pleasurable.
- **Low-stakes visual permission**: Assess whether the design uses the freedom that leisure contexts allow.

---

**`[A3]` AUDIENCE: EXPERT / PRACTITIONER**:
- **Density as respect**: Assess whether information density respects the expertise of the audience.
- **Vocabulary accuracy**: Audit every piece of domain vocabulary for precision. One wrong term signals outsider status.
- **Power-user surface area**: Check whether advanced capabilities are accessible without being buried.

**`[A3]` AUDIENCE: MIXED OR BRIDGING**:
- **Progressive disclosure integrity**: Assess whether the complexity ladder clearly serves both expert and novice.
- **Dual-register visual design**: Assess whether the design has a successful strategy for serving two expertise levels.

---

**`[A4]` SUBJECT HAS STRONG VISUAL IDENTITY**:
- **Palette coherence**: Identify dominant visual tones of the subject. Assess whether the app's palette is inspired by, neutral to, or in conflict with them.
- **Typographic tone**: Check whether the typeface feels tonally coherent with the subject.
- **Motion character**: Check whether the animation vocabulary honors the subject's energy, weight, and atmosphere.
- **Iconography and visual register**: Check whether custom icons or decorative elements are consistent with the subject's visual language.

**`[A4]` COMMUNITY AESTHETIC NORMS EXIST**:
- **Insider signal audit**: Identify visual choices that communicate genuine community membership vs outsider status.
- **Anti-corporate check**: Check whether the visual design feels like it belongs to the community, or like it's trying to productize the community.

**`[A4]` SUBJECT IS NEUTRAL / NO ESTABLISHED IDENTITY**:
- **Invented coherence**: Assess whether there is a coherent internal logic or design concept running through the product. If none, identify the strongest candidate.

---

**`[A5]` AESTHETIC IS THE VALUE**:
- **Chrome restraint**: Assess how much the UI interface around the output can recede. Identify every non-essential UI element.
- **Output quality assessment**: Assess the visual quality of what the product *produces* as a design output.
- **Signature output quality**: Check whether a user can immediately tell this output came from this tool.

**`[A5]` AESTHETIC MUST STAY INVISIBLE**:
- **Distraction inventory**: Every element that draws attention to itself is a failure. List every visual element that competes with the user's task.
- **Trust-through-clarity**: In invisible-aesthetic contexts, trust comes entirely from clarity and reliability. Check whether every element is functionally necessary.

---

**UNIVERSAL** *(always apply)*:
- **The "made with intent" test**: Check whether the app looks like every visual decision was made deliberately, or like some things were shipped at their default. Identify the 3 most clearly defaulted visual elements and the specific changes that would make them look chosen.
- **App icon / favicon quality**: Check legibility at 16×16 and all required sizes. Check visual coherence with the app's design language.
- **Visual coherence across sections**: Check whether the app feels designed as a whole.

#### §E9. VISUAL IDENTITY & RECOGNIZABILITY

> Identity means different things depending on the axis profile. For commercial products it is competitive differentiation. For community products it is subject fidelity. For creative products it is the distinctiveness of the output itself.

- **Visual signature** `[A1][A4][A5]`: Check whether a user can identify this app from a partial screenshot. Identify what could become a distinctive visual signature.
  - *Commercial (A1)*: Check distinctiveness within the product category.
  - *Subject identity (A4)*: Check whether the signature feels like it belongs to the subject.
  - *Aesthetic-primary (A5)*: Check whether the output itself is visually distinctive.
- **Visual metaphor coherence** *(all)*: Check for a consistent design concept or visual logic running through the product.
- **Accent color intentionality** `[A1][A4]`: Check whether the accent color is purposeful — a calibrated hue with intentional saturation.
- **Emotional arc design** *(all)*: Map the intended emotional arc. Assess whether visual transitions and feedback moments support it.
- **Anti-genericness audit** *(all)*: Identify visual elements that make the app interchangeable with others. For each: identify the minimal change that would make it more distinctly *this* app.
- **App icon / launcher icon quality**: Check legibility at every size, visual coherence with internal design, distinctiveness on a crowded home screen. On Android: check adaptive icon layers.
- **Motion identity**: Check for a recognizable animation vocabulary. If all animations use the same generic 300ms ease-in-out, there is no motion identity.
- **Iconography as identity signal**: Check whether icons communicate the brand's personality. Weight, corner treatment, and fill style are identity decisions.
- **Color system as memory**: Assess whether the palette is memorable after 10 minutes of use.
- **Brand scalability**: Check whether the visual identity works at all scales — icon size, widget, tablet, splash screen, notification, share card.

#### §E10. DATA STORYTELLING & VISUAL COMMUNICATION

> Numbers and data are communicated, not just displayed. This section evaluates whether the visual language helps users understand.

- **Numbers as visual elements**: Check whether the most important metrics are displayed with visual weight proportional to their importance.
- **Hierarchy of insight**: For data-forward apps — check for a visual path from "raw input" → "computed result" → "actionable insight."
- **Chart design quality**: For each chart, state the question it is designed to answer. Assess whether the visual encoding answers that question as directly as possible.
- **Progressive complexity revelation**: Check whether the design guides users from simple overview → detailed drill-down → power-user controls.
- **Data density calibration**: Assess whether information density is calibrated for the target audience.
- **Empty → populated visual storytelling**: Assess whether populating data feels like the app coming alive, or like a spreadsheet being filled in.
- **Error as communication**: Check whether error states communicate clearly and match their urgency.
- **Colorblind-safe data encoding**: Check whether data differentiated by color is also distinguishable without color. Verify in grayscale.
- **Data table design quality**: Check header row styling, row separation, number alignment (`tabular-nums`), sort indicators, long text truncation, row hover state, empty cell handling.
- **Responsive data display**: Check whether charts, tables, and data-dense views remain useful when compressed to mobile.
- **Number formatting as visual design**: Check whether number formatting serves the visual hierarchy. Key metrics should use the app's display typography.
- **Real-time data visual treatment**: For data that updates live, check whether the update animation is smooth, counters animate between values, and progress bars transition smoothly.

#### §E11. MOBILE-SPECIFIC VISUAL QUALITY

> Mobile platforms have unique visual concerns that web-centric audits miss.

**System Integration:**
- **Material You / Dynamic Color**: On Android 12+, check for dynamic color support. If supported, verify custom colors harmonize with user's palette. If not, verify the static palette is high quality.
- **Dark mode completeness**: Switch to dark mode and audit EVERY screen. Check for: hardcoded white backgrounds, hardcoded text colors becoming invisible, images with white backgrounds, splash screen still light, WebView content still light.
- **System font scaling**: Increase system font size to maximum. Verify the layout survives — check for text overflow, truncation, overlapping elements, buttons that can't fit their label.
- **Display cutout handling**: Verify the app handles notches, camera holes, and display cutouts correctly. Use `WindowInsetsCompat` for proper safe area handling.
- **Splash screen quality**: Android 12+ uses the Splash Screen API. Check whether the splash screen is designed (themed icon, correct background color) or default.

**Visual Fidelity:**
- **Screen density handling**: Check whether all raster assets are provided at appropriate densities (mdpi through xxxhdpi). Prefer vector drawables for icons.
- **Ripple effect consistency**: Check Material Design ripple effects on all touchable surfaces. Verify ripple is bounded correctly and color is appropriate for surface.
- **Elevation and shadow consistency**: Verify shadows are consistent across similar component types. In dark mode, verify surface tint instead of visible shadows.
- **Animation performance**: Verify animations run at 60fps (or 120fps on high-refresh devices). Check for: layout passes during animation, overdraw, alpha animation on complex views.
- **Overscroll effect**: Check whether edge glow (pre-Android 12) or stretch overscroll (Android 12+) feels natural.
- **Font rendering quality**: Verify custom fonts load correctly. Check font weight interpolation. Check for fallback to system default causing visual inconsistency.
- **RTL visual quality**: If supporting RTL languages — verify all layouts mirrored correctly, directional icons flipped, padding/margins mirrored, text alignment correct.

**Platform Convention Fidelity:**
- **Navigation pattern correctness**: Verify platform-correct patterns are used (Android: bottom navigation + back button; iOS: tab bar + swipe-back).
- **System dialog integration**: Check whether system dialog transitions feel smooth and theme-compatible.
- **Keyboard interaction visual quality**: Check whether layout resizes smoothly when keyboard appears, focused field is visible, keyboard theme matches app.

---

### CATEGORY F — UX, Information Architecture & Copy

#### §F1. INFORMATION ARCHITECTURE
- **Navigation model**: Check whether tab/menu labels and icons match users' mental model of the content.
- **Content hierarchy**: Verify most important information is visually prominent. Check for a clear visual path from "input" to "output" to "action."
- **Progressive disclosure**: Check whether advanced/infrequently-used options are hidden behind expandable sections.
- **Categorization logic**: Check whether content is grouped in ways natural to the target audience — reflecting user mental models, not implementation structure.
- **Section depth**: Assess whether navigation hierarchy is the right depth.
- **Location awareness**: Verify the user always knows where they are — breadcrumbs, highlighted nav items, screen titles, back button context. On Android: check toolbar title updates per fragment and bottom nav item highlighting.
- **Search UX**: If the app has search — check for discoverability, recent searches, suggestions, empty result handling, scope clarity.
- **Cross-linking between related content**: Check whether related items are directly navigable from each other.
- **Tab bar / bottom nav vs drawer**: Verify the right navigation pattern is chosen for the content volume and access frequency.
- **Navigation affordances**: Verify interactive elements are visually distinguishable from static content. Clickable items must signal clickability.
- **Cognitive load per screen**: Count distinct decisions or information items on each screen. Screens with > 7 need grouping or progressive disclosure.
- **Dead zones**: Check for screens a user can navigate to but cannot navigate out of easily.
- **Feature discoverability over time**: Check for powerful features that a new user wouldn't find for weeks. Each one needs a discovery mechanism.

#### §F2. USER FLOW QUALITY
- **Friction audit**: For each workflow in §0 — count the steps. Identify unnecessary, confusable, or surprising steps.
- **Default value quality**: Check whether default values are the most common/sensible choice.
- **Action reversibility**: Check whether users can undo or go back from every action. Irreversible actions need clear warning with context.
- **Confirmation dialog quality**: Verify destructive confirmations name the item, state the consequence, and offer alternatives when possible.
- **Feedback immediacy**: Verify every action produces immediate visual feedback. 100ms+ delay without visual change makes users doubt the tap registered.
- **Perceived performance**: Check whether the UI shows stale data, blank space, or a skeleton during recomputation.
- **Keyboard shortcuts**: For power users, check whether common actions are keyboard-accessible and shortcuts are discoverable.
- **Multi-step workflow state preservation**: Check whether progress is preserved when the app is backgrounded, rotated, or interrupted. On Android: check `onSaveInstanceState` coverage.
- **Error recovery flows**: Verify users can retry from the failure point, not restart from scratch. Every error state needs a recovery path.
- **Interruption handling**: Map every interruptible flow and verify the resume behavior.
- **Deep link entry points**: Verify each deep-linked screen works standalone with sufficient context.
- **Gesture navigation conflicts**: Map every conflict between system gestures and app gestures. Verify resolution.
- **Batch operation UX**: Verify clear selection model, visible count, preview before confirming, progress feedback.
- **Contextual actions**: Verify the right actions are available at the right time. Actions that do not apply should be hidden or disabled with explanation.
- **Back navigation predictability**: Verify the back button always does what the user expects.

#### §F3. ONBOARDING & FIRST USE
- **First impression**: Check whether a new user understands what the app does and what to do first, without tooltips or documentation.
- **Onboarding quality**: Check whether onboarding teaches by doing (interactive) vs just describing (passive).
- **Onboarding re-entry**: Check whether users can replay onboarding and access help at any time.
- **Empty state → filled state**: Check whether the transition from "no data" to "data present" is visually satisfying.
- **Progressive complexity**: Check whether the app reveals complexity incrementally.
- **Activation path clarity** `[A1][A2][A3]`: Check whether the visual hierarchy guides the user toward their first meaningful interaction:
  - *High commercial intent (A1)*: The path to first value must be visually direct.
  - *Expert audience (A3)*: Experts should reach their first productive action faster than novices.
  - *Casual / emotionally sensitive audiences (A3/A2)*: The function must be obvious without reading anything.
- **First success moment design** `[A2][A4]`: Check whether the moment the user first achieves something meaningful is visually acknowledged:
  - *Focus-critical tools*: A quiet, efficient confirmation.
  - *Creative / leisure tools*: A moment of genuine visual satisfaction.
  - *Community / subject tools*: The result presented in a way that resonates with the community.
  - *Emotional / sensitive tools*: A warm, gentle affirmation.
- **Time-to-function legibility** *(all)*: Check whether a new user can tell within 10 seconds what they will be able to do.
- **Permission request UX**: Verify permissions are requested in context, with pre-explanation, and degraded gracefully if denied.
- **Tutorial skippability**: Check whether the user can skip onboarding and figure things out by doing.
- **Re-engagement after absence**: Check whether a returning user lands on a useful screen with preserved context.
- **Contextual help and tooltips**: Check for in-context hints for complex features.
- **Feature discovery over time**: Check whether new features surface gradually, not all at once.
- **Settings discoverability**: Check for logical organization, most-changed settings near the top, effect explanations.

#### §F4. COPY QUALITY
- **Tone consistency**: Check whether every piece of UI copy feels like it came from the same voice. List any copy that sounds notably different.
- **Clarity**: Check every label, tooltip, placeholder, error message, and heading for ambiguity.
- **Conciseness**: List every piece of copy that could be tightened.
- **Terminology consistency**: Verify the same concept is always called the same thing. List synonyms used inconsistently.
- **Capitalization convention**: Check for Title Case for navigation/headings and Sentence case for body/labels — applied consistently.
- **Action verb quality**: Verify buttons use strong, specific verbs: "Save draft" not "Submit", "Delete account" not "Confirm."
- **Empty state copy**: Verify empty states have clear, helpful, action-oriented messages.
- **Error message copy**: Verify messages are human-readable, explain the cause, and explain what to do next.
- **Copy as commitment asset** `[A1]`: *Activate only for revenue-generating or institutional products.* Check whether CTAs communicate value or just request action.
- **Copy as domain fluency signal** `[A3][A4]`: *Activate when audience has domain expertise or subject has community vocabulary.* Check whether copy uses the community's natural vocabulary accurately.
- **Copy as emotional register** `[A2]`: *Activate for emotionally sensitive, creative, or high-stakes contexts.* Check whether copy's tone matches the emotional context.
- **Brand voice extraction** *(all)*: Based on existing copy, extract a 3-adjective voice descriptor. Identify every piece of copy that violates this voice.

#### §F5. MICRO-INTERACTION QUALITY
- **Hover states communicate intent**: Verify every interactive element has a hover state (or ripple/highlight on mobile).
- **Loading states**: Verify async operations have immediate feedback — even 200ms without feedback feels broken.
- **Success confirmation**: Verify successful actions are confirmed visually. Confirmation weight must match action weight.
- **Scroll behavior**: Check for scroll-to-content after navigation, scroll position preserved on back navigation, smooth scrolling.
- **Focus indicator quality**: Verify visible and styled to match the app's design language.
- **Pull-to-refresh**: If implemented, verify threshold, design consistency, and meaningful feedback text.
- **Swipe gesture feedback**: Verify gesture preview before committing, clear threshold, satisfying animation, undo path.
- **Long-press interactions**: Verify clear transition, haptic feedback, easy exit from selection mode.
- **Drag-and-drop UX**: Verify distinct visual state for dragged item, highlighted drop target, placeholder, smooth invalid-drop return.
- **Haptic feedback**: On Android/iOS — verify haptic responses at meaningful moments (selection, toggle, delete, completion). Limit to 5–8 key moments.
- **Selection feedback**: Verify unambiguous selection state, visible count, "select all" availability.
- **Animation interruption**: If user taps a button during animation, verify new input cancels the current animation and immediately responds.
- **Gesture cancellation**: Verify gestures cancel cleanly when the user lifts their finger at the original position.
- **Empty state interaction**: Verify every empty state has a prominent, tappable primary action.
- **Error state interaction**: Verify error states have actionable recovery (retry buttons, alternative paths).
- **Toast/snackbar interaction**: Verify action tap target is large enough, toast stays long enough, and dismiss behavior is correct.

#### §F6. ENGAGEMENT, DELIGHT & EMOTIONAL DESIGN

> The goal of this section is derived entirely from the axis profile. "Engagement" means different things depending on context. Apply the questions whose axis is active.

**UNIVERSAL** *(all apps)*:
- **Reward moments**: Identify every "achievement moment" in the core workflow. Assess whether each has visual acknowledgment appropriate to the axis profile.
- **Personality moments**: Identify 2–3 places where a personality moment would feel authentic to this app's axis profile.
- **Notification quality**: Verify any notification, badge, or alert indicator is designed with the same craft as the rest of the product.

**`[A1]` COMMERCIAL INTENT**:
- **Progress and investment visibility**: Check whether users can see how far they've come. Assess for retention pull without manipulative patterns.
- **Shareable outcomes**: Identify the most naturally shareable moment. Assess whether it is visually compelling enough to share.

**`[A2]` EMOTIONAL SENSITIVITY**:
- **Emotional safety in transitions**: Check every state change for emotional appropriateness.
- **Absence of pressure patterns**: Check for any visual elements that create urgency, scarcity, or anxiety — even unintentionally.
- **"Feels like support" quality**: Assess whether the app feels like it is on the user's side.

**`[A2]` CREATIVE / EXPLORATORY CONTEXTS**:
- **Discovery encouragement**: Check whether the interface visually invites exploration.
- **Creative momentum**: Assess whether the visual design maintains creative flow.

**`[A3][A4]` COMMUNITY / SUBJECT CONTEXTS**:
- **Community shareable moments**: Identify the moment most compelling for community sharing. Assess its visual quality.
- **Authentic delight**: Check for details that reward genuine familiarity with the subject.
- **Integrity over manipulation**: Flag any retention mechanics (streaks, FOMO, aggressive notifications) that are tonally wrong for the product's nature.

---

### CATEGORY G — Accessibility

> This section covers accessibility for all platforms. Web uses WCAG/ARIA. Android uses TalkBack/contentDescription. iOS uses VoiceOver/accessibilityLabel. The principles are universal — the implementation differs.

#### §G1. ACCESSIBILITY COMPLIANCE

**Perceivable:**
- **Images and icons**: Verify every meaningful image has a description. Verify decorative images are hidden from assistive technology.
  - *Web*: `alt` text on `<img>`; decorative = `alt=""` or `role="presentation"`.
  - *Android*: `android:contentDescription` on `ImageView`; decorative = `android:importantForAccessibility="no"`.
  - *iOS*: `accessibilityLabel` on `UIImageView`; decorative = `isAccessibilityElement = false`.
- **Semantic structure**: Verify UI elements use semantically correct components.
  - *Web*: `<button>`, `<nav>`, `<main>`, `<header>`, `<h1>–<h6>`, `<label>`.
  - *Android*: `Button`, `Toolbar`, `NavigationView`. Custom views must set `AccessibilityNodeInfoCompat` roles.
  - *iOS*: `UIButton`, `UINavigationBar`. Custom views must set `accessibilityTraits`.
- **Reading order**: Verify assistive technology traversal order matches visual layout order.
- **Sensory-only instructions**: Verify no instruction relies solely on color, shape, or position. Always pair with text.
- **Color independence**: Verify status, error, success are conveyed by icon + text + color — not color alone.
- **Text contrast**: Verify all text meets 4.5:1 contrast (normal) or 3:1 (large/bold ≥18sp or ≥14sp bold).
- **Text scaling**: Verify app survives system font size at maximum (200% on web, largest setting on Android/iOS).
- **Non-text contrast**: Verify UI components meet 3:1 against adjacent backgrounds.
- **Touch target size**: Verify every tappable element ≥ 48×48dp (Android) or 44×44pt (iOS) or 44×44px (web).

**Operable:**
- **Full navigability**: Verify every interactive element is reachable via assistive technology.
- **No focus traps**: Verify focus never gets stuck. Exception: modal dialogs intentionally trap focus and provide dismiss action.
- **Logical focus order**: Verify focus traversal follows visual reading order.
- **Visible focus indicator**: Verify focused element is clearly highlighted, styled to match the app's design language while meeting 3:1 contrast.
- **Focus not obscured**: Verify focused element is not hidden by sticky headers, floating toolbars, or bottom sheets.
- **Action labels**: Verify every button and interactive element has an accessible name describing its action. Icon-only buttons must have labels.
- **Custom gestures documented**: Verify swipe-to-delete, long-press, drag-and-drop all have alternative accessible actions.

**Understandable:**
- **Language declared**: Verify app language is declared for screen readers.
- **Predictable behavior**: Verify no unexpected context changes on focus or input. Verify navigation is predictable.
- **Error identification**: Verify input errors are described in text near the field, not just color change.
- **Input labels**: Verify every input has a visible label or clear accessible name.
- **Form instructions**: Verify complex inputs provide instructions before the user attempts input.

**Robust:**
- **Custom component accessibility**: Verify non-standard interactive elements have correct roles and states.
- **Dynamic content announcements**: Verify content changes without user action are announced to screen readers.
- **State changes communicated**: Verify toggle states, expanded/collapsed states, selected states are communicated to assistive technology.

#### §G2. SCREEN READER TRACE

> Simulate the primary user workflow using ONLY the screen reader — no visual reference.

**Android TalkBack trace:**
- Enable TalkBack. Navigate the primary workflow by swiping right through all elements.
- Verify every screen announces its title when entered.
- Count steps via TalkBack vs visual — more than 2× steps via TalkBack is a navigation efficiency problem.
- Verify dialog/bottom sheet focus management (focus moves in on open, returns to trigger on close).
- Verify RecyclerView items announce meaningful content and position.
- Verify icon-only buttons announce their action.
- Verify custom components (seekbar, toggles, swipe-to-reveal) are accessible.
- Verify tab navigation announces position and selection state.

**iOS VoiceOver trace** *(if building for iOS)*:
- Same workflow trace using VoiceOver swipe navigation.
- Check Rotor for headings, links, and form controls.
- Check VoiceOver 3-finger scroll in custom scroll views.

**Web screen reader trace** *(if building for web)*:
- Test with NVDA (Windows) or VoiceOver (Mac) + Chrome/Safari.
- Check heading hierarchy via H key. Check landmark regions via D key.
- Check `aria-live` regions for appropriate politeness levels.

#### §G3. KEYBOARD & SWITCH ACCESS

- **Full keyboard operability**: Verify every interactive element is reachable and operable via Tab/Enter/Space/Arrow keys.
- **Focus traversal**: Verify Tab order matches visual order.
- **Dialog focus management**: Verify modal dialogs trap focus. Verify focus returns to trigger on close.
- **Dismiss actions**: Verify Back button/gesture closes dialogs, bottom sheets, drawers, dropdown menus consistently.
- **Custom component keyboard support**: Verify date pickers, color pickers, sliders, custom dropdowns are operable via arrow keys.
- **Switch Access compatibility**: On Android, verify primary workflow can be completed using Switch Access scanning.

#### §G4. REDUCED MOTION & SENSORY ACCOMMODATIONS

- **Reduced motion respected**: Verify all non-essential animations are disabled or minimized when the user requests reduced motion.
  - *Web*: `prefers-reduced-motion: reduce` for CSS and JS-driven animations.
  - *Android*: Check `Settings.Global.ANIMATOR_DURATION_SCALE`. Respect when set to 0.
  - *iOS*: Check `UIAccessibility.isReduceMotionEnabled`.
- **Reduced transparency**: Check for frosted glass, blurred backgrounds, semi-transparent overlays. Provide solid fallbacks.
- **Bold text support**: On iOS, verify typography survives bold text system-wide.
- **Color inversion compatibility**: Verify app remains usable with color inversion enabled. Images and videos should be exempt.
- **Haptic feedback as information**: If haptics communicate state, verify there is a visual/audio equivalent.

#### §G5. ANDROID-SPECIFIC ACCESSIBILITY DEEP DIVE

- **ContentDescription audit**: Find all `ImageView`, `ImageButton`, and `FloatingActionButton` elements. Verify each has `contentDescription` or is marked `importantForAccessibility="no"`.
- **TalkBack navigation grouping**: Verify related elements are grouped so TalkBack reads them as a single item. Use `android:focusable="true"` on parent containers with merged contentDescription.
- **Live region announcements**: Verify views that update asynchronously use `android:accessibilityLiveRegion="polite"` or `"assertive"`.
- **Touch exploration**: Verify every interaction works with the double-tap model. Long-press actions need alternative accessible paths.
- **Heading structure**: Verify `android:accessibilityHeading="true"` (API 28+) on section titles.
- **Scrolling accessibility**: Verify TalkBack users can scroll through long lists.
- **Permission dialog accessibility**: Verify rationale dialog is accessible before system dialog appears.

---

### CATEGORY H — Platform Compatibility & Resilience

> This category covers platform-specific compatibility. §H3 (Touch) and §H4 (Network) apply to all platforms.

#### §H1. PLATFORM COMPATIBILITY

**For web apps — Cross-Browser Matrix:**

Build this table for the specific APIs and features the app uses:

| Feature Used | Chrome | Safari/iOS | Firefox | Samsung | Edge | Fallback? |
|-------------|--------|------------|---------|---------|------|-----------|
| *[App-specific APIs]* | | | | | | |

For every ✗ or uncertain cell: verify the app crashes gracefully or degrades gracefully.

**Discovery strategy**: Use `Grep` to find API-specific calls (`navigator.`, `window.`, `CSS.`, `new IntersectionObserver`, etc.) and check each against browser support tables.

**For Android apps — API Level Compatibility:**

| Feature / API | Min API | App's minSdk | Needs compat? | Current handling |
|--------------|---------|-------------|--------------|-----------------|
| Material 3 Dynamic Color | 31 | | `DynamicColors.applyIfAvailable()` guards? |
| Splash Screen API | 31 | | `core-splashscreen` compat library used? |
| Predictive back gesture | 33 | | `android:enableOnBackInvokedCallback`? |
| Edge-to-edge | 30 | | `WindowCompat.setDecorFitsSystemWindows(false)`? |
| `WindowInsetsCompat` | All via AndroidX | | Used for safe area handling? |
| Scoped storage | 29 | | `MediaStore` / SAF used? |
| *[App-specific APIs]* | | | | |

For every feature above the app's `minSdkVersion`: verify a version check (`if (Build.VERSION.SDK_INT >= X)`) with graceful fallback exists.

#### §H2. APP DISTRIBUTION & UPDATE

**For web apps — PWA & Service Worker:**
- **Cache strategy correctness**: Verify cache-first for static assets, network-first for data, stale-while-revalidate for semi-static.
- **Version cleanup**: Verify old caches are purged on app update.
- **Update notification**: Verify user is notified when a new version is deployed.
- **Offline completeness**: Verify core functionality works offline. Verify network-dependent features fail gracefully.
- **Manifest completeness**: Verify required icon sizes, `display`, `theme_color`, `background_color`, `start_url`, `scope`.

**For Android apps — Distribution & Update:**
- **Play Store metadata**: Verify app icon at all required sizes, feature graphic, screenshot quality.
- **In-app update**: Check for Google Play In-App Update API usage for critical fixes.
- **Version code management**: Verify `versionCode` always incrementing, `versionName` human-readable.
- **ProGuard/R8 rules**: Verify obfuscation rules are correct with no runtime crashes from missing keep rules.
- **App bundle vs APK**: Verify Android App Bundle for optimal download size.
- **Baseline profiles**: Check for startup critical path pre-compilation.

#### §H3. MOBILE & TOUCH

**Web-specific:**
- **iOS Safari quirks**: Check `position: fixed` + virtual keyboard. Check `100vh` (use `dvh`).
- **Android**: Check back gesture in PWA behavior.
- **Touch vs hover**: Check for hover-only interactions blocked by `@media (hover: hover)`.
- **Safe area insets**: Check `env(safe-area-inset-*)` on fixed/absolute elements.
- **Pinch-to-zoom**: Check for `user-scalable=no` (accessibility violation — WCAG 1.4.4).
- **Swipe gestures**: Check for conflicts with native scroll.

**Touch interaction quality (all platforms):**
- **Touch target sizing**: Verify every tappable element ≥ 48×48dp (Android) or 44×44pt (iOS). Measure actual hit area, not just visible element.
- **Touch target spacing**: Verify ≥ 8dp gap between adjacent touch targets.
- **Touch feedback**: Verify every tappable element provides immediate visual feedback on press. On Android: ripple effect.
- **Thumb zone ergonomics**: Verify primary actions are in the natural thumb reach zone (bottom half of screen).
- **Scroll vs tap ambiguity**: Verify a minimum scroll distance threshold prevents accidental selections.
- **Edge gesture conflicts**: Check for conflicts between system gesture navigation and app gestures.
- **Orientation handling**: Check whether the app supports landscape meaningfully or should be locked to portrait.
- **Keyboard interaction**: Verify content scrolls to keep focused input visible above keyboard.
- **Multi-touch handling**: Verify multi-select/pinch gestures are correctly scoped.
- **One-handed usability audit**: Map the primary flow. Mark every point where the user must reach to the top of the screen.

#### §H4. NETWORK RESILIENCE

- **Offline detection reliability**: Verify the app correctly detects network availability and distinguishes "no connection" from "too slow."
- **Offline mode**: Verify the user can browse cached/local content when offline. Verify network-dependent features are clearly marked as unavailable.
- **Retry strategy**: Verify failed requests retry with exponential backoff and jitter, with a maximum attempt count and a final failure state with user action.
- **Timeout handling**: Verify every network request has a timeout. Verify the UI shows a timeout error after reasonable duration.
- **Request cancellation**: Verify pending requests are cancelled when the user navigates away. On Android: verify coroutine scope tied to ViewModel lifecycle.
- **Third-party service failure**: Verify the app degrades gracefully when image hosts, cloud APIs, or analytics SDKs fail.
- **Reconnection behavior**: Verify the app detects connectivity return, refreshes stale content, and resumes pending work. Check for duplicate operation risk.
- **Low-bandwidth resilience**: Verify the app remains usable on slow connections with appropriate image quality and meaningful progress indicators.
- **Data saver mode**: On Android, check whether the app respects Data Saver by reducing image quality and deferring non-critical syncs.

---

### CATEGORY I — Code Quality & Architecture

#### §I1. DEAD CODE & WASTE

> **Claude Code** — grep patterns for dead code detection:
> - Dev artifacts: `Grep(pattern: "console\\.log|debugger|TODO|FIXME|HACK|XXX|TEMP", glob: "*.{kt,java,js,ts,swift}")`
> - Commented code: `Grep(pattern: "^\\s*//.*\\(|^\\s*//.*=|^\\s*//.*fun |^\\s*//.*class ", glob: "*.{kt,java}")`
> - Unused imports (Android): `Grep(pattern: "^import ", type: "kotlin")` — then cross-reference usage
> - Unused string resources: `Grep(pattern: "<string name=\"", glob: "**/strings.xml")` — cross-ref with layout XMLs and Kotlin

- **Unused functions**: Identify functions defined but never called.
- **Unused constants**: Identify constants defined but never referenced.
- **Unreachable branches**: Identify `if (CONSTANT === false)` or conditions that can never be true given state machine.
- **Commented-out code**: Identify old implementation left as dead comments — recommend deleting or documenting why kept.
- **Unused CDN libraries**: Identify libraries loaded but never used.
- **Development artifacts**: Inventory `console.log`, `debugger`, `TODO`, `FIXME`, `HACK` — prioritize.

#### §I2. NAMING QUALITY
- **Casing conventions**: Verify `camelCase` (variables/functions), `PascalCase` (components/classes), `SCREAMING_SNAKE` (constants) are consistent.
- **Semantic accuracy**: Identify functions that do more than their name says, or names that imply different behavior.
- **Boolean naming**: Verify `is`/`has`/`can`/`should` prefix for boolean variables and props.
- **Event handler naming**: Verify `on{Event}` for callbacks, `handle{Event}` for internal handlers — consistent.
- **Magic numbers**: List every unexplained numeric literal that should be a named constant.
- **Unclear abbreviations**: Identify unclear abbreviations. Recommend expanding or documenting.

#### §I3. ERROR HANDLING COVERAGE
For every `try/catch` and every async operation:
- **Caught**: Verify the exception is caught.
- **Logged**: Verify there is a trace for debugging.
- **Surfaced**: Verify the user sees a meaningful message.
- **Recovered**: Verify the app returns to a valid, operable state.
- **Error boundaries**: Verify React Error Boundaries at the right granularity.

#### §I4. CODE DUPLICATION
- **Logic duplication**: Identify the same calculation in multiple places.
- **UI pattern duplication**: Identify the same component structure copied 3+ times.
- **Constant duplication**: Identify the same value hardcoded in multiple places.
- **Copy-paste divergence**: Identify duplicated code where one copy was updated and the other was not.

#### §I5. COMPONENT & MODULE ARCHITECTURE
- **Single responsibility**: Verify each component does one clearly-defined thing.
- **God components**: Identify components >300 lines doing multiple unrelated things. Identify natural split points.
- **Prop drilling**: Identify props passed through 4+ intermediate components.
- **Reusability**: Identify near-duplicate components that could be unified.
- **Dependency direction**: Verify lower-level components do not import from higher-level state/context.

#### §I6. DOCUMENTATION & MAINTAINABILITY
- **Algorithm comments**: Verify non-trivial algorithms have comments explaining the math, assumptions, inputs, outputs, and edge cases.
- **Lying comments**: Identify comments that describe what the code *used to* do before a refactor.
- **Architecture decisions**: Verify key choices are documented with rationale.
- **Section organization**: For large files — check for section index and grep-navigability.
- **Changelog**: Check whether version history is maintained.

---

### CATEGORY J — Data Presentation & Portability

#### §J1. NUMBER & DATA FORMATTING
- **Numeric display consistency**: Verify the same number is formatted the same way everywhere.
- **Percentage precision**: Check for contextual precision — 2dp for small values, 1dp for medium, 0dp for 100%. Verify consistency.
- **Date/time formatting**: Verify a single format across all views. ISO 8601 for data, human-readable for display.
- **Currency formatting**: Verify locale-correct formatting with correct decimal places.
- **Null/zero/empty representation**: Verify consistent treatment (`0`, `—`, `N/A`, hidden) for same meaning throughout.
- **Unit labels**: Verify "45 items" not just "45". No ambiguous bare numbers.
- **Significant figures**: Verify contextual precision — casual context shows `~2.4 hrs`, not `2.41739012...`.

#### §J2. DATA VISUALIZATION QUALITY
- **Data correctness**: Verify chart data points map to correct domain values. Check for off-by-one errors.
- **Axis honesty**: Verify Y-axis starts at 0 (unless explicitly justified). Check for misleading truncation.
- **Scale choice**: Check whether logarithmic vs linear is appropriate for the data range.
- **Small value visibility**: Verify values near zero are visible at default scale.
- **Tooltip accuracy**: Verify tooltip values match underlying computed values.
- **Visual vs computed agreement**: For every displayed number, verify the value shown equals the value computed.
- **Responsive correctness**: Check for labels overlapping at narrow widths, chart reflow on resize.
- **Colorblind safety**: Verify colors are distinguishable without hue (use shape, pattern, or label as secondary encoding).

#### §J3. ASSET MANAGEMENT
- **Third-party image hosts**: Assess reliability, rate limiting, GDPR implications.
- **Format modernity**: Check for WebP/AVIF vs legacy PNG/JPEG.
- **Lazy loading**: Check for `loading="lazy"` for below-fold images.
- **Error handling**: Verify `onError` fallback image. No broken-image glyphs in the UI.
- **Alt text quality**: Verify meaningful descriptions (not filenames).
- **PWA icons**: Verify all required sizes (192, 512, 180 for iOS).

#### §J4. REAL-TIME DATA FRESHNESS
- **Staleness indicators**: Verify data that changes frequently communicates age ("Last updated 3m ago").
- **Poll / push strategy**: Verify polling interval is appropriate for data volatility. Check WebSocket reconnect.
- **Optimistic updates**: Verify local state is updated immediately, then confirmed or rolled back. Verify rollback path.
- **Cache invalidation**: Check when cached responses become stale. Check for user force-refresh.
- **Timestamp handling**: Check for timezone mismatch and clock skew between server and client timestamps.
- **Race condition on rapid refresh**: Check for two in-flight requests where older response overwrites newer.
- **Loading vs stale distinction**: Verify visual difference between "loading" and "might be outdated."

---

### CATEGORY K — Specialized Domain Depths

Activate at maximum depth based on §0 Stakes and §I.1 Domain Classification.

#### §K1. FINANCIAL PRECISION
- **Integer cents rule**: Verify all monetary values are stored as integer cents/pence. Float is forbidden for money. `0.1 + 0.2 ≠ 0.3` in IEEE 754.
- **Rounding discipline**: Verify explicit rounding at defined points.
- **Tax application order**: Verify before or after discount. Verify correct for jurisdiction.
- **Rounding rule**: Identify whether Banker's rounding (round-half-to-even) or standard rounding is legally required.
- **Multi-currency**: Check FX rate freshness. Identify which rate is used for conversion.
- **Atomicity**: Check whether partial operations (interrupted payment, network failure mid-transaction) can leave state inconsistent.
- **Audit trail**: Verify financial actions are logged immutably.

#### §K2. MEDICAL / HEALTH PRECISION
- **Formula source**: Verify every clinical formula is cited against a published medical reference.
- **Unit safety**: Check for imperial/metric mixing. Check for `mg` vs `mcg` confusion. Check for `kg` vs `lbs`.
- **Dangerous value flagging**: Verify clinically dangerous values are flagged prominently.
- **Disclaimer visibility**: Verify "Not medical advice" is prominent and impossible to miss.
- **HIPAA/equivalent**: Check whether health data is stored locally or transmitted. Assess regulatory requirements.
- **Uncertainty communication**: Verify model limitations are stated. Verify estimates vs exact values are labeled.

#### §K3. PROBABILITY & GAMBLING-ADJACENT
- **Model appropriateness**: Verify mathematical model is valid for the actual stochastic process.
- **Worst-case disclosure**: Verify expected value is shown alongside worst-case.
- **Spending escalation UX**: Assess whether the UI design guides users toward spending more (with or without intent).
- **Age verification**: Check whether age gating is present or required for gambling-adjacent mechanics.
- **Jurisdiction**: Assess whether gambling regulations apply.

#### §K4. REAL-TIME & COLLABORATIVE
- **Conflict resolution strategy**: Identify whether two simultaneous editors use last-write-wins, merge, or lock.
- **Presence accuracy**: Check for stale online/offline status. Check reconnect latency.
- **Message ordering**: Verify out-of-order messages are handled correctly.
- **Optimistic update rollback**: Verify UI correctly rolls back if server operation fails.

#### §K5. AI / LLM INTEGRATION
*(Activate when External APIs or AI/LLM field in §0 references any AI provider)*
- **Prompt injection via user input**: Check for user-controlled text concatenated into a prompt. Verify sanitization or clear separation of user content from system instructions.
- **Output sanitization**: Check for AI-generated text inserted into the DOM via `innerHTML` or `dangerouslySetInnerHTML`. Always treat LLM output as untrusted — escape or sanitize before rendering.
- **Markdown rendering XSS**: If AI output is rendered via a markdown library, verify the library sanitizes HTML.
- **Token cost runaway**: Verify `max_tokens` limit on every request. Check for unbounded completion chains.
- **API key exposure**: Check for API key in frontend source code, localStorage, or URL params. Keys must go through a backend proxy.
- **Model fallback**: Verify graceful fallback or error message if primary model is unavailable.
- **Latency handling**: Verify visible streaming indicator or progress state for LLM calls (1–30s). Verify user can cancel. Verify UI remains interactive.
- **Hallucination disclosure**: Check whether app presents AI-generated content as fact. Verify caveat is present.
- **PII in prompts**: Check whether prompts include user PII. Assess data processor obligations.
- **Rate limiting / retry**: Verify 429 responses use exponential backoff with jitter and show a user-visible message.
- **Streaming edge cases**: Verify partial chunk handling — check what happens if stream cuts mid-token.

---

### CATEGORY L — Optimization, Standardization & Polish Roadmap

> This category identifies opportunities to improve beyond "working" to "exceptional" — while preserving features, respecting constraints, and protecting design identity.

#### §L1. CODE OPTIMIZATION OPPORTUNITIES
- **Algorithm efficiency**: Identify O(n²) operations where O(n log n) or O(n) is achievable without architectural change.
- **Memoization gaps**: Identify expensive pure computations called repeatedly with the same inputs.
- **Redundant computation**: Identify multiple places computing the same derived value.
- **Bundle size reduction**: Identify dead imports and lighter library alternatives within constraints.
- **CSS optimization**: Identify unused CSS classes, specificity conflicts, long selector chains.
- **Render optimization**: Identify components that render on every global state change despite depending on only a small slice.

#### §L2. CODE STANDARDIZATION
- **Consistent patterns**: For similar problems (data fetching, error handling, form validation) — verify one pattern is used throughout.
- **Utility consolidation**: Identify repeated utility functions that should be in a shared module.
- **Constant registry**: Verify all domain constants are in one place.
- **Component API consistency**: Check for inconsistent prop naming (`onClose` vs `handleClose` vs `dismiss`). Standardize.
- **Import/dependency order**: Check for consistent grouping and ordering.
- **Error handling pattern**: Verify consistent try/catch shape throughout.

#### §L3. DESIGN SYSTEM STANDARDIZATION
> The goal: move from "many components that each look fine individually" to "one coherent design system."
- **Token consolidation plan**: For every one-off value found in §E1 — provide the standardized token it should use.
- **Component variant audit**: For every component type — list all existing variants, identify variants to merge, identify missing variants.
- **Pattern library gap**: For components used ≥3 times without shared implementation — recommend extraction.
- **Theme variable completeness**: Identify every hardcoded value that bypasses the theme system.
- **Design system as product asset**: Assess whether the current system supports adding 5 new components without breaking visual language.
- **Theming readiness** *(paid/multi-tenant products only)*: Check whether brand-identity values are isolated in swappable root tokens.
- **Design system documentation**: Check for any documentation of the design system, even minimal.
- **Accessibility baked into the system**: Check whether design tokens include focus ring styles, minimum touch target sizes, and contrast-safe color pairings.
- **Android theme architecture**: Check for clean theme hierarchy. Verify styles are organized by component type.

#### §L4. COPY & CONTENT STANDARDIZATION
- **Voice guide**: Describe the app's copy voice in 3 adjectives, then list any copy that violates this voice.
- **Terminology dictionary**: For every key concept, identify the canonical name. List synonyms used inconsistently.
- **Capitalization audit**: List every label, button, and heading. Flag inconsistent capitalization.
- **Punctuation consistency**: Check trailing periods, em-dashes vs hyphens, quotation marks.
- **Number/unit style**: Check for spelled-out numbers vs digits ("three" vs "3") in same context.
- **CTA optimization**: Check whether calls-to-action are specific enough.
- **Brand voice guide deliverable** *(all)*: Based on the copy audit, produce a minimal voice guide:
  ```
  Voice: [adjective 1 / adjective 2 / adjective 3]
  Derived from: [Axis 1] × [Axis 2] × [Axis 3]
  
  This app sounds like: "[example]"  not  "[anti-example]"
  
  Always: [rule 1], [rule 2], [rule 3]
  
  [A3/A4 if active] Domain/community vocabulary:
    Use: [terms the audience actually uses]
    Avoid: [generic substitutes that signal distance]
  
  [A2 if emotional/sensitive context] Tone floor:
    Tone restrictions for this context: [specific restrictions]
  ```
- **Copy quality as context-appropriate signal** *(all)*: Generic, utilitarian copy signals low craft in any context. Identify the highest-priority rewrites based on the most active axes.

#### §L5. INTERACTION & EXPERIENCE POLISH
- **Transition coherence**: Verify every transition tells the correct spatial/relational story. Elements that appear from nowhere should instead grow, slide, or fade from a logical direction.
- **Delight opportunities**: Identify interactions that are currently functional but could be made memorable without adding visual noise.
- **State change communication**: Verify important changes (new result, data saved, error cleared) are communicated as events, not just static updates.
- **Scroll experience**: Verify scroll behavior is intentional, smooth, and position-preserving.
- **Loading sequence**: For multi-stage loading, verify the sequence feels progressive.
- **The craft implementation checklist** `[A1][A2][A5]`:
  - *High commercial intent (A1)*: `transform: scale(0.97)` on button press — `transition: all 0.2s ease-out` on interactive surfaces — skeleton loaders that mirror actual content layout — `font-variant-numeric: tabular-nums` on number columns — styled focus rings — hover states with cursor changes — contextual empty states — success confirmation that closes the interaction loop.
  - *Focus-critical contexts (A2)*: Every transition under 150ms — zero decorative animation — information-forward layout — instant feedback.
  - *Emotionally sensitive contexts (A2)*: All transitions 200–400ms minimum — ease-in-out curves only — warm confirmation states — gentle empty states.
  - *Aesthetic-primary contexts (A5)*: UI chrome transitions under 100ms so attention stays on the output.
  - *Any app — universal baseline*: At least one detail that clearly took extra effort. Spacing consistent enough that nothing feels accidental. Transitions that feel considered.
- **Motion budget**: Count simultaneous animated elements visible at once. More than 2–3 competes for attention. Identify views where the budget is exceeded.
- **Enter/exit animation asymmetry**: Elements should typically enter slower than they exit. Assess whether enter and exit animations are differentiated.
- **Stagger sequencing**: When multiple elements appear simultaneously, check for staggered entrance (30–50ms delay per element, capped at 150ms total).
- **Fragment/screen transition quality**: On Android, assess shared element transitions, enter/exit animations, Material motion patterns.
- **Haptic feedback polish**: On Android, verify haptic feedback at key moments (toggle, selection, destructive action, pull-to-refresh threshold, slider value change). Limit to 5–8 key moments.

#### §L6. PERFORMANCE POLISH

> Performance polish is about perceived speed. §D covers raw performance bugs; this section covers the perception layer.

- **Render jank identification**: Identify specific interactions where frame drops are likely. On Android: check for frames exceeding 16ms.
- **Perceived performance improvements**: Optimistic UI, instant visual feedback (<50ms), skeleton screens matching content shape, progressive disclosure of complex results.
- **Startup sequence optimization**: Identify minimum viable first render. Identify what can be deferred. On Android: use Baseline Profiles, defer heavy initialization to background threads.
- **Memory footprint reduction**: Identify data structures that could be more memory-efficient. On Android: check bitmap handling, RecyclerView pool sizing, fragment lifecycle, LiveData observer cleanup.
- **Image loading optimization**: Verify images load at correct resolution for display size. Check for blur-up or dominant-color placeholder. Verify smooth crossfade transition.
- **Animation performance**: Verify GPU-composited properties (`transform`, `opacity` / `translationX`/`alpha`/`scaleX`) are used instead of layout-triggering properties.
- **Scroll performance**: Verify RecyclerView/ListView scrolling at 60fps. Check for inflation in `onBindViewHolder`, synchronous image loading, `wrap_content` heights during scroll.
- **Cold start time**: On Android, verify cold start < 2 seconds. Audit `Application.onCreate()` for heavy synchronous work.

#### §L7. ACCESSIBILITY POLISH *(beyond compliance — toward excellence)*

> §G covers compliance. This section covers experience quality for assistive technology users.

- **Screen reader navigation efficiency**: Count steps for primary workflow via TalkBack vs sighted. Optimize if >2× more steps.
- **Heading hierarchy excellence**: Verify heading structure enables efficient TalkBack heading navigation. Every screen should have at least one heading.
- **Content description quality**: Audit every `contentDescription` for informational value. Descriptions convey *purpose* ("Navigate back"), not *appearance* ("Left arrow icon").
- **Announcement verbosity calibration**: Verify TalkBack descriptions are comprehensive but not slow. Group information logically.
- **Focus choreography**: For complex interactions (dialogs, bottom sheets, selection mode) — verify focus movement tells a coherent spatial story.
- **Live region tuning**: Verify dynamic content updates are announced at appropriate frequency. `polite` for informational, `assertive` only for urgent.
- **Color-independent comprehension**: Convert screenshots to grayscale. Verify every distinction (selected/unselected, error/success, active/inactive) is still visible.
- **High contrast mode support**: On Android, verify app remains well-designed in high contrast text mode.
- **Cognitive accessibility**: Verify plain language, consistent navigation patterns, error prevention, extendable time limits.

---

### CATEGORY M — Deployment & Operations

#### §M1. VERSION & UPDATE MANAGEMENT
- **Version single source of truth**: Verify app version is in one place in the codebase.
- **Schema migration**: Verify state schema changes across versions have migration logic.
- **Rollback strategy**: Identify how users get back to a working state after a bad deploy.
- **Cache busting**: Verify static assets get new URLs when content changes.

#### §M2. OBSERVABILITY
- **Error reporting**: Verify uncaught exceptions are sent to error monitoring or logged structurally.
- **Debug mode**: Verify development-only logging is gated behind a flag.
- **State inspection**: Check whether a developer can inspect current application state without devtools.
- **Admin action logging**: Verify privileged actions are logged. Check for immutable audit trail.

#### §M3. FEATURE FLAGS & GRADUAL ROLLOUT
- **Flag inventory**: List every `if (FEATURE_FLAG)` or `if (process.env.FEATURE_X)`. Check documentation.
- **Dead flags**: Identify flags always true or always false in production.
- **Flag coupling**: Identify flags that must be toggled together. Check for documentation.
- **Emergency kill switch**: For risky or AI-powered features — check for a runtime flag to disable without a deploy.
- **A/B test cleanup**: Identify concluded experiments with flag code still in place.

---

### CATEGORY N — Internationalization & Localization

> Activate at full depth whenever §0 `Locale / i18n` is not "English only" or is omitted.
> Even English-only apps should pass the hardcoded-strings check — future i18n cost compounds with every unchecked string.

#### §N1. HARDCODED STRING INVENTORY

- **User-visible strings in source**: List every string rendered in the UI that is hardcoded in source code rather than in a locale resource.
  - *Web*: Strings in JS/JSX/HTML/TSX instead of locale JSON/i18n library.
  - *Android*: Strings in Kotlin/Java or in XML layouts (`android:text="Submit"`) instead of `@string/` references. Use `Grep(pattern: 'android:text="[^@]', glob: "*.xml")`.
  - *iOS*: Strings in Swift/ObjC instead of `NSLocalizedString`.
- **Pluralization logic**: Verify proper pluralization API, not `count === 1 ? "item" : "items"`.
  - *Android*: Use `<plurals>` resource with `getQuantityString()`.
- **Concatenated UI strings**: Verify template/message format is used, not string concatenation.
  - *Android*: Use `getString(R.string.message_count, count)` with positional arguments.
- **Hardcoded error messages**: Check catch blocks, validation messages, toast content, snackbar text.
- **Accessibility text**: Verify `contentDescription`/`accessibilityLabel`/`aria-label` are localizable.
- **Android-specific**: Check `menu.xml`, `AndroidManifest.xml`, Navigation graph, notification builders, preference XML.

#### §N2. LOCALE-SENSITIVE FORMATTING
- **Number formatting**: Verify `Intl.NumberFormat` or equivalent for display. Decimal separator differs by locale.
- **Date/time formatting**: Verify `Intl.DateTimeFormat` or equivalent. Month/day order and 24h/12h vary.
- **Currency display**: Verify `Intl.NumberFormat` with `style: 'currency'` for locale-correct formatting.
- **Collation/sorting**: Verify `Intl.Collator` for locale-aware alphabetical sort.
- **Relative time**: Check for `Intl.RelativeTimeFormat`.
- **List formatting**: Check for `Intl.ListFormat`.

#### §N3. RTL (Right-to-Left) LAYOUT
*(Activate only if §0 Locale includes Arabic, Hebrew, Persian, Urdu, or other RTL languages)*
- **`dir="rtl"` on `<html>`**: Verify set dynamically per locale.
- **CSS logical properties**: Verify `margin-inline-start` / `padding-inline-end` instead of `margin-left` / `padding-right`.
- **Flexbox direction**: Check whether `flex-direction: row` items reverse intentionally in RTL.
- **Icon mirroring**: Identify directional icons that should flip in RTL. Checkmarks and warnings should not.
- **Text alignment**: Verify `text-align: start` instead of `text-align: left`.
- **Canvas/SVG**: Check custom rendering code for RTL awareness.
- **Third-party components**: Verify date pickers, dropdowns, data grids respect `dir="rtl"`.

#### §N4. LOCALE LOADING & PERFORMANCE
- **Bundle size**: Check whether all locale data is bundled upfront vs loaded on demand.
- **Fallback chain**: Verify missing key falls back to default locale, then to key name. No blank UI.
- **Locale detection**: Check for `navigator.language` usage. Verify user override is persisted.
- **Dynamic locale switch**: Verify full re-render in new locale without page reload. Verify state preservation.

---

### CATEGORY O — Development Scenario Projection

> This category looks **forward**. Every other category diagnoses what is wrong today.
> This category answers: what will this codebase become under normal development pressure, growth, and time?

#### §O1. SCALE CLIFF ANALYSIS

For every data-intensive, storage-bound, or computation-bound operation, identify the data volume at which it transitions from "works fine" → "noticeably slow" → "crashes or becomes unusable."

For each identified cliff:
```
Operation:       {e.g. "Filtering items list", "localStorage write on save", "O(n²) sort"}
Location:        {specific function / component}
Current safe range:  {works acceptably up to N items / N KB / N concurrent actions}
Warning zone:    {degrades noticeably between N and M — user perceives lag}
Cliff edge:      {fails, freezes, or loses data above M}
Trigger:         {the specific user action or growth event that crosses this threshold}
Current trajectory: {estimated time to reach cliff at normal usage pace}
Fix window:      {how long the developer has before this becomes urgent}
```

Common cliff locations to analyze:
- **localStorage quota** (5MB hard cap): current payload size × growth rate per user action
- **O(n²) operations**: any sort + filter combination, nested loops, or `find()` inside `map()`
- **Unvirtualized DOM lists**: beyond 200–500 items causes scroll jank; beyond 2,000 may freeze browser
- **Bundle parse time on mobile**: single-file apps past 500KB uncompressed are measurably slow on mid-range Android
- **Re-render cascade**: global state change that re-renders the entire tree
- **Regex performance on large inputs**: pathological backtracking on user-provided strings

#### §O2. FEATURE ADDITION RISK MAP

Based on §0 `Likeliest Next Features` and reasonable inference, identify the top 5 features most likely to be added. For each, analyze what in the current codebase will break, resist, or require expensive redesign.

For each anticipated feature:
```
Feature:               {name}
Probability:           HIGH / MEDIUM

Current code that conflicts or must change:
  - {specific function/pattern} at {location} — {why it conflicts}
  - {specific assumption} baked into {component} — {why it breaks}
  - {data structure choice} — {why it requires redesign}

Pre-adaptation cost (fix now):  Trivial / Small / Medium / Large
Post-addition cost (fix after): {estimated 3–10× higher — why}

Pre-adaptation recommendation:
  {The minimal abstraction or structural change that opens the door for this feature
   without breaking current behavior. This is preparation, not the feature itself.}
```

Example conflicts to look for:
- **User accounts**: state stored flat (no `userId` scope) → all data must be re-keyed
- **Undo/redo**: state mutations applied directly → no command history
- **Multi-device sync**: localStorage as sole persistence → no sync surface
- **Theming / white-label**: hardcoded brand colors throughout
- **Server-side rendering**: `window`/`document` accessed at module level → crashes during SSR

#### §O3. TECHNICAL DEBT COMPOUNDING MAP

Identify which current issues are compounding — their cost grows with every new line of code built on top of them. These must be prioritized above their individual severity.

Compounding debt markers:
- **Foundation coupling**: Logic that other features build directly on top of, without abstraction
- **Terminology divergence**: Same concept named differently in different sections
- **Schema without migration infrastructure**: Stored data with no version field and no migration logic
- **Test debt on changing code**: Frequently-modified logic with no test coverage
- **Copy-paste architecture that has already diverged**: Duplicated logic where copies are now subtly different
- **Magic constants without a registry**: Domain-critical numbers scattered through code

For each:
```
Debt:                     {description}
Location:                 {where it lives}
Current cost to fix:      Trivial / Small / Medium / Large
Cost multiplier (6 months): {estimated — e.g. "3× harder after user accounts are added"}
Compounding trigger:      {the event that causes cost to jump}
Pre-emption recommendation: {the minimal change that breaks the compounding cycle}
⏱ COMPOUNDS
```

#### §O4. DEPENDENCY DECAY FORECAST

For every external dependency, assess its forward risk profile:

| Dependency | Version | Maintenance Status | Risk Level | Specific Risk | Recommended Action |
|-----------|---------|-------------------|-----------|--------------|-------------------|
| {name} | {ver} | Active / Slow / Abandoned / Security history | LOW / MED / HIGH | {concern} | {action} |

Risk factors: abandonment indicators, breaking change trajectory, security history, CDN single-point-of-failure, API version sunset, framework compatibility drift.

#### §O5. CONSTRAINT EVOLUTION ANALYSIS

For each constraint likely to evolve:
```
Current Constraint:     {e.g. "localStorage-only persistence"}
Evolution Trigger:      {the growth or feature requirement that forces this change}
Migration Complexity:   LOW / MEDIUM / HIGH / PROHIBITIVE (if attempted without pre-adaptation)

Migration obstacles (specific):
  - {what assumes this constraint and must be refactored}
  - {what data transformation is required}

Pre-adaptation opportunity:
  {The abstraction that can be added now at low cost that converts the
   eventual migration from a rewrite into a substitution.
   Cost now: {Trivial/Small}. Avoided cost later: {Medium/Large}.}
```

Key evolutions to analyze: localStorage → backend API, single-user → multi-user, CDN → build pipeline, hardcoded locale → multi-locale, monolith → modular.

#### §O6. MAINTENANCE TRAP INVENTORY

Identify every location where a seemingly simple change is at high risk of introducing a non-obvious regression.

For each:
```
Trap name:          {short descriptive name}
Location:           {specific function, component, or section}
Why it's a trap:    {the specific coupling, hidden dependency, or non-obvious behavior}
Symptom signature:  {the error the developer would see after accidentally breaking it}
Safe modification protocol: {step-by-step check before and after any change}
Defusion recommendation:    {the refactor that eliminates the trap}
```

Common patterns: functions with hidden side effects, order-dependent initialization, load-bearing magic values, deep prop chains, CSS specificity landmines, global state assumed by multiple components.

#### §O7. BUS FACTOR & KNOWLEDGE CONCENTRATION

Identify code sections that are effectively a black box — only safely modifiable by whoever wrote them.

For each:
```
Location:           {specific function/section}
Knowledge gap:      {what a new developer cannot understand from reading the code alone}
Bus factor risk:    {what breaks if the author is unavailable}
Minimum documentation:  {the specific comment or documentation that would make this safe to modify}
```

---

**§O — Required Output: Scenario Projection Summary**

This table must appear at the end of the Projection Analysis part:

| Scenario | Likelihood | Time Horizon | Current Readiness | Pre-adaptation Cost | Without Pre-adaptation |
|----------|-----------|-------------|-------------------|--------------------|-----------------------|
| {e.g. "User reaches 500+ items"} | HIGH | 3 months | NOT READY — cliff at 200 items | Small | Large refactor under pressure |
| {e.g. "Adding user accounts"} | HIGH | 6 months | PARTIAL — no user scoping in schema | Medium | Data migration + full state redesign |
| {e.g. "Moving to a backend"} | MEDIUM | 12 months | NOT READY — no storage abstraction | Small | Every component must be updated |
## V. FINDING FORMAT

Every finding follows this exact format. Every finding is specific enough that the developer can implement it without asking a follow-up question.

```
[SEVERITY] [CONFIDENCE] — {Short descriptive title}

Category:         {§Letter.Number} — {Category and Dimension Name}
Location:         Line {N} in {function/component name} / "near `functionName()`" if line unknown
Domain Impact:    {Connects finding to the app's actual purpose and user stakes}

Description:
  {What is wrong or suboptimal. References the exact variable, function, value, or CSS class.
   Always specific. "The `handleImport` function" — always named exactly as it appears in code.}

Evidence:
  {For [CONFIRMED]: direct code reference or execution trace.
   For [LIKELY]: strong circumstantial code evidence.
   For [THEORETICAL]: the reasoning chain explaining why this is a risk.}

User Impact:
  {Concrete scenario: what actually happens to a real user because of this issue.}

Recommendation:
  {Specific, actionable. Before/after code snippet where feasible.
   If multiple approaches exist, rank them by safety and effort.
   Tag recommendations that change behavior with ⚠ BEHAVIOR CHANGE.
   Tag recommendations that touch design identity with ✦ IDENTITY-SENSITIVE.
   Tag findings whose cost grows over time with ⏱ COMPOUNDS.}

Effort:        Trivial (<5 min) | Small (<1 hr) | Medium (<1 day) | Large (>1 day)
Risk:          {What could break if this recommendation is applied incorrectly}
Cross-refs:    {Other finding IDs that should be fixed together or in sequence}
Automated Test: {What test type (unit/integration/E2E/snapshot) and what assertion would catch a regression}
```

### Severity Scale

| Level | Meaning | When to Apply |
|-------|---------|---------------|
| **CRITICAL** | App-breaking crash, data loss, security breach, wrong output causing real harm | XSS vector, import corrupts all state, wrong financial/medical calculation, prototype pollution |
| **HIGH** | Major feature broken, significant user harm, serious accessibility failure, important data wrong | Broken workflow, missing critical validation, modal not keyboard-accessible, wrong domain data |
| **MEDIUM** | Feature partially wrong, degraded UX, moderate accessibility issue, noticeable inconsistency | Missing loading state, color contrast below 4.5:1, inconsistent number formatting, NaN not handled |
| **LOW** | Minor inconsistency, cosmetic issue, non-critical opportunity | Spacing inconsistency, slightly wrong animation timing, minor dead code |
| **NIT** | Style, naming, purely aesthetic with no UX impact | Typo in comment, inconsistent quote style, unused `console.log` in dev path |

**Stakes multiplier**: For CRITICAL-stakes apps, apply one level upward to findings in §A, §B, §C, §K.

**Optimization/Polish findings**: Use severity to express the improvement value. A HIGH polish finding means a high-value design improvement opportunity.

### Confidence Scale

| Level | Meaning |
|-------|---------|
| **[CONFIRMED]** | Verified by reading code and tracing execution path |
| **[LIKELY]** | Strong code evidence; near-certain but not runtime-verified |
| **[THEORETICAL]** | Architectural risk that requires runtime testing to confirm |

---

## VI. REQUIRED DELIVERABLES

### Tier 1 — Must Complete (Parts 1–4)

| Deliverable | Format | Contents |
|-------------|--------|---------|
| **Feature Preservation Ledger** | Table | Feature · Status (Working/Broken/Partial/Unknown) · Dependencies · Safe to Modify · Safe to Remove · Notes |
| **Design Identity Record** | Summary | Confirmed design character, protected signature elements, any ambiguities resolved with user |
| **Architecture Constraint Map** | Table | Constraint · Why it exists · What breaks if violated · How recommendations respect it |
| **Domain Rule Verification Table** | Table | Rule from §0 · Code value/implementation · Match (✓/✗/⚠) · Finding ID if mismatch |
| **Workflow Trace Report** | Per-workflow | Each step · Code location · Bugs found at step · Pass/Fail |
| **Data Integrity Report** | Table | Input · Validation gap · Invalid values possible · Downstream corruption |
| **Priority Action Items** | Two-tier | Tier A: Quick Wins (CRITICAL/HIGH + Trivial/Small) · Tier B: Strategic (remaining CRITICAL/HIGH by user impact) |
| **Scenario Projection Summary** | Table | Scenario · Likelihood · Time Horizon · Current Readiness · Pre-adaptation Cost · Cost Without Pre-adaptation |

### Tier 2 — Should Complete (Parts 5–10)

| Deliverable | Contents |
|-------------|---------|
| **Sensitive Data Inventory** | Every stored/transmitted datum: classification, protection, risk |
| **Data Flow Diagram** | `Input → Validation → State → Computation → Display` with gap annotations at every arrow |
| **Graceful Degradation Matrix** | Dependency · Failure mode · User impact · Current fallback · Quality (Good/Partial/None/Crash) |
| **Resource Budget Table** | Resource · Size · Load strategy · Critical path? · Optimization opportunity |
| **Web Vitals Estimate** | LCP, FID/INP, CLS — each with bottleneck and fix |
| **WCAG 2.1 AA Scorecard** | Criterion · Pass/Fail/N/A · Evidence · Fix |
| **Cross-Browser Matrix** | Feature × Browser: Pass/Fail/Partial/Unknown |
| **Design Token Inventory** | Every unique spacing, color, radius, shadow, z-index, transition — with consolidation plan |
| **Component Quality Scorecard** | Every component type: variant completeness, state completeness, visual consistency grade |
| **Copy Quality Inventory** | Every piece of UI copy: voice consistency, clarity, conciseness, suggested rewrites |
| **i18n Readiness Report** | Hardcoded string count, locale-unsafe format calls, RTL gaps, estimated i18n migration effort |

### Tier 3 — Complete if Time Allows (Parts 11+)

| Deliverable | Contents | Applies To |
|-------------|---------|------------|
| **Optimization Roadmap** | Code efficiency, render performance, bundle size — ranked by effort vs impact | All |
| **Design System Standardization Plan** | Token consolidation, component unification, pattern library gaps | All |
| **Polish Delta Report** | Per section: specific changes that move from "functional" to "intentional/professional" (framing adapted to product nature) | All |
| **Brand Voice Guide** | Voice adjectives, always rules, copy rewrites — adapted to product nature | All |
| **Commercial Readiness Assessment** | First-impression audit, competitive benchmark, monetization-tier alignment gap | Paid/Freemium/B2B only |
| **Thematic Fidelity Assessment** | Source-material color/type/tone alignment, community authenticity audit, fan credibility signals | Fan/Community tools only |
| **Visual Identity Report** | Brand signature, color/type/motion alignment to personality, differentiation or fidelity opportunities | All (framing varies) |
| **Missing Tests Matrix** | Critical code paths → test type (unit/integration/E2E) → priority | All |
| **Architecture Evolution Roadmap** | (1) Safe incremental improvements · (2) Medium-term refactors · (3) Long-term goals | All |
| **Domain-Specific Deep Dive** | Per §K dimensions activated by domain classification | All |

---

## VII. SUMMARY DASHBOARD (Final Part)

### Findings Table

| Category | Total | CRIT | HIGH | MED | LOW | NIT | Quick Wins |
|----------|-------|------|------|-----|-----|-----|------------|
| A — Logic | | | | | | | |
| B — State | | | | | | | |
| C — Security | | | | | | | |
| D — Performance | | | | | | | |
| E — Visual Design | | | | | | | |
| E8 — Product Aesthetics | | | | | | | |
| E9 — Brand Identity | | | | | | | |
| E10 — Data Storytelling | | | | | | | |
| F — UX/Copy | | | | | | | |
| F6 — Engagement/Delight | | | | | | | |
| G — Accessibility | | | | | | | |
| H — Compatibility | | | | | | | |
| I — Code Quality | | | | | | | |
| J — Data/Viz | | | | | | | |
| K — Domain | | | | | | | |
| L — Optimization | | | | | | | |
| M — Ops | | | | | | | |
| N — i18n/L10n | | | | | | | |
| O — Projection | | | | | | | |
| **Total** | | | | | | | |

### Root Cause Analysis

```
RC-{N}: {Root Cause Name}
Findings affected: F-001, F-007, F-012 (list all)
Description: The upstream condition that, if fixed, resolves multiple downstream findings
Fix leverage: Fixing this one root cause replaces {N} individual fixes
```

### Compound Finding Chains

```
Chain-{N}: {Name}
Combined Severity: {Escalated beyond individual findings}
  Step 1: [F-003] [LOW]  — {description}
  Step 2: [F-011] [MED]  — {description}
  Step 3: [F-019] [HIGH] — {description}
  Combined: {User harm scenario} → {Severity at stakes level}
```

### Positive Verifications

{N} critical paths confirmed working correctly:
- `{feature}` — verified via {method} — no issues found

### Top 10 Quick Wins

Highest (severity × user impact) with lowest effort — fix these first:

| # | ID | Title | Severity | Effort | Impact |
|---|----|----|---------|--------|--------|
| 1 | | | | | |

### Remediation Roadmap

```
IMMEDIATE — before next release:
  [ ] F-{id} {title} — Effort: {X} — Risk: {Y}

SHORT-TERM — next sprint:
  [ ] F-{id} ...

POLISH SPRINT — standalone improvement sprint:
  [ ] Design token consolidation — Effort: Medium
  [ ] Copy standardization — Effort: Small
  [ ] Component variant completion — Effort: Medium

MEDIUM-TERM — next 1–3 months:
  [ ] ...

ARCHITECTURAL — 6+ months:
  [ ] ...
```

---

## VIII. CROSS-CUTTING CONCERN MAP

> Patterns that span multiple categories. Check each one after completing all audit dimensions.

| Concern | Sections | Failure Chain |
|---------|----------|---------------|
| **Data Integrity** | | |
| Floating-point precision | §A1, §A2, §J1 | Calculation drift → wrong display → user decisions |
| Validation gap chain | §B3, §A1, §F4 | Missing validation → wrong logic → wrong display → user harm |
| Input boundary cascade | §A1, §B3, §D1 | Out-of-range value → engine crash or wrong silent result |
| Type coercion in validation | §A7, §B3 | String input → `+` concatenates → invalid value passes → corrupts downstream |
| NaN/Infinity propagation | §A7, §B3, §J1 | Silent NaN → propagates through pipeline → wrong display |
| **State & Persistence** | | |
| Storage limits | §B2, §I1 | Quota exceeded → silent data loss → corrupted reload |
| Concurrent state modification | §A4, §B2 | Multiple tabs / rapid actions → race condition → data corruption |
| Stale closure cascade | §A6, §B1 | Missing useEffect deps → stale state → wrong computation → wrong display |
| Mutation through abstractions | §B6, §B1 | Shallow copy → child mutates nested object → parent state silently corrupted |
| Import/export chain | §B4, §C3, §C5 | Malformed import → prototype pollution → state corruption |
| **Security** | | |
| AI output injection | §K5, §C2 | LLM output via innerHTML → XSS from adversarial model output |
| Domain data fabrication | §A1, §K1–K5, §I.5 | Unverified domain fact used as finding basis → developer acts on false info |
| **Visual & Design** | | |
| Theme completeness | §E1, §E3, §L3 | Hardcoded color bypassing theme → inconsistency + a11y failure |
| Design token fragmentation | §E1, §L3 | One-off values throughout → visual inconsistency + maintenance burden |
| Design-nature mismatch | §E8, §E9, §L3 | Polish misaligned with product nature → blocks conversion / feels inauthentic |
| Color psychology conflict | §E3, §E9 | Palette emotion mismatched to domain → subconscious friction |
| Brand identity absence | §E9, §E7 | No visual signature → indistinguishable from competitors |
| Copy inconsistency | §F4, §L4 | Same concept named differently → user confusion |
| Copy-tier mismatch | §L4, §F4 | Generic copy undermines trust built by visual design |
| Delight debt | §F6, §L5 | No personality or reward moments → product feels transactional |
| **Accessibility & Compatibility** | | |
| Semantic HTML gap | §G1, §G2, §G3 | `<div>` buttons → no keyboard, no screen reader, no WCAG |
| Reduced motion gap | §E6, §G4 | CSS respects prefers-reduced-motion but canvas/JS does not |
| **Infrastructure** | | |
| Worker reliability | §D1, §H2, §H4 | Blob Worker incompatibility → missing fallback → wrong results |
| External dependency failure | §H2, §H4, §J3 | CDN/image host down → crash vs graceful degrade |
| Stale cache on deploy | §H2, §M1 | SW serves old JS with new schema → silent corruption |
| Timezone/DST | §A3, §A5 | Wrong DST offset → wrong dates/countdowns |
| Locale assumption | §N1, §N2, §J1 | Hardcoded formats → wrong display in non-English locales |
| Feature flag coupling | §M3, §A4 | Flags toggled independently when they must be together → broken state |
| **Growth & Evolution** | | |
| Compounding constraint | §O5, §B2 | Direct localStorage calls everywhere → migration requires touching every component |
| Scale cliff invisibility | §O1, §D1 | O(n²) works at dev volume → cliff invisible until production |
| Cross-audit contradiction | §0, §I.5 | Second audit silently produces different value for same rule |
| **§X/§XI Specific** | | |
| R&D-audit disconnect | §X.2, §VII | Improvement plan ignores audit findings → new features on broken foundation |
| Existing feature blindness | §X.0, §X.2 | New feature excitement → existing improvements perpetually defer |
| Polish regression cascade | §XI.2, §XI.5 | Polish one dimension, degrade another → caught only by quality gates |
| Restructuring-during-polish | §XI.3, §XI.2 | Code + visual changes mixed → regression source ambiguous |
| Feature preservation gap | §XI.1, §XI.5 | Ledger incomplete → polish breaks unlisted feature |
| Coherence fracture cascade | §XI.0, §X.0 | Healing one fracture reveals deeper one → re-analyze after each heal |
| Vision drift | §XI.0, §XI.5 | Vision forgotten by step 15 → later steps optimize for code, not product |

---

## IX. AUDIT COMPLETION CRITERIA

> **Claude:** Use this checklist to determine when the audit is complete. An audit is "done" when all applicable criteria are met.

```
COMPLETION GATES — check each before delivering the Summary Dashboard (§VII):

[ ] Every Part from §III Part Structure has been executed (or explicitly skipped with reason)
[ ] §0 is fully populated — no placeholder values remain
[ ] Every CRITICAL and HIGH finding includes a specific fix (not "improve X")
[ ] Every finding has a confidence tag: [CODE], [§0-CONFIRMED], or [UNVERIFIED]
[ ] Summary Dashboard (§VII) is populated: findings table, root cause analysis, quick wins
[ ] Top 10 Quick Wins are ranked by (severity × impact) / effort
[ ] Remediation Roadmap has at least IMMEDIATE and SHORT-TERM sections filled
[ ] Cross-Cutting Concern Map (§VIII) checked — compound chains documented
[ ] Feature Preservation Ledger confirms no existing feature was accidentally invalidated
[ ] TodoWrite shows all parts as "completed"

EARLY EXIT — acceptable to stop before full completion when:
  - User says "that's enough" or "stop here" → deliver §VII with what you have
  - Context window is running low → deliver §VII, note which parts were not completed
  - User redirects to "fix mode" → switch from auditing to implementing fixes
  - Only LOW/NIT findings remain in uncovered parts → note and stop

DO NOT STOP if:
  - Any CRITICAL finding exists without a documented fix
  - §VII Summary Dashboard has not been produced
  - §0 Domain Rules have [UNVERIFIED] items that could affect CRITICAL findings
```

---

## X. RESEARCH, DEVELOPMENT & IMPROVEMENT PROTOCOL

> **Evaluates existing features** (which may have drifted, stagnated, or been half-finished) **and new feature opportunities** — then produces a unified, prioritized development plan. The most impactful improvement is often an existing feature made twice as good, not a new feature.
>
> **Prerequisite**: §0 + §I classification (lightweight if standalone, full if post-audit).
>
> **Execution order**: §X.0 (look inward) → §X.1 (look outward) → §X.2 (prioritize) → §X.3 (deliverable).
> Always run §X.0 before §X.1. Always look inward before looking outward.

---

### §X.0. EXISTING FEATURE DEEP EVALUATION

> Before looking outward (competitors, new features), look inward. Apps grow feature by feature, each built at a specific point in time. Over months, features drift: UX evolves but old features stay behind, two features overlap, a feature shipped at MVP was never revisited.

#### X.0.1 — Feature Health Audit

For every feature in the app, evaluate across six dimensions:

```yaml
Feature: {name}
  # ── FUNCTIONAL ──
  Correctness:     SOLID / FRAGILE / BROKEN
    # Does it produce the right output? Always, or only on the happy path?
  
  # ── UX ──
  Usability:       INTUITIVE / ADEQUATE / CONFUSING / HOSTILE
    # Can a user accomplish the task without guessing? Has the UX evolved with the app?
  Discoverability: OBVIOUS / FINDABLE / HIDDEN / ORPHANED
    # Can users find this feature? Or has navigation growth buried it?
  
  # ── DESIGN ──
  Visual coherence: INTEGRATED / DATED / INCONSISTENT / ALIEN
    # Does it visually belong to the current version of the app, or an older era?
  
  # ── STRATEGIC ──
  User value:      CORE / IMPORTANT / MINOR / VESTIGIAL
    # If removed, would users notice? Would they leave?
  Completion:      COMPLETE / 80% DONE / HALF-BAKED / STUB
    # Was this feature fully realized, or shipped at MVP and never revisited?
  
  # ── DRIFT (most important dimension) ──
  Drift from current standard: NONE / MILD / SIGNIFICANT
    # Compared to the app's best features — how far has this one fallen behind?
```

#### X.0.2 — Feature Relationship Map

Map how features depend on, overlap with, and sometimes contradict each other:

```yaml
Dependencies:     # Feature A requires Feature B to function
  - "{A} → {B}: {what breaks if B changes}"

Overlaps:         # Feature A and Feature B do similar things
  - "{A} ↔ {B}: {how they overlap}"

Contradictions:   # Feature A and Feature B imply different mental models
  - "{A} ✕ {B}: {the conflict}"

Orphans:          # Features disconnected from the rest of the app
  - "{feature}: {why it's disconnected}"

Missing Bridges:  # Features that should connect but do not
  - "{A} ⇥ {B}: {the missing link}"
```

#### X.0.3 — Feature Evolution Assessment

For every feature rated below SOLID + INTUITIVE + INTEGRATED + CORE + COMPLETE:

| Action | When | Meaning |
|--------|------|---------|
| **ELEVATE** | Valuable but below current quality standard | Bring to the standard of the app's best features. Quality uplift only. |
| **EVOLVE** | Works but users need more than it offers | Add depth/options. The feature's *scope* expands. |
| **CONSOLIDATE** | Two+ features overlap significantly | Merge into one coherent feature that does both jobs better. |
| **REIMAGINE** | Fundamental UX approach is wrong | Redesign from the user's perspective. Same goal, different interaction model. |
| **DEPRECATE** | Vestigial — low usage, no strategic value | Plan graceful removal. Migrate data/expectations first. |
| **LEAVE** | Healthy, coherent, well-integrated | Confirm explicitly so the developer knows it was evaluated. |

```yaml
Feature: {name}
  Action:      {ELEVATE / EVOLVE / CONSOLIDATE / REIMAGINE / DEPRECATE / LEAVE}
  Rationale:   {why — tied to health audit findings}
  Current:     {1–2 sentences: what the feature does now and how it feels}
  Target:      {1–2 sentences: what the feature should become}
  Changes:
    - {concrete change}
    - {concrete change}
  Effort:      LOW / MEDIUM / HIGH
  User impact: {specific experience improvement}
  Risk:        {what could break or regress}
```

#### X.0.4 — Feature Coherence Score

```yaml
Feature Coherence:
  Total features:                {N}
  At current standard:           {N} ({%})
  With significant drift:        {N} ({%})
  Overlapping pairs:             {N}
  Contradicting pairs:           {N}
  Orphaned features:             {N}
  Missing bridges:               {N}
  
  Rating: HIGH / MEDIUM / LOW / CRITICAL
    # HIGH:     ≥80% at standard, no contradictions, no orphans
    # MEDIUM:   ≥60% at standard, ≤1 contradiction, ≤1 orphan
    # LOW:      <60% at standard, or ≥2 contradictions/orphans
    # CRITICAL: The app feels like multiple apps stitched together
  
  Narrative: {2–3 sentences — does the app feel like one product or a patchwork?}
```

**LOW or CRITICAL coherence → §XI must include a holistic coherence pass** (not just code restructuring).

---

### §X.1. COMPETITIVE & LANDSCAPE RESEARCH

> Internal state understood — now look outward.
>
> **Claude execution note**: Use `WebSearch` for competitor discovery. Use `WebFetch` to analyze competitor websites/app store listings. If web search is unavailable, use `AskUserQuestion` to ask the user to list 2–3 competitors. Skip §X.1.1–X.1.3 if the developer explicitly says they do not care about competitors — go straight to §X.2 with only §X.0 findings as input.

#### X.1.1 — Direct Competitor Inventory

```
Competitor-{N}: {Name}
  URL / Platform:       {where it lives}
  Overlap:              {which of this app's features it also covers}
  Differentiation:      {what it does that this app does not}
  Weakness:             {where this app is already stronger}
  UX Model:             {key interaction patterns}
  Monetization:         {how it sustains itself}
  Visual Tier:          Prototype / Functional / Polished / Premium
  User Sentiment:       {from reviews, forums, app stores — recurring themes}
```

**Minimum**: 3 competitors for apps with commercial intent. 2 for community/free tools. 0 only for genuinely novel concepts.

#### X.1.2 — Feature Gap Matrix

```
| Feature / Capability          | This App       | Competitor A | Competitor B | Competitor C | Opportunity |
|-------------------------------|----------------|-------------|-------------|-------------|-------------|
| {e.g. "Offline mode"}        | ✗ Missing      | ✓           | ✗           | ✓           | HIGH |
| {e.g. "Export to PDF"}       | ✓ Basic        | ✓ Advanced  | ✓ Basic     | ✓ Advanced  | UPGRADE |
| {e.g. "AI-assisted input"}   | ✗ Missing      | ✗           | ✗           | ✗           | DIFFERENTIATOR |
| {e.g. "Search"}              | ✓ Broken UX    | ✓ Excellent | ✓ Good      | ✓ Good      | CRITICAL UPGRADE |
| {e.g. "Custom themes"}       | ✓ Unique       | ✗           | ✗           | ✗           | STRENGTH |
```

**Row classifications**:
- `PARITY` — table-stakes, must-have, already at competitive quality
- `UPGRADE` — feature exists but competitors do it noticeably better
- `CRITICAL UPGRADE` — feature exists but is so far behind that it hurts credibility
- `OPPORTUNITY` — users want it, some competitors have it, this app does not
- `DIFFERENTIATOR` — nobody offers it yet
- `STRENGTH` — this app does it and competitors do not — protect and promote
- `OVER-SERVED` — this app has it, nobody else does, unclear if users value it

**The distinction between UPGRADE and new OPPORTUNITY is crucial.** Upgrading an existing feature is almost always higher-leverage than adding a new one — the user base, UX patterns, and data model already exist.

#### X.1.3 — User Signal Synthesis

Collect all available signals about what users actually want:

| Signal Source | What to Extract |
|---------------|-----------------|
| **User feedback** | Explicit requests, complaints, praise |
| **App store reviews** | Recurring themes in positive and negative reviews |
| **Community discussions** | Problems described, workarounds used, wishes |
| **Support tickets** | Patterns — features generating most confusion or requests |
| **Usage analytics** (if available) | Most-used features, abandoned flows, bounce points |
| **Competitor reviews** | What users praise/criticize about alternatives |

**Output**: Ranked list of **User-Validated Needs** (appearing in ≥2 independent sources). Single-source requests listed separately as **Unvalidated Signals**.

#### X.1.4 — Technology & Approach Research

For each high-priority improvement or new feature:
```
Improvement: {name}
  Approaches Considered:
    1. {approach} — Pros: {X} / Cons: {Y} / Effort: {Z}
    2. {approach} — Pros: {X} / Cons: {Y} / Effort: {Z}
    3. {approach} — Pros: {X} / Cons: {Y} / Effort: {Z}
  Recommended Approach: {N} — Rationale: {why this wins for this app's constraints}
  Architecture Impact: {what existing code must change}
  Risk Assessment: {integration risk, performance risk, UX risk}
```

**All recommendations must respect §0 Architectural Constraints.** An approach requiring a constraint change is an *architectural proposal*, clearly marked as such — separate from standard recommendations.

---

### §X.2. IMPROVEMENT PRIORITIZATION

> Existing feature improvements compete with new features on equal terms. Correct for "new feature bias" — an existing daily-use feature has a larger impact surface than a new feature used weekly by some.
>
> **Claude execution note**: Present the Impact × Effort matrix to the user as a table. Wait for their reaction before producing the sequenced roadmap — they may disagree with assessments.

#### X.2.1 — Unified Improvement Inventory

Build a single list containing *every* potential improvement from *every* source:

| Source | Type | Examples |
|--------|------|----------|
| §X.0 Feature Health Audit | Existing feature improvement | ELEVATE, EVOLVE, CONSOLIDATE, REIMAGINE actions |
| §X.1 Competitive Research | Existing upgrade OR new feature | UPGRADE, CRITICAL UPGRADE, OPPORTUNITY, DIFFERENTIATOR |
| §X.1.3 User Signal Synthesis | Either | Validated user needs |
| Audit findings (§IV) | Existing feature fix | Outstanding MEDIUM/LOW findings |
| Developer's own roadmap | Usually new feature | Developer's planned ideas |
| §O Scenario Projection | Architectural pre-adaptation | Infrastructure work enabling future features |

**Every item classified**:
```
Item: {description}
  Type:         EXISTING-ELEVATE / EXISTING-EVOLVE / EXISTING-CONSOLIDATE / EXISTING-REIMAGINE / NEW-FEATURE / INFRASTRUCTURE / BUG-FIX
  Source:       {which analysis identified this}
  Feature(s):   {which existing feature(s) this affects, or "NEW: {feature name}"}
```

#### X.2.2 — Impact × Effort Matrix

| | LOW EFFORT | HIGH EFFORT |
|---|---|---|
| **HIGH IMPACT** | **DO FIRST** — quick wins, ship this week | **PLAN CAREFULLY** — strategic investments |
| **LOW IMPACT** | **FILL GAPS** — low-hanging fruit for downtime | **DEFER OR DROP** — revisit when effort drops or impact rises |

```yaml
Item: {description}
  Type:        {classification}
  Source:      {origin}
  Impact:      HIGH / MEDIUM / LOW — {specific reason tied to user value}
  Effort:      HIGH / MEDIUM / LOW — {specific scope assessment}
  Quadrant:    {DO FIRST / PLAN CAREFULLY / FILL GAPS / DEFER}
  Dependencies: {what must be done first}
  # For existing feature improvements:
  Current pain:    {what users experience today}
  Risk of inaction: {what happens if this stays as-is for 6 months}
```

#### X.2.3 — Strategic Sequencing

```
Phase 1 — Foundation (Sprint 1–2):
  Goal: {what user-facing improvement this phase delivers}
  Items: {list with IDs and types}
  Unlocks: {what becomes possible after this phase}
  
Phase 2 — Core Value (Sprint 3–5):
  Goal: {what user-facing improvement this phase delivers}
  Items: {list with IDs and types}
  Depends on: Phase 1 items {specific IDs}
  
Phase 3 — Differentiation (Sprint 6–8):
  Goal: {what user-facing improvement this phase delivers}
  Items: {list with IDs and types}
  Depends on: Phase 2 items {specific IDs}
  
Phase 4+ — Growth & Polish:
  {Continue as needed}
```

**Sequencing rules** (follow in this priority order):
1. Bug fixes first — always. New features on a broken foundation compound technical debt.
2. Existing feature CRITICAL UPGRADEs before new features — a feature that embarrasses the app every time a user touches it is higher priority than any feature that does not exist yet.
3. CONSOLIDATE actions early — merging overlapping features simplifies codebase and mental model.
4. Infrastructure before features that depend on it.
5. ELEVATE actions alongside new features — bringing old features to current standard can be batched efficiently when already in that area of code.
6. User-validated needs before developer-intuited features — unless strong domain expertise applies.
7. Differentiators before parity features — when possible.
8. REIMAGINE actions are planned like new features — they need the same research, design, and testing rigor.

#### X.2.4 — Experimentation Protocol

For improvements where the right approach is genuinely uncertain:

```
Experiment: {question}
  Hypothesis: {specific, falsifiable}
  Minimum Viable Test: {smallest possible implementation that tests the hypothesis}
  Success Metric: {what to measure and what threshold constitutes success}
  Time-Box: {maximum time before evaluating}
  Kill Criteria: {what result means stop and try different approach}
  Rollback Plan: {how to cleanly remove the experiment if it fails}
```

**When to experiment vs commit**: Experiment when the improvement is high-effort AND the impact is uncertain. Commit when the improvement is well-understood (bug fix, parity feature, user-validated need with clear solution).

---

### §X.3. R&D ROADMAP DELIVERABLE

```yaml
R&D ROADMAP — {App Name}

EXISTING FEATURE HEALTH:
  At current standard:       {N}/{total} ({%})
  Significant drift:         {N}
  Coherence rating:          {HIGH/MED/LOW/CRITICAL}
  Actions: ELEVATE({N}), EVOLVE({N}), CONSOLIDATE({N}), REIMAGINE({N}), DEPRECATE({N})

COMPETITIVE POSITION:
  Strengths:                 {top 3}
  Existing features behind:  {N UPGRADE items}
  Missing features:          {N OPPORTUNITY + DIFFERENTIATOR items}
  Unique strengths:          {N STRENGTH items}

USER-VALIDATED PRIORITIES:
  1. {need} — Sources: {signals}
  2. {need} — Sources: {signals}
  3. {need} — Sources: {signals}

UNIFIED INVENTORY:
  Total items: {N} — Existing({N}, {%}) / New({N}, {%}) / Infrastructure({N}, {%})

PHASES:
  Phase 1: {goal} — {N items} — {effort estimate}
  Phase 2: {goal} — {N items} — {effort estimate}
  Phase 3: {goal} — {N items} — {effort estimate}

EXPERIMENTS: {N} defined — {total time-box}

DEFERRED: {items not being pursued, with rationale}
```

---

## XI. APP POLISHING & RESTRUCTURATION PROTOCOL

> **Transforms an app that has become messy, incoherent, or fragmented** through organic growth back into a unified, intentional product — then polishes it to the quality it deserves. This restructures the whole app: logic, navigation flow, design language, mental model, and codebase.
>
> **The problem**: You build a solid v1, then add features, fix bugs, add more features, refactor one part, add another feature. After enough iterations, the app has more features and fewer bugs — but it no longer feels like *one thing*.
>
> **Core principle**: You cannot restructure what you do not understand. §XI.0 (comprehension) is mandatory. Always run it first.
>
> **Prerequisite**: §0 + §I classification. Prior audit strongly recommended. If no prior audit exists, do Parts 1–3 first.
>
> **Execution order**: §XI.0 (understand) → §XI.1 (inventory) → §XI.2 (polish passes) → §XI.3 (code restructure) → §XI.4 (architecture) → §XI.5 (quality gates) → §XI.6 (deliverable).

> **Claude:** This section is ~500 lines. Work through one subsection at a time. Here's the map:
>
> | Subsection | What It Does | Skip When |
> |------------|-------------|-----------|
> | **§XI.0** Comprehension | Reads and internalizes the app as a product | MANDATORY — always run first |
> | **§XI.1** Pre-Polish Inventory | Maps all coherence fractures and rough edges | Always run |
> | **§XI.2** Polish Passes (0–6) | 7 passes from structural to fine-grained | Passes 3–6 if time-limited |
> | **§XI.3** Code Restructure | File structure, modules, naming, architecture | If user only wants visual polish |
> | **§XI.4** Architecture Evolution | Incremental arch improvements without rewrites | If app is small (<500 lines) |
> | **§XI.5** Quality Gates | Verifies polish preserved behavior | MANDATORY — always run after changes |
> | **§XI.6** Deliverable | Structured output of all changes | Always run |
>
> **Minimum viable path**: §XI.0 + §XI.1 + §XI.2 (Passes 0, 1, 1.5) + §XI.5

---

### §XI.0. DEEP COMPREHENSION PHASE — MANDATORY BEFORE ANY CHANGE

> **The failure mode of restructuration is not "broke something"** — quality gates catch that. The failure mode is "restructured the app into something clean but soulless." This phase prevents that by forcing the auditor to internalize the app as a *product*, not just code.

#### XI.0.1 — Purpose & Identity Internalization

> **Claude execution note**: Fill this by reading the entire codebase first. Derive these answers from understanding the whole app — do not copy §0. Output the completed record to the user and ask: "Does this accurately capture what your app is trying to be?" Adjust based on their response before proceeding.

Answer these before any restructuration:

```yaml
APP COMPREHENSION RECORD:

  Core Purpose:
    # One sentence. "It helps [who] do [what] when [context]"

  User Mental Model:
    # How does the user think about this app? What's its "shape" to them?

  Core Loop:
    # The user's primary repeated interaction — the heartbeat

  Emotional Contract:
    # What the user feels when the app works well

  Design Personality:
    # If this app were a person, how would it talk?

  Best-in-App Standard:
    # Which part of this app is the best? This is the target — everything else rises to this level.

  Growth Archaeology:
    # Reconstruct the probable development timeline from code evidence:
    # - Which features were built first? (simpler patterns, older conventions)
    # - Which were added later? (newer patterns, sometimes better, sometimes hastier)
    # - Where did the developer change their mind mid-implementation?
    # - Where did a quick fix become permanent?
    # This is understanding, not judgment. Every "messy" part has a history.
```

**This record is the North Star.** Every §XI decision is tested against it: "Does this change make the app more like what's described here, or less?"

#### XI.0.2 — Coherence Fracture Analysis

> **Claude execution note**: This diagnostic drives all of §XI.2 Pass 1.5. Be thorough — every fracture you miss will survive restructuration. Present fractures to the user grouped by type and ask for confirmation before proceeding to fixes.

Identify *exactly* where and how coherence broke down. Each fracture becomes a restructuration task.

**Five fracture types to map:**

```yaml
LOGIC FRACTURES — the app's internal logic contradicts itself
  L-{N}:
    Where:     {features/flows involved}
    History:   {how it probably happened}
    Impact:    {what the user experiences — confusion, distrust, workaround}
    Example:   {specific instance}

FLOW FRACTURES — the user's journey hits seams
  F-{N}:
    Where:     {navigation paths/transitions}
    History:   {how it happened}
    Impact:    {disorientation, dead ends, unexpected jumps}

DESIGN FRACTURES — different visual eras coexist
  D-{N}:
    Era A:     {visual conventions of the older part}
    Era B:     {visual conventions of the newer part}
    Boundary:  {where the user crosses from one era to the other}

CONVENTION FRACTURES — same problem solved differently in different places
  C-{N}:
    Pattern A: {how it's done here} — used in: {list}
    Pattern B: {how it's done there} — used in: {list}
    Canonical: {which one should win, and why}

MENTAL MODEL FRACTURES — the app's conceptual model is inconsistent
  M-{N}:
    Model A:   {what this part implies about how things work}
    Model B:   {what that part implies — contradicting Model A}
    Example:   {specific instance}
```

#### XI.0.3 — Unified Vision Statement

> **Claude execution note**: Write this and present it to the user. This becomes the North Star for every change in §XI. Reference it explicitly when making major decisions. If the user revises it, update all downstream work.

Write a single paragraph describing what this app should feel like when restructuration is complete:

```yaml
UNIFIED VISION — {App Name}:
  # A paragraph describing the app as it should be. What it feels like to use.
  # How it flows. What its personality is. What makes it coherent.
```

**Reference this vision explicitly in every major restructuration decision.** When in doubt: "Does this change bring us closer?"

---

### §XI.1. PRE-POLISH INVENTORY

#### XI.1.1 — Current State & Quality Target

```yaml
App State at Polish Start:
  Version:              {from §0}
  Outstanding CRITICAL: {count — must fix BEFORE polish begins}
  Outstanding HIGH:     {count — fixed in Pass 1}
  Debt Zones:           {3–5 worst areas: technical, design, and code}

Quality Baseline → Target (rate 1–5):
  Correctness:    {__}/5 → {__}/5
  Robustness:     {__}/5 → {__}/5
  Performance:    {__}/5 → {__}/5
  Visual Polish:  {__}/5 → {__}/5
  Code Quality:   {__}/5 → {__}/5
  UX Clarity:     {__}/5 → {__}/5
  Accessibility:  {__}/5 → {__}/5
```

#### XI.1.2 — Feature Preservation Ledger (Refresh)

Refresh from prior audit or build now. **Every named feature** gets an entry:

```yaml
Feature: {name}
  Status:           WORKING / PARTIALLY WORKING / BROKEN
  Tested:           YES / NO
  Polish priority:  HIGH / MEDIUM / LOW / SKIP
  Restructure:      YES ({reason}) / NO
  Risk during work: HIGH (shared state) / MEDIUM (complex) / LOW (isolated)
```

**The ledger is the contract**: Every WORKING feature must remain working after every pass. Verify after each pass.

---

### §XI.2. SYSTEMATIC POLISH PASSES

> Passes are ordered foundational → cosmetic. Surface polish on a broken foundation is waste. Each pass has a single focus and a verification step.
>
> **Claude execution note**: Work through one pass at a time, verify, then proceed. **Pass 1.5 is the most important** — it's where coherence is restored. Passes 2–6 are standard polish. If the user is time-limited, Passes 0 + 1 + 1.5 are the minimum viable restructuration.

#### Pass 0 — Critical Fix Pass *(mandatory if outstanding CRITICAL findings exist)*

**Scope**: Fix every CRITICAL-severity finding from the audit. Nothing else.
**Why first**: A CRITICAL finding means wrong results, data loss, or exploitable security hole. Polishing an app with CRITICAL bugs is waste.

```
For each CRITICAL finding:
  Finding ID:     F-{XXX}
  Fix:            {specific code change}
  Verification:   {how to confirm the fix works}
  Regression check: {which features in the ledger could be affected — verify each one}
```

**Exit criteria**: Zero CRITICAL findings. Feature Preservation Ledger re-verified.

#### Pass 1 — Structural Integrity Pass

**Scope**: Fix HIGH-severity findings. Resolve data integrity issues. Ensure every feature works correctly under normal conditions.

**Checklist**:
- [ ] All HIGH findings from audit resolved
- [ ] All domain rules verified against §0 — every formula produces the correct output
- [ ] All state transitions are clean — no orphaned state, no zombie listeners, no stale closures
- [ ] All persistence operations are safe — write-read round-trip verified, quota handling confirmed
- [ ] All error paths are handled — no uncaught exceptions in any user-reachable path
- [ ] Feature Preservation Ledger re-verified — every WORKING feature still works

**Exit criteria**: App is *correct and robust* under normal usage. Not yet polished, not yet restructured — but trustworthy.

#### Pass 1.5 — Holistic Coherence Restructuration *(the core of §XI — driven by the Fracture Map)*

> **Claude execution note**: This is where the real restructuration happens. Work through fractures one at a time, verifying after each. When modifying app flow or mental model, explain your reasoning to the user first — these are high-impact changes.

**Scope**: Heal every fracture from §XI.0.2. Operates at the *app level* — changes how features relate, how the user moves through the app, how the conceptual model works.

**Why before visual polish**: Visual coherence is impossible on a fragmented foundation.

**1.5a — Logic Fracture Healing**: For each L-{N} — determine canonical logic, make specific changes, verify both halves now agree.

**1.5b — Flow Restructuration**: Map current navigation vs. ideal navigation (based on user mental model from §XI.0.1). For each seam:
```yaml
Change F-{N}:
  Current:    {what happens now}
  Target:     {what should happen — tied to user mental model}
  Rationale:  {from Unified Vision}
  Complexity: LOW / MEDIUM / HIGH
```

**1.5c — Convention Unification**: For each C-{N} — choose canonical pattern, list every instance to update, assess migration risk.

**1.5d — Mental Model Alignment**: For each M-{N} — choose single canonical model, identify which features change their conceptual approach, assess user disorientation risk.

**1.5e — Design Era Unification**: For each D-{N} — identify target era (current/best), list every element to update.

**Exit criteria**: A user can navigate the entire app without hitting a seam. Test by narrating a user journey — if you say "and here the pattern changes," the pass is not complete.

#### Pass 2 — Visual Coherence Pass

**Scope**: Make the design system coherent — consistent throughout, not "prettier."

- **2a — Design Token Consolidation**: For each one-off value → map to nearest token or document as intentional exception.
- **2b — Component Variant Unification**: List all instances of each component type → unify variants that should match.
- **2c — Color System**: Every color mapped to a token or flagged as rogue. Theme completeness. Contrast ratios verified.
- **2d — Typography**: Sizes, weights, line-heights mapped to a type scale. One style per heading level.
- **2e — Spacing Rhythm**: Vertical rhythm verified. Horizontal alignment verified.

**Exit criteria**: Every visual decision traceable to a token or an intentional exception.

#### Pass 3 — Interaction Polish Pass

**Scope**: Make every interaction feel responsive, intentional, and complete.

- **3a — State Change Communication**: Every action → visible feedback within 100ms. Loading/success/failure states for all async ops.
- **3b — Transition & Motion**: Consistent durations and easing curves. Logical spatial origins. `prefers-reduced-motion` respected. Motion budget ≤2–3 simultaneous animations.
- **3c — Empty & Edge States**: Designed empty states. Helpful error messages. Skeleton loaders matching content shape.
- **3d — Micro-Interactions**: Button press feedback. Styled focus rings. Hover states with cursor changes. Distinct selection states.

**Exit criteria**: Zero moments of "that felt unfinished" when moving through the app.

#### Pass 4 — Copy & Content Polish Pass

**Scope**: Every word is clear, consistent, and matches the app's voice.

- **4a — Terminology Unification**: One word per concept.
- **4b — Voice Alignment**: Every label, tooltip, error, and empty state matches the brand voice guide.
- **4c — Microcopy Optimization**: Specific CTAs. Error messages that tell users what to do. Tooltips that add information. Confirmation dialogs that explain consequences.

**Exit criteria**: The interface reads as if written by someone who understood the user.

#### Pass 5 — Performance Polish Pass

**Scope**: Make the app feel fast.

- Render jank eliminated on core interactions
- Expensive computations memoized or debounced
- Assets optimized (format, dimensions, lazy loading)
- Startup optimized — critical path minimized, non-critical deferred
- Perceived performance: optimistic UI, skeleton screens, progressive loading

**Exit criteria**: Common operations feel instant. Complex operations feel responsive. Every interaction acknowledged within 100ms.

#### Pass 6 — Accessibility Polish Pass

**Scope**: Beyond compliance — genuinely usable by everyone.

- Keyboard navigation intuitive — tab order follows visual order, focus trapping in modals
- Screen reader coherent — landmarks, headings, ARIA labels tell a complete story
- Color is never the only information carrier
- Touch targets ≥44×44px on mobile
- Reduced motion fully respected

**Exit criteria**: Keyboard-only and screen reader users can accomplish every task without confusion.

---

### §XI.3. CODEBASE RESTRUCTURATION

> Pass 1.5 restructured the app's logic, flow, and mental model. This section ensures the *code* reflects that coherence.
>
> **Claude execution note**: Work in small, verifiable steps. Verify after each restructuring action. If the app is a single file, extract outward from safest (constants) to riskiest (state).

#### XI.3.1 — Principles

1. **Code structure mirrors app structure.** If the user thinks of three main areas, the code has three main modules. Module names match feature names.
2. **Restructure and add features separately.** Mixing them makes regressions undetectable.
3. **Every step independently verifiable.** Step 3 can be reverted without losing steps 1–2.
4. **Restructuring preserves behavior exactly.** Behavioral changes belong in §X.
5. **Clarity over cleverness.** A new developer reading the file tree should guess what each module does.

#### XI.3.2 — Dead Code Elimination

For each dead code block: location, type (UNREACHABLE / COMMENTED-OUT / UNUSED EXPORT / VESTIGIAL), confidence (CERTAIN / HIGH / MEDIUM), and removal verification.

**Rule**: Remove CERTAIN-confidence first. HIGH after developer confirmation. MEDIUM flagged and left.

#### XI.3.3 — Module & Component Restructuring

```yaml
Current Structure: {e.g. "Single App.jsx, 4200 lines, all components inline"}
Code-Concept Alignment: {how well current structure matches the product's conceptual model}

Target Structure:
  # Organized by product domain:
  # /features/banner-tracker/  — everything for tracking banners
  # /features/pull-history/    — everything for pull logging
  # /shared/                   — tokens, common components, utilities
  # /app/                      — root layout, navigation, global state
  Rationale: {why this structure — tied to user mental model from §XI.0.1}

Extraction Sequence:
  # Safest first: constants → pure utils → hooks → leaf components →
  # composite components (bottom-up) → state management (last)
  Step 1: {what} — Risk: {L/M/H} — Verification: {check}
  Step 2: {what} — Risk: {L/M/H} — Depends on: {step 1}
```

#### XI.3.4 — State Architecture Restructuring

```yaml
Current: {e.g. "47 useState calls, 12 levels of prop-drilling, 3 context providers"}
Target:  {e.g. "Domain state in useReducer + context, UI state local, derived via useMemo"}

Migration Rules:
  - Change state shape and consumers separately, not simultaneously
  - Introduce new system alongside old, migrate consumers one at a time, remove old
  - Every intermediate state (old + new coexisting) must be fully functional

Steps:
  Step 1: {migration} — Affected: {components} — Verify: {output unchanged}
  Step 2: ...
```

#### XI.3.5 — Dependency & Import Restructuring

Resolution order (safest first): Remove unused imports → Standardize import order → Break circular imports (verify each) → Replace heavy dependencies (behavioral verification required).

#### XI.3.6 — API & Interface Normalization

For inconsistent internal APIs (component props, function signatures, hook interfaces):
```yaml
Inconsistency: {e.g. "onClose vs handleClose vs dismiss — all mean the same thing"}
  Standard:    {canonical name}
  Instances:   {locations to update}
```

**Order**: Rename → Reshape → Remove. Each step independently verified.

---

### §XI.4. ARCHITECTURE EVOLUTION

> For apps that need to grow beyond their current architecture. This is *evolving* the architecture to support new capabilities — distinct from restructuring (which preserves behavior).

```yaml
Architecture Evolution Plan:
  Current:     {from §0}
  Target:      {e.g. "Multi-file, Supabase backend, Vite build, auth + multi-user"}
  Horizon:     {timeline}

  Phase A — {name}:
    Prerequisite: {what must be true first}
    Deliverable:  {what the app can do after this that it could not before}
    Risk:         {data migration, feature regression, user disruption}
    Rollback:     {how to revert if it fails}
  Phase B — ...

Data Migration (when storage changes):
  Current schema:    {data shape in current system}
  Target schema:     {data shape in new system}
  Strategy:          {step-by-step migration path}
  Edge cases:        {corrupted data, declined migration, multi-device reconciliation}
  Fallback:          {old system continues working if migration fails}
```

---

### §XI.5. QUALITY GATES

#### Per-Step (after every individual change):
```
[ ] Feature Preservation Ledger: all WORKING features still work
[ ] No unintended visual changes outside this step's scope
[ ] Console: no new errors or warnings
[ ] Keyboard navigation still works
[ ] No new performance jank
```

#### Per-Pass (after completing an entire pass):
```
[ ] All per-step verifications passed
[ ] Target dimension improved (or held) — no other dimension degraded
[ ] Commit/checkpoint created — pass is independently revertible
```

#### Final Gate (§XI complete):

```
[ ] Every Quality Target from §XI.1.1 is met or exceeded
[ ] Feature Preservation Ledger: 100% of WORKING features still working
[ ] Zero CRITICAL or HIGH findings remain

COHERENCE VERIFICATION:
[ ] Every Logic Fracture from §XI.0.2 is healed — unified logic throughout
[ ] Every Flow Fracture is healed — user journey has no seams
[ ] Every Convention Fracture is healed — one pattern for each problem type
[ ] Every Mental Model Fracture is healed — one conceptual model throughout
[ ] Every Design Fracture is healed — one visual era throughout
[ ] The Unified Vision Statement (§XI.0.3) accurately describes the app as it now exists

POLISH VERIFICATION:
[ ] Design system is internally consistent — no rogue tokens, no orphaned styles
[ ] Copy is consistent — no terminology conflicts, no voice violations
[ ] Accessibility baseline met — WCAG 2.1 AA throughout
[ ] Performance baseline met — all core interactions within budget
[ ] Code quality baseline met — no dead code, consistent patterns, clear naming
[ ] Code structure mirrors product structure — a developer can navigate the code by thinking about features

HOLISTIC CHECK — the most important test:
[ ] A new user opening this app for the first time experiences ONE product
[ ] A developer opening this codebase for the first time can understand its organization in 5 minutes
[ ] The app's best feature and its worst feature are now within one quality tier of each other
[ ] The developer looks at the result and says: "This is still my app — but the version I always wanted it to be"
```

---

### §XI.6. POLISH & RESTRUCTURATION DELIVERABLE

```yaml
POLISH & RESTRUCTURATION REPORT — {App Name}

COMPREHENSION:
  Purpose:    {one sentence from §XI.0.1}
  Vision:     {one sentence from §XI.0.3}
  Root cause: {key insight about how fragmentation happened}

COHERENCE HEALED:
  Logic({N}) | Flow({N}) | Design({N}) | Convention({N}) | Mental Model({N})
  Coherence: {before} → {after}

QUALITY: Baseline → Target → Achieved
  Correctness:   {__} → {__} → {__}
  Robustness:    {__} → {__} → {__}
  Performance:   {__} → {__} → {__}
  Visual Polish: {__} → {__} → {__}
  Code Quality:  {__} → {__} → {__}
  UX Clarity:    {__} → {__} → {__}
  Accessibility: {__} → {__} → {__}

PASSES:
  0-Critical({N} fixes) | 1-Structural({N}) | 1.5-Coherence({N} fractures)
  2-Visual({N}) | 3-Interaction({N}) | 4-Copy({N}) | 5-Perf({N}) | 6-A11y({N})

CODE RESTRUCTURING:
  Dead code removed: {N lines} | Modules extracted: {N}
  Code-concept alignment: {before → after}
  State simplified: {describe} | APIs normalized: {N}

ARCHITECTURE: {phases completed, data migrated, next phase}

FEATURES: {N}/{N} verified | {N} regressions caught (resolved) | {N} improved

VISION CHECK: Does the app match the Unified Vision? {YES / PARTIALLY — gaps: ...}
```
