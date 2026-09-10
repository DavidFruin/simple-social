// pages/post.js - Single Post View Page
const PostPage = {
  post: null,
  comments: [],
  userId: null,
  timestamp: null,

  render(container, postId) {
    if (!postId) {
      container.innerHTML = '<div class="error-message">Post not found</div>';
      return;
    }

    const parts = postId.split('.');
    this.userId = parts[0];
    this.timestamp = parts[1];
    this.postId = postId;

    container.innerHTML = `
      <div class="page-container">
        <a href="#/feed" class="back-link">← Back to Feed</a>
        
        <div id="post-container">
          <div class="loading">Loading post...</div>
        </div>
        
        <h2>Comments</h2>
        <div class="comment-form">
          <form id="comment-form">
            <textarea id="comment-text" placeholder="Write a comment..." maxlength="5000"></textarea>
            <button type="submit" class="btn btn-primary">Post Comment</button>
          </form>
        </div>
        
        <div id="comments-container"></div>
        <div id="loading-comments" class="hidden">Loading comments...</div>
        <div id="empty-comments" class="hidden">No comments yet. Be the first to comment!</div>
      </div>
    `;

    this.attachEventListeners();
    this.loadPost();
    this.loadComments();
  },

  attachEventListeners() {
    document.getElementById('comment-form')?.addEventListener('submit', this.handleCommentSubmit.bind(this));
  },

  async loadPost() {
    const container = document.getElementById('post-container');

    try {
      const result = await api.getUserPosts(this.userId);
      const posts = result.posts || [];
      this.post = posts.find(p => p.id === this.postId);

      if (!this.post) {
        container.innerHTML = '<div class="error-message">Post not found</div>';
        return;
      }

      this.renderPost();
    } catch (err) {
      container.innerHTML = `<div class="error-message">${escapeHtml(err.message)}</div>`;
    }
  },

  renderPost() {
    const container = document.getElementById('post-container');
    if (!this.post) return;

    const user = Store.getUser();
    const isOwner = user && (this.post.userId === user.id || this.post.userID === user.id);
    const isLiked = this.post.likes?.some(l => l.userId === user?.id);
    const likeCount = this.post.likes ? this.post.likes.length : 0;
    const commentCount = this.comments.length;

    container.innerHTML = createPostCard(this.post, {
      showLikeDropdown: true,
      showExpandLink: false,
      showCommentCount: true,
      commentCount: commentCount
    });

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
      btn.addEventListener('click', e => this.handleDeletePost());
    });
  },

  async loadComments() {
    const container = document.getElementById('comments-container');
    const loading = document.getElementById('loading-comments');
    const empty = document.getElementById('empty-comments');

    loading?.classList.remove('hidden');

    try {
      const result = await api.getPostComments(this.postId);
      this.comments = result.comments || [];
      
      loading?.classList.add('hidden');
      this.renderComments();
    } catch (err) {
      loading?.classList.add('hidden');
      showError(err.message);
    }
  },

  renderComments() {
    const container = document.getElementById('comments-container');
    const empty = document.getElementById('empty-comments');

    if (this.comments.length === 0) {
      container.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }

    empty?.classList.add('hidden');
    container.innerHTML = '';

    const user = Store.getUser();
    const isPostOwner = user && (this.post.userId === user.id || this.post.userID === user.id);

    this.comments.forEach(comment => {
      const canDelete = isPostOwner || comment.user_id === user?.id;
      const el = createCommentElement(comment, { showDeleteButton: canDelete });
      container.appendChild(el);
    });

    this.attachCommentEventListeners();
  },

  attachCommentEventListeners() {
    document.querySelectorAll('.btn-delete-comment').forEach(btn => {
      btn.addEventListener('click', e => this.handleDeleteComment(e));
    });
  },

  async handleLikeClick(e) {
    const btn = e.currentTarget;
    const postId = this.postId;
    const user = Store.getUser();
    const isLiked = this.post.likes?.some(l => l.userId === user?.id);

    try {
      if (isLiked) {
        await api.unlikePost(postId);
        this.post.likes = this.post.likes.filter(l => l.userId !== user?.id);
      } else {
        await api.likePost(postId);
        this.post.likes = [...(this.post.likes || []), { userId: user?.id }];
      }
      
      this.renderPost();
    } catch (err) {
      showError(err.message);
    }
  },

  async handleLikeCountClick(e) {
    const btn = e.currentTarget;
    const postId = this.postId;
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

  async handleDeletePost() {
    if (!confirm('Delete this post?')) return;

    try {
      await api.deletePost(this.postId);
      Router.navigate('/feed');
    } catch (err) {
      showError(err.message);
    }
  },

  async handleCommentSubmit(e) {
    e.preventDefault();
    const textarea = document.getElementById('comment-text');
    const text = textarea.value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!text) {
      showError('Please enter a comment');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    try {
      const result = await api.createComment(this.postId, text);
      const user = Store.getUser();
      
      this.comments.unshift({
        id: result.commentId,
        post_id: this.postId,
        user_id: user?.id,
        user_email: user?.email,
        text: text,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });

      textarea.value = '';
      this.renderComments();
      showSuccess('Comment posted!');
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Comment';
    }
  },

  async handleDeleteComment(e) {
    const btn = e.currentTarget;
    const commentId = btn.dataset.commentId;

    if (!confirm('Delete this comment?')) return;

    try {
      await api.deleteComment(commentId);
      this.comments = this.comments.filter(c => c.id != commentId);
      this.renderComments();
      showSuccess('Comment deleted');
    } catch (err) {
      showError(err.message);
    }
  }
};

window.PostPage = PostPage;