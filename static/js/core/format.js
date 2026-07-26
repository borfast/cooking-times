/**
 * Duration formatting. Pure — no DOM, no clock, no state.
 * All inputs are durations in seconds, never wall-clock timestamps.
 */

function toSeconds(value) {
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** Format a duration as `M:SS`. Negative or unusable input yields `'0:00'`. */
export function formatTime(totalSeconds) {
    const seconds = toSeconds(totalSeconds);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Format a duration as whole minutes, floored. Negative input yields `0`. */
export function formatMinutes(totalSeconds) {
    return Math.floor(toSeconds(totalSeconds) / 60);
}
