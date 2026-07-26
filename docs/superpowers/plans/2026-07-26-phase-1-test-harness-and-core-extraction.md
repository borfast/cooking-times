# Phase 1: Test Harness and Core Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the duplicated scheduling arithmetic into a single tested ES module, and give the repository a test command, without changing anything a user sees.

**Architecture:** Extract the two pure concerns — schedule arithmetic and duration formatting — into `static/js/core/` as ES modules with named exports. Both page scripts become `type="module"` and import from there. The timer's `recalculateSchedulePreservingProgress` method, currently 88 lines of untested branching inside an Alpine component, becomes a pure function taking `(selections, currentItems, elapsedSeconds)` and returning a new schedule; the Alpine method shrinks to that call plus its side effects. Tests run on Node's built-in test runner against the same module files the browser loads.

**Tech Stack:** Vanilla ES modules, Alpine.js 3.13.3 (unchanged), Node 24 `node:test` + `node:assert/strict`. No installed dependencies.

## Global Constraints

- **Zero new dependencies.** `package.json` must have no `dependencies` or `devDependencies`. Node's built-in test runner only.
- **No user-visible behaviour change in this phase.** Every gap other than G11 and G20 stays open until Phase 2.
- **Node version floor:** 24.18.0 (present). The test command must be `node --test "tests/**/*.test.js"`. The directory form `node --test tests/` is broken on Node 24 — it resolves the directory as a module entry point and dies with `MODULE_NOT_FOUND`.
- **Node 24 auto-detects ES module syntax in `.js` files**, so `"type": "module"` is not required for tests to run. It is declared anyway, to state the intent rather than rely on syntax detection.
- **All times are integer seconds** relative to `t=0`, the moment cooking starts. Never wall-clock, never milliseconds, never floats.
- **Schedule item shape is fixed:** `{ foodId, foodName, doneness, startTime, duration, finishTime }`. Phase 3 changes `doneness`; do not change it here.
- **Selection shape is fixed:** `{ foodId, foodName, doneness, cookingTime }`.
- **Invariant that must hold for every item the scheduler returns:** `finishTime - startTime === duration`.
- **The app is served over HTTP, never `file://`.** It already requires this — `fetch('static/foods.json')` fails on `file://` today — and ES modules reinforce it. Verify with `python3 -m http.server`.

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` | *Create.* Declares the `test` script and, for explicitness, `"type": "module"`. No dependencies. |
| `static/js/core/format.js` | *Create.* Duration → display string. Two exports, no state, no DOM. |
| `static/js/core/schedule.js` | *Create.* The scheduling rule and the mid-cook re-plan. Two exports, no state, no DOM, no `Date`. |
| `tests/core/format.test.js` | *Create.* Unit tests for formatting, including the negative-clamp case the two old copies disagreed on. |
| `tests/core/schedule.test.js` | *Create.* Unit tests for both scheduling functions, including the six mid-cook cases that are currently unpinned. |
| `static/js/planning.js` | *Rename* from `static/js/schedule.js`, then modify. Renamed because `static/js/schedule.js` and `static/js/core/schedule.js` in the same tree is a trap. Keeps all DOM building; loses its own copy of the arithmetic. |
| `static/js/timer.js` | *Modify.* Loses its copies of `calculateSchedule`, `formatTime`, and the body of `recalculateSchedulePreservingProgress`. Gains imports and a `window.timerApp` assignment. |
| `index.html:49` | *Modify.* Script tag becomes `type="module"` and points at the renamed file. |
| `timer.html:166` | *Modify.* Script tag becomes `type="module"`. |

---

### Task 1: Test runner

**Files:**
- Create: `package.json`
- Create: `tests/smoke.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs every `*.test.js` under `tests/`. All later tasks rely on this command.

- [ ] **Step 1: Write the failing test**

Create `tests/smoke.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner executes ES modules', () => {
  assert.equal(typeof import.meta.url, 'string');
});
```

- [ ] **Step 2: Confirm the runner works, and learn the correct invocation**

Run: `node --test "tests/**/*.test.js"`

Expected: PASS, `1 pass  0 fail`.

There is no RED step here, and it is worth being explicit about why. Node 24 auto-detects ES module syntax in `.js` files, so this test passes with no `package.json` present at all. Task 1 is scaffolding, not behaviour — the thing being verified is that the runner exists and executes ESM, which is true before any file is written. The genuine RED/GREEN cycles start at Task 2.

Do **not** use `node --test tests/`. On Node 24 that resolves `tests` as a module entry point and dies with `MODULE_NOT_FOUND`, which looks exactly like a broken test file.

- [ ] **Step 3: Add the manifest**

Create `package.json`:

```json
{
  "name": "cooking-times",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Plan a synchronised finish for every dish.",
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\""
  }
}
```

`"type": "module"` is declared to state the intent explicitly rather than depend on syntax detection; it is not what makes the tests run.

- [ ] **Step 4: Confirm `npm test` works**

Run: `npm test`

Expected: PASS, `1 pass  0 fail`.

- [ ] **Step 5: Confirm no dependencies were installed**

Run: `ls node_modules 2>&1; cat package.json | grep -c dependencies`

Expected: `No such file or directory` and `0`. If either differs, stop — the zero-dependency constraint is broken.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/smoke.test.js
git commit -m "test: add zero-dependency test runner via node:test"
```

---

### Task 2: Duration formatting

**Files:**
- Create: `static/js/core/format.js`
- Create: `tests/core/format.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatTime(totalSeconds: number) => string` — `M:SS`, negatives clamp to `'0:00'`.
  - `formatMinutes(totalSeconds: number) => number` — whole minutes, floored, negatives clamp to `0`.

Both page scripts import these in Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

Create `tests/core/format.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatMinutes } from '../../static/js/core/format.js';

test('formatTime pads seconds to two digits', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(9), '0:09');
  assert.equal(formatTime(59), '0:59');
});

test('formatTime rolls over into minutes', () => {
  assert.equal(formatTime(60), '1:00');
  assert.equal(formatTime(90), '1:30');
  assert.equal(formatTime(1500), '25:00');
  assert.equal(formatTime(2700), '45:00');
});

test('formatTime clamps negatives to zero', () => {
  // The timer's old copy clamped; the planning page's dead copy did not.
  // The extracted version adopts the clamping behaviour.
  assert.equal(formatTime(-1), '0:00');
  assert.equal(formatTime(-600), '0:00');
});

test('formatTime tolerates non-integer and non-numeric input', () => {
  assert.equal(formatTime(90.7), '1:30');
  assert.equal(formatTime(Number.NaN), '0:00');
});

test('formatMinutes floors to whole minutes', () => {
  assert.equal(formatMinutes(0), 0);
  assert.equal(formatMinutes(59), 0);
  assert.equal(formatMinutes(1500), 25);
  assert.equal(formatMinutes(1529), 25);
});

test('formatMinutes clamps negatives to zero', () => {
  assert.equal(formatMinutes(-10), 0);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`

Expected: FAIL with `Cannot find module .../static/js/core/format.js`.

- [ ] **Step 3: Implement**

Create `static/js/core/format.js`:

```js
/**
 * Duration formatting. Pure — no DOM, no clock, no state.
 * All inputs are durations in seconds, never wall-clock timestamps.
 */

function toSeconds(value) {
  const seconds = Math.floor(Number(value));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** Format a duration as `M:SS`. Negative or unusable input yields `'0:00'`. */
export function formatTime(totalSeconds) {
  const seconds = toSeconds(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Format a duration as whole minutes, floored. Negative input yields `0`. */
export function formatMinutes(totalSeconds) {
  return Math.floor(toSeconds(totalSeconds) / 60);
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add static/js/core/format.js tests/core/format.test.js
git commit -m "refactor: extract duration formatting into tested core module (G11)"
```

---

### Task 3: The scheduling rule

**Files:**
- Create: `static/js/core/schedule.js`
- Create: `tests/core/schedule.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `calculateSchedule(selections) => { items, totalTime }`.
  - `selections`: array of `{ foodId, foodName, doneness, cookingTime }`, or `null`/`undefined`/`[]`.
  - `items`: array of `{ foodId, foodName, doneness, startTime, duration, finishTime }`, sorted by `startTime` ascending.
  - `totalTime`: the longest `cookingTime`, or `0` for no selections.

`recalculateSchedule` is added to this same file in Task 4.

- [ ] **Step 1: Write the failing tests**

Create `tests/core/schedule.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSchedule } from '../../static/js/core/schedule.js';

/** Build a selection. `foodName` mirrors `foodId` so assertions stay readable. */
const sel = (foodId, cookingTime, doneness = 'medium') => ({
  foodId,
  foodName: foodId,
  doneness,
  cookingTime,
});

test('calculateSchedule returns an empty schedule for no selections', () => {
  assert.deepEqual(calculateSchedule([]), { items: [], totalTime: 0 });
});

test('calculateSchedule tolerates null and undefined', () => {
  // The old planning-page copy threw on null; the timer copy did not.
  assert.deepEqual(calculateSchedule(null), { items: [], totalTime: 0 });
  assert.deepEqual(calculateSchedule(undefined), { items: [], totalTime: 0 });
});

test('a single dish starts at zero and sets the total', () => {
  const result = calculateSchedule([sel('kale', 360)]);

  assert.equal(result.totalTime, 360);
  assert.deepEqual(result.items, [
    {
      foodId: 'kale',
      foodName: 'kale',
      doneness: 'medium',
      startTime: 0,
      duration: 360,
      finishTime: 360,
    },
  ]);
});

test('the longest dish sets the clock and every dish finishes together', () => {
  const result = calculateSchedule([
    sel('kale', 360),
    sel('chicken', 1500),
    sel('carrots', 600),
  ]);

  assert.equal(result.totalTime, 1500);
  for (const item of result.items) {
    assert.equal(item.finishTime, 1500);
  }
});

test('items are returned in the order you put them on', () => {
  const result = calculateSchedule([
    sel('kale', 360),
    sel('chicken', 1500),
    sel('carrots', 600),
  ]);

  assert.deepEqual(
    result.items.map((item) => [item.foodId, item.startTime]),
    [
      ['chicken', 0],
      ['carrots', 900],
      ['kale', 1140],
    ],
  );
});

test('equally long dishes both start at zero', () => {
  const result = calculateSchedule([sel('a', 300), sel('b', 300)]);

  assert.equal(result.totalTime, 300);
  assert.deepEqual(
    result.items.map((item) => item.startTime),
    [0, 0],
  );
});

test('every item satisfies finishTime - startTime === duration', () => {
  const result = calculateSchedule([
    sel('shrimp', 120),
    sel('brown-rice', 2700),
    sel('salmon', 720),
  ]);

  for (const item of result.items) {
    assert.equal(item.finishTime - item.startTime, item.duration);
  }
});

test('doneness is carried through untouched', () => {
  const result = calculateSchedule([sel('beef-steak', 360, 'rare')]);
  assert.equal(result.items[0].doneness, 'rare');
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`

Expected: FAIL with `Cannot find module .../static/js/core/schedule.js`.

- [ ] **Step 3: Implement**

Create `static/js/core/schedule.js`:

```js
/**
 * Schedule arithmetic. Pure — no DOM, no clock, no state, no `Date`.
 *
 * Every time in this module is an integer number of seconds measured from
 * t=0, the moment cooking starts. Nothing here knows about wall-clock time.
 *
 * Schedule item shape: { foodId, foodName, doneness, startTime, duration, finishTime }
 * Selection shape:     { foodId, foodName, doneness, cookingTime }
 *
 * Invariant, guaranteed for every item returned by every function here:
 *   finishTime - startTime === duration
 */

function byStartTime(a, b) {
  return a.startTime - b.startTime;
}

/**
 * Build a schedule in which every dish finishes at the same moment.
 *
 * The longest dish sets the total and starts at t=0; everything else starts
 * late enough to land with it.
 */
export function calculateSchedule(selections) {
  if (!selections || selections.length === 0) {
    return { items: [], totalTime: 0 };
  }

  const totalTime = Math.max(...selections.map((selection) => selection.cookingTime));

  const items = selections.map((selection) => ({
    foodId: selection.foodId,
    foodName: selection.foodName,
    doneness: selection.doneness,
    startTime: totalTime - selection.cookingTime,
    duration: selection.cookingTime,
    finishTime: totalTime,
  }));

  items.sort(byStartTime);

  return { items, totalTime };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`

Expected: PASS, 15 tests total across both test files.

- [ ] **Step 5: Commit**

```bash
git add static/js/core/schedule.js tests/core/schedule.test.js
git commit -m "refactor: extract calculateSchedule into tested core module (G11)"
```

---

### Task 4: The mid-cook re-plan

This is the logic the spec flags as having six meaningful cases and no tests. It is being extracted verbatim in behaviour, with one latent inconsistency closed (see Step 3).

**Files:**
- Modify: `static/js/core/schedule.js` (append one export)
- Modify: `tests/core/schedule.test.js` (append tests)

**Interfaces:**
- Consumes: `calculateSchedule` from Task 3, used in tests to build the "before" state.
- Produces: `recalculateSchedule(selections, currentItems, elapsedSeconds) => { items, totalTime }`.
  - `selections`: the full desired list after the edit, same shape as `calculateSchedule`.
  - `currentItems`: the schedule items in force *before* the edit — used only to decide which dishes have already started and to preserve their timings.
  - `elapsedSeconds`: integer seconds since cooking started.

  A dish counts as started when `elapsedSeconds >= itsCurrentStartTime`. Started dishes keep their original `startTime` and `finishTime`. Everything else re-targets a common finish late enough for all of them.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/schedule.test.js`:

```js
import { recalculateSchedule } from '../../static/js/core/schedule.js';

/** The state the timer is in before an edit: a plan, and time on the clock. */
const inProgress = (selections) => calculateSchedule(selections).items;

test('recalculateSchedule is a no-op when nothing changed', () => {
  const selections = [sel('chicken', 1500), sel('kale', 360)];
  const before = calculateSchedule(selections);

  const after = recalculateSchedule(selections, before.items, 0);

  assert.deepEqual(after, before);
});

test('adding a shorter dish mid-cook leaves the finish where it was', () => {
  const original = [sel('chicken', 1500), sel('kale', 360)];
  const current = inProgress(original);

  const after = recalculateSchedule(
    [...original, sel('carrots', 600)],
    current,
    600,
  );

  assert.equal(after.totalTime, 1500);
  assert.deepEqual(
    after.items.map((item) => [item.foodId, item.startTime, item.finishTime]),
    [
      ['chicken', 0, 1500],
      ['carrots', 900, 1500],
      ['kale', 1140, 1500],
    ],
  );
});

test('adding a slower dish mid-cook extends the meal and strands what is already cooking', () => {
  const original = [sel('chicken', 1500), sel('kale', 360)];
  const current = inProgress(original);

  const after = recalculateSchedule(
    [...original, sel('brown-rice', 2700)],
    current,
    600,
  );

  assert.equal(after.totalTime, 3300);

  const chicken = after.items.find((item) => item.foodId === 'chicken');
  assert.equal(chicken.startTime, 0);
  assert.equal(chicken.finishTime, 1500);
  // The documented consequence: a dish already cooking now finishes 30 minutes
  // before the meal does, and sits there.
  assert.ok(chicken.finishTime < after.totalTime);

  const rice = after.items.find((item) => item.foodId === 'brown-rice');
  assert.equal(rice.startTime, 600);
  assert.equal(rice.finishTime, 3300);
});

test('a started dish keeps its timings when a waiting dish is removed', () => {
  const original = [sel('chicken', 1500), sel('kale', 360)];
  const current = inProgress(original);

  const after = recalculateSchedule([sel('chicken', 1500)], current, 600);

  assert.equal(after.totalTime, 1500);
  assert.deepEqual(after.items, [
    {
      foodId: 'chicken',
      foodName: 'chicken',
      doneness: 'medium',
      startTime: 0,
      duration: 1500,
      finishTime: 1500,
    },
  ]);
});

test('shortening a waiting dish never pulls the finish earlier than a started dish', () => {
  const original = [sel('chicken', 1500), sel('kale', 360)];
  const current = inProgress(original);

  // Kale switched from medium (360) to rare (180) while still waiting.
  const after = recalculateSchedule(
    [sel('chicken', 1500), sel('kale', 180, 'rare')],
    current,
    600,
  );

  assert.equal(after.totalTime, 1500);
  const kale = after.items.find((item) => item.foodId === 'kale');
  assert.equal(kale.startTime, 1320);
  assert.equal(kale.doneness, 'rare');
  assert.equal(kale.duration, 180);
});

test('no dish is ever scheduled to start in the past', () => {
  const original = [sel('chicken', 1500), sel('kale', 360)];
  const current = inProgress(original);

  for (const elapsed of [0, 1, 600, 1140, 1499]) {
    const after = recalculateSchedule(
      [...original, sel('brown-rice', 2700), sel('shrimp', 120)],
      current,
      elapsed,
    );
    for (const item of after.items) {
      const wasStarted = current.some(
        (existing) => existing.foodId === item.foodId && elapsed >= existing.startTime,
      );
      if (!wasStarted) {
        assert.ok(
          item.startTime >= elapsed,
          `${item.foodId} starts at ${item.startTime}, before elapsed ${elapsed}`,
        );
      }
    }
  }
});

test('recalculateSchedule preserves the duration invariant', () => {
  const original = [sel('chicken', 1500), sel('kale', 360)];
  const current = inProgress(original);

  const after = recalculateSchedule(
    [...original, sel('brown-rice', 2700)],
    current,
    600,
  );

  for (const item of after.items) {
    assert.equal(item.finishTime - item.startTime, item.duration);
  }
});

test('recalculateSchedule returns an empty schedule when everything is removed', () => {
  const current = inProgress([sel('chicken', 1500)]);
  assert.deepEqual(recalculateSchedule([], current, 600), { items: [], totalTime: 0 });
});

test('a dish absent from the current plan is treated as not yet started', () => {
  const after = recalculateSchedule([sel('carrots', 600)], [], 100);

  assert.equal(after.totalTime, 700);
  assert.equal(after.items[0].startTime, 100);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`

Expected: FAIL with `The requested module ... does not provide an export named 'recalculateSchedule'`.

- [ ] **Step 3: Implement**

Append to `static/js/core/schedule.js`:

```js
/**
 * Re-plan around dishes that have already started.
 *
 * Dishes already on the heat are immovable: they keep the start and finish
 * they were given. Everything else re-targets a common finish, chosen to be
 * late enough for both the immovable dishes and the slowest dish still waiting.
 *
 * Two consequences worth knowing, both intentional:
 *  - Adding a slow dish pushes the finish later, so dishes already cooking
 *    finish before the meal does.
 *  - Removing or shortening a waiting dish cannot pull the finish earlier than
 *    the last immovable dish.
 *
 * @param selections     the full desired list after the edit
 * @param currentItems   the schedule in force before the edit
 * @param elapsedSeconds seconds since cooking started
 */
export function recalculateSchedule(selections, currentItems, elapsedSeconds) {
  if (!selections || selections.length === 0) {
    return { items: [], totalTime: 0 };
  }

  const current = currentItems || [];
  const started = [];
  const waiting = [];

  for (const selection of selections) {
    const inForce = current.find((item) => item.foodId === selection.foodId);
    if (inForce && elapsedSeconds >= inForce.startTime) {
      started.push({ selection, inForce });
    } else {
      waiting.push(selection);
    }
  }

  let totalTime = 0;
  for (const { inForce } of started) {
    totalTime = Math.max(totalTime, inForce.finishTime);
  }
  if (waiting.length > 0) {
    const slowest = Math.max(...waiting.map((selection) => selection.cookingTime));
    totalTime = Math.max(totalTime, elapsedSeconds + slowest);
  }

  const items = [
    ...started.map(({ selection, inForce }) => ({
      foodId: selection.foodId,
      foodName: selection.foodName,
      doneness: selection.doneness,
      startTime: inForce.startTime,
      // Derived from the timings actually in force rather than from the
      // selection's cookingTime, so the duration invariant holds even if a
      // caller ever changes the doneness of a dish that has already started.
      duration: inForce.finishTime - inForce.startTime,
      finishTime: inForce.finishTime,
    })),
    ...waiting.map((selection) => ({
      foodId: selection.foodId,
      foodName: selection.foodName,
      doneness: selection.doneness,
      startTime: Math.max(totalTime - selection.cookingTime, elapsedSeconds),
      duration: selection.cookingTime,
      finishTime: totalTime,
    })),
  ];

  items.sort(byStartTime);

  return { items, totalTime };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`

Expected: PASS, 24 tests total.

- [ ] **Step 5: Note the dead clamp**

The `Math.max(..., elapsedSeconds)` on a waiting dish's `startTime` is provably unreachable: `totalTime >= elapsedSeconds + slowest` and `selection.cookingTime <= slowest`, so `totalTime - selection.cookingTime >= elapsedSeconds` always. It is kept as a guard and pinned by the "no dish starts in the past" test. Do not remove it — a later phase changes how `totalTime` is chosen, and the guard stops that becoming a silent bug.

- [ ] **Step 6: Commit**

```bash
git add static/js/core/schedule.js tests/core/schedule.test.js
git commit -m "refactor: extract mid-cook re-plan into tested core module (G11, G20)"
```

---

### Task 5: Wire up the planning page

**Files:**
- Rename: `static/js/schedule.js` → `static/js/planning.js`
- Modify: `static/js/planning.js` (imports; delete two local functions; use shared formatting)
- Modify: `index.html:49`

**Interfaces:**
- Consumes: `calculateSchedule` (Task 3), `formatTime` and `formatMinutes` (Task 2).
- Produces: nothing for later tasks.

- [ ] **Step 1: Rename the file**

```bash
git mv static/js/schedule.js static/js/planning.js
```

- [ ] **Step 2: Add the imports**

Add as the first lines of `static/js/planning.js`, replacing the `// T029-T031: ...` comment:

```js
import { calculateSchedule } from './core/schedule.js';
import { formatTime, formatMinutes } from './core/format.js';
```

- [ ] **Step 3: Delete the local copy of the arithmetic**

Delete the entire `calculateSchedule` function — the block that begins `// Calculate schedule (same algorithm as backend)` and ends with the closing brace of that function. It is now imported.

- [ ] **Step 4: Delete the dead formatter**

Delete the entire `formatTime` function — the block beginning `// Format seconds as MM:SS`. It is dead code: nothing in this file or in `index.html` ever called it. The imported `formatTime` takes its place and *is* used, in the next step.

- [ ] **Step 5: Use the shared formatters in `displaySchedule`**

Replace the body of the `schedule.items.forEach` callback and the total line so the three inline `Math.floor(x / 60)` computations become calls:

```js
    let html = '';
    schedule.items.forEach((item, index) => {
        let intervalText = '';
        if (index > 0) {
            const intervalSec = item.startTime - schedule.items[index - 1].startTime;
            intervalText = `<small>(${formatMinutes(intervalSec)} min after previous)</small>`;
        }

        html += `
            <div class="schedule-item">
                <strong>${item.foodName} (${item.doneness})</strong>
                <div class="time">
                    Start at: ${formatTime(item.startTime)}
                    ${intervalText}
                </div>
                <div class="time">Cook for: ${formatMinutes(item.duration)} minutes</div>
            </div>
        `;
    });

    html += `<div class="total-time">Total Time: ${formatMinutes(schedule.totalTime)} minutes</div>`;
```

- [ ] **Step 6: Point the page at the module**

In `index.html`, replace line 49:

```html
    <script type="module" src="static/js/planning.js"></script>
```

- [ ] **Step 7: Verify the unit tests still pass**

Run: `npm test`

Expected: PASS, 24 tests. No test touches the page scripts, so this only confirms nothing was broken in `core/`.

- [ ] **Step 8: Verify the page in a browser**

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/index.html` and confirm, with the console open:

1. No console errors — in particular no "Failed to load module script" and no "Cannot use import statement".
2. One empty food row appears on load.
3. Selecting a food reveals the schedule panel.
4. Adding a second, slower food re-orders the list and updates "Total Time".
5. The "(N min after previous)" note appears on every row but the first.
6. Start offsets read as `M:SS` and durations as whole minutes — identical to before the change.
7. Removing a row updates the schedule; removing the last one hides the panel.

- [ ] **Step 9: Commit**

```bash
git add index.html static/js/planning.js
git commit -m "refactor: planning page imports shared core, drops dead formatter (G11)"
```

---

### Task 6: Wire up the timer page

**Files:**
- Modify: `static/js/timer.js`
- Modify: `timer.html:166`

**Interfaces:**
- Consumes: `calculateSchedule`, `recalculateSchedule` (Tasks 3–4), `formatTime` (Task 2).
- Produces: `window.timerApp`, which `timer.html`'s `x-data="timerApp()"` resolves against.

- [ ] **Step 1: Add the imports**

Add as the first lines of `static/js/timer.js`, replacing the `// T043-T050: ...` comment. Note the alias — the Alpine component keeps a method called `formatTime`, so the import cannot share that name:

```js
import { calculateSchedule, recalculateSchedule } from './core/schedule.js';
import { formatTime as formatDuration } from './core/format.js';
```

- [ ] **Step 2: Delete the component's copy of the arithmetic**

Delete the `calculateSchedule(foods) { ... }` method — the block beginning `// Calculate schedule (same as planning page)`. The two call sites, in `loadFromScheduleStorage` and nowhere else, become calls to the import:

```js
                    this.schedule = calculateSchedule(this.selectedFoods);
```

- [ ] **Step 3: Replace the re-plan method's body**

Replace the whole of `recalculateSchedulePreservingProgress()` — 88 lines — with a call to the pure function plus the side effects that must stay in the component:

```js
        // Re-plan around dishes already on the heat, then fan out the effects.
        recalculateSchedulePreservingProgress() {
            this.schedule = recalculateSchedule(
                this.selectedFoods,
                this.schedule.items,
                this.elapsedSeconds,
            );
            this.regenerateAlerts();
            this.remainingSeconds = Math.max(0, this.schedule.totalTime - this.elapsedSeconds);
            this.saveSession();
        },
```

- [ ] **Step 4: Delegate the formatter**

Replace the `formatTime(seconds) { ... }` method body so the component keeps its template-facing name but holds no arithmetic:

```js
        formatTime(seconds) {
            return formatDuration(seconds);
        },
```

- [ ] **Step 5: Expose the factory to Alpine**

Because a module's top-level bindings are not global, `x-data="timerApp()"` can no longer see the function. Add as the last line of `static/js/timer.js`:

```js
window.timerApp = timerApp;
```

- [ ] **Step 6: Point the page at the module**

In `timer.html`, replace line 166:

```html
    <script type="module" src="static/js/timer.js"></script>
```

The Alpine `<script defer>` in `<head>` and this module script are both deferred and execute in document order, so `window.timerApp` is assigned before Alpine initialises on `DOMContentLoaded`. Step 8 verifies this rather than trusting it.

- [ ] **Step 7: Verify the unit tests still pass**

Run: `npm test`

Expected: PASS, 24 tests.

- [ ] **Step 8: Verify the timer in a browser**

With `python3 -m http.server 8000` running, plan a meal of Chicken (medium) plus Kale (medium) on `index.html`, press "Start Timer", and confirm on `timer.html`:

1. No console errors, and the food list renders — if `x-data` failed to resolve, the page renders blank and Alpine logs a ReferenceError for `timerApp`.
2. "Time Remaining" shows `25:00` and the schedule lists Chicken then Kale.
3. "Start Cooking" begins the countdown; Chicken moves to the cooking style and Kale shows "Starts in:".
4. Pause holds the clock; Resume continues from where it held.
5. While running, changing Kale's doneness re-times it and leaves Chicken's timings alone.
6. While running, adding Brown Rice (medium) extends "Total Cooking Time" to `55:00` and leaves Chicken finishing at `25:00`.
7. Reload the page mid-run: the clock resumes at the correct elapsed time rather than restarting.

Note that G1 is still open, so a second planning round will show the stale session until Reset is pressed — that is expected here and is fixed in Phase 2.

- [ ] **Step 9: Commit**

```bash
git add timer.html static/js/timer.js
git commit -m "refactor: timer imports shared core, re-plan becomes a pure function (G11, G20)"
```

---

### Task 7: Correct the spec's G11 entry

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-cooking-times-design.md` (the G11 entry)

**Interfaces:**
- Consumes: the findings from Tasks 3 and 5.
- Produces: nothing.

- [ ] **Step 1: Rewrite G11 to match what was actually found**

Replace the G11 entry with:

```markdown
**G11 — The scheduling rule was duplicated across both JS files, and one copy of the formatter was dead.**
`calculateSchedule` existed in both `schedule.js` and `timer.js`. The copies were logically equivalent but not textually identical: the planning copy guarded with `foods.length === 0` and threw on `null`, the timer copy guarded with `!foods || foods.length === 0`. `formatTime` also existed in both, but the planning page's copy was never called from anywhere — `displaySchedule` formatted inline instead. *Closed in Phase 1: both live in `static/js/core/`, the null-safe guard won, and the dead copy is gone.*
```

- [ ] **Step 2: Mark G20 closed in the same pass**

Append to the G20 entry:

*Closed in Phase 1: `npm test` runs 24 unit tests over the scheduling core, including all six mid-cook re-plan cases.*

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-25-cooking-times-design.md
git commit -m "docs: correct G11, mark G11 and G20 closed"
```

---

## Self-Review

**Spec coverage.** This plan closes G11 and G20 only, which is what the roadmap assigns to Phase 1. G11 is closed by Tasks 2–6 (one home for the arithmetic and the formatter, dead copy deleted). G20 is closed by Tasks 1–4 (a test command plus 24 tests over the logic the spec singles out as indefensibly untested). The remaining 24 gaps are assigned to Phases 2–5 in the roadmap; none is silently dropped.

**Placeholder scan.** No TBD/TODO. Every code step carries the actual code. Every test step carries the actual assertions. Every run step names the command and the expected result.

**Type consistency.** `calculateSchedule(selections)` and `recalculateSchedule(selections, currentItems, elapsedSeconds)` keep the same names and parameter order in Tasks 3, 4, 5 and 6. `formatTime`/`formatMinutes` keep their names throughout; the alias `formatDuration` appears only inside `timer.js`, where the component method needs the unaliased name, and is introduced in the same task that uses it. The item and selection shapes declared in Global Constraints match every literal in every task. `byStartTime`, defined in Task 3, is used by Task 4 in the same file.

**Known risk.** Task 6 Step 5 relies on `window.timerApp` being assigned before Alpine initialises. This follows from deferred-script ordering, but it is the one change in this phase that could break the timer page outright rather than subtly, so Step 8 verification item 1 checks for exactly that failure. If it does fail, the fix is to register the component via Alpine's own lifecycle instead — `document.addEventListener('alpine:init', () => Alpine.data('timerApp', timerApp))`, with `x-data="timerApp"` losing its parentheses in `timer.html`.
