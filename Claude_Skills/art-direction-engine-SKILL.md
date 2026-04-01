---
name: art-direction-engine
description: >-
  Turns aesthetic vision into original, distinctive visual code.
  Trigger on: design my app, create the UI, build the interface,
  make it look like X, style this, art direction, visual identity,
  design language, original design, make this beautiful, UI design,
  theme my app, design system, create components, ANY frontend build
  where aesthetic quality matters, ANY named visual source (game, film,
  brand) alongside UI creation, when frontend-design produces generic
  results, or when user provides reference images, screenshots, mood
  boards, or palettes with a build request. Enforces originality at
  every decision point preventing default patterns. Covers Web,
  Android, iOS, React Native, Flutter.
---

# Art Direction Engine

Three laws govern every decision this skill makes:

1. **No decision without study.** Research the subject, references, audience, and
   emotional target before writing any visual code.
2. **No default survives.** Every visual value must be a conscious choice. If it
   matches a framework default, replace or re-derive it.
3. **Every surface tells a story.** Components are physical objects with material,
   weight, and behavior — not styled divs.

---

## §ROUTE — Reference Loading

Read the relevant references BEFORE writing code. Load only what the task requires.

### By input type

| User provides | Read first |
|---|---|
| Named source (game, film, brand, IP) | § Source & Reference section below |
| Screenshots / images | §IMAGE |
| Verbal description ("dark and cinematic") | §DERIVE |
| Mood board / palette / font picks | §EXTEND |
| No reference ("build me X") | §DERIVE |
| Existing code to improve | § Anti-Slop section below |

### By domain

| Domain | Reference |
|---|---|
| Font selection, pairing, scale, weight, tracking, OpenType, loading | § Typography section below |
| Color, depth, texture, light, shape, composition, atmosphere | § Visual Craft section below |
| Components: buttons, cards, inputs, nav, states, tables, icons | § Components section below |
| Hover, focus, active, transitions, scroll, micro-interactions | § Interaction section below |
| Logo, brand mark, identity system, signature elements | § Brand Identity section below |
| Proportions, grids, visual weight, contrast, screen tech | § Visual Science section below |
| Color psychology, emotion, semiotics, trust, attention, memory | § Psychology section below |
| Audience, demographics, culture, accessibility, marketing, conversion | § Audience section below |
| Platform-specific tokens and code (Web/Android/iOS/RN/Flutter) | § Platforms section below |
| Slop detection checklist and replacement patterns | § Anti-Slop section below |

---

## §BRIEF — The Art Direction Brief

Produce this brief before writing any visual code. Present it to the user for
confirmation. Every subsequent decision flows from it.

```
━━━ ART DIRECTION BRIEF ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUBJECT:        [what the app is / does]
AUDIENCE:       [expertise, age range, usage frequency, emotional context]
EMOTIONAL TARGET: [precise feeling — not "modern" but "the focused calm of a
                  well-organized workshop"]
VALUES:         [what the design communicates — "respects your intelligence"]
VISUAL CONCEPT: [unifying metaphor — "carved from obsidian, lit by amber"]

─── PALETTE ──────────────────────────────────────────────────
  Background:    oklch(___) — [description]
  Surface 1:     oklch(___) — [hue-shifted from bg]
  Surface 2:     oklch(___) — [card level]
  Text primary:  oklch(___) — [NOT pure white/black]
  Text secondary: oklch(___) — [chromatic, not gray]
  Text muted:    oklch(___) — [still chromatic]
  Accent:        oklch(___) — [role: primary actions + active states ONLY]
  Error:         oklch(___) — [calibrated to palette, NOT generic red]
  Success:       oklch(___) — [calibrated, NOT generic green]
  Temperature:   [warm / cool / neutral + accent]

─── TYPOGRAPHY ───────────────────────────────────────────────
  Display font:  [specific name + why] → see §LIBRARY
  Body font:     [specific name + why]
  Scale ratio:   [e.g. 1.250 Major Third]
  Weight strategy: [which weights for which roles]
  Tracking:      [tight on display, open on caps/labels]

─── SHAPE ────────────────────────────────────────────────────
  Radius scale:  buttons: ___px | cards: ___px | inputs: ___px |
                 modals: ___px | badges: ___px
  Geometry:      [angular / rounded / mixed — matches personality]
  Border strategy: [thin / partial / none / colored / glowing]

─── DEPTH & SURFACE ──────────────────────────────────────────
  Elevation:     [tonal surface / shadows / glow / glass / flat]
  Shadow color:  oklch(___) — [palette-derived, NOT black]
  Material:      [glass / stone / paper / metal / void / fabric]
  Texture:       [noise / grain / mesh / pattern / none]
  Light source:  [top-left / top-center / ambient / bottom-up]
  Background:    [atmospheric treatment description]

─── MOTION ───────────────────────────────────────────────────
  Character:     [snappy / considered / organic / dramatic]
  Micro:         ___ms ease-out  (button/toggle)
  Entrance:      ___ms ease-out  (element appear)
  Exit:          ___ms ease-in   (element leave — faster)
  Page:          ___ms ease-in-out
  Signature:     [the ONE animation that defines the product]

─── ICONS ────────────────────────────────────────────────────
  Library:       [Phosphor / Tabler / Remix / custom — NOT default Lucide/Heroicons]
  Style:         [line / filled / duotone] at ___px stroke
  Personality:   [matches visual concept]

─── COMPONENTS ───────────────────────────────────────────────
  Buttons:       [material, weight, press behavior]
  Cards:         [surface treatment, hover transformation]
  Inputs:        [rest personality, focus transformation]
  Navigation:    [spatial model + why]
  Empty states:  [designed composition, NOT gray text]
  Loading:       [product-character loading, NOT spinner]
  Errors:        [integrated error language, NOT red box]

─── IDENTITY ─────────────────────────────────────────────────
  Signature element: [the ONE thing that makes this recognizable]
  Competitive position: [visual territory claimed]

─── PROPORTIONS ──────────────────────────────────────────────
  Layout model:  [split ratio / grid structure / density level]
  Spacing base:  ___px (non-standard base for distinctiveness)
  First impression: [what 50ms conveys]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## §BAN — Absolute Blacklist

These values are banned from output. Full explanations and fixes: § Anti-Slop section below.

**Colors:** `#3b82f6` `#8b5cf6` `#10b981` `#ef4444` (Tailwind defaults as accent) ·
`#ffffff` `#000000` `#111827` `#0f172a` (pure/default backgrounds) ·
`rgba(0,0,0,...)` shadows · purple-to-blue-to-pink hero gradients

**Type:** Inter or Roboto as sole font · 400+600 as only weights · no tracking adjustments

**Shape:** one border-radius on all elements · `border-gray-200` as universal separator

**Depth:** `shadow-sm`/`shadow-md` · `transition: all 0.2s ease-in-out` · zero animations

**Layout:** `max-w-4xl mx-auto` as only structure · `p-4`/`p-8` as only spacing

**Components:** white-card-gray-border-small-shadow · full-width buttons everywhere ·
default Lucide/Heroicons · gray empty states · generic spinner · red error boxes

---

## §BUILD — Creation Phases

After Brief is confirmed, build in this order:

1. **Tokens** — CSS custom properties for every design decision. → §TOKENS
2. **Atmosphere** — Background, surfaces, light, texture. → §ATMOSPHERE
3. **Typography** — Full type system. → § Typography section below
4. **Components** — Each as a designed object. → § Components section below
5. **Interaction** — Motion, hover, focus, transitions. → § Interaction section below
6. **States** — Empty, loading, error, success, disabled. → §EMPTY onwards
7. **Self-audit** — Check every value against §BAN and the checklist below.

---

## §CHECK — Self-Audit Before Presenting

```
CRAFT:
 □ Every color differs from §BAN blacklist
 □ Typography uses intentional weights + tracking
 □ Border-radius varies by component type
 □ Shadows use palette-derived color
 □ At least one element has a distinctive visual treatment
 □ Product identifiable from a single component screenshot
 □ Empty/loading/error states are designed
 □ Atmospheric depth exists (texture, gradient, light)
 □ Motion uses specific properties and durations

STRATEGY:
 □ Palette temperature matches emotional target
 □ Shape language matches personality
 □ Information density matches audience expertise
 □ Layout uses harmonic proportions
 □ Clear visual hierarchy (one focal point per screen)
 □ Design communicates stated values
 □ Touch targets ≥ 44px (mobile)
 □ Reduced-motion fallback exists
```

Fail any check → fix before presenting.

---

## §COMPANION — Skill Integration

**design-aesthetic-audit**: Its §DP2 Character Brief maps directly into the Art
Direction Brief. Its §DBI3 Anti-Genericness findings feed the redesign.

**frontend-design**: Provides scaffolding. This skill's Brief overrides its generic
"be bold" guidance when both trigger.

**app-audit**: §E Visual Design findings are direct input to redesign.


---

## Part I: Visual Craft — Color, Depth, Texture, Light, Shape, Composition

Concrete techniques for building distinctive visual environments. Every section
produces implementable values, not just principles.

---

### §COLOR — Palette Architecture in OKLCH

Design all colors in OKLCH (perceptually uniform). Provide hex fallbacks. HSL lightness
is deceptive — OKLCH lightness actually looks equal across hues.

#### Five-Layer Palette

**Layer 1 — Background.** Never pure white or black. Always carry a hue.
```
Light: oklch(97.5% 0.005 [hue])    Dark: oklch(13% 0.015 [hue])
```
The background hue sets the emotional temperature of everything above it.

**Layer 2 — Surfaces.** Each elevation shifts BOTH lightness AND hue (≈5° per step).
Pure lightness shifts feel flat; hue shifts create perceived depth.
```
Dark mode example (cool):
  base:     oklch(13.0% 0.015 245)
  surface:  oklch(16.5% 0.012 240)    +3.5% L, -5° hue
  elevated: oklch(20.0% 0.010 235)    +3.5% L, -5° hue
  overlay:  oklch(24.0% 0.008 230)    +4.0% L, -5° hue
```

**Layer 3 — Text.** Chromatic, never pure gray. Derive from background hue.
```
Dark: primary oklch(93% 0.008 H) · secondary oklch(68% 0.012 H) · muted oklch(48% 0.010 H)
Light: primary oklch(15% 0.010 H) · secondary oklch(45% 0.012 H) · muted oklch(62% 0.008 H)
```

**Layer 4 — Accent.** The product's signature color. Calibrate in OKLCH: set hue →
push chroma to max for that hue → adjust lightness for contrast. Restrict usage:
primary CTA + active tab + selected item. Nowhere else.

**Layer 5 — Semantic.** Error/warning/success/info calibrated to palette temperature.
NOT generic red/yellow/green/blue. Match chroma and temperature to the rest of the palette.

#### Color Relationships

| Strategy | Hue Relationship | Character | Best for |
|---|---|---|---|
| Analogous | within 30° | harmonious, calm | cohesive products |
| Complementary accent | 180° from bg | maximum pop | strong CTA |
| Split-complementary | 150° + 210° from bg | vibrant, balanced | two action types |
| Monochromatic temp shift | same hue, warm/cool variants | most sophisticated | premium products |

**Screenshot test:** Thumbnail the interface at 100×100px. If the color pattern is
identifiable as THIS product — the palette has identity.

---

### §DEPTH — Five Techniques

**1. Tonal surface elevation.** Lighter surfaces = higher (dark mode). Make steps
clearly perceptible — if you squint and can't distinguish surface levels, increase
the step size.

**2. Color-matched directional shadows.** Shadow hue matches palette's dark tone.
Shadow direction matches the declared light source. Never `rgba(0,0,0,...)`.
```css
--shadow-md: 4px 4px 12px oklch(6% 0.02 [hue] / 0.20),
             1px 1px 3px oklch(8% 0.02 [hue] / 0.15);
```

**3. Layered transparency.** `backdrop-filter: blur(16px) saturate(1.2)` on floating
elements. Blur amount = perceived distance (4px = close, 20px = far).

**4. Parallax.** Background scrolls slower than foreground. Use only when axis A5 =
"Aesthetic amplifies value" or higher.

**5. Focus blur.** Defocus background when modal/overlay is active.
`filter: blur(3px) brightness(0.7)` on the content behind.

---

### §TEXTURE — Surface Materiality

| Technique | Code Pattern | Best For |
|---|---|---|
| **Noise grain** | SVG feTurbulence overlay at `opacity: 0.03`, `mix-blend-mode: overlay` | editorial, premium, atmospheric |
| **Gradient mesh** | Multiple `radial-gradient` layers with asymmetric positions | heroes, backgrounds |
| **Dot grid** | `radial-gradient(circle, color 1px, transparent 1px)` at 24px repeat | technical, precise |
| **Diagonal hatch** | `repeating-linear-gradient(45deg, ...)` at 10-11px period | editorial, architectural |
| **Inset surface** | `box-shadow: inset 0 2px 4px color` | inputs, wells, recessed areas |

Material personalities to name in the Brief:

| Material | Key Properties | Personality |
|---|---|---|
| Glass | backdrop-filter, thin borders, high transparency | refined, premium, slightly cold |
| Stone | noise, inset shadows, heavy weight, low chroma | authoritative, grounded |
| Paper | warm tint, soft shadows, no blur, clean edges | editorial, content-first |
| Metal | high contrast, specular highlights, sharp edges | technical, precise |
| Void | near-black + selective glow, no borders | cinematic, immersive |
| Fabric | matte, warm tones, rounded forms, soft shadows | warm, crafted |

---

### §LIGHT — Consistent Light Source

Choose one light source direction. Apply it to ALL depth elements:
- Shadow direction matches light
- Highlighted edges face the light
- Surface gradients: lighter on light-facing side
- Border opacity: higher on light-facing edges

| Source | Shadow Direction | Personality |
|---|---|---|
| Top-left | ↘ down-right | natural, default |
| Top-center | ↓ straight down | clean, geometric |
| Ambient | all sides equal | ethereal, digital |
| Bottom-up | ↑ upward | dramatic, cinematic |

---

### §SHAPE — Shape Language

Radius is a personality dial. Use a SCALE — never one value for all elements.

```
Technical:  btn 4px · card 6px · input 4px · modal 8px · badge 100px
Balanced:   btn 6px · card 12px · input 6px · modal 16px · badge 100px
Friendly:   btn 12px · card 20px · input 10px · modal 24px · badge 100px
```

Beyond radius: angular clip-paths, asymmetric radius, partial borders (one-edge only),
organic SVG shapes. Introduce at least ONE non-rectangular element.

---

### §COMPOSITION — Layout as Composition

Break the center-column default. Choose a spatial model:

| Model | Structure | When |
|---|---|---|
| Asymmetric panels | 60-70% + 30-40% | two-pane apps, sidebar + content |
| Golden split | 1fr + 0.618fr (61.8% / 38.2%) | balanced asymmetry |
| Off-grid hero | primary content offset from center | dynamic energy |
| Full-bleed sections | content breaks column boundary | emphasis |
| Layered | overlapping elements at multiple Z-depths | depth, visual interest |

**Spatial contrast rule:** gap BETWEEN sections = 3-5× gap WITHIN components. This
is what separates "designed" from "spaced."

---

### §TOKENS — Token Architecture

Build tokens first — they're the DNA. Three layers:

```css
:root {
  /* Layer 1: Primitives */
  --hue-base: 245;  --hue-accent: 35;
  --chroma-bg: 0.015;  --radius-base: 6px;
  --space-base: 6px;  /* non-standard base = instant distinctiveness */
  --duration-base: 150ms;

  /* Layer 2: Semantic */
  --color-bg: oklch(13% var(--chroma-bg) var(--hue-base));
  --color-surface: oklch(17% 0.012 calc(var(--hue-base) - 5));
  --color-text-1: oklch(93% 0.008 var(--hue-base));
  --color-accent: oklch(72% 0.20 var(--hue-accent));

  /* Layer 3: Component */
  --btn-radius: var(--radius-base);
  --card-radius: calc(var(--radius-base) * 2);
  --card-padding: calc(var(--space-base) * 4);
}
```

Non-standard spacing base (5px, 6px, 7px instead of 4px/8px) makes every spacing
value automatically non-default across the entire product.

---

### §ATMOSPHERE — Ambient Visual Environments

Build the atmosphere FIRST — before any component. It establishes the world.

```css
/* Void: immersive, cinematic */
body { background: oklch(8% 0.01 260); }
.main::before { /* radial light pool from center */
  content: ''; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 60% 50% at 50% 40%, oklch(14% 0.015 250 / 0.5), transparent 70%);
}

/* Studio: warm, professional */
body { background: oklch(96% 0.008 75); }
.main::before { /* subtle vignette */
  content: ''; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 50%, oklch(90% 0.01 75 / 0.4) 100%);
}

/* Terminal: technical, focused */
body { background: oklch(10% 0.02 160); }
body::after { /* barely visible scanlines */
  content: ''; position: fixed; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(0% 0 0 / 0.03) 2px, oklch(0% 0 0 / 0.03) 4px);
}
```

---

### §DERIVE — Art Direction from Subject Matter

When no reference is provided, derive direction from the domain itself:

1. **Domain visual culture:** Medical → clean, high-trust. Finance → dense, precise.
   Music → expressive, rhythmic. Gaming → atmospheric, immersive.
2. **Emotional register:** What should the user feel? Confident? Calm? Energized?
3. **Find the metaphor:** "A well-lit examination room." "A vinyl record collection."
   "A precision instrument panel."
4. **Map metaphor → properties:** Temperature → palette. Material → surfaces.
   Space → density. Light → contrast. Personality → typography + shape.

---

### §EXTEND — Extending Partial Inputs

**From palette only:** Identify temperature + energy → derive typography temperature
(warm palette → humanist type, cool → geometric), shape (warm → rounded, cool → angular),
density (high chroma → compact, low → spacious).

**From fonts only:** Identify personality → derive palette temperature (geometric sans →
cool, humanist serif → warm), density (high x-height → dense, low → airy).

**From screenshots without explanation:** Run §IMAGE extraction (in source-and-reference.md)
on each, synthesize common elements, present to user for confirmation.


---

## Part II: Typography — Fonts, Pairing, Scale, Weight, Tracking, Features

Font selection is the single most impactful design decision after color. This module
replaces Claude's default reach for Inter/Roboto with a structured selection process.

---

### §CLASSIFY — Font Families

#### Sans-Serif

| Class | Character | Exemplars (Google Fonts) |
|---|---|---|
| **Geometric** | modern, clean, precise, cold | Outfit, Satoshi, Montserrat, Nunito Sans |
| **Grotesque** | neutral, professional, invisible | Inter, Roboto, Suisse Int'l, Helvetica |
| **Humanist** | friendly, warm, readable | Plus Jakarta Sans, Lato, Source Sans 3 |
| **Industrial** | urgent, bold, dense | Oswald, Barlow Condensed, Anton |
| **Rounded** | soft, playful, approachable | Nunito, Quicksand, Varela Round |

#### Serif

| Class | Character | Exemplars |
|---|---|---|
| **Old-Style** | traditional, scholarly, warm | EB Garamond, Crimson Pro |
| **Transitional** | authoritative, balanced, institutional | Libre Baskerville, Charter, Lora |
| **Modern/Didone** | elegant, dramatic, premium — DISPLAY ONLY (24px+) | Playfair Display, DM Serif Display |
| **Slab** | bold, confident, sturdy — best as heading only | Zilla Slab, Roboto Slab |

#### Monospace & Display

| Class | Use | Exemplars |
|---|---|---|
| **Monospace** | code, technical UI, data, hacker aesthetic | JetBrains Mono, Fira Code, IBM Plex Mono, Space Mono |
| **Display** | hero headlines, branding ONLY (never body) | Clash Display, Syne, Unbounded, Bebas Neue, Cabinet Grotesk |

---

### §LIBRARY — Font Selection by Personality

Use this table instead of defaulting to Inter. Pick by the Brief's emotional target.

#### Technical / Precise
**JetBrains Mono** — code + technical UI. **Space Grotesk** — geometric with quirky details.
**IBM Plex Sans** — open, mechanical, corporate tech. **Overpass** — extreme clarity.

#### Modern / Distinctive
**Outfit** — variable, geometric-friendly, wide weight range.
**Satoshi** — tight, modern, squared terminals.
**Manrope** — slightly rounded, highly legible SaaS.
**General Sans** — refined Inter alternative with more character.
**Syne** — unusual proportions, angular energy (display).
**Clash Display** — extreme weight range, dramatic (display).
**Cabinet Grotesk** — bold personality (display).

#### Editorial / Authoritative
**Fraunces** — variable serif with "wonky" optical axis.
**Playfair Display** — high contrast, dramatic.
**DM Serif Display** — compact, refined, pairs with DM Sans.
**Instrument Serif** — warm, distinctive transitional.
**Source Serif 4** — variable, superb readability.
**Lora** — screen-optimized transitional.

#### Warm / Humanist
**Plus Jakarta Sans** — open, friendly-professional.
**DM Sans** — clean but warm, variable.
**Rubik** — slightly rounded, inviting.
**Atkinson Hyperlegible** — maximum character differentiation (accessibility-first).

#### Bold / Impact
**Oswald** — tall, narrow, commanding. **Bebas Neue** — ultra-condensed, all-caps display.
**Anton** — very heavy, maximum impact. **Archivo Black** — solid, authoritative.

#### Creative
**Bricolage Grotesque** — variable optical size, quirky.
**Kalnia** — didone display, decorative.
**Instrument Sans** — optical size axis, modern.
**Gloock** — unusual curves, artistic.

---

### §PAIRING — Contrast in Structure, Unity in Feeling

Two fonts that differ structurally but agree emotionally. Maximum 3 fonts per product.

#### Reliable Patterns

**Serif display + Sans body** (most versatile):
```
Playfair Display + Source Sans 3       — editorial, premium
DM Serif Display + DM Sans             — matched family, cohesive
Instrument Serif + Plus Jakarta Sans   — modern editorial
Fraunces + Manrope                     — creative, warm
```

**Sans display + Sans body** (modern):
```
Clash Display + General Sans           — bold modern
Syne + IBM Plex Sans                   — creative-technical
Outfit 800 + Outfit 400                — single family, weight contrast
Bebas Neue + Plus Jakarta Sans         — impact + warmth
```

**Mono + Proportional** (technical identity):
```
JetBrains Mono (labels) + Plus Jakarta Sans (body) — technical with human text
Space Mono (headings) + DM Sans (body)             — retro-tech
```

**Anti-patterns:** Two geometric sans (fight). Two display serifs (overwhelming).
Two nearly-identical fonts (uncanny valley). 4+ fonts (chaos).

---

### §SCALE — Type Scale Architecture

Choose a ratio by product character, generate sizes from a base.

| Ratio | Name | Character |
|---|---|---|
| 1.125 | Major Second | tight, data-dense |
| 1.200 | Minor Third | balanced, most apps |
| 1.250 | Major Third | generous, readable |
| 1.333 | Perfect Fourth | dramatic, editorial |
| 1.500 | Perfect Fifth | bold, hero-heavy |
| 1.618 | Golden Section | dynamic equilibrium |

**Example** (base 16px, ratio 1.250):
10px · 13px · **16px** · 20px · 25px · 31px · 39px · 49px · 61px

On mobile, compress display sizes (3xl–5xl reduce 15-25%) while keeping body constant.

---

### §WEIGHT — Weight as Design System

| Weight | Value | Role |
|---|---|---|
| Light | 300 | large display text (36px+) |
| Regular | 400 | body, descriptions |
| Medium | 500 | labels, buttons, nav, table headers |
| SemiBold | 600 | section headings |
| Bold | 700 | page titles, key emphasis |
| Black | 800-900 | hero/display impact only |

**Product strategies:**
- Minimal (2 weights): 400 body + 700 headings
- Standard (3 weights): 400 body + 500 labels + 700 headings
- Editorial (4-5 weights): 300 display + 400 body + 500 UI + 600 sections + 700 titles

---

### §TRACKING — Letter-Spacing Rules

```css
.display  { letter-spacing: -0.025em; }  /* 32px+ tighten */
.heading  { letter-spacing: -0.015em; }  /* 20-31px */
.body     { letter-spacing: 0; }          /* 14-18px neutral */
.caption  { letter-spacing: 0.01em; }     /* 10-13px open */
.caps     { letter-spacing: 0.06em; text-transform: uppercase; }
.label    { letter-spacing: 0.08em; font-variant-caps: small-caps; font-weight: 500; font-size: 11px; }
```

Large untightened text looks amateur. Untightened ALL-CAPS looks cramped. These rules
are non-negotiable.

---

### §OPENTYPE — Advanced Features

Enable these where the font supports them (check at wakamaifondue.com):

```css
.data    { font-variant-numeric: tabular-nums; }     /* aligned columns */
.prose   { font-variant-numeric: oldstyle-nums; }     /* elegant in text */
.refined { font-variant-ligatures: common-ligatures; } /* fi, fl, ff */
.label   { font-variant-caps: small-caps; }            /* true small caps */
.allcaps { font-feature-settings: "case" 1; }         /* raised punctuation */
.recipe  { font-variant-numeric: diagonal-fractions; } /* ½ rendering */
```

---

### §VARIABLE — Variable Font Axes

| Axis | Tag | Use |
|---|---|---|
| Weight | wght | hierarchy + animate weight on hover |
| Width | wdth | responsive (compress on narrow screens) |
| Optical Size | opsz | auto-adjusts detail for rendered size — enable with `font-optical-sizing: auto` |
| Grade | GRAD | adjust weight without layout shift (dark mode) |

**Fonts with optical size:** Instrument Sans, Bricolage Grotesque, Fraunces, Roboto Flex.

Animate weight on hover (variable fonts only):
```css
.nav-item { font-variation-settings: "wght" 400; transition: font-variation-settings 200ms ease-out; }
.nav-item:hover { font-variation-settings: "wght" 600; }
```

---

### §LOADING — Web Font Performance

**Strategy:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700&display=swap" rel="stylesheet">
```

| font-display | Behavior | Use For |
|---|---|---|
| `swap` | show fallback immediately, swap when loaded | body text |
| `optional` | show fallback, only swap if loaded fast | body on slow connections |
| `block` | invisible 3s, then fallback | brand/display text |

**Prevent layout shift** with size-adjusted fallback:
```css
@font-face {
  font-family: 'Outfit Fallback'; src: local('Arial');
  size-adjust: 100.5%; ascent-override: 95%; descent-override: 22%;
}
body { font-family: 'Outfit', 'Outfit Fallback', sans-serif; }
```

Self-host for performance + privacy: use `fontsource` npm packages.

---

### §EVALUATE — Font Quality Signals

Check before committing: Latin Extended-A coverage? Tabular figures? ≥5 weights with
distinct differentiation? Clean rendering at 14-16px on LCD? Good kerning (test "AV To Ty")?
Known foundry (Dalton Maag, Production Type, TypeTogether)?

Warning signs: tiny character set, ≤2 weights, no italic, no OpenType features.

---

### §CULTURAL — Multilingual Typography

- **Latin Extended**: verify accented chars (ñ ü ø ß ç)
- **RTL (Arabic, Hebrew)**: use RTL-specific fonts (Noto Sans Arabic, Tajawal)
- **CJK**: use dynamic subsetting (huge character sets destroy performance)
- **Fallback stack**: include CJK-aware system fonts (PingFang SC, Yu Gothic, Microsoft YaHei)

---

### §HIERARCHY — Complete Type System Template

```css
.type-display   { font: 800 var(--text-5xl)/1.05 var(--font-display); letter-spacing: -0.03em; }
.type-title     { font: 700 var(--text-3xl)/1.15 var(--font-display); letter-spacing: -0.02em; }
.type-heading   { font: 600 var(--text-2xl)/1.25 var(--font-display); letter-spacing: -0.01em; }
.type-subhead   { font: 600 var(--text-xl)/1.3 var(--font-body); }
.type-body      { font: 400 var(--text-base)/1.55 var(--font-body); }
.type-body-sm   { font: 400 var(--text-sm)/1.5 var(--font-body); letter-spacing: 0.005em; }
.type-label     { font: 500 11px/1.3 var(--font-body); letter-spacing: 0.06em; text-transform: uppercase; }
.type-code      { font: 400 0.9em/1.6 var(--font-mono); }
.type-metric    { font: 700 var(--text-4xl)/1.0 var(--font-display); font-variant-numeric: tabular-nums; }
```

---

### §MICRO — Small Details, Big Impact

**Line height:** headings 1.05-1.2, body 1.45-1.65, code 1.5-1.7, UI labels 1.0-1.2.
**Measure:** `max-width: 65ch` for prose (50-75 chars optimal).
**text-wrap: balance** on h1-h3 (prevents widows in headings, Chrome 114+).
**Links:** `text-decoration-thickness: 1px; text-underline-offset: 3px;`
**Never:** pure black text on pure white background. Use chromatic near-extremes.
**Never:** colored body text (reads as links). Color only headings, labels, accents.


---

## Part III: Source & Reference — Extracting Design DNA

How to study reference material and convert it into actionable design decisions.

---

### §IMAGE — 7-Point Extraction from Screenshots

For EACH reference image, extract:

```
1. COLOR: bg color (precise), surface levels, accent placement, text treatment,
   temperature, OKLCH estimates for top 5 colors
2. TYPE: heading class + body class, weight range, tracking, special treatments
3. SHAPE: dominant geometry, radius patterns, borders, container strategy
4. DEPTH: layer count, technique (shadow/tonal/blur/parallax), shadow character
5. TEXTURE: bg treatment (flat/gradient/textured), materiality, noise, patterns
6. COMPOSITION: structure (centered/asymmetric/grid), density, alignment, weight map
7. ATMOSPHERE: light quality, emotional register, energy level, cultural roots
```

After extracting WHAT you see, extract the WHY:
- Why does this palette work? (not "it's dark" — "low-chroma surfaces make the
  high-chroma accent electric by contrast")
- Why does this composition work? (not "good layout" — "asymmetric hero against
  vast empty field creates tension making the CTA unmissable")

#### Multiple Image Synthesis

Extract each individually, then synthesize:
- **Consistent across all**: core identity elements (high confidence)
- **Varies**: flexible elements
- **Contradicts**: flag for user decision
- **Top 3-5 transferable elements**: prioritized for the new product

---

### §SOURCE — 5-Layer Study for Named Sources

When user names a game, film, brand, or IP:

**Layer 1 — Surface** (what you see): exact colors, type character, icons, spatial
rhythms, textures, motion. Research visually — use web search for screenshots, concept
art, brand guidelines. Estimate OKLCH values.

**Layer 2 — Structure** (the rules): how contrast creates hierarchy, recurring motifs,
proportion system, what's deliberately excluded (negative space of the aesthetic),
materials/textures, information density logic.

**Layer 3 — Culture** (where it came from): art movements, geographic traditions, genre
conventions, era influences, related media.

**Layer 4 — Philosophy** (the intent): what problem the visual language solves, what
emotion is engineered, what the design says non-verbally, what failure it prevents.

**Layer 5 — Identity Thesis** (one sentence):
"[Source]'s identity is defined by [principle], expressed through [technique], rooted
in [tradition], designed to make the user feel [emotion]. Minimum authentic set:
[3-5 non-negotiable elements]."

#### Minimum Authentic Set

The 3-5 elements WITHOUT WHICH the reference is unrecognizable. For each:
what it is, why it's essential, how to translate it to web/mobile (not copy — translate),
specific implementation code, what breaks if removed.

#### Source Type Considerations

**Game UI**: look for diegetic elements, HUD density, atmospheric overlays, faction colors.
Transfer challenge: 1080p+ at arm's length → web needs higher contrast, larger targets.

**Film/Director**: look for color grading, composition, lighting, texture.
Transfer: horizontal/passive → vertical/interactive. Palette and atmosphere transfer best.

**Brand**: look for token consistency, component patterns, spacing, animation, voice.
Transfer: borrowing pieces loses coherence. Transfer principles and token architecture.

---

### §MOOD — Extending Partial Inputs

**From palette → full direction:**
Temperature (warm/cool) → typography (humanist/geometric) → shape (rounded/angular)
→ density (high chroma = compact, low = spacious)

**From fonts → full direction:**
Personality (geometric/humanist/serif) → palette temperature → spatial density

**From verbal description → visual properties:**

| Descriptor | Color | Type | Shape | Motion | Depth |
|---|---|---|---|---|---|
| Dark | <15% L, high contrast | heavy weights | any | considered 200ms+ | tonal/dramatic |
| Clean | high L or deep neutral | sans, controlled | smooth radius | brisk 100-150ms | subtle |
| Cinematic | near-black + accent | large display, tight | widescreen, asymmetric | slow 300ms+ | blur, parallax |
| Professional | neutral-cool, low chroma | precise sans, medium | moderate radius | efficient 150ms | light, even |
| Futuristic | cool bg, high-chroma accent | geometric/mono | angular cuts | snappy + glitch | glow, thin borders |
| Warm | warm hue bg, amber accent | humanist/serif | generous radius | organic, spring | soft shadows |
| Playful | high chroma, multi-hue | rounded, variable weights | large radius, pills | bounce, overshoot | layered |
| Minimal | few colors, high negative space | 1 font, 2 weights max | 1 consistent radius | instant or fast | flat |
| Brutal | high contrast, limited | mono/heavy, all-caps | 0px radius | none or instant | flat |
| Luxury | low chroma, deep surfaces | elegant serif/refined sans | measured, precise | slow, considered | subtle, refined |

For ambiguous descriptions, present 2-3 distinct visual interpretations and let the
user choose.

---

### §TRANSLATE — Research → Art Direction Brief

Every field in the Brief must trace to specific research evidence. No field filled with
a generic placeholder. Verify before presenting:
- All colors in OKLCH with specific values
- Font names specific and available
- Radius values are specific numbers
- No value matches the §BAN blacklist
- All decisions support the same emotional target
- ≥1 distinctive signature element exists


---

## Part IV: Anti-Slop — Detection & Replacement

Single source of truth for banned patterns. Every banned value listed once with its fix.

---

### §DETECT — Binary Checklist

Run before presenting ANY output. Each item: pass or fail.

```
COLOR
 □ No Tailwind default as accent (#3b82f6, #8b5cf6, #10b981, #ef4444)
 □ Background ≠ #ffffff, #000000, #111827, #0f172a, #1e1e1e
 □ Text colors carry a hue (chromatic), not pure gray
 □ Shadows use palette hue, not rgba(0,0,0,...)
 □ Semantic colors calibrated to palette, not generic red/green
 □ At least one palette color would NOT appear in a Tailwind/Material default

TYPE
 □ Display font ≠ Inter, Roboto, Arial, system-ui alone
 □ ≥3 weights with distinct purpose
 □ Letter-spacing adjusted for ≥1 size category
 □ Sizes follow a deliberate scale ratio
 □ Hierarchy uses more than gray shades (size + weight + color + tracking)

SHAPE
 □ Radius varies by component type (buttons ≠ cards ≠ modals)
 □ ≥1 element has distinctive shape treatment (clip-path, asymmetric, partial border)
 □ Separators ≠ uniform border-gray-200

DEPTH
 □ ≥2 surface elevation levels visually distinct
 □ Shadows directional, not uniform all-sides
 □ ≥1 depth technique beyond basic shadows

MOTION
 □ No `transition: all` in code
 □ ≥2 different transition durations for different interaction types
 □ ≥1 element has hover/active beyond color change

LAYOUT
 □ Layout ≠ centered-column-only
 □ ≥3 gap values with intentional hierarchy
 □ ≥1 element breaks the dominant grid

COMPONENTS
 □ Empty states designed, not gray text
 □ Loading has product character, not default spinner
 □ Error states ≠ generic red box
 □ Buttons have distinct rest/hover/active/focus
 □ Input focus ≠ ring-blue-500
 □ Cards ≠ white + gray border + shadow-sm

IDENTITY
 □ Product identifiable from single component screenshot
 □ ≤2 framework defaults survived without recalibration
 □ ≥1 visual signature/fingerprint exists
```

**Score:** <20 pass = rebuild. 20-25 = fix specific areas. 26+ = proceed.

---

### §FIX — Pattern-by-Pattern Replacements

#### Colors

| Banned | Why | Fix |
|---|---|---|
| `#3b82f6` / blue-500 as accent | ≈40% of Tailwind apps use this exact hex | Shift 5-15° in OKLCH: `oklch(65% 0.22 255)` or leave blue entirely |
| `#8b5cf6` / purple-500 | "AI product" cliché 2023-2025 | Any other accent. If cool needed: deep indigo (280+) or cyan (200-210) |
| `#ffffff` background | Harsh, personality-free | `oklch(98% 0.005 [hue])` — imperceptibly tinted |
| `#000000` background | Empty, OLED smearing risk | `oklch(3-5% 0.01 [hue])` for OLED, `oklch(12-14% 0.015 [hue])` else |
| `#111827` / gray-900 dark bg | Tailwind dark default | `oklch(13% 0.015 [hue])` — chromatic near-black |
| gray-900/500/400 text stack | Zero personality | Add palette hue at low chroma: `oklch(L% 0.008-0.012 [hue])` |
| `rgba(0,0,0,...)` shadows | Black shadows don't exist in reality | `oklch(6-10% 0.02 [palette-hue] / 0.15-0.25)` |
| `ring-blue-500` focus | Framework default | Accent color at appropriate opacity |
| `border-gray-200` universal | Unintegrated with palette | Palette-derived at 8-12% opacity |
| `placeholder:text-gray-400` | Unintegrated | Derive from input surface, same hue family |
| `hover:bg-gray-100` universal | Generic | Accent at 5-8% opacity on surface hue |
| Purple→blue→pink hero gradient | AI slop cliché | Derive gradient from palette. Asymmetric mesh, not linear band |

#### Typography

| Banned | Fix |
|---|---|
| Inter or Roboto as sole font | Choose display font by personality → §LIBRARY. Keep Inter/Roboto for body only if paired |
| 400 + 600 as only weights | Define ≥3 weights with distinct roles (body 400, labels 500, headings 700) |
| No tracking adjustments | Display: -0.02em. Body: 0. Caps: +0.06em. See §TRACKING |
| Default font sizes | Use a scale ratio (1.125–1.618). See §SCALE |
| Gray-only text hierarchy | Layer size + weight + color + tracking for each level |

#### Shape

| Banned | Fix |
|---|---|
| `rounded-lg` (0.5rem) on everything | Per-component scale: btn 6px, card 12px, modal 16px, badge 100px |
| Same radius on all components | Derive from the Brief's shape language |
| All containers are rectangles | Add ≥1: pill badges, clip-path, asymmetric radius, partial borders |
| `border-t border-gray-200` everywhere | Three separator types: heavy (20% opacity), light (8%), accent (30%, sparingly) |

#### Depth & Motion

| Banned | Fix |
|---|---|
| `shadow-sm` / `shadow-md` | Color-matched directional: `oklch(6% 0.02 [hue] / 0.20)` |
| `transition: all 0.2s ease-in-out` | Specific properties: `background-color 150ms ease-out, transform 100ms ease-out` |
| Zero animations | Add motion at 3 points: button states, element entrance, state transitions |
| Same transition everywhere | Micro 100ms, component 200ms, page 300ms, delight 400ms spring |

#### Layout

| Banned | Fix |
|---|---|
| `max-w-4xl mx-auto` only | Choose spatial model: asymmetric, golden split, full-bleed, layered |
| `p-4`/`p-8` only spacing | Non-standard base unit (5/6/7px). Vary by context: within-component tight, between-section generous |
| Uniform card grid | Vary card sizes: featured spans 2 cols, mix large + small |

#### Components

| Banned | Fix |
|---|---|
| White card + gray border + shadow-sm | Design card as material surface with personality. See §CARDS |
| `bg-blue-500 text-white rounded-lg px-4 py-2` button | Physical object with material and press behavior. See §BUTTONS |
| "No items yet" gray empty state | Designed composition with illustration + warm copy + action. See §EMPTY |
| Default spinner | Skeleton screen, accent progress bar, or branded moment. See §LOADING |
| Red error box | Palette-calibrated error with integrated design language. See §ERRORS |
| Default Lucide/Heroicons unmodified | Choose by personality (Phosphor/Tabler/Remix), set explicit weight. See §ICONS |

#### Macro Patterns

| Banned | Fix |
|---|---|
| SaaS skeleton: dark sidebar + top bar + card grid | If sidebar IS appropriate, give it visual character. Vary the main area. |
| Landing page formula: gradient hero → feature cards → testimonials → pricing → footer | Lead with product demo. Single narrative scroll. Feature ONE thing dramatically. Asymmetric layout. |
| "Dark mode = invert colors" | Separate designed dark palette with tonal recalibration. Never `forceDarkAllowed=true` on Android. |

---

### §META — Why Claude Produces Slop

Understanding the root causes prevents relapse:

1. **Template retrieval.** Claude defaults to the statistical average of all interfaces
   it's seen. Counter: the Art Direction Brief forces non-default choices before code.
2. **Loss aversion.** Claude avoids unusual choices because they feel risky. Counter:
   the Brief validates distinctive choices explicitly.
3. **Uniform application.** Claude applies one style (radius, color, font) identically
   everywhere. Counter: per-component specification in the Brief.
4. **Decoration vs integration.** Claude adds visual elements on top of a generic
   structure. Counter: build tokens and atmosphere FIRST, components SECOND.
5. **Stereotype compliance.** "Make it like X" → Claude produces stereotypical features
   of X rather than studying what makes X distinctive. Counter: 5-layer source research.


---

## Part V: Components — Designing Objects, Not Styled Divs

Each component is a physical object with material, weight, and behavior. Define every
state. If a state is missing, the design is incomplete.

---

### §BUTTONS

#### Every State Specified

| State | Surface | Transform | Shadow | Timing |
|---|---|---|---|---|
| **Rest** | accent fill or outline per variant | none | elevation shadow | — |
| **Hover** | lighten +5% or shift hue | translateY(-1px) scale(1.02) | shadow grows | 120ms ease-out |
| **Active** | darken -5% | translateY(+1px) scale(0.98) | shadow shrinks | 50ms, no easing |
| **Focus** | unchanged | none | `0 0 0 2px bg, 0 0 0 4px accent` | instant |
| **Disabled** | desaturated, 50% opacity | none | none | — |
| **Loading** | slightly muted | none | unchanged | spinner replaces text, width preserved |

#### Variants

**Primary:** filled accent, highest visual weight, shadow or glow.
**Secondary:** outlined or tonal surface, clearly lighter than primary, no shadow.
**Ghost:** no background/border at rest. Hover reveals subtle surface.
**Destructive:** calibrated error color, thicker border, hover amplifies warning.

Custom padding from Brief's spacing base. Min-width 140px for primary CTAs. Never `w-full`
except in mobile forms.

---

### §CARDS

Design as material surfaces, not white boxes.

```css
/* Glass card */
.card { background: oklch(18% 0.01 H / 0.6); backdrop-filter: blur(12px) saturate(1.15);
  border: 1px solid oklch(30% 0.008 H / 0.2); border-radius: var(--card-radius); }

/* Hover: physical lift */
.card { transition: transform 200ms ease-out, box-shadow 200ms ease-out; }
.card:hover { transform: translateY(-2px);
  box-shadow: 0 8px 24px oklch(6% 0.02 H / 0.2), 0 2px 6px oklch(8% 0.02 H / 0.1); }
```

Vary cards by purpose: featured cards larger, data cards denser, action cards have
accent border on the interactive edge. Not all cards should look the same.

---

### §INPUTS

| State | Treatment |
|---|---|
| **Rest** | Subtle inset shadow or tonal bg shift. Clearly a field without being aggressive. |
| **Hover** | Border shifts toward accent. Background lightens slightly. |
| **Focus** | Accent ring (2px + 2px offset). Background brightens. Label animates or changes color. |
| **Filled** | Distinct from empty rest — slight bg tone change or persistent label. |
| **Error** | Calibrated error border + message below. NOT separate red box. |
| **Disabled** | Reduced opacity, readable but clearly unavailable. |

Two personality options:
```css
/* Carved — inset into surface */
.input { background: oklch(11% 0.018 H); box-shadow: inset 0 2px 4px oklch(5% 0.02 H / 0.3);
  border: 1px solid oklch(20% 0.01 H / 0.3); }
.input:focus { border-color: var(--accent); box-shadow: inset 0 2px 4px oklch(5% 0.02 H / 0.3),
  0 0 0 3px oklch(72% 0.20 HA / 0.15); }

/* Underline — minimal, editorial */
.input { background: transparent; border: none; border-bottom: 2px solid oklch(30% 0.01 H / 0.4); }
.input:focus { border-bottom-color: var(--accent); }
```

---

### §NAVIGATION

Match spatial model to product:

| Model | When | Key design point |
|---|---|---|
| Tab bar | mobile, ≤5 destinations | Active indicator is distinctive, not just color underline |
| Sidebar | desktop, many destinations | The sidebar IS the product's personality — give it character |
| Command palette | keyboard-heavy, power users | Appearance, result formatting carry character |
| Breadcrumb | hierarchical content | Separator, current-page emphasis, overflow behavior |

Active nav item: accent color + weight change + positional indicator (side bar, underline, background).

---

### §EMPTY — Designing Nothing

Empty states are what new users see first. Design them as intentional compositions:

1. **Illustration or icon** — designed, not a stock icon. Could use the product's shape
   language decoratively.
2. **Warm title** — "Your workspace is ready" (NOT "No items found")
3. **Helpful body** — "Start by creating your first project" (NOT "Click button to add")
4. **Designed CTA** — prominent primary button, inviting

Match the product's voice and personality throughout.

---

### §LOADING

| Type | When | Implementation |
|---|---|---|
| **Skeleton** | structured content coming | Placeholder shapes matching layout, shimmer animation with accent |
| **Pulse** | fast load (300-1000ms) | Opacity pulse on the loading area |
| **Progress** | quantifiable long operation | Accent-colored bar with product easing |
| **None** | < 300ms | Faster than perception — no indicator needed |

Skeleton shimmer uses the product's surface colors, not generic gray.

---

### §ERRORS

Errors belong to the product's design language:
```css
.error { background: oklch(from var(--error) l c h / 0.08);
  border-left: 3px solid var(--error); border-radius: 0 var(--radius) var(--radius) 0;
  color: var(--text-1); }
```

Rules: use calibrated error color (not raw red). Write error messages in the product's
voice. Provide recovery paths, not just problem statements.

---

### §ICONS

1. **Choose library by personality:** Phosphor (6 styles, most flexibility), Tabler
   (clean, professional), Remix (large, complex apps), custom SVG (brand-critical).
2. **Set weight:** match typography weight. 1.5px = 400-weight body. 2px = 600-weight labels.
3. **Size by context:** nav 20-24px, inline = line-height, empty state 48-80px, status 12-16px.
4. **Color:** most icons = secondary text color. Active = accent. Status = semantic. Decorative = muted.

---

### §TABLES

Headers: label treatment (small-caps + tracking + medium weight), not bold gray bg.
Rows: subtle hover with accent tint (not gray). Horizontal rules only (low opacity), no vertical.
Align: numbers right, text left. Important data = primary color + medium weight.

```css
.table-header { font-size: 11px; font-weight: 500; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--text-3); border-bottom: 2px solid oklch(25% 0.008 H / 0.3); }
.table-row { border-bottom: 1px solid oklch(25% 0.008 H / 0.15); transition: background 100ms ease-out; }
.table-row:hover { background: oklch(from var(--accent) l c h / 0.04); }
```


---

## Part VI: Interaction — Hover, Focus, Motion, Feedback

How the interface responds to presence, attention, and action.

---

### §HOVER — Intensity Matches Importance

| Element Type | Hover Intensity | Technique |
|---|---|---|
| Primary action (button, CTA) | Strong | transform + shadow + color |
| Secondary action (link, menu) | Medium | color + subtle background |
| Content (card, list item) | Subtle | surface tint ± transform |
| Non-interactive | None | never add hover to non-interactive elements |

```css
/* Physical lift */
.interactive:hover { transform: translateY(-2px);
  box-shadow: 0 8px 20px oklch(6% 0.02 H / 0.15); }

/* Glow emergence */
.interactive:hover { box-shadow: 0 0 0 1px oklch(from var(--accent) l c h / 0.3),
  0 0 20px oklch(from var(--accent) l c h / 0.08); }

/* Surface reveal */
.nav-item:hover { background: oklch(50% 0.01 H / 0.06); border-radius: var(--radius); }

/* Border accent */
.card:hover { border-left: 3px solid var(--accent); }
```

Hover exit transition slightly slower (200ms) than enter (120ms) — objects take time
to settle back.

---

### §FOCUS — Accessibility + Design

Replace browser default. Use `:focus-visible` (keyboard only, not mouse clicks).

```css
/* Standard: accent outline with offset */
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Dark themes: glow */
:focus-visible { outline: none;
  box-shadow: 0 0 0 2px oklch(from var(--accent) l c h / 0.5),
  0 0 12px oklch(from var(--accent) l c h / 0.2); }
```

NEVER remove focus styles without replacing them.

---

### §ACTIVE — Press Physics

```css
.button:active { transform: translateY(1px) scale(0.98);
  box-shadow: 0 1px 2px oklch(6% 0.02 H / 0.2); /* shadow shrinks */
  transition: all 50ms; /* immediate */ }
```

Active = instant (0-50ms). Return from active = slightly slower (100ms).

---

### §TRANSITIONS — Duration Guide

| Interaction | Duration | Easing |
|---|---|---|
| Color change (hover bg) | 100-150ms | ease-out |
| Transform (hover lift) | 120-180ms | ease-out |
| Element entrance | 150-250ms | ease-out |
| Element exit | 100-180ms | ease-in (faster than entrance) |
| Layout change | 200-300ms | ease-in-out |
| Page transition | 250-400ms | ease-in-out |
| Micro-feedback (toggle) | 80-120ms | ease-out |
| Loading → Loaded | 300-500ms | ease-out |

---

### §EASING — Named Curves

```css
:root {
  --ease-fast: cubic-bezier(0.25, 0.46, 0.45, 0.94);       /* UI responses */
  --ease-physical: cubic-bezier(0.22, 0.61, 0.36, 1.0);    /* object motion */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1.0);      /* overshoot */
  --ease-dramatic: cubic-bezier(0.77, 0, 0.175, 1);         /* slow builds */
  --ease-enter: cubic-bezier(0, 0, 0.2, 1);                 /* appearing */
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);                  /* leaving */
}
```

Match to product: snappy → ease-fast. Premium → ease-physical. Playful → ease-spring.
Cinematic → ease-dramatic.

---

### §SCROLL

**Sticky header with material transition:**
```css
.header { position: sticky; top: 0; background: transparent; transition: all 200ms; }
.header.scrolled { background: oklch(13% 0.015 H / 0.85);
  backdrop-filter: blur(16px) saturate(1.2);
  border-bottom: 1px solid oklch(25% 0.01 H / 0.2); }
```

**Scroll reveal:**
```css
.scroll-reveal { opacity: 0; transform: translateY(20px);
  transition: opacity 400ms ease-out, transform 400ms ease-out; }
.scroll-reveal.visible { opacity: 1; transform: translateY(0); }
```

---

### §STAGGER — Choreographed Entrances

Delay per item: 30-50ms. Total cap: 150ms regardless of count.

```css
.list-item { opacity: 0; transform: translateY(12px); animation: enter 200ms ease-out forwards; }
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 40ms; }
.list-item:nth-child(3) { animation-delay: 80ms; }
.list-item:nth-child(4) { animation-delay: 120ms; }
.list-item:nth-child(n+5) { animation-delay: 150ms; }
@keyframes enter { to { opacity: 1; transform: translateY(0); } }
```

---

### §FEEDBACK

| Action | Feedback | Duration |
|---|---|---|
| Toggle | immediate color + position | 100ms |
| Button click | active state → spinner or check | 50ms + variable |
| Form submit | button loading → success | variable + 1500ms |
| Delete | item exit (slide/fade) | 200ms |
| Copy | tooltip "Copied" | 1500ms then fade |
| Error | shake or color flash on source | 300ms |

**Self-drawing checkmark** for success:
```css
@keyframes draw-check { 0% { stroke-dashoffset: 24; } 100% { stroke-dashoffset: 0; } }
.success-check { stroke-dasharray: 24; stroke-dashoffset: 24;
  animation: draw-check 300ms ease-out 100ms forwards; }
```

---

### §SIGNATURE — The One Motion

Identify the highest-frequency meaningful interaction. Design a distinctive animation
for that moment. Specify: trigger, duration (ms), easing (exact curve), what animates,
what personality it expresses. Apply it consistently. Protect it across updates.


---

## Part VII: Brand Identity — Logos, Marks, Recognition, Signature Systems

How to make a product visually identifiable and impossible to confuse with anything else.

---

### §RECOGNITION — Three Layers of Visual Identity

**Layer 1 — Instant (<50ms):** Dominant color impression + spatial pattern + contrast
signature. Identifiable from a blurred 50px thumbnail.

**Layer 2 — Personality (50-500ms):** Typography character, shape language, surface
quality, icon vocabulary. "This FEELS like [product]."

**Layer 3 — System (sustained):** Component patterns, motion vocabulary, state design,
voice-visual alignment. Power users notice when something is "off brand."

**Identity audit:** Can someone identify this product from: a blurred thumbnail? A single
button? An error message? A loading screen? The app icon? Each "no" = identity gap.

---

### §LOGO — Design Principles

| Type | What | When | Requirements |
|---|---|---|---|
| **Wordmark** | name as design (Google, Stripe) | name is distinctive | custom spacing, unique letter adjustments |
| **Logomark** | symbol (Apple, Nike) | strong app icon needed | legible at 16px, distinctive silhouette |
| **Combination** | symbol + text (Slack, Notion) | most versatile | works together AND separately |
| **Lettermark** | initials as mark (HBO, IBM) | long product name | letters treated as design, not typed |

**Protocol:**
1. Start from product character (Brief personality). Playful product ≠ institutional logo.
2. Define geometric foundation: circles (friendly), squares (stable), triangles (dynamic).
3. Design at 16px first. Works there → works everywhere.
4. Test on light bg, dark bg, colored bg, photography, app icon mask.
5. Produce: full color, single color (light + dark), minimum size, clear space, lockup variants.

Build as SVG with `viewBox`, `currentColor` fills, optimized paths, no strokes that
vanish at small sizes.

#### App Icon

Fill the canvas — no floating symbol in empty space. Product color as background,
mark in contrasting color. Simple silhouette legible at 29×29pt. No text in icon.
iOS: design within squircle. Android: design for adaptive mask safe zone (72×72dp visible).

---

### §SIGNATURE — The One Recognizable Element

Every memorable product has 1-3 signature elements recognizable without any context.

| Type | Example |
|---|---|
| Color signature | Spotify's exact green, Notion's warm black |
| Shape signature | Stripe's gradient mesh, Discord's squircle |
| Type signature | GitHub's monospace headings, Linear's tight tracking |
| Motion signature | Notion's cursor blink, Superhuman's archive vanish |
| Surface signature | Arc's frosted glass, Raycast's void |
| Layout signature | Bloomberg's density, Figma's canvas-first |

**Build one:** identify the highest-frequency moment or the product's core value
delivery point. Design a distinctive detail there. Apply consistently. Protect
aggressively across updates — the signature is the last thing to change.

---

### §SYSTEM — Complete Identity System

A visual identity generates consistent output across any new context:

1. Color system (palette + usage rules)
2. Typography system (fonts + scale + weight roles)
3. Shape system (radius vocabulary + motifs)
4. Icon system (style + sizing + coloring rules)
5. Imagery rules (photography/illustration style, forbidden imagery)
6. Voice-visual alignment (copy tone matches visual personality)
7. Motion system (vocabulary + signature + forbidden motion)
8. Spatial system (base unit + density rules + section rhythm)

**New screen test:** When creating a screen that's never existed, does the system
provide enough guidance that the new screen belongs to the same product?

---

### §NAMING — Name → Visual Translation

Analyze the product name:
- **Phonetic:** sharp consonants → angular shapes; soft vowels → curves
- **Semantic:** literal meaning → color associations, material suggestions
- **Cultural:** any heritage, domain, or historical associations

Example: "Obsidian" → dark, reflective, sharp → near-black + specular highlights +
angular geometry. "Meadow" → warm, open → earth palette + rounded shapes + generous spacing.

---

### §COMPETITIVE — Standing Out

Map 3-5 competitors on: primary color, type character, shape language, density, personality.
Identify: colors NOT used, type personalities unclaimed, density levels available.
Claim visual territory that's both distinctive AND appropriate for the product's function.

Distinctiveness is contextual — in a market of blue SaaS, amber is more recognizable
than a "better" blue. In a market of minimal, intentional density is distinctive.

---

### §CONSISTENCY — Identity Across Contexts

Tokens (color, font, spacing base) are universal across app, website, email, social, docs.
Adaptation rules: app = full motion/depth. Website = impact-focused. Email = color + spacing
only (limited CSS). Social = static, rely on color + type. Print = no motion, identity
must survive as still media.

---

### §EVOLUTION — What Changes vs What's Protected

**Protected (rebrand only):** primary accent, logo, primary font, signature element.
**Evolving (incremental):** secondary colors, surface treatments, motion details, spacing.
**Rule:** if changing it would confuse existing users about whether they're in the
right product — it's protected.


---

## Part VIII: Visual Science — Proportions, Impact, Contrast, Screen Technology

Mathematical and technological foundations of visual design.

---

### §PROPORTION — Harmonic Ratios

| Ratio | Value | Character | Use |
|---|---|---|---|
| 5:4 | 1.250 | comfortable | content cards, thumbnails |
| 4:3 | 1.333 | traditional | dashboard panels, classic photo |
| √2 | 1.414 | A-paper series | document layouts |
| 3:2 | 1.500 | photographic | photo displays, feature sections |
| φ | 1.618 | dynamic equilibrium | layout splits, section sizing |
| 16:9 | 1.778 | cinematic | hero sections, video contexts |

Apply to layout splits, component aspect ratios, section heights:
```css
.layout-golden { grid-template-columns: 1fr 0.618fr; }  /* 61.8% / 38.2% */
.hero { min-height: 61.8vh; }
.card-image { aspect-ratio: 4 / 3; }
.btn { padding: 0.65em 1.4em; }  /* height ≈ 2.5× font size */
```

φ is useful for: layout division, type scale generation (16 → 26 → 42 → 67px), spacing
progression (16 → 26 → 42 → 68 → 110px). NOT useful for: small icon design, micro-spacing,
color ratios, animation timing.

---

### §GRID — Beyond 12-Column Bootstrap

1. **Column count from content** — how many elements per screen? That defines columns.
2. **Gutter matches density** — tight: 12-16px. Balanced: 20-24px. Generous: 28-36px.
3. **Margin = 2-3× gutter** for bounded content. 0 for immersive.
4. **Asymmetric grids** are more sophisticated than uniform columns.

**Baseline grid** for vertical rhythm: set to body line-height (e.g. 24px), snap all
spacing to multiples. Makes the page feel "typeset."

```css
:root { --baseline: 24px; }
h1 { margin-bottom: calc(var(--baseline) * 2); }
p  { margin-bottom: var(--baseline); }
.card { padding: calc(var(--baseline) * 1.5); }
```

---

### §IMPACT — First-Impression Science

Users form aesthetic judgments in **50ms**. This affects perceived credibility,
willingness to explore, and recall.

Processing order:
1. **Color impression** (<20ms) — temperature + contrast level
2. **Visual complexity** (20-40ms) — moderate is rated best
3. **Balance** (30-50ms) — centered = safe, asymmetric = memorable
4. **Typographic clarity** (40-60ms) — hierarchy parseable even blurred

**Distinctiveness prevents bouncing.** A generic product triggers "seen this before" →
departure. An unusual palette, unexpected layout, or distinctive type creates "wait,
what's this?" → engagement.

---

### §WEIGHT — Visual Weight Theory

Visual weight = how strongly an element pulls the eye. Size × saturation × contrast
× isolation × position.

| Factor | Increases weight |
|---|---|
| Size | larger |
| Saturation | more vivid |
| Brightness contrast | further from surroundings |
| Isolation | more empty space around it |
| Position | lower on screen (bottom feels heavier) |
| Complexity | more detailed/textured |

**Weight budget:** one element gets max weight (focal point). Everything else is
subordinate. If 3+ elements compete for attention, none wins.

**Weight debugging:** blur the screen to 20%. The 3 darkest/brightest blobs should
contain the most important content. If the heaviest area isn't the primary content →
weight is misdirected.

---

### §CONTRAST — Five Types

**1. Value** (light/dark) — primary hierarchy tool. Min 4.5:1 for text (WCAG AA).
**2. Chromatic** (hue vs hue) — creates energy. Warm accent on cool bg = pop.
**3. Saturation** (vivid/muted) — most underused. High-sat among desaturated = commands attention.
**4. Scale** (large/small) — ≥1.5× size difference to read as different hierarchy level.
**5. Density** (packed/spacious) — dense data next to generous summary = visual interest.

**Contrast budget:** one element gets maximum contrast (focal point). Everything else
calibrated to be subordinate.

---

### §SCREEN — Display Technology

**OLED:** True black = zero emission. Enables void aesthetics. Risk: pure black next to
bright causes smearing on scroll → use `oklch(3-5%)` for scrollable dark backgrounds.

**LCD:** "Black" is dark gray (backlight bleeds). Dark themes less dramatic than on OLED.

**Retina/HiDPI:** 1px CSS = 2 physical pixels. For hairline borders: `0.5px` or `border-width: thin`.
Thin fonts (100-200) render poorly on non-Retina — min body weight 300 on LCD.

**120Hz:** Smoother animation visible. Subtle motion that looks choppy at 60Hz looks good at 120Hz.

**Display P3:** ≈25% more colors than sRGB, especially greens and reds. Available on Apple
devices + some Android. OKLCH naturally maps to wider gamuts.
```css
.accent { color: oklch(72% 0.20 35); /* sRGB fallback */
  color: color(display-p3 0.88 0.62 0.25); /* P3 — more vivid */ }
```

---

### §PERFORMANCE — Rendering as Design Constraint

**Safe to animate** (compositor-only, ~0 cost): `transform`, `opacity`.
**Expensive** (triggers paint): `background-color`, `box-shadow`, `border-radius`.
**Never animate** (triggers layout): `width`, `height`, `padding`, `margin`, `top`, `left`.

```css
.will-animate { will-change: transform, opacity; }
/* Remove will-change after animation to free GPU memory */
```

Use `transform: scale()` not width. `opacity` not display. `translate` not top/left.
Limit `backdrop-filter: blur()` to small areas. `content-visibility: auto` for off-screen.

---

### §RESPONSIVE — Character Across Viewports

| Viewport | Spatial | Type | Motion | Atmosphere |
|---|---|---|---|---|
| **Large** (1200px+) | generous margins, multi-column | display scale, tight tracking | full vocabulary | full effects |
| **Medium** (768-1199px) | compressed margins, 2-col | reduced display sizes | simplified (keep hover) | reduced complexity |
| **Small** (<768px) | single column, maintained rhythm | 16px min body, compressed display | essential only (no scroll-linked) | minimal (battery) |

**Constant across all viewports:** palette, font families, shape language, personality, accent rules.

---

### §DENSITY — Information Economics

| Level | px²/element | Character | Use |
|---|---|---|---|
| Sparse | 200+ | dramatic, premium | Apple, luxury brands |
| Balanced | 80-200 | comfortable, scannable | most SaaS, consumer |
| Dense | 30-80 | efficient, expert | Bloomberg, IDEs |
| Ultra-dense | <30 | maximalist | terminals, data dashboards |

Derive from audience: experts daily → dense. Occasional users → balanced.
Marketing/first-impression → sparse. Data comparison → dense.

For high density without chaos: aggressive type hierarchy, saturation contrast instead
of spacing, thin rules instead of card borders, background tint alternation.


---

## Part IX: Psychology — Emotion, Meaning, Trust, Attention

Why design choices feel the way they do. Evidence-based, not pop-psychology.

---

### §COLOR-PSYCH — What Research Shows

Universal (physiological, not cultural):
- **Temperature:** warm hues (0-60) = energy, urgency, closeness. Cool (180-300) = calm, distance, openness.
- **Saturation:** high (>0.15 OKLCH) = energetic, casual, attention-demanding. Low (<0.06) = calm, formal, sophisticated.
- **Brightness:** high (>80%) = light, optimistic. Low (<20%) = heavy, dramatic, serious.

For global audiences: rely on temperature + saturation (universal) rather than specific
hue meanings (cultural). See cultural color table below only as awareness, not rules.

| Hue | Western | East Asian | Middle Eastern |
|---|---|---|---|
| Red | danger, passion | luck, prosperity | danger |
| White | purity, space | death, mourning | purity |
| Blue | trust, calm | healing | protection |
| Green | nature, growth | family | paradise |

#### Functional Color in UI

| Function | Approach |
|---|---|
| Primary action | highest saturation in palette |
| Destructive | warm-shifted red-orange, distinct from primary |
| Success | cool green toward teal (avoids traffic-light cliché) |
| Warning | amber, NOT yellow (yellow illegible on white) |
| Info | palette's own hue at medium saturation |
| Disabled | dramatically desaturated + low contrast |
| Selection | accent at 8-15% opacity as surface tint |

---

### §SHAPE-MEANING — Shapes Carry Meaning

| Shape | Association | When to use | When to avoid |
|---|---|---|---|
| Circles/rounds | friendly, safe, inclusive | consumer, wellness, children | authority, precision tools |
| Squares/rectangles | stable, reliable, structured | business, institutional, data | creative, emotional products |
| Triangles/angles | dynamic, precise, cutting-edge | tech, gaming, performance | calming, hospitality |
| Organic/irregular | natural, handcrafted, authentic | artisan, creative, personal | data-heavy, institutional |

**Radius as personality dial:**
0px = technical → 6-8px = professional → 16-24px = friendly → 100px = playful

---

### §EMOTION-MAP — Emotion → Design Properties

| Emotion | Color | Type | Shape | Motion | Density |
|---|---|---|---|---|---|
| **Calm** | cool, low chroma | light weights, open | rounded, wide | slow, eased | sparse |
| **Excitement** | warm, high chroma | bold, tight | angular, mixed | fast, spring | moderate |
| **Trust** | blue-cool, medium chroma | clear hierarchy | moderate radius | subtle | balanced |
| **Urgency** | red-warm, high contrast | heavy, caps, tight | sharp, tight | fast, direct | dense |
| **Delight** | bright, multi-hue | variable, display | round, pill | bouncy, spring | moderate |
| **Focus** | neutral-cool, very low chroma | mono or precise | minimal radius | none or minimal | dense |
| **Intimacy** | warm, low brightness | serif, light | generous radius | slow, gentle | sparse |
| **Power** | dark, high contrast, saturated accent | heavy, condensed | angular, sharp | fast, mechanical | dense |
| **Innovation** | vivid, unusual hues | geometric | unconventional geometry | smooth, polished | balanced |

#### Emotional Arc Across Screens

Onboarding → warm, inviting. Active work → focused, efficient. Achievement → delightful.
Error → calm, supportive. Empty state → encouraging. Loading → patient, ambient.

Each moment can shift specific properties while maintaining core identity (palette, fonts, shapes).

---

### §MEANING — Visual Semiotics

**Iconic signs** (resemble what they represent): trash can → delete. Most learnable.
**Indexical signs** (connected to meaning): red border → error. Feel natural.
**Symbolic signs** (pure convention): ☰ → menu. Must be learned — don't invent new ones.

#### Visual Rhetoric

**Ethos (credibility):** consistent system, appropriate density, error-free, current design.
**Pathos (emotion):** color temperature, imagery, motion energy, texture intimacy.
**Logos (logic):** clear hierarchy, data visualization, progressive disclosure, patterns.

---

### §VALUES — Design Communicates Values

| Value | Visual expression |
|---|---|
| Transparency | open layouts, clear labeling, no hidden complexity |
| Quality | precise spacing, intentional type, consistent detail |
| Innovation | unconventional layouts, distinctive interactions |
| Accessibility | high contrast, clear labels, generous targets |
| Playfulness | bright colors, rounded shapes, animated moments |
| Authority | dense information, precise type, institutional colors |
| Speed | minimal decoration, instant transitions, progressive render |

**Value audit:** For each stated value, identify how the design expresses it and where
it contradicts it. Contradictions create subconscious distrust.

---

### §TRUST — Visual Architecture of Trust

**Builds trust:** consistent visual system, appropriate density, error-free presentation,
current design language, clear contact info, transparent process, graceful error handling.

**Destroys trust:** inconsistent styling across screens, dark patterns, excessive decoration
without substance, generic stock imagery, too many competing CTAs, aggressive manipulation.

---

### §ATTENTION — Capture and Budget

**Pre-attentive features** (<200ms, automatic): color, size, motion, contrast, position.
The most important element should be most distinct in ≥1 of these.

**Attention budget:** 1 high-attention element per screen (primary). 2-3 medium. Everything
else low. If 3+ elements compete equally → chaos.

| Technique | Strength | Use | Risk |
|---|---|---|---|
| Color contrast | strong | primary CTA | visual noise |
| Scale contrast | strong | headlines, metrics | diminishes everything else |
| Motion | very strong | notifications, live data | distraction |
| Isolation | moderate | hero elements | wasted space |
| Novelty | very strong, brief | first impressions | habituates quickly |

---

### §COGNITIVE — Managing Mental Load

**Miller's Law (7±2):** ≤7 nav items, ≤7 visible form fields. Group or progressively disclose beyond that.
**Hick's Law:** decision time ∝ log(choices). Reduce visible choices. Hide secondary actions.
**Fitts's Law:** primary actions = large + close. Destructive = small + far. Touch min 44×44px.

Design for clarity, not minimalism. A dense expert tool can have low cognitive load if
everything is where the user expects it.

---

### §MEMORY — What Gets Remembered

**Distinctiveness:** unusual elements remembered more than common ones. One distinctive
choice > ten competent-but-standard ones.
**Emotional arousal:** delight, surprise, warmth → better recall.
**Von Restorff effect:** the ONE element different from all others is the one remembered.
This is why the signature element matters.

**Memorability test:** After seeing the product once, can you describe its visual identity
in one sentence? Is there ONE element that's distinctly this product's? Would you pick
it from a lineup of 5 similar products?

---

### §FEELING — Vocabulary of Interface Feeling

Name the specific feelings the product should evoke:

**Spatial:** expansive/cramped · grounded/floating · open/enclosed
**Temporal:** swift/sluggish · responsive/dead · rhythmic/jerky
**Material:** solid/hollow · warm/cold · smooth/rough · heavy/light
**Relational:** welcoming/cold · guiding/abandoning · respecting/condescending

**Room test:** "If this interface were a room I walked into, how would I feel?"
The answer must match the Brief's emotional target.


---

## Part X: Audience — Who You're Designing For

Design decisions derive from who uses the product. This module maps audience
characteristics to visual properties.

---

### §PROFILE — Audience Definition

Complete before making visual decisions:

```
Primary user:
  Expertise:      novice / intermediate / expert / mixed
  Frequency:      daily-for-hours / daily-brief / weekly / monthly / once
  Emotional context: stressed / focused / relaxed / creative / urgent
  Tech comfort:   digital native / comfortable / reluctant
  Physical context: desk / mobile-walking / couch / presentation / shared-screen
  Cultural scope:  global / regional / professional subculture
```

#### Audience → Design Mapping

| Factor | Low end → design | High end → design |
|---|---|---|
| Expertise | guided, visible, labeled, ≤7 elements | dense, shortcuts, icon-only OK, 50+ elements |
| Frequency | discoverable, self-explanatory | efficient, customizable, minimal |
| Stress | zero friction, clarity first | delight OK, exploration welcome |
| Tech comfort | explicit labels, no jargon, clear nav | conventions expected, dense OK |

---

### §DEMOGRAPHICS — Age and Culture

#### Age-Informed Design

| Generation | Respond to | Reject | Design priority |
|---|---|---|---|
| Gen Z (1997-2012) | bold color, motion, personality, dark mode | corporate blandness, slow | trend-aware, visual-first |
| Millennial (1981-96) | clean, efficient, transparent | complexity for its own sake | value-communicating |
| Gen X (1965-80) | professional, functional, reliable | style over substance | no-nonsense efficiency |
| Boomer (1946-64) | larger text, high contrast, explicit labels | hidden nav, gesture-only, small targets | clear, trustworthy |

#### Cultural Dimensions

**Reading direction:** LTR (English, French) → nav left, actions right. RTL (Arabic, Hebrew)
→ entire layout mirrors. Use CSS logical properties by default (`margin-inline-start`, not `margin-left`).

**Color meaning varies culturally** — for global products, rely on temperature + saturation
(universal) not hue associations (cultural). See §COLOR-PSYCH.

**Formality:** High-context cultures (Japan, China, Arab states) → visual hierarchy reflects
status/rank. Low-context (US, Northern Europe) → flatter, informal OK.

**Text expansion:** German ≈+30% from English. French ≈+20%. Build flexible layouts —
never assume English text length. Test with 50% longer strings.

#### RTL Protocol

Mirror: layout, directional icons, shadows, border accents, navigation flow, reading order.
Keep unchanged: non-directional icons (trash, gear), logos, brand elements.
```css
.component { margin-inline-start: 16px; padding-inline-end: 24px;
  text-align: start; border-inline-start: 3px solid var(--accent); }
```

---

### §EXPERTISE — Novice vs Expert

| Dimension | Novice | Expert |
|---|---|---|
| Density | low (5-7 elements) | high (50+) |
| Labels | explicit (icon + text) | minimal (icon-only OK) |
| Navigation | always visible, labeled | compressed, shortcuts |
| Disclosure | heavy progressive | most features visible |
| Feedback | explicit, confirm every action | subtle toast, no interruption |
| Defaults | aggressive pre-fill | smart suggestions |
| Hierarchy | dramatic (one focal point) | flat (many items scannable) |
| Errors | prevent (disabled states, confirms) | undo over confirm |

Products spanning skill levels need both modes with gradual transition.

---

### §ACCESSIBILITY — Design Constraint That Improves Everything

**Contrast:** text 4.5:1 min (AA), 3:1 for large text and non-text UI. Target 7:1 (AAA).
**Color alone:** never sole meaning carrier. Add icon, border, weight, or label alongside.
**Focus:** visible ring on EVERY interactive element, both light and dark mode.
**Motion:** respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important; }
}
```
**Text:** min 16px body (mobile), 14px (desktop). Line-height 1.4-1.6. Max 75ch width.
**Touch:** min 44×44px (iOS) / 48×48dp (Android). Primary actions large + close.
Never disable zoom (`user-scalable=yes` always).

---

### §SOCIAL — Community and Status Design

**Belonging signals:** badges, ranks, custom avatars, shared visual language — designed
as integrated elements matching the product's style, not bolted-on afterthoughts.

**Status differentiation:** free = standard palette + full functionality. Premium = subtle
accent additions (badge, border glow). Elite = distinctive surface treatment. Desirable
but not exclusionary.

---

### §PROOF — Social Proof Design

| Type | Design treatment |
|---|---|
| Testimonials | real avatar + name + role + quote. Quote in slightly larger type. |
| Metrics | large display number + small label. Animate count on scroll-in. 2-4 grouped. |
| Logos | grayscale, uniform height, generous spacing. "Trusted by" label above. |
| Activity | "X people doing Y" — small, muted, ambient. Not blinking alert. |

Anti-patterns: stock-photo testimonials, 20-number metric walls, colored logos fighting
the palette, "As seen in" logos of companies that didn't feature you.

---

### §MARKETING — Marketing vs Product Visual Strategy

| Dimension | Marketing page | Product UI |
|---|---|---|
| Goal | convert visitors → users | help users accomplish tasks |
| Density | sparse, impact-first | varies by product type |
| Motion | dramatic, scroll reveals | functional, state transitions |
| Typography | display-heavy, large bold | body-heavy, readable |
| Color | accent-dominant | accent on interactive elements only |
| Imagery | rich (screenshots, demos) | sparse (data, user content) |

#### Above-the-Fold Hierarchy

1. **Value proposition** — largest text, answers "what is this?"
2. **Supporting evidence** — secondary text, answers "why should I care?"
3. **Primary CTA** — highest visual weight, answers "what do I do?"
4. **Visual proof** — screenshot or demo showing the product

This is the only content that matters for bounce rate. Everything below is for users
who already decided to stay.

---

### §CONVERSION — Visual Principles

**Single focus:** one primary action per screen, visually dominant through color + size + isolation.
**Path of least resistance:** visual flow from arrival → CTA with zero distraction.
**Commitment gradient:** low-commitment CTA (ghost button) → high-commitment (filled primary).
**Forms:** minimize fields, group related, inline validation, progress for multi-step,
auto-focus first field, submit button = accent + max weight.

Genuine urgency can be communicated. False urgency (fake timers, artificial scarcity)
is a dark pattern that destroys trust.

---

### §POSITIONING — Visual Market Position

Map competitors on two axes relevant to the domain:
```
SaaS:     Minimal ←→ Feature-rich   ×   Technical ←→ Consumer
Consumer: Playful ←→ Serious        ×   Budget ←→ Premium
Creative: Structured ←→ Expressive  ×   Professional ←→ Casual
```

Find open territory that's both available AND appropriate. Commit through specific
visual decisions. Execute consistently across all touchpoints.


---

## Part XI: Platforms — Cross-Platform Token Implementation

Translate the Art Direction Brief into platform-specific code. The visual language is
universal — implementation adapts. All example values below are PLACEHOLDERS — replace
with the actual Brief values.

---

### §WEB — CSS Custom Properties

```css
:root {
  /* Primitives (replace with Brief values) */
  --hue-base: 245;  --hue-accent: 35;  --space-base: 6px;

  /* Surfaces */
  --color-bg: oklch(13% 0.015 var(--hue-base));
  --color-surface: oklch(17% 0.012 calc(var(--hue-base) - 5));
  --color-elevated: oklch(21% 0.010 calc(var(--hue-base) - 10));

  /* Text */
  --color-text-1: oklch(93% 0.008 var(--hue-base));
  --color-text-2: oklch(68% 0.012 var(--hue-base));
  --color-text-3: oklch(48% 0.010 var(--hue-base));

  /* Accent */
  --color-accent: oklch(72% 0.20 var(--hue-accent));
  --color-accent-hover: oklch(78% 0.22 var(--hue-accent));
  --color-accent-muted: oklch(72% 0.20 var(--hue-accent) / 0.15);

  /* Shape */
  --radius-btn: 6px;  --radius-card: 12px;  --radius-input: 6px;
  --radius-modal: 16px;  --radius-badge: 100px;

  /* Spacing */
  --sp-1: 6px; --sp-2: 12px; --sp-3: 18px; --sp-4: 24px;
  --sp-6: 36px; --sp-8: 48px; --sp-12: 72px;

  /* Shadows — color-matched */
  --shadow-sm: 2px 2px 4px oklch(8% 0.02 var(--hue-base) / 0.25);
  --shadow-md: 4px 4px 12px oklch(6% 0.02 var(--hue-base) / 0.20),
               1px 1px 3px oklch(8% 0.02 var(--hue-base) / 0.15);

  /* Motion */
  --dur-fast: 100ms;  --dur-normal: 200ms;  --dur-slow: 350ms;
  --ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1.0);
}
```

**OKLCH fallback** for older browsers:
```css
.el { background: #1a1d2e; background: oklch(13% 0.015 245); }
```

If using Tailwind, extend config to replace ALL defaults with Brief values. Avoid
raw utility classes for art-directed projects — they encourage defaults.

---

### §ANDROID — XML + Compose

```xml
<!-- res/values/colors.xml (replace values from Brief) -->
<color name="bg_base">#FF1B1D2D</color>
<color name="bg_surface">#FF222438</color>
<color name="text_primary">#FFE8E9F0</color>
<color name="text_secondary">#FFA0A3B5</color>
<color name="accent">#FFD4A054</color>
<color name="error">#FFD45454</color>
```

```kotlin
// Compose theme
object AppColors {
  val bgBase = Color(0xFF1B1D2D)
  val bgSurface = Color(0xFF222438)
  val textPrimary = Color(0xFFE8E9F0)
  val accent = Color(0xFFD4A054)
}

val AppShapes = Shapes(
  small = RoundedCornerShape(6.dp),   // buttons, chips
  medium = RoundedCornerShape(12.dp), // cards
  large = RoundedCornerShape(16.dp),  // modals, sheets
)
```

**Android-specific:**
- Edge-to-edge: `WindowInsetsCompat`. Status/nav bar = `bg_base`, not black.
- Ripple: customize `colorControlHighlight` to accent at low opacity.
- Dark mode: implement `values-night/` with DESIGNED palette. Set `forceDarkAllowed="false"`.
- Customize ALL Material 3 theme attributes — not just colorPrimary. Check: `colorSurface`,
  `colorSurfaceContainer`, `colorOutline`, `colorOnSurfaceVariant`.

---

### §IOS — SwiftUI

```swift
enum AppColor {
  static let bgBase = Color(red: 0.106, green: 0.114, blue: 0.176)
  static let bgSurface = Color(red: 0.133, green: 0.141, blue: 0.220)
  static let textPrimary = Color(red: 0.910, green: 0.914, blue: 0.941)
  static let accent = Color(red: 0.831, green: 0.627, blue: 0.329)
}

enum AppRadius {
  static let button: CGFloat = 6
  static let card: CGFloat = 12
  static let modal: CGFloat = 16
}

enum AppSpacing {
  static let base: CGFloat = 6
  static let sm: CGFloat = 12
  static let md: CGFloat = 18
  static let lg: CGFloat = 24
}
```

**iOS-specific:**
- Dynamic Type: support with `@ScaledMetric` for scaling spacing.
- Haptics: pair visual feedback with `UIImpactFeedbackGenerator`.
- Dark/Light: use `@Environment(\.colorScheme)` with designed palettes, not auto-inversion.
- Safe areas: design for Dynamic Island and home indicator.

---

### §RN — React Native

```typescript
export const colors = {
  bg: { base: '#1B1D2D', surface: '#222438', elevated: '#2A2D44' },
  text: { primary: '#E8E9F0', secondary: '#A0A3B5' },
  accent: { default: '#D4A054', muted: 'rgba(212,160,84,0.15)' },
} as const;

export const radius = { btn: 6, card: 12, input: 6, modal: 16 } as const;
export const spacing = { base: 6, sm: 12, md: 18, lg: 24, xl: 36 } as const;
```

OKLCH not natively supported — convert to hex in token layer. Use `react-native-reanimated`
for distinctive motion (standard `Animated` is too limited).

---

### §FLUTTER — Dart

```dart
class C { // Colors
  static const bgBase = Color(0xFF1B1D2D);
  static const bgSurface = Color(0xFF222438);
  static const textPrimary = Color(0xFFE8E9F0);
  static const accent = Color(0xFFD4A054);
}

ThemeData appTheme() => ThemeData(
  scaffoldBackgroundColor: C.bgBase,
  colorScheme: ColorScheme.dark(primary: C.accent, surface: C.bgSurface,
    onPrimary: C.bgBase, onSurface: C.textPrimary),
  cardTheme: CardThemeData(color: C.bgSurface,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0),
);
```

Override `ThemeData` completely — don't leave ANY default Material colors alive. Use
`CustomPainter` for gradient meshes and atmospheric effects.

---

### §CROSS — Single Source of Truth

For multi-platform, define tokens in JSON and generate platform code:

```json
{
  "color": {
    "bg-base": { "hex": "#1B1D2D", "oklch": "oklch(13% 0.015 245)" },
    "accent": { "hex": "#D4A054", "oklch": "oklch(72% 0.20 35)" }
  },
  "radius": { "btn": 6, "card": 12 },
  "spacing": { "base": 6 }
}
```

This generates CSS variables, Android XML, Swift enums, Kotlin objects, Dart classes.
Every platform gets the same identity from one source.

