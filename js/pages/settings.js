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
            </select>
          </div>
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

window.SettingsPage = SettingsPage;