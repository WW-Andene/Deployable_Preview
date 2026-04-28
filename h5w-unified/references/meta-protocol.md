---
name: meta-protocol
description: >
  Self-improvement & skill audit protocol. Audit the H5W skill, its modules, or any other skill file. Lens-adapted for skill files. In §AUTO mode: PROPOSALS ONLY — never auto-merges to live skill files. Loaded on demand.
---

> **MODULE: meta-protocol** — Domain protocol for the H5W unified system.
>
> **Invoked when:** Chief Guide §TRIAGE detects skill audit work — "improve the skill", "self-audit", "meta", "audit [skill name]".
>
> **Receives:** Chief Guide §0 (filled), §I calibration (classified).
> **Uses:** Chief Guide §LAW, §FMT, §SRC, §REV, §VER, §DOC — do NOT re-derive.
> **Returns:** Findings/actions in §FMT format → H5W-QUEUE.md and H5W-LOG.md.
>
> **In §AUTO mode:** the §AUTO protocol (references/auto-mode.md) governs interactive vs autonomous behavior.
> See the §AUTO protocol (references/auto-mode.md) for FULL/GUIDED routing and the activation gate.

---

## §META — SELF-IMPROVEMENT & SKILL AUDIT PROTOCOL

> **H5W can audit and improve itself, its modules, and any other skill.**
> A skill file is a codebase. It has structure, conventions, patterns,
> contradictions, dead content, and missing coverage. The same H5W process
> applies — with adapted lenses.

### When §META Activates

- "Improve the skill itself" / "audit the H5W skill"
- "Audit this other skill" / "improve [skill name]"
- "Meta-improve" / "self-audit"
- In §AUTO: optionally after completing app work, if runway remains
- After a live test reveals a skill failure (Claude did something wrong
  because the instruction was unclear → fix the instruction)

### The Subject Shift

| App Audit Concept | §META Equivalent |
|-------------------|------------------|
| Codebase | Skill file(s) — markdown, YAML, structured text |
| User | Claude — the AI instance following the instructions |
| UI Screen | § section — a section Claude navigates to and executes |
| State | Execution context — what Claude knows at each point in the skill |
| Route/Navigation | § code references — how Claude jumps between sections |
| Empty state | Missing instruction — Claude encounters a situation with no guidance |
| Error state | Contradiction — two instructions conflict, Claude can't follow both |
| Component | Protocol block — a self-contained instruction unit |
| Data flow | Information flow — how context passes between sections |
| Touch target | Trigger phrase — how reliably does the right section activate? |

### H5W Lenses Adapted for Skills

**HOW — Instruction Mechanics:**
- How does Claude follow this instruction? Is the sequence clear?
- How does information flow from §0 to modules? Any gaps in handoff?
- How does Claude know when a section is "done" and what comes next?
- How does Claude resolve ambiguity when two sections could apply?
- Are there instructions that sound clear but produce wrong behavior?

**WHO — Claude as User:**
- Which Claude model/context is this optimized for? (Opus 4.7 vs Sonnet)
- Does the instruction assume capabilities Claude doesn't have?
- Does the instruction work with Claude Code CLI? Web? Both?
- Does a tired/long-context Claude still follow this correctly?
- Would a Claude instance with no prior context understand this?

**WILL — Instruction Edge Cases:**
- What happens if Claude encounters a situation not covered by any section?
- What happens if two Iron Laws contradict for a specific case?
- What happens if a module reference file is missing or corrupted?
- What happens if the app has a stack not covered by §PLAT?
- What happens if the §0 context block can't be filled (no code yet)?

**WHAT — Concrete Instruction Gaps:**
- What specific instruction is missing, wrong, or ambiguous?
- What is the root cause — bad wording, missing section, or structural gap?
- What is the minimum change to fix it? (Same Law 8 — minimum footprint)
- What's the impact radius — which other sections depend on this one?

**WHEN — Execution Timing:**
- When in the execution flow does Claude hit this instruction?
- When would Claude lose track of which section it's in?
- When does context window pressure cause Claude to forget instructions?
- When during long sessions do specific protocols get dropped?

**WHERE — Instruction Location:**
- Where in the skill file is the problem? (line, section, § code)
- Where else does the same pattern appear? (cross-reference consistency)
- Where should this instruction live architecturally?
  (Chief Guide vs module? Shared protocol vs domain-specific?)

### §META Finding Format

```
══════════════════════════════════════
SKILL FINDING: SF-[NNN]
TARGET: [SKILL.md | mod-name.md | other-skill.md]
══════════════════════════════════════
TYPE:     gap | contradiction | ambiguity | dead-content | optimization | missing-coverage
SEVERITY: critical (causes wrong behavior) | high (causes confusion) |
          medium (suboptimal) | low (polish) | enhancement

How:   [how Claude would misinterpret or fail to follow this]
Who:   [which Claude context/model is affected]
Will:  [what goes wrong if unfixed — concrete scenario]
What:  [exact text that's wrong + proposed fix]
When:  [when during execution this surfaces]
Where: [file:section:line or § code]

FIX:   [specific text change]
══════════════════════════════════════
```

### §META Audit Dimensions (for skill files)

| Dimension | What to Check |
|-----------|---------------|
| **Structural coherence** | Do all § codes in TOC resolve to actual sections? Do all cross-references work? Any orphaned content? |
| **Instruction clarity** | Could Claude misinterpret any instruction? Are conditionals explicit? Are defaults stated? |
| **Contradiction scan** | Do any two instructions conflict? (e.g., "always ask" vs "never ask in §AUTO") |
| **Coverage completeness** | Are there execution paths with no guidance? Situations not covered? |
| **Dead content** | Sections referenced nowhere? Instructions that can never trigger? |
| **Trigger accuracy** | Do trigger phrases route to the correct section? Any overlaps? Missing triggers? |
| **Hierarchy consistency** | Is the § numbering consistent? Are nesting levels logical? |
| **Example coverage** | Do critical sections have worked examples? Would Claude know what "good" looks like? |
| **Token efficiency** | Any section that's verbose without adding value? Repeated content? |
| **Platform coverage** | Does every platform-specific instruction cover all supported platforms? |
| **Cross-reference integrity** | Every "Chief Guide §X" reference → does §X exist and say what's expected? |
| **Module boundary clarity** | Is it always clear which module owns which concern? Any overlapping jurisdiction? |
| **§AUTO compatibility** | Does every interactive instruction have an §AUTO equivalent? |
| **Failure mode coverage** | Does the skill handle Claude running out of context? Hitting errors? Getting confused? |
| **Versioning** | Are version-dependent instructions marked? Would skill work on a different Claude version? |

### §META on Other Skills

H5W can audit any skill file — not just itself. The process:

```
META-AUDIT ON EXTERNAL SKILL:
  1. Read the skill file completely.
  2. Fill a lightweight context:
     - Skill name, purpose, trigger phrases
     - Target platform/stack
     - § structure map
  3. Run the 15 audit dimensions above.
  4. Produce findings in SF-[NNN] format.
  5. If §AUTO: fix the skill directly (T1/T2 edits).
  6. Verify: re-read, check cross-refs, check coherence.
```

### §META Self-Improvement Loop

After a live test reveals a skill failure:

```
FAILURE → IMPROVEMENT:
  1. Claude did something wrong during execution.
  2. Identify: was this a code bug, a judgment error, or a SKILL INSTRUCTION FAILURE?
  3. If skill instruction failure:
     a. What instruction was Claude following?
     b. What did Claude interpret it as?
     c. What should have happened instead?
     d. Write SF-[NNN] finding.
     e. Fix the instruction.
     f. Verify: would the fix prevent the original failure?
  4. Log in H5W-LOG.md: "Meta-fix: SF-001 — [instruction] was ambiguous,
     causing [wrong behavior]. Fixed to [new instruction]."
```

### Integration with §AUTO

In autonomous mode, §META runs as a final phase after app work — but its
output is **always proposals**, never live edits to the skill files Claude
is currently executing. Self-modification under autonomy without a human
merge step is the failure mode this gate prevents.

```
§AUTO CONTINUOUS LOOP (with §META):
  App work → §SIM.6 (50 Questions) → §SIM.7 (Research) →
  Queue empty, runway remains →
  §META: Self-audit the skill for improvements learned this session →
  Write proposals to: skill-improvements/SF-NNN.md (one file per finding)
                       (created relative to project root, not the skill dir)
  Report includes "Skill improvement proposals" section listing each SF-NNN
  with file path, target line range, proposed diff, rationale.

NEVER (in any §AUTO mode, including FULL):
  - Edit SKILL.md, references/*.md, or any file under the skill's own
    install path on behalf of §META findings
  - Merge proposals automatically
  - Apply diffs without an explicit user instruction in a later session

The user merges accepted proposals manually (or in a separate session
where they've reviewed the diffs).
```

---

