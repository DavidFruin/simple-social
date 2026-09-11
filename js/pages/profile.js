// pages/profile.js - User Profile Page
const ProfilePage = {
  user: null,
  posts: [],
  commentCounts: {},
  isOwnProfile: false,
  followersCount: 0,
  followingCount: 0,

  render(container, userId) {
    this.isActive = true;
    const currentUser = Store.getUser();
    this.isOwnProfile = !userId || userId === currentUser?.id || userId === currentUser?.userId;
    this.userId = this.isOwnProfile ? currentUser?.id : userId;

    container.innerHTML = `
      <div class="page-container">
        <div id="profile-header">
          <div class="loading">Loading profile...</div>
        </div>
        
        <div id="profile-actions" class="hidden">
          ${this.isOwnProfile ? '' : '<button id="follow-btn" class="btn btn-primary">Follow</button>'}
        </div>
        
        <h2>Posts</h2>
        <div id="posts-container"></div>
        <div id="loading-indicator" class="hidden">Loading...</div>
        <div id="empty-posts" class="hidden">No posts yet.</div>
      </div>
    `;

    this.loadProfile();
  },

  destroy() {
    this.isActive = false;
  },

  async loadProfile() {
    if (!this.userId) {
      this.showError('User not found');
      return;
    }

    const header = document.getElementById('profile-header');
    header.innerHTML = '<div class="loading">Loading profile...</div>';

    try {
      const [userInfo, posts, follows, followers, following] = await Promise.all([
        api.getUserInfo(this.userId),
        api.getUserPosts(this.userId),
        api.getMyFollows(),
        api.getFollowers(this.userId),
        api.getFollows(this.userId)
      ]);

      if (!this.isActive) return;

      this.user = userInfo;
      this.posts = posts.posts || [];
      this.followersCount = (followers.followers || []).length;
      this.followingCount = (following.follows || []).length;
      
      const postIds = this.posts.map(p => p.id).filter(id => id);
      if (postIds.length > 0) {
        try {
          const result = await api.getPostCommentCounts(postIds);
          if (!this.isActive) return;
          this.commentCounts = result.counts;
        } catch (err) {
          console.error('Failed to load comment counts:', err);
        }
      }
      
      const isFollowing = follows.follows?.some(f => 
        (f.id || f.userId) == this.userId
      );

      this.renderProfileHeader();
      this.renderFollowButton(isFollowing);
      this.renderPosts();
      this.attachDropdownListeners();
    } catch (err) {
      this.showError(err.message);
    }
  },

  renderProfileHeader() {
    const header = document.getElementById('profile-header');
    if (!this.user) return;

    header.innerHTML = `
      <div class="profile-info">
        <h1>${escapeHtml(this.user.email || 'User')}</h1>
        <p class="profile-date">Joined ${this.user.created_at ? new Date(this.user.created_at).toLocaleDateString() : 'Unknown'}</p>
        <div class="profile-stats">
          <button class="btn-stat" id="btn-followers">
            <span class="stat-count">${this.followersCount}</span>
            <span class="stat-label">followers</span>
          </button>
          <button class="btn-stat" id="btn-following">
            <span class="stat-count">${this.followingCount}</span>
            <span class="stat-label">following</span>
          </button>
        </div>
        <div id="followers-dropdown" class="user-dropdown hidden"></div>
        <div id="following-dropdown" class="user-dropdown hidden"></div>
      </div>
    `;

    document.getElementById('profile-actions')?.classList.remove('hidden');
  },

  renderFollowButton(isFollowing) {
    const btn = document.getElementById('follow-btn');
    if (!btn || this.isOwnProfile) return;

    btn.textContent = isFollowing ? 'Unfollow' : 'Follow';
    btn.classList.toggle('btn-primary', !isFollowing);
    btn.classList.toggle('btn-secondary', isFollowing);
    btn.dataset.following = isFollowing;

    btn.addEventListener('click', () => this.handleFollowClick());
  },

  renderPosts() {
    const container = document.getElementById('posts-container');
    const emptyState = document.getElementById('empty-posts');
    const loading = document.getElementById('loading-indicator');
    
    if (!this.userId) {
      container.innerHTML = '<div class="loading">Loading posts...</div>';
      return;
    }
    
    loading?.classList.add('hidden');

    if (this.posts.length === 0) {
      container.innerHTML = '';
      emptyState?.classList.remove('hidden');
      return;
    }

    emptyState?.classList.add('hidden');
    
    const user = Store.getUser();
    
container.innerHTML = this.posts.map(post => {
      const isLiked = this.isOwnProfile ? post.likes?.some(l => l.userId === Store.getUser()?.id) : false;
      const likeCount = post.likes ? post.likes.length : 0;
      const commentCount = this.commentCounts[post.id] || 0;

      return createPostCard(post, {
        showLikeDropdown: true,
        showExpandLink: true,
        showCommentCount: true,
        commentCount: commentCount
      });
    }).join('');

    this.attachPostEventListeners();
  },

  attachPostEventListeners() {
    document.querySelectorAll('.btn-like').forEach(btn => {
      btn.addEventListener('click', e => this.handleLikeClick(e));
    });

    document.querySelectorAll('.btn-like-count').forEach(btn => {
      btn.addEventListener('click', e => this.handleLikeCountClick(e));
    });

    document.querySelectorAll('.btn-delete-post').forEach(btn => {
      btn.addEventListener('click', e => this.handleDeleteClick(e));
    });
  },

  async handleFollowClick() {
    const btn = document.getElementById('follow-btn');
    const isFollowing = btn.dataset.following === 'true';

    try {
      if (isFollowing) {
        await api.unfollowUser(this.userId);
        btn.dataset.following = 'false';
        btn.textContent = 'Follow';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        await api.followUser(this.userId);
        btn.dataset.following = 'true';
        btn.textContent = 'Unfollow';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    } catch (err) {
      showError(err.message);
    }
  },

  async handleLikeClick(e) {
    const btn = e.currentTarget;
    const postId = btn.dataset.postId;
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    const user = Store.getUser();
    const isLiked = post.likes?.some(l => l.userId === user?.id);

    try {
      if (isLiked) {
        await api.unlikePost(postId);
        if (!this.isActive) return;
        post.likes = post.likes.filter(l => l.userId !== user?.id);
      } else {
        await api.likePost(postId);
        if (!this.isActive) return;
        post.likes = [...(post.likes || []), { userId: user?.id }];
      }
      
      this.renderPosts();
    } catch (err) {
      showError(err.message);
    }
  },

  async handleDeleteClick(e) {
    const btn = e.currentTarget;
    const postId = btn.dataset.postId;
    
    if (!confirm('Delete this post?')) return;

    try {
      await api.deletePost(postId);
      if (!this.isActive) return;
      this.posts = this.posts.filter(p => p.id !== postId);
      this.renderPosts();
      showSuccess('Post deleted');
    } catch (err) {
      showError(err.message);
    }
  },

  async handleLikeCountClick(e) {
    const btn = e.currentTarget;
    const postId = btn.dataset.postId;
    const dropdown = btn.parentElement.querySelector('.like-dropdown');
    
    if (!dropdown) return;

    if (dropdown.classList.contains('hidden')) {
      dropdown.classList.remove('hidden');
      
      try {
        const result = await api.getPostLikes(postId);
        const likes = result.likes || [];
        
        if (likes.length === 0) {
          dropdown.innerHTML = '<div class="like-dropdown-item">No likes yet</div>';
        } else {
          const userIds = likes.map(l => l.userId).filter(id => id);
          const emailsResult = await api.getUserEmails(userIds);
          const emails = emailsResult.emails || {};
          
          dropdown.innerHTML = likes.map(like => {
            const email = emails[like.userId] || 'User';
            return `
              <a href="#/profile/${like.userId}" class="like-dropdown-item">
                <span class="like-user-email">${escapeHtml(email)}</span>
                <span class="like-user-time">${formatTimestamp(like.timestamp)}</span>
              </a>
            `;
          }).join('');
        }
      } catch (err) {
        dropdown.innerHTML = '<div class="like-dropdown-item">Failed to load likes</div>';
      }
    } else {
      dropdown.classList.add('hidden');
    }
  },

  showError(message) {
    const header = document.getElementById('profile-header');
    if (header) header.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
    const postsContainer = document.getElementById('posts-container');
    if (postsContainer) postsContainer.innerHTML = '';
  },

  attachDropdownListeners() {
    const followersBtn = document.getElementById('btn-followers');
    const followingBtn = document.getElementById('btn-following');
    const followersDropdown = document.getElementById('followers-dropdown');
    const followingDropdown = document.getElementById('following-dropdown');

    followersBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFollowersDropdown(followersDropdown, followingDropdown);
    });

    followingBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFollowingDropdown(followingDropdown, followersDropdown);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.profile-stats')) {
        followersDropdown?.classList.add('hidden');
        followingDropdown?.classList.add('hidden');
      }
    });
  },

  async toggleFollowersDropdown(showDropdown, hideDropdown) {
    hideDropdown?.classList.add('hidden');
    const dropdown = document.getElementById('followers-dropdown');
    if (!dropdown) return;

    if (dropdown.classList.contains('hidden')) {
      dropdown.classList.remove('hidden');
      dropdown.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        const result = await api.getFollowers(this.userId);
        const followers = result.followers || [];
        
        if (followers.length === 0) {
          dropdown.innerHTML = '<div class="user-dropdown-item">No followers yet</div>';
        } else {
          dropdown.innerHTML = followers.map(f => `
            <a href="#/profile/${f.id}" class="user-dropdown-item">
              <span class="user-email">${escapeHtml(f.email)}</span>
              <span class="user-time">${formatTimestamp(f.timestamp)}</span>
            </a>
          `).join('');
        }
      } catch (err) {
        dropdown.innerHTML = '<div class="user-dropdown-item">Failed to load</div>';
      }
    } else {
      dropdown.classList.add('hidden');
    }
  },

  async toggleFollowingDropdown(showDropdown, hideDropdown) {
    hideDropdown?.classList.add('hidden');
    const dropdown = document.getElementById('following-dropdown');
    if (!dropdown) return;

    if (dropdown.classList.contains('hidden')) {
      dropdown.classList.remove('hidden');
      dropdown.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        const result = await api.getFollows(this.userId);
        const following = result.follows || [];
        
        if (following.length === 0) {
          dropdown.innerHTML = '<div class="user-dropdown-item">Not following anyone</div>';
        } else {
          dropdown.innerHTML = following.map(f => `
            <a href="#/profile/${f.id}" class="user-dropdown-item">
              <span class="user-email">${escapeHtml(f.email)}</span>
              <span class="user-time">${formatTimestamp(f.timestamp)}</span>
            </a>
          `).join('');
        }
      } catch (err) {
        dropdown.innerHTML = '<div class="user-dropdown-item">Failed to load</div>';
      }
    } else {
      dropdown.classList.add('hidden');
    }
  }
};

window.ProfilePage = ProfilePage;