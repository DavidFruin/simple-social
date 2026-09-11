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
    if (changed === 'jwt' || changed === 'user') {
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

function showError(message, container = document.getElementById('main')) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  container.prepend(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
  if (typeof Logger !== 'undefined') Logger.error(message);
}

function showSuccess(message, container = document.getElementById('main')) {
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = message;
  container.prepend(successDiv);
  setTimeout(() => successDiv.remove(), 3000);
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