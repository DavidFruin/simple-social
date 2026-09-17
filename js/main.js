// main.js - Bootstrap/Entry Point for Simple Social SPA
// Runs when DOM is loaded
//
// Header rendering, notification polling, and logout live in header.js,
// shared with the static pages (about/api/conduct/download.html) so a
// logged-in user sees the same navigation there too.

function init() {
  Store.init();

  if (Store.isLoggedIn()) {
    api.setJwt(Store.getJwt());
  }

  Router.init();

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