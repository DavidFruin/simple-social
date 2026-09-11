// pages/search.js - Search Page
const SearchPage = {
  users: [],
  filteredUsers: [],
  followingStatus: {},

  render(container) {
    this.isActive = true;
    container.innerHTML = `
      <div class="page-container">
        <h1>Find Users</h1>
        
        <div class="search-section">
          <div class="search-form">
            <input type="email" id="search-input" placeholder="Search by email..." autocomplete="off">
          </div>
          <div id="search-dropdown" class="search-dropdown hidden"></div>
        </div>
        
        <div id="users-list" class="users-list"></div>
        <div id="loading-indicator" class="hidden">Loading...</div>
      </div>
    `;

    this.loadAllUsers();
    this.attachEventListeners();
  },

  destroy() {
    this.isActive = false;
  },

  attachEventListeners() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-dropdown');

    input?.addEventListener('input', () => {
      const query = input.value.trim();
      if (query.length >= 1) {
        this.filterUsers(query);
      } else {
        dropdown.classList.add('hidden');
        this.renderUsersList(this.users);
      }
    });

    input?.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.classList.add('hidden');
      }, 200);
    });
  },

  async loadAllUsers() {
    const container = document.getElementById('users-list');
    const loading = document.getElementById('loading-indicator');

    loading?.classList.remove('hidden');

    try {
      const result = await api.getUsers();
      this.users = (result.users || []).sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });

      loading?.classList.add('hidden');
      await this.checkFollowingStatus();
      if (!this.isActive) return;
      this.renderUsersList(this.users);
    } catch (err) {
      loading?.classList.add('hidden');
      showError(err.message);
    }
  },

  filterUsers(query) {
    const dropdown = document.getElementById('search-dropdown');
    this.filteredUsers = this.users.filter(u => 
      u.email && u.email.toLowerCase().includes(query.toLowerCase())
    );

    if (this.filteredUsers.length === 0) {
      dropdown.innerHTML = `<p class="search-dropdown-empty">No users matching "${escapeHtml(query)}"</p>`;
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = this.filteredUsers.slice(0, 5).map(user => {
      const userId = user.id || user.userId;
      return `<a href="#/profile/${userId}" class="search-dropdown-item">${escapeHtml(user.email)}</a>`;
    }).join('');

    dropdown.classList.remove('hidden');
  },

  async checkFollowingStatus() {
    const currentUser = Store.getUser();
    const promises = this.users
      .filter(u => (u.id || u.userId) != currentUser?.id)
      .map(async u => {
        try {
          const result = await api.isFollowing(u.id || u.userId);
          this.followingStatus[u.id || u.userId] = result.following;
        } catch {
          this.followingStatus[u.id || u.userId] = false;
        }
      });

    await Promise.all(promises);
  },

  renderUsersList(users) {
    const container = document.getElementById('users-list');
    const currentUser = Store.getUser();

    if (users.length === 0) {
      container.innerHTML = '<p class="search-hint">No users found.</p>';
      return;
    }

    container.innerHTML = users.map(user => {
      const userId = user.id || user.userId;
      const isOwn = userId == currentUser?.id;
      const isFollowing = this.followingStatus[userId] || false;

      return `
        <div class="user-result" data-user-id="${userId}">
          <div class="user-info">
            <a href="#/profile/${userId}" class="user-email">${escapeHtml(user.email)}</a>
            <span class="user-date">Joined ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</span>
          </div>
          ${isOwn ? '<span class="you-label">You</span>' : `
            <button class="btn-follow ${isFollowing ? 'following' : ''}" data-user-id="${userId}">
              ${isFollowing ? 'Following' : 'Follow'}
            </button>
          `}
        </div>
      `;
    }).join('');

    this.attachResultListeners();
  },

  attachResultListeners() {
    document.querySelectorAll('.btn-follow').forEach(btn => {
      btn.addEventListener('click', e => this.handleFollowClick(e));
    });
  },

  async handleFollowClick(e) {
    const btn = e.currentTarget;
    const userId = btn.dataset.userId;
    const isFollowing = btn.classList.contains('following');

    try {
      if (isFollowing) {
        await api.unfollowUser(userId);
        btn.classList.remove('following');
        btn.textContent = 'Follow';
        this.followingStatus[userId] = false;
      } else {
        await api.followUser(userId);
        btn.classList.add('following');
        btn.textContent = 'Following';
        this.followingStatus[userId] = true;
      }
    } catch (err) {
      showError(err.message);
    }
  }
};

window.SearchPage = SearchPage;