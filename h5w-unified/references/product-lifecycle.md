---
name: product-lifecycle
description: >
  Full product lifecycle protocol: Think → Validate → Plan → Build → Ship → Grow → Maintain → Evolve. Loaded on demand by Chief Guide §TRIAGE when product/business work is detected.
---

> **MODULE: product-lifecycle** — Domain protocol for the H5W unified system.
>
> **Invoked when:** Chief Guide §TRIAGE detects product-lifecycle work — phrases like "plan this project", "business model", "monetize", "how to get users", "what after launch", "ship", "launch plan".
>
> **Receives:** Chief Guide §0 (filled), §I calibration (classified).
> **Uses:** Chief Guide §LAW, §FMT, §SRC, §REV, §VER, §DOC — do NOT re-derive.
> **Returns:** Findings/actions in §FMT format → H5W-QUEUE.md and H5W-LOG.md.
>
> **In §AUTO mode:** the §AUTO protocol (references/auto-mode.md) governs interactive vs autonomous behavior.
> See the §AUTO protocol (references/auto-mode.md) for FULL/GUIDED routing and the activation gate.

---

## §PRODUCT — FULL PRODUCT LIFECYCLE PROTOCOL

> **The skill thinks like a full team: strategist, developer, designer,
> marketer, and maintainer.** Every project — new or existing — is a product
> that needs to find users, solve problems, sustain itself, and grow.
> §PRODUCT wraps the entire pipeline from idea through post-launch evolution.

### When §PRODUCT Activates

- "Build [app] from scratch" → §PRODUCT first, then §BUILD
- "Plan this project" / "think through this product"
- "How should I ship this?" / "How do I get users?"
- "Business plan" / "monetization" / "marketing plan"
- "What happens after launch?" / "maintenance plan"
- In §AUTO: automatically when building from scratch
- Any time the user treats Claude as a full product partner, not just a coder

### The Product Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│ §PRODUCT wraps everything. Every phase feeds the next.       │
│                                                              │
│  P1 THINK ──→ P2 VALIDATE ──→ P3 PLAN ──→ P4 BUILD         │
│     Why?        Does anyone      Roadmap      §BUILD         │
│     For whom?   actually need    Business     pipeline       │
│     What?       this?            model                       │
│                                                              │
│  P5 SHIP ──→ P6 GROW ──→ P7 MAINTAIN ──→ P8 EVOLVE         │
│     §DELIVER    Marketing    Bug triage     Next version     │
│     Launch      Users        Updates        Pivot/expand     │
│     strategy    Analytics    Support                         │
└──────────────────────────────────────────────────────────────┘
```

---

### P1. THINK — Why Does This Exist?

Before any code, architecture, or design — answer these questions.
Claude fills these by asking the user (interactive) or making best-judgment
decisions (§AUTO) logged with `[AUTO-DECIDED]`.

```yaml
PRODUCT BRIEF:
  # ─── THE PROBLEM ─────────────────────────────
  Problem:         # What pain does this solve? (one sentence)
  Current Solution: # How do people solve this today without your app?
  Why Now:         # Why build this now? What changed?

  # ─── THE AUDIENCE ────────────────────────────
  Primary User:    # Specific person, not "everyone" — e.g. "<game> players
                   # who want to compare team DPS"
  User Context:    # When/where do they need this? (commuting, at desk, in-game)
  User Skill:      # Technical level of target users
  User Volume:     # How many people have this problem? (order of magnitude)

  # ─── THE VISION ──────────────────────────────
  One-Line Pitch:  # "It's [analogy] for [audience]"
  Core Value:      # The ONE thing that makes someone use this instead of nothing
  Non-Goals:       # Explicitly: what this is NOT

  # ─── THE DIFFERENTIATION ─────────────────────
  Competitors:     # What already exists? (list 2-5)
  Why Different:   # What does this do that competitors don't?
  Unfair Advantage: # What makes this hard to copy? (data, community, UX, niche)
```

**Gate:** The product brief must be coherent before ANY technical work.
"I want to build an app" is not enough. "I want to build a DPS comparison
tool for <specific-game> players because existing tools are ugly and don't
work on mobile" is enough.

---

### P2. VALIDATE — Does Anyone Need This?

Before investing build effort, validate demand. Claude does this research
using §SIM.7 (Research & Study) tools.

```
VALIDATION RESEARCH:
  1. Search: "[problem] [audience] need"
     → Are people actually looking for this?

  2. Search: "[competitor] reviews complaints"
     → What do users hate about existing solutions?

  3. Search: "[domain] reddit wishlist feature request"
     → What do community members ask for?

  4. Search: "[app type] market size [year]"
     → Is there a market, or just a few people?

  5. Assess: Given §0 Constraints (one developer, mobile-first, no backend),
     is this buildable and maintainable?

VALIDATION VERDICT:
  Demand:     strong / moderate / weak / unvalidated
  Competition: none / weak / moderate / strong
  Feasibility: easy / moderate / hard / beyond constraints
  Recommendation: build / pivot / simplify / research more
```

**In §AUTO:** If demand is "weak" and competition is "strong" → log `[AUTO-DECIDED: validation suggests pivot]` with alternatives. Don't build something nobody needs.

---

### P3. PLAN — Roadmap, Business Model, Launch Strategy

#### P3.1 Feature Roadmap

```yaml
ROADMAP:
  MVP (v1.0):           # Ship THIS first. Minimum features to test core value.
    - [feature 1]       # The one feature that IS the product
    - [feature 2]       # Essential support feature
    - [feature 3]       # Minimum viable polish

  v1.1 (post-launch):   # Based on user feedback
    - [feature 4]
    - [feature 5]

  v2.0 (growth):        # Expand value proposition
    - [feature 6]
    - [feature 7]

  Future:                # Nice-to-have, not committed
    - [ideas]
```

**Rule:** MVP is SMALL. The goal is to ship and learn, not to build everything.
An ugly app that's live teaches more than a perfect app that's not.

#### P3.2 Business Model

```yaml
BUSINESS MODEL:
  Type: [free | freemium | paid | subscription | ads | donation | open-source]

  # For FREE:
  Sustainability:    # How is development sustained? (hobby, portfolio, community)
  Costs:             # Hosting, domain, API calls — what does it cost to run?

  # For FREEMIUM:
  Free Tier:         # What's free? (must be useful on its own)
  Paid Tier:         # What's paid? (must be clearly more valuable)
  Price Point:       # Research competitor pricing
  Payment Provider:  # Stripe, Play Store billing, etc.

  # For ADS:
  Ad Placement:      # Where? (never interrupt core flow)
  Ad Provider:       # AdMob, etc.
  Revenue Estimate:  # CPM × estimated impressions

  # For OPEN-SOURCE:
  License:           # MIT, GPL, Apache, etc.
  Contribution Model: # How do others contribute?
  Sustainability:    # Sponsors, grants, or pure community?
```

#### P3.3 Launch Strategy

```yaml
LAUNCH PLAN:
  Pre-Launch:
    - [ ] Landing page or app store listing draft
    - [ ] Screenshots / demo content prepared
    - [ ] Beta testers identified (friends, community members)
    - [ ] Social media accounts created (if applicable)

  Launch Day:
    - [ ] Deploy to production (§DELIVER)
    - [ ] Post to relevant communities (Reddit, Discord, forums)
    - [ ] Share with beta testers for initial feedback
    - [ ] Monitor: crashes, errors, first-user experience

  Post-Launch Week:
    - [ ] Collect feedback (app reviews, DMs, forum threads)
    - [ ] Fix critical bugs (same-day)
    - [ ] Fix high bugs (within 3 days)
    - [ ] Plan v1.1 based on real feedback
```

#### P3.4 Marketing Basics

```yaml
MARKETING:
  Positioning:
    For [target user]
    Who [has this problem]
    [App name] is a [category]
    That [key benefit]
    Unlike [competitors]
    We [differentiator]

  Channels:            # Where does the target audience hang out?
    - # e.g. "r/<your-domain> subreddit"
    - # e.g. "Game-specific Discord servers"
    - # e.g. "Twitter/X game community"
    - # e.g. "YouTube game content creators"

  Content Plan:
    - # Launch post: "I built [app] because [problem]"
    - # Demo video or screenshots
    - # Tutorial: how to use the core feature
    - # Update posts for each new version

  App Store Optimization (if applicable):
    - Title:          # [App Name] — [Key Benefit]
    - Description:    # Problem → Solution → Features → CTA
    - Keywords:       # Research competitor keywords
    - Screenshots:    # Show the core value, not the splash screen
    - Category:       # Correct primary + secondary category
```

---

### P4. BUILD — Technical Execution

This is §BUILD. The entire §BUILD pipeline (B1–B9) runs here.
But now it's informed by §PRODUCT:

- B1 Discovery uses the Product Brief (P1) instead of asking from scratch
- B2 Architecture is constrained by the business model (ads need ad SDK,
  payments need Stripe, open-source needs clean architecture)
- B3 Design System is informed by the positioning and audience
- B9 Launch Gate includes marketing readiness, not just code quality

---

### P5. SHIP — Get It Into Users' Hands

This is §DELIVER + Launch Strategy (P3.3). But also:

```
SHIPPING CHECKLIST:
  [ ] Code: all §BUILD gates passed
  [ ] Delivery: §DELIVER verified — artifact builds and installs
  [ ] Legal: privacy policy (if collecting data), terms of service (if needed),
      open-source license (if applicable)
  [ ] Store listing: screenshots, description, category, keywords (P3.4)
  [ ] Analytics: basic crash reporting + usage analytics configured
      (Firebase, Sentry, Plausible — something)
  [ ] Feedback channel: how do users report bugs or request features?
      (GitHub Issues, email, Discord, in-app feedback)
  [ ] Version: v1.0.0 tagged in git
```

---

### P6. GROW — Get Users and Keep Them

```
GROWTH PROTOCOL (post-launch):
  Week 1:
    - Monitor crash reports daily
    - Read every piece of user feedback
    - Fix critical/high bugs same-day
    - Thank early users personally

  Month 1:
    - Analyze: which features are used? Which are ignored?
    - Identify: where do users drop off?
    - Plan v1.1: top 3 user-requested improvements
    - Post update to community: "Here's what's coming"

  Month 3:
    - Re-run §SIM.7 R2 (competitive analysis): has the landscape changed?
    - Re-run §SIM.7 R3 (audience research): what do users want now?
    - Plan v2.0 based on data, not assumptions
    - Consider: is the business model working? Pivot?

  Ongoing:
    - Update cadence: at least monthly for active apps
    - Changelog: every update gets a user-facing changelog
    - Community: respond to issues, engage with users
```

---

### P7. MAINTAIN — Keep It Running

```
MAINTENANCE PROTOCOL:
  Regular (monthly):
    - [ ] Update dependencies (npm audit / dependabot / gradle updates)
    - [ ] Check for security advisories
    - [ ] Review crash reports — any new patterns?
    - [ ] Review analytics — any usage changes?
    - [ ] Run H5W targeted simulation on recent changes

  Quarterly:
    - [ ] Full H5W simulation (are there new issues?)
    - [ ] MOD-CODE audit on areas that changed
    - [ ] Performance check — has it degraded?
    - [ ] Re-run §DELIVER — does CI/CD still work?

  Annually:
    - [ ] Full deep audit (all modules)
    - [ ] SDK/framework version review — should we upgrade?
    - [ ] Competitive landscape check — still differentiated?
    - [ ] Product vision check — still solving the right problem?
```

---

### P8. EVOLVE — What's Next?

```
EVOLUTION PROTOCOL:
  When to evolve:
    - Core value proven, users engaged, growth plateaued
    - Market changed — new opportunities or threats
    - User requests consistently point in a new direction
    - Technical debt accumulated enough to warrant restructuring

  How to evolve:
    1. Re-run P1 (THINK) with new context — has the problem changed?
    2. Re-run P2 (VALIDATE) — is there demand for the new direction?
    3. Re-run P3 (PLAN) — new roadmap, updated business model
    4. Execute via §BUILD or §SIM (depending on scope)
    5. Ship via §DELIVER + P5
    6. Measure via P6

  Evolution types:
    - Feature expansion: add capabilities within current vision
    - Audience expansion: serve new user segments
    - Platform expansion: new platform (web → mobile, mobile → desktop)
    - Pivot: change the core value proposition
    - Sunset: the product served its purpose — archive gracefully
```

---

### §PRODUCT Integration Map

| Phase | Shared Protocols Used | Modules Used |
|-------|----------------------|-------------|
| P1 Think | §0 (identity) | — |
| P2 Validate | §SIM.7 R1–R3 (research) | — |
| P3 Plan | §0 (constraints) | — |
| P4 Build | §BUILD (full), all modules | All |
| P5 Ship | §DELIVER, §BUILD B9 | MOD-APP §C (security) |
| P6 Grow | §SIM.7 (research), §SIM (simulation) | MOD-APP §X (R&D) |
| P7 Maintain | §SIM (simulation), §VER | MOD-CODE, MOD-APP |
| P8 Evolve | §PRODUCT (restart from P1) | All |

---

