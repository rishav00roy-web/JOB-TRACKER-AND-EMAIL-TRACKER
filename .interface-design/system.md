# Agentic Job Tracker — design system

## Font (fixed a real bug, 2026-09-05)
`layout.tsx` was loading Geist via `next/font/local` and setting
`--font-geist-sans`/`--font-geist-mono` as CSS variables on `<body>` — but
nothing ever consumed them. Tailwind's `font-sans`/`font-mono` defaulted to
the system stack the entire time, so despite "using Geist," the whole app
(which leans heavily on `font-mono` for labels/tags/buttons) was rendering
in generic system fonts. Fixed in `globals.css`'s `@theme` block:
`--font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif`
and the equivalent for `--font-mono`. **If Geist (or any custom font) is
ever swapped in this project again, verify the `@theme` mapping actually
exists — loading a font file is necessary but not sufficient.**

## Depth — double-bezel cards (2026-09-05)
User feedback after the first redesign pass: it "doesn't have the premium
tool effect." The first pass was a conservative refinement (fix real bugs,
preserve the existing look) — this was a genuinely different ask: make it
*read* as premium, not just be bug-free. Pulled specific techniques from
the `high-end-visual-design` skill, but that skill is written for
marketing/landing pages (massive `py-24+` whitespace, hero sections, nav
islands) — applying it wholesale would have wrecked a dense working
dashboard. Cherry-picked what transfers to a data-dense tool:

- **Job cards now use a "double-bezel" structure** — a thin outer shell
  (`bg-white/[0.02] ring-1 ring-white/5 rounded-2xl p-1`) wrapping the
  actual card (`rounded-xl` = outer 16px − 4px shell padding, concentric).
  The inner card gets an inset highlight
  (`shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]`) so it reads as a
  physical glass plate in a tray, not a flat div. **Apply this same
  outer-shell + concentric-inner pattern to any other primary card/panel
  added later** (e.g. if the Tailor panel's `ChangeCard` gets revisited).
- **Custom easing, not default `ease`**: `ease-[cubic-bezier(0.32,0.72,0,1)]`
  on card hover (border/shadow) and the new hover lift
  (`hover:-translate-y-0.5`, transform-only, GPU-safe). Use this same
  curve for future hover/entrance motion on this board rather than
  Tailwind's default `ease-out`/`ease-in-out` — it's what actually reads
  as "considered" rather than default.
- **Explicitly did NOT apply**: bento/asymmetric grids, massive section
  padding, hero typography, nav-island patterns, staggered scroll-reveal
  entrances. All of those are landing-page moves that would hurt a
  frequently-used dense dashboard (per `interface-design`'s own rule:
  high-frequency interactions get *less* motion, not more). If a future
  request wants a landing/marketing page for this project (unlikely, but
  possible for a portfolio showcase of it), those techniques become
  appropriate there — not on the working board itself.

## Direction and feel
Dark, technical, data-dense — a monitoring console for a personal job search,
not a marketing dashboard. Monospace labels (`font-mono`) for anything that
reads as data (stage counts, skill tags, scores, timestamps, buttons);
default sans for human-written content (job titles, company names). Feels
like a terminal that got design attention, not a SaaS product demo.

## Accent — one hue, not two
`--primary`: cyan, `184 75% 52%` (dark mode). This was `184 100% 50%` —
desaturated because 100% saturation combined with a second accent
(`--secondary`, violet `258 90% 66%`) is the textbook "AI-generated gradient"
fingerprint. **One accent used with intention beats two used for variety.**

`--secondary` (violet, now `258 55% 68%`, also desaturated) is reserved
*specifically* for the niche-opportunity flag on job cards — the one thing on
the board that is deliberately not a score. Do not reach for it as a general
second accent, a "medium tier" color, or decoration. If a new component needs
a second meaning-color, ask whether it's a genuinely distinct semantic
(like niche-flag) or just variety-for-variety's-sake before using it.

Score tiers are expressed as **glow/opacity intensity on the one accent**,
not a hue switch:
- `score >= 60` → full opacity, strong glow (`strong` tier)
- `score >= 35` → full opacity, faint glow (`good` tier)
- `score < 35` → `stroke-opacity: 0.35`, no glow (`weak` tier)

**Why 60/35 and not 80/50:** scoring.ts's headline score is the *best single
category's* coverage (ai / non_technical / technical), not a whole-catalogue
average — see `apps/web/lib/scoring.ts`. A genuinely strong non-technical
AI-role match often lands ~35-60% coverage of that category's skill list, not
80+. The original 80/50 thresholds painted most real strong matches as dull
gray. If scoring.ts's model changes, revisit these thresholds together —
they're coupled, not independent design choices.

## Depth strategy
Borders + backdrop-blur, not shadows-for-elevation. `bg-black/40` +
`backdrop-blur-xl` for columns, `bg-black/60` + `backdrop-blur-md` for cards
(cards are one layer "up" from columns via slightly higher opacity, not a
different hue). Hover state on cards: `border-primary/50` +
a soft cyan-tinted box-shadow glow (`rgba(56,214,214,0.12)`) — tinted to the
accent hue, not generic black. Commit to this; don't introduce a second
elevation strategy (layered drop-shadows, flat color-shift surfaces) elsewhere
on the board.

## Spacing base unit
4px grid via Tailwind defaults (`gap-4`, `p-4`, `px-6 py-4`, etc). Columns:
`p-4` outer, `gap-4` between cards. Card internals: `gap-3`. No custom
spacing scale — stock Tailwind spacing is enough for a personal tool this
size.

## Motion
- Card hover: `transition-[border-color,box-shadow] duration-300` — named
  properties, not `transition-all` (was `transition-all duration-300`,
  fixed).
- Score ring fill: `transition-[stroke-dashoffset] duration-700 ease-out`.
- Every interactive element (links, buttons, mode toggles, accept/reject,
  export, remove-bullet, upload/save): `active:scale-[0.96]` for press
  feedback — **0.96 exactly**, not 0.97 or 0.95 (per the `better-ui` skill:
  "Always 0.96; anything below 0.95 feels exaggerated" — these are precise
  values, not a range to approximate). Disabled buttons get
  `disabled:active:scale-100` so the press feedback doesn't fire while
  disabled.
- Global `:focus-visible` ring defined once in `globals.css` (`outline: 2px
  solid hsl(var(--ring))`), not per-component — new interactive elements
  inherit it for free, don't hand-roll focus styles.
- `prefers-reduced-motion: reduce` is respected globally (collapses all
  animation/transition durations to ~0).

## Accessibility patterns established
- The Tailor panel (`tailor-panel.tsx`) is a full-screen overlay acting as a
  modal: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing
  at the job title, Escape key closes it, focus moves to the close button on
  open and restores to whatever triggered the panel on close. **Any future
  full-screen overlay/modal on this board should follow this exact pattern**
  (see the `useEffect` focus-management block at the top of
  `TailorPanel` for the reusable shape — `triggerRef` +
  `document.activeElement` capture, `closeButtonRef.current?.focus()` on
  mount, `keydown` listener for Escape, focus restore in the cleanup
  function).
- Icon-only or ambiguous buttons get `aria-label` (close button = "Close
  tailor panel", export buttons = "Export as .docx" / "Export as .pdf").
  Decorative glyphs inside labeled buttons/links (the ✕, the ↗ arrow) get
  `aria-hidden="true"` so screen readers don't double-announce.
- Error messages use `role="alert"`. Toggle-style buttons (tailoring mode)
  use `aria-pressed`. Async buttons use `aria-busy` while running.
- Any dynamic/counting number gets `tabular-nums` (score ring digit, the
  before/after relevance stats in the tailor panel) — prevents digit-width
  layout shift.
- **Every input/textarea gets an explicit `aria-label`, even when it has a
  `placeholder`.** Placeholder text disappears on input and isn't reliably
  announced by screen readers — it's not a substitute for a label. This
  applies broadly across `profile-editor.tsx`'s ~15 fields (name/email/
  summary/skills/experience rows/bullets); when a field repeats per row
  (e.g. "Title" for each experience entry), include the row index in the
  label (`Title, experience 2`) so screen-reader users can tell rows apart.
- Error messages use `role="alert"` consistently across the app (job-board
  load failure on `page.tsx`, profile load/save failure on
  `profile-editor.tsx`) — matches the pattern established in the tailor
  panel. `page.tsx`'s error state was a bare `text-red-500` div with no
  token/structure; fixed to the same `bg-destructive/10 border-destructive/
  30 text-destructive` treatment used everywhere else.

## Key component patterns
- **ScoreRing** (`kanban-board.tsx`) — 40×40px (`w-10 h-10`), 14px SVG
  radius, 3px stroke, digit at `text-[11px] font-bold font-mono
  tabular-nums`. Tier logic lives here (see Accent section above) — don't
  duplicate the 60/35 thresholds elsewhere, import/derive from this if a
  second place ever needs the tier.
- **Job card** (`kanban-board.tsx`) — `bg-black/60 backdrop-blur-md border
  border-white/10 p-4 rounded-xl`, `gap-3` internal stack. Footer row
  (View Posting link + Tailor button) is `border-t border-white/5 pt-3`,
  space-between.
- **Column** — `w-[340px] bg-black/40 backdrop-blur-xl border border-white/5
  rounded-2xl p-4`, fixed width, horizontal scroll container for the whole
  board (`overflow-x-auto` on the parent flex row).

## Not yet addressed (flagged, not fixed)
- Concentric radius between column (`rounded-2xl`/16px) and card
  (`rounded-xl`/12px) wasn't touched — the two aren't directly nested/flush
  (there's padding + gap between them), so the standard "outerRadius =
  innerRadius + padding" rule doesn't cleanly apply here. Worth a fresh look
  if the layout structure changes.
- No stagger-entrance animation on card mount — low priority since
  `initialJobs` renders server-side with no client-side loading moment to
  animate. Would matter if the board ever adds client-side live-refresh.
