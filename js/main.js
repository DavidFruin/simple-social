// main.js - Bootstrap/Entry Point for Simple Social SPA
// Runs when DOM is loaded

let notificationCheckInterval = null;

function init() {
  Store.init();
  
  if (Store.isLoggedIn()) {
    api.setJwt(Store.getJwt());
  }

  renderHeader();
  Router.init();

  if (Store.isLoggedIn()) {
    startNotificationCheck();
  }

  Store.subscribe((state, changed) => {
    // Store.clear() (logout) notifies with no `changed`, so handle it with
    // login changes: drop page caches so one user never sees another user's
    // cached feed, and refresh the header.
    if (changed === 'jwt' || changed === 'user' || changed === undefined) {
      FeedPage.clearCache();
      ProfilePage.clearCache();
      updateHeaderState();
      if (!Store.isLoggedIn()) {
        stopNotificationCheck();
      } else {
        startNotificationCheck();
      }
    }
    if (changed === 'notificationCount' || changed === 'jwt') {
      updateNotificationBadge();
    }
  });
}

function renderHeader() {
  const header = document.getElementById('header');
  if (!header) return;

  header.innerHTML = `
    <div class="header-content">
      <a href="#/feed" class="logo">Simple Social</a>
      <nav id="main-nav"></nav>
    </div>
  `;

  updateHeaderState();
}

function updateHeaderState() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const logo = document.querySelector('#header .logo');
  if (logo) logo.href = Store.isLoggedIn() ? '#/feed' : '/';

  if (Store.isLoggedIn()) {
    nav.innerHTML = `
      <a href="#/feed">Feed</a>
      <a href="#/create-post">Post</a>
      <a href="#/search">Search</a>
      <a href="#/notifications">
        Notifications
        <span id="notif-badge" class="badge hidden"></span>
      </a>
      <a href="#/profile">Profile</a>
      <a href="#/settings">Settings</a>
      <a href="#" id="logout-btn">Logout</a>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    updateNotificationBadge();
  } else {
    nav.innerHTML = `
      <a href="#/login">Login</a>
      <a href="#/register">Register</a>
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
  Router.navigate('/login');
}

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

// One toast at a time: a new message replaces the current one, and repeating
// the same message flashes it and restarts its timer instead of stacking.
let toastEl = null;
let toastTimer = null;

function showToast(message, type, duration) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.addEventListener('click', hideToast);
    document.body.appendChild(toastEl);
  }

  const isRepeat = toastEl.classList.contains('toast-visible')
    && toastEl.dataset.type === type
    && toastEl.textContent === message;

  toastEl.textContent = message;
  toastEl.dataset.type = type;
  toastEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toastEl.classList.remove('toast-error', 'toast-success', 'toast-flash');
  toastEl.classList.add('toast-' + type, 'toast-visible');

  if (isRepeat) {
    void toastEl.offsetWidth; // restart the flash animation
    toastEl.classList.add('toast-flash');
  }

  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  toastEl?.classList.remove('toast-visible', 'toast-flash');
}

function showError(message) {
  showToast(message, 'error', 5000);
  if (typeof Logger !== 'undefined') Logger.error(message);
}

function showSuccess(message) {
  showToast(message, 'success', 3000);
}

document.addEventListener('DOMContentLoaded', init);
window.showError = showError;
window.showSuccess = showSuccess;
window.updateHeader = updateHeaderState;

window.onerror = function(msg, url, line, col, error) {
  if (typeof Logger !== 'undefined') {
    Logger.error(msg, 'url=' + url + ' line=' + line + ' col=' + col);
  }
};

window.onunhandledrejection = function(event) {
  if (typeof Logger !== 'undefined') {
    const msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled promise rejection';
    Logger.error(msg);
  }
};