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

const staggered = {
    mealTime: 2100,
    totalTime: 2100,
    items: [
        {
            itemId: 'r0',
            foodName: 'Chicken',
            optionLabel: 'Cooked through',
            startTime: 0,
            cookDuration: 1500,
            heatOffTime: 1500,
            restSeconds: 600,
            serveOffsetSeconds: 0,
            finishTime: 2100,
        },
        {
            itemId: 'r1',
            foodName: 'Soup',
            optionLabel: 'Cooked',
            startTime: 600,
            cookDuration: 600,
            heatOffTime: 1200,
            restSeconds: 0,
            serveOffsetSeconds: -900,
            finishTime: 1200,
        },
    ],
};

test('runsheetText says when a dish is served away from the meal', () => {
    const text = runsheetText(staggered, { readyAt: null });
    assert.match(text, /Soup.*15 min before the meal/s);
});

test('runsheetText says nothing extra for a dish served with the meal', () => {
    const line = runsheetText(staggered, { readyAt: null })
        .split('\n')
        .find((l) => l.includes('Chicken'));
    assert.ok(!/before the meal|after the meal/.test(line));
});

test('runsheetText gives the meal moment its own clock time when staggered', () => {
    const text = runsheetText(staggered, { readyAt: 1170 });
    // Meal at 19:30; the soup lands 15 minutes earlier, at 19:15.
    assert.match(text, /19:15/);
    assert.match(text, /Ready at 19:30/);
});

test('the serve time anchors the meal, not the last dish out of the oven', () => {
    // Pasta is served 10 minutes after the meal. Asking for a 19:30 meal must put
    // the meal at 19:30 and the pasta at 19:40 -- not drag the meal back to 19:20
    // so that the late dish lands on the requested time.
    const lateDish = {
        mealTime: 2100,
        totalTime: 2700,
        items: [
            {
                itemId: 'r0',
                foodName: 'Chicken',
                optionLabel: 'Cooked through',
                startTime: 0,
                cookDuration: 1500,
                heatOffTime: 1500,
                restSeconds: 600,
                serveOffsetSeconds: 0,
                finishTime: 2100,
            },
            {
                itemId: 'r1',
                foodName: 'Pasta',
                optionLabel: 'Al dente',
                startTime: 2100,
                cookDuration: 600,
                heatOffTime: 2700,
                restSeconds: 0,
                serveOffsetSeconds: 600,
                finishTime: 2700,
            },
        ],
    };

    const times = clockTimes(lateDish.items, 1170, lateDish.mealTime);
    assert.equal(
        times.get('r0').ready,
        '19:30',
        'the meal dish lands on the serve time',
    );
    assert.equal(
        times.get('r1').ready,
        '19:40',
        'the late dish lands after it',
    );

    const text = runsheetText(lateDish, { readyAt: 1170 });
    assert.match(text, /Ready at 19:30/);
    assert.match(text, /19:40, 10 min after the meal/);
});

test('clockTimes still anchors on the last dish when no meal moment is given', () => {
    const times = clockTimes(result.items, 1170);
    assert.equal(times.get('r0').start, '19:17');
});
