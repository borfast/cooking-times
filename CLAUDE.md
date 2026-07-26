# cooking-times Development Guidelines

## What this is

A static web app that plans a synchronised finish for a multi-dish meal. You pick
foods and how you want each cooked; it works out when each has to go on so
everything is ready at the same moment, then runs a timer that tells you when to
act.

Two pages, no backend, no build step:

- `index.html` — planning. Build the menu, see the schedule, export a running order.
- `timer.html` — execution. Countdown, per-dish state, alerts.

## Stack

- Vanilla ES modules. No framework on the planning page; Alpine.js 3.13.3 on the
  timer page, vendored locally in `static/vendor/`.
- Node 24+ for tooling only. The shipped app has no dependencies at all.
- Biome for linting and formatting — the only dependency, and it is dev-only.

## Project structure

```text
index.html              planning page
timer.html              timer page
sw.js                   service worker (app-shell cache, must stay at the root)
manifest.webmanifest
static/
  foods.json            the food catalogue
  css/styles.css
  icons/                PWA icons, generated locally
  vendor/               Alpine and the fonts — committed, not fetched
  js/
    planning.js         planning page, vanilla DOM
    timer.js            timer page, Alpine component
    core/               pure logic, no DOM and no clock — this is where the
                        interesting code lives, and all of it is unit-tested
tests/core/             one test file per core module
docs/superpowers/       spec and remediation plans
```

## Commands

```bash
npm test        # lint, then run the suite (node:test, no test framework installed)
npm run lint    # biome check .
npm run format  # biome check --write .
```

There is no dev server. Serve the directory over HTTP — `python3 -m http.server`
is enough. It will **not** work from `file://`: the pages are ES modules and the
catalogue is loaded with `fetch`.

## Code style

Enforced by Biome, so run `npm run format` rather than matching by hand:
four-space indent, single quotes, semicolons, LF.

Conventions Biome cannot enforce:

- **`static/js/core/` stays pure.** No DOM, no `localStorage`, no `Date`, no audio.
  Anything needing those takes them as an argument, which is why the core is
  testable without a browser. Keep it that way.
- **All schedule times are integer seconds from t=0**, the moment cooking starts —
  never wall-clock. Clock times are derived for display only.
- **A dish has two phases**: `startTime → heatOffTime` on the heat, then
  `restSeconds` off it, ready at `finishTime`. Two invariants hold everywhere:
  `heatOffTime - startTime === cookDuration` and
  `finishTime - heatOffTime === restSeconds`.
- **Identity is `itemId`, never `foodId`.** Two portions of the same food at
  different options are a legitimate menu, and keying on `foodId` silently breaks
  them.

## Traps

- **Script order in `timer.html` is load-bearing.** `static/js/timer.js` must come
  *before* the Alpine tag. Alpine's build calls `Alpine.start()` as soon as it runs,
  and deferred scripts execute in document order, so putting the module after it
  means `x-data` resolves nothing and the page renders blank. Registering on
  `alpine:init` does not help — that event has already fired by then.
- **`sw.js` must stay at the repository root** so its scope covers both pages, and
  its shell list must be updated whenever a file is added or renamed. A missing
  entry only fails once the network is gone.
- **Verify in a browser, not only with unit tests.** Several defects here were
  invisible to the suite: a wake-lock race, an Alpine load-order break, and
  vendored assets silently excluded by `.gitignore`.

## Where to read first

`docs/superpowers/specs/2026-07-25-cooking-times-design.md` describes what the app
is and carries the gaps register — including the gaps still open on purpose (G13
and G14, kitchen capacity) and those only partly closed (G23, G25).
