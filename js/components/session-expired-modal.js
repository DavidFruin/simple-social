// components/session-expired-modal.js - Session Expired Re-login Modal
const SessionExpiredModal = {
  _resolve: null,
  _retryFn: null,
  _showing: false,

  show(retryFn) {
    if (this._showing && this._resolve) {
      this._retryFn = retryFn;
      return new Promise(resolve => { this._resolve = resolve; });
    }

    this._showing = true;
    this._retryFn = retryFn;

    const user = Store.getUser();
    const email = user?.email || 'Unknown';

    const overlay = document.createElement('div');
    overlay.id = 'session-modal-overlay';
    overlay.className = 'session-modal-overlay';
    overlay.innerHTML = `
      <div class="session-modal">
        <h2>Session Expired</h2>
        <p class="session-modal-email">Logged in as ${escapeHtml(email)}</p>
        <form id="session-relogin-form">
          <div class="form-group">
            <input type="password" id="session-relogin-password" placeholder="Enter your password" required autocomplete="current-password">
          </div>
          <div id="session-relogin-error" class="error-message hidden"></div>
          <button type="submit" class="btn btn-primary btn-full">Re-login</button>
        </form>
        <a href="#" id="session-relogin-logout" class="session-modal-logout">Logout</a>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('session-relogin-form').addEventListener('submit', (e) => this.handleRelogin(e));
    document.getElementById('session-relogin-logout').addEventListener('click', (e) => this.handleLogout(e));

    setTimeout(() => {
      document.getElementById('session-relogin-password')?.focus();
    }, 100);

    return new Promise(resolve => {
      this._resolve = resolve;
    });
  },

  async handleRelogin(e) {
    e.preventDefault();
    const password = document.getElementById('session-relogin-password').value;
    const errorDiv = document.getElementById('session-relogin-error');
    const btn = e.target.querySelector('button[type="submit"]');

    errorDiv.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
      const user = Store.getUser();
      const result = await api.login(user.email, password);

      if (result.jwt) {
        Store.setJwt(result.jwt);

        const userInfo = await api.getMyInfo();
        Store.setUser({
          id: userInfo.id || userInfo.userId,
          userId: userInfo.id || userInfo.userId,
          email: userInfo.email,
          created_at: userInfo.created_at
        });

        const resolve = this._resolve;
        const retryFn = this._retryFn;
        this.close();

        if (resolve) resolve(result.jwt);

        if (retryFn) {
          try {
            await retryFn();
          } catch (err) {
            // Retry failed — not critical, user is re-authenticated
          }
        }
      } else {
        throw new Error('No JWT received');
      }
    } catch (err) {
      errorDiv.textContent = err.message || 'Login failed';
      errorDiv.classList.remove('hidden');
      document.getElementById('session-relogin-password').value = '';
      document.getElementById('session-relogin-password').focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Re-login';
    }
  },

  handleLogout(e) {
    e.preventDefault();
    this.close();
    Store.clear();
    Router.navigate('/login');
  },

  close() {
    const overlay = document.getElementById('session-modal-overlay');
    if (overlay) overlay.remove();
    this._resolve = null;
    this._retryFn = null;
    this._showing = false;
  }
};

window.SessionExpiredModal = SessionExpiredModal;
