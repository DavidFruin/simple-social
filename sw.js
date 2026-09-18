// sw.js - Simple Social service worker
//
// This app is all live data, so there's no offline cache here on purpose --
// caching posts/feeds would just show stale content. This file makes the
// site installable as a PWA, and handles incoming push messages, which can
// arrive while the app isn't open.

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

// api.php encrypts {title, body, url} into each push. Browsers require that
// every push a site sends results in a visible notification, so this always
// shows one, even if the payload is missing or unreadable.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const title = data.title || 'Simple Social';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/pwa-icons/icon-192.png',
    badge: '/pwa-icons/icon-192.png',
    data: { url: data.url || '/app.html#/notifications' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an already-open tab rather than opening a duplicate, and take it to
// whatever the notification was about.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app.html#/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
