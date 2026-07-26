/**
 * The only place that knows how this app uses localStorage.
 *
 * Every function takes the storage object as its first argument rather than
 * reaching for a global, so the logic is testable outside a browser and the
 * pages cannot quietly diverge on key names or shapes again.
 */

export const PLAN_KEY = 'cooking-schedule';
export const SESSION_KEY = 'cooking-timer-session';

function readJson(storage, key) {
    const raw = storage.getItem(key);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** The selections saved by the planning page. `[]` when absent or unusable. */
export function readPlan(storage) {
    const data = readJson(storage, PLAN_KEY);
    return data && Array.isArray(data.selectedFoods) ? data.selectedFoods : [];
}

/**
 * Save the planning page's selections.
 *
 * Deliberately stores only `selectedFoods`. The old code also wrote an `items`
 * array with every startTime forced to 0, which nothing ever read.
 */
export function writePlan(storage, selections) {
    storage.setItem(PLAN_KEY, JSON.stringify({ selectedFoods: selections }));
}

/** The saved timer session. `null` when absent, corrupt, or shapeless. */
export function readSession(storage) {
    const session = readJson(storage, SESSION_KEY);
    return session && typeof session.status === 'string' ? session : null;
}

export function writeSession(storage, session) {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(storage) {
    storage.removeItem(SESSION_KEY);
}

/** True when discarding this session would throw away a cook in progress. */
export function isSessionLive(session) {
    return session ? session.status === 'running' || session.status === 'paused' : false;
}

export const CUSTOM_FOODS_KEY = 'cooking-custom-foods';
export const OVERRIDES_KEY = 'cooking-time-overrides';

/** Foods the user added themselves. Merged with the bundled catalogue at load. */
export function readCustomFoods(storage) {
    const data = readJson(storage, CUSTOM_FOODS_KEY);
    return Array.isArray(data) ? data : [];
}

export function writeCustomFoods(storage, foods) {
    storage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
}

/**
 * Remembered time corrections, keyed `foodId:optionId`.
 *
 * The bundled durations are approximations that ignore quantity, thickness,
 * method and starting temperature. Rather than fake a thermal model, the app
 * lets you correct a dish and remembers the correction for next time.
 */
export function readOverrides(storage) {
    const data = readJson(storage, OVERRIDES_KEY);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

export function writeOverride(storage, foodId, optionId, seconds) {
    const overrides = readOverrides(storage);
    const key = `${foodId}:${optionId}`;
    if (seconds === null || seconds === undefined) {
        delete overrides[key];
    } else {
        overrides[key] = seconds;
    }
    storage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}
