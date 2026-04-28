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

---

## Source 2 — Vercel (vercel.com dashboard)

### Layer 1 — Surface

- **Palette**: pure black bg, pure white text, single grayscale spectrum.
  No accent color until you reach a CTA — the "Deploy" button is the
  only chromatic element on most pages (Vercel cyan ~oklch 75% 0.13 220
  or the gradient of the moment).
- **Typography**: Geist Sans (proprietary, modern grotesque) + Geist Mono.
  Tight tracking on display, large sizes for hero metrics.
- **Icons**: Vercel's own icon set, minimal stroke, geometric.
- **Spatial rhythm**: 4/8/16 base. Information rendered in dense card
  grids; deployment cards stack with thin separators.
- **Motion**: snappy, rare. The deployment-success animation (the
  triangle filling) is the one signature motion they protect.

### Layer 2 — Structure

- **Pure achromatic discipline + one chromatic moment**: this is the
  Vercel signature. Where Linear has a single-hue family, Vercel has
  *no hue except where the action is*.
- **The triangle (▲) is everywhere**: as logo, as cursor, as state
  indicator. It's the visual anchor of every screen.
- **Information density without crowding**: deployment cards reveal a
  lot per row (status / branch / commit / duration / preview link)
  but the rhythm is so tight the eye reads it as compact rather than
  busy.
- **What's deliberately excluded**: warmth, gradients except the
  marketing hero, illustration, color-coded status (everything is
  monochrome until you click into detail).

### Layer 3 — Culture

- Tradition: Bauhaus + Helvetica Neue + Apple's later (post-Forstall)
  monochrome era.
- Era: 2020+ Vercel's design refresh under Rauno Freiberg pulled it
  toward cinematic-tech extreme minimalism — black canvas, white type,
  single chromatic frame.
- Genre: cloud-platform tooling. AWS / Cloudflare / Netlify all have
  more color; Vercel chose the opposite.

### Layer 4 — Philosophy

- **The deployment is the protagonist**: every visual decision frames
  the build/preview/deploy pipeline as cinema. Black canvas = stage.
- **Minimalism as competitive moat**: by eliminating decoration, the
  product looks expensive to build, expensive to maintain, and expensive
  to abandon — increasing perceived quality and switching cost.
- **What it says without words**: "we made the most thoughtful choice on
  every pixel; trust us with your edge functions."

### Layer 5 — Identity Thesis

> Vercel's identity is defined by **achromatic discipline broken by one
> chromatic moment**, expressed through **pure black/white type and the
> ▲ triangle as universal anchor**, rooted in **Bauhaus minimalism +
> cinematic-tech hyperreduction**, designed to make the user feel
> **deployment is consequential, the platform is serious**.

#### Minimum Authentic Set

1. **Black canvas + white type + one accent moment**. The 1-color rule
   is the discipline. *Why essential*: removes it and you have generic
   dark SaaS.
2. **The ▲ as recurring motif**. *Why essential*: it's the brand mnemonic.
   Removing it removes recognizability.
3. **Information density inside cards, generous gaps between sections**.
   *Why essential*: the rhythm IS the design language.

### Transferable to DeployView

| Vercel element | DeployView application | Status |
|---|---|---|
| One chromatic moment per screen | Adopted in spirit — accent amber is reserved for primary CTAs, active states, and the brand mark. The rest of the UI works in chromatic-text + palette-tinted-bg. | ✓ done |
| A recurring brand motif | Adopted — the chevron `>` from the logomark is repeated as a visual element (the prompt cursor in the badge, the chevron-pointer on hover affordances). | ✓ done |
| Information density inside cards, gaps between sections | Already in spacing scale via `--sp-xs` … `--sp-2xl` (3.5/7/14/21/28/42px) — explicitly the Brief's spatial-contrast rule. | ✓ done |
| Protect ONE signature motion | Adopted — `dv-bloom` is the protected signature. Stagger and modal-in are utility, not signature. | ✓ done |

### What we deliberately *don't* take from Vercel

- **Pure achromatic discipline**: DV's "carved from obsidian, lit by
  amber" Brief explicitly wants warmth in the text family (--hue-text 75).
  Vercel-style pure-monochrome would erase the void-terminal warmth.
- **Triangle as global motif**: DV's chevron `>` performs the same role
  but reads as terminal prompt — semantically richer for a developer tool.
- **Marketing-cinema home page**: same reason as Linear; DV has no
  marketing surface.

---

## Source 3 — Blade Runner 2049 (Roger Deakins, dir. Villeneuve)

The visual concept anchor for DeployView. The Brief's "carved from
obsidian, lit by amber" is direct lineage from this film.

### Layer 1 — Surface

- **Palette by sequence**:
  - LAPD interiors: cool void (~oklch 12% 0.018 240) with rare warm
    accents.
  - Las Vegas / orange-storm: amber-orange dominant (~oklch 60% 0.18 60),
    lit from above through dust.
  - Wallace Corp interiors: gold light through translucent screens
    against deep void.
  - Snow exterior: desaturated cool gray with cold blue cast.
- **Typography in HUDs/screens**: monospace + technical-display fonts.
  Numerals dominate. Glyph-style icons.
- **Texture**: heavy atmospheric grain. Physical. Lens dust particles
  in every shot — the air has materiality.
- **Light**: directional and singular per scene. Massive spotlight from
  above, or a single warm window in a vast cool space.
- **Motion**: slow. The camera moves, never cuts. Long lens, shallow
  focus.

### Layer 2 — Structure

- **Single light source per scene, not per frame** — the same lamp lights
  every angle. Builds spatial coherence.
- **Color-coded zones**: cool = institutional (police, corporate). Warm =
  intimate, dangerous, organic. The temperature shift IS the storytelling.
- **Negative space is always 80% of the frame**. The subject occupies
  20%, often off-center, often small relative to environment.
- **Atmospheric particulates** make every void feel populated by air,
  not empty.
- **What's deliberately excluded**: gradient color grading, anything
  pastel, illustration, decorative typography.

### Layer 3 — Culture

- Tradition: 1980s noir cinema (original Blade Runner) + 2010s
  prestige-TV color grading (Mr. Robot's amber LAPD scenes are visibly
  influenced).
- Era: 2017 high-watermark of digital-cinematography color grading
  before HDR-by-default flattened the curves.
- Adjacent: Dune (2021, same DP), Sicario (2015), Dunkirk (2017).
- Concept-art roots: Syd Mead (original BR designer), updated to
  modern-rendered futurism.

### Layer 4 — Philosophy

- **The world is enormous and the human is small.** Every visual choice
  reinforces scale and isolation.
- **Light is information** — where it falls and from where reveals more
  about a scene than dialogue.
- **Atmospheric texture conveys time** — dust, fog, snow are never just
  weather; they're a clock.
- **What it says without words**: "this place existed before you and
  will outlast you."

### Layer 5 — Identity Thesis

> Blade Runner 2049's identity is defined by **single-source light against
> vast atmospheric void**, expressed through **temperature-coded zones
> and 80% negative space**, rooted in **noir + Syd Mead futurism +
> prestige cinematography**, designed to make the viewer feel **small,
> contemplative, and inside time**.

#### Minimum Authentic Set

1. **Single light source against deep void**. *Why essential*: this is
   the entire visual signature.
2. **Atmospheric particulates in every empty space**. *Why essential*:
   the void must feel like air, not absence.
3. **Temperature-coded zones (cool = institutional, warm = intimate)**.
   *Why essential*: it's how the color tells the story.

### Transferable to DeployView

| BR2049 element | DeployView application | Status |
|---|---|---|
| Single light source against deep void | Adopted — the top-center amber radial wash in `body::before` IS the single source. Surfaces cooler at the bottom (the second radial gradient) builds the void below. | ✓ done |
| Atmospheric particulates | Adopted as the CRT scanlines in `body::after` (mix-blend multiply, opacity 0.6). Not literal dust — translated to the medium (a software UI suggests a CRT, not a desert). | ✓ done |
| Temperature-coded zones | Partially adopted — primary surfaces are cool (--hue-base 250), text family is warm (--hue-text 75), accent is warm amber. The "cool institutional / warm intimate" axis maps to "structure cool / signal warm". | ✓ done |
| 80% negative space framing | Adopted in spacing scale's spatial-contrast rule (gaps BETWEEN sections 3-5× gaps WITHIN). Cards have generous padding. | ✓ done |
| Slow considered motion | Partially rejected — DV's Brief calls for "snappy + physical" because operator-class tools need speed. We borrow the *atmospheric stillness* (dv-bloom is the only intro motion) but not the slow camera. | partial |

### What we deliberately *don't* take from BR2049

- **Cinematic blur / shallow focus on UI**: would destroy legibility.
  We borrow the temperature, not the lensing.
- **Dust particles as a literal element**: clichéd in software. Scanlines
  are the medium-appropriate translation.
- **Slow motion as the dominant motion language**: operator tools need
  speed. We only cite stillness in the resting atmosphere, not in
  interaction.

---

## Source 4 — Bloomberg Terminal

The reference for **operator-class density**: how to display a lot of
information without crowding, and how monospace becomes identity.

### Layer 1 — Surface

- **Palette**: pure black bg (yes — Bloomberg gets to do this because the
  function is data-vision, not aesthetic), with semantic-coded colors:
  amber/yellow for headings (~oklch 78% 0.16 90), green for positive,
  red for negative, white for primary text, blue/cyan for links.
- **Typography**: bitmap-rooted monospace (Bloomberg uses several custom
  monospaced typefaces; the keyboard's BLOOMBERG keys are part of the
  brand). 100% mono, every column. Tabular numerals everywhere.
- **Icons**: minimal. The interface is text-driven; icons are vestigial.
- **Spatial rhythm**: extreme density. Every cell of the grid carries
  data. Border-less tables; whitespace is a luxury.
- **Motion**: zero. Updates flash a cell yellow for one frame on change,
  then settle. That's the entire motion vocabulary.

### Layer 2 — Structure

- **Yellow + amber as the heading/header signal**. Functions ("PX <GO>")
  and headers are amber on black. This single rule organizes the entire
  screen.
- **Information is the design**. Every visual decision is subordinate
  to the data.
- **Cell-flash for change** is the only motion permitted; it lets a
  trader see N markets simultaneously without watching any single one.
- **Keyboard-only navigation**. The mouse is optional. Function
  shortcuts are the canonical interface.
- **What's deliberately excluded**: hierarchy via size (everything is
  one size), gradients, photography, illustrations, soft anything,
  rounded corners, decoration of any kind.

### Layer 3 — Culture

- Tradition: 1980s green-on-black VT100 + Quotron heritage, modernized
  but never abandoned.
- Era: 1981-present continuous evolution. The visual language was set
  before color CRTs were standard; the constraints are now the brand.
- Adjacent: Reuters, FactSet, IBM 3270 mainframes.
- Profession: Wall Street, where any visual concession to "design"
  would be read as toy/amateur.

### Layer 4 — Philosophy

- **Mastery is the audience**. The interface is *deliberately* opaque
  to outsiders because every concession to legibility for newcomers is
  a concession of density to insiders.
- **Speed of pattern-recognition over speed of learning**. The 6-month
  learning curve is the moat.
- **Information density is respect**. A user who can read the screen
  doesn't need handholding.
- **What it says without words**: "if you can't read this, you don't
  belong on the desk."

### Layer 5 — Identity Thesis

> Bloomberg Terminal's identity is defined by **monospace data-density
> coded with amber for structure**, expressed through **black canvas +
> tabular text + cell-flash motion + keyboard-only navigation**, rooted
> in **VT100 / Quotron heritage and Wall Street's mastery-over-onboarding
> ethic**, designed to make the operator feel **inside the data, faster
> than peers, professionally invisible to outsiders**.

#### Minimum Authentic Set

1. **Amber/yellow is the structural signal**. *Why essential*: this is
   the cognitive shortcut — amber means "header / function / focus".
2. **Tabular monospaced numerals everywhere**. *Why essential*: the
   visual rhythm of aligned columns IS the data design.
3. **Density without crowding via aggressive negative-space inversion**
   (whitespace is rare and meaningful, not decorative). *Why essential*:
   removing it makes the product feel toy-like.

### Transferable to DeployView

| Bloomberg element | DeployView application | Status |
|---|---|---|
| Amber as the structural signal | DeployView's accent IS amber. The semantic alignment with Bloomberg's "amber = function/header" is intentional — DV's accent marks primary action and active state, the same cognitive role. | ✓ done |
| Tabular numerals for data | Adopted — `.type-metric` uses `font-variant-numeric: tabular-nums slashed-zero`, and `.sha-badge` uses the same. Build durations / bytes / counts in monospace tabular. | ✓ done |
| Monospace for technical labels | Adopted — `.type-label` uses JetBrains Mono with small-caps tracking. Status pills use mono. | ✓ done |
| Cell-flash on change as motion | Partially adopted — the runtime-error pill / build-failed pill flash via the existing CSS animations on state-transition. Could be more aggressive in a future iteration on live-changing values. | partial |
| Keyboard-first navigation | Adopted — Cmd/Ctrl+K palette, n/r/c/t/a/b/, view shortcuts, ?/help. | ✓ done |

### What we deliberately *don't* take from Bloomberg

- **Pure black bg**: Bloomberg's bg is `#000000`. DV uses oklch 13%
  (chromatic near-black) for OLED-friendliness and warmth. Pure black
  fights with our warm text family.
- **Reject onboarding entirely**: DV's audience includes individual
  developers on phones (Termux). It must be learnable in 60 seconds —
  the README promises that. We borrow density as a vocabulary, not as
  a wall.
- **Bitmap monospace**: outdated rendering aesthetic. JetBrains Mono is
  the modern equivalent.

