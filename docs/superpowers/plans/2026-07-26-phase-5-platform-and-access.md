# Phase 5: Platform and Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app usable as an actual kitchen appliance — announced to screen readers, legible away from the screen, awake on a phone, and working without a network.

**Architecture:** Four independent strands, deliberately ordered by how badly the gap hurts. Accessibility first, because an app whose entire purpose is telling you when to act currently never tells a screen-reader user anything. Then the exportable running order (pure, testable text generation). Then the wake lock. Vendoring and the service worker last, because they change how every asset loads and carry the load-order trap Phase 1 uncovered.

**Tech Stack:** Unchanged — vanilla ES modules, Alpine 3.13.3 (moving from CDN to a local copy), `node:test`. No installed dependencies; two third-party assets vendored into the repository.

## Global Constraints

- **Zero installed dependencies.** Vendoring copies files into `static/vendor/`; nothing is installed and no package manager is involved.
- **No migrations** (D7).
- **Test command:** `npm test`.
- **Script order is load-bearing and must be re-verified.** `static/js/timer.js` must execute before Alpine. Phase 1 established this the hard way; a local `<script>` is not guaranteed to behave like the CDN one, so Task 4 re-verifies it in a browser rather than assuming.
- **All times remain integer seconds** from t=0. Wall-clock times are derived for display only and never stored in the schedule.
- **Invariants:** `heatOffTime - startTime === cookDuration`, `finishTime - heatOffTime === restSeconds`.
- **D3:** vendor Alpine 3.13.3 and both font families locally. Exact URLs shown to the user before fetching.

## Vendored assets

| Asset | Source URL | Destination |
| --- | --- | --- |
| Alpine 3.13.3 | `https://unpkg.com/alpinejs@3.13.3/dist/cdn.min.js` | `static/vendor/alpine-3.13.3.min.js` |
| Font CSS | `https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap` | rewritten into `static/vendor/fonts.css` |
| Font files | the `fonts.gstatic.com` woff2 files that stylesheet references, **latin and latin-ext subsets only** | `static/vendor/fonts/` |

Only the latin subsets are taken. The UI is English; shipping Cyrillic, Greek and Vietnamese subsets would multiply the download for no benefit. If the UI is ever translated, the remaining subsets are one fetch away.

Vendoring closes **G17** as a side effect: Subresource Integrity protects against a compromised CDN, and after this there is no CDN in the page.

## File Structure

| File | Responsibility |
| --- | --- |
| `static/js/core/runsheet.js` | *Create.* Pure text generation for the running order, and clock-time derivation. |
| `tests/core/runsheet.test.js` | *Create.* |
| `static/js/core/wakelock.js` | *Create.* A thin, testable wrapper over the Screen Wake Lock API. |
| `tests/core/wakelock.test.js` | *Create.* Driven with a fake navigator. |
| `static/vendor/` | *Create.* Alpine, `fonts.css`, `fonts/`. |
| `sw.js` | *Create.* Cache-first service worker for the app shell. Must sit at the root to scope both pages. |
| `manifest.webmanifest` | *Create.* |
| `static/icons/` | *Create.* 192px and 512px PNG icons, generated locally. |
| `index.html`, `timer.html` | *Modify.* Live regions, labels, manifest link, local Alpine, service-worker registration. |
| `static/js/timer.js` | *Modify.* Wake lock, live-region announcements. |
| `static/js/planning.js` | *Modify.* Running-order export, serve-time input. |
| `static/css/styles.css` | *Modify.* Local fonts, screen-reader utility class, print stylesheet. |

---

### Task 1: Accessibility (G18)

The alert popup has no live region, so a screen reader is never told it is time to start the potatoes — which is the entire product. This is the most severe remaining gap and goes first.

**Files:**
- Modify: `timer.html`, `index.html`, `static/css/styles.css`, `static/js/timer.js`

- [ ] **Step 1: Add a screen-reader-only utility class**

```css
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}
```

- [ ] **Step 2: Make the alert popup announce itself**

The popup gets `role="alert"`, which is an implicit assertive live region. Because Alpine toggles it with `x-show` (a style change, not insertion), the text must change *while* the region is in the DOM for it to be announced — so the region is always present and only its content varies.

Add to `timer.html`, replacing the current alert popup wrapper attributes:

```html
            <div
                x-show="currentAlert"
                x-transition
                class="alert-popup"
                :class="alertType"
                role="alert"
                aria-live="assertive"
            >
```

- [ ] **Step 3: Add a polite region for state changes**

Status transitions (paused, resumed, all done) and per-dish phase changes should be announced without interrupting. Add immediately inside the timer container:

```html
        <div class="visually-hidden" aria-live="polite" aria-atomic="true" x-text="announcement"></div>
```

Backed by state in `timerApp()`:

```js
        announcement: '',
```

Set it from `pause()`, `resume()`, `complete()` and `triggerAlert()` — e.g. `this.announcement = 'Timer paused';`. Because `aria-atomic` is true, replacing the text re-announces the whole string.

- [ ] **Step 4: Stop the ticking countdown polluting the accessibility tree**

The two countdown values update every second. They are decoration for a screen reader — the live regions carry the meaning — so mark the *values* hidden while leaving their labels readable:

```html
                        <span class="time-value" aria-hidden="true" x-text="formatTime(remainingSeconds)"></span>
```

and likewise for `.time-value-small`. Add a readable equivalent that does not tick:

```html
                    <span class="visually-hidden" x-text="`${formatTime(remainingSeconds)} remaining`"></span>
```

This is inside a non-live container, so it is available on demand but never announced spontaneously.

- [ ] **Step 5: Mark decoration as decoration**

`.food-status-indicator` is a purely visual dot. Add `aria-hidden="true"`.

- [ ] **Step 6: Give every control an accessible name**

Audit both pages. Every `<select>` and `<input>` must have an associated `<label>` or an `aria-label`; every icon-only button must have `aria-label` rather than only `title`. The kitchen settings already wrap their inputs in `<label>`, which associates implicitly.

- [ ] **Step 7: Verify**

With `python3 -m http.server`, check in the browser console that:

```js
// Every form control has an accessible name.
[...document.querySelectorAll('input,select')].filter(el =>
  !el.getAttribute('aria-label') && !el.closest('label') &&
  !document.querySelector(`label[for="${el.id}"]`)
)
// Expected: []

// Every icon-only button has one too.
[...document.querySelectorAll('button')].filter(el =>
  !el.textContent.trim().match(/[a-z]/i) && !el.getAttribute('aria-label')
)
// Expected: []
```

Then confirm the alert region exists with `role="alert"` and that firing an alert changes its text content.

- [ ] **Step 8: Commit**

---

### Task 2: The running order, away from the screen (G26)

**Files:**
- Create: `static/js/core/runsheet.js`, `tests/core/runsheet.test.js`
- Modify: `static/js/planning.js`, `index.html`, `static/css/styles.css`

**Interfaces:**
- `clockTimes(items, readyAtMinutes) => Map<itemId, { start, heatOff }>` — wall-clock strings for each phase, given the minute-of-day the meal should be ready. `null` when no ready time is set.
- `runsheetText(result, options) => string` — the plain-text running order. `options` is `{ readyAt }` where `readyAt` is a minute-of-day or `null`.

Both pure: no `Date`, no DOM. The caller supplies the ready time as a minute-of-day so the module stays clock-free and testable.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockTimes, runsheetText } from '../../static/js/core/runsheet.js';

const result = {
  totalTime: 780,
  moved: [],
  items: [
    { itemId: 'r0', foodName: 'Beef Steak', optionLabel: 'Medium',
      startTime: 0, cookDuration: 480, heatOffTime: 480, restSeconds: 300, finishTime: 780 },
    { itemId: 'r1', foodName: 'Broccoli', optionLabel: 'Tender',
      startTime: 480, cookDuration: 300, heatOffTime: 780, restSeconds: 0, finishTime: 780 },
  ],
};

test('clockTimes is null without a ready time', () => {
  assert.equal(clockTimes(result.items, null), null);
});

test('clockTimes counts back from the moment the meal is ready', () => {
  // Ready at 19:30 = minute 1170. Total 780s = 13 min, so cooking starts 19:17.
  const times = clockTimes(result.items, 1170);

  assert.equal(times.get('r0').start, '19:17');
  assert.equal(times.get('r0').heatOff, '19:25');
  assert.equal(times.get('r1').start, '19:25');
});

test('clockTimes wraps across midnight', () => {
  // Ready at 00:05 = minute 5. Thirteen minutes earlier is 23:52 the day before.
  const times = clockTimes(result.items, 5);
  assert.equal(times.get('r0').start, '23:52');
});

test('runsheetText lists dishes in the order they go on', () => {
  const text = runsheetText(result, { readyAt: null });

  const lines = text.split('\n').filter((line) => line.includes('Beef Steak') || line.includes('Broccoli'));
  assert.match(lines[0], /Beef Steak/);
  assert.match(lines[1], /Broccoli/);
});

test('runsheetText uses offsets when there is no ready time', () => {
  const text = runsheetText(result, { readyAt: null });
  assert.match(text, /0:00/);
  assert.ok(!text.includes('19:'));
});

test('runsheetText uses clock times when given a ready time', () => {
  const text = runsheetText(result, { readyAt: 1170 });
  assert.match(text, /19:17/);
  assert.match(text, /Ready at 19:30/);
});

test('runsheetText calls out the rest step', () => {
  const text = runsheetText(result, { readyAt: null });
  assert.match(text, /off the heat/i);
  assert.match(text, /rest 5 min/i);
});

test('runsheetText states the total', () => {
  assert.match(runsheetText(result, { readyAt: null }), /13 minutes/);
});

test('runsheetText flags dishes the strategy moved', () => {
  const moved = { ...result, moved: [{ itemId: 'r1', fromStart: 480, toStart: 0, finishesEarlyBy: 480 }] };
  assert.match(runsheetText(moved, { readyAt: null }), /8 min before/);
});

test('runsheetText handles an empty schedule without throwing', () => {
  assert.equal(typeof runsheetText({ items: [], totalTime: 0, moved: [] }, { readyAt: null }), 'string');
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement `core/runsheet.js`**

`clockTimes` converts each phase offset to a minute-of-day by subtracting `(totalTime - offset)` from `readyAtMinutes`, then formats modulo 1440 so it wraps across midnight. `runsheetText` builds a numbered list in start order, one line per dish with its option and time, an indented line for the off-the-heat step where a dish rests, a note for moved dishes, and a closing total or ready time.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Wire it into the planning page**

Add a "Ready at" time input (`type="time"`, optional) and a "Copy running order" button. The button writes `runsheetText` to the clipboard via `navigator.clipboard.writeText`, falling back to selecting a `<textarea>` when the Clipboard API is unavailable, and confirms with the existing inline message region.

Parse the time input to a minute-of-day; blank means offsets.

- [ ] **Step 6: Add a print stylesheet**

```css
@media print {
    .kitchen-settings,
    .custom-food,
    .food-selector,
    .app-header .header-actions,
    #add-food-btn,
    #start-timer-btn,
    .runsheet-actions {
        display: none !important;
    }

    body {
        background: #fff;
        color: #000;
    }

    .panel {
        box-shadow: none;
        border: 1px solid #999;
    }
}
```

- [ ] **Step 7: Verify** — copy the running order with and without a ready time; print-preview shows only the schedule.

- [ ] **Step 8: Commit**

---

### Task 3: Keep the screen awake (G15)

**Files:**
- Create: `static/js/core/wakelock.js`, `tests/core/wakelock.test.js`
- Modify: `static/js/timer.js`

**Interfaces:**
- `createWakeLock(navigatorLike) => { request(), release(), isHeld(), isSupported() }` — takes the navigator so it is testable, and degrades silently when the API is absent.

A screen wake lock is released automatically whenever the page is hidden, so it must be re-requested on `visibilitychange` while the timer is running. That behaviour is the whole reason this needs a wrapper rather than two inline calls.

- [ ] **Step 1: Write the failing tests**

Cover: unsupported navigator reports `isSupported() === false` and `request()` resolves without throwing; a supported navigator records the held sentinel; `release()` releases it and clears the held state; a rejected request (browser refusal) leaves `isHeld() === false` and does not throw; requesting twice does not acquire twice.

Use a fake:

```js
const fakeNavigator = ({ fail = false } = {}) => {
  const released = [];
  return {
    released,
    wakeLock: {
      request: async () => {
        if (fail) throw new Error('refused');
        return { released: false, release: async function () { this.released = true; released.push(this); } };
      },
    },
  };
};
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Wire into `timer.js`** — request on `start()` and `resume()`, release on `pause()`, `complete()` and `reset()`, and re-request on `visibilitychange` when the status is `running`.

- [ ] **Step 5: Verify** — start the timer and confirm in the console that `wakeLock.isHeld()` is true, then that hiding and re-showing the tab re-acquires it.

- [ ] **Step 6: Commit**

---

### Task 4: Work without a network (G16, G17)

**Files:**
- Create: `static/vendor/`, `sw.js`, `manifest.webmanifest`, `static/icons/`
- Modify: `index.html`, `timer.html`, `static/css/styles.css`

- [ ] **Step 1: Fetch Alpine**

```bash
mkdir -p static/vendor
curl -fsSL https://unpkg.com/alpinejs@3.13.3/dist/cdn.min.js \
  -o static/vendor/alpine-3.13.3.min.js
```

Verify it is plausible JavaScript of roughly the expected size, and record the byte count in the commit message so the copy is auditable.

- [ ] **Step 2: Fetch the fonts**

Fetch the Google Fonts stylesheet with a modern browser user agent (otherwise the API serves legacy formats), extract the `latin` and `latin-ext` woff2 URLs, download them into `static/vendor/fonts/`, and write `static/vendor/fonts.css` with the same `@font-face` blocks pointing at the local files.

- [ ] **Step 3: Swap the stylesheet over**

Replace the `@import` of the Google Fonts URL at the top of `static/css/styles.css` with `@import url("../vendor/fonts.css");`.

- [ ] **Step 4: Swap Alpine over, and re-verify the load order**

In `timer.html`:

```html
    <script type="module" src="static/js/timer.js"></script>
    <script defer src="static/vendor/alpine-3.13.3.min.js"></script>
```

The module must still execute first. **Verify in a browser rather than assuming** — check for `ReferenceError: timerApp is not defined` in the console, which is exactly how this failed in Phase 1.

- [ ] **Step 5: Generate icons**

Generate 192×192 and 512×512 PNGs locally with a small Python script using only `zlib` and `struct` from the standard library — a warm-toned rounded field with a simple pan glyph. No image library is installed and no icon is downloaded.

- [ ] **Step 6: Add the manifest**

```json
{
  "name": "Coordinated Cooking",
  "short_name": "Cooking",
  "description": "Plan a synchronised finish for every dish.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f8f5f1",
  "theme_color": "#ff6b4a",
  "icons": [
    { "src": "static/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "static/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Link it from both pages, alongside `<meta name="theme-color">` and a favicon link — the spec noted a 404 on `favicon.ico`.

- [ ] **Step 7: Add the service worker**

Cache-first over an explicit app-shell list, with a versioned cache name and old caches deleted on activate. Navigation requests fall back to the cached page when the network fails. Register it from both pages, guarded on `'serviceWorker' in navigator`.

The shell list must include: both HTML pages, `static/css/styles.css`, every `static/js` file including `core/`, `static/foods.json`, the vendored Alpine, `static/vendor/fonts.css`, every font file, and both icons.

- [ ] **Step 8: Verify offline**

With the server running, load both pages, then check `navigator.serviceWorker.controller` is non-null. Stop the server and reload: both pages must still work, styled, with the food list available. This is the acceptance test for G16 and it cannot be faked — if the shell list is incomplete, something will 404.

- [ ] **Step 9: Commit**

---

### Task 5: Close out

- [ ] Annotate G15–G18 and G26 in the spec, noting that G17 is closed by removing the CDN rather than by adding SRI, and that G26's clock times are display-only.
- [ ] Update the spec's §3.1 and §3.3 — the app is no longer CDN-dependent, and there is now a build-free offline story.
- [ ] Mark Phase 5 done in the roadmap and add a closing summary of the whole remediation.
- [ ] Commit.

---

## Self-Review

**Spec coverage.** G18 in Task 1; G26 in Task 2; G15 in Task 3; G16 and G17 in Task 4. That completes all 26 gaps, with the three partial closures recorded honestly: G3 (repaid in Phase 3), G20 (tests yes, lint and CI no), G23 (override rather than a physical model), G25 (resting yes, serve order excluded by D4).

**Placeholder scan.** Tasks 1–3 carry the code or the exact verification snippets. Task 4's fetch and generation steps specify commands, sources and acceptance criteria rather than inlining a font stylesheet or a PNG encoder, both of which are generated artefacts; Step 8's offline check is the acceptance gate and cannot be satisfied by a partial implementation.

**Type consistency.** `clockTimes(items, readyAtMinutes)` and `runsheetText(result, { readyAt })` take a minute-of-day in both the tests and the planning-page caller. `createWakeLock(navigatorLike)` returns the same four methods in tests and in `timer.js`. `result` in `runsheetText` is the `applyStrategy` return shape from Phase 4 — `{ items, totalTime, conflicts, strategy, moved }` — so the running order can flag moved dishes.

**Risk.** Task 4 is the one that can break the app outright rather than subtly, in two ways: the Alpine load order (Phase 1's trap, re-verified in Step 4) and an incomplete service-worker shell list, which fails only when the network is gone. Step 8 tests offline with the server actually stopped, which is the only honest way to check it.
