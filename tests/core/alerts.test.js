import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    generateAlerts,
    partitionDueAlerts,
    regenerateAlerts,
    summariseMissed,
} from '../../static/js/core/alerts.js';

const schedule = {
    totalTime: 1500,
    items: [
        {
            itemId: 'r0',
            foodId: 'chicken',
            foodName: 'Chicken',
            optionLabel: 'Cooked through',
            startTime: 0,
            finishTime: 1500,
            duration: 1500,
        },
        {
            itemId: 'r1',
            foodId: 'kale',
            foodName: 'Kale',
            optionLabel: 'Tender',
            startTime: 1140,
            finishTime: 1500,
            duration: 360,
        },
    ],
};

test('generateAlerts emits one per dish plus a finale', () => {
    const alerts = generateAlerts(schedule);

    assert.deepEqual(
        alerts
            .filter((alert) => alert.type === 'food-start')
            .map((alert) => alert.itemId),
        ['r0', 'r1'],
    );

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
            {
                itemId: 'r2',
                foodId: 'rice',
                foodName: 'Rice',
                optionLabel: 'Cooked',
                startTime: 300,
                finishTime: 3000,
                duration: 2700,
            },
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

test('regenerateAlerts distinguishes two dishes with the same name', () => {
    const twoSteaks = {
        totalTime: 600,
        items: [
            {
                itemId: 'a',
                foodId: 'beef-steak',
                foodName: 'Beef Steak',
                optionLabel: 'Well done',
                startTime: 0,
                finishTime: 600,
                duration: 600,
            },
            {
                itemId: 'b',
                foodId: 'beef-steak',
                foodName: 'Beef Steak',
                optionLabel: 'Rare',
                startTime: 240,
                finishTime: 600,
                duration: 360,
            },
        ],
    };
    const existing = generateAlerts(twoSteaks);
    existing.find((alert) => alert.itemId === 'a').triggered = true;

    const next = regenerateAlerts(twoSteaks, existing, 300);

    // The old code matched on foodName, so the rare steak found the well-done
    // steak's already-fired alert and inherited triggered: true — silencing an
    // alert the cook still needed. Keyed on itemId it keeps its own state.
    assert.equal(next.find((alert) => alert.itemId === 'a').triggered, true);
    assert.equal(next.find((alert) => alert.itemId === 'b').triggered, false);
    assert.equal(next.filter((alert) => alert.type === 'food-start').length, 2);
});

test('regenerateAlerts keeps a same-named waiting dish unfired', () => {
    const twoSteaks = {
        totalTime: 600,
        items: [
            {
                itemId: 'a',
                foodId: 'beef-steak',
                foodName: 'Beef Steak',
                optionLabel: 'Well done',
                startTime: 0,
                finishTime: 600,
                duration: 600,
            },
            {
                itemId: 'b',
                foodId: 'beef-steak',
                foodName: 'Beef Steak',
                optionLabel: 'Rare',
                startTime: 240,
                finishTime: 600,
                duration: 360,
            },
        ],
    };
    const existing = generateAlerts(twoSteaks);
    existing.find((alert) => alert.itemId === 'a').triggered = true;

    // At 100s the rare steak has not started, so its alert must stay unfired
    // even though a dish with the identical name already fired.
    const next = regenerateAlerts(twoSteaks, existing, 100);

    assert.equal(next.find((alert) => alert.itemId === 'a').triggered, true);
    assert.equal(next.find((alert) => alert.itemId === 'b').triggered, false);
});

const restingSchedule = {
    totalTime: 780,
    items: [
        {
            itemId: 'r0',
            foodId: 'beef-steak',
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
            foodId: 'broccoli',
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

test('a resting dish gets a second alert for coming off the heat', () => {
    const alerts = generateAlerts(restingSchedule);

    const steakAlerts = alerts.filter((alert) => alert.itemId === 'r0');
    assert.deepEqual(
        steakAlerts.map((alert) => [alert.type, alert.triggerTime]),
        [
            ['food-start', 0],
            ['food-rest', 480],
        ],
    );
    assert.match(steakAlerts[1].message, /off the heat/i);
    assert.match(steakAlerts[1].message, /Beef Steak/);
});

test('a dish with no rest gets only a start alert', () => {
    const alerts = generateAlerts(restingSchedule).filter(
        (alert) => alert.itemId === 'r1',
    );
    assert.deepEqual(
        alerts.map((alert) => alert.type),
        ['food-start'],
    );
});

test('alerts stay in trigger order so the backlog summary reads correctly', () => {
    const times = generateAlerts(restingSchedule).map(
        (alert) => alert.triggerTime,
    );
    assert.deepEqual(
        times,
        [...times].sort((a, b) => a - b),
    );
});

test('regenerateAlerts preserves a fired off-the-heat alert', () => {
    const existing = generateAlerts(restingSchedule);
    existing.find((alert) => alert.type === 'food-rest').triggered = true;

    const next = regenerateAlerts(restingSchedule, existing, 500);

    assert.equal(
        next.find((alert) => alert.type === 'food-rest').triggered,
        true,
    );
});

const offsetSchedule = {
    mealTime: 2100,
    totalTime: 2100,
    items: [
        {
            itemId: 'r0',
            foodId: 'chicken',
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
            foodId: 'soup',
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

test('a dish served away from the meal gets its own ready alert', () => {
    const soup = generateAlerts(offsetSchedule).filter(
        (alert) => alert.itemId === 'r1',
    );

    assert.deepEqual(
        soup.map((alert) => [alert.type, alert.triggerTime]),
        [
            ['food-start', 600],
            ['food-ready', 1200],
        ],
    );
    assert.match(soup[1].message, /Soup is ready/);
});

test('a dish served with the meal gets no separate ready alert', () => {
    // The finale already covers it; a second announcement would be noise.
    const chicken = generateAlerts(offsetSchedule).filter(
        (alert) => alert.itemId === 'r0',
    );
    assert.deepEqual(
        chicken.map((alert) => alert.type),
        ['food-start', 'food-rest'],
    );
});

test('regenerateAlerts preserves a fired ready alert', () => {
    const existing = generateAlerts(offsetSchedule);
    existing.find((alert) => alert.type === 'food-ready').triggered = true;

    const next = regenerateAlerts(offsetSchedule, existing, 1300);

    assert.equal(
        next.find((alert) => alert.type === 'food-ready').triggered,
        true,
    );
});

const lateDishSchedule = {
    mealTime: 2100,
    totalTime: 2700,
    items: [
        {
            itemId: 'r0',
            foodId: 'chicken',
            foodName: 'Chicken',
            optionLabel: 'Cooked through',
            startTime: 0,
            cookDuration: 2100,
            heatOffTime: 2100,
            restSeconds: 0,
            serveOffsetSeconds: 0,
            finishTime: 2100,
        },
        {
            itemId: 'r1',
            foodId: 'pasta',
            foodName: 'Pasta',
            optionLabel: 'Al dente',
            startTime: 2220,
            cookDuration: 480,
            heatOffTime: 2700,
            restSeconds: 0,
            serveOffsetSeconds: 600,
            finishTime: 2700,
        },
    ],
};

test('with nothing served late, one finale announces the meal', () => {
    const finales = generateAlerts(schedule).filter(
        (alert) => alert.type === 'all-done',
    );

    assert.equal(finales.length, 1);
    assert.equal(finales[0].triggerTime, schedule.totalTime);
    assert.match(finales[0].message, /meal is ready/i);
});

test('a late dish gets the meal its own announcement at the meal moment', () => {
    const alerts = generateAlerts(lateDishSchedule);

    const meal = alerts.find((alert) => alert.type === 'meal-ready');
    assert.equal(
        meal.triggerTime,
        2100,
        'the meal is announced when it is actually ready',
    );
    assert.match(meal.message, /meal is ready/i);
});

test('with a late dish the finale stops claiming the meal is ready', () => {
    // It fires when the straggler lands, ten minutes after the meal.
    const finale = generateAlerts(lateDishSchedule).find(
        (alert) => alert.type === 'all-done',
    );

    assert.equal(finale.triggerTime, 2700);
    assert.ok(!/meal is ready/i.test(finale.message), finale.message);
    assert.match(finale.message, /everything/i);
});

test('regenerateAlerts preserves a fired meal announcement', () => {
    const existing = generateAlerts(lateDishSchedule);
    existing.find((alert) => alert.type === 'meal-ready').triggered = true;

    const next = regenerateAlerts(lateDishSchedule, existing, 2200);

    assert.equal(
        next.find((alert) => alert.type === 'meal-ready').triggered,
        true,
    );
});

test('the meal announcement sorts into place among the dish alerts', () => {
    // partitionDueAlerts treats the last newly-due alert as the most recent one,
    // so an out-of-order closing alert would announce the wrong thing after a gap.
    const fromGenerate = generateAlerts(lateDishSchedule).map(
        (a) => a.triggerTime,
    );
    assert.deepEqual(
        fromGenerate,
        [...fromGenerate].sort((a, b) => a - b),
        'generateAlerts',
    );

    const fromRegenerate = regenerateAlerts(lateDishSchedule, [], 0).map(
        (a) => a.triggerTime,
    );
    assert.deepEqual(
        fromRegenerate,
        [...fromRegenerate].sort((a, b) => a - b),
        'regenerateAlerts',
    );
});
