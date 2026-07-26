# Phase 2: Defect Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the twelve defects in the gaps register without touching the schema, so the existing feature set works properly before Phase 3 redesigns the data model.

**Architecture:** Both pages currently reach into `localStorage` with raw `JSON.parse` from three separate places, which is how G1, G4 and G7 all came about. Task 1 puts a tested `core/storage.js` between the pages and the browser; the rest of the phase builds on it. Everything else is surgical: throttling two loops, replacing modal `alert()` with an inline banner, and one CSS block for dark mode.

**Tech Stack:** Unchanged from Phase 1 — vanilla ES modules, Alpine 3.13.3, `node:test`. No new dependencies.

## Global Constraints

- **Zero new dependencies.** Carried over from Phase 1.
- **No schema change.** `foods.json` keeps its three-tier `cookingTimes`, and the selection and schedule item shapes are unchanged. Phase 3 owns the schema.
- **Test command:** `npm test`, which runs `node --test "tests/**/*.test.js"`. The directory form is broken on Node 24.
- **Script order in `timer.html` is load-bearing.** `static/js/timer.js` must stay above the Alpine tag in `<head>`. See the Phase 1 plan's Self-Review for why.
- **All times remain integer seconds** from t=0.
- **Invariant:** `finishTime - startTime === duration` for every schedule item.
- **D5 (decided 2026-07-26):** Starting a new plan replaces a finished or never-started session silently, but must ask for confirmation when the existing session is `running` or `paused`.

## File Structure

| File | Responsibility |
| --- | --- |
| `static/js/core/storage.js` | *Create.* The only place that knows the two `localStorage` keys and their shapes. Takes a storage object as its first argument so it is testable without a browser. |
| `tests/core/storage.test.js` | *Create.* Unit tests against a fake storage. |
| `static/js/core/alerts.js` | *Create.* Alert generation and the missed-alert catch-up decision, as pure functions. Extracted here because G5 is a logic bug, and logic bugs belong somewhere testable. |
| `tests/core/alerts.test.js` | *Create.* Unit tests for generation, regeneration, and catch-up. |
| `static/js/planning.js` | *Modify.* Persist on change (G7), clear the session on Start Timer with a mid-cook confirm (G1), reject duplicates (G3), inline errors instead of `alert()` (G8). |
| `static/js/timer.js` | *Modify.* Reload from plan on reset (G4), throttle saves (G2) and ticks (G10), summarise missed alerts (G5), drop the missing icon (G6), request notification permission on gesture (G9), inline messages (G8), fix the null guard (G12). |
| `index.html` | *Modify.* Add the inline message region. |
| `timer.html` | *Modify.* Add the inline message region. |
| `static/css/styles.css` | *Modify.* Style the message region; add dark mode (G19); add the two missing rules found in the spec's §3.3. |

---

### Task 1: Storage boundary

**Files:**
- Create: `static/js/core/storage.js`
- Create: `tests/core/storage.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PLAN_KEY`, `SESSION_KEY` — the two `localStorage` key strings.
  - `readPlan(storage) => selections[]` — `[]` when absent or unparseable.
  - `writePlan(storage, selections) => void`
  - `readSession(storage) => session | null` — `null` when absent, unparseable, or missing a `status`.
  - `writeSession(storage, session) => void`
  - `clearSession(storage) => void`
  - `isSessionLive(session) => boolean` — true only for `running` or `paused`.

- [ ] **Step 1: Write the failing tests**

Create `tests/core/storage.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_KEY,
  SESSION_KEY,
  readPlan,
  writePlan,
  readSession,
  writeSession,
  clearSession,
  isSessionLive,
} from '../../static/js/core/storage.js';

/** Minimal stand-in for Window.localStorage. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    raw: () => data,
  };
}

const sel = (foodId, cookingTime) => ({
  foodId,
  foodName: foodId,
  doneness: 'medium',
  cookingTime,
});

test('readPlan returns an empty list when nothing is stored', () => {
  assert.deepEqual(readPlan(fakeStorage()), []);
});

test('readPlan returns an empty list rather than throwing on corrupt JSON', () => {
  const storage = fakeStorage({ [PLAN_KEY]: '{not json' });
  assert.deepEqual(readPlan(storage), []);
});

test('readPlan returns an empty list when selectedFoods is not an array', () => {
  const storage = fakeStorage({ [PLAN_KEY]: '{"selectedFoods":"nope"}' });
  assert.deepEqual(readPlan(storage), []);
});

test('writePlan then readPlan round-trips the selections', () => {
  const storage = fakeStorage();
  const selections = [sel('chicken', 1500), sel('kale', 360)];

  writePlan(storage, selections);

  assert.deepEqual(readPlan(storage), selections);
});

test('writePlan stores only the selections, not a dead items array', () => {
  const storage = fakeStorage();
  writePlan(storage, [sel('chicken', 1500)]);

  const stored = JSON.parse(storage.raw()[PLAN_KEY]);
  assert.deepEqual(Object.keys(stored), ['selectedFoods']);
});

test('readSession returns null when nothing is stored', () => {
  assert.equal(readSession(fakeStorage()), null);
});

test('readSession returns null rather than throwing on corrupt JSON', () => {
  const storage = fakeStorage({ [SESSION_KEY]: 'nonsense{' });
  assert.equal(readSession(storage), null);
});

test('readSession rejects an object with no status', () => {
  const storage = fakeStorage({ [SESSION_KEY]: '{"schedule":{}}' });
  assert.equal(readSession(storage), null);
});

test('writeSession then readSession round-trips', () => {
  const storage = fakeStorage();
  const session = { status: 'running', startedAt: '2026-01-01T00:00:00.000Z' };

  writeSession(storage, session);

  assert.deepEqual(readSession(storage), session);
});

test('clearSession removes the session but leaves the plan alone', () => {
  const storage = fakeStorage();
  writePlan(storage, [sel('chicken', 1500)]);
  writeSession(storage, { status: 'running' });

  clearSession(storage);

  assert.equal(readSession(storage), null);
  assert.deepEqual(readPlan(storage), [sel('chicken', 1500)]);
});

test('isSessionLive is true only mid-cook', () => {
  assert.equal(isSessionLive({ status: 'running' }), true);
  assert.equal(isSessionLive({ status: 'paused' }), true);
  assert.equal(isSessionLive({ status: 'created' }), false);
  assert.equal(isSessionLive({ status: 'completed' }), false);
  assert.equal(isSessionLive(null), false);
  assert.equal(isSessionLive(undefined), false);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`

Expected: FAIL with `Cannot find module .../static/js/core/storage.js`.

- [ ] **Step 3: Implement**

Create `static/js/core/storage.js`:

```js
/**
 * The only place that knows how this app uses localStorage.
 *
 * Every function takes the storage object as its first argument rather than
 * reaching for a global, so the logic is testable outside a browser and the
 * pages cannot quietly diverge on key names or shapes again.
 */

export const PLAN_KEY = 'cooking-schedule';
export const SESSION_KEY = 'cooking-timer-session';

function readJson(storage, key) {
    const raw = storage.getItem(key);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** The selections saved by the planning page. `[]` when absent or unusable. */
export function readPlan(storage) {
    const data = readJson(storage, PLAN_KEY);
    return data && Array.isArray(data.selectedFoods) ? data.selectedFoods : [];
}

/**
 * Save the planning page's selections.
 *
 * Deliberately stores only `selectedFoods`. The old code also wrote an `items`
 * array with every startTime forced to 0, which nothing ever read.
 */
export function writePlan(storage, selections) {
    storage.setItem(PLAN_KEY, JSON.stringify({ selectedFoods: selections }));
}

/** The saved timer session. `null` when absent, corrupt, or shapeless. */
export function readSession(storage) {
    const session = readJson(storage, SESSION_KEY);
    return session && typeof session.status === 'string' ? session : null;
}

export function writeSession(storage, session) {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(storage) {
    storage.removeItem(SESSION_KEY);
}

/** True when discarding this session would throw away a cook in progress. */
export function isSessionLive(session) {
    return session ? session.status === 'running' || session.status === 'paused' : false;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`

Expected: PASS, 35 tests total.

- [ ] **Step 5: Commit**

```bash
git add static/js/core/storage.js tests/core/storage.test.js
git commit -m "refactor: put a tested boundary in front of localStorage"
```

---

### Task 2: Alert generation and missed-alert catch-up (G5)

The bug: reopening a tab after the meal would have finished fires every outstanding alert in a single frame — a burst of `AudioContext` constructions, of which browsers allow about six before throwing, and a popup showing one arbitrary message.

**Files:**
- Create: `static/js/core/alerts.js`
- Create: `tests/core/alerts.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `generateAlerts(schedule) => alert[]` where an alert is `{ type, triggerTime, foodName, message, triggered }` and `type` is `'food-start'` or `'all-done'`.
  - `regenerateAlerts(schedule, existingAlerts, elapsedSeconds) => alert[]` — preserves the fired state of alerts that already fired.
  - `partitionDueAlerts(alerts, elapsedSeconds) => { due, missed }` — `due` is the at-most-one alert to announce normally; `missed` is every other newly-due alert, to be marked fired and summarised rather than announced individually.
  - `summariseMissed(missed) => string | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/alerts.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAlerts,
  regenerateAlerts,
  partitionDueAlerts,
  summariseMissed,
} from '../../static/js/core/alerts.js';

const schedule = {
  totalTime: 1500,
  items: [
    { foodId: 'chicken', foodName: 'Chicken', startTime: 0, finishTime: 1500, duration: 1500 },
    { foodId: 'kale', foodName: 'Kale', startTime: 1140, finishTime: 1500, duration: 360 },
  ],
};

test('generateAlerts emits one per dish plus a finale', () => {
  const alerts = generateAlerts(schedule);

  assert.equal(alerts.length, 3);
  assert.deepEqual(
    alerts.map((alert) => [alert.type, alert.triggerTime]),
    [
      ['food-start', 0],
      ['food-start', 1140],
      ['all-done', 1500],
    ],
  );
  assert.ok(alerts.every((alert) => alert.triggered === false));
});

test('generateAlerts names the dish in the message', () => {
  const alerts = generateAlerts(schedule);
  assert.equal(alerts[0].message, 'Time to start cooking Chicken!');
  assert.equal(alerts[2].message, 'All done! Your meal is ready!');
});

test('generateAlerts on an empty schedule emits only the finale', () => {
  const alerts = generateAlerts({ items: [], totalTime: 0 });
  assert.deepEqual(
    alerts.map((alert) => alert.type),
    ['all-done'],
  );
});

test('regenerateAlerts keeps a dish that already fired marked as fired', () => {
  const existing = generateAlerts(schedule);
  existing[0].triggered = true;

  const next = regenerateAlerts(schedule, existing, 600);

  const chicken = next.find((alert) => alert.foodName === 'Chicken');
  assert.equal(chicken.triggered, true);
});

test('regenerateAlerts marks a newly added dish as already fired if its start has passed', () => {
  const withRice = {
    totalTime: 3000,
    items: [
      ...schedule.items,
      { foodId: 'rice', foodName: 'Rice', startTime: 300, finishTime: 3000, duration: 2700 },
    ],
  };

  const next = regenerateAlerts(withRice, generateAlerts(schedule), 600);

  const rice = next.find((alert) => alert.foodName === 'Rice');
  assert.equal(rice.triggered, true);
});

test('regenerateAlerts leaves a still-future dish unfired', () => {
  const next = regenerateAlerts(schedule, generateAlerts(schedule), 600);
  const kale = next.find((alert) => alert.foodName === 'Kale');
  assert.equal(kale.triggered, false);
});

test('partitionDueAlerts announces a single due alert normally', () => {
  const alerts = generateAlerts(schedule);
  alerts[0].triggered = true;

  const { due, missed } = partitionDueAlerts(alerts, 1140);

  assert.equal(due.foodName, 'Kale');
  assert.deepEqual(missed, []);
});

test('partitionDueAlerts announces the last of a backlog and treats the rest as missed', () => {
  // Tab reopened long after the meal finished: all three are newly due at once.
  const { due, missed } = partitionDueAlerts(generateAlerts(schedule), 9000);

  assert.equal(due.type, 'all-done');
  assert.deepEqual(
    missed.map((alert) => alert.foodName),
    ['Chicken', 'Kale'],
  );
});

test('partitionDueAlerts returns nothing when no alert is due', () => {
  const { due, missed } = partitionDueAlerts(generateAlerts(schedule), -1);

  assert.equal(due, null);
  assert.deepEqual(missed, []);
});

test('partitionDueAlerts ignores alerts that already fired', () => {
  const alerts = generateAlerts(schedule);
  for (const alert of alerts) {
    alert.triggered = true;
  }

  const { due, missed } = partitionDueAlerts(alerts, 9000);

  assert.equal(due, null);
  assert.deepEqual(missed, []);
});

test('summariseMissed names the dishes it skipped', () => {
  const { missed } = partitionDueAlerts(generateAlerts(schedule), 9000);
  assert.equal(summariseMissed(missed), 'While you were away: Chicken, Kale');
});

test('summariseMissed returns null for an empty backlog', () => {
  assert.equal(summariseMissed([]), null);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`

Expected: FAIL with `Cannot find module .../static/js/core/alerts.js`.

- [ ] **Step 3: Implement**

Create `static/js/core/alerts.js`:

```js
/**
 * Alert generation and the missed-alert decision. Pure — no audio, no
 * notifications, no DOM. Announcing is the caller's job; deciding what is
 * worth announcing is this module's.
 */

/** One alert per dish start, plus a finale for the meal. */
export function generateAlerts(schedule) {
    const alerts = schedule.items.map((item) => ({
        type: 'food-start',
        triggerTime: item.startTime,
        foodName: item.foodName,
        message: `Time to start cooking ${item.foodName}!`,
        triggered: false,
    }));

    alerts.push({
        type: 'all-done',
        triggerTime: schedule.totalTime,
        foodName: '',
        message: 'All done! Your meal is ready!',
        triggered: false,
    });

    return alerts;
}

/**
 * Rebuild the alert list after the schedule changed, without re-announcing
 * anything that already fired.
 *
 * A dish absent from `existingAlerts` is new. It counts as already fired if its
 * start is in the past, so adding a dish mid-cook does not immediately shout.
 */
export function regenerateAlerts(schedule, existingAlerts, elapsedSeconds) {
    const existing = existingAlerts || [];

    const alerts = schedule.items.map((item) => {
        const previous = existing.find(
            (alert) => alert.type === 'food-start' && alert.foodName === item.foodName,
        );
        return {
            type: 'food-start',
            triggerTime: item.startTime,
            foodName: item.foodName,
            message: `Time to start cooking ${item.foodName}!`,
            triggered: previous ? previous.triggered : elapsedSeconds >= item.startTime,
        };
    });

    const previousFinale = existing.find((alert) => alert.type === 'all-done');
    alerts.push({
        type: 'all-done',
        triggerTime: schedule.totalTime,
        foodName: '',
        message: 'All done! Your meal is ready!',
        triggered: previousFinale ? previousFinale.triggered : false,
    });

    return alerts;
}

/**
 * Split the newly-due alerts into the one worth announcing and the backlog.
 *
 * Reopening a tab after the meal finished makes every remaining alert due in
 * the same frame. Announcing each one means a burst of beeps, a stack of
 * notifications collapsed into one by their shared tag, and a popup showing
 * whichever message happened to be last. Announcing only the most recent and
 * summarising the rest tells the user what they actually need to know.
 */
export function partitionDueAlerts(alerts, elapsedSeconds) {
    const newlyDue = alerts.filter(
        (alert) => !alert.triggered && elapsedSeconds >= alert.triggerTime,
    );

    if (newlyDue.length === 0) {
        return { due: null, missed: [] };
    }

    return {
        due: newlyDue[newlyDue.length - 1],
        missed: newlyDue.slice(0, -1),
    };
}

/** A one-line summary of the alerts that were passed without announcing. */
export function summariseMissed(missed) {
    if (!missed || missed.length === 0) {
        return null;
    }
    const names = missed
        .map((alert) => alert.foodName || 'the finish')
        .filter((name) => name.length > 0);
    return `While you were away: ${names.join(', ')}`;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`

Expected: PASS, 47 tests total.

- [ ] **Step 5: Commit**

```bash
git add static/js/core/alerts.js tests/core/alerts.test.js
git commit -m "refactor: extract alert logic, summarise missed alerts (G5)"
```

---

### Task 3: Planning page — persist on change, reject duplicates, clear the session (G1, G3, G7, G8)

**Files:**
- Modify: `static/js/planning.js`
- Modify: `index.html`
- Modify: `static/css/styles.css`

**Interfaces:**
- Consumes: `readPlan`, `writePlan`, `readSession`, `clearSession`, `isSessionLive` (Task 1).
- Produces: nothing for later tasks.

**Note on G3.** This rejects duplicates, matching what the timer page already enforces. Giving each row its own identity would be the better answer — two steaks at different doneness is a real thing to want — but that changes the schedule item shape, so it belongs in Phase 3 where the schema changes anyway. The roadmap records this.

- [ ] **Step 1: Add the imports**

In `static/js/planning.js`, extend the import block:

```js
import { calculateSchedule } from './core/schedule.js';
import { formatTime, formatMinutes } from './core/format.js';
import {
    readPlan,
    writePlan,
    readSession,
    clearSession,
    isSessionLive,
} from './core/storage.js';
```

- [ ] **Step 2: Add the message region to `index.html`**

Immediately after the opening `<main class="layout">` tag:

```html
            <div id="planning-message" class="inline-message" role="status" hidden></div>
```

- [ ] **Step 3: Add a message helper to `planning.js`**

Add near the top, after the module-level `let` declarations:

```js
// G8: inline messaging instead of blocking alert() dialogs.
function showMessage(text, tone = 'error') {
    const region = document.getElementById('planning-message');
    region.textContent = text;
    region.className = `inline-message inline-message--${tone}`;
    region.hidden = false;
}

function clearMessage() {
    const region = document.getElementById('planning-message');
    region.hidden = true;
    region.textContent = '';
}
```

- [ ] **Step 4: Replace the `alert()` in `loadFoods`**

```js
    } catch (error) {
        console.error('Failed to load foods:', error);
        showMessage('Could not load the food list. Check your connection and reload.');
    }
```

- [ ] **Step 5: Restore from the storage module**

Replace the body of `restoreFoodSelectors` down to its first `if`:

```js
function restoreFoodSelectors() {
    const savedFoods = readPlan(localStorage);

    if (savedFoods.length === 0) {
        addFoodSelector();
        return;
    }

    savedFoods.forEach(item => {
        addFoodSelector(item.foodId, item.doneness);
    });
    updateSchedule();
}
```

- [ ] **Step 6: Reject duplicates and persist on change (G3, G7)**

Replace `updateSchedule` with:

```js
function updateSchedule() {
    const foodItems = document.querySelectorAll('.food-item');
    const seen = new Set();
    const duplicates = new Set();
    selectedFoods = [];

    foodItems.forEach(item => {
        const foodId = item.querySelector('.food-select').value;
        const doneness = item.querySelector('.doneness-select').value;
        if (!foodId) {
            return;
        }

        const food = foods.find(f => f.id === foodId);
        if (!food) {
            return;
        }

        // G3: the timer identifies dishes by foodId, so two rows of the same
        // food would collide there and in Alpine's x-for keys.
        if (seen.has(foodId)) {
            duplicates.add(food.name);
            return;
        }
        seen.add(foodId);

        selectedFoods.push({
            foodId: foodId,
            foodName: food.name,
            doneness: doneness,
            cookingTime: food.cookingTimes[doneness]
        });
    });

    if (duplicates.size > 0) {
        showMessage(
            `Already on the menu: ${[...duplicates].join(', ')}. Remove the duplicate row.`,
        );
    } else {
        clearMessage();
    }

    // G7: persist on every change, not only when the timer starts.
    writePlan(localStorage, selectedFoods);

    if (selectedFoods.length > 0) {
        displaySchedule(calculateSchedule(selectedFoods));
    } else {
        document.getElementById('schedule-section').style.display = 'none';
    }
}
```

- [ ] **Step 7: Clear the session on Start Timer, confirming if mid-cook (G1, D5)**

Replace the `start-timer-btn` listener:

```js
document.getElementById('start-timer-btn').addEventListener('click', () => {
    // G1: the timer prefers a saved session over a saved plan, so a stale
    // session would silently mask this new plan. D5: replacing a finished or
    // unstarted session is silent; replacing a cook in progress is not.
    const session = readSession(localStorage);
    if (isSessionLive(session)) {
        const discard = window.confirm(
            'A cook is already in progress. Start this new plan and discard it?',
        );
        if (!discard) {
            return;
        }
    }

    writePlan(localStorage, selectedFoods);
    clearSession(localStorage);
    window.location.href = 'timer.html';
});
```

- [ ] **Step 8: Style the message region**

Append to `static/css/styles.css`:

```css
.inline-message {
    padding: 0.85rem 1.1rem;
    margin-bottom: 1.25rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-panel);
    box-shadow: var(--shadow-soft);
    font-weight: 500;
}

.inline-message[hidden] {
    display: none;
}

.inline-message--error {
    border-color: color-mix(in srgb, var(--color-danger) 45%, transparent);
    color: var(--color-danger);
}

.inline-message--notice {
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
    color: var(--color-primary-strong);
}
```

- [ ] **Step 9: Verify unit tests still pass**

Run: `npm test`

Expected: PASS, 47 tests.

- [ ] **Step 10: Verify in a browser**

Start `python3 -m http.server 8000`, then on `index.html`:

1. Select Chicken. Reload the page without pressing Start Timer — Chicken is still selected. *(G7 — this previously lost the selection.)*
2. Add a second row and select Chicken again — an inline message names the duplicate and no second Chicken appears in the schedule. No modal dialog. *(G3, G8)*
3. Change the second row to Kale — the message clears and the schedule shows both.
4. Press Start Timer, press Start Cooking, return to planning via "Back to Planning", change the menu, press Start Timer — a confirm appears; accepting shows the new plan on the timer. *(G1, D5 — this previously showed the stale schedule with no way to escape but Reset.)*
5. Repeat step 4 but let the cook finish first — Start Timer replaces it with no confirm. *(D5)*

- [ ] **Step 11: Commit**

```bash
git add static/js/planning.js index.html static/css/styles.css
git commit -m "fix: planning persists on change, rejects duplicates, clears stale sessions (G1, G3, G7, G8)"
```

---

### Task 4: Timer page — throttle the loops (G2, G10)

The bug pair: `updateTimer` runs per animation frame, so `elapsedSeconds % 5 === 0` is true for roughly sixty consecutive frames, serialising the whole session each time; and every visible countdown re-evaluates on every frame for a value that changes once a second.

**Files:**
- Modify: `static/js/timer.js`

**Interfaces:**
- Consumes: `writeSession` (Task 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the tracking fields**

In the state block of `timerApp()`, after `timerInterval: null,`:

```js
        lastTickSecond: null,
        lastSavedSecond: null,
```

- [ ] **Step 2: Throttle the tick to once per second (G10)**

Replace `updateTimer`:

```js
        updateTimer() {
            if (!this.startedAt) return;

            const elapsed = Math.floor((Date.now() - this.startedAt.getTime()) / 1000);

            // G10: the loop runs at refresh rate, but nothing here changes more
            // than once a second. Bailing early keeps Alpine from re-rendering
            // every countdown sixty times a second.
            if (elapsed === this.lastTickSecond) return;
            this.lastTickSecond = elapsed;

            this.elapsedSeconds = elapsed;
            this.remainingSeconds = Math.max(0, this.schedule.totalTime - elapsed);

            this.checkAlerts();

            if (elapsed >= this.schedule.totalTime) {
                this.complete();
            }

            // G2: save every five seconds, once. The old modulo test was true
            // for every frame of that whole second.
            if (elapsed % 5 === 0 && elapsed !== this.lastSavedSecond) {
                this.lastSavedSecond = elapsed;
                this.saveSession();
            }
        },
```

- [ ] **Step 3: Reset the trackers wherever the clock is re-based**

In `reset()`, alongside the other field resets:

```js
            this.lastTickSecond = null;
            this.lastSavedSecond = null;
```

In `resume()`, immediately after `this.startedAt = ...`:

```js
            this.lastTickSecond = null;
```

- [ ] **Step 4: Route saving through the storage module**

Replace `saveSession`:

```js
        saveSession() {
            writeSession(localStorage, {
                schedule: this.schedule,
                status: this.status,
                startedAt: this.startedAt ? this.startedAt.toISOString() : null,
                pausedElapsed: this.pausedElapsed,
                alerts: this.alerts,
                selectedFoods: this.selectedFoods,
            });
        },
```

- [ ] **Step 5: Verify the write rate empirically**

With the timer running, in the browser console:

```js
let writes = 0;
const real = localStorage.setItem.bind(localStorage);
localStorage.setItem = (...args) => { writes++; return real(...args); };
setTimeout(() => console.log('writes in 11s:', writes), 11000);
```

Expected: 2 or 3, not 120. Before this task the same probe reports well over a hundred.

- [ ] **Step 6: Commit**

```bash
git add static/js/timer.js
git commit -m "fix: throttle timer tick and session writes to once per second (G2, G10)"
```

---

### Task 5: Timer page — reset, alerts, notifications, guards (G4, G5, G6, G9, G12)

**Files:**
- Modify: `static/js/timer.js`
- Modify: `timer.html`

**Interfaces:**
- Consumes: `readPlan`, `writeSession`, `clearSession` (Task 1); `generateAlerts`, `regenerateAlerts`, `partitionDueAlerts`, `summariseMissed` (Task 2); `calculateSchedule` (Phase 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Extend the imports**

```js
import { calculateSchedule, recalculateSchedule } from './core/schedule.js';
import { formatTime as formatDuration } from './core/format.js';
import { readPlan, readSession, writeSession, clearSession } from './core/storage.js';
import {
    generateAlerts,
    regenerateAlerts,
    partitionDueAlerts,
    summariseMissed,
} from './core/alerts.js';
```

- [ ] **Step 2: Delete the component's alert builders**

Delete the `generateAlerts()` and `regenerateAlerts()` methods entirely. Replace their call sites:

- in `loadFromScheduleStorage`: `this.alerts = generateAlerts(this.schedule);`
- in `reset()`: `this.alerts = generateAlerts(this.schedule);`
- in `restoreSession`: `this.alerts = session.alerts || generateAlerts(this.schedule);`
- in `recalculateSchedulePreservingProgress`, replace `this.regenerateAlerts();` with:

```js
            this.alerts = regenerateAlerts(this.schedule, this.alerts, this.elapsedSeconds);
```

- [ ] **Step 3: Load the plan through the storage module, inline the error (G8)**

Replace `loadFromScheduleStorage`:

```js
        loadFromScheduleStorage() {
            const selections = readPlan(localStorage);
            if (selections.length === 0) {
                this.message = 'No cooking schedule found. Go back to planning to build one.';
                this.messageTone = 'error';
                return;
            }
            this.selectedFoods = selections;
            this.schedule = calculateSchedule(this.selectedFoods);
            this.alerts = generateAlerts(this.schedule);
            this.remainingSeconds = this.schedule.totalTime;
        },
```

- [ ] **Step 4: Add the message state and helpers (G8)**

In the state block:

```js
        message: '',
        messageTone: 'error',
```

As methods:

```js
        // G8: inline messaging instead of blocking alert() dialogs.
        notify(text, tone = 'error') {
            this.message = text;
            this.messageTone = tone;
        },

        dismissMessage() {
            this.message = '';
        },
```

Replace the five remaining `alert(...)` calls in `changeDoneness`, `addFood` and `removeFood` with `this.notify(...)` carrying the same wording.

- [ ] **Step 5: Render the message region in `timer.html`**

Immediately after the opening `<main class="layout layout--timer">` tag:

```html
            <div
                x-show="message"
                x-transition
                class="inline-message"
                :class="`inline-message--${messageTone}`"
                role="status"
            >
                <span x-text="message"></span>
                <button @click="dismissMessage()" class="btn btn-small">Dismiss</button>
            </div>
```

- [ ] **Step 6: Make Reset start over from the plan (G4)**

Replace `reset()`:

```js
        reset() {
            this.stopTimerLoop();
            this.status = 'created';
            this.startedAt = null;
            this.pausedElapsed = 0;
            this.elapsedSeconds = 0;
            this.currentAlert = null;
            this.alertActive = false;
            this.lastTickSecond = null;
            this.lastSavedSecond = null;
            this.dismissMessage();

            // G4: Reset means "start over from the plan I made". Previously it
            // kept whatever mid-cook edits were in memory, so Reset-then-Start
            // and Reset-then-reload gave different meals.
            clearSession(localStorage);
            this.loadFromScheduleStorage();
        },
```

- [ ] **Step 7: Announce one alert and summarise the backlog (G5)**

Replace `checkAlerts`:

```js
        checkAlerts() {
            const { due, missed } = partitionDueAlerts(this.alerts, this.elapsedSeconds);
            if (!due) return;

            // G5: mark the backlog fired without announcing each one. Reopening
            // a tab after the meal finished used to fire every alert in a single
            // frame, one AudioContext apiece.
            for (const alert of missed) {
                alert.triggered = true;
            }
            const summary = summariseMissed(missed);
            if (summary) {
                this.notify(summary, 'notice');
            }

            this.triggerAlert(due);
        },
```

- [ ] **Step 8: Drop the missing icon (G6)**

In `showNotification`, delete the `icon: 'static/images/timer-icon.png',` line. Phase 5 adds real icons with the PWA work; until then, referencing a 404 buys nothing.

- [ ] **Step 9: Ask for notification permission on a gesture, not on load (G9)**

Delete the permission request from `init()`. Add to `start()`, before `this.startTimerLoop()`:

```js
            // G9: browsers penalise permission prompts not tied to a gesture.
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
```

- [ ] **Step 10: Fix the last-dish guard (G12)**

Replace the tail of `removeFood` from the `if (this.selectedFoods.length === 0)` block:

```js
            if (this.selectedFoods.length === 0) {
                // Put it back: an empty schedule has nothing to count down to.
                this.selectedFoods = [removed];
                this.notify('That is the only dish left. Use Reset to start over.');
                return;
            }
```

…where `removed` is captured before the filter:

```js
        removeFood(foodId) {
            const scheduleItem = this.schedule.items.find(item => item.foodId === foodId);
            if (scheduleItem && !this.isWaiting(scheduleItem)) {
                this.notify('That dish has already started cooking, so it cannot be removed.');
                return;
            }

            const removed = this.selectedFoods.find(food => food.foodId === foodId);
            if (!removed) return;

            this.selectedFoods = this.selectedFoods.filter(food => food.foodId !== foodId);
            // ... guard above, then:
            this.recalculateSchedulePreservingProgress();
        },
```

This removes the old code's reliance on `scheduleItem.doneness` in a branch it had already null-checked, and restores the exact selection rather than rebuilding it from schedule fields.

- [ ] **Step 11: Verify unit tests still pass**

Run: `npm test`

Expected: PASS, 47 tests.

- [ ] **Step 12: Verify in a browser**

1. Plan Chicken + Kale, start, add Brown Rice, then press Reset — the schedule returns to Chicken + Kale, not the three-dish edit. Reload and confirm it still reads Chicken + Kale. *(G4)*
2. Try to remove the only remaining dish — an inline message appears, no modal, and the dish stays. *(G8, G12)*
3. Start a cook, close the tab, reopen after the total time has passed — one beep, one popup for the finale, and a notice reading "While you were away: Chicken, Kale". *(G5)*
4. Load `timer.html` in a fresh profile with no plan — an inline message points back to planning instead of a modal. *(G8)*
5. Confirm no notification prompt appears on load, and that it appears on "Start Cooking". *(G9)*

- [ ] **Step 13: Commit**

```bash
git add static/js/timer.js timer.html
git commit -m "fix: reset reloads the plan, missed alerts summarised, inline errors (G4, G5, G6, G8, G9, G12)"
```

---

### Task 6: Dark mode and the two unstyled classes (G19)

**Files:**
- Modify: `static/css/styles.css`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Widen the colour scheme and add the dark palette**

Change `color-scheme: light;` in `:root` to `color-scheme: light dark;`, then append:

```css
@media (prefers-color-scheme: dark) {
    :root {
        --color-ink: #f2f3f5;
        --color-muted: #a3abb8;
        --color-primary: #ff8163;
        --color-primary-strong: #ff9a80;
        --color-success: #3ecf8e;
        --color-warning: #f7b955;
        --color-danger: #ff6369;
        --color-border: rgba(226, 232, 240, 0.16);
        --color-panel: rgba(24, 26, 32, 0.92);
        --color-panel-strong: #1c1f26;
        --shadow-card: 0 24px 60px -40px rgba(0, 0, 0, 0.9);
        --shadow-soft: 0 12px 30px -24px rgba(0, 0, 0, 0.85);
    }

    body {
        background:
            radial-gradient(1100px circle at 12% -10%, rgba(255, 129, 99, 0.18), transparent 52%),
            radial-gradient(900px circle at 90% 0%, rgba(62, 207, 142, 0.14), transparent 48%),
            linear-gradient(180deg, #12141a 0%, #14161d 45%, #11141b 100%);
    }
}
```

- [ ] **Step 2: Add the two rules the spec found missing**

`app-header--timer` and `time-elapsed` are referenced by `timer.html` and have no rule. Give them real jobs rather than deleting the hooks:

```css
.app-header--timer {
    margin-bottom: clamp(1rem, 2.5vw, 2rem);
}

.time-elapsed {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--color-muted);
}
```

- [ ] **Step 3: Verify in a browser**

Toggle the OS or browser dark-mode setting and reload both pages. Confirm text stays legible against the panels, the countdown remains the highest-contrast element on the timer, and the inline message region is readable in both schemes.

- [ ] **Step 4: Commit**

```bash
git add static/css/styles.css
git commit -m "feat: dark mode, and style the two orphaned classes (G19)"
```

---

### Task 7: Close out the phase

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-cooking-times-design.md`
- Modify: `docs/superpowers/plans/2026-07-26-cooking-times-roadmap.md`

- [ ] **Step 1: Mark G1–G10, G12 and G19 closed in the spec**

Append *Closed in Phase 2* to each, naming the fix in a clause.

- [ ] **Step 2: Record the G3 decision in the roadmap**

Add to Phase 3's entry: duplicates are rejected in Phase 2 as a stopgap; per-row item identity is the real fix and lands with the Phase 3 schema change.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: mark Phase 2 gaps closed"
```

---

## Self-Review

**Spec coverage.** G1 (Task 3), G2 (Task 4), G3 (Task 3), G4 (Task 5), G5 (Tasks 2 and 5), G6 (Task 5), G7 (Task 3), G8 (Tasks 3 and 5), G9 (Task 5), G10 (Task 4), G12 (Task 5), G19 (Task 6). That is the twelve the roadmap assigns to Phase 2. G11 and G20 closed in Phase 1; G13–G18 and G21–G26 remain assigned to Phases 3–5.

**Placeholder scan.** No TBD/TODO. Every code step carries real code; every verification step names the observation that decides pass or fail. Task 4 Step 5 and Task 5 Step 12 verify behaviour that unit tests cannot reach, so they specify the probe rather than gesturing at "check it works".

**Type consistency.** `readPlan`/`writePlan`/`readSession`/`writeSession`/`clearSession`/`isSessionLive` keep their names and their storage-first parameter order across Tasks 1, 3, 4 and 5. `generateAlerts(schedule)`, `regenerateAlerts(schedule, existingAlerts, elapsedSeconds)`, `partitionDueAlerts(alerts, elapsedSeconds)` and `summariseMissed(missed)` match between Task 2 and Task 5. The alert shape `{ type, triggerTime, foodName, message, triggered }` is unchanged from the current code, so saved sessions from before this phase still restore. `notify(text, tone)` and `dismissMessage()` are defined in Task 5 Step 4 and used in Steps 3, 6, 7, 10 and in the `timer.html` markup. The `inline-message--${tone}` class names match the CSS added in Task 3 Step 8, where `tone` is `'error'` or `'notice'`.

**Risk.** Task 5 Step 6 makes Reset re-read `localStorage`, so Reset now depends on the plan still being there. `writePlan` runs on every planning change (Task 3 Step 6), so it will be — but a user who clears site data mid-session and then presses Reset gets the empty-plan message rather than a silent failure, which is the intended degradation.
