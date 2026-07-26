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

/**
 * Would placing `candidate` at `start` be achievable along`placed`?
 *
 * Achievable means the concurrency cap holds across the whole cook window, and
 * no already-placed dish starts within the transition time.
 */
function fits(candidate, start, placed, capacity, transitionSeconds) {
    const heatOff = start + candidate.cookDuration;

    if (transitionSeconds > 0) {
        for (const other of placed) {
            if (Math.abs(other.startTime - start) < transitionSeconds) {
                return false;
            }
        }
    }

    // Check the cap at every boundary inside the proposed window. Concurrency
    // only ever rises at a start, so those are the only points that matter.
    const probes = [start, ...placed.map((other) => other.startTime).filter(
        (time) => time > start && time < heatOff,
    )];

    for (const probe of probes) {
        const overlapping = placed.filter(
            (other) => other.startTime <= probe && other.heatOffTime > probe,
        ).length;
        if (overlapping + 1 > capacity) {
            return false;
        }
    }

    return true;
}

/** Reposition an item to a new start, keeping both phase invariants intact. */
function movedTo(item, start) {
    return {
        ...item,
        startTime: start,
        heatOffTime: start + item.cookDuration,
        finishTime: start + item.cookDuration + item.restSeconds,
    };
}

/**
 * Candidate start times for a dish, drawn from the constraint boundaries rather
 * than a fixed step.
 *
 * A placement only becomes achievable at a boundary: when a ring frees up, when
 * this dish would finish exactly as another starts, or at one transition time
 * either side of an existing start. Stepping by a fixed interval both misses
 * valid placements between steps and wastes work scanning times that cannot
 * change the answer.
 */
function candidateStarts(item, ideal, placed, transitionSeconds) {
    const candidates = new Set([ideal, 0]);

    for (const other of placed) {
        candidates.add(other.heatOffTime);
        candidates.add(other.startTime - item.cookDuration);
        if (transitionSeconds > 0) {
            candidates.add(other.startTime + transitionSeconds);
            candidates.add(other.startTime - transitionSeconds);
        }
    }

    return [...candidates];
}

/**
 * Greedy placement in one direction.
 *
 * Dishes are placed longest-cook-first, since the long ones have the least room
 * to move. Each takes the achievable start nearest its ideal, searching only in
 * `direction` (-1 earlier for stagger, +1 later for extend).
 *
 * This is a heuristic, not an optimum — minimising deviation from a common finish
 * under a concurrency cap is a bin-packing problem, and a greedy pass can leave a
 * resolvable conflict unresolved. When no achievable start exists, the dish keeps
 * its ideal start and the residue is reported by `findConflicts`. An honest
 * conflict beats a silently mangled schedule.
 *
 * The two directions are not equally powerful, and that asymmetry is worth
 * knowing: nothing can start before t=0, so `stagger` has finite room and is
 * best-effort — with dishes of identical length, all already starting at 0, it
 * can do nothing at all. `extend` always has room later, so it always resolves.
 */
function placeGreedily(items, capacity, transitionSeconds, direction) {
    const order = [...items].sort((a, b) => b.cookDuration - a.cookDuration);
    const placed = [];
    const moved = [];

    for (const item of order) {
        const ideal = item.startTime;

        const reachable = candidateStarts(item, ideal, placed, transitionSeconds)
            .filter((start) => start >= 0)
            .filter((start) => (direction < 0 ? start <= ideal : start >= ideal))
            .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));

        const chosen = reachable.find(
            (start) => fits(item, start, placed, capacity, transitionSeconds),
        );

        const start = chosen === undefined ? ideal : chosen;
        placed.push(movedTo(item, start));

        if (start !== ideal) {
            const shift = start - ideal;
            moved.push({
                itemId: item.itemId,
                fromStart: ideal,
                toStart: start,
                ...(shift < 0 ? { finishesEarlyBy: -shift } : { finishesLateBy: shift }),
            });
        }
    }

    placed.sort((a, b) => a.startTime - b.startTime);
    return { items: placed, moved };
}

/**
 * Resolve capacity and transition conflicts according to the chosen strategy.
 *
 * `warn` reports and changes nothing. `stagger` moves conflicting dishes earlier,
 * so they finish before the meal and keep warm — the food waits. `extend` moves
 * them later, so the meal is ready later — you wait. Both desynchronise the
 * finish, because as the module header explains, nothing else can.
 *
 * An unrecognised strategy is treated as `warn`.
 */
export function applyStrategy(items, settings) {
    const source = items || [];
    const capacity = settings.capacity;
    const transitionSeconds = settings.transitionSeconds || 0;
    const strategy = settings.strategy;

    const totalOf = (list) => list.reduce((latest, item) => Math.max(latest, item.finishTime), 0);

    const unchanged = () => ({
        items: source,
        totalTime: totalOf(source),
        conflicts: findConflicts(source, settings),
        strategy: 'warn',
        moved: [],
    });

    if (strategy !== 'stagger' && strategy !== 'extend') {
        return unchanged();
    }

    const conflicts = findConflicts(source, settings);
    if (conflicts.overCapacity.length === 0 && conflicts.tightStarts.length === 0) {
        return { ...unchanged(), strategy };
    }

    const { items: placed, moved } = placeGreedily(
        source,
        capacity,
        transitionSeconds,
        strategy === 'stagger' ? -1 : 1,
    );

    return {
        items: placed,
        totalTime: totalOf(placed),
        conflicts: findConflicts(placed, settings),
        strategy,
        moved,
    };
}
