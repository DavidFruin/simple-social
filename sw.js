// sw.js - Simple Social service worker
//
// This app is all live data, so there's no offline cache here on purpose --
// caching posts/feeds would just show stale content. Right now this file
// exists only so the browser considers the site installable as a PWA.
// It's also the foundation for push notifications later: a 'push' event
// handler would go here, since receiving a push while the app isn't open
// requires an active service worker.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally not intercepted -- every request goes straight to the
  // network. A fetch handler still has to exist for some install checks.
});
