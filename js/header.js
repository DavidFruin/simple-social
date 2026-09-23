// js/header.js - Renders the site header and keeps it current.
//
// Shared by app.html and the static pages (about/api/conduct/download.html)
// so a logged-in user always sees the app's usual navigation there too,
// not the logged-out landing-page menu. Self-initializing: works whether
// the page also runs main.js (the SPA) or not.

function renderHeader() {
  const header = document.getElementById('header');
  if (!header) return;

  if (Store.isLoggedIn()) {
    header.innerHTML = `
      <div class="header-content">
        <a href="/app.html#/feed" class="logo">Simple Social</a>
        <nav id="main-nav">
          <a href="/app.html#/feed">Feed</a>
          <a href="/app.html#/create-post">Post</a>
          <a href="/app.html#/search">Search</a>
          <a href="/app.html#/notifications">
            Notifications
            <span class="badge notif-badge hidden"></span>
          </a>
          <a href="/app.html#/profile">Profile</a>
          <a href="/app.html#/settings">Settings</a>
        </nav>
      </div>
    `;
  } else {
    header.innerHTML = `
      <div class="header-content">
        <a href="/" class="logo">Simple Social</a>
        <nav>
          <a href="/about.html">About</a>
          <a href="/api.html">API</a>
          <a href="/conduct.html">Code of Conduct</a>
          <a href="/roadmap.html">Roadmap</a>
          <a href="/download.html">Download</a>
          <a href="/app.html#/register">Register</a>
          <a href="/app.html#/login">Login</a>
        </nav>
      </div>
    `;
  }

  renderThumbNav();
  renderScrollTopButton();
  // After both, since each one draws its own badge. Only reflects whatever
  // count Store already has -- actually fetching it is startNotificationCheck()'s
  // job (called once on load, then every 60s), not something to redo on
  // every re-render of this header.
  updateNotificationBadge();
}

// Bottom-corner bubble menu -- only shown on real touch devices (see the
// (hover: none) and (pointer: coarse) media query in main.css), never on a
// shrunk desktop browser window. Fans the nav items out along a quarter-circle
// arc that sweeps up and inward from whichever corner the user's hand setting
// puts it in, since that's the only direction sure to stay on-screen.
function renderThumbNav() {
  let container = document.getElementById('thumb-nav');

  if (!Store.isLoggedIn()) {
    container?.remove();
    return;
  }

  const items = [
    { href: '/app.html#/feed', label: 'Feed' },
    { href: '/app.html#/create-post', label: 'Post' },
    { href: '/app.html#/search', label: 'Search' },
    { href: '/app.html#/notifications', label: 'Notifications', badge: true },
    { href: '/app.html#/profile', label: 'Profile' },
    { href: '/app.html#/settings', label: 'Settings' }
  ];
  const radius = 150;
  const angleStep = 90 / (items.length - 1);
  // Left-handed mirrors the whole thing into the other corner: the arc sweeps
  // toward the opposite side and the labels hang off the other edge of their
  // dots (see .thumb-nav-left in main.css), so the rotations flip sign too.
  const mirror = Store.getHand() === 'left' ? -1 : 1;

  const itemsHtml = items.map((item, i) => {
    const angle = angleStep * i;
    const rad = angle * Math.PI / 180;
    const tx = (mirror * -radius * Math.sin(rad)).toFixed(1);
    const ty = (-radius * Math.cos(rad)).toFixed(1);
    // Labels hang off the dot's outer edge, so rotating by (90 - angle) swings
    // that edge around to face straight out from the center: level at the
    // arc's far end, vertical at its top. Level labels all pointed the same
    // way and ran over each other near the top, where items are barely a few
    // pixels apart vertically.
    const rot = (mirror * (90 - angle)).toFixed(1);
    return `
      <a href="${item.href}" class="thumb-nav-item" style="--tx: ${tx}px; --ty: ${ty}px; --rot: ${rot}deg; transition-delay: ${i * 25}ms;">
        <span class="thumb-nav-label">${item.label}</span>
        <span class="thumb-nav-dot"></span>
        ${item.badge ? '<span class="badge notif-badge thumb-nav-item-badge hidden"></span>' : ''}
      </a>
    `;
  }).join('');

  const isNew = !container;
  if (isNew) {
    container = document.createElement('div');
    container.id = 'thumb-nav';
    document.body.appendChild(container);
  }
  container.classList.toggle('thumb-nav-left', mirror === -1);

  container.innerHTML = `
    <button type="button" id="thumb-nav-toggle" class="thumb-nav-toggle" aria-label="Menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <span class="badge notif-badge thumb-nav-badge hidden"></span>
    <div class="thumb-nav-items">${itemsHtml}</div>
  `;

  // Delegated on the container (which persists across re-renders) rather
  // than on the toggle/items directly, since those get replaced every time
  // renderThumbNav() runs -- a direct listener would need re-attaching (and
  // would leak) on every nav-triggered header re-render.
  if (isNew) {
    container.addEventListener('click', (e) => {
      const toggle = e.target.closest('#thumb-nav-toggle');
      if (toggle) {
        const open = container.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }

      // Picking anything closes the menu; the link itself handles navigating.
      if (e.target.closest('.thumb-nav-item')) {
        container.classList.remove('open');
        document.getElementById('thumb-nav-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

// Updates every badge on the page: the header nav's, and the one on the
// thumb bubble that stands in for it on touch devices, where the header nav
// is hidden. Also sets the PWA's home-screen icon badge, for when the app
// isn't even open -- unsupported browsers just no-op the call.
// Floating "back to top" button. Takes the bottom corner opposite the thumb
// bubble so the two can never overlap, which means it swaps sides along with
// the hand setting. Shown only once there's enough page above you to bother.
const SCROLL_TOP_THRESHOLD = 400;

function renderScrollTopButton() {
  let btn = document.getElementById('scroll-top-btn');

  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'scroll-top-btn';
    btn.type = 'button';
    btn.className = 'scroll-top-btn';
    btn.setAttribute('aria-label', 'Scroll to top');
    btn.textContent = '↑';
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);

    window.addEventListener('scroll', updateScrollTopButton, { passive: true });
  }

  btn.classList.toggle('scroll-top-right', Store.getHand() === 'left');
  updateScrollTopButton();
}

function updateScrollTopButton() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;

  btn.classList.toggle('visible', window.scrollY > SCROLL_TOP_THRESHOLD);
}

function updateNotificationBadge() {
  const count = Store.getNotificationCount();

  document.querySelectorAll('.notif-badge').forEach(badge => {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.toggle('hidden', count === 0);
  });

  // Only touch the home-screen badge once the count is actually known.
  // Otherwise every app launch would clear it before the first poll returns,
  // making the number vanish without anyone hitting "Mark as Seen".
  if (Store.isNotificationCountLoaded()) {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
    // Keeps the service worker's own cached count in sync so it has the
    // right value to re-apply the next time it sees a notification event
    // (shown, clicked, swiped away) with no page open to ask.
    navigator.serviceWorker?.controller?.postMessage({ type: 'SET_BADGE_COUNT', count });
  }
}

async function handleLogout(e) {
  e.preventDefault();
  try {
    await api.logout();
  } catch (err) {
    console.log('Logout API error (non-critical):', err.message);
  }
  Store.clear();
  // An absolute href navigates to app.html from a static page, and is just
  // a same-document hash change (no reload) if we're already there.
  window.location.href = '/app.html#/login';
}

let notificationCheckInterval = null;

function startNotificationCheck() {
  if (notificationCheckInterval) return;

  checkNotifications();
  notificationCheckInterval = setInterval(checkNotifications, 60000);
}

function stopNotificationCheck() {
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }
}

async function checkNotifications() {
  if (!Store.isLoggedIn()) {
    stopNotificationCheck();
    return;
  }

  try {
    const result = await api.getUnseenNotificationCount();
    Store.setNotificationCount(result.count);
  } catch (err) {
    console.log('Notification check error:', err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  Store.init();
  if (Store.isLoggedIn()) api.setJwt(Store.getJwt());
  renderHeader();
  if (Store.isLoggedIn()) startNotificationCheck();
});

window.renderHeader = renderHeader;
window.updateHeaderState = renderHeader;
window.handleLogout = handleLogout;
window.updateNotificationBadge = updateNotificationBadge;
window.startNotificationCheck = startNotificationCheck;
window.stopNotificationCheck = stopNotificationCheck;
window.checkNotifications = checkNotifications;
