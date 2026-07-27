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
 * Selection shape: { itemId, foodId, foodName, optionId, optionLabel, cookingTime,
 *                     restSeconds, serveOffsetSeconds }
 *
 * `serveOffsetSeconds` moves one dish off the common finish: negative is ready
 * before the meal (a starter), positive after (bread out of the oven late). The
 * schedule therefore has two moments — `mealTime`, when offset-0 dishes land,
 * and `totalTime`, the end of the whole timeline. With every offset at zero the
 * two are equal and the arithmetic is exactly the simple synchronised finish.
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

/** How far this dish is served from the meal moment. Negative is earlier. */
function serveOffset(selection) {
    return selection.serveOffsetSeconds || 0;
}

/**
 * How long before the meal moment this dish has to go on the heat.
 *
 * The largest lead time across the menu is what fixes the meal moment, because
 * nothing can start before cooking begins.
 */
function leadTime(selection) {
    return readyTime(selection) - serveOffset(selection);
}

/** Place one dish relative to a fixed meal moment. */
function placeItem(selection, mealTime) {
    const rest = selection.restSeconds || 0;
    const finishTime = mealTime + serveOffset(selection);
    const heatOffTime = finishTime - rest;
    return {
        itemId: selection.itemId,
        foodId: selection.foodId,
        foodName: selection.foodName,
        optionLabel: selection.optionLabel,
        startTime: heatOffTime - selection.cookingTime,
        cookDuration: selection.cookingTime,
        heatOffTime,
        restSeconds: rest,
        serveOffsetSeconds: serveOffset(selection),
        finishTime,
    };
}

/** The end of the timeline: when the last dish is ready. */
function endOf(items) {
    return items.reduce((latest, item) => Math.max(latest, item.finishTime), 0);
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

    const mealTime = Math.max(0, ...selections.map(leadTime));
    const items = selections.map((selection) => placeItem(selection, mealTime));

    items.sort(byStartTime);

    return { items, mealTime, totalTime: endOf(items) };
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

    // A dish already on the heat pins the meal moment: it will be ready at its
    // existing finishTime, which is mealTime + its own offset.
    let mealTime = 0;
    for (const { selection, inForce } of started) {
        mealTime = Math.max(
            mealTime,
            inForce.finishTime - serveOffset(selection),
        );
    }
    // A waiting dish cannot start in the past, which puts a floor under the
    // meal moment too.
    for (const selection of waiting) {
        mealTime = Math.max(mealTime, elapsedSeconds + leadTime(selection));
    }

    const items = [
        ...started.map(({ selection, inForce }) => ({
            itemId: selection.itemId,
            foodId: selection.foodId,
            foodName: selection.foodName,
            optionLabel: selection.optionLabel,
            // All timings come from the plan in force, not the selection, so both
            // invariants hold even if a caller changes the option of a dish that
            // has already started.
            startTime: inForce.startTime,
            cookDuration: inForce.heatOffTime - inForce.startTime,
            heatOffTime: inForce.heatOffTime,
            restSeconds: inForce.restSeconds,
            serveOffsetSeconds: serveOffset(selection),
            finishTime: inForce.finishTime,
        })),
        ...waiting.map((selection) => {
            const placed = placeItem(selection, mealTime);
            // The clamp is unreachable given the floor above, and is kept as a
            // guard against a future change to how mealTime is chosen.
            return {
                ...placed,
                startTime: Math.max(placed.startTime, elapsedSeconds),
            };
        }),
    ];

    items.sort(byStartTime);

    return { items, mealTime, totalTime: endOf(items) };
}
