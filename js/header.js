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
