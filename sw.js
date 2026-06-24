importScripts("assets/js/app-version.js");

const APP_VERSION = self.CONTABILIDAD_APP?.version || "2.6.0";
const CACHE_NAME = `contabilidad-${APP_VERSION}`;
const APP_SHELL = [
    "./",
    "index.html",
    "dashboard.html",
    "modules/dashboard.html",
    "modules/caja-diaria.html",
    "assets/css/styles.css",
    "assets/js/app-version.js",
    "assets/js/contabilidad-auth.js",
    "assets/js/contabilidad-config.js",
    "assets/js/contabilidad-supabase.js",
    "assets/js/dashboard.js"
];
const NETWORK_FIRST_PATHS = new Set([
    "/",
    "/index.html",
    "/sw.js",
    "/assets/js/app-version.js",
    "/assets/css/styles.css",
    "/modules/dashboard.html",
    "/modules/caja-diaria.html",
    "/assets/js/contabilidad-config.js",
    "/assets/js/dashboard.js"
]);

async function putInCache(request, response) {
    if (!response || !response.ok) {
        return;
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
}

async function networkFirst(request) {
    try {
        const freshRequest = new Request(request, { cache: "no-store" });
        const response = await fetch(freshRequest);
        await putInCache(request, response);
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);
    const networkPromise = fetch(request)
        .then(response => {
            putInCache(request, response);
            return response;
        })
        .catch(() => cached || Response.error());

    return cached || networkPromise;
}

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith("contabilidad-") && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    if (NETWORK_FIRST_PATHS.has(url.pathname)) {
        event.respondWith(networkFirst(request));
        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", event => {
    if (event.data?.type === "SKIP_WAITING") {
        self.skipWaiting();
        return;
    }

    if (event.data?.type === "GET_VERSION") {
        event.source?.postMessage({
            type: "VERSION_INFO",
            version: APP_VERSION,
            cacheName: CACHE_NAME
        });
    }
});
