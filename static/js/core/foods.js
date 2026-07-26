/**
 * Everything the app knows about the food catalogue. Pure — no DOM, no fetch.
 *
 * A food declares its own cooking options, because the honest axis differs by
 * food: a steak has a doneness, rice does not, pasta has two states worth
 * naming. Option counts of one, two and three are all normal.
 *
 * Food:      { id, name, category, defaultOptionId, options: [ { id, label, seconds } ] }
 * Selection: { itemId, foodId, foodName, optionId, optionLabel, cookingTime, overridden }
 */

export function findFood(catalogue, foodId) {
    if (!catalogue) {
        return null;
    }
    return catalogue.find((food) => food.id === foodId) || null;
}

export function findOption(food, optionId) {
    if (!food || !food.options) {
        return null;
    }
    return food.options.find((option) => option.id === optionId) || null;
}

/** The option named by `defaultOptionId`, or the first one declared. */
export function defaultOption(food) {
    return findOption(food, food.defaultOptionId) || food.options[0];
}

function usableOverride(value) {
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Turn a stored row into a selection the scheduler can use.
 *
 * An unknown option falls back to the food's default rather than failing, so a
 * renamed option in the catalogue degrades instead of breaking a saved plan.
 */
export function resolveSelection(catalogue, row) {
    const food = findFood(catalogue, row.foodId);
    if (!food) {
        return null;
    }

    const option = findOption(food, row.optionId) || defaultOption(food);
    const override = usableOverride(row.overrideSeconds);

    return {
        itemId: row.itemId,
        foodId: food.id,
        foodName: food.name,
        optionId: option.id,
        optionLabel: option.label,
        cookingTime: override === null ? option.seconds : override,
        overridden: override !== null,
    };
}

/** The picker's structure: categories alphabetical, foods alphabetical within. */
export function groupByCategory(catalogue) {
    const groups = new Map();

    for (const food of catalogue || []) {
        const category = food.category || 'Other';
        if (!groups.has(category)) {
            groups.set(category, []);
        }
        groups.get(category).push(food);
    }

    return [...groups.keys()].sort().map((category) => ({
        category,
        foods: groups.get(category).sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/**
 * Structural problems with a catalogue, as human-readable strings. Empty means
 * well-formed. A test runs this against the shipped foods.json, so a typo in
 * the data fails the build rather than the kitchen.
 */
export function catalogueProblems(catalogue) {
    const problems = [];
    const seenFoodIds = new Set();

    for (const food of catalogue || []) {
        const where = food.id || food.name || '(unnamed)';

        if (seenFoodIds.has(food.id)) {
            problems.push(`duplicate food id: ${where}`);
        }
        seenFoodIds.add(food.id);

        if (!food.options || food.options.length === 0) {
            problems.push(`${where}: no options`);
            continue;
        }

        const seenOptionIds = new Set();
        for (const option of food.options) {
            if (seenOptionIds.has(option.id)) {
                problems.push(`${where}: duplicate option id ${option.id}`);
            }
            seenOptionIds.add(option.id);

            if (!option.label) {
                problems.push(`${where}: option ${option.id} has no label`);
            }
            if (!Number.isInteger(option.seconds) || option.seconds <= 0) {
                problems.push(`${where}: option ${option.id} has a non-positive duration`);
            }
        }

        if (food.defaultOptionId && !seenOptionIds.has(food.defaultOptionId)) {
            problems.push(
                `${where}: defaultOptionId ${food.defaultOptionId} is not one of its options`,
            );
        }
    }

    return problems;
}
