/**
 * Keep the screen awake while a meal is cooking.
 *
 * A kitchen timer lives on a propped-up phone, and a phone sleeps. Audio and
 * notifications survive that, but the at-a-glance display — the reason to use
 * this over a plain phone timer — does not.
 *
 * Takes the navigator rather than reaching for the global, so the logic is
 * testable outside a browser. Every failure path is silent by design: a kitchen
 * timer must never break because a screen lock was refused.
 *
 * Note that browsers release a screen lock whenever the page becomes hidden, so
 * callers must re-request on `visibilitychange` while still running. `isHeld()`
 * reports the sentinel's real state rather than a cached flag, so a lock dropped
 * by the browser reads as not held.
 *
 * Acquiring is asynchronous while callers are not, so a `release()` can land
 * while a `request()` is still in flight — start() fires a request, the timer
 * completes on the first tick and releases, then the request resolves into a
 * lock nothing will ever let go of. A generation counter discards any request
 * that resolves after a release.
 */
export function createWakeLock(navigatorLike) {
    let sentinel = null;
    let generation = 0;

    const supported = Boolean(navigatorLike?.wakeLock?.request);

    return {
        isSupported() {
            return supported;
        },

        isHeld() {
            return Boolean(sentinel && !sentinel.released);
        },

        async request() {
            if (!supported || this.isHeld()) {
                return;
            }
            const mine = generation;
            try {
                const acquired = await navigatorLike.wakeLock.request('screen');

                if (mine !== generation) {
                    // Released while this was in flight. Let the late lock go
                    // rather than resurrecting one nobody is tracking.
                    try {
                        await acquired.release();
                    } catch {
                        // Going away regardless.
                    }
                    return;
                }

                sentinel = acquired;
            } catch {
                // Browsers refuse while the page is hidden, and some refuse on
                // low battery. Neither is worth surfacing to a cook.
                sentinel = null;
            }
        },

        async release() {
            // Invalidate any request still in flight.
            generation += 1;

            if (!this.isHeld()) {
                sentinel = null;
                return;
            }
            try {
                await sentinel.release();
            } catch {
                // Nothing useful to do; the lock is going away regardless.
            }
            sentinel = null;
        },
    };
}
