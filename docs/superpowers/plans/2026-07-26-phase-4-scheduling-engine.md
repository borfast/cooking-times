# Phase 4: Scheduling Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the schedule executable in a real kitchen: model resting, model the cook's finite attention and hob space, and stop assuming infinite parallelism.

**Architecture:** Resting splits a dish's timeline in two — time on the heat, then time off it — which is what makes capacity modelling meaningful, since a resting joint occupies no burner. A new `core/capacity.js` detects two kinds of conflict (too many dishes on heat at once, and two starts too close together) and offers three resolution strategies. The scheduler itself stays pure; the pages supply the constraints and render the conflicts.

**Tech Stack:** Unchanged — vanilla ES modules, Alpine 3.13.3, `node:test`. No new dependencies.

## Correction to D2

D2 recorded `extend` as "push the finish later to respect capacity". That is not achievable, and the decision is restated here.

When every dish finishes at a common time `T`, dish *i* occupies the heat over `[T − rest_i − cook_i, T − rest_i]`. Increasing `T` translates every interval right by the same amount, so the overlap pattern is invariant under `T`. **A capacity conflict cannot be resolved by moving the common finish.** Any resolution must break the synchronised finish.

The three strategies, restated:

| Strategy | Mechanism | Total time | What gives |
| --- | --- | --- | --- |
| `warn` (default) | Schedule untouched; conflicts reported | unchanged | nothing — you resolve it |
| `stagger` | Conflicting dishes are moved **earlier**, finishing before the meal and keeping warm | unchanged | the food waits |
| `extend` | Conflicting dishes are moved **later**, ready after the nominal finish | grows | you wait |

Both non-`warn` strategies desynchronise the finish; they differ only in direction. This was put to the user on 2026-07-26 and they confirmed proceeding.

## Global Constraints

- **Zero new dependencies.**
- **No migrations** (D7). Data and storage shapes may change freely.
- **Test command:** `npm test`. The directory form of `node --test` is broken on Node 24.
- **Script order in `timer.html` is load-bearing.** `static/js/timer.js` stays above the Alpine tag.
- **All times remain integer seconds** from t=0.
- **The greedy placers are heuristics, not optimal.** Minimising deviation from a common finish under a concurrency cap is a bin-packing problem. Both strategies use a documented greedy pass, and the plan says so rather than implying optimality.
- **D4:** rest is declared per food, not per option.

## Shape change

A dish now has two phases. `duration` is replaced:

```
Schedule item: {
  itemId, foodId, foodName, optionLabel,
  startTime,      // goes on the heat
  cookDuration,   // time on the heat
  heatOffTime,    // comes off the heat  = startTime + cookDuration
  restSeconds,    // time resting off the heat (0 for most foods)
  finishTime,     // ready to serve      = heatOffTime + restSeconds
}
```

Invariants, to hold for every item returned by every function:

- `heatOffTime - startTime === cookDuration`
- `finishTime - heatOffTime === restSeconds`

Capacity is measured over `[startTime, heatOffTime)` only. **A resting dish occupies no burner** — that is the whole reason to model resting separately rather than folding it into the cook time.

## Rest values

Rest is new data, not derivable from the old file, so unlike Phase 3's durations these numbers are chosen rather than sourced. They follow standard practice for the cuts involved, and only meat gets a rest:

| Food | Rest |
| --- | --- |
| `beef-steak`, `lamb-chop`, `duck-breast`, `pork-chop` | 5 min |
| `chicken` | 10 min |
| `turkey-breast` | 15 min |
| everything else | none |

Fish, vegetables, grains and tofu get no rest, which is correct — nobody rests broccoli.

## File Structure

| File | Responsibility |
| --- | --- |
| `static/js/core/capacity.js` | *Create.* Conflict detection and the three strategies. Pure. |
| `tests/core/capacity.test.js` | *Create.* |
| `static/js/core/schedule.js` | *Modify.* Rest-aware two-phase items. |
| `tests/core/schedule.test.js` | *Modify.* |
| `static/foods.json` | *Modify.* Add `restSeconds` to the six meats. |
| `static/js/core/foods.js` | *Modify.* Carry `restSeconds` into the selection. |
| `tests/core/foods.test.js` | *Modify.* |
| `static/js/core/storage.js` | *Modify.* Kitchen settings: capacity, transition, strategy. |
| `tests/core/storage.test.js` | *Modify.* |
| `static/js/planning.js`, `index.html` | *Modify.* Settings controls and conflict display. |
| `static/js/timer.js`, `timer.html` | *Modify.* A `resting` state between cooking and done. |
| `static/css/styles.css` | *Modify.* Conflict panel, settings row, resting state. |

---

### Task 1: Resting (G25, D4)

**Files:**
- Modify: `static/js/core/schedule.js`, `tests/core/schedule.test.js`
- Modify: `static/js/core/foods.js`, `tests/core/foods.test.js`
- Modify: `static/foods.json`

**Interfaces:**
- `resolveSelection` gains `restSeconds` in its returned selection, read from the food.
- `calculateSchedule` and `recalculateSchedule` return the two-phase item shape above. `totalTime = max(cookDuration + restSeconds)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/schedule.test.js`:

```js
const restingSel = (foodId, cookingTime, restSeconds, optionLabel = 'Medium') => ({
  ...sel(foodId, cookingTime, optionLabel),
  restSeconds,
});

test('a resting dish comes off the heat before it is ready', () => {
  const result = calculateSchedule([restingSel('beef-steak', 480, 300)]);

  assert.equal(result.totalTime, 780);
  assert.deepEqual(result.items[0], {
    itemId: result.items[0].itemId,
    foodId: 'beef-steak',
    foodName: 'beef-steak',
    optionLabel: 'Medium',
    startTime: 0,
    cookDuration: 480,
    heatOffTime: 480,
    restSeconds: 300,
    finishTime: 780,
  });
});

test('resting counts towards the total, so a resting dish goes on first', () => {
  // Steak cooks for 8 min then rests 5 = 13 min to ready.
  // Broccoli cooks 5 min, no rest. Both ready at 13 min.
  const result = calculateSchedule([
    restingSel('beef-steak', 480, 300),
    restingSel('broccoli', 300, 0),
  ]);

  assert.equal(result.totalTime, 780);

  const steak = result.items.find((item) => item.foodId === 'beef-steak');
  const broccoli = result.items.find((item) => item.foodId === 'broccoli');

  assert.equal(steak.startTime, 0);
  assert.equal(steak.heatOffTime, 480);
  assert.equal(broccoli.startTime, 480);
  assert.equal(broccoli.heatOffTime, 780);
  // The steak is off the heat before the broccoli goes on — they never compete.
  assert.ok(steak.heatOffTime <= broccoli.startTime);
});

test('every item satisfies both phase invariants', () => {
  const result = calculateSchedule([
    restingSel('beef-steak', 480, 300),
    restingSel('chicken', 1500, 600),
    restingSel('kale', 360, 0),
  ]);

  for (const item of result.items) {
    assert.equal(item.heatOffTime - item.startTime, item.cookDuration);
    assert.equal(item.finishTime - item.heatOffTime, item.restSeconds);
    assert.equal(item.finishTime, result.totalTime);
  }
});

test('a missing restSeconds is treated as no rest', () => {
  const result = calculateSchedule([sel('kale', 360)]);
  assert.equal(result.items[0].restSeconds, 0);
  assert.equal(result.items[0].heatOffTime, result.items[0].finishTime);
});

test('recalculateSchedule preserves a started dish rest and both invariants', () => {
  const original = [restingSel('beef-steak', 480, 300), restingSel('kale', 360, 0)];
  const current = calculateSchedule(original).items;

  const after = recalculateSchedule([...original, restingSel('rice', 1200, 0)], current, 200);

  const steak = after.items.find((item) => item.foodId === 'beef-steak');
  assert.equal(steak.restSeconds, 300);
  for (const item of after.items) {
    assert.equal(item.heatOffTime - item.startTime, item.cookDuration);
    assert.equal(item.finishTime - item.heatOffTime, item.restSeconds);
  }
});
```

Replace every remaining `duration` assertion in that file with `cookDuration`, and the whole-item `deepEqual`s with the two-phase shape.

Append to `tests/core/foods.test.js`:

```js
test('resolveSelection carries the food rest, defaulting to zero', () => {
  const withRest = [{
    id: 'beef-steak', name: 'Beef Steak', category: 'Meat', restSeconds: 300,
    defaultOptionId: 'medium',
    options: [{ id: 'medium', label: 'Medium', seconds: 480 }],
  }];

  assert.equal(resolveSelection(withRest, { itemId: 'i1', foodId: 'beef-steak' }).restSeconds, 300);
  assert.equal(resolveSelection(catalogue, { itemId: 'i1', foodId: 'rice' }).restSeconds, 0);
});

test('the shipped catalogue rests meat and nothing else', () => {
  const raw = readFileSync(new URL('../../static/foods.json', import.meta.url), 'utf8');
  const foods = JSON.parse(raw).foods;

  const resting = foods.filter((food) => food.restSeconds > 0).map((food) => food.id).sort();
  assert.deepEqual(resting, [
    'beef-steak', 'chicken', 'duck-breast', 'lamb-chop', 'pork-chop', 'turkey-breast',
  ]);
  for (const food of foods.filter((f) => f.category !== 'Meat')) {
    assert.ok(!food.restSeconds, `${food.id} should not rest`);
  }
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` — expect failures on `cookDuration`/`heatOffTime`/`restSeconds` being undefined.

- [ ] **Step 3: Add rest to the catalogue**

Add `"restSeconds": 300` to `beef-steak`, `lamb-chop`, `duck-breast`, `pork-chop`; `600` to `chicken`; `900` to `turkey-breast`. Place it after `category`.

- [ ] **Step 4: Carry it through `resolveSelection`**

In `static/js/core/foods.js`, add to the returned selection:

```js
        restSeconds: Number.isInteger(food.restSeconds) && food.restSeconds > 0
            ? food.restSeconds
            : 0,
```

- [ ] **Step 5: Make the scheduler two-phase**

In `calculateSchedule`:

```js
    const readyTime = (selection) => selection.cookingTime + (selection.restSeconds || 0);
    const totalTime = Math.max(...selections.map(readyTime));

    const items = selections.map((selection) => {
        const rest = selection.restSeconds || 0;
        const heatOffTime = totalTime - rest;
        return {
            itemId: selection.itemId,
            foodId: selection.foodId,
            foodName: selection.foodName,
            optionLabel: selection.optionLabel,
            startTime: heatOffTime - selection.cookingTime,
            cookDuration: selection.cookingTime,
            heatOffTime,
            restSeconds: rest,
            finishTime: totalTime,
        };
    });
```

In `recalculateSchedule`, apply the same two-phase construction to the waiting dishes, and for started dishes preserve `startTime`, `heatOffTime`, `restSeconds` and `finishTime` from the item in force, deriving `cookDuration = heatOffTime - startTime`. Use `elapsedSeconds + max(readyTime)` where it previously used `elapsedSeconds + max(cookingTime)`.

Update the module docstring's shape block and invariant list.

- [ ] **Step 6: Run and watch it pass**

Run: `npm test`

- [ ] **Step 7: Commit**

```bash
git add static/js/core static/foods.json tests/core
git commit -m "feat: model resting as a second phase off the heat (G25, D4)"
```

---

### Task 2: Conflict detection (G13 warn, G14)

**Files:**
- Create: `static/js/core/capacity.js`
- Create: `tests/core/capacity.test.js`

**Interfaces:**
- `KITCHEN_DEFAULTS = { capacity: 4, transitionSeconds: 0, strategy: 'warn' }`
- `concurrencyProfile(items) => [{ from, to, count, itemIds }]` — the concurrency over time, as maximal constant-count segments, counting only `[startTime, heatOffTime)`.
- `findConflicts(items, { capacity, transitionSeconds }) => { overCapacity, tightStarts, worstConcurrency }`
  - `overCapacity`: segments where `count > capacity`
  - `tightStarts`: pairs of items whose starts are closer than `transitionSeconds`
  - `worstConcurrency`: the peak count
- `describeConflicts(conflicts, items) => string[]` — human-readable lines.

- [ ] **Step 1: Write the failing tests**

Create `tests/core/capacity.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KITCHEN_DEFAULTS,
  concurrencyProfile,
  findConflicts,
  describeConflicts,
} from '../../static/js/core/capacity.js';

/** A schedule item on the heat from `start` for `cook`, then resting. */
const item = (itemId, start, cook, rest = 0) => ({
  itemId,
  foodId: itemId,
  foodName: itemId,
  optionLabel: 'Medium',
  startTime: start,
  cookDuration: cook,
  heatOffTime: start + cook,
  restSeconds: rest,
  finishTime: start + cook + rest,
});

test('the defaults are a four-ring hob with no transition time and no rescheduling', () => {
  assert.deepEqual(KITCHEN_DEFAULTS, { capacity: 4, transitionSeconds: 0, strategy: 'warn' });
});

test('concurrencyProfile is empty for no items', () => {
  assert.deepEqual(concurrencyProfile([]), []);
});

test('concurrencyProfile reports a single dish as one segment', () => {
  assert.deepEqual(concurrencyProfile([item('a', 0, 600)]), [
    { from: 0, to: 600, count: 1, itemIds: ['a'] },
  ]);
});

test('concurrencyProfile splits where dishes overlap', () => {
  const profile = concurrencyProfile([item('a', 0, 600), item('b', 300, 600)]);

  assert.deepEqual(profile, [
    { from: 0, to: 300, count: 1, itemIds: ['a'] },
    { from: 300, to: 600, count: 2, itemIds: ['a', 'b'] },
    { from: 600, to: 900, count: 1, itemIds: ['b'] },
  ]);
});

test('a resting dish does not occupy the heat', () => {
  // On the heat 0-300, resting 300-900. Another dish starting at 400 does not
  // conflict, because the first one is off the burner by then.
  const profile = concurrencyProfile([item('a', 0, 300, 600), item('b', 400, 300)]);

  assert.equal(Math.max(...profile.map((segment) => segment.count)), 1);
});

test('back-to-back dishes never overlap', () => {
  const profile = concurrencyProfile([item('a', 0, 300), item('b', 300, 300)]);
  assert.equal(Math.max(...profile.map((segment) => segment.count)), 1);
});

test('findConflicts is quiet when everything fits', () => {
  const conflicts = findConflicts([item('a', 0, 600), item('b', 300, 600)], {
    capacity: 4,
    transitionSeconds: 0,
  });

  assert.deepEqual(conflicts.overCapacity, []);
  assert.deepEqual(conflicts.tightStarts, []);
  assert.equal(conflicts.worstConcurrency, 2);
});

test('findConflicts reports the window that exceeds capacity', () => {
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 300, 300)];

  const conflicts = findConflicts(items, { capacity: 2, transitionSeconds: 0 });

  assert.equal(conflicts.worstConcurrency, 3);
  assert.equal(conflicts.overCapacity.length, 1);
  assert.deepEqual(
    { from: conflicts.overCapacity[0].from, to: conflicts.overCapacity[0].to },
    { from: 300, to: 600 },
  );
  assert.deepEqual(conflicts.overCapacity[0].itemIds, ['a', 'b', 'c']);
});

test('findConflicts reports starts closer together than the transition time', () => {
  const items = [item('a', 0, 600), item('b', 20, 600)];

  const conflicts = findConflicts(items, { capacity: 4, transitionSeconds: 60 });

  assert.equal(conflicts.tightStarts.length, 1);
  assert.deepEqual(conflicts.tightStarts[0].itemIds, ['a', 'b']);
  assert.equal(conflicts.tightStarts[0].gap, 20);
});

test('simultaneous starts are the tightest possible', () => {
  const conflicts = findConflicts([item('a', 0, 600), item('b', 0, 300)], {
    capacity: 4,
    transitionSeconds: 30,
  });

  assert.equal(conflicts.tightStarts[0].gap, 0);
});

test('a zero transition time never reports tight starts', () => {
  const conflicts = findConflicts([item('a', 0, 600), item('b', 0, 300)], {
    capacity: 4,
    transitionSeconds: 0,
  });

  assert.deepEqual(conflicts.tightStarts, []);
});

test('describeConflicts names the dishes and the clock time', () => {
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 300, 300)];
  const conflicts = findConflicts(items, { capacity: 2, transitionSeconds: 0 });

  const lines = describeConflicts(conflicts, items);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /3 dishes on the heat at 5:00/);
  assert.match(lines[0], /a, b, c/);
});

test('describeConflicts says nothing when there is nothing to say', () => {
  const items = [item('a', 0, 600)];
  assert.deepEqual(describeConflicts(findConflicts(items, KITCHEN_DEFAULTS), items), []);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` — `Cannot find module .../core/capacity.js`.

- [ ] **Step 3: Implement detection**

Create `static/js/core/capacity.js` with `KITCHEN_DEFAULTS`, `concurrencyProfile`, `findConflicts`, `describeConflicts`. `concurrencyProfile` sweeps the sorted set of distinct `startTime`/`heatOffTime` boundaries and emits one segment per gap where at least one dish is on the heat, each carrying the ids on the heat over that gap. `findConflicts` filters for `count > capacity`, merges adjacent offending segments, and pairwise-compares starts for gaps below `transitionSeconds` (skipping the check entirely when it is zero).

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Commit**

```bash
git add static/js/core/capacity.js tests/core/capacity.test.js
git commit -m "feat: detect capacity and transition-time conflicts (G13, G14)"
```

---

### Task 3: The two resolution strategies (G13)

**Files:**
- Modify: `static/js/core/capacity.js`, `tests/core/capacity.test.js`

**Interfaces:**
- `applyStrategy(items, settings) => { items, totalTime, conflicts, strategy, moved }`
  - `warn` returns the items untouched with the conflicts attached.
  - `stagger` moves conflicting dishes **earlier**; `totalTime` is unchanged; moved dishes finish before it.
  - `extend` moves conflicting dishes **later**; `totalTime` grows to the latest finish.
  - `moved` lists `{ itemId, fromStart, toStart, finishesEarlyBy | finishesLateBy }`.

Both placers are greedy: dishes are placed longest-first, each taking the nearest feasible start in the strategy's direction, where feasible means the concurrency cap holds across its whole cook window and no already-placed start is within `transitionSeconds`. This is a heuristic — optimal placement is bin-packing — and it is documented as such in the module.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/capacity.test.js`:

```js
const settings = (over) => ({ ...KITCHEN_DEFAULTS, ...over });

test('warn leaves the schedule completely alone', () => {
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 0, 900)];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'warn' }));

  assert.deepEqual(result.items, items);
  assert.equal(result.totalTime, 900);
  assert.equal(result.conflicts.worstConcurrency, 3);
  assert.deepEqual(result.moved, []);
});

test('stagger moves a conflicting dish earlier and it finishes early', () => {
  // Three dishes all wanting the heat over 0-900 on a two-ring hob.
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 0, 900)];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'stagger' }));

  assert.deepEqual(result.conflicts.overCapacity, []);
  assert.equal(result.totalTime, 900);
  assert.equal(result.moved.length, 1);
  assert.ok(result.moved[0].toStart < result.moved[0].fromStart);
  assert.ok(result.moved[0].finishesEarlyBy > 0);
  for (const moved of result.items) {
    assert.ok(moved.finishTime <= 900);
  }
});

test('extend moves a conflicting dish later and the meal takes longer', () => {
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 0, 900)];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'extend' }));

  assert.deepEqual(result.conflicts.overCapacity, []);
  assert.ok(result.totalTime > 900);
  assert.equal(result.moved.length, 1);
  assert.ok(result.moved[0].toStart > result.moved[0].fromStart);
  assert.ok(result.moved[0].finishesLateBy > 0);
});

test('neither strategy touches a schedule that already fits', () => {
  const items = [item('a', 0, 600), item('b', 300, 600)];

  for (const strategy of ['stagger', 'extend']) {
    const result = applyStrategy(items, settings({ capacity: 4, strategy }));
    assert.deepEqual(result.items, items, strategy);
    assert.deepEqual(result.moved, [], strategy);
  }
});

test('both strategies preserve the two phase invariants', () => {
  const items = [item('a', 0, 900, 300), item('b', 0, 900), item('c', 0, 600)];

  for (const strategy of ['stagger', 'extend']) {
    const result = applyStrategy(items, settings({ capacity: 2, strategy }));
    for (const moved of result.items) {
      assert.equal(moved.heatOffTime - moved.startTime, moved.cookDuration, strategy);
      assert.equal(moved.finishTime - moved.heatOffTime, moved.restSeconds, strategy);
    }
  }
});

test('both strategies resolve the conflict they were asked to resolve', () => {
  const items = Array.from({ length: 6 }, (_, index) => item(`d${index}`, 0, 600));

  for (const strategy of ['stagger', 'extend']) {
    const result = applyStrategy(items, settings({ capacity: 2, strategy }));
    const peak = Math.max(...concurrencyProfile(result.items).map((s) => s.count));
    assert.ok(peak <= 2, `${strategy} left a peak of ${peak}`);
  }
});

test('stagger respects the transition time between starts', () => {
  const items = Array.from({ length: 4 }, (_, index) => item(`d${index}`, 0, 600));

  const result = applyStrategy(items, settings({
    capacity: 4, transitionSeconds: 120, strategy: 'stagger',
  }));

  const starts = result.items.map((moved) => moved.startTime).sort((a, b) => a - b);
  for (let index = 1; index < starts.length; index += 1) {
    assert.ok(starts[index] - starts[index - 1] >= 120, `starts too close: ${starts}`);
  }
});

test('an unknown strategy behaves like warn rather than throwing', () => {
  const items = [item('a', 0, 900), item('b', 0, 900)];
  const result = applyStrategy(items, settings({ capacity: 1, strategy: 'nonsense' }));

  assert.deepEqual(result.items, items);
  assert.deepEqual(result.moved, []);
});
```

Extend the import block with `applyStrategy`.

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement the placers**

Add `applyStrategy` plus a shared greedy placer taking a direction (`-1` earlier for stagger, `+1` later for extend). Place dishes longest-cook-first; for each, walk candidate starts from its ideal start in the given direction over the set of boundary times already in play, taking the first that is feasible. Recompute `heatOffTime` and `finishTime` from the new start, keeping `cookDuration` and `restSeconds` fixed so the invariants hold by construction.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Commit**

```bash
git add static/js/core/capacity.js tests/core/capacity.test.js
git commit -m "feat: stagger and extend strategies for capacity conflicts (G13)"
```

---

### Task 4: Kitchen settings and the planning UI (G13, G14)

**Files:**
- Modify: `static/js/core/storage.js`, `tests/core/storage.test.js`
- Modify: `static/js/planning.js`, `index.html`, `static/css/styles.css`

**Interfaces:**
- `readKitchen(storage) => { capacity, transitionSeconds, strategy }`, falling back to `KITCHEN_DEFAULTS` field by field so a partial or corrupt record still yields a usable object.
- `writeKitchen(storage, kitchen) => void`

- [ ] **Step 1: Storage, with tests**

Cover: defaults when absent; defaults when corrupt; per-field fallback when partial; round-trip; rejection of a nonsense capacity (non-integer or `< 1`) back to the default.

- [ ] **Step 2: Settings controls in `index.html`**

A row inside the planning panel: a number input for "Rings/pans available" (1–12), a number input for "Changeover time" in minutes (0–15), and a select for what to do about conflicts, with `warn` selected. Label the strategy options in the user's terms rather than the internal names:

- `warn` → "Just warn me"
- `stagger` → "Start things early and keep them warm"
- `extend` → "Push the finish back"

- [ ] **Step 3: Wire the planning page**

Apply `applyStrategy` to the result of `calculateSchedule` before display. Render `describeConflicts` lines into a conflict panel, and mark moved dishes in the schedule list with how early or late they now land. Persist settings on change and re-render.

- [ ] **Step 4: Style it**

`.kitchen-settings`, `.conflict-panel`, `.schedule-item--moved`, reusing existing custom properties so dark mode is inherited.

- [ ] **Step 5: Verify in a browser**

1. Six quick vegetables with capacity 4 and `warn` — a conflict panel names the overlap window and the dishes; the schedule is unchanged. *(G13)*
2. Switch to "Start things early" — the conflict clears, total time is unchanged, and moved dishes are marked as finishing early. *(G13 stagger)*
3. Switch to "Push the finish back" — the conflict clears and the total time grows. *(G13 extend)*
4. Set changeover to 2 minutes with several same-length dishes — tight-start conflicts are reported, and the non-warn strategies space the starts at least 2 minutes apart. *(G14)*
5. Reload — settings persist.
6. Plan a steak: the schedule shows it coming off the heat before the meal is ready. *(G25)*

- [ ] **Step 6: Commit**

---

### Task 5: The resting state on the timer (G25)

**Files:**
- Modify: `static/js/timer.js`, `timer.html`, `static/css/styles.css`

- [ ] **Step 1: Add the state**

`isResting(item)` is true when `elapsed >= heatOffTime && elapsed < finishTime`. `isCooking` becomes `elapsed >= startTime && elapsed < heatOffTime`. `isDone` stays `elapsed >= finishTime`.

- [ ] **Step 2: Add the alert**

A dish with a rest gains a second alert at `heatOffTime`: "Take the Beef Steak off the heat to rest." Generated in `core/alerts.js` only for items with `restSeconds > 0`, typed `food-rest`. Extend `tests/core/alerts.test.js` to cover that a resting dish produces two alerts and a non-resting dish one.

- [ ] **Step 3: Render it**

A `resting` row class and a "Resting, ready in M:SS" label. Editing stays barred once a dish has started, which already covers resting.

- [ ] **Step 4: Verify in a browser** — a steak moves cooking → resting → done, and the off-the-heat alert fires at the right moment.

- [ ] **Step 5: Commit**

---

### Task 6: Close out

- [ ] Annotate G13, G14, G25 in the spec, recording the D2 correction and that the placers are greedy heuristics.
- [ ] Update §1.3 of the spec: the synchronised finish is now conditional, and the two-phase item shape is current.
- [ ] Mark Phase 4 done in the roadmap; restate D2 there.
- [ ] Commit.

---

## Self-Review

**Spec coverage.** G25 in Tasks 1 and 5; G13 in Tasks 2–4; G14 in Tasks 2–4. G15–G18 and G26 remain for Phase 5.

**Placeholder scan.** Tasks 1–3 carry full test code and either full implementations or precise algorithmic specifications for the two placers. Tasks 4 and 5 specify markup, behaviour and acceptance checks without inlining every DOM line, because they are wiring over logic already pinned by Tasks 1–3 — the browser checks in Task 4 Step 5 are the acceptance gate.

**Type consistency.** The two-phase item shape is identical in the Shape Change section, Task 1's tests, Task 2's `item()` helper and Task 3's assertions. `KITCHEN_DEFAULTS` field names (`capacity`, `transitionSeconds`, `strategy`) match `readKitchen`, `findConflicts` and `applyStrategy` throughout. `moved` entries use `finishesEarlyBy` for stagger and `finishesLateBy` for extend, as asserted in Task 3.

**Risk.** The greedy placers can fail to find any feasible start for a dish when capacity is very tight — six dishes on one ring, say. The implementation must fall back to the ideal start and leave the conflict reported rather than looping forever or throwing; Task 3's "resolve the conflict they were asked to resolve" test uses capacity 2 with 6 dishes, which is satisfiable, so a separate test for the unsatisfiable case belongs in Task 3 and is added during execution if the fallback path is reachable.
