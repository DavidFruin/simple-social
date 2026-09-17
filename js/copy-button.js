// js/copy-button.js - Copies the command text next to a clicked .copy-btn
// (its data-copy attribute) to the clipboard, for command-line instructions.
// Doesn't touch any page content -- only the clicked button's own label
// changes, briefly, to confirm the copy.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;

  const text = btn.getAttribute('data-copy') || '';
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    // Clipboard access denied/unavailable -- the command is still selectable
    // and readable in the <pre> right next to the button.
  });
});
