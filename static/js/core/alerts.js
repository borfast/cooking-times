/**
 * Alert generation and the missed-alert decision. Pure — no audio, no
 * notifications, no DOM. Announcing is the caller's job; deciding what is
 * worth announcing is this module's.
 */

/** The alerts one dish generates: going on, coming off to rest, and being ready. */
function alertsForItem(item, triggeredAt) {
    const isTriggered = (time) =>
        triggeredAt === null ? false : triggeredAt >= time;

    const alerts = [
        {
            type: 'food-start',
            triggerTime: item.startTime,
            itemId: item.itemId,
            foodName: item.foodName,
            message: `Time to start cooking ${item.foodName}!`,
            triggered: isTriggered(item.startTime),
        },
    ];

    // G25: a resting dish needs telling twice — once to put it on, once to take
    // it off. The rest happens off the heat, so this is a real action.
    if (item.restSeconds > 0) {
        alerts.push({
            type: 'food-rest',
            triggerTime: item.heatOffTime,
            itemId: item.itemId,
            foodName: item.foodName,
            message: `Take the ${item.foodName} off the heat to rest.`,
            triggered: isTriggered(item.heatOffTime),
        });
    }

    // G25: a dish served away from the meal needs announcing on its own, since
    // the finale will not cover it. A dish landing with the meal does not.
    if (item.serveOffsetSeconds) {
        alerts.push({
            type: 'food-ready',
            triggerTime: item.finishTime,
            itemId: item.itemId,
            foodName: item.foodName,
            message: `${item.foodName} is ready.`,
            triggered: isTriggered(item.finishTime),
        });
    }

    return alerts;
}

function byTriggerTime(a, b) {
    return a.triggerTime - b.triggerTime;
}

/**
 * The closing alerts: the meal itself, and the end of the timeline.
 *
 * These are usually the same moment. When something is served late they are not,
 * and conflating them would announce "your meal is ready" after the meal has been
 * sitting there going cold — so the meal gets its own announcement on time and
 * the finale stops claiming to be it.
 */
function closingAlerts(schedule, triggeredAt) {
    const isTriggered = (time) =>
        triggeredAt === null ? false : triggeredAt >= time;
    const mealTime = Number.isFinite(schedule.mealTime)
        ? schedule.mealTime
        : schedule.totalTime;
    const somethingIsLate = mealTime < schedule.totalTime;

    const alerts = [];

    if (somethingIsLate) {
        alerts.push({
            type: 'meal-ready',
            triggerTime: mealTime,
            itemId: null,
            foodName: '',
            message: 'The meal is ready.',
            triggered: isTriggered(mealTime),
        });
    }

    alerts.push({
        type: 'all-done',
        triggerTime: schedule.totalTime,
        itemId: null,
        foodName: '',
        message: somethingIsLate
            ? 'Everything is done.'
            : 'All done! Your meal is ready!',
        triggered: isTriggered(schedule.totalTime),
    });

    return alerts;
}

/** Alerts for every dish phase that needs announcing, plus the closing alerts. */
export function generateAlerts(schedule) {
    const alerts = schedule.items.flatMap((item) => alertsForItem(item, null));
    alerts.push(...closingAlerts(schedule, null));
    // Sort last: the closing alerts are not necessarily last in time. A dish
    // served late finishes after the meal, and partitionDueAlerts relies on the
    // list being in trigger order to pick the most recent one out of a backlog.
    alerts.sort(byTriggerTime);

    return alerts;
}

/**
 * Rebuild the alert list after the schedule changed, without re-announcing
 * anything that already fired.
 *
 * A dish absent from `existingAlerts` is new. It counts as already fired if its
 * start is in the past, so adding a dish mid-cook does not immediately shout.
 *
 * Matching is on `itemId`, not `foodName`: two portions of the same food share a
 * name, and matching on it silenced the second one.
 */
export function regenerateAlerts(schedule, existingAlerts, elapsedSeconds) {
    const existing = existingAlerts || [];

    const alerts = schedule.items.flatMap((item) =>
        alertsForItem(item, elapsedSeconds).map((alert) => {
            const previous = existing.find(
                (candidate) =>
                    candidate.type === alert.type &&
                    candidate.itemId === alert.itemId,
            );
            return previous
                ? { ...alert, triggered: previous.triggered }
                : alert;
        }),
    );
    alerts.push(
        ...closingAlerts(schedule, elapsedSeconds).map((alert) => {
            const previous = existing.find(
                (candidate) => candidate.type === alert.type,
            );
            return previous
                ? { ...alert, triggered: previous.triggered }
                : alert;
        }),
    );
    alerts.sort(byTriggerTime);

    return alerts;
}

/**
 * Split the newly-due alerts into the one worth announcing and the backlog.
 *
 * Reopening a tab after the meal finished makes every remaining alert due in
 * the same frame. Announcing each one means a burst of beeps, a stack of
 * notifications collapsed into one by their shared tag, and a popup showing
 * whichever message happened to be last. Announcing only the most recent and
 * summarising the rest tells the user what they actually need to know.
 */
export function partitionDueAlerts(alerts, elapsedSeconds) {
    const newlyDue = alerts.filter(
        (alert) => !alert.triggered && elapsedSeconds >= alert.triggerTime,
    );

    if (newlyDue.length === 0) {
        return { due: null, missed: [] };
    }

    return {
        due: newlyDue[newlyDue.length - 1],
        missed: newlyDue.slice(0, -1),
    };
}

/** A one-line summary of the alerts that were passed without announcing. */
export function summariseMissed(missed) {
    if (!missed || missed.length === 0) {
        return null;
    }
    const names = missed
        .map((alert) => alert.foodName || 'the finish')
        .filter((name) => name.length > 0);
    return `While you were away: ${names.join(', ')}`;
}
