import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWakeLock } from '../../static/js/core/wakelock.js';

/** A navigator whose wakeLock behaves like a browser's, or refuses. */
function fakeNavigator({ fail = false } = {}) {
    const sentinels = [];
    return {
        sentinels,
        wakeLock: {
            request: async (type) => {
                if (fail) {
                    throw new Error('refused');
                }
                const sentinel = {
                    type,
                    released: false,
                    release: async () => {
                        sentinel.released = true;
                    },
                };
                sentinels.push(sentinel);
                return sentinel;
            },
        },
    };
}

test('an unsupported browser reports no support and does not throw', async () => {
    const lock = createWakeLock({});

    assert.equal(lock.isSupported(), false);
    await lock.request();
    assert.equal(lock.isHeld(), false);
    await lock.release();
});

test('a supported browser reports support', () => {
    assert.equal(createWakeLock(fakeNavigator()).isSupported(), true);
});

test('request acquires a screen lock and holds it', async () => {
    const navigatorLike = fakeNavigator();
    const lock = createWakeLock(navigatorLike);

    await lock.request();

    assert.equal(lock.isHeld(), true);
    assert.equal(navigatorLike.sentinels.length, 1);
    assert.equal(navigatorLike.sentinels[0].type, 'screen');
});

test('release lets it go and clears the held state', async () => {
    const navigatorLike = fakeNavigator();
    const lock = createWakeLock(navigatorLike);

    await lock.request();
    await lock.release();

    assert.equal(lock.isHeld(), false);
    assert.equal(navigatorLike.sentinels[0].released, true);
});

test('requesting twice does not acquire twice', async () => {
    const navigatorLike = fakeNavigator();
    const lock = createWakeLock(navigatorLike);

    await lock.request();
    await lock.request();

    assert.equal(navigatorLike.sentinels.length, 1);
    assert.equal(lock.isHeld(), true);
});

test('a refused request leaves nothing held and does not throw', async () => {
    const lock = createWakeLock(fakeNavigator({ fail: true }));

    await lock.request();

    assert.equal(lock.isHeld(), false);
});

test('a request can be retried after a refusal', async () => {
    // The browser refuses while hidden and allows once visible, so a refusal must
    // not poison the wrapper.
    const navigatorLike = fakeNavigator({ fail: true });
    const lock = createWakeLock(navigatorLike);
    await lock.request();

    navigatorLike.wakeLock.request = fakeNavigator().wakeLock.request;
    await lock.request();

    assert.equal(lock.isHeld(), true);
});

test('releasing when nothing is held is harmless', async () => {
    const lock = createWakeLock(fakeNavigator());
    await lock.release();
    assert.equal(lock.isHeld(), false);
});

test('a lock the browser drops on its own is no longer reported as held', async () => {
    const navigatorLike = fakeNavigator();
    const lock = createWakeLock(navigatorLike);
    await lock.request();

    // The browser releases screen locks whenever the page is hidden.
    navigatorLike.sentinels[0].released = true;

    assert.equal(lock.isHeld(), false);
});

test('a release during an in-flight request does not leave the lock held', async () => {
    // The real sequence that exposed this: start() fires request() without
    // awaiting, the timer completes on the very first tick and calls release()
    // while the request is still in flight. Without a guard, the request resolves
    // afterwards and re-assigns the sentinel — leaving a phone screen awake all
    // night after the meal finished.
    let resolveRequest;
    const acquired = {
        released: false,
        release: async () => {
            acquired.released = true;
        },
    };
    const navigatorLike = {
        wakeLock: {
            request: () =>
                new Promise((resolve) => {
                    resolveRequest = () => resolve(acquired);
                }),
        },
    };
    const lock = createWakeLock(navigatorLike);

    const pending = lock.request();
    await lock.release();
    resolveRequest();
    await pending;

    assert.equal(
        lock.isHeld(),
        false,
        'lock was resurrected by the late request',
    );
    assert.equal(acquired.released, true, 'the late sentinel was not released');
});
