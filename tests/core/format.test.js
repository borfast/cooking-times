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
