// js/os-toggle.js - Switches between per-OS install steps on the download
// page. Each `.os-tabs` group holds `.os-tab` buttons (data-os); clicking
// one shows the `.os-panel` with a matching data-os and hides the others,
// scoped to the nearest `.os-instructions` wrapper so multiple tool
// sections can each have their own independent toggle.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.os-tab');
  if (!btn) return;

  const scope = btn.closest('.os-instructions');
  if (!scope) return;
  const os = btn.getAttribute('data-os');

  scope.querySelectorAll('.os-tab').forEach((b) => {
    b.classList.toggle('btn-primary', b === btn);
    b.classList.toggle('btn-ghost', b !== btn);
  });

  scope.querySelectorAll('.os-panel').forEach((p) => {
    p.hidden = p.getAttribute('data-os') !== os;
  });
});
