/**
 * Schedule arithmetic. Pure — no DOM, no clock, no state, no `Date`.
 *
 * Every time in this module is an integer number of seconds measured from
 * t=0, the moment cooking starts. Nothing here knows about wall-clock time.
 *
 * A dish has two phases: time on the heat, then an optional rest off it.
 *
 * Schedule item shape: {
 *   itemId, foodId, foodName, optionLabel,
 *   startTime,      // goes on the heat
 *   cookDuration,   // time on the heat
 *   heatOffTime,    // comes off the heat
 *   restSeconds,    // resting off the heat (0 for most foods)
 *   finishTime,     // ready to serve
 * }
 * Selection shape: { itemId, foodId, foodName, optionId, optionLabel, cookingTime, restSeconds }
 *
 * `itemId` is the identity, never `foodId` — two portions of the same food at
 * different options are a legitimate menu.
 *
 * Invariants, guaranteed for every item returned by every function here:
 *   heatOffTime - startTime === cookDuration
 *   finishTime  - heatOffTime === restSeconds
 *
 * Only [startTime, heatOffTime) is time on the heat; the rest happens off it.
 * The two are modelled separately because the timer needs to tell you to take a
 * dish off before it is ready to serve.
 */

/** Seconds from going on the heat to being ready to serve. */
function readyTime(selection) {
    return selection.cookingTime + (selection.restSeconds || 0);
}

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

    const totalTime = Math.max(...selections.map(readyTime));

    const items = selections.map((selection) => {
        const rest = selection.restSeconds || 0;
        const heatOffTime = totalTime - rest;
        return {
            itemId: selection.itemId,
            foodId: selection.foodId,
            foodName: selection.foodName,
            optionLabel: selection.optionLabel,
            startTime: heatOffTime - selection.cookingTime,
            cookDuration: selection.cookingTime,
            heatOffTime,
            restSeconds: rest,
            finishTime: totalTime,
        };
    });

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
        const inForce = current.find(
            (item) => item.itemId === selection.itemId,
        );
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
        const slowest = Math.max(...waiting.map(readyTime));
        totalTime = Math.max(totalTime, elapsedSeconds + slowest);
    }

    const items = [
        ...started.map(({ selection, inForce }) => ({
            itemId: selection.itemId,
            foodId: selection.foodId,
            foodName: selection.foodName,
            optionLabel: selection.optionLabel,
            // All four timings come from the plan in force, not the selection,
            // so both invariants hold even if a caller ever changes the option
            // of an already-started dish.
            startTime: inForce.startTime,
            cookDuration: inForce.heatOffTime - inForce.startTime,
            heatOffTime: inForce.heatOffTime,
            restSeconds: inForce.restSeconds,
            finishTime: inForce.finishTime,
        })),
        ...waiting.map((selection) => {
            const rest = selection.restSeconds || 0;
            const heatOffTime = totalTime - rest;
            return {
                itemId: selection.itemId,
                foodId: selection.foodId,
                foodName: selection.foodName,
                optionLabel: selection.optionLabel,
                // The clamp is currently unreachable: totalTime is at least
                // elapsedSeconds + the slowest ready time, and this dish's ready
                // time is at most that. Kept as a guard.
                startTime: Math.max(
                    heatOffTime - selection.cookingTime,
                    elapsedSeconds,
                ),
                cookDuration: selection.cookingTime,
                heatOffTime,
                restSeconds: rest,
                finishTime: totalTime,
            };
        }),
    ];

    items.sort(byStartTime);

    return { items, totalTime };
}
