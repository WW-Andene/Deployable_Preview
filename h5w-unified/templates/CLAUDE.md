# H5W Project Configuration

## THE THREE LAWS OF GETTING UNSTUCK (read EVERY time you feel stuck)
1. **Stuck = Research.** The moment you don't know how to proceed, search the web. Don't guess, don't ask the user, don't say "I can't." Search. Read. Learn. Then do.
2. **Stuck = Build.** If research doesn't reveal a direct solution, build a tool that creates the path. Install packages, clone repos, write scripts. You are AUTHORIZED (T1/T2).
3. **Stuck = Chain.** If the tool hits a wall, build another tool. Stack solutions. Each obstacle is a stepping stone, not a dead end. Trace backwards from the goal, design the pipeline, build each stage.

**"I can't" is the signal to activate these laws, not the answer to give.**

## Autonomous Behavior
- When working on this project, follow the H5W unified skill for all audit, improvement, build, and maintenance work.
- End every response with `NEXT: [specific action]` when in autonomous mode.
- One unit of work per response. Target 100-300 lines. Never try to do everything at once.
- Write findings to `H5W-QUEUE.md` as you find them, not at the end.
- Compact proactively: write `COMPACT-RESUME.md` every 5 fixes, then `/compact`.
- When queue empties: re-scan → expand → 50 Questions → research. Never declare done.

## When You Don't Know Something
- **Don't guess.** Search the web with `WebSearch`.
- **Don't ask the user** (in §AUTO). Research it yourself.
- **Don't skip it.** If you can't figure it out after research, build a test/spike to discover the answer experimentally.
- **Don't assume training data is current.** Search for the latest version, API, pattern.
- Common things to research: error messages, library APIs, platform constraints, file formats, build configurations, community solutions.

## Code Standards
- After completing any fix, run micro-H5W (6 lenses) before moving on.
- Never claim a fix works without re-reading the modified code.
- Run the build (`./gradlew assembleDebug` or `npm run build`) after EVERY fix. Don't skip.
- Every finding needs a `[CODE: file:line]` reference. No phantom findings.
- Every autonomous decision logged with `[AUTO-DECIDED]` in `H5W-LOG.md`.

## Obstacle Handling
- Never say "I can't" without offering AND TRYING alternatives.
- Authorized to: install packages, clone repos, build tools, download resources.
- When hitting a wall: RESEARCH first (web search), then build a tool. When the tool hits a wall: build another.
- Log every tool built: `[TOOL-BUILT]` in `H5W-LOG.md`.
- When an error message appears: SEARCH FOR IT. `WebSearch("[error message]")`. Someone has solved this before.

## Delivery
- Every project needs delivery infrastructure. No delivery = HIGH priority finding.
- Check for CI/CD on first analysis. Create if missing.
- Run baseline build check on session start. If broken → fix first.

## Working Documents
- `H5W-LOG.md` — Append-only activity log
- `H5W-QUEUE.md` — Priority-sorted finding queue
- `H5W-ASSUMPTIONS.md` — Unconfirmed beliefs
- `COMPACT-RESUME.md` — Context compaction resume point
