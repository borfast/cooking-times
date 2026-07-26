/**
 * Schedule arithmetic. Pure — no DOM, no clock, no state, no `Date`.
 *
 * Every time in this module is an integer number of seconds measured from
 * t=0, the moment cooking starts. Nothing here knows about wall-clock time.
 *
 * Schedule item shape: { foodId, foodName, doneness, startTime, duration, finishTime }
 * Selection shape:     { foodId, foodName, doneness, cookingTime }
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
        foodId: selection.foodId,
        foodName: selection.foodName,
        doneness: selection.doneness,
        startTime: totalTime - selection.cookingTime,
        duration: selection.cookingTime,
        finishTime: totalTime,
    }));

    items.sort(byStartTime);

    return { items, totalTime };
}
