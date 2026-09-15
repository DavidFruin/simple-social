// pages/feed.js - News Feed Page
const FeedPage = {
  posts: [],
  commentCounts: {},
  offset: 0,
  limit: 25,
  hasMore: true,
  loading: false,
  scrollHandler: null,
  scrollDebounce: null,
  postsClickHandler: null,
  postsContainerEl: null,

  render(container) {
    this.isActive = true;
    container.innerHTML = `
      <div class="page-container">
        <h1>News Feed</h1>
        
        <div id="posts-container"></div>
        <div id="loading-indicator" class="hidden">Loading...</div>
        <div id="empty-feed" class="hidden">
          <p>Your feed is empty.</p>
          <p>Follow some users or create your first post!</p>
          <a href="#/search" class="btn btn-secondary">Find Users</a>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.loadPosts();
  },

  attachEventListeners() {
    this.scrollHandler = () => {
      if (this.scrollDebounce) return;
      this.scrollDebounce = setTimeout(() => {
        this.scrollDebounce = null;
        if (!this.hasMore || this.loading) return;
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = document.documentElement.scrollTop;
        const clientHeight = document.documentElement.clientHeight;
        if (scrollTop + clientHeight >= scrollHeight - 100) {
          this.loadMorePosts();
        }
      }, 150);
    };
    window.addEventListener('scroll', this.scrollHandler);
  },

  destroy() {
    this.isActive = false;
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
    if (this.scrollDebounce) {
      clearTimeout(this.scrollDebounce);
      this.scrollDebounce = null;
    }
    if (this.postsClickHandler && this.postsContainerEl) {
      this.postsContainerEl.removeEventListener('click', this.postsClickHandler);
      this.postsClickHandler = null;
      this.postsContainerEl = null;
    }
  },

  async loadPosts() {
    this.offset = 0;
    this.posts = [];
    const container = document.getElementById('posts-container');
    container.innerHTML = '';
    
    await this.fetchPosts();
  },

  async loadMorePosts() {
    if (!this.hasMore || this.loading) return;
    this.loading = true;
    await this.fetchPosts(this.offset);
  },

  async fetchPosts(offset = 0) {
    this.loading = true;
    document.getElementById('loading-indicator')?.classList.remove('hidden');

    try {
      const result = await api.fetchFollowedPosts(offset, this.limit);
      
      if (!this.isActive) return;
      
      if (offset === 0) {
        this.posts = result.posts || [];
      } else {
        this.posts = [...this.posts, ...(result.posts || [])];
      }
      
      this.hasMore = result.hasMore;
      this.offset = this.posts.length;
      
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
      
      this.renderPosts();
    } catch (err) {
      showError(err.message);
    } finally {
      this.loading = false;
      document.getElementById('loading-indicator')?.classList.add('hidden');
    }
  },

  renderPosts() {
    const container = document.getElementById('posts-container');
    const emptyState = document.getElementById('empty-feed');

    if (this.posts.length === 0) {
      container.innerHTML = '';
      emptyState?.classList.remove('hidden');
      return;
    }

    emptyState?.classList.add('hidden');
    
    container.innerHTML = this.posts.map(post => this.renderPostCard(post)).join('');
    
    this.attachPostEventListeners();
  },

  renderPostCard(post) {
    const commentCount = this.commentCounts[post.id] || 0;
    return createPostCard(post, {
      showLikeDropdown: true,
      showExpandLink: true,
      showCommentCount: true,
      commentCount: commentCount
    });
  },

  // Single delegated listener on the container, attached once. Re-rendering the
  // post list replaces innerHTML, so per-button listeners would accumulate on
  // every render (memory leak + duplicate handler firing).
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
        post.likes = [...(post.likes || []), { userId: user?.id, timestamp: new Date().toISOString() }];
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
  }
};

window.FeedPage = FeedPage;