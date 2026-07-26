import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockTimes, runsheetText } from '../../static/js/core/runsheet.js';

const result = {
    totalTime: 780,
    items: [
        {
            itemId: 'r0',
            foodName: 'Beef Steak',
            optionLabel: 'Medium',
            startTime: 0,
            cookDuration: 480,
            heatOffTime: 480,
            restSeconds: 300,
            finishTime: 780,
        },
        {
            itemId: 'r1',
            foodName: 'Broccoli',
            optionLabel: 'Tender',
            startTime: 480,
            cookDuration: 300,
            heatOffTime: 780,
            restSeconds: 0,
            finishTime: 780,
        },
    ],
};

test('clockTimes is null without a ready time', () => {
    assert.equal(clockTimes(result.items, null), null);
});

test('clockTimes counts back from the moment the meal is ready', () => {
    // Ready at 19:30 = minute 1170. Total 780s = 13 min, so cooking starts 19:17.
    const times = clockTimes(result.items, 1170);

    assert.equal(times.get('r0').start, '19:17');
    assert.equal(times.get('r0').heatOff, '19:25');
    assert.equal(times.get('r1').start, '19:25');
});

test('clockTimes wraps across midnight', () => {
    // Ready at 00:05 = minute 5. Thirteen minutes earlier is 23:52 the day before.
    const times = clockTimes(result.items, 5);
    assert.equal(times.get('r0').start, '23:52');
});

test('clockTimes pads single-digit hours and minutes', () => {
    // Ready at 09:05 = minute 545.
    const times = clockTimes(result.items, 545);
    assert.equal(times.get('r0').start, '08:52');
});

test('runsheetText lists dishes in the order they go on', () => {
    const text = runsheetText(result, { readyAt: null });

    const lines = text
        .split('\n')
        .filter(
            (line) => line.includes('Beef Steak') || line.includes('Broccoli'),
        );
    assert.match(lines[0], /Beef Steak/);
    assert.match(lines[1], /Broccoli/);
});

test('runsheetText uses offsets when there is no ready time', () => {
    const text = runsheetText(result, { readyAt: null });
    assert.match(text, /0:00/);
    assert.ok(!text.includes('19:'));
});

test('runsheetText uses clock times when given a ready time', () => {
    const text = runsheetText(result, { readyAt: 1170 });
    assert.match(text, /19:17/);
    assert.match(text, /Ready at 19:30/);
});

test('runsheetText calls out the rest step', () => {
    const text = runsheetText(result, { readyAt: null });
    assert.match(text, /off the heat/i);
    assert.match(text, /rest 5 min/i);
});

test('runsheetText does not invent a rest step for a dish without one', () => {
    const broccoliOnly = { totalTime: 300, items: [result.items[1]] };
    const text = runsheetText(broccoliOnly, { readyAt: null });
    assert.ok(!/off the heat/i.test(text));
});

test('runsheetText states the total', () => {
    assert.match(runsheetText(result, { readyAt: null }), /13 minutes/);
});

test('runsheetText handles an empty schedule without throwing', () => {
    const text = runsheetText({ items: [], totalTime: 0 }, { readyAt: null });
    assert.equal(typeof text, 'string');
});
