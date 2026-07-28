const CACHE_NAME = 'owl-watcher-admin-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/admin-logic.js',
    'https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// Fetch Assets
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});
