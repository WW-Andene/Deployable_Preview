# Brand Sources — DeployView 5-Layer Studies

Per Art Direction Engine 4.7 §SOURCE / §IMAGE. Each named source gets the
5-layer study, then the minimum authentic set, then the specific elements
transferable to DeployView and how they were applied (or rejected).

Sources picked for relevance to DeployView's positioning (developer tool,
operator-class density, void-terminal aesthetic, mobile-first via Termux):

1. **Linear** — design baseline for modern developer tools
2. **Vercel** — direct competitor in deployment / preview space
3. **Blade Runner 2049** — visual concept anchor (amber on void)
4. **Bloomberg Terminal** — operator-class density + monospace identity
5. **Foundation (Apple TV+)** — sterile precision-instrument calm

---

## Source 1 — Linear (linear.app)

### Layer 1 — Surface (what you see)

- **Palette**: near-black bg (~oklch 12% 0.005 270), purple/indigo accent
  (~oklch 65% 0.20 270), warm grays for text. Single-hue family.
- **Typography**: Inter Display (display) + Inter (body), tight tracking
  on display, 4 weights deployed. Uniform geometric sans.
- **Icons**: Lucide-derived custom set, 1.5px stroke, line style.
- **Spatial rhythm**: 4px base, 8/16/24/32 vertical rhythm. Dense
  information per row but generous gaps between sections.
- **Motion**: snappy 100-150ms transitions. Subtle hover lifts. The
  command palette opens with a 200ms ease-out spring.

### Layer 2 — Structure (the rules)

- **Hierarchy is type-weight + color, not size**: most labels are 13px.
  Difference between primary/secondary/muted is weight + tone, not scale.
- **The accent purple is restricted**: primary CTA, active filter, focused
  input ring. Never decorative.
- **Single-hue discipline**: every chromatic value derives from purple-blue.
  Even the success/error semantic colors get tinted toward the family hue.
- **Negative space is abundant between sections**, tight inside cards.
  Spatial contrast does the heavy lifting (per §COMPOSITION).
- **What's deliberately excluded**: gradients, illustrations, marketing
  language, decorative icons. The product is the brand.

### Layer 3 — Culture (where it came from)

- Tradition: Swiss design / functional minimalism, channeled through 2010s
  SaaS (Stripe, Notion). Specifically inherits Stripe's typographic
  discipline but tilts darker.
- Era: peak post-Material Apple-era productivity-software design,
  2020-2024. Adjacent to Things 3, Notion, Raycast.
- Genre conventions: keyboard-first power-user tooling.

### Layer 4 — Philosophy (the intent)

- **The product respects your intelligence.** No tooltips for obvious
  things. No onboarding wall. Power features are visible immediately.
- **Speed is the aesthetic.** The visual language exists to get out of the
  way of keystroke-driven flow — every animation duration is calibrated
  to feel like the system is faster than the user.
- **What the design says without words**: "this is for people who already
  know what they're doing." Trust signal via restraint.
- **What failure mode it prevents**: It refuses the SaaS impulse to
  over-decorate, over-hand-hold, over-onboard.

### Layer 5 — Identity Thesis

> Linear's identity is defined by **uncompromising restraint**, expressed
> through **single-hue palette + uniform geometric type + keyboard-first
> motion**, rooted in **Swiss functional minimalism and post-Stripe SaaS
> discipline**, designed to make the user feel **competent, fast, and
> respected**.

#### Minimum Authentic Set

The 3 elements WITHOUT WHICH Linear is unrecognizable:

1. **Single chromatic family** — every color in the product carries the
   same hue. *Why essential*: the family discipline is what makes the
   accent feel earned when it appears. Removing it produces generic dark
   SaaS.
2. **Tight typographic scale** — 11/12/13/14/16/20/24px range with weight
   carrying most of the hierarchy. *Why essential*: makes the product
   feel like it has authority instead of shouting.
3. **Cmd+K command palette as primary navigation surface** — the keyboard
   is the canonical interface. *Why essential*: defines the audience.

### Transferable to DeployView

| Linear element | DeployView application | Status |
|---|---|---|
| Single-hue chromatic family | Already applied — `--hue-base 250` drives bg + surfaces, `--hue-text 75` drives text family. Distinct from Linear's purple-only single-family but follows the *principle*. | ✓ done |
| Restrict accent to primary CTA / active state | Already applied — accent (amber) only on `.bp` / `.chip.on` / `.settings-tab-active` / focus rings. | ✓ done |
| Cmd+K palette as primary surface | Already exists (`palette.js`); recently gained Home/End/PageUp/PageDown navigation. | ✓ done |
| Hierarchy via weight + tone, not size | The new `.type-*` utility classes layer weight + color + tracking — body 400, labels 500/mono, sections 600, titles 700. | ✓ done |
| Restraint over decoration | DeployView keeps the scanline texture sparse (0.6 multiply) and the dv-bloom signature plays once. No gradients, no illustrations. | ✓ done |

### What we deliberately *don't* take from Linear

- **Purple/indigo palette**: would make DV look like a Linear clone. Amber
  is the chosen differentiator.
- **Marketing-grade glossiness on the public site**: DV has no marketing
  site; the dashboard IS the product.
- **Reactive opt-out**: Linear's dense feed-style activity log doesn't fit
  DV's per-branch model.
