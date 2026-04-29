---
name: sim-engine
description: >
  H5W simulation engine for the H5W unified system. Persona generation, state space mapping, walkthroughs, micro-H5W expansion, checkpoints, anti-exhaustion (50 Questions), research & study (§SIM.7). Loaded on demand by Chief Guide §TRIAGE.
---

> **MODULE: sim-engine** — Domain protocol for the H5W unified system.
>
> **Invoked when:** Chief Guide §TRIAGE detects simulation work — phrases like "simulate", "H5W", "as a user", "find issues", "walkthrough", "map states", "research the domain".
>
> **Receives:** Chief Guide §0 (filled), §I calibration (classified).
> **Uses:** Chief Guide §LAW, §FMT, §SRC, §REV, §VER, §DOC — do NOT re-derive.
> **Returns:** Findings/actions in §FMT format → H5W-QUEUE.md and H5W-LOG.md.
>
> **In §AUTO mode:** the §AUTO protocol (references/auto-mode.md) governs interactive vs autonomous behavior.
> See the §AUTO protocol (references/auto-mode.md) for FULL/GUIDED routing and the activation gate.

---

## §SIM — H5W SIMULATION ENGINE

The simulation engine is the brain of H5W. It generates a simulated user
population, maps the app's state space, walks personas through the app by
reading code, discovers issues through six lenses, and expands findings
through the micro-H5W loop.

### §SIM.1. Persona Generation

**Three mandatory personas (always generated):**

| ID | Type | Device | Expertise | Behavior | Purpose |
|----|------|--------|-----------|----------|---------|
| P1 | First-time | Mobile, slow 3G, small screen | None | Cautious, reads labels | Empty states, onboarding, unclear labels, first impressions |
| P2 | Power user | Desktop, fast, large screen | Expert | Rapid, uses shortcuts | Edges, efficiency, data limits, missing shortcuts |
| P3 | Hostile-env | Small screen, interrupted | Intermediate | Impatient, back-button | Error recovery, data loss, interrupted flows |

**Domain-specific personas (1–2 more, from §I.1):**

| Domain | Additional Persona | Focus |
|--------|--------------------|-------|
| Game companion | P4: Theorycrafting optimizer — tests formulas, boundary math, data density | Correctness at extremes |
| Game companion | P5: Casual collector — browsing, low commitment, visual-first | Scannability, delight |
| Medical | P4: Stressed clinician — time-critical, zero ambiguity, gloved hands | Clarity, touch targets, error cost |
| Productivity | P4: Admin for 50 users — bulk operations, edge permissions | Scale, batch actions |
| E-commerce | P4: Comparison shopper — rapid nav, tab-switching, price sensitivity | Speed, comparison flows |
| AI-powered | P4: Skeptical user — tests limits, questions outputs, probes failures | Failure modes, trust |

**Persona specification template:**
```yaml
PERSONA: P[N]
TYPE: first-time | power-user | hostile-env | [domain-specific name]
DEVICE: [concrete — "iPhone SE, 375×667, slow 3G" or "Desktop, 1920×1080"]
GOAL: [specific action — "add a team with 4 characters to compare DPS"]
BEHAVIOR: methodical | exploratory | impatient | careful | chaotic
ACCESSIBILITY: none | screen-reader | keyboard-only | reduced-motion | high-contrast
ENTRY POINT: [which route/screen they start from]
WALKTHROUGH SCRIPT: [sequence of actions this persona will attempt]
  1. [arrive at entry point]
  2. [first interaction]
  3. [core goal action]
  4. [disruption scenario]
  5. [edge scenario]
```

**Rules:**
- Goals must be specific. "Uses the app" is not a goal. "Adds a team with 4 characters" is.
- Devices must be concrete with dimensions. "Mobile" is not a device.
- At least one persona targets §0 Primary Device.
- At least one persona has an accessibility consideration.
- Walkthrough scripts are planned before execution — not improvised during.

**Worked example (game companion app):**
```yaml
PERSONA: P1
TYPE: first-time
DEVICE: Xiaomi 13T, 439×976 CSS, DPR 2.78, 4G
GOAL: Find and compare two characters' DPS
BEHAVIOR: exploratory — taps around, doesn't read instructions
ACCESSIBILITY: none
ENTRY POINT: / (home)
WALKTHROUGH SCRIPT:
  1. Arrive at home — what's visible? What invites interaction?
  2. Navigate to characters/teams — is the path obvious?
  3. Attempt to add two characters — can they find the add flow?
  4. Disruption: network drops mid-add — is data preserved?
  5. Edge: search for a character with special characters in name
```

### §SIM.2. State Space Mapping

Before walkthroughs, map the reachable state space by reading code.

**Step 1 — Enumerate screens:**
Read router config, navigation graph, AndroidManifest, or equivalent.
List every reachable screen with its route/path.

**Step 2 — State variables per screen:**
For each screen, identify every state variable that changes the render.

```yaml
Screen: /teams
  loading: boolean → skeleton vs content
  error: Error | null → content vs error message
  teams: Team[] → length determines:
    - 0: empty state
    - 1: single card
    - 2+: grid layout
  selectedTeam: string | null → list vs detail
  networkStatus: online | offline → live vs cached/stale
```

**Step 3 — Build transition matrix:**
```
FROM              → ACTION          → TO              → EDGE?  → HANDLER?
──────────────────────────────────────────────────────────────────────────
/teams:empty      → add team        → /teams:1-team   → —      → [CODE: Teams.jsx:42]
/teams:1-team     → delete team     → /teams:empty    → modal? → [CODE: Teams.jsx:68]
/teams:loaded     → network drop    → /teams:???      → YES    → ???
/teams:loaded     → resize < 440px  → /teams:mobile   → break? → [CODE: Teams.css:120]
/teams:detail     → back button     → /teams:loaded   → kept?  → ???
/teams:loading    → error response  → /teams:error    → retry? → [CODE: Teams.jsx:28]
```

**Step 4 — Mark investigation targets:**
- `???` in TO column → unknown behavior → **mandatory investigation**
- `YES` in EDGE column → known risk → **priority investigation**
- `???` in HANDLER column → no handler found → **likely crash/unhandled**
- Transitions with no code reference → dead path or missing implementation

**Worked example output:**
> State map for /teams: 6 states, 8 transitions.
> Investigation targets: 3 unknown (network drop, back-nav state,
> error→retry). 2 edge risks (responsive breakpoint, delete confirmation).
> Handler gaps: 2 (network drop, back-nav preservation).

### §SIM.3. Walkthrough Protocol

For each persona × each relevant entry point, execute the walkthrough script
by reading code as if running it in the persona's context. Apply all six
H5W lenses at four stages.

#### Stage 1 — ARRIVAL (what does the persona see on first render?)

Read the component that renders at this route. Trace from mount:
- What renders during loading? (Suspense, skeleton, spinner, blank?)
- What renders when data arrives? (first meaningful paint)
- What renders if data is empty? (empty state, or just... nothing?)
- What is the visual hierarchy? (what draws the eye first?)
- Where does focus land? (keyboard/screen-reader starting point)

Apply each lens:
```
How:   How does the page load? What's the sequence? Any flash/flicker?
Who:   Does P1 (first-time, mobile) understand what they're seeing?
Will:  Will P1 know what to do next? Is there a clear CTA?
What:  What's missing? (empty state text, loading skeleton, focus management)
When:  When does content appear? Is perceived performance acceptable?
Where: Where is P1's attention drawn? Is it the right place?
```

#### Stage 2 — INTERACTION (persona pursues their goal)

Follow the walkthrough script's action sequence through the code:
- Read the event handler for each interaction
- Trace state mutations from action to re-render
- Check validation logic for each input
- Check feedback for each action (confirmation, animation, state change)

Apply each lens:
```
How:   How does P1 perform the action? Steps? Click targets? Gesture areas?
Who:   Who else might try this differently? (keyboard vs touch, a11y routes)
Will:  Will the interaction succeed? What if input is edge-case?
What:  What feedback does P1 get? Immediate? Delayed? None?
When:  When does feedback arrive? Optimistic update? Spinner? Latency?
Where: Where does P1 go next? Is navigation clear? Dead ends?
```

#### Stage 3 — DISRUPTION (something goes wrong)

Inject failures from the walkthrough script:
- Network drop mid-action
- Back-button press during async operation
- Tab/app switch and return
- Error response from API
- Permission denial

Apply each lens:
```
How:   How does the app handle this failure? Error boundary? Fallback? Crash?
Who:   Who suffers most? (P3 hostile-env is the canonical victim)
Will:  Will recovery be possible? Data preserved? Session intact?
What:  What is lost? (form data, scroll position, navigation state)
When:  When does P3 learn something broke? Immediately? After retry?
Where: Where is the error surfaced? Toast? Inline? Console-only? Silent?
```

#### Stage 4 — EDGE (boundary push)

Push the persona's goal to extremes:
- 0 items, 1 item, 100+ items
- Empty string, max-length string, special characters, emoji
- Rapid repeated action (double-tap, spam-click)
- Concurrent state changes (two tabs, two users)
- Maximum data accumulation over time

Apply each lens:
```
How:   How does the app behave at this extreme? Graceful? Degraded? Crash?
Who:   Who realistically hits this? P2 power user is the canonical edge-finder.
Will:  What's the worst realistic outcome? Data loss? Security? Embarrassment?
What:  What exactly breaks? (specific component, function, render)
When:  When does the edge trigger? First time? After accumulation? Specific sequence?
Where: Where does it manifest? (component, API call, state store, render output)
```

#### Collation

After all personas complete all walkthroughs:
1. Group findings by screen/component location.
2. Tag findings appearing across 2+ personas → priority boost.
3. Identify persona-unique findings → context-specific gaps.
4. Format all findings using §FMT.
5. Enter all findings into H5W-QUEUE.md.
6. Sort by §V.2 priority rules.

**Pacing (§AUTO Rule 0b):** ONE persona per response. After each persona,
write findings to H5W-QUEUE.md, then `NEXT: walkthrough persona P[N+1]`.
Don't attempt all personas in a single response — timeout guaranteed.

### §SIM.4. Expansion Protocol (Micro-H5W)

After every fix — from any module, any phase — apply all six lenses to the
fix itself. This is the expandantic mechanism: each fix seeds further investigation.

**Micro-H5W template:**
```
MICRO-H5W ON FIX F-[NNN] — [file:line]
──────────────────────────────────────────
How   → Does this fix interact with adjacent code?
        Action: check imports and consumers of the modified file.
        Result: [list affected files or "no consumers"]

Who   → Is anyone else affected by this change?
        Action: check components/functions that share state with this code.
        Result: [list shared state consumers or "isolated"]

Will  → Could this cause a regression?
        Action: trace the logic path through the fix. Check boundary inputs.
        Result: [describe traced path + conclusion]

What  → Does this fix reveal an adjacent issue?
        Action: now that this is fixed, re-read surrounding code.
        Result: [describe adjacent issue or "none found"]

When  → Could this fix behave differently under other states?
        Action: check what happens when state is empty, null, error, max.
        Result: [list states checked + any issues]

Where → Does the same pre-fix pattern exist elsewhere?
        Action: grep the codebase for the pattern that was fixed.
        Result: [list matches with file:line or "unique instance"]
        → If 3+ matches: invoke MOD-SCOP for systematic fix.
──────────────────────────────────────────
New findings: [F-NNN, F-NNN] → H5W-QUEUE.md
No findings: [proceed to next in queue]
```

**Worked example:**
```
MICRO-H5W ON FIX F-012 — components/TeamCard.jsx:84
──────────────────────────────────────────
How   → TeamCard is imported by TeamsPage.jsx and TeamCompare.jsx.
        Both render TeamCard with the same props interface.
Who   → TeamCompare.jsx also passes team.members — same empty risk.
Will  → Traced: TeamCompare renders cards side-by-side. If both teams
        have 0 members → two empty states side by side → confusing layout.
What  → Adjacent issue: TeamCompare has no "both empty" layout handling.
        → NEW FINDING F-018.
When  → Checked: empty, 1 member, 10 members — all render correctly now.
Where → Grep for `.members.map(` without empty check:
        - TeamCompare.jsx:62 — SAME PATTERN → F-018
        - CharacterList.jsx:34 — SAME PATTERN → F-019
        → 3 matches → consider MOD-SCOP for systematic fix.
──────────────────────────────────────────
New findings: F-018 (TeamCompare empty), F-019 (CharacterList empty)
```

### §SIM.5. Checkpoint Protocol

**Stop and report when ANY trigger fires:**

| Trigger | Standard Mode | Continuous Mode |
|---------|--------------|-----------------|
| Expansion cycles since last checkpoint | 3 | 5 |
| Files modified since last checkpoint | 5 | 10 |
| T3 decision encountered | Immediate | Immediate |
| Queue empty | **Continuous Improvement Loop** (see below) | **Continuous Improvement Loop** |
| Runway limit hit (§AUTO) | Session end | Session end |
| User interrupt | Immediate | Immediate |

### Queue Empty ≠ Done — The Continuous Improvement Loop

When the queue empties after fixing findings, the CODE HAS CHANGED since the
original simulation. Fixes expose new issues. New code paths are reachable.
The app is never "done" — there is always more to improve.

**An app is never finished. Claude runs out of runway, not work.**

```
QUEUE EMPTY PROTOCOL:
  1. Queue empties after fixes.

  2. RE-SCAN (always — no exceptions):
     a. Re-read all files modified this session.
     b. Run targeted simulation on modified files:
        - Stage 1 + 2 with P1 (first-time) and P3 (hostile-env)
     c. New findings? → queue them, continue fixing.

  3. SCOPE EXPANSION (if re-scan found nothing):
     a. Expand scope to adjacent files (imports/consumers of modified files)
     b. Run walkthrough on expanded scope
     c. New findings? → queue them, continue fixing.

  4. DEPTH ESCALATION (if expansion found nothing):
     a. Shift from bugs → polish → enhancements → optimizations
     b. Run deeper analysis:
        - MOD-CODE §D3 (optimization) on hot paths
        - MOD-DESG quick pass (visual consistency)
        - §P.5 (temporal accumulation — what breaks in 6 months?)
        - §W.3 (accessibility gaps)
        - §W.4 (expertise mismatch — onboarding, progressive disclosure)
     c. New findings? → queue them, continue fixing.

  5. RESEARCH & STUDY (§SIM.7 — when depth escalation exhausted):
     a. Shift from fixing/polishing → learning and building
     b. R1: Domain deep dive — what are the standards?
     c. R2: Competitive analysis — what do others do better?
     d. R3: Audience deep dive — what do users actually want?
     e. R4: Technology research — best approach for each planned feature
     f. R5: Design research — patterns that elevate the app
     g. R6: Convert ALL research into concrete enhancement findings
     h. Build the highest-value items (if §AUTO FULL)

  6. ONLY stop when hitting a RUNWAY LIMIT (see below).
```

### Runway Limits (the only real termination triggers)

The system never stops because it thinks it's "done." It stops because
it hits a physical constraint:

| Runway Limit | What Happens |
|-------------|-------------|
| **Context window full** | Compact, write progress report, indicate "resume with more context" |
| **All remaining items are T3** | Nothing Claude can do alone. Report and wait. |
| **Self-correction failures > 5** | System is stuck. Report and wait. |
| **Severity floor reached** | All remaining findings are LOW/enhancement AND user set a severity floor. Otherwise keep going. |
| **Time budget exhausted** | If user said "run for 2 hours" — stop at 2 hours. |
| **User returns** | Switch to interactive. Present report. |

**There is no "truly done" trigger.** If context allows, time allows, and
there are improvements to make at any severity level — keep going. Shift
from fixing critical bugs → high → medium → low → enhancements → polish →
optimizations → new features → deeper polish → accessibility → performance
tuning → documentation → code cleanup → test coverage.

The trajectory is: **Survive → Function → Polish → Excel → Delight.**
Claude works down this ladder as far as runway allows.

### §SIM.6. Anti-Exhaustion Protocol — "I'm Out of Ideas" Is a Lie

Claude's #1 autonomous failure mode is declaring "no more findings" when the
reality is Claude stopped looking. This section exists to prevent that.

**Rule: "I have no more findings" is NEVER a valid state.** It means Claude
hasn't looked hard enough. When you feel the urge to say "analysis complete"
or "no issues found" — that is the signal to use this protocol, not to stop.

**The 50 Questions — ask these before EVER declaring queue empty:**

LAYER 1 — Things you probably missed:
```
 1. Did I check every empty state? (0 items on every screen)
 2. Did I check every error state? (API fail on every fetch)
 3. Did I check every loading state? (slow network on every async op)
 4. Did I check max data? (100+ items, max-length strings)
 5. Did I check special characters? (emoji, RTL, HTML in user input)
 6. Did I check viewport extremes? (320px, 440px, 1920px, landscape)
 7. Did I check keyboard navigation? (tab through every interactive element)
 8. Did I check color contrast? (every text/background pair)
 9. Did I check dark mode? (every screen, every component)
10. Did I check the first-time experience? (no data, no history, no prefs)
```

LAYER 2 — Things you forgot to think about:
```
11. What happens when the user presses Back at every screen?
12. What happens when the user rotates the device mid-action?
13. What happens when two tabs/instances are open simultaneously?
14. What happens when localStorage/storage is full?
15. What happens when the app is killed and restored?
16. What happens when a dependency updates and breaks the API?
17. What happens to this code in 12 months with 10x more data?
18. What happens if the user copies/pastes into every input?
19. What happens if the user uses browser autofill?
20. What happens if JavaScript fails to load? (progressive enhancement)
```

LAYER 3 — Quality dimensions you haven't audited yet:
```
21. Is every animation under 300ms? Are any janky?
22. Is every touch target at least 44px/48dp?
23. Are all images lazy-loaded? Do they have alt text?
24. Are all strings externalized? (i18n readiness)
25. Is there any hardcoded data that should be configurable?
26. Are there console.log/print statements left in production code?
27. Is every CSS variable actually used? Any orphaned tokens?
28. Is every import actually used? Any dead imports?
29. Is every exported function actually imported somewhere?
30. Are all event listeners cleaned up on unmount/destroy?
```

LAYER 4 — Polish nobody asked for but users notice:
```
31. Do focus rings appear correctly on keyboard nav?
32. Is there a favicon? App icon? Meta tags?
33. Is the page title correct on every route?
34. Do links have meaningful text (not "click here")?
35. Is scroll position preserved on back navigation?
36. Is there a 404 page?
37. Is there a loading indicator on initial app load?
38. Do numbers format correctly for locale? (1,000 vs 1.000)
39. Is there a way to undo destructive actions? (delete, clear)
40. Is the README accurate? Would a new developer understand?
```

LAYER 5 — Meta-improvements:
```
41. Can any two components be merged without losing clarity?
42. Can any component be split to improve reusability?
43. Can any utility function be generalized for broader use?
44. Can any magic number become a named constant?
45. Can any callback chain become async/await?
46. Can any imperative DOM manipulation become declarative?
47. Can any inline style become a design token?
48. Can any copy be made clearer, shorter, or more helpful?
49. Can any error message tell the user what to DO, not what went wrong?
50. Can any feature be made faster with caching, memo, or preloading?
```

LAYER 6 — Delivery & infrastructure (§DELIVER):
```
51. Can the user actually build this project from a fresh clone?
52. Is there a CI/CD pipeline? Does it produce a working artifact?
53. Is the artifact installable/deployable? (APK installs, URL loads, etc.)
54. Is signing/deployment configured? Or just documented?
55. Does the README explain build, run, test, AND deploy?
```

**How to use:** When the queue empties and re-scan finds nothing, go through
these 50 questions one by one against the actual codebase. Each question is
a concrete investigation. Most will produce at least one finding.

**Severity:**
- Layer 1–2: HIGH to MEDIUM (real bugs)
- Layer 3: MEDIUM to LOW (quality gaps)
- Layer 4: LOW to ENHANCEMENT (polish)
- Layer 5: ENHANCEMENT (optimization)

**After the 50 Questions → activate §SIM.7 (Research & Study Protocol).**

**This protocol is mandatory.** Whenever Claude reaches "no findings," it MUST
run through at minimum Layers 1–3 (30 questions) before any report or shift.
Skipping is an anti-pattern: **Premature Completion.**

**Premature Completion is the worst anti-pattern in the system.** It wastes
more user trust than any bad fix. A bad fix can be reverted. Stopping early
means the user comes back to an app that still has obvious issues — issues
Claude would have found in 5 minutes with the 50 Questions.

### §SIM.7. Research & Study Protocol — Learn the Domain, Improve the App

**Purpose:** Claude actively researches the app's domain, competition, audience,
and best practices — then converts that research into concrete improvements
and new features. This is not optional inspiration. This is structured
investigation with required outputs.

**When this activates:**
- After §SIM.6 (50 Questions) when code-level improvements are exhausted
- When user says "research and improve", "study the domain", "what are we missing"
- In §AUTO mode: automatically after Layer 5 of 50 Questions
- In §BUILD B1 (Discovery): to inform architecture and feature decisions
- Anytime Claude needs domain knowledge it doesn't have

**This protocol uses `WebSearch` and `WebFetch` extensively.**
If web search is unavailable, Claude uses its training knowledge tagged
`[UNVERIFIED]` and asks the user to validate before acting on it.

---

#### R1. Domain Deep Dive — Understand the World the App Lives In

**Goal:** Become an expert in the app's domain, not just its code.

```
DOMAIN RESEARCH:
  Search: "[domain] best practices [year]"
  Search: "[domain] common user complaints"
  Search: "[domain] UX patterns"
  Search: "building [app type] what users expect"
  Search: "[domain] accessibility requirements"

  For each result:
    → Extract concrete patterns, standards, or expectations
    → Tag: [WEB: source, date]
    → Compare against current app: does it meet this standard?
    → Gap found? → Finding in H5W-QUEUE.md as enhancement
```

**Domain-specific research templates:**

| Domain | What to Research |
|--------|-----------------|
| Game companion | Meta builds, community calculators, popular tools, game wiki structure, theorycraft forums, what data players track, how top companion apps present DPS/stats |
| Medical/Health | Clinical workflow standards, accessibility for medical contexts, regulatory requirements (HIPAA/GDPR), what clinicians expect from tools, error tolerance standards |
| Productivity | GTD/workflow methodologies, keyboard-first design, bulk operation patterns, integration expectations, what power users demand |
| E-commerce | Checkout conversion patterns, trust signals, payment UX, comparison features, mobile shopping patterns |
| Social | Community moderation patterns, notification design, content discovery, engagement without addiction |
| AI-powered | Prompt UX patterns, confidence display, error handling for AI failures, user control over AI behavior |

**Output:** Domain Research Brief in H5W-LOG.md:
```
DOMAIN RESEARCH BRIEF — [domain]
─────────────────────────────────────
Standards found: [list with sources]
User expectations: [list with sources]
Common complaints in similar apps: [list with sources]
Current app gaps vs standards: [list → enhancement findings]
```

---

#### R2. Competitive Analysis — What Do Others Do Better?

**Goal:** Find concrete features and patterns from competing/similar apps.

```
COMPETITIVE RESEARCH:
  Step 1: Identify competitors
    Search: "[app type] best apps [year]"
    Search: "[app type] alternatives"
    Search: "[specific domain] tools comparison"
    → List 3–5 competitors with URLs

  Step 2: Analyze each competitor
    WebFetch each competitor's landing page / app store listing
    For each:
      → What features do they offer that this app doesn't?
      → What visual patterns do they use?
      → What's their onboarding experience?
      → What do user reviews praise?
      → What do user reviews criticize?

  Step 3: Extract actionable items
    → Feature gaps: things competitors have that this app lacks
    → UX patterns: interaction patterns that work well
    → Visual patterns: design approaches worth studying
    → Anti-patterns: competitor mistakes to avoid

  Each item → H5W-QUEUE.md as enhancement finding with source
```

**Output:** Competitive Analysis in H5W-LOG.md:
```
COMPETITIVE ANALYSIS — [app name]
─────────────────────────────────────
Competitors: [list with URLs]
Feature gaps: [what they have, we don't — with priority]
UX wins: [patterns worth adopting]
Visual wins: [design approaches worth studying]
Their mistakes: [what to avoid]
User review insights: [what users love/hate about competitors]
```

---

#### R3. Audience Deep Dive — What Do Users Actually Want?

**Goal:** Understand real user needs beyond what the developer specified.

```
AUDIENCE RESEARCH:
  Search: "[app domain] users want"
  Search: "[app domain] feature requests"
  Search: "[app domain] reddit wishlist"
  Search: "[app domain] common frustrations"
  Search: "[specific audience] app expectations"

  For game companion apps specifically:
    Search: "[game name] companion app features"
    Search: "[game name] community tools"
    Search: "[game name] reddit what tools"
    Search: "[game name] discord bot features"

  For each finding:
    → Is this something the current app could do?
    → How hard would it be to implement?
    → How much would users value it?
    → Priority: HIGH (many users want, feasible) to LOW (niche)
```

**Output:** Audience Research in H5W-LOG.md:
```
AUDIENCE RESEARCH — [audience]
─────────────────────────────────────
What users want most: [ranked list with sources]
What users complain about in existing tools: [list]
Unmet needs: [things nobody builds well yet]
Feature proposals: [concrete features → H5W-QUEUE.md]
```

---

#### R4. Technology & Pattern Research — Build It Right

**Goal:** Find the best technical approaches for planned improvements.

```
TECHNOLOGY RESEARCH (run for each planned feature/improvement):
  Search: "[feature] best implementation [framework]"
  Search: "[pattern] [framework] best practices [year]"
  Search: "[library] for [feature] [framework]"
  Search: "[feature] performance [framework]"
  Search: "[feature] accessibility patterns"

  For each approach found:
    → Does it fit the current architecture (§0)?
    → Does it respect the design identity (§0)?
    → What's the implementation cost?
    → What are the tradeoffs?
```

**Output:** Technical approach decisions logged in H5W-LOG.md with
`[AUTO-DECIDED: chose X because Y]` tags.

---

#### R5. Design & UX Research — Make It Beautiful and Usable

**Goal:** Find visual and interaction patterns that elevate the app.

```
DESIGN RESEARCH:
  Search: "[app type] UI design inspiration"
  Search: "[app type] best UX patterns [year]"
  Search: "[domain] design system examples"
  Search: "[visual source from §0] design language"
  Search: "[aesthetic role from §0] app design patterns"

  For game companion apps with a specific game source:
    Search: "[game name] UI design"
    Search: "[game name] aesthetic fan art"
    Search: "[game name] official design elements"

  For each pattern found:
    → How could this apply to the current app?
    → Does it align with §0 Design Identity?
    → What specific component or screen would benefit?
    → Is it an enhancement or a redesign? (tier check)
```

**Output:** Design research → MOD-ART source material if redesign needed,
or direct enhancement findings for targeted improvements.

---

#### R6. Convert Research to Action

Every research phase MUST produce concrete findings. Research without action
is wasted runway.

```
RESEARCH → ACTION PIPELINE:
  1. All research findings logged in H5W-LOG.md with sources
  2. Each actionable finding → H5W-QUEUE.md as enhancement
  3. Priority sort: user demand × feasibility × impact
  4. In §AUTO FULL: build the top 3 highest-value items
  5. In interactive mode: present research + recommendations to user

FINDING FORMAT for research-derived enhancements:
  FINDING: F-[NNN]
  MODULE: H5W
  SEVERITY: enhancement
  CONFIDENCE: high
  SOURCE: [WEB: source, date] + [CODE: where it would integrate]
  How: [how to implement — technical approach]
  Who: [which personas benefit most]
  Will: [projected user value]
  What: [the concrete feature/improvement]
  When: [implementation order — depends on what?]
  Where: [which files/components need changes]
  FIX: [implementation plan]
  TIER: [T1 for additive, T2 for structural, T3 if changing existing features]
  EXPANSION: [what else this enables]
```

---

#### Research Scheduling in the Improvement Loop

Research integrates into the §SIM.5 Continuous Improvement Loop.
After §SIM.6 (50 Questions), §SIM.7 activates automatically.
R1–R3 run once per session (cached). R4–R5 run per planned feature.
See §SIM.5 for the canonical loop definition.

**Checkpoint report template:**
```
══════════════════════════════════════════
H5W CHECKPOINT — Cycle [N]
══════════════════════════════════════════
SCOPE:    [area examined]
MODE:     [full | targeted | expansion | continuous]
MODULES:  [active modules this cycle]
PERSONAS: [IDs + types used]
STATES:   [explored / total mapped]

─── METRICS ──────────────────────────────
FOUND: [total findings this cycle]
FIXED: [n] (T0: [n] T1: [n] T2: [n])
QUEUED: [n] (remaining)
BLOCKED: [n] (T3 — needs user)

─── FIXES APPLIED ────────────────────────
  F-001 [sev] [tier] [mod] [file] — [summary]
  F-002 [sev] [tier] [mod] [file] — [summary]

─── BLOCKED (T3) ─────────────────────────
  F-005 — [description + why T3 + what user needs to decide]

─── EXPANSION CANDIDATES ─────────────────
  [what micro-H5W surfaced as next targets]

─── ASSUMPTIONS ACTIVE ────────────────────
  A-001 [conf 3/5] — [assumption + impact if wrong]
  A-002 [conf 4/5] — [assumption]

─── COMPOUNDS (⏱) ────────────────────────
  F-003 → F-007 → F-015 chain: [desc of compound risk]

Continue? [yes / no / redirect scope / confirm assumption / resolve T3]
══════════════════════════════════════════
```


---


### §SIM.8. BRAINSTORM-PIVOT Protocol — only active in §AUTO-UNCHAINED + §BRAINSTORM

**Pointer.** The full §SIM.8 protocol is defined in
`references/auto-mode.md` under §BRAINSTORM, since it only activates
when that modifier is enabled.

**Summary.** When STUCK on an obstacle in BRAINSTORM mode, run a 4-step
pivot before declaring defeat:
1. **Research wider** — spawn Agent on the problem CLASS, not instance.
2. **Decompose** — re-state at a different abstraction level.
3. **Reframe** — find three problems sharing the obstacle, solve the cleanest.
4. **Sleep on it** — write to `BRAINSTORM-NOTES.md`, return after 3 iterations.

Only after all 4 fail → `[GENUINELY-STUCK]`. See `references/auto-mode.md`
§BRAINSTORM and §SIM.8 BRAINSTORM-PIVOT for full text.

---
