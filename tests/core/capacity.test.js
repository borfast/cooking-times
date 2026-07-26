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
  // On the heat 0-300, resting 300-900. A dish starting at 400 does not conflict,
  // because the first one is off the burner by then.
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

test('findConflicts merges adjacent offending windows into one', () => {
  // Three dishes overlapping across two adjacent boundaries, capacity 2.
  const items = [item('a', 0, 900), item('b', 100, 800), item('c', 200, 700)];

  const conflicts = findConflicts(items, { capacity: 2, transitionSeconds: 0 });

  assert.equal(conflicts.overCapacity.length, 1);
  assert.equal(conflicts.overCapacity[0].from, 200);
  assert.equal(conflicts.overCapacity[0].to, 900);
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

test('a start gap exactly equal to the transition time is fine', () => {
  const conflicts = findConflicts([item('a', 0, 600), item('b', 60, 600)], {
    capacity: 4,
    transitionSeconds: 60,
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

test('describeConflicts reports tight starts in their own line', () => {
  const items = [item('a', 0, 600), item('b', 20, 600)];
  const conflicts = findConflicts(items, { capacity: 4, transitionSeconds: 60 });

  const lines = describeConflicts(conflicts, items);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /a and b/);
  assert.match(lines[0], /20 seconds apart/);
});

test('describeConflicts says nothing when there is nothing to say', () => {
  const items = [item('a', 0, 600)];
  assert.deepEqual(describeConflicts(findConflicts(items, KITCHEN_DEFAULTS), items), []);
});
