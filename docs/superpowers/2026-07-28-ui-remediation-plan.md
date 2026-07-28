# UI remediation plan

**Written:** 2026-07-28
**Supersedes:** Part 2 of `2026-07-28-next-session-handoff.md` (2a and 2b are now done; 2c is not)
**Status:** Part 1 below is implemented and verified but **not committed**. Parts 2–4 are not started.

This document is self-contained. A fresh session should be able to work from it plus
`CLAUDE.md` without reading the rest of the conversation it came from.

Read `CLAUDE.md` first for layout, conventions and traps.

---

## State of the working tree

Three files are modified and **uncommitted**:

```
M index.html            main.layout -> main.planner + inner .layout wrapper
M static/css/styles.css form-control theming, .planner, scrollbar-gutter, .alert-popup
M sw.js                 CACHE_VERSION v1 -> v2
?? .impeccable/         critique snapshot + design-hook cache (decide: commit or ignore)
```

`npm test` passes: 126 tests, Biome clean. Nothing is committed, so a commit is the first
decision to make — Part 1 is a coherent unit and could go in as one commit.

---

## Part 0 — Two traps that will cost you an hour each

### The service worker serves you stale files

`sw.js` is cache-first over a pinned `CACHE_VERSION`. After you edit CSS or HTML, a normal
browser session keeps rendering the **old** file. Unregistering mid-session does not help:
the reinstall refills the cache from the browser's HTTP cache, which is also stale, so the
old files come straight back.

Verify in a throwaway Playwright context instead:

```js
async (page) => {
  const ctx = await page.context().browser().newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.emulateMedia({ colorScheme: 'dark' });   // or 'light'
  await p.goto('http://localhost:8765/index.html');
  // ...
  await ctx.close();
}
```

Serve with `python3 -m http.server 8765` from the repo root. It will not work from
`file://` — the pages are ES modules and the catalogue is fetched.

**Independently: bump `CACHE_VERSION` in any change that touches a shell file**, or
returning users keep the old assets. `sw.js` documents the rule; nothing enforces it.

### Driving the pages

- `index.html` opens with one empty row and `#schedule-section` at `display:none`. Select a
  food (`.food-select`, `selectOption({index: 1})`) to reveal the schedule panel.
- `.custom-food` is a collapsed `<details>`: `setAttribute('open','')`.
- To reach a populated timer: pick foods, click `#start-timer-btn`, then the "Start Cooking"
  button. Register `p.on('dialog', d => d.accept())` first — a live session prompts a
  `window.confirm()`.
- Grant clipboard permissions on the context to exercise "Copy running order".
- The unit suite cannot see any of this. CSS and layout defects here are only visible in a
  browser; several in Part 3 were invisible to 126 passing tests.

---

## Part 1 — Done and verified (do not redo)

All four were reproduced in a browser first, then fixed, then re-measured in both colour
schemes on both pages.

### 1a. Every `<select>` and `<input>` was white-on-white in dark mode

**Root cause:** `color-scheme: light dark` on `:root` gives form controls *dark* UA defaults
in dark mode, and that default text colour is white. The `select` rule hard-coded
`background-color: #fff` and never set `color`. Light mode only ever looked right because
the UA default happened to be black. Inputs had **no rule at all** and rendered as raw
browser controls.

**Fixed:** `select` and `input[type=text|number|time]` now share `color: var(--color-ink)`,
`background-color: var(--color-panel-strong)`, `border: 1px solid var(--color-border)`,
padding, radius and focus ring. The dropdown arrow uses a new
`--color-field-mark` derived from `--color-ink`, so it follows the theme with no dark-mode
counterpart. `option`/`optgroup` and `::placeholder` are stated explicitly.

Measured contrast: **1:1 before → 14.85:1 dark / 18.08:1 light.**

`.option-edit-select` (timer page) had the same self-inflicted `#fff` and now inherits the
shared rule. Its light-mode border alpha changed 0.18 → 0.12.

### 1b. A phantom empty column appeared whenever a message showed

**Root cause:** `.layout` is `repeat(auto-fit, minmax(280px, 1fr))`, which generates **three**
tracks at desktop width and relies on the empty one collapsing to `0px`. `#planning-message`
had `grid-column: 1 / -1`, so the moment any message appeared it occupied all three tracks,
collapsing stopped, and both panels shrank while a blank column opened on the right. Not
specific to "Copy running order" — every message did it, including validation errors.

**Fixed:** `index.html` now has `<main class="planner">` holding the message and an inner
`<div class="layout">` holding only the two panels. New `.planner` rule is a single-column
grid with the same gap.

Measured: `500px 500px 0px` before the click, unchanged after; previously
`321px 321px 321px`.

A residual 7px jump turned out to be the vertical scrollbar arriving as the page grew
taller, so `scrollbar-gutter: stable` is now on `:root`. Clicking the button moves nothing.

### 1c. The timer's alert popup was white-on-white in dark mode

`.alert-popup` hard-coded `background: rgba(255,255,255,0.96)` under theme-aware ink, so
"Time to start cooking Cod Fillet!" was invisible in dark mode — the one message a cook
must not miss. Now `var(--color-panel-strong)` (opaque on purpose, it overlays),
`var(--color-border)`, `var(--shadow-card)`. Measured 14.85:1 dark / 18.08:1 light.

### 1d. `CACHE_VERSION` bumped to `cooking-times-v2`

Without this none of the above reaches anyone who has already loaded the site.

### Deliberately left alone

`.alert-popup.food-start` and `.alert-popup.all-done` (`static/css/styles.css:519`, `:523`)
use a 4px amber/green left border. The design hook flags this as a `side-tab` anti-pattern.
It is **load-bearing** — the only channel distinguishing "start a dish now" from
"everything is done" — so removing it deletes the signal. But see Part 3: encoding that
state in *hue alone* is itself a defect, and the fix is a redundant cue, not a thinner
border. No ignore rule was added; that is the user's call.

---

## Part 2 — The agreed plan

Decisions taken with the user on 2026-07-28:

- **Priority:** correctness and accessibility first.
- **Scope:** P0 + P1 only. P2s and minors deferred (Part 3).
- **Layout:** fair game. The generic two-card composition is *not* protected, so the P0 fix
  may reshape it, and it should be built so it does not fight the deferred time-axis work
  in Part 4.
- One explicit carve-out: the `slugify` bug (Part 3, item 1) is a P2 but the user pulled it
  into this pass, because it silently locks non-Latin-script cooks out.

### P0 — `.food-item` overflows its panel; the remove ✕ is unclickable on desktop

`static/css/styles.css:201`

```css
grid-template-columns: minmax(150px, 1fr) minmax(120px, 0.6fr) auto auto auto;
```

Min-content width is a fixed ~611px. The two-column `.layout` gives `.food-selector` a
~500px box. `.container` caps at `max-width: 1120px`, so widening the window never helps;
only the `max-width: 700px` single-column collapse fixes it.

Measured spill past the panel's right edge:

| Viewport | `.food-item` width | Panel width | Spill |
|---|---|---|---|
| 1400 | 611px | 500px | **+152px** |
| 1280 | 611px | 504px | **+146px** |
| 980 | 611px | 439px | **+202px** |
| 800 | 611px | 357px | **+279px** |
| 480 | 375px | 425px | contained |

No page scrollbar ever appears to hint at it — the row lands *on top of* the sibling panel
rather than extending the document. Three independent methods confirm the ✕ is dead at
1400/1280/980/800: `elementFromPoint` at its centre returns `.schedule-item` or its
`<strong>`; a real Playwright `click()` times out after 3000ms; the row count never changes.
It works only at 480px, where the row wraps.

It remains **tab-focusable**, so a keyboard user reaches and can fire a button they cannot
see, deleting a dish with no visible confirmation.

**Why it matters:** the only delete on the page is gone. A cook who picks the wrong dish
must resize the window or clear `localStorage`.

**Fix:** two-row fluid grid, e.g.

```css
grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) auto;
grid-template-areas:
    "food option remove"
    "time serve  remove";
```

with `min-width: 0` on the selects so they can actually shrink, and `min-width: 0` on
`.panel` so this class of bug cannot silently paint outside a card again. This also fixes
the mid-word label truncation ("Cooked t", "Just coo") and the detector's `text-occlusion`
finding on `span.serve-offset-unit`.

While here, and now in scope: `align-items: start` is set on `.layout--timer`
(`static/css/styles.css:155`) but not `.layout`, which is why ~400px of dead space sits at
the bottom of `.food-selector` in every multi-dish state.

**Command:** `/impeccable adapt`

### P1a — `.visually-hidden` has no CSS rule, so screen-reader text renders on screen

Verified: the class is used **3 times in `timer.html` and has zero rules in the stylesheet**.
The span at `timer.html:50` is fully rendered — `position: static`, `clip: auto`. The
countdown therefore reads "**10:00** 10:00 remaining" and "**0:00** 0:00 elapsed", and the
`aria-live` region at `timer.html:18` will paint its announcements at the top of the page.

Compounding it, `.time-elapsed` (`static/css/styles.css:801`) sets
`color: var(--color-muted)`, overriding `.countdown`'s white, so "ELAPSED" and its value sit
grey-on-amber at 1.4–2.7:1 depending on the `alert-flash` phase.

**Why it matters:** this is where the planning page's primary CTA lands, at the moment of
maximum stakes, and it reads as a broken build.

**Fix:** add the standard clip-rect utility; scope the muted colour so it cannot leak onto
the gradient panel.

**Command:** `/impeccable harden`

### P1b — Hardcoded accent colours never remap in dark mode; focus ring fails non-text contrast

The dark block (`static/css/styles.css`, `@media (prefers-color-scheme: dark)`) re-declares
only custom properties, so five literal hexes never change. Measured against real painted
pixels:

| Selector | Line | Colour | Dark | Light | Need |
|---|---|---|---|---|---|
| `.total-time` | 258 | `#9d2e1a` | **2.00:1** | pass | 4.5 |
| `.total-time-display strong` | 695 | `#9d2e1a` | **2.36:1** | 6.79 | 4.5 |
| `.chip-live` | 133 | `#1b6b46` | **2.02:1** | 4.75 | 4.5 |
| `.cooking-time` | 601 | `#b86010` | **3.11:1** | **4.08:1** | 4.5 |
| `.done-label` | 606 | `#1c7a51` | not measured | — | 4.5 |
| `.completed-message` | 497 | `#13643f` | not measured | — | 4.5 |

`.total-time` is the most important number on the planning panel and the least legible thing
on the page. `.chip-live` is the timer's *status* indicator. `.cooking-time` fails in **light
mode too**, so it is not purely a theming bug. `.done-label` and `.completed-message` are
only rendered in states not reached during measurement — check them.

Also:

- Focus ring `outline: 3px solid rgba(255, 107, 74, 0.35)` (`static/css/styles.css:335`)
  composites to **1.44:1 on white panels / 1.79:1 on dark** — below WCAG 2.2 SC 1.4.11's 3:1
  for non-text contrast.
- `:focus-visible` list omits `summary`, so `.custom-food > summary` is the only control on
  the page using the UA ring (`1px auto rgb(168,199,250)`).
- Tab stop 11 on `index.html` (`input#serve-at`, whose `type="time"` internal segments
  consume 4 consecutive stops) resolves `outline-style: none` — reachable with no visible
  indicator.
- White-on-accent button labels: `#add-food-btn` 2.8:1 on `#ff6b4a`, `#custom-food-add`
  2.6:1 on `#2bb673`, `#start-timer-btn` 2.6:1, timer's Pause 2.0:1 on `#f4a933`, Reset
  3.9:1 on `#e5484d`. All 16–18px/600, so 4.5:1 applies.
- `.btn-secondary` (line 397) hardcodes `#1f2937` in both themes, so Copy / Print / Back to
  Planning read as disabled in dark mode. `.chip` (line 121) hardcodes
  `rgba(15,23,42,0.06)` and loses its shape entirely in dark mode.

These are exactly the instances the Part 1a fix did not reach.

**Command:** `/impeccable audit`

### P1c — The two numeric fields have no visible label

`.time-override-input` and `.serve-offset-input` carry `aria-label` only
(`static/js/planning.js:157`, `:188-191`) — no `<label>`, no `title`, no column header, and
both are suffixed with an identical `min` span. A row reads
`[Chicken][Cooked t][25] min [0] min [✕]`. Nothing on the page says the second number is a
serve offset, that negative means earlier, or that the first overrides a built-in estimate.
At 480px they stack as indistinguishable twins.

**Fix:** a persistent header row above `#food-list` — `Dish · How you want it · Cook time ·
Serve` — and change the offset unit from `min` to a signed hint such as `min vs. meal` with
placeholder `±0`. One `<details>` sentence beneath the list explaining both fields also
closes the worst of the help gap (heuristic 10 scored 1/4).

**Command:** `/impeccable clarify`

### P1d — Clock times are computed and then withheld from screen and printout

`displaySchedule` always renders `formatTime(item.startTime)` (`static/js/planning.js:351`).
The `serve-at` change listener calls `updateSchedule()`, which re-renders **byte-identical**
relative text — setting a serve time changes nothing on screen. `clockTimes()` exists at
`static/js/core/runsheet.js:39` and is reached **only** by `runsheetText()`, i.e. only by
"Copy running order".

The `@media print` block hides `.runsheet-actions` and prints `#schedule-output`, so the
printed sheet reads "Start at: 0:00 / Start at: 15:00" and the serve time the cook just
typed is silently discarded. A printed sheet has no date, no serve time and no clock.

Separately, `formatTime` (`static/js/core/format.js`) is `M:SS` with no hours component, so
a 75-minute plan reads "75:00" and "the meal is at 10:00" is indistinguishable from ten
o'clock.

**Why it matters:** the app's answer to the only question that matters — *what time do I put
the chicken on?* — is computed and then hidden.

**Fix:** when `serveAtMinutes()` is non-null, render clock times as the primary line in
`.schedule-item` with the relative offset secondary; route Print through `runsheetText()`
(or a print-only DOM built from it) so Copy and Print emit the same artifact; teach
`formatTime` an hours component. `format.js` is in the pure core, so this is unit-testable —
add cases for ≥60 minutes.

**Command:** `/impeccable clarify`

### P1e (carve-out) — `slugify` manufactures a false error for non-Latin names

`slugify` (`static/js/planning.js:378`) strips everything outside `[a-z0-9]`, so every
non-Latin-script or emoji-only name collapses to the empty string and the id becomes
`custom-`. Verified:

```
"🍜"   -> "custom-"     "寿司"  -> "custom-"
"🍕🍕" -> "custom-"     "Борщ"  -> "custom-"
```

Adding a **second** such food hits the `findFood` duplicate check and returns *"You already
have a food called 🍜"* — a food never added. A Japanese, Chinese, Korean, Arabic, Cyrillic
or Greek-script cook can add exactly one custom food, ever, and is then told it already
exists.

**Fix:** fall back to a stable unique suffix when the slug is empty (a counter or a hash of
the name), and make the duplicate check compare display names rather than derived slugs.
Add unit tests — this is pure logic.

---

## Part 3 — Discovered, deferred by scope

### P2

1. **Range limits are decorative.** `max="600"` (`static/js/planning.js:155`) and
   `min="-120"/max="120"` (`:183-185`) are never enforced — no form, no `checkValidity()`.
   Entering `9999` produces "Cook for: 9999 minutes", "Off the heat at 9999:00",
   "Total Time: 10009 minutes", with **no message at all**.
2. **Invalid input reverts to the wrong value.** Entering `0` shows "Cooking time must be at
   least one minute." while the field snaps back to the *previous override* — so the message
   and the field disagree on screen.
3. **Custom foods are permanent.** Nothing ever removes from `CUSTOM_FOODS_KEY`. No delete,
   no edit. One typo pollutes the picker forever.
4. **Touch targets below 44×44.** `.btn-icon` is 38.4 × 38.4 at 480px — and it is the
   *destructive* control, with no confirmation and no undo. The timer's alert **Dismiss is
   32.4px tall**, the button you tap mid-cook with wet hands. `.time-override-reset` (⟲) is
   `padding: 0.2rem` on a 1.1rem glyph.
5. **Alert state is encoded in hue alone.** See Part 1's "deliberately left alone". The 4px
   amber/green border is the only difference between "start a dish" and "all done" — no icon,
   no text label, no shape change. Add a redundant cue.
6. **No message ever self-clears or can be dismissed** on the planning page, though the
   timer's identical `.inline-message` component has a Dismiss button (`timer.html:41`).
   `#planning-message` is `role="status"`, so a stale — sometimes factually false — status
   persists in the accessibility tree indefinitely.

### Minors

- **Layout jump on first selection:** `.food-selector` goes ~1036px → ~500px the instant a
  food is picked, because `#schedule-section` un-hides and `auto-fit` gains a second track.
  The panel you are editing halves while you look at it.
- **`text-transform: capitalize`** on `.schedule-item strong` title-cases option labels and
  user-typed names, so the screen reads "Cooked Through" while the runsheet reads "Cooked
  through", and a long name becomes "Beef Shin **With** Star Anise **And** Orange Peel".
- **`.food-timer-item.resting` has no CSS rule** though `timer.html:109` sets it. Every
  other state (cooking/done/waiting/editing) is styled.
- **Three product names:** H1 "Coordinated Cooking", both `<title>`s "Cooking Timer — …",
  timer H1 "Cooking Timer". Also "Total Time: 35 minutes" (planning) vs "Total Cooking Time:
  35:00" (timer).
- **No loading state** while `foods.json` fetches; `#food-list` is briefly empty and every
  `.food-select` would be empty on a slow connection.
- **`window.confirm()`** at `static/js/planning.js:504` is the app's only destructive-action
  guard, and it hands the most consequential decision to an unstylable browser dialog —
  after G8 deliberately removed `alert()` everywhere else.
- **No skip link**; neither `<section>` has `aria-labelledby`, so the only landmarks are
  `banner`, `main`, `status`. Row fields use `aria-label` rather than `<label for>`, so
  there is no clickable label target.
- **The print stylesheet keeps** the marketing subtitle and card shadows.
- **The timer opens contradicting itself:** the chip reads "Ready to start cooking" while any
  dish with `startTime === 0` already satisfies `isCooking` at `elapsedSeconds === 0` and
  renders amber, pulsing, with "Done in: …".

### Confirmed working (don't "fix" these)

Duplicate dishes at different options both schedule correctly, keyed on `itemId`. Refresh
mid-flow restores rows *and* the rendered schedule. No horizontal page scroll at 480 or
320px on either page. The clipboard runsheet output is correct, including `mealTime`
anchoring and indented heat-off lines.

---

## Part 4 — The design verdict, and the one big deferred idea

Design health scored **19/40** (Nielsen's 10, Operate mode, all applicable). Rating band
"Poor", but the shape matters more than the number: the domain model is genuinely good and
the failures are concentrated, not diffuse. Weakest heuristics: user control and freedom
(1/4, the P0), help and documentation (1/4, effectively none). Strongest: flexibility and
efficiency (3/4).

**Specificity verdict: the logic is this product's; the page is a template.** The two-phase
dish model, the per-food option axis, signed serve offsets and the `mealTime` anchoring are
all authored and specific. The composition is not: two translucent cards in an auto-fit
grid, slogan chip top-right, form left and output right. Swap the strings and it is an
invoicing tool.

The decisive gap, and the deferred work the user has now unblocked:

> **This product exists to place dishes against a clock, and there is no representation of
> time anywhere in the visuals.** A four-dish plan with 25/20/8/10-minute cooks and
> staggered starts renders as four identically sized rectangles of `label: value` prose
> (`static/js/planning.js:346-365`). No bar, no rail, no relative width, no "you are here".
> The `::before` gradient stripe on `.schedule-item` is the only gesture toward a timeline
> and it is the same 3px on every item regardless of duration.

The proposal: render each schedule item as a **proportional bar on a shared time axis** —
length = `cookDuration`, a hatched tail for `restSeconds`, every bar aligned to one "meal"
line. That would resolve, in one change, the missing hierarchy (nothing currently says which
dish to touch first — all items have identical visual weight), probably the
"(15 min after previous)" string, and the trust problem at the moment of committing real
food. The **P0 grid fix should be built so it does not fight this.**

Adjacent, cheaper, and worth considering with it: the schedule already knows every dish's
`[startTime, heatOffTime)` window, so the planning page could honestly say "3 dishes are on
the heat at 22:00" without becoming the hob allocator that G13/G14 deliberately excludes.

---

## Where the evidence lives

- Full critique with heuristic table, persona walkthroughs and detector output:
  `.impeccable/critique/2026-07-28T09-29-43Z__index-html.md`
- The reverse-engineered spec and 26-gap register:
  `docs/superpowers/specs/2026-07-25-cooking-times-design.md`
- The earlier handoff, whose Part 1 (manual dish timers) and item 2c (an explicit
  light/dark toggle) are still open and untouched by this plan:
  `docs/superpowers/2026-07-28-next-session-handoff.md`

Detector note: the CLI scan (`detect.mjs index.html timer.html`) reports **0 findings, exit
0**, and that is uninformative rather than reassuring — the discriminating classes are
applied at runtime by Alpine (`timer.html:93`), so the static engine has nothing to match.
The in-page detector found 6 anti-patterns per page. Of those, `nested-cards` (rows inside a
panel) and `gpt-thin-border-wide-shadow` (this project's own `--shadow-soft`) are false
positives.
