// pages/login.js - Login Page
const LoginPage = {
  render(container) {
    container.innerHTML = `
      <div class="page-container">
        <div class="form-card">
          <h1>Login</h1>
          <form id="login-form">
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" required autocomplete="current-password">
            </div>
            <div id="login-message"></div>
            <button type="submit" class="btn btn-primary">Login</button>
          </form>
          <div class="form-footer">
            <a href="#/register">Don't have an account? Register</a>
            <a href="#/reset-password">Forgot password?</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', this.handleSubmit.bind(this));
  },

  async handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value.trim();
    const password = form.password.value;
    const messageDiv = document.getElementById('login-message');
    const submitBtn = form.querySelector('button[type="submit"]');

    messageDiv.textContent = '';
    messageDiv.className = '';

    if (!email || !password) {
      messageDiv.textContent = 'Please fill in all fields';
      messageDiv.className = 'error-message';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
      const result = await api.login(email, password);
      
      if (result.jwt) {
        Store.setJwt(result.jwt);
        
        const userInfo = await api.getMyInfo();
        Store.setUser({
          id: userInfo.id || userInfo.userId,
          userId: userInfo.id || userInfo.userId,
          email: userInfo.email,
          created_at: userInfo.created_at
        });
        
        messageDiv.textContent = 'Login successful! Redirecting...';
        messageDiv.className = 'success-message';
        
        setTimeout(() => {
          Router.navigate('/feed');
        }, 500);
      } else {
        throw new Error('No JWT received');
      }
    } catch (err) {
      messageDiv.textContent = err.message;
      messageDiv.className = 'error-message';
      form.password.value = '';
      form.email.focus();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  }
};

window.LoginPage = LoginPage;