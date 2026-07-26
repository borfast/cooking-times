/**
 * The cook's finite resources. Pure — no DOM, no clock, no state.
 *
 * Two constraints are modelled:
 *
 *  - **Capacity** — how many dishes can be on the heat at once. Rings, pans,
 *    oven shelves; whatever runs out first. Only `[startTime, heatOffTime)`
 *    counts, so a resting joint occupies nothing.
 *  - **Transition time** — how long each start actually costs you in draining,
 *    seasoning and finding the lid. Two starts closer together than this are
 *    not both achievable, however the arithmetic looks.
 *
 * A note on why resolving a conflict must break the synchronised finish: when
 * every dish is ready at a common time T, dish i is on the heat over
 * [T - rest_i - cook_i, T - rest_i]. Raising T translates every interval right
 * by the same amount, so the overlap pattern does not change. Capacity conflicts
 * are a property of the durations alone, and the only way out is to let some
 * dishes finish at a different time from the rest.
 */

import { formatTime } from './format.js';

export const KITCHEN_DEFAULTS = { capacity: 4, transitionSeconds: 0, strategy: 'warn' };

/**
 * How many dishes are on the heat over time, as maximal constant-count segments.
 *
 * Boundaries are half-open: a dish coming off at 300 does not collide with one
 * going on at 300.
 */
export function concurrencyProfile(items) {
    if (!items || items.length === 0) {
        return [];
    }

    const boundaries = [...new Set(items.flatMap((item) => [item.startTime, item.heatOffTime]))]
        .sort((a, b) => a - b);

    const segments = [];
    for (let index = 0; index < boundaries.length - 1; index += 1) {
        const from = boundaries[index];
        const to = boundaries[index + 1];
        const onHeat = items.filter((item) => item.startTime <= from && item.heatOffTime > from);

        if (onHeat.length === 0) {
            continue;
        }

        const previous = segments[segments.length - 1];
        const itemIds = onHeat.map((item) => item.itemId);

        // Merge with the previous segment when the same dishes are on the heat
        // and the segments touch, so the profile stays maximal.
        if (
            previous
            && previous.to === from
            && previous.count === itemIds.length
            && previous.itemIds.every((id, position) => id === itemIds[position])
        ) {
            previous.to = to;
        } else {
            segments.push({ from, to, count: itemIds.length, itemIds });
        }
    }

    return segments;
}

/** Merge touching segments so one long overload reads as one problem. */
function mergeWindows(segments) {
    const merged = [];

    for (const segment of segments) {
        const previous = merged[merged.length - 1];
        if (previous && previous.to === segment.from) {
            previous.to = segment.to;
            previous.count = Math.max(previous.count, segment.count);
            previous.itemIds = [...new Set([...previous.itemIds, ...segment.itemIds])];
        } else {
            merged.push({ ...segment, itemIds: [...segment.itemIds] });
        }
    }

    return merged;
}

/**
 * Where this schedule asks more of the kitchen than it has.
 *
 * @param items    schedule items, two-phase
 * @param settings { capacity, transitionSeconds }
 */
export function findConflicts(items, settings) {
    const capacity = settings.capacity;
    const transitionSeconds = settings.transitionSeconds || 0;
    const profile = concurrencyProfile(items || []);

    const overCapacity = mergeWindows(profile.filter((segment) => segment.count > capacity));

    const tightStarts = [];
    if (transitionSeconds > 0 && items) {
        const byStart = [...items].sort((a, b) => a.startTime - b.startTime);
        for (let index = 1; index < byStart.length; index += 1) {
            const gap = byStart[index].startTime - byStart[index - 1].startTime;
            if (gap < transitionSeconds) {
                tightStarts.push({
                    itemIds: [byStart[index - 1].itemId, byStart[index].itemId],
                    gap,
                    at: byStart[index - 1].startTime,
                });
            }
        }
    }

    return {
        overCapacity,
        tightStarts,
        worstConcurrency: profile.reduce((peak, segment) => Math.max(peak, segment.count), 0),
    };
}

/** Human-readable conflict lines, in the cook's terms rather than the model's. */
export function describeConflicts(conflicts, items) {
    const nameOf = (itemId) => {
        const item = (items || []).find((candidate) => candidate.itemId === itemId);
        return item ? item.foodName : itemId;
    };

    const lines = conflicts.overCapacity.map((window) => {
        const names = window.itemIds.map(nameOf).join(', ');
        return `${window.count} dishes on the heat at ${formatTime(window.from)} — ${names}`;
    });

    for (const tight of conflicts.tightStarts) {
        const [first, second] = tight.itemIds.map(nameOf);
        lines.push(
            `${first} and ${second} start ${tight.gap} seconds apart, `
            + `at ${formatTime(tight.at)}`,
        );
    }

    return lines;
}
