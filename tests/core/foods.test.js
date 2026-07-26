import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findFood,
  findOption,
  defaultOption,
  resolveSelection,
  groupByCategory,
  catalogueProblems,
} from '../../static/js/core/foods.js';

const catalogue = [
  {
    id: 'beef-steak',
    name: 'Beef Steak',
    category: 'Meat',
    defaultOptionId: 'medium',
    options: [
      { id: 'rare', label: 'Rare', seconds: 360 },
      { id: 'medium', label: 'Medium', seconds: 480 },
      { id: 'well-done', label: 'Well done', seconds: 600 },
    ],
  },
  {
    id: 'rice',
    name: 'Rice',
    category: 'Grains',
    defaultOptionId: 'cooked',
    options: [{ id: 'cooked', label: 'Cooked', seconds: 1200 }],
  },
];

test('findFood locates by id and returns null when absent', () => {
  assert.equal(findFood(catalogue, 'rice').name, 'Rice');
  assert.equal(findFood(catalogue, 'nope'), null);
  assert.equal(findFood(null, 'rice'), null);
});

test('findOption locates by id within a food', () => {
  const steak = findFood(catalogue, 'beef-steak');
  assert.equal(findOption(steak, 'rare').seconds, 360);
  assert.equal(findOption(steak, 'nope'), null);
});

test('defaultOption honours defaultOptionId', () => {
  assert.equal(defaultOption(findFood(catalogue, 'beef-steak')).id, 'medium');
});

test('defaultOption falls back to the first option', () => {
  const food = {
    id: 'x',
    name: 'X',
    category: 'Other',
    options: [{ id: 'a', label: 'A', seconds: 60 }],
  };
  assert.equal(defaultOption(food).id, 'a');
});

test('a food with one option still resolves', () => {
  const selection = resolveSelection(catalogue, {
    itemId: 'i1',
    foodId: 'rice',
    optionId: 'cooked',
  });

  assert.deepEqual(selection, {
    itemId: 'i1',
    foodId: 'rice',
    foodName: 'Rice',
    optionId: 'cooked',
    optionLabel: 'Cooked',
    cookingTime: 1200,
    overridden: false,
  });
});

test('resolveSelection falls back to the default option when the id is unknown', () => {
  const selection = resolveSelection(catalogue, {
    itemId: 'i1',
    foodId: 'beef-steak',
    optionId: 'bogus',
  });
  assert.equal(selection.optionId, 'medium');
  assert.equal(selection.cookingTime, 480);
});

test('resolveSelection returns null for an unknown food', () => {
  assert.equal(resolveSelection(catalogue, { itemId: 'i1', foodId: 'nope' }), null);
});

test('an override beats the option duration and is flagged', () => {
  const selection = resolveSelection(catalogue, {
    itemId: 'i1',
    foodId: 'beef-steak',
    optionId: 'rare',
    overrideSeconds: 900,
  });

  assert.equal(selection.cookingTime, 900);
  assert.equal(selection.overridden, true);
});

test('a zero or negative override is ignored', () => {
  for (const bad of [0, -5, Number.NaN, null, undefined, 'abc']) {
    const selection = resolveSelection(catalogue, {
      itemId: 'i1',
      foodId: 'beef-steak',
      optionId: 'rare',
      overrideSeconds: bad,
    });
    assert.equal(selection.cookingTime, 360, `override ${bad} should be ignored`);
    assert.equal(selection.overridden, false);
  }
});

test('groupByCategory sorts categories and foods alphabetically', () => {
  const groups = groupByCategory(catalogue);

  assert.deepEqual(
    groups.map((group) => group.category),
    ['Grains', 'Meat'],
  );
  assert.deepEqual(
    groups[1].foods.map((food) => food.name),
    ['Beef Steak'],
  );
});

test('groupByCategory files a food with no category under Other', () => {
  const groups = groupByCategory([{ id: 'x', name: 'X', options: [] }]);
  assert.equal(groups[0].category, 'Other');
});

test('catalogueProblems accepts a well-formed catalogue', () => {
  assert.deepEqual(catalogueProblems(catalogue), []);
});

test('catalogueProblems reports every kind of malformation', () => {
  const problems = catalogueProblems([
    { id: 'a', name: 'A', category: 'Meat', options: [] },
    { id: 'a', name: 'Dup', category: 'Meat', options: [{ id: 'o', label: 'O', seconds: 1 }] },
    { id: 'b', name: 'B', category: 'Meat', options: [{ id: 'o', label: 'O', seconds: 0 }] },
    {
      id: 'c',
      name: 'C',
      category: 'Meat',
      defaultOptionId: 'missing',
      options: [{ id: 'o', label: 'O', seconds: 1 }],
    },
  ]);

  assert.ok(problems.some((problem) => problem.includes('no options')));
  assert.ok(problems.some((problem) => problem.includes('duplicate food id')));
  assert.ok(problems.some((problem) => problem.includes('non-positive')));
  assert.ok(problems.some((problem) => problem.includes('defaultOptionId')));
});

test('the shipped foods.json is well-formed', () => {
  const raw = readFileSync(new URL('../../static/foods.json', import.meta.url), 'utf8');
  const parsed = JSON.parse(raw);

  assert.deepEqual(catalogueProblems(parsed.foods), []);
  assert.equal(parsed.foods.length, 30);
});

test('the shipped catalogue exercises one, two and three option foods', () => {
  const raw = readFileSync(new URL('../../static/foods.json', import.meta.url), 'utf8');
  const counts = new Set(JSON.parse(raw).foods.map((food) => food.options.length));

  // G22 was that every food was forced to have exactly three tiers.
  assert.deepEqual([...counts].sort(), [1, 2, 3]);
});
