/**
 * Schedule arithmetic. Pure — no DOM, no clock, no state, no `Date`.
 *
 * Every time in this module is an integer number of seconds measured from
 * t=0, the moment cooking starts. Nothing here knows about wall-clock time.
 *
 * Schedule item shape: { itemId, foodId, foodName, optionLabel, startTime, duration, finishTime }
 * Selection shape:     { itemId, foodId, foodName, optionId, optionLabel, cookingTime }
 *
 * `itemId` is the identity, never `foodId` — two portions of the same food at
 * different options are a legitimate menu.
 *
 * Invariant, guaranteed for every item returned by every function here:
 *   finishTime - startTime === duration
 */

function byStartTime(a, b) {
    return a.startTime - b.startTime;
}

/**
 * Build a schedule in which every dish finishes at the same moment.
 *
 * The longest dish sets the total and starts at t=0; everything else starts
 * late enough to land with it.
 */
export function calculateSchedule(selections) {
    if (!selections || selections.length === 0) {
        return { items: [], totalTime: 0 };
    }

    const totalTime = Math.max(...selections.map((selection) => selection.cookingTime));

    const items = selections.map((selection) => ({
        itemId: selection.itemId,
        foodId: selection.foodId,
        foodName: selection.foodName,
        optionLabel: selection.optionLabel,
        startTime: totalTime - selection.cookingTime,
        duration: selection.cookingTime,
        finishTime: totalTime,
    }));

    items.sort(byStartTime);

    return { items, totalTime };
}

/**
 * Re-plan around dishes that have already started.
 *
 * Dishes already on the heat are immovable: they keep the start and finish
 * they were given. Everything else re-targets a common finish, chosen to be
 * late enough for both the immovable dishes and the slowest dish still waiting.
 *
 * Two consequences worth knowing, both intentional:
 *  - Adding a slow dish pushes the finish later, so dishes already cooking
 *    finish before the meal does.
 *  - Removing or shortening a waiting dish cannot pull the finish earlier than
 *    the last immovable dish.
 *
 * @param selections     the full desired list after the edit
 * @param currentItems   the schedule in force before the edit
 * @param elapsedSeconds seconds since cooking started
 */
export function recalculateSchedule(selections, currentItems, elapsedSeconds) {
    if (!selections || selections.length === 0) {
        return { items: [], totalTime: 0 };
    }

    const current = currentItems || [];
    const started = [];
    const waiting = [];

    for (const selection of selections) {
        const inForce = current.find((item) => item.itemId === selection.itemId);
        if (inForce && elapsedSeconds >= inForce.startTime) {
            started.push({ selection, inForce });
        } else {
            waiting.push(selection);
        }
    }

    let totalTime = 0;
    for (const { inForce } of started) {
        totalTime = Math.max(totalTime, inForce.finishTime);
    }
    if (waiting.length > 0) {
        const slowest = Math.max(...waiting.map((selection) => selection.cookingTime));
        totalTime = Math.max(totalTime, elapsedSeconds + slowest);
    }

    const items = [
        ...started.map(({ selection, inForce }) => ({
            itemId: selection.itemId,
            foodId: selection.foodId,
            foodName: selection.foodName,
            optionLabel: selection.optionLabel,
            startTime: inForce.startTime,
            // Derived from the timings actually in force rather than from the
            // selection's cookingTime, so the duration invariant holds even if
            // a caller ever changes the option of an already-started dish.
            duration: inForce.finishTime - inForce.startTime,
            finishTime: inForce.finishTime,
        })),
        ...waiting.map((selection) => ({
            itemId: selection.itemId,
            foodId: selection.foodId,
            foodName: selection.foodName,
            optionLabel: selection.optionLabel,
            // The clamp is currently unreachable: totalTime is at least
            // elapsedSeconds + slowest, and cookingTime <= slowest. Kept as a
            // guard because Phase 4 changes how totalTime is chosen.
            startTime: Math.max(totalTime - selection.cookingTime, elapsedSeconds),
            duration: selection.cookingTime,
            finishTime: totalTime,
        })),
    ];

    items.sort(byStartTime);

    return { items, totalTime };
}
