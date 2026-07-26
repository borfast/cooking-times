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
