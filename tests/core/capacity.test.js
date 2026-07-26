import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KITCHEN_DEFAULTS,
  concurrencyProfile,
  findConflicts,
  describeConflicts,
  applyStrategy,
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

const settings = (over) => ({ ...KITCHEN_DEFAULTS, ...over });
const peakOf = (items) =>
  Math.max(0, ...concurrencyProfile(items).map((segment) => segment.count));

test('warn leaves the schedule completely alone', () => {
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 0, 900)];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'warn' }));

  assert.deepEqual(result.items, items);
  assert.equal(result.totalTime, 900);
  assert.equal(result.conflicts.worstConcurrency, 3);
  assert.deepEqual(result.moved, []);
});

test('stagger moves a conflicting dish earlier and it finishes early', () => {
  // A synchronised three-dish plan on a two-ring hob: all three want the heat
  // over the last five minutes. The shortest has room to go on sooner.
  const items = [item('a', 0, 900), item('b', 300, 600), item('c', 600, 300)];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'stagger' }));

  assert.equal(peakOf(result.items), 2);
  assert.equal(result.totalTime, 900);
  assert.equal(result.moved.length, 1);
  assert.equal(result.moved[0].itemId, 'c');
  assert.equal(result.moved[0].toStart, 0);
  assert.equal(result.moved[0].finishesEarlyBy, 600);
  for (const moved of result.items) {
    assert.ok(moved.finishTime <= 900, `${moved.itemId} finishes after the meal`);
  }
});

test('stagger cannot help when every dish is the same length, and says so', () => {
  // All three already start at 0, and nothing can start before the cook begins,
  // so there is nowhere earlier to go. The conflict is left reported rather than
  // silently mangled.
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 0, 900)];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'stagger' }));

  assert.deepEqual(result.moved, []);
  assert.equal(result.conflicts.worstConcurrency, 3);
  assert.ok(result.conflicts.overCapacity.length > 0);
});

test('extend moves a conflicting dish later and the meal takes longer', () => {
  const items = [item('a', 0, 900), item('b', 0, 900), item('c', 0, 900)];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'extend' }));

  assert.equal(peakOf(result.items), 2);
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

test('extend always resolves a capacity conflict, because there is always room later', () => {
  const items = Array.from({ length: 6 }, (_, index) => item(`d${index}`, 0, 600));

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'extend' }));

  assert.ok(peakOf(result.items) <= 2, `left a peak of ${peakOf(result.items)}`);
  assert.equal(result.moved.length, 4);
  assert.ok(result.totalTime > 600);
});

test('stagger cannot beat the ring-time the total allows', () => {
  // Four dishes needing 1200+900+600+300 = 3000 ring-seconds. Two rings over a
  // 1200-second meal supply only 2400. Since stagger holds the total fixed, no
  // arrangement can fit, and the honest outcome is a reported conflict.
  const items = [
    item('a', 0, 1200), item('b', 300, 900), item('c', 600, 600), item('d', 900, 300),
  ];
  const ringSecondsNeeded = items.reduce((sum, i) => sum + i.cookDuration, 0);
  assert.ok(ringSecondsNeeded > 2 * 1200, 'fixture should be infeasible');

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'stagger' }));

  assert.equal(result.totalTime, 1200);
  assert.ok(result.conflicts.overCapacity.length > 0);
});

test('extend resolves the same infeasible-at-fixed-total case by taking longer', () => {
  const items = [
    item('a', 0, 1200), item('b', 300, 900), item('c', 600, 600), item('d', 900, 300),
  ];

  const result = applyStrategy(items, settings({ capacity: 2, strategy: 'extend' }));

  assert.ok(peakOf(result.items) <= 2, `left a peak of ${peakOf(result.items)}`);
  assert.ok(result.totalTime > 1200);
});

test('stagger spaces starts by the transition time where it has room', () => {
  // Differing lengths, so the shorter dishes have somewhere earlier to go.
  const items = [item('a', 0, 1200), item('b', 600, 600), item('c', 900, 300)];

  const result = applyStrategy(items, settings({
    capacity: 4, transitionSeconds: 120, strategy: 'stagger',
  }));

  const starts = result.items.map((moved) => moved.startTime).sort((a, b) => a - b);
  for (let index = 1; index < starts.length; index += 1) {
    assert.ok(starts[index] - starts[index - 1] >= 120, `starts too close: ${starts}`);
  }
});

test('extend respects the transition time between starts', () => {
  const items = Array.from({ length: 4 }, (_, index) => item(`d${index}`, 0, 600));

  const result = applyStrategy(items, settings({
    capacity: 4, transitionSeconds: 120, strategy: 'extend',
  }));

  const starts = result.items.map((moved) => moved.startTime).sort((a, b) => a - b);
  for (let index = 1; index < starts.length; index += 1) {
    assert.ok(starts[index] - starts[index - 1] >= 120, `starts too close: ${starts}`);
  }
});

test('a single dish is never moved, whatever the capacity', () => {
  const items = [item('a', 0, 600)];

  for (const strategy of ['stagger', 'extend']) {
    const result = applyStrategy(items, settings({ capacity: 1, strategy }));
    assert.deepEqual(result.items, items, strategy);
  }
});

test('an unknown strategy behaves like warn rather than throwing', () => {
  const items = [item('a', 0, 900), item('b', 0, 900)];
  const result = applyStrategy(items, settings({ capacity: 1, strategy: 'nonsense' }));

  assert.deepEqual(result.items, items);
  assert.deepEqual(result.moved, []);
});

test('an empty schedule is handled by every strategy', () => {
  for (const strategy of ['warn', 'stagger', 'extend']) {
    const result = applyStrategy([], settings({ strategy }));
    assert.deepEqual(result.items, [], strategy);
    assert.equal(result.totalTime, 0, strategy);
  }
});
