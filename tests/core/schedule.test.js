import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSchedule, recalculateSchedule } from '../../static/js/core/schedule.js';

/** Build a selection. Each row gets its own itemId, so two rows may share a food. */
let nextItemId = 0;
const sel = (foodId, cookingTime, optionLabel = 'Medium') => ({
  itemId: `i${nextItemId++}`,
  foodId,
  foodName: foodId,
  optionId: optionLabel.toLowerCase().replace(/ /g, '-'),
  optionLabel,
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
      itemId: result.items[0].itemId,
      foodId: 'kale',
      foodName: 'kale',
      optionLabel: 'Medium',
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

test('the option label is carried through untouched', () => {
  const result = calculateSchedule([sel('beef-steak', 360, 'Rare')]);
  assert.equal(result.items[0].optionLabel, 'Rare');
});

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

  const after = recalculateSchedule([...original, sel('carrots', 600)], current, 600);

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

  const after = recalculateSchedule([...original, sel('brown-rice', 2700)], current, 600);

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

  const after = recalculateSchedule([original[0]], current, 600);

  assert.equal(after.totalTime, 1500);
  assert.deepEqual(after.items, [
    {
      itemId: after.items[0].itemId,
      foodId: 'chicken',
      foodName: 'chicken',
      optionLabel: 'Medium',
      startTime: 0,
      duration: 1500,
      finishTime: 1500,
    },
  ]);
});

test('shortening a waiting dish never pulls the finish earlier than a started dish', () => {
  const original = [sel('chicken', 1500), sel('kale', 360)];
  const current = inProgress(original);

  // Kale switched from Tender (360) to Crisp-tender (180) while still waiting.
  const after = recalculateSchedule(
    [original[0], { ...original[1], cookingTime: 180, optionLabel: 'Crisp-tender' }],
    current,
    600,
  );

  assert.equal(after.totalTime, 1500);
  const kale = after.items.find((item) => item.foodId === 'kale');
  assert.equal(kale.startTime, 1320);
  assert.equal(kale.optionLabel, 'Crisp-tender');
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
        (existing) => existing.itemId === item.itemId && elapsed >= existing.startTime,
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

  const after = recalculateSchedule([...original, sel('brown-rice', 2700)], current, 600);

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

test('two portions of the same food are scheduled independently', () => {
  const rare = sel('beef-steak', 360, 'Rare');
  const well = sel('beef-steak', 600, 'Well done');

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
  const rare = sel('beef-steak', 360, 'Rare');
  const well = sel('beef-steak', 600, 'Well done');
  const current = calculateSchedule([rare, well]).items;

  // At 300s the well-done steak has started; the rare one has not.
  const after = recalculateSchedule([rare, well], current, 300);

  const wellAfter = after.items.find((item) => item.itemId === well.itemId);
  const rareAfter = after.items.find((item) => item.itemId === rare.itemId);
  assert.equal(wellAfter.startTime, 0);
  assert.equal(rareAfter.startTime, 240);
  assert.equal(after.totalTime, 600);
});
