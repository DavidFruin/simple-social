// pages/profile.js - User Profile Page
const ProfilePage = {
  user: null,
  posts: [],
  commentCounts: {},
  postsClickHandler: null,
  postsContainerEl: null,
  loadMoreClickHandler: null,
  isOwnProfile: false,
  followersCount: 0,
  followingCount: 0,
  offset: 0,
  limit: 25,
  hasMore: true,
  loading: false,
  isFollowing: false,
  scrollPosition: 0,
  outsideClickHandler: null,

  render(container, userId, { restore = false } = {}) {
    this.isActive = true;
    const currentUser = Store.getUser();
    const isOwnProfile = !userId || userId === currentUser?.id || userId === currentUser?.userId;
    const targetUserId = isOwnProfile ? currentUser?.id : userId;

    // Back/forward into the same profile with data already loaded: redraw from
    // cache and restore scroll. Nav clicks and other profiles load fresh.
    const isSameProfileCached = restore && this.userId === targetUserId && !!this.user;

    this.isOwnProfile = isOwnProfile;
    this.userId = targetUserId;

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
        <div class="load-more-container">
          <button id="load-more-btn" class="btn btn-secondary hidden">Load More</button>
        </div>
        <div id="empty-posts" class="hidden">No posts yet.</div>
      </div>
    `;

    this.loadMoreClickHandler = () => this.loadMorePosts();
    document.getElementById('load-more-btn')?.addEventListener('click', this.loadMoreClickHandler);

    if (isSameProfileCached) {
      this.renderProfileHeader();
      this.renderFollowButton(this.isFollowing);
      this.renderPosts();
      this.attachDropdownListeners();
      window.scrollTo(0, this.scrollPosition);
    } else {
      this.clearCache();
      this.userId = targetUserId;
      this.loadProfile();
    }
  },

  clearCache() {
    this.user = null;
    this.userId = null;
    this.posts = [];
    this.commentCounts = {};
    this.offset = 0;
    this.hasMore = true;
    this.isFollowing = false;
    this.scrollPosition = 0;
  },

  destroy() {
    this.isActive = false;
    this.scrollPosition = window.scrollY;
    this.removeOutsideClickHandler();
    if (this.postsClickHandler && this.postsContainerEl) {
      this.postsContainerEl.removeEventListener('click', this.postsClickHandler);
      this.postsClickHandler = null;
      this.postsContainerEl = null;
    }
    this.loadMoreClickHandler = null;
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
        api.getUserPosts(this.userId, 0, this.limit),
        api.getMyFollows(),
        api.getFollowers(this.userId),
        api.getFollows(this.userId)
      ]);

      if (!this.isActive) return;

      this.user = userInfo;
      this.posts = posts.posts || [];
      this.hasMore = !!posts.hasMore;
      this.offset = this.posts.length;
      this.followersCount = (followers.followers || []).length;
      this.followingCount = (following.follows || []).length;
      
      const postIds = this.posts.map(p => p.id).filter(id => id);
      if (postIds.length > 0) {
        try {
          const result = await api.getPostCommentCounts(postIds);
          if (!this.isActive) return;
          this.commentCounts = { ...this.commentCounts, ...result.counts };
        } catch (err) {
          console.error('Failed to load comment counts:', err);
        }
      }
      
      this.isFollowing = follows.follows?.some(f =>
        (f.id || f.userId) == this.userId
      );

      this.renderProfileHeader();
      this.renderFollowButton(this.isFollowing);
      this.renderPosts();
      this.attachDropdownListeners();
    } catch (err) {
      this.showError(err.message);
    }
  },

  async loadMorePosts() {
    if (!this.hasMore || this.loading || !this.userId) return;
    this.loading = true;
    document.getElementById('loading-indicator')?.classList.remove('hidden');

    try {
      const result = await api.getUserPosts(this.userId, this.offset, this.limit);
      if (!this.isActive) return;

      this.posts = [...this.posts, ...(result.posts || [])];
      this.hasMore = !!result.hasMore;
      this.offset = this.posts.length;

      const postIds = this.posts.map(p => p.id).filter(id => id);
      if (postIds.length > 0) {
        try {
          const counts = await api.getPostCommentCounts(postIds);
          if (!this.isActive) return;
          this.commentCounts = { ...this.commentCounts, ...counts.counts };
        } catch (err) {
          console.error('Failed to load comment counts:', err);
        }
      }

      this.renderPosts();
    } catch (err) {
      showError(err.message);
    } finally {
      this.loading = false;
      document.getElementById('loading-indicator')?.classList.add('hidden');
    }
  },

  renderProfileHeader() {
    const header = document.getElementById('profile-header');
    if (!this.user) return;

    header.innerHTML = `
      <div class="profile-info">
        <h1>${displayEmail(this.user.email || 'User')}</h1>
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
    const loadMoreBtn = document.getElementById('load-more-btn');

    if (!this.userId) {
      container.innerHTML = '<div class="loading">Loading posts...</div>';
      return;
    }

    loading?.classList.add('hidden');

    if (this.posts.length === 0) {
      container.innerHTML = '';
      emptyState?.classList.remove('hidden');
      loadMoreBtn?.classList.add('hidden');
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

    loadMoreBtn?.classList.toggle('hidden', !this.hasMore);

    this.attachPostEventListeners();
  },

  // Single delegated listener (see feed.js) - prevents handler accumulation
  // across re-renders of the post list.
  attachPostEventListeners() {
    const container = document.getElementById('posts-container');
    if (!container || this.postsClickHandler) return;

    this.postsContainerEl = container;
    this.postsClickHandler = (e) => {
      const likeBtn = e.target.closest('.btn-like');
      if (likeBtn && container.contains(likeBtn)) {
        this.handleLikeClick({ currentTarget: likeBtn });
        return;
      }

      const likeCountBtn = e.target.closest('.btn-like-count');
      if (likeCountBtn && container.contains(likeCountBtn)) {
        this.handleLikeCountClick({ currentTarget: likeCountBtn });
        return;
      }

      const deleteBtn = e.target.closest('.btn-delete-post');
      if (deleteBtn && container.contains(deleteBtn)) {
        this.handleDeleteClick({ currentTarget: deleteBtn });
      }
    };
    container.addEventListener('click', this.postsClickHandler);
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
        this.isFollowing = false;
      } else {
        await api.followUser(this.userId);
        btn.dataset.following = 'true';
        btn.textContent = 'Unfollow';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        this.isFollowing = true;
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
                <span class="like-user-email">${displayEmail(email)}</span>
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

    // One document-level listener for the page, replaced on each render and
    // removed in destroy() so they don't pile up across visits.
    this.removeOutsideClickHandler();
    this.outsideClickHandler = (e) => {
      if (!e.target.closest('.profile-stats')) {
        followersDropdown?.classList.add('hidden');
        followingDropdown?.classList.add('hidden');
      }
    };
    document.addEventListener('click', this.outsideClickHandler);
  },

  removeOutsideClickHandler() {
    if (!this.outsideClickHandler) return;
    document.removeEventListener('click', this.outsideClickHandler);
    this.outsideClickHandler = null;
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
              <span class="user-email">${displayEmail(f.email)}</span>
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
              <span class="user-email">${displayEmail(f.email)}</span>
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