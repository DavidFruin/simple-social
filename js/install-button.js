// js/install-button.js - The Install App button's only job: hold onto the
// browser's install prompt (if it offers one) and trigger it on click.
// No browser detection, no dynamic text -- the page around this button is
// plain HTML and always looks the same regardless of browser. If the
// browser never offers an install prompt (iOS Safari, or a browser that
// doesn't support it), clicking does nothing and the static instructions
// printed on the page cover it instead.
(function () {
  const installBtn = document.getElementById('install-btn');
  if (!installBtn) return;

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    const { outcome } = await deferredPrompt.prompt();
    if (outcome === 'accepted') deferredPrompt = null;
  });
})();
