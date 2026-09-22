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

// Nothing is cached for offline use -- this app is all live data. What this
// handler does is the opposite: it stops the browser serving *stale* app
// code from its own HTTP cache. Deploys don't change filenames, so a device
// could hold one file from before a deploy and another from after, which has
// repeatedly produced bugs that look like code bugs (a script that never
// loads, or CSS missing a rule the JS depends on).
//
// `cache: 'no-cache'` still revalidates rather than re-downloading: unchanged
// files come back 304, so this costs a conditional request, not bandwidth.
// Only same-origin HTML/JS/CSS is touched -- media, api.php and everything
// else keep their normal behaviour.
function isAppCode(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  return /\.(js|css)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }
  if (!isAppCode(event.request, url)) return;

  // Re-fetched by URL rather than by passing the Request along: constructing
  // a request from a navigation request throws, and this only ever runs for
  // same-origin GETs where the URL is all that matters.
  event.respondWith(
    fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' })
      // Offline, or the revalidation itself failed -- fall back to the normal
      // request so a flaky connection degrades to "possibly stale" instead of
      // a dead page.
      .catch(() => fetch(event.request))
  );
});

// The home-screen badge is meant to reflect the notifications page's unseen
// count and change only when "mark as read" is used there -- never on its
// own just because a notification was shown, clicked, or swiped away. Some
// platforms sync the OS badge to the notification tray on their own
// regardless of what this app asked for, so every event below re-applies
// the last known real count to fight that back, rather than trusting
// whatever the OS just did. Cache Storage (not a plain variable) because the
// service worker can be killed and restarted between events.
const BADGE_CACHE = 'badge-count-v1';
const BADGE_KEY = '/__badge-count';

async function setCachedBadgeCount(count) {
  const cache = await caches.open(BADGE_CACHE);
  await cache.put(BADGE_KEY, new Response(JSON.stringify({ count })));
}

async function getCachedBadgeCount() {
  const cache = await caches.open(BADGE_CACHE);
  const res = await cache.match(BADGE_KEY);
  if (!res) return null;
  const data = await res.json();
  return data.count;
}

async function applyBadge(count) {
  if (!('setAppBadge' in self.registration)) return;
  if (count > 0) {
    await self.registration.setAppBadge(count).catch(() => {});
  } else {
    await self.registration.clearAppBadge().catch(() => {});
  }
}

// api.php encrypts {title, body, url, count} into each push. Browsers
// require that every push a site sends results in a visible notification,
// so this always shows one, even if the payload is missing or unreadable.
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

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      if (typeof data.count === 'number') {
        return setCachedBadgeCount(data.count).then(() => applyBadge(data.count));
      }
    })
  );
});

// Focus an already-open tab rather than opening a duplicate, and take it to
// whatever the notification was about.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app.html#/notifications';

  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
      getCachedBadgeCount().then((count) => count != null && applyBadge(count)),
    ])
  );
});

// Fires when a notification is dismissed without being clicked (e.g. swiped
// away) -- re-apply the real count in case that dismissal also touched the
// OS badge on its own.
self.addEventListener('notificationclose', (event) => {
  event.waitUntil(getCachedBadgeCount().then((count) => count != null && applyBadge(count)));
});

// The page relays every count it learns (poll, or right after "mark as
// read") so the cache above never goes stale between pushes.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SET_BADGE_COUNT' || typeof event.data.count !== 'number') return;
  event.waitUntil(setCachedBadgeCount(event.data.count).then(() => applyBadge(event.data.count)));
});
