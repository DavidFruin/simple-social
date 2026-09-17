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
            <span id="notif-badge" class="badge hidden"></span>
          </a>
          <a href="/app.html#/profile">Profile</a>
          <a href="/app.html#/settings">Settings</a>
          <a href="#" id="logout-btn">Logout</a>
        </nav>
      </div>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    // Just reflects whatever count Store already has -- actually fetching it
    // is startNotificationCheck()'s job (called once on load, then every
    // 60s), not something to redo on every re-render of this header.
    updateNotificationBadge();
  } else {
    header.innerHTML = `
      <div class="header-content">
        <a href="/" class="logo">Simple Social</a>
        <nav>
          <a href="/about.html">About</a>
          <a href="/api.html">API</a>
          <a href="/conduct.html">Code of Conduct</a>
          <a href="/download.html">Download</a>
          <a href="/app.html#/register">Register</a>
          <a href="/app.html#/login">Login</a>
        </nav>
      </div>
    `;
  }

  renderThumbNav();
}

// Bottom-right corner bubble menu -- only shown on real touch devices (see
// the (hover: none) and (pointer: coarse) media query in main.css), never on
// a shrunk desktop browser window. Fans the same nav items out along a
// quarter-circle arc above/left of the corner, since that's the only
// direction guaranteed to stay on-screen from a bottom-right anchor.
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
    { href: '/app.html#/notifications', label: 'Notifications' },
    { href: '/app.html#/profile', label: 'Profile' },
    { href: '/app.html#/settings', label: 'Settings' },
    { href: '#', label: 'Logout', logout: true }
  ];
  const radius = 150;
  const angleStep = 90 / (items.length - 1);

  const itemsHtml = items.map((item, i) => {
    const rad = (angleStep * i) * Math.PI / 180;
    const tx = (-radius * Math.sin(rad)).toFixed(1);
    const ty = (-radius * Math.cos(rad)).toFixed(1);
    return `
      <a href="${item.href}" class="thumb-nav-item" style="--tx: ${tx}px; --ty: ${ty}px; transition-delay: ${i * 25}ms;"${item.logout ? ' data-logout="true"' : ''}>
        <span class="thumb-nav-label">${item.label}</span>
        <span class="thumb-nav-dot"></span>
      </a>
    `;
  }).join('');

  const isNew = !container;
  if (isNew) {
    container = document.createElement('div');
    container.id = 'thumb-nav';
    document.body.appendChild(container);
  }

  container.innerHTML = `
    <button type="button" id="thumb-nav-toggle" class="thumb-nav-toggle" aria-label="Menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
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

      const item = e.target.closest('.thumb-nav-item');
      if (item) {
        container.classList.remove('open');
        document.getElementById('thumb-nav-toggle')?.setAttribute('aria-expanded', 'false');
        if (item.dataset.logout) {
          e.preventDefault();
          handleLogout(e);
        }
      }
    });
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;

  const count = Store.getNotificationCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
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
window.updateNotificationBadge = updateNotificationBadge;
window.startNotificationCheck = startNotificationCheck;
window.stopNotificationCheck = stopNotificationCheck;
window.checkNotifications = checkNotifications;
