// pages/settings.js - Account Settings Page
const SettingsPage = {
  render(container) {
    container.innerHTML = `
      <div class="page-container">
        <h1>Account Settings</h1>
        
        <div class="settings-section">
          <h2>Delete Account</h2>
          <p class="warning-text">Warning: This action cannot be undone. All your data will be permanently deleted.</p>
          <form id="delete-form">
            <div class="form-group">
              <label for="password">Enter your password to confirm</label>
              <input type="password" id="password" name="password" required autocomplete="current-password">
            </div>
            <div id="delete-message"></div>
            <button type="submit" class="btn btn-danger">Delete My Account</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('delete-form')?.addEventListener('submit', this.handleDeleteSubmit.bind(this));
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