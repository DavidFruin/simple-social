// pages/reset-password.js - Password Reset Page
const ResetPasswordPage = {
  step: 1,
  email: '',

  render(container) {
    container.innerHTML = `
      <div class="page-container">
        <div class="form-card">
          <h1>Reset Password</h1>
          <div id="step-1" class="reset-step">
            <form id="email-form">
              <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" required autocomplete="email" placeholder="your@email.com">
              </div>
              <div id="email-message"></div>
              <button type="submit" class="btn btn-primary">Send Verification Code</button>
            </form>
          </div>
          
          <div id="step-2" class="reset-step hidden">
            <p class="step-info">Enter the 6-digit code sent to <strong id="sent-to"></strong></p>
            <form id="otp-form">
              <div class="form-group">
                <label for="otp">Verification Code</label>
                <input type="text" id="otp" name="otp" required maxlength="6" pattern="[0-9]{6}" placeholder="000000" autocomplete="one-time-code">
              </div>
              <div id="otp-message"></div>
              <button type="submit" class="btn btn-primary">Verify Code</button>
              <button type="button" id="resend-btn" class="btn btn-ghost">Resend Code</button>
            </form>
          </div>
          
          <div id="step-3" class="reset-step hidden">
            <p class="step-info">Enter your new password</p>
            <form id="password-form">
              <div class="form-group">
                <label for="password">New Password</label>
                <input type="password" id="password" name="password" required minlength="8" maxlength="25" autocomplete="new-password">
                <div id="password-requirements" class="requirements">
                  <div data-req="length">8-25 characters</div>
                  <div data-req="lower">Lowercase letter</div>
                  <div data-req="upper">Uppercase letter</div>
                  <div data-req="number">Number</div>
                  <div data-req="symbol">Symbol</div>
                </div>
              </div>
              <div class="form-group">
                <label for="confirm">Confirm Password</label>
                <input type="password" id="confirm" name="confirm" required autocomplete="new-password">
              </div>
              <div id="password-message"></div>
              <button type="submit" class="btn btn-primary">Reset Password</button>
            </form>
          </div>
          
          <div class="form-footer">
            <a href="#/login">Remember your password? Login</a>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  },

  attachEventListeners() {
    document.getElementById('email-form')?.addEventListener('submit', this.handleEmailSubmit.bind(this));
    document.getElementById('otp-form')?.addEventListener('submit', this.handleOTPSubmit.bind(this));
    document.getElementById('resend-btn')?.addEventListener('click', this.handleResendOTP.bind(this));
    document.getElementById('password-form')?.addEventListener('submit', this.handlePasswordSubmit.bind(this));
    document.getElementById('password')?.addEventListener('input', this.updatePasswordRequirements.bind(this));
  },

  showStep(step) {
    document.querySelectorAll('.reset-step').forEach(el => el.classList.add('hidden'));
    document.getElementById(`step-${step}`)?.classList.remove('hidden');
    this.step = step;
  },

  async handleEmailSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value.trim();
    const messageDiv = document.getElementById('email-message');
    const submitBtn = form.querySelector('button[type="submit"]');

    messageDiv.textContent = '';
    messageDiv.className = '';

    if (!email) {
      messageDiv.textContent = 'Please enter your email';
      messageDiv.className = 'error-message';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      await api.sendOTP(email);
      this.email = email;
      document.getElementById('sent-to').textContent = email;
      messageDiv.textContent = 'Verification code sent!';
      messageDiv.className = 'success-message';
      this.showStep(2);
      document.getElementById('otp').focus();
    } catch (err) {
      messageDiv.textContent = err.message;
      messageDiv.className = 'error-message';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Verification Code';
    }
  },

  async handleOTPSubmit(e) {
    e.preventDefault();
    const otp = document.getElementById('otp').value.trim();
    const messageDiv = document.getElementById('otp-message');
    const submitBtn = document.querySelector('#otp-form button[type="submit"]');

    messageDiv.textContent = '';
    messageDiv.className = '';

    if (!otp || otp.length !== 6) {
      messageDiv.textContent = 'Please enter a 6-digit code';
      messageDiv.className = 'error-message';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';

    try {
      await api.verifyOTP(this.email, otp);
      messageDiv.textContent = 'Code verified!';
      messageDiv.className = 'success-message';
      this.showStep(3);
      document.getElementById('password').focus();
    } catch (err) {
      messageDiv.textContent = err.message;
      messageDiv.className = 'error-message';
      document.getElementById('otp').value = '';
      document.getElementById('otp').focus();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Code';
    }
  },

  async handleResendOTP() {
    const btn = document.getElementById('resend-btn');
    const messageDiv = document.getElementById('otp-message');

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      await api.sendOTP(this.email);
      messageDiv.textContent = 'New code sent!';
      messageDiv.className = 'success-message';
      this.startResendCountdown();
    } catch (err) {
      messageDiv.textContent = err.message;
      messageDiv.className = 'error-message';
      btn.disabled = false;
      btn.textContent = 'Resend Code';
    }
  },

  startResendCountdown() {
    let countdown = 60;
    const btn = document.getElementById('resend-btn');
    btn.disabled = true;
    
    const interval = setInterval(() => {
      countdown--;
      btn.textContent = `Resend in ${countdown}s`;
      if (countdown <= 0) {
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = 'Resend Code';
      }
    }, 1000);
  },

  updatePasswordRequirements() {
    const password = document.getElementById('password').value;
    const requirements = {
      length: password.length >= 8 && password.length <= 25,
      lower: /[a-z]/.test(password),
      upper: /[A-Z]/.test(password),
      number: /\d/.test(password),
      symbol: /[~!@#$%^&*()_+\-=\[\];'"\/.,<>?:{}|]/.test(password)
    };

    Object.entries(requirements).forEach(([req, met]) => {
      const el = document.querySelector(`[data-req="${req}"]`);
      if (el) {
        el.classList.toggle('met', met);
        el.classList.toggle('unmet', !met);
      }
    });

    return Object.values(requirements).every(Boolean);
  },

  async handlePasswordSubmit(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    const messageDiv = document.getElementById('password-message');
    const submitBtn = document.querySelector('#password-form button[type="submit"]');

    messageDiv.textContent = '';
    messageDiv.className = '';

    if (password !== confirm) {
      messageDiv.textContent = 'Passwords do not match';
      messageDiv.className = 'error-message';
      return;
    }

    if (!this.updatePasswordRequirements()) {
      messageDiv.textContent = 'Password does not meet requirements';
      messageDiv.className = 'error-message';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Resetting...';

    try {
      await api.resetPassword(this.email, password, confirm);
      messageDiv.textContent = 'Password reset! Redirecting to login...';
      messageDiv.className = 'success-message';
      setTimeout(() => Router.navigate('/login'), 2000);
    } catch (err) {
      messageDiv.textContent = err.message;
      messageDiv.className = 'error-message';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';
    }
  }
};

window.ResetPasswordPage = ResetPasswordPage;