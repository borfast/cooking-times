/**
 * The running order as text you can take away from the screen. Pure — no DOM,
 * and deliberately no `Date`.
 *
 * The caller supplies the serve time as a minute-of-day, so this module never
 * reads a clock and stays testable. Clock times are derived for display only;
 * the schedule itself is always seconds from t=0.
 */

import { formatMinutes, formatTime } from './format.js';

const MINUTES_PER_DAY = 24 * 60;

function asClock(minuteOfDay) {
    // Wrap so a meal counted back past midnight reads as the previous evening
    // rather than a negative time.
    const wrapped =
        ((Math.round(minuteOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
        MINUTES_PER_DAY;
    const hours = Math.floor(wrapped / 60);
    const minutes = wrapped % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Wall-clock times for each dish's phases, counting back from the serve time.
 *
 * @param items          schedule items, two-phase
 * @param readyAtMinutes minute-of-day the meal should be ready, or null
 * @returns Map<itemId, { start, heatOff }>, or null when no serve time is set
 */
export function clockTimes(items, readyAtMinutes) {
    if (readyAtMinutes === null || readyAtMinutes === undefined) {
        return null;
    }

    const total = items.reduce(
        (latest, item) => Math.max(latest, item.finishTime),
        0,
    );
    const clockAt = (offsetSeconds) =>
        asClock(readyAtMinutes - (total - offsetSeconds) / 60);

    return new Map(
        items.map((item) => [
            item.itemId,
            {
                start: clockAt(item.startTime),
                heatOff: clockAt(item.heatOffTime),
            },
        ]),
    );
}

/**
 * The running order as plain text, ready for a clipboard or a printout.
 *
 * @param result  a schedule: { items, totalTime }
 * @param options { readyAt } — minute-of-day, or null for offsets from the start
 */
export function runsheetText(result, options) {
    const items = result.items || [];
    const readyAt =
        options && options.readyAt !== undefined ? options.readyAt : null;
    const clocks = items.length > 0 ? clockTimes(items, readyAt) : null;

    const lines = ['Cooking running order', ''];

    if (items.length === 0) {
        lines.push('Nothing on the menu yet.');
        return lines.join('\n');
    }

    const ordered = [...items].sort((a, b) => a.startTime - b.startTime);

    ordered.forEach((item, index) => {
        const at = clocks
            ? clocks.get(item.itemId).start
            : formatTime(item.startTime);
        lines.push(
            `${index + 1}. ${at}  ${item.foodName} (${item.optionLabel})` +
                `  — ${formatMinutes(item.cookDuration)} min`,
        );

        if (item.restSeconds > 0) {
            const offAt = clocks
                ? clocks.get(item.itemId).heatOff
                : formatTime(item.heatOffTime);
            lines.push(
                `     ${offAt}  take off the heat, rest ${formatMinutes(item.restSeconds)} min`,
            );
        }
    });

    lines.push('');
    lines.push(
        readyAt === null
            ? `Total: ${formatMinutes(result.totalTime)} minutes from the first start.`
            : `Ready at ${asClock(readyAt)} — ${formatMinutes(result.totalTime)} minutes in total.`,
    );

    return lines.join('\n');
}
