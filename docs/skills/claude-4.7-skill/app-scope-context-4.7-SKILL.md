---
name: scope-context
description: >
  Scope awareness and ambiguity resolution for codebase-wide work. Trigger on: "all X",
  "every Y", "standardize Z", "make all [things] consistent", "update every [element]",
  or any request targeting multiple instances across files. Also triggers on ambiguous
  instructions: "the box", "the button", "bottom right", "add padding", "make it bigger",
  vague spatial/style references, or when multiple elements could match a description.
  Solves large-scope blindness (missing instances when asked to find/fix "all X") via
  Concept Scaffold protocol (semantic definition, pattern inventory, scope boundaries,
  awareness tracker) with mandatory human verification gates. Solves ambiguity resolution
  failure (guessing instead of clarifying) via disambiguation reports covering referential,
  spatial, and implicit value ambiguities. Includes combined workflow for requests with
  both issues. Use alongside app-audit and design-aesthetic-audit skills.
---

# SCOPE_AND_CONTEXT.md — v2.1 (Opus 4.7)

## Purpose

This skill is an operational protocol. It solves two specific failure modes:

1. **Large-scope blindness** — You miss instances when asked to find or fix "all X" across a codebase.
2. **Ambiguity resolution failure** — You guess at vague instructions instead of asking the human to clarify.

This skill gives you explicit, step-by-step procedures to follow for both failure modes. Follow each step in order. Complete each step fully before moving to the next step.

---

# TABLE OF CONTENTS

| Section | Purpose | When to Use |
|---------|---------|-------------|
| **§I — The Two Problems** | Concrete descriptions of what goes wrong | Read first |
| **§II — Pre-Flight Protocol** | Mandatory checks before ANY work | Every request |
| **§III — Large-Scope Work** | Step-by-step procedure for "all X" requests | "all boxes", "every button", "standardize cards" |
| **§IV — Ambiguity Resolution** | Step-by-step procedure for clarifying vague instructions | "the green box", "bottom right", "add padding" |
| **§V — Combined Workflow** | How §III and §IV work together | Complex requests with both issues |
| **§VI — Scanning Strategies** | How to search a codebase thoroughly | During §III Step 3 |
| **§VII — Advanced Scenarios** | Multi-concept, nested, cross-dependency cases | Complex multi-target requests |
| **§VIII — Context Window Management** | Handling scope that exceeds working memory | Large codebases (100+ files) |
| **§IX — Batch Execution & Checkpointing** | Safe execution of 20+ changes | High-volume modifications |
| **§X — Integration Protocols** | How this skill connects to companion skills | When using app-audit, design-aesthetic-audit |
| **§XI — Quick Reference** | Checklists, templates, trigger tables | Day-to-day usage |

---

# §I — THE TWO PROBLEMS

## Problem A: Large-Scope Blindness

### What the Human Expects

The human says: "Make all the boxes consistent."

The human expects: You find all 23 boxes across 12 files and standardize every one of them.

### What Actually Happens Without This Protocol

You update 8 obvious boxes. You miss 15 others. You report "done."

### Why This Happens — Four Specific Causes

1. **Vocabulary fragmentation.** You treat `<Card>`, `<Panel>`, and `<div className="box">` as unrelated elements, even though the human considers them all "boxes." The same concept has multiple code representations, and you match on syntax instead of on purpose.
2. **Sequential context loss.** You process files one at a time. After scanning file 5, you have already lost track of the patterns you found in files 1 through 4. Each file is a fresh start with no carryover.
3. **Premature termination.** You stop scanning after you run out of obvious keyword matches. If the concept uses synonyms, variations, or structural patterns instead of a single keyword, you miss them.
4. **No progress tracking.** You have no running counter ("I have checked 8 of 23 files so far") to tell you when you are finished. Without a counter, you cannot distinguish "I found everything" from "I stopped early."

### The Fix

Before scanning any code, you build an explicit data structure called a **Concept Scaffold**. This scaffold contains four artifacts:
- A **Semantic Definition** that defines what counts as the target concept and what does not
- A **Pattern Inventory** that lists every code pattern implementing the concept
- **Scope Boundaries** that define exactly where to search
- An **Awareness Tracker** that counts your progress and tells you when every file has been checked

§III gives you the exact procedure.

---

## Problem B: Ambiguity Resolution Failure

### What the Human Expects

The human says: "Place the green box at the bottom right corner."

The human expects: You ask which of the 4 green elements they mean, confirm the viewport context, and check for collisions with existing elements at that position.

### What Actually Happens Without This Protocol

You pick the first green element you find. You place it at the bottom-right of the first container you encounter. You use an arbitrary padding value like 15px.

### Why This Happens — Four Specific Causes

1. **First-match selection.** You select the first element that matches "the green box" without checking if other matches exist. The first match may not be the one the human means.
2. **Anchor defaulting.** You select the first container for "bottom right" without checking if the human means a different container. "Bottom right of the viewport" and "bottom right of the content area" are different positions.
3. **Collision blindness.** You skip checking whether other elements already occupy the target position. The new placement may overlap with existing elements.
4. **Value invention.** You invent style values (15px, 18px, 22px) instead of looking for existing patterns in the codebase. These arbitrary values break spacing scales and design consistency.

### The Fix

Before making any changes, you build a **Disambiguation Report** that lists every possible interpretation of each ambiguous term, presents them in tables, and asks the human to choose. §IV gives you the exact procedure.

---

## Problem Severity Indicators

These patterns in your own output indicate you have violated this protocol:

| Your Output Contains | Problem | Protocol Section |
|---------------------|---------|-----------------|
| "I've updated the main instances" | You know you missed some. You stopped early. | §III |
| "Fixed several boxes" | "Several" is not a count. You lost track. | §III |
| "Updated most of the buttons" | "Most" means you did not finish. | §III |
| "I'll assume you meant..." | You guessed instead of asking. | §IV |
| "Let me know if this is wrong" (after changing code) | You acted before confirming. | §IV |
| "I picked the most likely one" | Frequency does not indicate intent. | §IV |
| Any value like 15px, 18px, 22px | You invented a value. Search for existing patterns. | §IV Rule C |

If you catch yourself writing any of these phrases, stop. Go back to the appropriate protocol section and follow it from the beginning.

---

# §II — PRE-FLIGHT PROTOCOL

**Run this checklist before starting ANY request. Complete all five checks in order.**

### Check 1: Is This a Large-Scope Request?

A request is large-scope if ANY of these conditions are true:
- It affects more than 10 files
- It uses "all", "every", "each", or "standardize" language
- It requires you to maintain a concept definition across the entire codebase
- It uses plural forms implying completeness: "the buttons", "the cards", "our modals"

→ If ANY condition is true: Mark this request as LARGE-SCOPE.

### Check 2: Does This Request Contain Ambiguity?

A request contains ambiguity if ANY of these conditions are true:
- It uses vague references like "the box" or "the button" when you have not yet confirmed that only one candidate exists
- It uses spatial terms without specifying the reference container: "bottom right", "top corner", "center"
- It uses style directives without specifying values: "add padding", "make it bigger", "add shadow"
- It has two or more valid interpretations that would produce different results
- It references elements by visual appearance ("the green one", "the large card") rather than by code identifier

→ If ANY condition is true: Mark this request as AMBIGUOUS.

### Check 3: Does This Request Involve Multiple Concepts?

A request involves multiple concepts if it targets two or more distinct types of element:
- "Standardize all buttons AND all inputs" — two concepts: buttons, inputs
- "Make all cards and modals use the same shadow" — two concepts: cards, modals
- "Update every heading and every label" — two concepts: headings, labels

→ If this request targets multiple concepts: Mark this request as MULTI-CONCEPT. See §VII-A.

### Check 4: Does This Request Have Cross-File Dependencies?

A request has cross-file dependencies if changing one file forces changes in other files:
- Modifying a shared component that is imported by 30 other files
- Renaming a CSS class used across the entire codebase
- Changing a type definition that other files depend on
- Updating a utility function's signature

→ If dependencies exist: Mark this request as HAS-DEPENDENCIES. See §VII-C.

### Check 5: Route to the Correct Protocol

Use this routing table:

| Request Profile | Go To |
|----------------|-------|
| LARGE-SCOPE only | §III |
| AMBIGUOUS only | §IV |
| LARGE-SCOPE + AMBIGUOUS | §V (resolve ambiguity first, then scaffold) |
| MULTI-CONCEPT | §VII-A (build one scaffold per concept) |
| HAS-DEPENDENCIES | §VII-C (map dependencies before executing) |
| MULTI-CONCEPT + AMBIGUOUS | §V first for each concept, then §VII-A |
| Small scope (fewer than 3 files) AND unambiguous | Proceed with normal execution — this protocol is not needed |

**After routing, go to the indicated section. Complete the protocol fully before writing any code.**

---

# §III — LARGE-SCOPE PROTOCOL

**Use when:** The request involves "all X", "every Y", or "standardize Z" across multiple files.

## What You Are Building

A **Concept Scaffold** is a set of 4 data artifacts that you create before scanning any code. These artifacts define what you are looking for, where to look, what patterns to recognize, and how to track your progress.

You build all 4 artifacts first. You present them to the human for approval. You scan only after the human approves.

---

## Step 1: Build the Concept Scaffold

Create these 4 artifacts before opening any code files for modification.

### Artifact 1: SEMANTIC DEFINITION

Write a precise definition of the concept the human is referring to. Include what counts as that concept and what does not count. Be specific enough that a different instance of you could use this definition to get the same results.

**Template:**

```
CONCEPT: [Name of the thing]

SEMANTIC DEFINITION:
• Core purpose: [What this thing does in the app — one sentence]
• Visual signature: [How a user sees it on screen — one sentence]
• Functional signature: [How it behaves in code — one sentence]
• Data signature: [What props/attributes/data it carries — one sentence, if applicable]
• Excluded: [Similar things that do NOT count as this concept — list each one with a one-sentence reason]
```

**Example for "Box" (React/Next.js):**

```
CONCEPT: Box

SEMANTIC DEFINITION:
• Core purpose: Visual container that groups related content together
• Visual signature: Has a background color, border or shadow, and internal padding
• Functional signature: Wraps child elements; has no interactive behavior (no onClick, no onChange, no onSubmit)
• Data signature: Receives children as props; may receive className or style props
• Excluded:
  - Buttons: excluded because they are interactive (have onClick)
  - Inputs: excluded because they are editable (have onChange/value)
  - Modals: excluded because they create an overlay layer (different rendering context)
  - Layout wrappers: excluded if they have no visual presence (no background, no border, no shadow)
```

**Example for "Input Field" (Kotlin/XML Android):**

```
CONCEPT: Input Field

SEMANTIC DEFINITION:
• Core purpose: UI element that accepts user text input
• Visual signature: Has a text area, optional label, optional hint text, optional error state
• Functional signature: Uses EditText or TextInputEditText; has text change listeners
• Data signature: Carries inputType, hint, text attributes; may have TextInputLayout wrapper
• Excluded:
  - TextView: excluded because it displays text but does not accept input
  - Button: excluded because it triggers actions, does not accept text
  - SearchView: excluded because it is a composite widget with different behavior
  - Spinner: excluded because it presents a dropdown, not free text input
```

### Artifact 2: PATTERN INVENTORY

List every code pattern in the codebase that implements this concept. Use multiple search strategies to find patterns (see §VI for detailed scanning strategies).

**Template:**

```
PATTERN INVENTORY: [Name of the thing]

Known implementations in this codebase:
1. [Pattern description] — [file path]
2. [Pattern description] — [file path]
3. [Pattern description] — [file path]
...

Recognition rules (use ALL of these during the scan):
• MATCHES IF: [required properties — all must be present]
• ALSO MATCHES IF: [alternative set of required properties — all must be present]
• DOES NOT MATCH IF: [properties that disqualify an element, even if other rules match]

Search terms (strings to grep/search for):
• Primary: [component names, class names]
• Secondary: [CSS classes, style properties]
• Structural: [HTML/JSX/XML element patterns]
```

**Example for "Box" (React/Next.js):**

```
PATTERN INVENTORY: Box

Known implementations in this codebase:
1. <Box> component — src/components/ui/Box.tsx
2. <Card> component — src/components/ui/Card.tsx
3. <div className="container"> — used in 8 files across src/app/
4. <section className="panel"> — used in 3 legacy files in src/app/legacy/
5. Raw div with Tailwind box classes — various files (pattern: div + bg-* + rounded-* + shadow + p-*)

Recognition rules:
• MATCHES IF: element has (background OR background-color) AND padding AND (border OR shadow OR rounded corners)
• ALSO MATCHES IF: element is a known box component (<Box>, <Card>, <Panel>) regardless of current styling
• DOES NOT MATCH IF: element has onClick, onChange, onSubmit, or href (those are interactive or navigation elements)

Search terms:
• Primary: "Box", "Card", "Panel", "Container"
• Secondary: "bg-white", "bg-gray", "rounded-lg", "shadow", "border"
• Structural: "<div className=" combined with padding classes ("p-", "px-", "py-")
```

### Artifact 3: SCOPE BOUNDARIES

Define exactly which folders, file types, and contexts to search. Also define what to exclude and why.

**Template:**

```
SCOPE BOUNDARIES: [Name of the thing]

INCLUDE:
• Folders: [list specific folder paths]
• File types: [list specific extensions]
• Contexts: [describe where this concept appears — pages, components, layouts, etc.]

EXCLUDE:
• Folders: [list specific folder paths to skip, with reason for each]
• Files: [list specific files or file types to skip, with reason for each]
• Edge cases: [describe boundary cases and your decision for each]

FILE LIST (enumerate every file in scope):
1. [file path]
2. [file path]
3. [file path]
...
Total: [N] files

EXPECTED RANGE: [low]-[high] instances
Calibration check: If your scan finds fewer than [low], your recognition rules are likely too narrow — re-examine. If your scan finds more than [high], your recognition rules are likely too broad — re-examine.
```

### Artifact 4: AWARENESS TRACKER

Create a running ledger that tracks which files you have scanned and how many instances you have found. This tracker tells you when you are done: you are done when every file is marked with ✓.

**Template:**

```
AWARENESS TRACKER: [Name of the thing]

Total files in scope: [N]
Files scanned so far: 0
Instances found so far: 0

PROGRESS LOG:
⬜ [file path 1]
⬜ [file path 2]
⬜ [file path 3]
...

STATUS: 0 of [N] files scanned (0%)
COMPLETION CONDITION: This scan is complete when STATUS shows [N] of [N] files scanned (100%)
```

---

## Step 2: Present the Scaffold and Wait for Approval

**This step is a hard gate.** You present the 4 artifacts. You ask the human 4 specific questions. You wait for the human to respond. You do not scan or modify any code until the human responds.

Present the scaffold with this exact structure:

```
CONCEPT SCAFFOLD COMPLETE

[Display all 4 artifacts]

VERIFICATION QUESTIONS:
1. Does this semantic definition match what you mean by "[concept]"?
2. Are there code patterns I missed in the pattern inventory?
3. Should I include or exclude any folders or file types?
4. Does the expected range of [low]-[high] instances seem right?

Reply 'proceed' to start the scan, or provide corrections.
```

**Wait for the human to reply. Do not continue until they reply.**

If the human provides corrections:
1. Apply each correction to the relevant artifact
2. Present the corrected scaffold again
3. Ask for approval again
4. Repeat until the human says 'proceed'

---

## Step 3: Exhaustive Scan

After the human approves (or after you apply their corrections), scan every file listed in your Scope Boundaries. Use the recognition rules from your Pattern Inventory. Update your Awareness Tracker after each file. See §VI for detailed scanning strategies.

**For each file, follow this exact procedure:**
1. Open the file
2. Read it fully — do not skim or sample
3. Apply every recognition rule from the Pattern Inventory to every element in the file
4. For each match: record the file path, line number, matched pattern, and a one-line description of the specific instance
5. For each near-match (matches some rules but not all): record it separately as a "borderline case" with a note explaining which rule it fails
6. Mark the file as ✓ in the Awareness Tracker
7. Update the "Instances found so far" count
8. Move to the next file

**Continue until every file in scope is marked ✓.** The Awareness Tracker shows you when you are done: "Files scanned so far" equals "Total files in scope."

**Output format:**

```
SCAN PROGRESS:
✓ src/app/page.tsx — 2 instances found
  1. Line 23: <div className="bg-white rounded-lg shadow p-6"> — raw div box
  2. Line 67: <Card> — Card component

✓ src/app/dashboard/page.tsx — 5 instances found
  3. Line 12: <Box> — Box component
  4. Line 34: <Box> — Box component
  5. Line 56: <div className="container"> — container div
  6. Line 89: <Card> — Card component
  7. Line 112: <Card> — Card component

[Continue for every file]

BORDERLINE CASES:
  B1. src/app/settings/page.tsx:45 — <div className="bg-gray-100 p-4"> — has background + padding but no border or shadow. Matches partial rule only.

STATUS: [N]/[N] files scanned (100%)
TOTAL INSTANCES: [count]
BORDERLINE CASES: [count]
```

---

## Step 4: Human Verification Gate

**This step is a hard gate.** You present the scan results. You wait for the human to confirm. You do not modify any code until the human confirms.

Present scan results with this exact structure:

```
SCAN COMPLETE

Found: [N] instances across [M] files
Borderline cases: [B] (listed separately for your review)

BREAKDOWN BY PATTERN:
• [Pattern 1]: [count] instances
• [Pattern 2]: [count] instances
• [Pattern 3]: [count] instances

FULL LIST:
[numbered list of every instance with file paths and line numbers]

BORDERLINE CASES (require your decision):
[numbered list of borderline cases with explanations]

VERIFICATION NEEDED:
1. Does this total count match your expectation of "all [thing]"?
2. Do you know of any instances I missed?
3. Are any of these false positives that I should remove from the list?
4. For each borderline case: include or exclude?

Reply 'confirmed' to proceed with changes, or provide corrections.
```

**Wait for the human to reply. Do not continue until they reply.**

---

## Step 5: Execute with Tracking

Only after the human confirms the scan results, apply changes. Track every modification with a running counter.

```
APPLYING CHANGES...

Target: [description of the standardization]

Progress:
✓ 1/[N] — [file:line] — Updated [describe what changed]
✓ 2/[N] — [file:line] — Updated [describe what changed]
✓ 3/[N] — [file:line] — Already correct (no change needed)
⚠ 4/[N] — [file:line] — Exception: [reason why this instance cannot be changed] — Skipped

[Continue for every instance]

FINAL REPORT:
• Total instances: [N]
• Successfully updated: [count]
• Already correct: [count]
• Exceptions: [count]
  - Exception 1: [file:line] — [reason]
  - Exception 2: [file:line] — [reason]

ROLLBACK REFERENCE:
If you want to undo these changes, here are the original values:
- [file:line]: was [old value], now [new value]
- [file:line]: was [old value], now [new value]
[List every change with before/after]

All changes complete.
```

For large change sets (20+ changes), see §IX for batch execution with checkpoints.

---

## Step 6: Concept Drift Detection

Sometimes "all boxes" contains intentional variations (for example: primary cards vs. secondary cards vs. compact cards). These variations may be deliberate design decisions, and flattening them into one pattern would be a destructive mistake.

**When to check for concept drift:** Always check during Step 1 (Pattern Inventory). If you find 2 or more visually or functionally distinct groups within the same concept, flag this before scanning.

**Procedure:**

1. During Pattern Inventory, group instances by their visual or functional differences
2. If you find 2+ distinct groups, present them:

```
PATTERN DIVERGENCE DETECTED

Found [N] distinct groups within "[concept]":

Group 1: [description]
• Visual traits: [specific properties]
• Usage context: [where in the app these appear]
• Count: [N] instances
• Example: [file:line]

Group 2: [description]
• Visual traits: [specific properties]
• Usage context: [where in the app these appear]
• Count: [N] instances
• Example: [file:line]

Group 3: [description]
• Visual traits: [specific properties]
• Usage context: [where in the app these appear]
• Count: [N] instances
• Example: [file:line]

INTERPRETATION OPTIONS:
(a) These are ONE concept that has drifted over time → standardize all groups to a single pattern
(b) These are [N] intentional variants → standardize within each group separately (keep the groups distinct from each other)
(c) This is a design system with documented tiers → document the current state without changing anything

Which interpretation is correct?
```

3. **Wait for the human to reply before proceeding.**
4. Adjust your Semantic Definition based on their answer:
   - If (a): keep one unified definition
   - If (b): create a sub-definition for each group, and scan/track each group separately
   - If (c): switch from a "change" workflow to a "document" workflow

---

# §IV — AMBIGUITY RESOLUTION PROTOCOL

**Use when:** The instruction contains vague references, spatial terms without anchors, or style directives without values.

## The Three Core Ambiguity Types

### Type A: Referential Ambiguity
The instruction says "the X" but multiple X elements exist in the codebase.

**Trigger phrases:**
- Definite articles: "the button", "the box", "the form", "the modal", "the input"
- Possessive references: "its position", "their styles", "its color"
- Pronouns without a single clear antecedent: "move it", "update them", "fix that"
- Visual descriptors as identifiers: "the green one", "the large card", "the sidebar thing"

**What you do:** Search the codebase for all elements matching the description. If you find 2 or more candidates, build a disambiguation table.

### Type B: Spatial/Relational Ambiguity
The instruction uses position words without specifying which container is the reference frame.

**Trigger phrases:**
- Absolute positions: "top", "bottom", "left", "right", "corner", "center"
- Relative positions: "above", "below", "beside", "next to", "between"
- Directional: "move it down", "shift it right", "push it to the edge"

**What you do:** Identify all possible reference containers (viewport, parent element, content area, modal, sidebar, etc.). If 2 or more containers could be the reference frame, build a disambiguation table.

### Type C: Implicit Pattern Ambiguity
The instruction asks for a style change without specifying the exact value, and the codebase has existing patterns that could apply.

**Trigger phrases:**
- Property names without values: "padding", "margin", "rounded", "shadow", "font size", "gap"
- Comparative adjectives: "bigger", "smaller", "wider", "taller", "more spaced", "less prominent"
- Qualitative descriptors: "subtle", "bold", "prominent", "minimal", "consistent"

**What you do:** Search the codebase for existing values of the relevant property. If you find 2 or more distinct values in use, build a disambiguation table.

## Additional Ambiguity Types

### Type D: Behavioral Ambiguity
The instruction describes desired behavior but the implementation path is unclear.

**Trigger phrases:**
- "Make it responsive" — responsive to what? (viewport width, container width, content amount, orientation)
- "Add animation" — what kind? (fade, slide, scale, bounce, custom)
- "Make it accessible" — which standards? (WCAG 2.1 AA, AAA, specific disability accommodations)
- "Handle errors" — which errors? (network, validation, auth, server, all)

**What you do:** List the possible implementation interpretations and their trade-offs. Ask the human to choose.

### Type E: Scope Ambiguity
The instruction implies a scope but does not state it explicitly.

**Trigger phrases:**
- "Fix the styling" — of what? (one component, all components of this type, the entire page)
- "Update the colors" — which colors? (background, text, borders, all)
- "Clean up the code" — which aspect? (formatting, dead code, performance, readability)

**What you do:** Present the possible scopes and ask the human to confirm which one they mean.

---

## Graduated Disambiguation

The disambiguation procedure scales to the number of candidates. Different candidate counts get different handling.

### 0 Candidates Found
You searched the codebase and found nothing matching the description.

```
⚠️ NO MATCH FOUND

Original instruction: "[instruction]"

I searched for "[term]" and found 0 matching elements.

Similar elements I did find:
• [similar element 1] — [file:line] — [why it's similar but different]
• [similar element 2] — [file:line] — [why it's similar but different]

Did you mean one of these? Or is there a different name or location I should search?
```

### 1 Candidate Found
Unique reference. Proceed without disambiguation for this term.

State what you found: "Found one match for '[term]': [element] at [file:line]. Proceeding with this element."

### 2–5 Candidates Found
Standard disambiguation. Present all candidates in a table.

```
⚠️ AMBIGUITY: "[term]" — Found [N] candidates

| ID | Element | Location | Current State |
|----|---------|----------|---------------|
| a  | [element] | [file:line] | [brief description] |
| b  | [element] | [file:line] | [brief description] |
...

Which one? (a/b/c/...)
```

### 6–15 Candidates Found
Grouped disambiguation. Too many candidates for a flat table to be useful. Group by category first.

```
⚠️ AMBIGUITY: "[term]" — Found [N] candidates across [M] categories

Category 1: [category name] ([count] candidates)
| ID  | Element | Location | Current State |
|-----|---------|----------|---------------|
| 1a  | [element] | [file:line] | [brief description] |
| 1b  | [element] | [file:line] | [brief description] |

Category 2: [category name] ([count] candidates)
| ID  | Element | Location | Current State |
|-----|---------|----------|---------------|
| 2a  | [element] | [file:line] | [brief description] |
| 2b  | [element] | [file:line] | [brief description] |

Options:
- Specify a single element: "1a" or "2b"
- Specify a category: "all of category 1"
- Specify multiple: "1a, 2a, 2b"

Which one(s)?
```

### 16+ Candidates Found
This is likely a large-scope request disguised as a single-element reference. Escalate to the combined workflow (§V).

```
⚠️ SCOPE ESCALATION: "[term]" — Found [N] candidates

This looks like a large-scope request. [N] elements match "[term]".

I recommend using the full large-scope protocol (§III) to handle this systematically.
Shall I build a Concept Scaffold for "[term]"?
```

---

## Step 1: Detect Ambiguity

Read the instruction. Check for trigger patterns from each ambiguity type (A through E). Record which types are present.

**Procedure:**
1. Read the full instruction once
2. For each word or phrase, check against the trigger lists for Types A, B, C, D, and E
3. Record each detected ambiguity with its type and the specific trigger phrase
4. If you detected zero ambiguities: this protocol is not needed; proceed normally
5. If you detected one or more ambiguities: proceed to Step 2

---

## Step 2: Build Disambiguation Report

For each ambiguity type detected, search the codebase for candidates and build a table of all possible interpretations. List every candidate you find — do not omit any.

**Include only the ambiguity types that apply.** If only Type A is detected, include only the Type A section. If Types A and C are detected, include both sections but omit the others.

**Template:**

```
⚠️ AMBIGUITY DETECTED

Original instruction: "[paste the exact instruction text]"
Ambiguity types found: [list types, e.g., "A (referential), C (implicit pattern)"]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE A — REFERENTIAL AMBIGUITY

"[ambiguous term]" — Found [N] candidates:

| ID | Element | Location (file:line) | Current State |
|----|---------|---------------------|---------------|
| a  | [element 1] | [file:line] | [description] |
| b  | [element 2] | [file:line] | [description] |
| c  | [element 3] | [file:line] | [description] |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE B — SPATIAL AMBIGUITY

"[spatial term]" — Possible reference containers:

| ID | Container | Dimensions | Elements Already at Target Position |
|----|-----------|------------|--------------------------------------|
| a  | [container 1] | [dimensions] | [existing elements or "none"] |
| b  | [container 2] | [dimensions] | [existing elements or "none"] |
| c  | [container 3] | [dimensions] | [existing elements or "none"] |

COLLISION ALERT (only if elements exist at target position):
Existing elements at target position:
• [Element name] — position: [value], z-index: [value], dimensions: [value]
• [Element name] — position: [value], z-index: [value], dimensions: [value]

Collision resolution options:
a. Place the new element offset from the existing element (adjust coordinates)
b. Place the new element on top with a higher z-index
c. Move the existing element to a different position
d. Use a different target position entirely

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE C — IMPLICIT PATTERN AMBIGUITY

"[style directive]" — Found [N] existing patterns in codebase:

| ID | Value | Where It Is Used | File Count |
|----|-------|------------------|------------|
| a  | [value] | [context] | [N] files |
| b  | [value] | [context] | [N] files |
| c  | [value] | [context] | [N] files |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE D — BEHAVIORAL AMBIGUITY

"[behavioral term]" — Possible implementations:

| ID | Implementation | Trade-offs | Effort |
|----|---------------|------------|--------|
| a  | [approach 1] | [pros/cons] | [low/medium/high] |
| b  | [approach 2] | [pros/cons] | [low/medium/high] |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE E — SCOPE AMBIGUITY

"[scope term]" — Possible scopes:

| ID | Scope | Affected Files | Affected Instances |
|----|-------|---------------|-------------------|
| a  | [narrow scope] | [count] | [count] |
| b  | [medium scope] | [count] | [count] |
| c  | [broad scope] | [count] | [count] |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 CLARIFICATION REQUIRED

Please specify:
1. [Question for ambiguity 1] — options: [list IDs]
2. [Question for ambiguity 2] — options: [list IDs]
...

Reply with your choices, for example: "1a, 2b, 3c"
```

---

## Step 3: Wait for Clarification

**This step is a hard gate.** You present the disambiguation report. You wait for the human to choose. You do not write any code until the human chooses.

Correct behavior at this step:
- Present the disambiguation report
- Wait for the human to reply
- Make no changes to any files

### Handling Partial Clarification

If the human answers some questions but skips others:

1. Apply the answers they provided
2. Re-present only the unanswered questions:

```
✓ Received your answers for questions 1 and 3.

Still need clarification on:
2. Which container for "bottom right"? (a: viewport / b: content area / c: sidebar)
4. Which padding pattern? (a: 8px / b: 16px / c: 24px)

Please specify.
```

3. Wait for the human to reply again. Do not proceed until all questions have answers.

### Handling "You Decide" Responses

If the human says "you pick" or "whatever makes sense" or "your call":

1. State your recommendation with explicit reasoning
2. Ask the human to confirm your recommendation

```
You asked me to choose. Here is my recommendation with reasons:

• Element: (a) SuccessToast — I recommend this because it is the only element with bg-green that functions as a notification
• Container: (b) content area — I recommend this because the toast currently renders inside the content area, and moving it to the viewport would change its rendering context
• Padding: (b) 16px — I recommend this because 16px is used by 23 files for similar-sized elements, making it the most consistent choice

Proceed with these choices? Reply 'yes' to confirm, or provide different choices.
```

**Wait for the human to confirm. Do not proceed on "you decide" alone — always state your recommendation and get a confirmation.**

---

## Step 4: Execute with Explicit Parameters

After the human replies with their choices (and all questions are answered), state the resolved parameters explicitly before making any changes:

```
✓ CLARIFICATION RECEIVED

Proceeding with these exact parameters:
• Element: [specific element from human's choice]
• Position: [specific container and coordinates from human's choice]
• Collision resolution: [specific strategy from human's choice]
• Style values: [specific values from human's choice, with source reference]

DETAILED PLAN:
1. Target element: [file path]
2. Position: [container] — [exact CSS values with calculations shown]
3. Style: [property]: [value] (source: [file:line where this pattern exists])
4. Z-index: [value] (rationale: [layer ordering explanation])

Applying changes...

[Show the actual code changes]

✓ COMPLETE
```

---

## Special Rules

### Rule A: "The [Thing]" Detection

When an instruction contains "the [thing]", always search the codebase for [thing] before acting:

1. Search the codebase for all instances of [thing] using multiple search strategies (see §VI)
2. Count the results:
   - **Found 0:** Report no match and suggest similar elements you did find
   - **Found 1:** Proceed — the reference is unique and unambiguous. State what you found.
   - **Found 2–5:** Build a standard disambiguation table
   - **Found 6–15:** Build a grouped disambiguation table
   - **Found 16+:** Escalate to large-scope protocol (§III)

Always search first. Always count results first. Always disambiguate when count is 2 or more.

### Rule B: Spatial Terms Require Explicit Anchors

When an instruction uses spatial terms (top, bottom, left, right, center, corner, above, below, beside, next to), check whether the instruction also specifies a reference container.

**An instruction is anchored if it says:** "bottom right **of the viewport**", "below **the header**", "center **of the modal**" — the spatial term is followed by an explicit container reference.

**An instruction is unanchored if it says:** "bottom right", "center it", "move it down" — the spatial term has no container reference.

If the instruction is unanchored:
1. Identify all possible reference containers in the current context
2. Present them as options
3. Ask the human which container they mean
4. Wait for their reply

### Rule C: Style Inheritance Protocol

When a style value is missing from the instruction, follow this procedure in order:

**Step C1: Search for an existing pattern.** Look in this priority order:
1. Same element type (for example: if adding padding to a toast, look at other toasts in the codebase)
2. Same component family (for example: if adding padding to a notification, look at other notification-like components)
3. Design tokens (for example: a spacing scale file, a theme config, CSS custom properties, Tailwind config)
4. Same visual context (for example: if the element is in the sidebar, look at other sidebar elements)

**Step C2: Apply based on what you found:**
- **Found exactly one pattern:** Use it. State the source: "Using [value] — matches the pattern in [file:line]."
- **Found 2+ patterns:** List all of them in a disambiguation table. Ask the human which pattern to use. Wait for their reply.
- **Found zero patterns:** Suggest a value from the standard spacing scale and ask the human to confirm:

```
No existing pattern found for [property] on elements of this type.
Suggestion: 16px (Tailwind spacing-4, a widely used default)
Alternatives: 12px (compact) or 24px (spacious)
Which do you prefer?
```

**Step C3: Use only standard spacing scale values.**
Valid values: 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96
Do not use values outside this scale (such as 15px, 18px, 22px, 13px) unless the codebase already uses them consistently. If the codebase uses non-standard values consistently, match the codebase — do not impose the standard scale on a codebase that does not use it.

### Rule D: Layout Collision Detection

Before placing any element at a position, scan the target position for existing elements:

1. Identify all elements at or near the target position using CSS inspection: look for `position: fixed`, `position: absolute`, `position: sticky` elements in the same stacking context
2. For each existing element, record: position property, z-index, dimensions (width × height), and visibility condition (always visible, or conditionally visible via state/media query)
3. Check for overlap: does the planned placement overlap with any existing element's bounding box?
4. If any overlap exists, present a collision alert with resolution options
5. Wait for the human to choose a resolution before proceeding

**Collision alert template:**

```
⚠️ COLLISION: Target position "[position description]" is occupied by:
• [Element 1] — position: [value], z-index: [value], size: [WxH], visibility: [always/conditional]
• [Element 2] — position: [value], z-index: [value], size: [WxH], visibility: [always/conditional]

Options:
a. Offset: Place new element [above/below/beside] existing element ([exact value] gap)
b. Layer: Place new element on top (z-index: [calculated value])
c. Relocate: Move existing element to [alternative position]
d. Alternative: Use [different position] instead

Which option?
```

---

# §V — COMBINED WORKFLOW

**Use when:** The request has BOTH large scope AND ambiguities.

**Ordering rule:** Resolve ambiguities FIRST, then build the Concept Scaffold. Reason: You cannot define "all X" until you know what "X" is.

---

## Phase 1: Resolve Ambiguities (§IV)

```
⚠️ COMBINED REQUEST DETECTED

This instruction contains:
☑ Large-scope work ("[quoted scope phrase]")
☑ Ambiguities: [list each ambiguity with its type]

PROTOCOL: Resolving ambiguities before building Concept Scaffold.

[Full disambiguation report — §IV Step 2 format]

Waiting for your clarification before proceeding to the large-scope scan...
```

**Wait for the human to reply with their choices.**

## Phase 2: Build Concept Scaffold (§III)

After the human resolves the ambiguities:

```
✓ AMBIGUITIES RESOLVED

Confirmed parameters:
• [Parameter 1]: [resolved value]
• [Parameter 2]: [resolved value]
• [Parameter 3]: [resolved value]

Now building Concept Scaffold for all [resolved concept]...

[Build all 4 artifacts — §III Step 1 format]

Does this scaffold look correct? Reply 'proceed' to start scan, or provide corrections.
```

**Wait for the human to approve the scaffold.**

## Phase 3: Execute Combined Changes

After the human approves the scaffold:
1. Run the exhaustive scan (§III Step 3)
2. Present scan results for verification (§III Step 4)
3. Wait for confirmation
4. Execute with tracking (§III Step 5)

Every gate from §III applies. Every gate from §IV applies. No shortcuts.

---

# §VI — SCANNING STRATEGIES

**Use during:** §III Step 3 (Exhaustive Scan) and §IV Step 2 (building disambiguation tables).

This section teaches you how to search a codebase thoroughly. Different codebases require different search strategies. Use multiple strategies per scan to catch patterns that one strategy alone would miss.

## Strategy 1: Keyword Search

Search for exact strings that match component names, class names, or identifiers.

**When to use:** Always. This is your primary search strategy.

**How to do it:**
1. Take every search term from your Pattern Inventory
2. Search every file in scope for each term
3. Record each match with file path and line number

**Limitations:** Keyword search misses elements that implement the concept without using the expected keywords. For example, a "box" implemented as `<div className="product-wrapper bg-white p-6 rounded shadow">` will not match a keyword search for "box" or "card" or "container."

## Strategy 2: Structural Pattern Search

Search for combinations of CSS properties or HTML/JSX/XML attributes that structurally match the concept, even if the keywords are different.

**When to use:** After keyword search, to catch instances that keyword search missed.

**How to do it (React/Next.js example):**
1. From your recognition rules, extract the structural pattern. Example: "has background + padding + (border OR shadow)"
2. Search for files containing combinations of these properties:
   - `bg-` combined with `p-` or `px-` or `py-` — Tailwind background + padding
   - `background` combined with `padding` — inline styles
   - `className=` containing both a color class and a spacing class
3. For each match, verify against the full recognition rules before counting it as an instance

**How to do it (Kotlin/XML Android example):**
1. From your recognition rules, extract the structural pattern. Example: "EditText or TextInputEditText with text change behavior"
2. Search for XML files containing:
   - `<EditText` or `<TextInputEditText` or `<com.google.android.material.textfield`
   - `android:inputType=` attribute
   - `TextWatcher` or `addTextChangedListener` in corresponding Kotlin files
3. For each match, verify against the full recognition rules

**Limitations:** Structural search can produce false positives. Always verify each match against your full recognition rules.

## Strategy 3: Import/Usage Tracing

If the concept is implemented as a reusable component, trace all import statements that reference it.

**When to use:** When the Pattern Inventory includes a dedicated component (like `<Box>`, `<Card>`, `<Button>`).

**How to do it:**
1. Find the component's definition file
2. Search the entire codebase for import statements referencing that file
3. In each importing file, find all usages of the imported component
4. Record each usage with file path and line number

**Limitations:** Import tracing only finds instances that use the component via import. It misses instances that reimplement the concept inline without importing the component.

## Strategy 4: Style/Theme Token Tracing

If the concept is connected to specific design tokens, theme values, or CSS custom properties, trace all usages of those tokens.

**When to use:** When the codebase has a design system with defined tokens.

**How to do it:**
1. Identify the relevant tokens (e.g., `--color-success`, `spacing.md`, `shadow.card`)
2. Search for all usages of each token across the codebase
3. For each usage, verify whether it belongs to the target concept

## Strategy 5: Visual Similarity Search

When other strategies are exhausted, scan files manually for elements that look visually similar to known instances, even if they use completely different code.

**When to use:** As a final pass after all other strategies, especially when the expected instance count has not been reached.

**How to do it:**
1. Pick a known instance from your Pattern Inventory
2. Note its visual characteristics: approximate size, color, shape, position on page
3. Scan remaining files for elements with similar visual characteristics
4. Verify each candidate against your recognition rules

## Multi-Strategy Scan Procedure

For a thorough scan, use strategies in this order:
1. **Keyword Search** — catches all instances using expected names
2. **Import/Usage Tracing** — catches all instances importing known components
3. **Structural Pattern Search** — catches instances using unexpected names but matching structure
4. **Style/Theme Token Tracing** — catches instances connected to design tokens
5. **Visual Similarity Search** — catches anything the other strategies missed

After all strategies complete, compare your total count to the Expected Range from your Scope Boundaries. If the count is below the low end of the range, you likely missed instances — re-examine your recognition rules and try broader search terms. If the count is above the high end, you likely have false positives — re-examine each match against your full recognition rules.

---

# §VII — ADVANCED SCENARIOS

## §VII-A: Multi-Concept Requests

**Use when:** The request targets two or more distinct types of element.

**Example:** "Standardize all buttons AND all inputs to use our design system"

**Procedure:**
1. Identify each distinct concept in the request. In this example: "buttons" and "inputs."
2. Build a separate Concept Scaffold for EACH concept. Each concept gets its own Semantic Definition, Pattern Inventory, Scope Boundaries, and Awareness Tracker.
3. Present ALL scaffolds to the human at once for approval.
4. After approval, scan for each concept separately, using its own scaffold.
5. Present combined scan results: one section per concept, with totals for each.
6. Execute changes for one concept at a time. Complete all changes for concept 1 before starting concept 2.

**Why separate scaffolds:** Different concepts have different recognition rules, different patterns, and different scope boundaries. Mixing them into one scaffold produces inaccurate results.

**Template for multi-concept presentation:**

```
MULTI-CONCEPT REQUEST DETECTED

Identified [N] distinct concepts:
1. [Concept 1 name]
2. [Concept 2 name]

Building separate scaffolds for each...

━━━ SCAFFOLD 1: [Concept 1] ━━━
[Full 4-artifact scaffold]

━━━ SCAFFOLD 2: [Concept 2] ━━━
[Full 4-artifact scaffold]

SHARED SCOPE NOTE: [N] files appear in both scaffolds' scope boundaries. Changes to these files will be applied for concept 1 first, then concept 2.

Both scaffolds look correct? Reply 'proceed' or provide corrections.
```

---

## §VII-B: Nested/Hierarchical Concepts

**Use when:** The target concept can contain instances of itself (nesting), or when parent-child relationships affect how instances should be counted and modified.

**Example:** "Standardize all cards" — but some cards are nested inside other cards.

**Procedure:**
1. During Pattern Inventory, explicitly check for nesting relationships
2. If nesting exists, add a nesting rule to the Semantic Definition:

```
NESTING DETECTED

Found [N] cases where [concept] is nested inside another [concept]:
• [file:line]: [outer element] contains [inner element]
• [file:line]: [outer element] contains [inner element]

Counting rules — choose one:
(a) Count ALL instances (both outer and inner) — total: [N]
(b) Count only OUTERMOST instances (skip nested children) — total: [M]
(c) Count only INNERMOST instances (skip parents that contain children) — total: [P]
(d) Count each level separately — outer: [M], inner: [P]

Which counting rule should I use?
```

3. **Wait for the human to choose.** Apply the chosen counting rule to the Awareness Tracker and scan.

---

## §VII-C: Cross-File Dependency Tracking

**Use when:** Changing one file forces changes in other files. This happens most often with shared components, utility functions, type definitions, and CSS classes.

**Procedure:**

1. **Map dependencies before executing.** For each instance you plan to change, check:
   - Is this element imported by other files? (If yes, list every importing file.)
   - Does this element export types, props, or interfaces that other files depend on? (If yes, list every dependent file.)
   - Does this element use CSS classes that are defined elsewhere? (If yes, note the source.)
   - Does this element use utility functions whose signature you are changing? (If yes, list every caller.)

2. **Present the dependency map to the human:**

```
DEPENDENCY MAP

Planned change: [describe the change]
Direct target: [file:line]

Files that import or depend on this target:
1. [file path] — imports [what] — will need: [describe required update]
2. [file path] — imports [what] — will need: [describe required update]
3. [file path] — uses type [what] — will need: [describe required update]
...

Total files affected: [N] (1 direct + [N-1] dependencies)

Proceed with all [N] files? Or modify only the direct target?
```

3. **Wait for the human to approve the full scope.**

4. **Execute in dependency order:** Change the source file first, then update all dependent files. This order prevents intermediate broken states.

---

## §VII-D: Mid-Scan Discovery Recovery

**Use when:** During a scan (§III Step 3), you discover a pattern that is not in your Pattern Inventory but clearly matches the Semantic Definition.

**Procedure:**

1. **Pause the scan.** Do not skip the discovery. Do not silently add it.

2. **Report the discovery:**

```
⚠️ NEW PATTERN DISCOVERED DURING SCAN

While scanning [file:line], I found an instance that matches the Semantic Definition but uses a pattern not in the Pattern Inventory:

New pattern: [describe the pattern]
Example: [show the code]
Why it matches: [explain which recognition rules it satisfies]

Current Pattern Inventory has [N] patterns. This would be pattern [N+1].

Options:
(a) Add this pattern to the inventory and continue scanning (I will re-scan already-completed files for this new pattern)
(b) Exclude this pattern — it is not what you mean by "[concept]"
(c) Pause scan entirely — you want to review the full inventory before continuing

Which option?
```

3. **Wait for the human to choose.**

4. **If the human chooses (a):** Add the pattern, then re-scan all files already marked ✓ for the new pattern only. Update the Awareness Tracker with any new instances found.

---

# §VIII — CONTEXT WINDOW MANAGEMENT

**Use when:** The scope involves more files or more instances than you can hold in working memory at once.

## Indicators That You Need This Section

- The file list in Scope Boundaries has 50+ files
- The expected instance count is 100+
- You find yourself losing track of earlier scan results while processing later files
- The Awareness Tracker is getting too long to display fully

## Chunking Strategy

Divide the scope into chunks of 10–15 files each. Process one chunk at a time. Maintain a summary across chunks.

**Procedure:**

1. **Divide files into chunks.** Group by folder, by feature area, or simply by file list order. Each chunk should have 10–15 files.

```
SCOPE CHUNKING

Total files: [N]
Chunk size: [10-15]
Number of chunks: [M]

Chunk 1: [file list]
Chunk 2: [file list]
...
Chunk M: [file list]

Processing chunk 1 of [M]...
```

2. **Process each chunk fully.** For each chunk:
   - Scan all files in the chunk
   - Record all instances found
   - Mark all files as ✓ in the Awareness Tracker
   - Output a chunk summary:

```
CHUNK [K] of [M] COMPLETE

Files scanned in this chunk: [count]
Instances found in this chunk: [count]

Running totals:
• Total files scanned: [cumulative count] of [N]
• Total instances found: [cumulative count]

Proceeding to chunk [K+1]...
```

3. **After all chunks are complete,** compile the full instance list from all chunk summaries.

## Cross-Chunk Instance Tracking

Maintain a running instance list across chunks. After each chunk, append new instances to the master list. The master list uses continuous numbering (instance 1, 2, 3... across all chunks).

```
MASTER INSTANCE LIST (updated after chunk [K])

1. [file:line] — [pattern] — [description] (chunk 1)
2. [file:line] — [pattern] — [description] (chunk 1)
...
45. [file:line] — [pattern] — [description] (chunk 3)
46. [file:line] — [pattern] — [description] (chunk 4)

Total: [N] instances across [M] chunks
```

---

# §IX — BATCH EXECUTION & CHECKPOINTING

**Use when:** You need to apply changes to 20 or more instances.

## Why Batch Execution Matters

Applying 50+ changes in one pass without stopping creates risk:
- If a change is wrong, all subsequent changes may also be wrong
- The human cannot review 50 changes at once
- A failure mid-way through can leave the codebase in an inconsistent state

## Batch Procedure

1. **Divide instances into batches of 5–10.** Group by file (all changes in one file = one batch) or by pattern (all instances of pattern A = one batch).

```
BATCH EXECUTION PLAN

Total changes: [N]
Batch size: [5-10]
Number of batches: [M]

Batch 1: Instances [1-8] — [file(s) affected]
Batch 2: Instances [9-16] — [file(s) affected]
...

Starting with batch 1...
```

2. **Execute one batch at a time.** After each batch, present a checkpoint:

```
CHECKPOINT — Batch [K] of [M] complete

Changes applied in this batch:
✓ [instance] — [file:line] — [what changed]
✓ [instance] — [file:line] — [what changed]
...

Running totals:
• Applied: [cumulative count]
• Remaining: [remaining count]
• Exceptions so far: [count]

Continue to batch [K+1]? Reply 'continue' or 'pause' to review.
```

3. **Wait for the human to reply 'continue' before proceeding to the next batch.**

4. **If the human says 'pause':** Stop execution. Present the current state clearly:
   - Which instances have been changed
   - Which instances have not been changed yet
   - Any exceptions encountered
   - How to resume later

## Rollback Documentation

For every batch, maintain a rollback log:

```
ROLLBACK LOG — Batch [K]

To undo these changes, restore the following original values:
1. [file:line]: change [new value] back to [old value]
2. [file:line]: change [new value] back to [old value]
...
```

Present the complete rollback log in the Final Report (§III Step 5).

---

# §X — INTEGRATION PROTOCOLS

## §X-A: Integration with app-audit Skill

When running an app-audit and the audit reveals issues that match this skill's trigger conditions:

1. **Large-scope audit findings.** If the audit finds "inconsistent button styles across 15 files," this is a large-scope issue. Hand off to §III.

```
AUDIT FINDING → SCOPE PROTOCOL HANDOFF

Audit category: [e.g., "Visual Design"]
Finding: [e.g., "Inconsistent button styles"]
Affected files: [count]

This finding requires the large-scope protocol (§III).
Building Concept Scaffold for "[concept]"...
```

2. **Ambiguous audit recommendations.** If the audit recommends "fix the layout issue" but the codebase has multiple layout concerns, this is an ambiguity issue. Hand off to §IV.

**Handoff rules:**
- The audit skill identifies WHAT needs fixing
- This skill identifies WHERE all instances are and resolves any ambiguity about WHAT EXACTLY should change
- The audit skill does not execute changes — this skill handles execution

## §X-B: Integration with design-aesthetic-audit Skill

When the design-aesthetic-audit identifies visual inconsistencies:

1. **Map the inconsistency to a concept.** The aesthetic audit may say "shadows are inconsistent." This skill translates that into a Concept Scaffold for "shadow-bearing elements."

2. **Inherit pattern data from the audit.** If the aesthetic audit already cataloged shadow patterns (e.g., "3 shadow variants found"), use that data as the starting point for the Pattern Inventory instead of re-scanning.

3. **Feed resolved data back to the audit.** After this skill resolves all instances and standardizes them, report the results back in a format the aesthetic audit can incorporate:

```
SCOPE RESOLUTION COMPLETE — Feeding back to design-aesthetic-audit

Concept: [name]
Total instances resolved: [N]
Standardized to: [describe the target pattern]
Files modified: [list]

This information updates the audit's [category] section.
```

## §X-C: Integration with scope-context Itself (Recursive Use)

Sometimes resolving one ambiguity or scanning one concept reveals a second issue that also requires this skill.

**Example:** While building the Concept Scaffold for "all buttons," you discover that the codebase also has inconsistent "icon buttons" that are different from regular buttons. The human now asks: "Actually, standardize those too."

**Procedure:**
1. Complete the current protocol for the first concept before starting the second
2. Build a separate Concept Scaffold for the second concept
3. Note any overlap between the two concepts (instances that belong to both)

Do not try to handle two concepts with one scaffold. Always use separate scaffolds for separate concepts (per §VII-A).

---

# §XI — QUICK REFERENCE

## Checklists

### Pre-Flight Checklist (Run on Every Request)

☐ Large-scope? (affects 10+ files OR uses "all/every" language)
   → If yes: Go to §III

☐ Multi-concept? (targets 2+ distinct element types)
   → If yes: Go to §VII-A

☐ Has cross-file dependencies? (changing one file forces changes in others)
   → If yes: Go to §VII-C

☐ Ambiguous references? ("the X" when multiple X elements might exist)
   → If yes: Go to §IV (Type A)

☐ Spatial terms without explicit anchors? ("bottom right" without specifying the container)
   → If yes: Go to §IV (Type B)

☐ Style directives without explicit values? ("add padding" without specifying the amount)
   → If yes: Go to §IV (Type C)

☐ Behavioral ambiguity? ("make it responsive" without specifying how)
   → If yes: Go to §IV (Type D)

☐ Scope ambiguity? ("fix the styling" without specifying what scope)
   → If yes: Go to §IV (Type E)

☐ Both large-scope AND ambiguous?
   → If yes: Go to §V (resolve ambiguity FIRST, then build scaffold)

### Large-Scope Checklist (§III)

☐ Built Semantic Definition (Artifact 1) with core purpose, visual/functional/data signatures, and exclusions
☐ Built Pattern Inventory (Artifact 2) with all known patterns, recognition rules, and search terms
☐ Built Scope Boundaries (Artifact 3) with include/exclude folders, file list, and expected range
☐ Built Awareness Tracker (Artifact 4) with full file list and progress log
☐ Checked for concept drift (§III Step 6) — flagged divergent groups if found
☐ Presented scaffold to human — waited for explicit approval
☐ Completed exhaustive scan using multiple strategies (§VI)
☐ Recorded borderline cases separately
☐ Presented scan results to human — waited for explicit confirmation
☐ Executed changes with progress tracking (counter: X of N)
☐ Reported final results with exception details and rollback log
☐ For 20+ changes: used batch execution with checkpoints (§IX)

### Ambiguity Resolution Checklist (§IV)

☐ Identified which ambiguity types are present (A, B, C, D, E)
☐ Searched codebase for all candidates per detected type (listed every match)
☐ Applied graduated disambiguation (0/1/2-5/6-15/16+ candidates)
☐ Built disambiguation report with tables for each ambiguity type
☐ Checked for collisions at target position (if Type B is present)
☐ Searched for existing style patterns in codebase (if Type C is present)
☐ Presented disambiguation report to human — waited for their choices
☐ Handled partial clarification if human skipped questions (re-presented unanswered ones)
☐ Handled "you decide" response (stated recommendation + asked for confirmation)
☐ Stated the resolved parameters explicitly before making any changes
☐ Applied changes using only the parameters the human chose

---

## Templates

### Concept Scaffold Template

```
CONCEPT SCAFFOLD — [Name of the thing]

1. SEMANTIC DEFINITION
   • Core purpose: [one sentence]
   • Visual signature: [one sentence]
   • Functional signature: [one sentence]
   • Data signature: [one sentence]
   • Excluded: [list with reasons]

2. PATTERN INVENTORY
   Known implementations:
   - [Pattern 1] — [file path]
   - [Pattern 2] — [file path]

   Recognition rules:
   • MATCHES IF: [required properties]
   • ALSO MATCHES IF: [alternative required properties]
   • DOES NOT MATCH IF: [disqualifying properties]

   Search terms:
   • Primary: [component/class names]
   • Secondary: [CSS/style properties]
   • Structural: [element patterns]

3. SCOPE BOUNDARIES
   INCLUDE: [folders/files/contexts]
   EXCLUDE: [folders/files/contexts with reasons]
   FILE LIST: [enumerated list]
   EXPECTED RANGE: [low]-[high] instances

4. AWARENESS TRACKER
   Total files: [N]
   Files scanned: 0
   Instances found: 0
   STATUS: 0%
   COMPLETION CONDITION: [N] of [N] files scanned (100%)
```

### Disambiguation Report Template

```
⚠️ AMBIGUITY DETECTED

Original: "[instruction text]"
Types found: [list]

TYPE A — Referential: "[term]"
| ID | Element | Location | Details |
|----|---------|----------|---------|
| a  | [...] | [...] | [...] |

TYPE B — Spatial: "[term]"
| ID | Container | Dimensions | Elements at Position |
|----|-----------|------------|---------------------|
| a  | [...] | [...] | [...] |

TYPE C — Implicit: "[term]"
| ID | Value | Usage Context | File Count |
|----|-------|---------------|------------|
| a  | [...] | [...] | [...] |

TYPE D — Behavioral: "[term]"
| ID | Implementation | Trade-offs | Effort |
|----|---------------|------------|--------|
| a  | [...] | [...] | [...] |

TYPE E — Scope: "[term]"
| ID | Scope | Files | Instances |
|----|-------|-------|-----------|
| a  | [...] | [...] | [...] |

CLARIFICATION REQUIRED:
1. [Question] — options: [IDs]
2. [Question] — options: [IDs]
```

### Dependency Map Template

```
DEPENDENCY MAP

Planned change: [description]
Direct target: [file:line]

Dependent files:
1. [file] — imports [what] — needs: [update description]
2. [file] — uses type [what] — needs: [update description]

Total affected: [N] files
```

### Batch Checkpoint Template

```
CHECKPOINT — Batch [K] of [M]

Applied:
✓ [instance] — [file:line] — [change]
...

Totals: [applied]/[total] done, [remaining] left, [exceptions] exceptions
Continue to batch [K+1]? Reply 'continue' or 'pause'.
```

---

## Correct Behavior Patterns

These are the patterns you follow. Each describes what you do and what you say.

**When you find multiple instances of "all X":**
- You say: "Found [exact count] instances across [exact count] files. Full list attached. Confirm before I make changes."

**When an instruction is ambiguous:**
- You say: "Ambiguity detected. [Type] ambiguity on '[term]'. Found [count] candidates. Which one? [table]"

**When a style value is missing:**
- You say: "Using [value] — this matches the existing pattern in [file:line]."
- Or: "Found [count] existing patterns for [property]. Which one? [table]"
- Or: "No existing pattern found. Suggesting [value] from standard scale. Confirm?"

**When a collision exists at the target position:**
- You say: "Collision at [position]. [Element] (z-[value], [WxH], [visibility]) is already there. Options: [table]. Which one?"

**When you discover a new pattern mid-scan:**
- You say: "New pattern found at [file:line]. It matches the semantic definition but is not in the inventory. Add it? [options]"

**When the human says "you decide":**
- You say: "Here is my recommendation with reasons: [recommendation]. Proceed with these choices? Confirm yes or provide different choices."

---

## Incorrect Behavior Patterns — Protocol Violations

These are protocol violations. Each describes a specific failure and why it is wrong.

**Reporting partial results as complete:**
- "I've updated the main instances..." — The word "main" indicates you know you missed others. Violation of §III: scan every file.
- "Fixed several boxes across the app..." — "Several" is not a count. Violation of §III: report exact numbers.
- "Updated most of the buttons..." — "Most" means you stopped before finishing. Violation of §III: complete the Awareness Tracker.

**Making assumptions instead of asking:**
- "I'll assume you meant [X]..." — You are guessing. Violation of §IV: present options and ask.
- "Let me know if this is wrong..." (after already making changes) — You acted before confirming. Violation of §IV Step 3: wait for clarification before executing.
- "I picked the most common one..." — Frequency does not indicate intent. Violation of §IV Step 3: ask the human.

**Using arbitrary values:**
- Using 15px, 18px, 22px, or other non-scale values when the codebase uses a standard scale — Violation of Rule C: search for existing patterns, use standard scale values.

**Skipping gates:**
- Making changes without building the scaffold first — Violation of §III Step 2: get approval before scanning.
- Making changes without the human confirming scan results — Violation of §III Step 4: wait for verification.
- Making changes without the human choosing disambiguation options — Violation of §IV Step 3: wait for clarification.
- Declaring "done" without a final report — Violation of §III Step 5: always produce the final report with exception details.

---

## Trigger Phrases

| Human Says | You Do |
|------------|--------|
| "all boxes", "every button", "standardize cards" | §III — Build Concept Scaffold |
| "all buttons AND all inputs" | §VII-A — Multi-concept: one scaffold per concept |
| "the green box" (when multiple green elements exist) | §IV Type A — Referential disambiguation |
| "bottom right", "center", "below the header" | §IV Type B — Spatial disambiguation |
| "add padding", "make bigger", "add shadow" | §IV Type C — Pattern inheritance |
| "make it responsive", "handle errors" | §IV Type D — Behavioral disambiguation |
| "fix the styling", "clean up the code" | §IV Type E — Scope disambiguation |
| "make all boxes use consistent padding" | §V — Combined: resolve ambiguity FIRST, then build scaffold |
| "update the Button component" (shared component with 30 importers) | §VII-C — Map dependencies before changing |

---

## Integration Hooks

Add this check to your main **skills.md** or **Pre-Flight Checklist** in other skills:

```
### Scope & Context Check
Before any work, check:
- Large-scope request? → SCOPE_AND_CONTEXT.md §III
- Ambiguous instruction? → SCOPE_AND_CONTEXT.md §IV
- Both? → SCOPE_AND_CONTEXT.md §V
- Multi-concept? → SCOPE_AND_CONTEXT.md §VII-A
- Cross-file dependencies? → SCOPE_AND_CONTEXT.md §VII-C

Always complete the appropriate protocol before writing code.
```

---

## Examples in Action

### Example 1: Large-Scope Only

**Human:** "Standardize all button styles"

**You:**

```
Pre-flight: Large-scope detected (affects 10+ files, uses "all" language). → §III

CONCEPT SCAFFOLD — Buttons

1. SEMANTIC DEFINITION
   • Core purpose: Interactive elements that trigger actions when clicked
   • Visual signature: Clickable surface with a text label or icon
   • Functional signature: Has an onClick handler; may have disabled or loading states
   • Data signature: Receives onClick, disabled, children, variant, size as props
   • Excluded:
     - Links styled as buttons: excluded because they navigate to URLs (use href, not onClick)
     - Icon-only toggles: excluded if they toggle state rather than trigger a one-time action

2. PATTERN INVENTORY
   Found 5 implementations:
   a. <Button> component — src/components/ui/Button.tsx
   b. <button className="btn-primary"> — legacy files
   c. <button className="btn-secondary"> — legacy files
   d. Raw <button> with inline styles — very old files
   e. <a className="btn-*"> — needs review (may be navigation links, not buttons)

   Recognition rules:
   • MATCHES IF: element is <button> or <Button> AND has onClick
   • ALSO MATCHES IF: element has role="button" AND has onClick
   • DOES NOT MATCH IF: element is <a> with href (that is navigation)

   Search terms:
   • Primary: "Button", "button", "btn-"
   • Secondary: "onClick", "role=\"button\""
   • Structural: "<button" elements in JSX files

3. SCOPE BOUNDARIES
   INCLUDE: src/app/*, src/components/*
   EXCLUDE: src/emails/* (email templates use different styling context — inline CSS only)
   EXPECTED RANGE: 40-80 instances

4. AWARENESS TRACKER
   Total files: 45
   Files scanned: 0
   Instances found: 0
   STATUS: 0%
   COMPLETION CONDITION: 45 of 45 files scanned (100%)

Does this scaffold look correct? Reply 'proceed' to start scan, or provide corrections.
```

### Example 2: Ambiguity Only

**Human:** "Move the modal to the center"

**You:**

```
Pre-flight: Ambiguity detected (Type A: "the modal" — multiple modals may exist; Type B: "center" — no anchor specified). → §IV

⚠️ AMBIGUITY DETECTED

Original instruction: "Move the modal to the center"
Types found: A (referential), B (spatial)

TYPE A — "the modal" — Found 3 candidates:
| ID | Modal | Visibility | Location |
|----|-------|------------|----------|
| a  | LoginModal | Hidden by default | src/components/LoginModal.tsx |
| b  | ConfirmDialog | Conditionally shown | src/components/ConfirmDialog.tsx |
| c  | ImageLightbox | Photo viewer | src/components/ImageLightbox.tsx |

TYPE B — "center" — Possible reference containers:
| ID | Container | Current State |
|----|-----------|---------------|
| a  | Viewport center | Responsive to window size changes |
| b  | Content area center | Excludes sidebar width |
| c  | Vertical + horizontal center | True center of chosen container |
| d  | Horizontal center only | Top-aligned, horizontally centered |

📋 CLARIFICATION REQUIRED:
1. Which modal? (a/b/c)
2. Which centering? (a/b/c/d)

Reply with your choices, for example: "1a, 2c"
```

### Example 3: Combined (Ambiguity + Large Scope)

**Human:** "Make all the green boxes use consistent padding and place them at the bottom right"

**You:**

```
Pre-flight: Combined request detected.
- Large-scope: "all the green boxes" — affects multiple files
- Type A ambiguity: "the green boxes" — which elements?
- Type C ambiguity: "padding" — what value?
- Type B ambiguity: "bottom right" — of what container?
→ §V (resolve ambiguity FIRST, then build scaffold)

Phase 1: Resolving ambiguities...

⚠️ AMBIGUITY REPORT

TYPE A — "green boxes" — Found 3 candidates:
| ID | Element | Type | Location |
|----|---------|------|----------|
| a  | Success toast | Notification | Bottom-left currently |
| b  | Help tooltip | Floating tip | Context-dependent position |
| c  | Debug panel | Developer tool | Bottom-right currently |

TYPE B — "bottom right" — Possible containers:
| ID | Container | Elements Already There |
|----|-----------|------------------------|
| a  | Desktop viewport (1920px) | None |
| b  | Mobile viewport (375px) | Bottom nav (56px height) |

TYPE C — "padding" — Found 3 existing patterns:
| ID | Value | Usage Context |
|----|-------|---------------|
| a  | 8px | Small UI elements (buttons, tags) |
| b  | 16px | Mobile toasts and cards |
| c  | 24px | Desktop page containers |

📋 CLARIFICATION REQUIRED:
1. Which element? (a/b/c)
2. Which viewport? (a/b)
3. Which padding? (a/b/c)
```

**Human:** "a, b, b"

**You:**

```
✓ Ambiguities resolved:
• Element: Success toast (bg-green notification)
• Container: Mobile viewport, above bottom nav
• Padding: 16px (mobile toast pattern)

Phase 2: Building Concept Scaffold for all success toasts...

CONCEPT SCAFFOLD — Success Toast Components

1. SEMANTIC DEFINITION
   • Core purpose: Notification element that confirms a successful action
   • Visual signature: Green background, text content, appears temporarily
   • Functional signature: Renders on success events, auto-dismisses or has close button
   • Data signature: Receives message string, optional duration, optional onClose
   • Excluded:
     - Error toasts: excluded because they use red background and indicate failures
     - Info toasts: excluded because they use blue background and are informational
     - Loading indicators: excluded because they indicate pending state, not completion

[...full scaffold with all 4 artifacts...]

Found 8 instances across 5 files. Proceed?
```

### Example 4: Multi-Concept

**Human:** "Standardize all buttons and all input fields"

**You:**

```
Pre-flight: Multi-concept detected — two distinct concepts: "buttons" and "input fields". → §VII-A

Building separate scaffolds...

━━━ SCAFFOLD 1: Buttons ━━━
[Full 4-artifact scaffold for buttons]

━━━ SCAFFOLD 2: Input Fields ━━━
[Full 4-artifact scaffold for input fields]

SHARED SCOPE NOTE: 12 files appear in both scaffolds' scope boundaries. Changes to these files will be applied for buttons first, then input fields.

Both scaffolds look correct? Reply 'proceed' or provide corrections.
```

### Example 5: Mid-Scan Discovery

**You (mid-scan):**

```
⚠️ NEW PATTERN DISCOVERED DURING SCAN

While scanning src/app/legacy/checkout.tsx:89, I found an instance that matches the Semantic Definition but uses a pattern not in the Pattern Inventory:

New pattern: <div role="button" onClick={...} className="legacy-action">
Example: <div role="button" onClick={handleCheckout} className="legacy-action checkout-btn">
Why it matches: Has role="button" AND has onClick — satisfies recognition rule 2

Current Pattern Inventory has 5 patterns. This would be pattern 6.

Options:
(a) Add this pattern to the inventory and re-scan already-completed files for it
(b) Exclude this pattern — it is not what you mean by "buttons"
(c) Pause scan entirely — you want to review before continuing

Which option?
```

---

## Maintenance & Evolution

### When to Update This Skill

**Add new ambiguity types when:**
- You encounter repeated misunderstandings in a category not covered by Types A–E
- The project introduces domain-specific jargon that needs precise definition
- New layout paradigms are adopted (container queries, CSS subgrid, view transitions)

**Add new scanning strategies (§VI) when:**
- The codebase adopts a new framework with different component patterns
- New tooling becomes available for code search (AST parsers, IDE integrations)
- Existing strategies consistently miss instances in a specific pattern category

**Add new pattern examples when:**
- The codebase introduces new component types
- A new framework or library is adopted
- New design system tokens are established
- A platform-specific pattern is discovered (Android, iOS, desktop)

### Changelog

```
## Changelog

### v2.1 (2026-04-25)
- Added §VI: Scanning Strategies (5 strategies with multi-strategy procedure)
- Added §VII: Advanced Scenarios (multi-concept, nested, cross-dependency, mid-scan discovery)
- Added §VIII: Context Window Management (chunking for 50+ file scopes)
- Added §IX: Batch Execution & Checkpointing (safe execution of 20+ changes)
- Added §X: Integration Protocols (app-audit, design-aesthetic-audit, recursive use)
- Added Type D (behavioral) and Type E (scope) ambiguity types
- Added graduated disambiguation (0/1/2-5/6-15/16+ candidate handling)
- Added partial clarification and "you decide" handling procedures
- Added concept drift detection as mandatory check during scaffold building
- Added mid-scan discovery recovery procedure
- Added rollback documentation to execution output
- Added data signature to Semantic Definition template
- Added search terms to Pattern Inventory template
- Added file list enumeration to Scope Boundaries template
- Added completion condition to Awareness Tracker template
- Added borderline case tracking to scan output
- Added stack-specific examples (React/Next.js, Kotlin/XML Android)
- Added problem severity indicators table to §I

### v2.0 (2026-04-25)
- Rewritten for Opus 4.7 behavioral profile
- All instructions use positive framing
- All metaphorical language replaced with literal operational language
- All implicit instructions made explicit
- Contradictions between sections resolved
- Every gate step explicitly states: "wait for the human to reply"

### v1.0 (original)
- Initial combined skill (merged CONCEPTUAL_SCOPE + CONTEXT_RESOLUTION)
- Covers large-scope and ambiguity resolution
```

---

# END OF SCOPE_AND_CONTEXT.md
