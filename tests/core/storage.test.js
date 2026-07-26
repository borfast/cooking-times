import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    clearSession,
    isSessionLive,
    PLAN_KEY,
    readCustomFoods,
    readOverrides,
    readPlan,
    readSession,
    SESSION_KEY,
    writeCustomFoods,
    writeOverride,
    writePlan,
    writeSession,
} from '../../static/js/core/storage.js';

/** Minimal stand-in for Window.localStorage. */
function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: (key) => (key in data ? data[key] : null),
        setItem: (key, value) => {
            data[key] = String(value);
        },
        removeItem: (key) => {
            delete data[key];
        },
        raw: () => data,
    };
}

const sel = (foodId, cookingTime) => ({
    foodId,
    foodName: foodId,
    doneness: 'medium',
    cookingTime,
});

test('readPlan returns an empty list when nothing is stored', () => {
    assert.deepEqual(readPlan(fakeStorage()), []);
});

test('readPlan returns an empty list rather than throwing on corrupt JSON', () => {
    const storage = fakeStorage({ [PLAN_KEY]: '{not json' });
    assert.deepEqual(readPlan(storage), []);
});

test('readPlan returns an empty list when selectedFoods is not an array', () => {
    const storage = fakeStorage({ [PLAN_KEY]: '{"selectedFoods":"nope"}' });
    assert.deepEqual(readPlan(storage), []);
});

test('writePlan then readPlan round-trips the selections', () => {
    const storage = fakeStorage();
    const selections = [sel('chicken', 1500), sel('kale', 360)];

    writePlan(storage, selections);

    assert.deepEqual(readPlan(storage), selections);
});

test('writePlan stores only the selections, not a dead items array', () => {
    const storage = fakeStorage();
    writePlan(storage, [sel('chicken', 1500)]);

    const stored = JSON.parse(storage.raw()[PLAN_KEY]);
    assert.deepEqual(Object.keys(stored), ['selectedFoods']);
});

test('readSession returns null when nothing is stored', () => {
    assert.equal(readSession(fakeStorage()), null);
});

test('readSession returns null rather than throwing on corrupt JSON', () => {
    const storage = fakeStorage({ [SESSION_KEY]: 'nonsense{' });
    assert.equal(readSession(storage), null);
});

test('readSession rejects an object with no status', () => {
    const storage = fakeStorage({ [SESSION_KEY]: '{"schedule":{}}' });
    assert.equal(readSession(storage), null);
});

test('writeSession then readSession round-trips', () => {
    const storage = fakeStorage();
    const session = {
        status: 'running',
        startedAt: '2026-01-01T00:00:00.000Z',
    };

    writeSession(storage, session);

    assert.deepEqual(readSession(storage), session);
});

test('clearSession removes the session but leaves the plan alone', () => {
    const storage = fakeStorage();
    writePlan(storage, [sel('chicken', 1500)]);
    writeSession(storage, { status: 'running' });

    clearSession(storage);

    assert.equal(readSession(storage), null);
    assert.deepEqual(readPlan(storage), [sel('chicken', 1500)]);
});

test('isSessionLive is true only mid-cook', () => {
    assert.equal(isSessionLive({ status: 'running' }), true);
    assert.equal(isSessionLive({ status: 'paused' }), true);
    assert.equal(isSessionLive({ status: 'created' }), false);
    assert.equal(isSessionLive({ status: 'completed' }), false);
    assert.equal(isSessionLive(null), false);
    assert.equal(isSessionLive(undefined), false);
});

test('custom foods round-trip and default to empty', () => {
    const storage = fakeStorage();
    assert.deepEqual(readCustomFoods(storage), []);

    const mine = [
        {
            id: 'custom-roast',
            name: 'My Roast',
            category: 'Meat',
            defaultOptionId: 'done',
            options: [{ id: 'done', label: 'Done', seconds: 5400 }],
        },
    ];
    writeCustomFoods(storage, mine);

    assert.deepEqual(readCustomFoods(storage), mine);
});

test('custom foods survive corrupt storage', () => {
    assert.deepEqual(
        readCustomFoods(fakeStorage({ 'cooking-custom-foods': '{{' })),
        [],
    );
});

test('an override is remembered per food and option', () => {
    const storage = fakeStorage();
    assert.deepEqual(readOverrides(storage), {});

    writeOverride(storage, 'chicken', 'cooked-through', 5400);

    assert.equal(readOverrides(storage)['chicken:cooked-through'], 5400);
});

test('overrides for different options of one food are independent', () => {
    const storage = fakeStorage();
    writeOverride(storage, 'beef-steak', 'rare', 300);
    writeOverride(storage, 'beef-steak', 'well-done', 900);

    const overrides = readOverrides(storage);
    assert.equal(overrides['beef-steak:rare'], 300);
    assert.equal(overrides['beef-steak:well-done'], 900);
});

test('writing a null override forgets it', () => {
    const storage = fakeStorage();
    writeOverride(storage, 'chicken', 'cooked-through', 5400);
    writeOverride(storage, 'chicken', 'cooked-through', null);

    assert.deepEqual(readOverrides(storage), {});
});
