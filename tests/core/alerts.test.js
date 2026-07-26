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
