// pages/settings.js - Account Settings Page
const SettingsPage = {
  render(container) {
    container.innerHTML = `
      <div class="page-container">
        <h1>Account Settings</h1>

        <div class="settings-section">
          <h2>Appearance</h2>
          <div class="form-group">
            <label for="theme-select">Theme</label>
            <select class="form-input" id="theme-select">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="red">Red</option>
              <option value="blue">Blue</option>
              <option value="hacker">Hacker</option>
            </select>
          </div>
          <div class="form-group">
            <label for="hand-toggle">Navigation hand</label>
            <div class="hand-toggle">
              <input type="checkbox" id="hand-toggle" class="hand-toggle-input">
              <span class="hand-toggle-word hand-left">Left</span>
              <label for="hand-toggle" class="hand-toggle-switch"><span></span></label>
              <span class="hand-toggle-word hand-right">Right</span>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2>Notifications</h2>
          <p id="push-status" class="settings-note">Checking...</p>
          <button type="button" id="push-btn" class="btn btn-primary hidden"></button>
        </div>

        <div class="settings-section">
          <h2>Info</h2>
          <ul class="settings-links">
            <li><a href="/about.html">About</a></li>
            <li><a href="/api.html">API</a></li>
            <li><a href="/conduct.html">Code of Conduct</a></li>
            <li><a href="/download.html">Download</a></li>
          </ul>
        </div>

        <div class="settings-section">
          <h2>Delete Account</h2>
          <p class="warning-text">Warning: This action cannot be undone. All your data will be permanently deleted.</p>
          <form id="delete-form">
            <div class="form-group">
              <label for="password">Enter your password to confirm</label>
              <input type="password" class="form-input" id="password" name="password" required autocomplete="current-password">
            </div>
            <div id="delete-message"></div>
            <button type="submit" class="btn btn-danger">Delete My Account</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('delete-form')?.addEventListener('submit', this.handleDeleteSubmit.bind(this));

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.value = Store.getTheme();
      themeSelect.addEventListener('change', this.handleThemeChange.bind(this));
    }

    const handToggle = document.getElementById('hand-toggle');
    if (handToggle) {
      handToggle.checked = Store.getHand() === 'right';
      handToggle.addEventListener('change', this.handleHandChange.bind(this));
    }

    this.initPushSection();
  },

  // Push is per-device, not per-account: whether it's on depends on this
  // browser's own subscription, so it's read from the service worker rather
  // than from the user record.
  async initPushSection() {
    const statusEl = document.getElementById('push-status');
    const btn = document.getElementById('push-btn');
    if (!statusEl || !btn) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      statusEl.textContent = "This browser doesn't support push notifications.";
      return;
    }

    if (Notification.permission === 'denied') {
      statusEl.textContent = 'Notifications are blocked for this site in your browser settings.';
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    this.renderPushState(!!subscription);
    btn.addEventListener('click', this.handlePushClick.bind(this));
  },

  renderPushState(enabled) {
    const statusEl = document.getElementById('push-status');
    const btn = document.getElementById('push-btn');
    if (!statusEl || !btn) return;

    statusEl.textContent = enabled
      ? 'Push notifications are on for this device.'
      : 'Get notified on this device when someone likes, comments on, or follows you.';
    btn.textContent = enabled ? 'Turn off' : 'Turn on';
    btn.dataset.enabled = enabled ? 'true' : 'false';
    btn.classList.remove('hidden');
  },

  async handlePushClick(e) {
    const btn = e.currentTarget;
    const wasEnabled = btn.dataset.enabled === 'true';
    btn.disabled = true;

    try {
      if (wasEnabled) {
        await this.disablePush();
        this.renderPushState(false);
        showSuccess('Push notifications turned off');
      } else {
        await this.enablePush();
        this.renderPushState(true);
        showSuccess('Push notifications turned on');
      }
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  },

  async enablePush() {
    // Must be the first await in the click's call chain -- browsers only
    // allow the permission prompt while still inside the user gesture.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted');

    const result = await api.getVapidPublicKey();
    if (!result.key) throw new Error('Push notifications are not configured on the server yet');

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(result.key)
    });

    const keys = subscription.toJSON().keys;
    await api.savePushSubscription(subscription.endpoint, keys.p256dh, keys.auth);
  },

  async disablePush() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await api.deletePushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  },

  async handleThemeChange(e) {
    const theme = e.target.value;
    const previousTheme = Store.getTheme();

    try {
      await api.updateTheme(theme);
      Store.setUser({ ...Store.getUser(), theme });
      showSuccess('Theme updated');
    } catch (err) {
      e.target.value = previousTheme;
      showError(err.message);
    }
  },

  async handleHandChange(e) {
    const hand = e.target.checked ? 'right' : 'left';

    try {
      await api.updateHand(hand);
      Store.setUser({ ...Store.getUser(), hand });
      showSuccess(`Menu moved to the ${hand}`);
    } catch (err) {
      e.target.checked = !e.target.checked;
      showError(err.message);
    }
  },

  async handleDeleteSubmit(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const messageDiv = document.getElementById('delete-message');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    messageDiv.textContent = '';
    messageDiv.className = '';

    if (!password) {
      messageDiv.textContent = 'Please enter your password';
      messageDiv.className = 'error-message';
      return;
    }

    if (!confirm('Are you absolutely sure? This will delete all your data permanently.')) {
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Deleting...';

    try {
      await api.deleteAccount(password);
      Store.clear();
      showSuccess('Account deleted. Redirecting...');
      setTimeout(() => Router.navigate('/login'), 1500);
    } catch (err) {
      messageDiv.textContent = err.message;
      messageDiv.className = 'error-message';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Delete My Account';
    }
  }
};

// pushManager.subscribe() wants the VAPID key as raw bytes, not base64url.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

window.SettingsPage = SettingsPage;