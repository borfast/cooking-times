/**
 * Cache-first service worker for the app shell (G16).
 *
 * A kitchen has bad wifi, and a timer that dies when the connection drops is
 * useless. Everything the app needs is precached on install, so both pages work
 * with no network at all.
 *
 * The shell list is generated from the files on disk rather than maintained by
 * hand, because a missing entry only fails once the network is gone — precisely
 * when it must not.
 *
 * Bump CACHE_VERSION when any shell file changes.
 */

const CACHE_VERSION = 'cooking-times-v1';

const SHELL = [
    './',
    './index.html',
    './timer.html',
    './manifest.webmanifest',
    './static/css/styles.css',
    './static/vendor/fonts.css',
    './static/vendor/alpine-3.13.3.min.js',
    './static/vendor/fonts/fraunces-latin-7f9d191d.woff2',
    './static/vendor/fonts/fraunces-latin-ext-a21ecfbf.woff2',
    './static/vendor/fonts/manrope-latin-a30ddcd3.woff2',
    './static/vendor/fonts/manrope-latin-ext-3911b66d.woff2',
    './static/js/planning.js',
    './static/js/timer.js',
    './static/js/core/alerts.js',
    './static/js/core/foods.js',
    './static/js/core/format.js',
    './static/js/core/runsheet.js',
    './static/js/core/schedule.js',
    './static/js/core/storage.js',
    './static/js/core/wakelock.js',
    './static/foods.json',
    './static/icons/icon-192.png',
    './static/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name)),
            ))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then((cached) => {
            if (cached) {
                return cached;
            }
            return fetch(request).catch(() => {
                // A navigation with nothing cached and no network: fall back to
                // the planning page rather than a browser error.
                if (request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return Response.error();
            });
        }),
    );
});
