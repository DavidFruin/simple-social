// js/pwa.js - Registers the service worker so the site is installable.
// Loaded on every page (not just app.html) since either the landing page or
// the app itself may be the first page a visitor hits.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
