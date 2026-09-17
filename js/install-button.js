// js/install-button.js - Drives the "Install App" section on the download page.
//
// There's no single API to install a PWA everywhere:
//  - Android/Chrome/Edge (and desktop Chrome/Edge) fire 'beforeinstallprompt',
//    which we can hold onto and trigger later from a real button click.
//  - iOS Safari has no install API at all -- the only way is the user
//    manually tapping Share -> Add to Home Screen, so we just show them how.
//  - Other browsers (e.g. Firefox) support neither, so we fall back to a
//    generic "check your browser's menu" message.
(function () {
  const installBtn = document.getElementById('install-btn');
  const statusEl = document.getElementById('install-status');
  const iosInstructions = document.getElementById('ios-instructions');
  const manualInstructions = document.getElementById('manual-instructions');
  if (!installBtn) return;

  function showStatus(message) {
    statusEl.textContent = message;
    statusEl.classList.remove('hidden');
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) {
    showStatus('Simple Social is already installed on this device.');
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    iosInstructions.classList.remove('hidden');
    return;
  }

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBtn.disabled = true;
    const { outcome } = await deferredPrompt.prompt();
    deferredPrompt = null;
    if (outcome === 'accepted') {
      showStatus('Installed! Look for Simple Social on your home screen.');
    } else {
      installBtn.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    installBtn.classList.add('hidden');
    showStatus('Installed! Look for Simple Social on your home screen.');
  });

  // If the browser never offers an install prompt, it doesn't support this --
  // fall back to pointing the user at its menu instead of showing nothing.
  setTimeout(() => {
    if (!deferredPrompt && installBtn.classList.contains('hidden')) {
      manualInstructions.classList.remove('hidden');
    }
  }, 1500);
})();
