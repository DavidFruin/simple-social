// components/mention-picker.js - "@" autocomplete for post/comment composers
//
// Wires up a textarea so typing "@word" opens a dropdown of matching users
// (mirrors search.js's filter-as-you-type, just not sharing its state since
// that page's list is scoped to the search UI). Picking someone inserts
// their email as plain, readable text - the textarea never shows the
// "@[id]" token the server actually stores. attach() returns a controller
// whose resolve(text) converts each still-present inserted span into that
// token right before submit; a span the user has since edited away is left
// as plain text instead of guessing.

const MentionPicker = {
  _users: null,
  _usersPromise: null,

  async loadUsers() {
    if (this._users) return this._users;
    if (!this._usersPromise) {
      this._usersPromise = api.getUsers()
        .then(r => { this._users = r.users || []; return this._users; })
        .catch(() => { this._usersPromise = null; return []; });
    }
    return this._usersPromise;
  },

  attach(textarea, dropdown) {
    if (!textarea || !dropdown) return { resolve: (text) => ({ text, mentions: [] }) };

    // Each picked mention: the literal "@email" span inserted into the
    // textarea, and the user it refers to.
    const picked = [];
    // Index of the "@" that opened the dropdown currently showing, or -1.
    let triggerAt = -1;

    const close = () => {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      triggerAt = -1;
    };

    const showMatches = async (query) => {
      const users = await this.loadUsers();
      const q = query.toLowerCase();
      const matches = users.filter(u => u.email && u.email.toLowerCase().includes(q)).slice(0, 5);

      if (!matches.length) {
        dropdown.innerHTML = query
          ? `<p class="search-dropdown-empty">No users matching "${escapeHtml(query)}"</p>`
          : '';
        dropdown.classList.toggle('hidden', !query);
        return;
      }

      dropdown.innerHTML = matches.map(u =>
        `<div class="search-dropdown-item mention-option" data-id="${u.id}" data-email="${escapeHtml(u.email)}">${escapeHtml(u.email)}</div>`
      ).join('');
      dropdown.classList.remove('hidden');
    };

    textarea.addEventListener('input', () => {
      const pos = textarea.selectionStart;
      // "@" at the start of the text or right after whitespace, with no
      // whitespace between it and the caret - i.e. still mid-token.
      const match = textarea.value.slice(0, pos).match(/(?:^|\s)@(\w*)$/);
      if (!match) { close(); return; }
      triggerAt = pos - match[1].length - 1;
      showMatches(match[1]);
    });

    // mousedown (not click) fires before the textarea blurs, so
    // selectionStart/triggerAt are still whatever they were while typing.
    dropdown.addEventListener('mousedown', (e) => {
      const option = e.target.closest('.mention-option');
      if (!option || triggerAt < 0) return;
      e.preventDefault();

      const id = option.dataset.id;
      const email = option.dataset.email;
      const insert = '@' + email + ' ';
      const pos = textarea.selectionStart;

      textarea.value = textarea.value.slice(0, triggerAt) + insert + textarea.value.slice(pos);
      const newPos = triggerAt + insert.length;
      textarea.setSelectionRange(newPos, newPos);
      // Programmatic value changes don't fire 'input', so anything else
      // listening on the textarea (char counter, draft save) still runs.
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      picked.push({ id, email, text: '@' + email });
      close();
      textarea.focus();
    });

    textarea.addEventListener('blur', () => setTimeout(close, 200));

    return {
      // Replaces each picked span still present in `text` with "@[id]",
      // left to right, one occurrence per pick (so tagging the same person
      // twice converts both). Returns the resolved mentions actually used,
      // for callers that render the result before the server round-trips.
      resolve(text) {
        let result = text;
        const mentions = [];
        for (const p of picked) {
          const idx = result.indexOf(p.text);
          if (idx === -1) continue;
          result = result.slice(0, idx) + '@[' + p.id + ']' + result.slice(idx + p.text.length);
          mentions.push({ id: Number(p.id), email: p.email });
        }
        return { text: result, mentions };
      }
    };
  }
};

window.MentionPicker = MentionPicker;
