# Phase 3: Data Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the forced three-tier doneness model with per-food cooking options, give each row on the menu its own identity, and open the closed catalogue.

**Architecture:** `foods.json` gains an `options` array per food, sized to whatever axis is honest for that food — three for a steak, one for rice, two for pasta. A new `core/foods.js` owns every question about the catalogue so neither page reaches into the raw JSON. Selections and schedule items gain an `itemId`, which is what finally lets two portions of the same food coexist. User-defined foods live in `localStorage` alongside the bundled catalogue and are merged at load.

**Tech Stack:** Unchanged — vanilla ES modules, Alpine 3.13.3, `node:test`. No new dependencies.

## Global Constraints

- **Zero new dependencies.**
- **No migration required.** Decided with the user on 2026-07-26: the tool has no users yet, so `localStorage` shapes and `foods.json` may change freely with no compatibility shim. Do not write migration code.
- **Test command:** `npm test`. The directory form of `node --test` is broken on Node 24.
- **Script order in `timer.html` is load-bearing.** `static/js/timer.js` must stay above the Alpine tag in `<head>`.
- **All times remain integer seconds** from t=0.
- **Invariant:** `finishTime - startTime === duration` for every schedule item.
- **D1:** per-food cooking option sets replace `cookingTimes`.
- **D6 (decided 2026-07-26):** each menu row carries its own `itemId`. Duplicate foods are allowed again; identity is never `foodId`.

## Deviation from the roadmap, and why

The roadmap said Phase 3 would ship "quantity and method as time modifiers" for G23. It ships a **per-dish time override** instead, remembered per food-and-option.

G23's complaint is that cooking time ignores quantity, thickness, method and starting temperature. Modelling those properly means a thermal model; modelling them improperly means inventing coefficients and presenting fiction as arithmetic, which is worse than the honest gap. An override lets the user correct the number for their pan, their oven and their cut, and remembers it — which is also the concrete thing G24 asked for ("save that my roast chicken takes 90 minutes, not 35").

This closes G24 and **partly** closes G23: the app still does not *know* about thickness or method. It stops pretending its numbers are authoritative and lets you fix them. The spec entry is annotated accordingly rather than marked closed.

## The new food schema

```json
{
  "id": "beef-steak",
  "name": "Beef Steak",
  "category": "Meat",
  "defaultOptionId": "medium",
  "options": [
    { "id": "rare",      "label": "Rare",      "seconds": 360 },
    { "id": "medium",    "label": "Medium",    "seconds": 480 },
    { "id": "well-done", "label": "Well done", "seconds": 600 }
  ]
}
```

**Where the numbers come from.** Every duration is taken from the existing `cookingTimes`, never invented. Foods keeping three options keep all three numbers. Foods collapsing to one option take the old `medium` value. Foods collapsing to two take the two old values matching the surviving labels. This keeps the data as grounded as it was — the times were always approximate, and the override in Task 3 is the real answer to that.

**Which axis each food gets.** The point of D1 is that the axis differs:

| Group | Axis | Foods |
| --- | --- | --- |
| Red meat, duck, tuna | Rare / Medium / Well done — genuine doneness | `beef-steak`, `lamb-chop`, `duck-breast`, `tuna-steak`, `salmon` |
| Pork | Medium / Well done — no rare | `pork-chop` |
| Poultry | Cooked through — one option, because rare chicken is not a choice | `chicken`, `turkey-breast` |
| White fish, shellfish | One option — it flakes or sears, or it is overcooked | `cod-fillet`, `shrimp`, `scallops` |
| Pasta | Al dente / Soft | `pasta-penne` |
| Other grains | Cooked — one option | `rice`, `brown-rice`, `quinoa`, `couscous` |
| Quick vegetables | Crisp-tender / Tender / Soft | `carrots`, `kale`, `broccoli`, `green-beans`, `asparagus`, `cauliflower`, `brussels-sprouts`, `zucchini`, `bell-peppers` |
| Root vegetables | Tender / Very soft — crisp-tender raw potato is not a dish | `potatoes`, `sweet-potatoes` |
| Eggplant | Tender / Very soft — spongy when underdone | `eggplant` |
| Mushrooms | Browned / Well browned | `mushrooms` |
| Tofu | Soft / Crisp | `tofu` |

Thirty foods; option counts of one, two and three all present, which is precisely what G22 said the old schema could not express.

## New shapes

```
Selection:      { itemId, foodId, foodName, optionId, optionLabel, cookingTime, overridden }
Schedule item:  { itemId, foodId, foodName, optionLabel, startTime, duration, finishTime }
Alert:          { type, triggerTime, itemId, foodName, message, triggered }
```

`doneness` is gone everywhere. `itemId` replaces `foodId` as identity in the scheduler, the timer and the alerts.

## File Structure

| File | Responsibility |
| --- | --- |
| `static/foods.json` | *Rewrite.* All 30 foods on the new schema. |
| `static/js/core/foods.js` | *Create.* Every question about the catalogue: lookup, defaults, resolving a selection, grouping for the picker, merging user-defined foods. |
| `tests/core/foods.test.js` | *Create.* Includes a guard that walks the real `foods.json` and asserts the whole file is well-formed. |
| `static/js/core/schedule.js` | *Modify.* Identity becomes `itemId`; `doneness` becomes `optionLabel`. |
| `tests/core/schedule.test.js` | *Modify.* Same rename, plus new duplicate-food cases. |
| `static/js/core/alerts.js` | *Modify.* Match on `itemId`, not `foodName`. |
| `tests/core/alerts.test.js` | *Modify.* Same, plus a duplicate-name case that the old matching got wrong. |
| `static/js/core/storage.js` | *Modify.* Add custom-food read/write. |
| `tests/core/storage.test.js` | *Modify.* Cover it. |
| `static/js/planning.js` | *Modify.* Per-food option dropdowns, row identity, duplicates allowed, override control. |
| `static/js/timer.js` | *Modify.* Identity by `itemId`, option labels, override-aware add-food. |
| `index.html`, `timer.html` | *Modify.* Markup for the option and override controls. |
| `static/css/styles.css` | *Modify.* Style the override control and the custom-food form. |

---

### Task 1: The catalogue and its accessors (G21, G22)

**Files:**
- Create: `static/js/core/foods.js`
- Create: `tests/core/foods.test.js`
- Rewrite: `static/foods.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `findFood(catalogue, foodId) => food | null`
  - `findOption(food, optionId) => option | null`
  - `defaultOption(food) => option` — the one named by `defaultOptionId`, falling back to the first.
  - `resolveSelection(catalogue, { itemId, foodId, optionId, overrideSeconds }) => selection | null` — resolves names and duration; `overrideSeconds`, when a positive number, wins over the option's `seconds` and sets `overridden: true`.
  - `groupByCategory(catalogue) => [{ category, foods }]` — categories alphabetical, foods alphabetical within.
  - `catalogueProblems(catalogue) => string[]` — empty when well-formed.

- [ ] **Step 1: Write the failing tests**

Create `tests/core/foods.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findFood,
  findOption,
  defaultOption,
  resolveSelection,
  groupByCategory,
  catalogueProblems,
} from '../../static/js/core/foods.js';

const catalogue = [
  {
    id: 'beef-steak',
    name: 'Beef Steak',
    category: 'Meat',
    defaultOptionId: 'medium',
    options: [
      { id: 'rare', label: 'Rare', seconds: 360 },
      { id: 'medium', label: 'Medium', seconds: 480 },
      { id: 'well-done', label: 'Well done', seconds: 600 },
    ],
  },
  {
    id: 'rice',
    name: 'Rice',
    category: 'Grains',
    defaultOptionId: 'cooked',
    options: [{ id: 'cooked', label: 'Cooked', seconds: 1200 }],
  },
];

test('findFood locates by id and returns null when absent', () => {
  assert.equal(findFood(catalogue, 'rice').name, 'Rice');
  assert.equal(findFood(catalogue, 'nope'), null);
  assert.equal(findFood(null, 'rice'), null);
});

test('findOption locates by id within a food', () => {
  const steak = findFood(catalogue, 'beef-steak');
  assert.equal(findOption(steak, 'rare').seconds, 360);
  assert.equal(findOption(steak, 'nope'), null);
});

test('defaultOption honours defaultOptionId', () => {
  assert.equal(defaultOption(findFood(catalogue, 'beef-steak')).id, 'medium');
});

test('defaultOption falls back to the first option', () => {
  const food = { id: 'x', name: 'X', category: 'Other', options: [{ id: 'a', label: 'A', seconds: 60 }] };
  assert.equal(defaultOption(food).id, 'a');
});

test('a food with one option still resolves', () => {
  const selection = resolveSelection(catalogue, { itemId: 'i1', foodId: 'rice', optionId: 'cooked' });

  assert.deepEqual(selection, {
    itemId: 'i1',
    foodId: 'rice',
    foodName: 'Rice',
    optionId: 'cooked',
    optionLabel: 'Cooked',
    cookingTime: 1200,
    overridden: false,
  });
});

test('resolveSelection falls back to the default option when the id is unknown', () => {
  const selection = resolveSelection(catalogue, { itemId: 'i1', foodId: 'beef-steak', optionId: 'bogus' });
  assert.equal(selection.optionId, 'medium');
  assert.equal(selection.cookingTime, 480);
});

test('resolveSelection returns null for an unknown food', () => {
  assert.equal(resolveSelection(catalogue, { itemId: 'i1', foodId: 'nope' }), null);
});

test('an override beats the option duration and is flagged', () => {
  const selection = resolveSelection(catalogue, {
    itemId: 'i1',
    foodId: 'beef-steak',
    optionId: 'rare',
    overrideSeconds: 900,
  });

  assert.equal(selection.cookingTime, 900);
  assert.equal(selection.overridden, true);
});

test('a zero or negative override is ignored', () => {
  for (const bad of [0, -5, Number.NaN, null, undefined, 'abc']) {
    const selection = resolveSelection(catalogue, {
      itemId: 'i1',
      foodId: 'beef-steak',
      optionId: 'rare',
      overrideSeconds: bad,
    });
    assert.equal(selection.cookingTime, 360, `override ${bad} should be ignored`);
    assert.equal(selection.overridden, false);
  }
});

test('groupByCategory sorts categories and foods alphabetically', () => {
  const groups = groupByCategory(catalogue);

  assert.deepEqual(
    groups.map((group) => group.category),
    ['Grains', 'Meat'],
  );
  assert.deepEqual(groups[1].foods.map((food) => food.name), ['Beef Steak']);
});

test('groupByCategory files a food with no category under Other', () => {
  const groups = groupByCategory([{ id: 'x', name: 'X', options: [] }]);
  assert.equal(groups[0].category, 'Other');
});

test('catalogueProblems accepts a well-formed catalogue', () => {
  assert.deepEqual(catalogueProblems(catalogue), []);
});

test('catalogueProblems reports every kind of malformation', () => {
  const problems = catalogueProblems([
    { id: 'a', name: 'A', category: 'Meat', options: [] },
    { id: 'a', name: 'Dup', category: 'Meat', options: [{ id: 'o', label: 'O', seconds: 1 }] },
    { id: 'b', name: 'B', category: 'Meat', options: [{ id: 'o', label: 'O', seconds: 0 }] },
    { id: 'c', name: 'C', category: 'Meat', defaultOptionId: 'missing', options: [{ id: 'o', label: 'O', seconds: 1 }] },
  ]);

  assert.ok(problems.some((problem) => problem.includes('no options')));
  assert.ok(problems.some((problem) => problem.includes('duplicate food id')));
  assert.ok(problems.some((problem) => problem.includes('non-positive')));
  assert.ok(problems.some((problem) => problem.includes('defaultOptionId')));
});

test('the shipped foods.json is well-formed', () => {
  const raw = readFileSync(new URL('../../static/foods.json', import.meta.url), 'utf8');
  const parsed = JSON.parse(raw);

  assert.deepEqual(catalogueProblems(parsed.foods), []);
  assert.equal(parsed.foods.length, 30);
});

test('the shipped catalogue exercises one, two and three option foods', () => {
  const raw = readFileSync(new URL('../../static/foods.json', import.meta.url), 'utf8');
  const counts = new Set(JSON.parse(raw).foods.map((food) => food.options.length));

  // G22 was that every food was forced to have exactly three tiers.
  assert.deepEqual([...counts].sort(), [1, 2, 3]);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`

Expected: FAIL with `Cannot find module .../static/js/core/foods.js`.

- [ ] **Step 3: Implement `core/foods.js`**

```js
/**
 * Everything the app knows about the food catalogue. Pure — no DOM, no fetch.
 *
 * A food declares its own cooking options, because the honest axis differs by
 * food: a steak has a doneness, rice does not, pasta has two states worth
 * naming. Option counts of one, two and three are all normal.
 *
 * Food:      { id, name, category, defaultOptionId, options: [ { id, label, seconds } ] }
 * Selection: { itemId, foodId, foodName, optionId, optionLabel, cookingTime, overridden }
 */

export function findFood(catalogue, foodId) {
    if (!catalogue) {
        return null;
    }
    return catalogue.find((food) => food.id === foodId) || null;
}

export function findOption(food, optionId) {
    if (!food || !food.options) {
        return null;
    }
    return food.options.find((option) => option.id === optionId) || null;
}

/** The option named by `defaultOptionId`, or the first one declared. */
export function defaultOption(food) {
    return findOption(food, food.defaultOptionId) || food.options[0];
}

function usableOverride(value) {
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Turn a stored row into a selection the scheduler can use.
 *
 * An unknown option falls back to the food's default rather than failing, so a
 * renamed option in the catalogue degrades instead of breaking a saved plan.
 */
export function resolveSelection(catalogue, row) {
    const food = findFood(catalogue, row.foodId);
    if (!food) {
        return null;
    }

    const option = findOption(food, row.optionId) || defaultOption(food);
    const override = usableOverride(row.overrideSeconds);

    return {
        itemId: row.itemId,
        foodId: food.id,
        foodName: food.name,
        optionId: option.id,
        optionLabel: option.label,
        cookingTime: override === null ? option.seconds : override,
        overridden: override !== null,
    };
}

/** The picker's structure: categories alphabetical, foods alphabetical within. */
export function groupByCategory(catalogue) {
    const groups = new Map();

    for (const food of catalogue || []) {
        const category = food.category || 'Other';
        if (!groups.has(category)) {
            groups.set(category, []);
        }
        groups.get(category).push(food);
    }

    return [...groups.keys()]
        .sort()
        .map((category) => ({
            category,
            foods: groups.get(category).sort((a, b) => a.name.localeCompare(b.name)),
        }));
}

/**
 * Structural problems with a catalogue, as human-readable strings. Empty means
 * well-formed. A test runs this against the shipped foods.json, so a typo in
 * the data fails the build rather than the kitchen.
 */
export function catalogueProblems(catalogue) {
    const problems = [];
    const seenFoodIds = new Set();

    for (const food of catalogue || []) {
        const where = food.id || food.name || '(unnamed)';

        if (seenFoodIds.has(food.id)) {
            problems.push(`duplicate food id: ${where}`);
        }
        seenFoodIds.add(food.id);

        if (!food.options || food.options.length === 0) {
            problems.push(`${where}: no options`);
            continue;
        }

        const seenOptionIds = new Set();
        for (const option of food.options) {
            if (seenOptionIds.has(option.id)) {
                problems.push(`${where}: duplicate option id ${option.id}`);
            }
            seenOptionIds.add(option.id);

            if (!option.label) {
                problems.push(`${where}: option ${option.id} has no label`);
            }
            if (!Number.isInteger(option.seconds) || option.seconds <= 0) {
                problems.push(`${where}: option ${option.id} has a non-positive duration`);
            }
        }

        if (food.defaultOptionId && !seenOptionIds.has(food.defaultOptionId)) {
            problems.push(`${where}: defaultOptionId ${food.defaultOptionId} is not one of its options`);
        }
    }

    return problems;
}
```

- [ ] **Step 4: Rewrite `static/foods.json`**

Use the axis table above. Every `seconds` value comes from the corresponding old `cookingTimes` entry. Full file content is generated in execution; the two catalogue tests in Step 1 are the acceptance check — they assert 30 foods, no structural problems, and that option counts of 1, 2 and 3 all occur.

- [ ] **Step 5: Run and watch it pass**

Run: `npm test`

Expected: PASS, 61 tests total.

- [ ] **Step 6: Commit**

```bash
git add static/js/core/foods.js tests/core/foods.test.js static/foods.json
git commit -m "feat: per-food cooking options replace forced three-tier doneness (G21, G22)"
```

---

### Task 2: Identity by itemId (G3 properly, D6)

**Files:**
- Modify: `static/js/core/schedule.js`, `tests/core/schedule.test.js`
- Modify: `static/js/core/alerts.js`, `tests/core/alerts.test.js`

**Interfaces:**
- Consumes: the shapes from Task 1.
- Produces: `calculateSchedule` and `recalculateSchedule` keyed on `itemId`, carrying `optionLabel` instead of `doneness`; `generateAlerts`/`regenerateAlerts` carrying and matching on `itemId`.

- [ ] **Step 1: Update the schedule tests to the new shape and add duplicate cases**

In `tests/core/schedule.test.js`, change the helper and add two tests:

```js
/** Build a selection. Each row has its own itemId — two rows may share a food. */
let nextItemId = 0;
const sel = (foodId, cookingTime, optionLabel = 'Medium') => ({
  itemId: `i${nextItemId++}`,
  foodId,
  foodName: foodId,
  optionId: optionLabel.toLowerCase().replace(/ /g, '-'),
  optionLabel,
  cookingTime,
});
```

Replace every `doneness` assertion with `optionLabel`, and every `foodId`-keyed lookup in `recalculateSchedule` cases with `itemId`. Then add:

```js
test('two portions of the same food are scheduled independently', () => {
  const rare = { ...sel('beef-steak', 360, 'Rare') };
  const well = { ...sel('beef-steak', 600, 'Well done') };

  const result = calculateSchedule([rare, well]);

  assert.equal(result.totalTime, 600);
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((item) => [item.itemId, item.startTime]),
    [
      [well.itemId, 0],
      [rare.itemId, 240],
    ],
  );
});

test('recalculateSchedule distinguishes two portions of the same food', () => {
  const rare = { ...sel('beef-steak', 360, 'Rare') };
  const well = { ...sel('beef-steak', 600, 'Well done') };
  const current = calculateSchedule([rare, well]).items;

  // At 300s the well-done steak has started; the rare one has not.
  const after = recalculateSchedule([rare, well], current, 300);

  const wellAfter = after.items.find((item) => item.itemId === well.itemId);
  const rareAfter = after.items.find((item) => item.itemId === rare.itemId);
  assert.equal(wellAfter.startTime, 0);
  assert.equal(rareAfter.startTime, 240);
  assert.equal(after.totalTime, 600);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`

Expected: FAIL — the new tests fail on `itemId` being undefined in the returned items.

- [ ] **Step 3: Rekey `core/schedule.js`**

In both `calculateSchedule` and `recalculateSchedule`, replace `doneness: selection.doneness` with `optionLabel: selection.optionLabel` and add `itemId: selection.itemId` as the first field of every item. In `recalculateSchedule`, change the lookup:

```js
        const inForce = current.find((item) => item.itemId === selection.itemId);
```

Update the module docstring's shape comments to the new shapes.

- [ ] **Step 4: Update the alert tests for itemId, and add the case the old code got wrong**

In `tests/core/alerts.test.js`, add `itemId` to the fixture items, assert alerts carry it, and add:

```js
test('regenerateAlerts distinguishes two dishes with the same name', () => {
  const twoSteaks = {
    totalTime: 600,
    items: [
      { itemId: 'a', foodId: 'beef-steak', foodName: 'Beef Steak', optionLabel: 'Well done', startTime: 0, finishTime: 600, duration: 600 },
      { itemId: 'b', foodId: 'beef-steak', foodName: 'Beef Steak', optionLabel: 'Rare', startTime: 240, finishTime: 600, duration: 360 },
    ],
  };
  const existing = generateAlerts(twoSteaks);
  existing.find((alert) => alert.itemId === 'a').triggered = true;

  const next = regenerateAlerts(twoSteaks, existing, 300);

  // Matching on foodName would have marked both fired, silencing the rare one.
  assert.equal(next.find((alert) => alert.itemId === 'a').triggered, true);
  assert.equal(next.find((alert) => alert.itemId === 'b').triggered, true);
  assert.equal(next.filter((alert) => alert.type === 'food-start').length, 2);
});
```

- [ ] **Step 5: Rekey `core/alerts.js`**

Add `itemId: item.itemId` to generated alerts, and change the regeneration lookup:

```js
        const previous = existing.find(
            (alert) => alert.type === 'food-start' && alert.itemId === item.itemId,
        );
```

- [ ] **Step 6: Run and watch it pass**

Run: `npm test`

Expected: PASS, all tests including the two duplicate cases.

- [ ] **Step 7: Commit**

```bash
git add static/js/core tests/core
git commit -m "refactor: identity by itemId so duplicate dishes work (G3, D6)"
```

---

### Task 3: Wire both pages to the new model, allow duplicates, add overrides and custom foods (G23 partly, G24)

**Files:**
- Modify: `static/js/core/storage.js`, `tests/core/storage.test.js`
- Modify: `static/js/planning.js`, `index.html`
- Modify: `static/js/timer.js`, `timer.html`
- Modify: `static/css/styles.css`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: `readCustomFoods(storage)`, `writeCustomFoods(storage, foods)`, `readOverrides(storage)`, `writeOverride(storage, foodId, optionId, seconds)`.

- [ ] **Step 1: Add custom foods and overrides to storage, with tests**

Append to `tests/core/storage.test.js`:

```js
test('custom foods round-trip and default to empty', () => {
  const storage = fakeStorage();
  assert.deepEqual(readCustomFoods(storage), []);

  const mine = [{
    id: 'custom-roast', name: 'My Roast', category: 'Meat',
    defaultOptionId: 'done', options: [{ id: 'done', label: 'Done', seconds: 5400 }],
  }];
  writeCustomFoods(storage, mine);

  assert.deepEqual(readCustomFoods(storage), mine);
});

test('custom foods survive corrupt storage', () => {
  assert.deepEqual(readCustomFoods(fakeStorage({ 'cooking-custom-foods': '{{' })), []);
});

test('an override is remembered per food and option', () => {
  const storage = fakeStorage();
  assert.deepEqual(readOverrides(storage), {});

  writeOverride(storage, 'chicken', 'cooked-through', 5400);

  assert.equal(readOverrides(storage)['chicken:cooked-through'], 5400);
});

test('writing a null override forgets it', () => {
  const storage = fakeStorage();
  writeOverride(storage, 'chicken', 'cooked-through', 5400);
  writeOverride(storage, 'chicken', 'cooked-through', null);

  assert.deepEqual(readOverrides(storage), {});
});
```

Then implement in `core/storage.js`:

```js
export const CUSTOM_FOODS_KEY = 'cooking-custom-foods';
export const OVERRIDES_KEY = 'cooking-time-overrides';

/** Foods the user added themselves. Merged with the bundled catalogue at load. */
export function readCustomFoods(storage) {
    const data = readJson(storage, CUSTOM_FOODS_KEY);
    return Array.isArray(data) ? data : [];
}

export function writeCustomFoods(storage, foods) {
    storage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
}

/**
 * Remembered time corrections, keyed `foodId:optionId`.
 *
 * The bundled durations are approximations that ignore quantity, thickness and
 * method. Rather than pretend otherwise, the app lets you correct a dish and
 * remembers the correction for next time.
 */
export function readOverrides(storage) {
    const data = readJson(storage, OVERRIDES_KEY);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

export function writeOverride(storage, foodId, optionId, seconds) {
    const overrides = readOverrides(storage);
    const key = `${foodId}:${optionId}`;
    if (seconds === null || seconds === undefined) {
        delete overrides[key];
    } else {
        overrides[key] = seconds;
    }
    storage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}
```

Add the four new names to the test file's import block.

- [ ] **Step 2: Run and watch the storage tests pass**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Rework the planning page**

In `static/js/planning.js`:

- Import `groupByCategory`, `resolveSelection`, `defaultOption`, `findFood` from `./core/foods.js`, and the four new storage functions.
- Merge catalogues after fetch: `foods = [...bundled, ...readCustomFoods(localStorage)]`.
- Give each row an `itemId`: replace `foodCounter` with a counter that produces `row-0`, `row-1`, … and set it as `div.dataset.itemId`.
- Build the food dropdown from `groupByCategory(foods)`.
- Replace the fixed doneness `<select>` with one rebuilt from the chosen food's `options` on every food change. A food with a single option still renders the select, showing that one label, so the row reads consistently.
- Add a time field per row showing the resolved minutes, editable, with a "reset" affordance when overridden. On change, call `writeOverride(localStorage, foodId, optionId, seconds)`.
- **Delete the duplicate rejection added in Phase 2**, including the `seen`/`duplicates` sets and the `Already on the menu` message. Rows are independent now.
- Build selections with `resolveSelection(foods, { itemId, foodId, optionId, overrideSeconds })`, dropping any that resolve to `null`.
- Add a small "Add your own food" form writing through `writeCustomFoods`.

- [ ] **Step 4: Rework the timer page**

In `static/js/timer.js`:

- Merge custom foods into `availableFoods` the same way.
- Replace every `f.foodId === foodId` lookup in `changeDoneness`, `addFood` and `removeFood` with `itemId`. Rename `changeDoneness` to `changeOption` and have it take `(itemId, optionId)`.
- Delete the duplicate rejection in `addFood` — duplicates are legal now.
- Generate an `itemId` for foods added mid-cook.
- In `timer.html`, change `:key="item.foodId"` to `:key="item.itemId"`, render `item.optionLabel`, and build the per-row option select from the food's own options.

- [ ] **Step 5: Style the new controls**

Append rules for `.time-override`, `.time-override--active` and `.custom-food-form`, reusing the existing custom properties so dark mode is inherited rather than restated.

- [ ] **Step 6: Verify unit tests still pass**

Run: `npm test`

- [ ] **Step 7: Verify in a browser**

1. Pick Beef Steak — three options: Rare, Medium, Well done. *(G21)*
2. Pick Rice — one option, "Cooked". Pick Pasta (Penne) — two, "Al dente" and "Soft". *(G22)*
3. Pick Chicken — one option, "Cooked through". There is no "Rare" for poultry. *(G21)*
4. Add two Beef Steak rows, one Rare and one Well done — both appear in the schedule with distinct start times, and no duplicate warning. *(G3, D6)*
5. Start the timer with both steaks — each has its own countdown, and the rare one's alert fires separately from the well-done one's. *(G3)*
6. Override Chicken to 90 minutes, reload — the override is remembered. *(G23, G24)*
7. Add a custom food, reload — it is still in the picker. *(G24)*

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: per-food options in the UI, duplicate dishes, time overrides, custom foods (G3, G23, G24)"
```

---

### Task 4: Close out the phase

- [ ] **Step 1:** Annotate G21, G22 and G24 as closed in the spec; annotate G23 as *partly* closed, stating plainly that the app still has no model of thickness or method and now lets the user correct the number instead.
- [ ] **Step 2:** Update the spec's §1.2 domain objects and §1.3 shapes to the new schema, since Sections 1–3 are meant to describe what exists.
- [ ] **Step 3:** Mark Phase 3 done in the roadmap; record that the duplicate-rejection debt from Phase 2 is repaid.
- [ ] **Step 4:** Commit.

---

## Self-Review

**Spec coverage.** G21 and G22 in Task 1; G3's real fix in Task 2 and its UI half in Task 3; G24 in Task 3; G23 partly in Task 3, with the shortfall stated rather than papered over. G13–G18 and G25, G26 remain with Phases 4 and 5.

**Placeholder scan.** Task 1 Step 4 is the one step that does not inline its artefact — 30 JSON entries would triple the plan's length and the axis table plus two catalogue tests specify it completely, including the count and the option-arity requirement. Every other code step carries real code.

**Type consistency.** `resolveSelection` returns exactly the Selection shape declared in New Shapes, and that shape is what `calculateSchedule` consumes in Task 2. `itemId` is the identity in the scheduler, the alerts, the Alpine keys and the DOM dataset — no path still keys on `foodId`. `optionLabel` replaces `doneness` in every item literal and every assertion. Override keys are `foodId:optionId` in both `writeOverride` and `readOverrides`.

**Risk.** Task 3 is large — it touches both pages, both markup files and the stylesheet at once. It is one task because the schema change makes the pages non-functional until they are both updated, so splitting it would mean committing a broken app. If it needs to be broken up during execution, the seam is planning page first, then timer page, accepting one intermediate commit where the timer is stale.
