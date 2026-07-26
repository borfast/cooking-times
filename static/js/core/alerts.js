/**
 * Alert generation and the missed-alert decision. Pure — no audio, no
 * notifications, no DOM. Announcing is the caller's job; deciding what is
 * worth announcing is this module's.
 */

/** One alert per dish start, plus a finale for the meal. */
export function generateAlerts(schedule) {
    const alerts = schedule.items.map((item) => ({
        type: 'food-start',
        triggerTime: item.startTime,
        foodName: item.foodName,
        message: `Time to start cooking ${item.foodName}!`,
        triggered: false,
    }));

    alerts.push({
        type: 'all-done',
        triggerTime: schedule.totalTime,
        foodName: '',
        message: 'All done! Your meal is ready!',
        triggered: false,
    });

    return alerts;
}

/**
 * Rebuild the alert list after the schedule changed, without re-announcing
 * anything that already fired.
 *
 * A dish absent from `existingAlerts` is new. It counts as already fired if its
 * start is in the past, so adding a dish mid-cook does not immediately shout.
 */
export function regenerateAlerts(schedule, existingAlerts, elapsedSeconds) {
    const existing = existingAlerts || [];

    const alerts = schedule.items.map((item) => {
        const previous = existing.find(
            (alert) => alert.type === 'food-start' && alert.foodName === item.foodName,
        );
        return {
            type: 'food-start',
            triggerTime: item.startTime,
            foodName: item.foodName,
            message: `Time to start cooking ${item.foodName}!`,
            triggered: previous ? previous.triggered : elapsedSeconds >= item.startTime,
        };
    });

    const previousFinale = existing.find((alert) => alert.type === 'all-done');
    alerts.push({
        type: 'all-done',
        triggerTime: schedule.totalTime,
        foodName: '',
        message: 'All done! Your meal is ready!',
        triggered: previousFinale ? previousFinale.triggered : false,
    });

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
