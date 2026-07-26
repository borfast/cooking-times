# Cooking Times — Reverse-Engineered Specification

**Date:** 2026-07-25
**Status:** Descriptive. Reverse-engineered from the code at commit `0c35e7a`, not from any original design document.
**Purpose:** A baseline for evolving the application. Sections 1–3 describe what exists. Section 4 records what is wrong with it.

Where this document says "the app does X", X was read out of the source. Where it says something *should* or *could* be different, that judgement lives in Section 4 and nowhere else.

---

## 1. Purpose and product model

### 1.1 The job

Cooking a meal of several dishes means starting each one at a different time so that they are all ready at the same moment. Doing that arithmetic in your head, while cooking, is error-prone. This app does the arithmetic and then nags you when it is time to start the next thing.

### 1.2 Domain objects

**Food** — an entry in a fixed catalogue of 30 items (`static/foods.json`). Each has:

| Field | Meaning |
| --- | --- |
| `id` | Stable slug, e.g. `beef-steak` |
| `name` | Display name |
| `category` | One of `Meat`, `Fish`, `Vegetables`, `Grains`, `Other` — used only to group the picker |
| `options` | One or more `{ id, label, seconds }` entries — the axis that is honest for *this* food |
| `defaultOptionId` | Which option is preselected |

*As of Phase 3.* The bundled catalogue holds 30 foods, and users may add their own, stored locally and merged at load. Times may be corrected per dish and the correction is remembered per food-and-option.

**Cooking option** — a named way to cook a particular food. The axis differs by food, which is the whole point: a steak offers Rare / Medium / Well done, rice offers only Cooked, pasta offers Al dente / Soft, and chicken offers only Cooked through, because rare chicken is not a choice. Option counts of one, two and three all occur.

**Selection** — one row on the menu: a food, a chosen option, and a resolved `cookingTime`. Carries an `itemId` that is unique to the row, so two portions of the same food at different options are a legitimate meal.

**Schedule** — the computed plan. A list of items, each carrying `itemId`, `foodId`, `foodName`, `optionLabel`, `startTime`, `duration`, `finishTime`, plus a `totalTime` for the meal. All times are seconds measured from the moment cooking begins (t=0), never wall-clock. Identity is always `itemId`, never `foodId`.

**Session** — a running or paused timer: a schedule, a status, a start timestamp, and the set of alerts with their fired/not-fired state.

### 1.3 The scheduling rule

The whole product rests on three lines of arithmetic:

```
totalTime          = max(cookingTime) over all selections
item.finishTime    = totalTime                       // for every item
item.startTime     = totalTime - item.cookingTime
```

Items are then sorted by `startTime` ascending, which yields the order you put things on.

Consequences, all intentional as far as the code reveals:

- **Everything finishes simultaneously.** There is no notion of one dish resting while another cooks, or of serving courses in sequence.
- **The longest dish sets the clock** and starts at t=0.
- **Cooking is assumed infinitely parallel.** Six items can all be "cooking" at once with no constraint on hobs, oven space, or pans.
- **Transitions are free.** Two items scheduled 0 seconds apart are assumed to be startable at the same instant.

*As of Phase 4 the last three no longer hold unconditionally.* A dish has two phases — `startTime → heatOffTime` on the heat, then `restSeconds` off it, ready at `finishTime` — so `totalTime = max(cookDuration + restSeconds)`. Capacity and changeover time are declared per kitchen, and the synchronised finish is now conditional: when the kitchen cannot support it, the chosen strategy either reports the conflict, moves dishes earlier so they keep warm, or moves them later so the meal is ready later. Only the time on the heat counts against capacity.

*As of Phase 1* this function lives once, in `static/js/core/schedule.js`, with unit tests.

---

## 2. Behaviour

The app is two screens. They share nothing at runtime except `localStorage` and a stylesheet.

### 2.1 Planning screen (`index.html`)

**Building the meal.** The screen opens with a single empty row. Each row is a food dropdown, a doneness dropdown (defaulting to Medium), and a remove button. "+ Add Food" appends another row. The food dropdown groups options into `<optgroup>`s by category, categories sorted alphabetically and foods sorted alphabetically within each.

**Live schedule.** Any change to any dropdown, and any row removal, recomputes and redraws the whole schedule. Rows with no food selected are skipped. When no row has a food selected, the schedule panel is hidden entirely — which also hides the "Start Timer" button, so a meal cannot be started empty.

**Schedule display.** For each item, in start order: name and doneness, the start offset formatted `M:SS`, a "(N min after previous)" note for every item but the first, and the cook duration in whole minutes. A total follows in whole minutes.

**Restoring selections.** On load, the page reads `cooking-schedule` from `localStorage` and rebuilds one row per saved selection, restoring both food and doneness. If nothing is stored, or the stored value will not parse, it falls back to a single empty row.

That key is only ever written when "Start Timer" is pressed. Editing the meal and reloading without starting loses the edits.

**Starting.** "Start Timer" writes the selections to `cooking-schedule` and navigates to `timer.html`. It does not start any clock — the timer screen opens in a not-yet-started state.

### 2.2 Timer screen (`timer.html`)

**Session status.** A four-state machine:

| State | Entered by | Shows |
| --- | --- | --- |
| `created` | Loading a fresh plan; `reset()` | "Start Cooking" |
| `running` | `start()`, `resume()` | "Pause", "Reset" |
| `paused` | `pause()` | "Resume", "Reset" |
| `completed` | Elapsed reaching `totalTime` | "All Done! Enjoy your meal!", "Reset" |

Each transition is guarded against being called from the wrong state. A "Back to Planning" link is always present.

**Elapsed time is derived, not accumulated.** On `start()` the app records a wall-clock timestamp and thereafter computes `elapsed = floor((now - startedAt) / 1000)` on every tick. `pause()` stores the elapsed value; `resume()` rewinds `startedAt` by that amount rather than resuming a counter.

This is the single most important implementation decision in the app, and it is the right one: the clock stays accurate across tab backgrounding, throttling, and full page reloads, none of which a tick-accumulating timer would survive.

The tick loop itself is `requestAnimationFrame`, so it runs at display refresh rate (~60 Hz) and pauses when the tab is hidden — harmless, because the next visible frame recomputes elapsed from wall-clock.

**Per-food lifecycle.** Every item is in exactly one of three states, derived from elapsed time on each frame:

- *waiting* — `elapsed < startTime`; shows "Starts in: M:SS"
- *cooking* — `startTime ≤ elapsed < finishTime`; shows "Done in: M:SS"
- *done* — `elapsed ≥ finishTime`; shows "Done!"

Each state has its own row styling.

**Alerts.** One alert per food, firing at that food's `startTime`, plus one finale at `totalTime`. An alert fires when `elapsed ≥ triggerTime` and it has not fired before. Firing does four things:

1. Sets the on-screen popup (message plus a Dismiss button)
2. Flashes the countdown display
3. Plays an 800 Hz sine beep at 0.3 gain for 300 ms via the Web Audio API, each beep on a freshly constructed `AudioContext`
4. Raises a Web Notification tagged `cooking-timer` with `requireInteraction: true`, if permission has been granted

The popup auto-dismisses after 10 seconds unless replaced sooner. Notification permission is requested on page load, not on user action.

**Editing mid-cook.** Permitted while `running` or `paused`; never while `created` or `completed`. Three operations:

- *Change doneness* — only on a waiting food. Attempting it on a cooking or done food raises a blocking `alert()` and changes nothing.
- *Add a food* — pick from the full catalogue plus a doneness. Rejected with a blocking `alert()` if that food is already in the schedule.
- *Remove a food* — only a waiting food. Removing the last remaining food is rejected and the food is put back.

**Recalculation after an edit.** This is the subtlest logic in the codebase. Foods already started are treated as immovable; everything else is re-planned around them:

```
started    = items where elapsed >= startTime
notStarted = the rest

requiredFinish = max(finishTime) over started
if notStarted is non-empty:
    requiredFinish = max(requiredFinish, elapsed + max(cookingTime) over notStarted)

started items:    startTime and finishTime unchanged
notStarted items: finishTime = requiredFinish
                  startTime  = max(requiredFinish - cookingTime, elapsed)

totalTime = requiredFinish
```

Two behaviours fall out of this that are worth stating explicitly, because they are not obvious and they qualify the product's core promise:

- **Adding a slow dish mid-cook extends the meal.** `requiredFinish` moves later, so dishes already cooking now finish *before* the meal does and sit waiting. The "everything lands together" guarantee holds only for a plan that is never edited after cooking starts.
- **Removing or shortening dishes never pulls the finish earlier** if a started dish is still the longest pole — `requiredFinish` is floored by the started items' original finish times.

Alerts are regenerated after every recalculation. An alert that has already fired stays fired, matched to its replacement by food name.

**Session persistence.** The whole session — schedule, status, `startedAt`, paused elapsed, alerts with their fired state, and the selection list — is written to `localStorage` under `cooking-timer-session` on every state transition, on every alert, on every edit, and on a timer intended to fire every five seconds while running (see G2 for what it does instead).

On load the timer screen prefers a stored session over a stored plan. If a session exists it is restored, including resuming the tick loop if the status was `running`. Only if there is no session does it fall back to reading `cooking-schedule`. `reset()` deletes the session key.

If neither key holds a usable plan, the screen raises a blocking `alert()` and leaves you on an empty timer showing 0:00.

---

## 3. Implementation as built

### 3.1 Shape

A static site with no build step, no backend, no package manager, and no tests. Opening `index.html` from a file server is the whole deployment. Total source is almost exactly 2,000 lines across six files.

```
index.html              planning screen
timer.html              timer screen
static/foods.json       the 30-item catalogue
static/js/schedule.js   planning logic — vanilla DOM
static/js/timer.js      timer logic — Alpine component
static/css/styles.css   both screens
```

The two screens use different front-end techniques. The planning screen builds DOM imperatively with `document.createElement` and rebuilds the schedule by assigning `innerHTML`. The timer screen is a single Alpine.js component (`timerApp()`) with declarative `x-for` / `x-if` / `x-text` bindings. Alpine 3.13.3 is loaded from unpkg by `<script defer>`; the planning screen does not load it.

The catalogue is fetched with `fetch('static/foods.json')` by both screens independently.

*As of Phase 5* nothing loads from a third party: Alpine and both font families live in `static/vendor/`, a root `sw.js` precaches the app shell, and `manifest.webmanifest` plus locally generated icons make the app installable. There is still no build step — vendoring is checked-in files, not tooling.

### 3.2 Storage contract

Two keys, written by different screens, with overlapping content:

| Key | Written by | Read by | Contents |
| --- | --- | --- | --- |
| `cooking-schedule` | Planning, on "Start Timer" | Planning on load; timer on load when no session exists | `{ items, selectedFoods }` |
| `cooking-timer-session` | Timer, continuously | Timer on load | `{ schedule, status, startedAt, pausedElapsed, alerts, selectedFoods }` |

The `items` array inside `cooking-schedule` is written with every `startTime` set to `0` and is never read by anything. The timer recomputes the schedule from `selectedFoods`.

### 3.3 Styling

A single stylesheet with CSS custom properties for colour, typography, radii, and shadows. Display face Fraunces, body face Manrope, *vendored locally as of Phase 5* and imported from `static/vendor/fonts.css` (latin and latin-ext subsets only, stored by content hash because both are variable fonts served identically for every weight). Layered radial-gradient page background. Responsive at three breakpoints (980px promotes the planning screen to two columns; 900px and 700px collapse layout and controls). `prefers-reduced-motion: reduce` is honoured.

The stylesheet is essentially complete against the markup: of the classes the two HTML files reference, only `app-header--timer` and `time-elapsed` have no rule. Both are inert — the timer header consequently renders identically to the planning header, and the elapsed-time block relies on its already-styled children — so they are unfinished hooks rather than visible breakage.

### 3.4 Vestiges of the previous architecture

The app was a Go backend serving these pages until commit `e7b13f0` ("Refactor to static-only application"), which is the initial commit of the current history — the Go code is not in this repository. Traces remain:

- `CLAUDE.md` states the stack as "Go 1.25+ (backend)" and documents a `src/` and `tests/` layout. Neither directory exists.
- `.gitignore` is Go-oriented: `server`, `vendor/`, `*.exe`, `*.so`.
- Comments read "Load foods from API" and "Calculate schedule (same algorithm as backend)".
- Both JS files carry task markers (`T029-T031`, `T043-T050`, `T059-T062`) from a spec-driven workflow whose spec files are not in the repository or its history.

---

## 4. Gaps register

Numbered for triage, grouped by kind. Each entry states the cost, not the fix.

### Defects

**G1 — A new plan is silently ignored while a session exists.**
The timer screen prefers `cooking-timer-session` over `cooking-schedule`, and the planning screen's "Start Timer" does not clear the session. Repro: cook a meal to completion, go back to planning, choose different foods, press Start Timer — you are shown the previous, finished schedule. The only escape is pressing Reset, which is not signposted as the thing that makes replanning work. This is the most user-visible bug in the app. *Closed in Phase 2: Start Timer clears the session, confirming first when a cook is in progress (D5).*

**G2 — Roughly 60 `localStorage` writes per second, one second in every five.**
`updateTimer` runs per animation frame and saves when `elapsedSeconds % 5 === 0`. Because `elapsedSeconds` is integer seconds, that condition is true for every frame of that whole second. Each write serialises the entire session. The intent was clearly one save every five seconds. *Closed in Phase 2: measured 5 writes in 11 seconds, against 120+ before.*

**G3 — Duplicate foods are accepted when planning and assumed impossible when timing.**
The planning screen has no duplicate check; the timer screen's "add food" does. A meal containing two entries of the same food therefore reaches a timer that identifies items by `foodId`: `changeDoneness` and `removeFood` both act on the first match only, alert regeneration matches on `foodName`, and Alpine's `x-for` is keyed on `foodId`, so the duplicate keys will misrender. Either duplicates should be rejected at planning time or items need their own identity. *Fully closed in Phase 3: every row carries its own `itemId`, so duplicates are allowed again — two steaks at different doneness is a supported meal. Phase 2's rejection was a stopgap and has been removed. This also fixed a latent bug the register missed: alert regeneration matched on `foodName`, so firing one steak's alert silenced the other's.*

**G4 — Reset is inconsistent with reload.**
`reset()` clears the stored session but keeps the in-memory schedule, so Reset-then-Start replays the schedule *including* any mid-cook edits. Reloading the page after Reset falls back to `cooking-schedule` and replays the *original* plan. Two paths that both read as "start over" give different meals. *Closed in Phase 2: Reset reloads the saved plan, so both paths agree.*

**G5 — Restoring a long-finished session fires every outstanding alert in one frame.**
Close the tab mid-cook, reopen after the meal would have finished, and the first tick fires every un-fired alert at once. Each constructs its own `AudioContext`; browsers cap concurrent contexts around six, so the rest throw and are swallowed by a `catch`. The notifications collapse into one because they share a tag, and the popup shows only the last message. What should be "you missed these four steps" is a burst of noise and one arbitrary message. *Closed in Phase 2: the backlog is marked fired and summarised as "While you were away: ...". Measured 1 AudioContext for a three-alert backlog.*

**G6 — Notification icon does not exist.** `showNotification` references `static/images/timer-icon.png`. There is no `static/images/` directory. *Closed in Phase 2: the reference is gone. Real icons arrive with the Phase 5 PWA work.*

**G7 — Planning selections persist only via Start Timer.** There is no save on change, so building a six-item meal and reloading the page loses it. The restore path exists and works, which makes the gap look like an oversight rather than a decision. *Closed in Phase 2: every change is persisted.*

**G8 — All error messaging uses blocking `alert()`.** Seven call sites. On a phone propped against a kitchen wall this is a modal you must dismiss before the timer is legible again. Two of them ("no cooking schedule found") leave you on a dead screen with no route forward but the browser back button. *Closed in Phase 2: all seven call sites replaced with an inline `role="status"` region.*

**G9 — Notification permission is requested on page load.** Browsers increasingly penalise or auto-deny permission prompts not tied to a user gesture. "Start Cooking" is the obvious gesture to attach it to. *Closed in Phase 2: requested from start().*

**G10 — The UI recomputes at 60 Hz for values that change once per second.** Every visible countdown re-evaluates `formatTime` per item per frame. Harmless on a laptop; it is battery drain on the phone that is actually going to run this. *Closed in Phase 2: the tick bails unless the whole second changed. Measured 3 ticks in 3 seconds.*

**G11 — The scheduling rule was duplicated across both JS files, and one copy of the formatter was dead.**
`calculateSchedule` existed in both `schedule.js` and `timer.js`. The copies were logically equivalent but *not* textually identical: the planning copy guarded with `foods.length === 0` and threw on `null`, the timer copy guarded with `!foods || foods.length === 0`. `formatTime` also existed in both, but the planning page's copy was never called from anywhere — `displaySchedule` formatted inline instead. The scheduling rule is the one piece of logic where divergence would be silent and wrong. *Closed in Phase 1: both live in `static/js/core/`, the null-safe guard won, and the dead copy is gone.*

**G12 — Minor:** `removeFood`'s last-food guard re-adds the food using `scheduleItem.doneness`, having already null-checked `scheduleItem` earlier in the function; if it were ever null the guard path throws. And `recalculateSchedulePreservingProgress` writes a fresh `duration` onto started items while leaving their `startTime`/`finishTime` alone, so `finishTime - startTime ≠ duration` would be reachable if the doneness guard were ever relaxed. *Both halves closed as of Phase 2: the duration is derived from the timings in force, and removeFood restores the actual selection.*

### Design limits

**G13 — Unlimited simultaneous cooking capacity.**
The scheduler will happily tell you to have six things cooking at once. Real kitchens have four hobs, one oven at one temperature, and a finite number of pans. This is the single largest gap between the schedule the app produces and a schedule you can actually execute, and closing it means modelling resources — which is a substantially different product, not a patch. *Closed in Phase 4, with a correction: the original decision (D2) was to resolve conflicts by pushing the finish later, which does not work. When every dish is ready at a common time T, dish i is on the heat over [T − rest − cook, T − rest]; raising T translates every interval right by the same amount, so the overlap pattern is invariant. Overlap is a property of the durations alone, and any resolution must break the synchronised finish. The app therefore declares capacity and offers three responses: `warn` (default — report and change nothing), `stagger` (move dishes earlier so they finish early and keep warm; the food waits), and `extend` (move them later so the meal is ready later; you wait). The placers are documented greedy heuristics: `stagger` is best-effort because nothing can start before t=0 and it can never beat the ring-time a fixed total allows, whereas `extend` always has room later and always resolves. Unresolvable residue is reported, not hidden.*

**G14 — Zero prep and transition time.** Items scheduled two seconds apart are assumed startable two seconds apart. In practice each start costs you draining, seasoning, or finding the lid. *Closed in Phase 4: a changeover time is declared per kitchen, starts closer together than it are reported as conflicts, and both non-warn strategies space starts by at least that much where they have room.*

**G15 — No screen wake lock.** A kitchen timer's device will sleep. The Screen Wake Lock API exists for precisely this. Without it the alarm still fires — audio and notifications survive — but the at-a-glance display, which is the reason to use this over a phone timer, does not. *Closed in Phase 5: a screen lock is held while cooking, released on pause, complete and reset, and retaken on `visibilitychange` because browsers drop it whenever the page is hidden. Browser testing exposed a race the unit tests had missed — a release landing while a request was in flight was overwritten when the request resolved, leaving the screen awake indefinitely — now guarded and pinned by a regression test.*

**G16 — The app does not work offline.** Alpine loads from unpkg and the fonts load from Google Fonts, both blocking. A kitchen on flaky wifi gets an unstyled or non-functional timer. There is no service worker, no manifest, no favicon; it cannot be installed to a home screen. For a device-in-the-kitchen use case this matters more than it would for most apps. *Closed in Phase 5: Alpine and both font families are vendored into `static/vendor/`, a service worker precaches a 24-entry app shell, and there is a manifest with locally generated icons. Verified with the server stopped: both pages load styled, the catalogue loads from cache, and a schedule can be built and exported with no network at all.*

**G17 — Alpine is loaded from a CDN without Subresource Integrity.** The version is pinned, which is good; the content is not verified, which means unpkg is in the trust boundary of the page. *Closed in Phase 5 by removing the CDN rather than by adding SRI: Alpine is vendored locally, so no third-party origin remains in either page and there is nothing for a CDN compromise to reach.*

**G18 — Accessibility gaps.** The alert popup has no `role="alert"` or live region, so a screen reader is never told it is time to start the potatoes — which is the entire point of the app. Neither screen's selects have `<label>`s. The timer's remove button conveys its purpose through `title` alone, where the planning screen's equivalent correctly uses `aria-label`. The countdown updates 60 times a second in the accessibility tree. *Closed in Phase 5: the alert popup is a `role="alert"` assertive live region that stays in the DOM so its changing text is announced, with a separate polite `aria-atomic` region for pause, resume and completion. The two ticking values are `aria-hidden` with non-ticking readable equivalents alongside, so the time is available on demand without the tree churning. An audit of both pages now reports zero unnamed form controls and zero unnamed icon-only buttons. (The 60 Hz churn itself was already fixed in Phase 2 by G10.)*

**G19 — No dark mode.** `color-scheme: light` is declared and no `prefers-color-scheme` rules exist. *Closed in Phase 2: dark mode via prefers-color-scheme, overriding the custom properties only.*

**G20 — No tests, no linting, no CI.** For 2,000 lines this is defensible; for the scheduling and recalculation logic specifically it is not. `recalculateSchedulePreservingProgress` has at least six meaningful cases and none of them are pinned. *Partly closed in Phase 1: `npm test` runs 24 unit tests over the scheduling core with zero installed dependencies, covering all six mid-cook cases plus the duration invariant. Linting and CI remain open.*

### Product critique

**G21 — "Doneness" is the wrong abstraction, applied universally.**
Rare, medium and well-done are steak vocabulary. The app offers them for rice, quinoa, couscous, kale and tofu, where "rare rice" is not a thing anyone has asked for. What the field actually encodes is *how long you want it cooked* — a duration preference wearing a doneness costume. Either the axis should be renamed to something food-neutral (firm / standard / soft, say) or it should vary per food, with steaks getting doneness and grains getting nothing at all. *Closed in Phase 3: the axis varies per food. Chicken has one option, "Cooked through".*

**G22 — Every food gets exactly three options, whether or not the axis means anything.**
The data model forces three tiers on all 30 items. Some foods have one sensible cooking time. Some have more than three. The schema cannot express either. *Closed in Phase 3: option counts of one, two and three all occur across the 30 bundled foods.*

**G23 — Cooking time ignores everything that actually determines cooking time.**
No quantity, no thickness, no cooking method, no starting temperature. One potato and two kilos of potatoes get 1200 seconds. A steak's cook time depends far more on thickness than on the doneness the app does model. *Partly closed in Phase 3: the app still has no model of quantity, thickness or method — modelling them improperly would mean inventing coefficients and presenting fiction as arithmetic. Instead it stops pretending its numbers are authoritative: any dish's time can be corrected, and the correction is remembered per food-and-option. The underlying gap stands.*

**G24 — The catalogue is closed.**
Thirty foods, no way to add a thirty-first, no way to correct a time you disagree with, no way to save "my roast chicken takes 90 minutes not 35". Any real user hits this on their first meal. Because the app is fully static and already uses `localStorage`, user-defined foods would be cheap to add. *Closed in Phase 3: users can add their own foods, and can correct any bundled time.*

**G25 — Simultaneous finish is assumed, not chosen.**
There is no way to say "the steak should rest for five minutes", "serve the soup first", or "keep the potatoes warm". Resting time in particular is standard practice for exactly the meat this app schedules, and the model has no slot for it. *Closed in Phase 4 for resting; serve order remains open. A dish now has two phases — on the heat, then resting off it — so resting meat lands with everything else, a resting dish occupies no burner for capacity purposes, and the timer announces both putting it on and taking it off. Per-dish serve offsets were explicitly excluded by D4.*

**G26 — The schedule cannot be followed away from the screen.**
It exists as a live countdown and nothing else — no printable or copyable running order, no "start the chicken at 18:42" wall-clock version. The plan is only legible while the tab is open and the timer is running. *Closed in Phase 5: the running order can be copied as plain text or printed, optionally with wall-clock times counted back from a serve time — "start the steak at 19:17" rather than "at 0:00". Clock times are display-only; the schedule itself stays in seconds from t=0.*

---

## Appendix A — Food catalogue

`static/foods.json`:

```json
{
  "foods": [
    {
      "id": "beef-steak",
      "name": "Beef Steak",
      "category": "Meat",
      "cookingTimes": { "rare": 360, "medium": 480, "well-done": 600 }
    }
  ]
}
```

Thirty entries. Categories present: Vegetables (13), Meat (6), Fish (5), Grains (5), Other (1). Times range from 120 seconds (rare tuna steak, rare shrimp, rare scallops) to 2700 seconds (well-done brown rice). Category is used only to group the picker; it has no effect on scheduling.

## Appendix B — Documents that contradict the code

`CLAUDE.md` at the repository root describes a Go 1.25+ backend and a `src/`/`tests/` project layout, neither of which exists. It is stale as of the static-only refactor and will mislead anyone — human or AI — who reads it before reading the code.
