// components/session-expired-modal.js - Session Expired Re-login Modal
//
// Page load fires more than one authenticated request at once (main.js
// renders the feed while header.js's own DOMContentLoaded handler starts
// polling notifications, independently) - with an expired session, both
// can 401 around the same moment and both call show(). _waiters queues
// every caller waiting on this one login, rather than a single {resolve,
// retryFn} slot: a second concurrent call used to silently overwrite the
// first's, orphaning its promise forever (nothing left to resolve it),
// which is what showed up as a page stuck on "Loading..." after re-login -
// the caller that got clobbered never found out login succeeded.
const SessionExpiredModal = {
  _waiters: [], // [{ resolve, retryFn }, ...] - one entry per concurrent caller
  _showing: false,

  show(retryFn) {
    const promise = new Promise(resolve => {
      this._waiters.push({ resolve, retryFn });
    });

    if (this._showing) return promise;
    this._showing = true;

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
            <input type="password" id="session-relogin-password" class="form-input" placeholder="Enter your password" required autocomplete="current-password">
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

    return promise;
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

        const waiters = this._waiters;
        this._waiters = [];
        this.close();

        // Each waiter is a separate caller's original failed request - its
        // own retry, resolved with its own result. Sequential rather than
        // Promise.all so one throwing can't stop the others from finishing;
        // errors below already fall back to undefined, same as before.
        for (const { resolve, retryFn } of waiters) {
          let retryResult;
          if (retryFn) {
            try {
              retryResult = await retryFn();
            } catch (err) {
              retryResult = undefined;
            }
          }
          resolve(retryResult);
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
    // Every waiter's original request is moot once we're headed to the
    // login page - resolve them with undefined rather than leaving them
    // hanging (the previous single-slot version left its one _resolve
    // uncalled here; harmless when there was at most one caller, but with
    // a queue that would pile up unresolved promises instead of just one).
    const waiters = this._waiters;
    this._waiters = [];
    for (const { resolve } of waiters) resolve(undefined);
    this.close();
    Store.clear();
    Router.navigate('/login');
  },

  close() {
    const overlay = document.getElementById('session-modal-overlay');
    if (overlay) overlay.remove();
    this._showing = false;
  }
};

window.SessionExpiredModal = SessionExpiredModal;
