# Handoff — next session

**Written:** 2026-07-28
**Status:** Nothing here is implemented. This is an agreed design idea plus three
verified UI defects, written down so a fresh session can pick them up cold.

## Where the project stands

`main` is pushed and deployed to <https://cooking-times.pages.dev>. 126 unit
tests, Biome linting, GitHub Actions CI plus CodeQL v4, all green. The
reverse-engineered spec and its 26-gap register are in
`docs/superpowers/specs/2026-07-25-cooking-times-design.md`; every gap is closed
except **G13** (unlimited cooking capacity) and **G14** (zero prep and transition
time), which are open by explicit decision.

Read `CLAUDE.md` first for the layout, conventions and traps.

---

# Part 1 — Manual dish timers

## The problem

There is a single clock. `startedAt` is one timestamp and every dish's start and
finish is a fixed offset from it. The app knows when it *told* you to start the
chicken; it has no idea when you actually did. Start four minutes late and the app
will announce the chicken as done with four minutes left on it.

That is a genuine defect, not a missing feature, and for chicken it is not
cosmetic.

## The design, as agreed

Each dish keeps its **scheduled** start time exactly as now — the plan is still
"in a perfect world these all finish together". What changes is that a dish's
countdown can be anchored to when it **actually** started.

- **One global toggle: automatic vs manual.** Default should be manual, because
  manual is the only mode that is ever strictly correct; automatic assumes you
  were punctual.
- **A small "play" button on each dish row**, which starts that dish's timer.
  These are **disabled when the global toggle is set to automatic**, since the
  clock is then doing the work.
- No per-dish auto/manual toggles. They were considered and rejected: a global
  toggle plus per-dish toggles produces a tri-state mess (what does flipping
  global mean when one dish disagrees?) and lets you build a plan where half the
  timings are observed and half are assumed, which is the hardest state to reason
  about and nobody's actual intent.

## Why this is worth doing

It closes **G14 for free.** If each start is confirmed, transition time is
absorbed by reality — you press play when you are actually ready. No changeover
setting, no budgeting, no model. That is a better answer to G14 than the setting
built in Phase 4 and deleted, because it removes an assumption instead of adding
machinery.

It is also additive to the core: `calculateSchedule` still produces the plan
untouched. Each schedule item gains an observed start.

## Four decisions still open

1. **Drift: show it or re-plan around it?** Once the chicken is five minutes late
   it finishes five minutes after everything else — the synchronised finish is
   broken by the cook's own lateness. Either show the drift ("chicken 5 min late,
   meal now 19:35") or re-time the dishes not yet started to converge on the new
   finish. *Recommendation: show it, do not re-plan.* Re-planning is the same
   slope that produced the capacity machinery, and `recalculateSchedule` already
   exists if that decision is ever reversed.

2. **What happens to a dish that is never started?** Forget to press play and the
   countdown never begins; the app will never announce that dish. Currently a
   missed alert is recoverable, but a missed confirmation strands the dish
   permanently. Options: nag when overdue, auto-start after a grace period, or
   simply show it as overdue. *Recommendation: nag.*

3. **Does the cook also confirm taking a dish off the heat?** The identical
   argument applies — leave the steak on two minutes longer and its rest should
   start two minutes later. Confirming only the start solves half the problem and
   lets the rest phase drift silently. Scoping v1 to start-only is defensible if
   the limitation is stated.

4. **Pause and reset semantics.** One anchor becomes N anchors, all needing to
   persist across a reload. The current single-anchor design is precisely why
   reload-survival is clean (see `CLAUDE.md`). Not hard, but more surface.

## The design constraint that matters most

The feature asks for a tap at the moment the cook's hands are busiest and
dirtiest. **"I didn't press it because I was holding a hot pan" is more likely
than "I was two minutes late"** — so the accuracy of the mechanism depends on
interaction happening at the worst possible time.

That argues for one large, always-visible "started it" control for the
next-due dish, in addition to the small per-row play buttons. Small targets in a
list are the wrong affordance for this context.

## Implementation sketch

- Schedule item gains `actualStartTime` (seconds from t=0, or `null`).
- Per-dish derived state becomes: `null` → not started (and overdue once
  `elapsed > startTime`); otherwise progress measured from `actualStartTime`
  rather than from the scheduled `startTime`.
- Alert trigger times for a started dish derive from its actual start.
- The global toggle lives in kitchen-ish settings and persists via
  `core/storage.js`. Note that the kitchen-settings storage was deleted with the
  capacity work, so this needs a small new record rather than a revived one.
- Keep the decision logic in `static/js/core/` and pure, as with everything else.

## Also worth remembering

This changes the app from *a plan* into *a plan plus a record of what actually
happened*, which is a better product. But it turns the timer page from one
countdown into N small state machines — real added conceptual weight for the
user, not just for the code.

---

# Part 2 — UI fixes

All three were verified in a browser, not inferred. Measurements below are from
computed styles with `prefers-color-scheme: dark` emulated.

## 2a. Selects are invisible in dark mode — white on white

**This is a real bug affecting every `<select>` in the app**, not only the one in
the "Add your own food" section where it was noticed.

Measured in dark mode:

| Control | `color` | `background-color` |
| --- | --- | --- |
| Food dropdown | `rgb(255,255,255)` | `rgb(255,255,255)` |
| Category dropdown | `rgb(255,255,255)` | `rgb(255,255,255)` |

Contrast ratio 1:1. Light mode is unaffected (black on white).

**Cause, and it is self-inflicted.** The dark-mode work (G19, Phase 2) set
`color-scheme: light dark` on `:root`. That tells the browser to use *dark*
UA defaults for form controls, which makes their default text colour white. But
the `select` rule in `static/css/styles.css` hard-codes `background-color: #fff`
and never sets `color` at all. Light mode only ever looked right by accident —
the UA default happened to be black.

**Fix:** give `select` an explicit `color: var(--color-ink)` and replace the
hard-coded `background-color: #fff` and `border: 1px solid rgba(15, 23, 42, 0.12)`
with custom properties. The dropdown arrow is drawn with two hard-coded
`rgba(15, 23, 42, 0.55)` gradients, which will also be near-invisible on a dark
panel.

While there: the stylesheet has roughly a dozen other hard-coded
`rgba(15, 23, 42, …)` borders and shadows that do not respond to dark mode. Worth
sweeping them into variables in the same pass.

## 2b. The "Add your own food" section looks alien

Same root cause, different symptom: **the stylesheet has never styled `input` at
all.** There is a rule for `select` and `.btn`, and two width-only rules for
`.custom-food-form input`, but no element-level `input` styling anywhere.

So the text and number inputs render as raw browser controls next to carefully
styled selects and buttons. In dark mode they pick up browser defaults —
`rgb(59,59,59)` backgrounds, and the number input computes to `#aaa` on
`#3b3b3b`, which reads as disabled.

**Fix:** add an element-level `input` rule matching the `select` treatment
(padding, radius, border, background, colour, focus ring) so every control in the
app shares one visual language. That fixes the custom-food form, the per-dish time
override, the serve-offset field and the serve-time picker in one go — they are
all currently unstyled.

## 2c. Light/dark mode toggle at the top

A button in the header to switch theme explicitly, rather than only following the
OS.

**Note the structural wrinkle.** Dark mode is currently implemented purely as
`@media (prefers-color-scheme: dark)` remapping the `:root` custom properties. A
manual toggle has to *win in both directions* — force dark on a light OS and
light on a dark OS — which a media query alone cannot do. The usual shape:

- Keep light values on `:root`.
- Move the dark values into a rule that both the media query **and** an explicit
  attribute select, e.g. `:root[data-theme='dark']`, with the attribute given
  higher precedence than the media query so an explicit choice always wins.
- Persist the choice (via `core/storage.js`) and apply it before first paint to
  avoid a flash of the wrong theme.
- Keep `color-scheme` in step with the chosen theme, or the UA form-control
  defaults will contradict it — which is exactly what caused 2a.

Three states are worth considering rather than two: light, dark, and "follow the
system", with follow-the-system as the default so current behaviour is preserved.

---

## Suggested order

2a and 2b first: they are small, share a root cause, and 2a is a genuine
readability bug on a shipped app. 2c next, since doing it after the control
styling is fixed means the toggle can be verified against controls that actually
respond to the theme. Part 1 last — it is a feature with four open decisions and
deserves its own planning pass.
