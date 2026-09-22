// pages/post.js - Single Post View Page
const PostPage = {
  post: null,
  comments: [],
  userId: null,
  timestamp: null,
  postClickHandler: null,
  postContainerEl: null,
  commentsClickHandler: null,
  commentsContainerEl: null,

  render(container, postId) {
    this.isActive = true;
    if (!postId) {
      container.innerHTML = '<div class="error-message">Post not found</div>';
      return;
    }

    const parts = postId.split('.');
    this.userId = parts[0];
    this.timestamp = parts[1];
    this.postId = postId;
    // This object outlives a single visit, so last visit's comments are still
    // here. renderPost() reads their count, and with a cached post it now
    // runs before loadComments() returns -- which showed the previous post's
    // comment count on the new one.
    this.comments = [];

    // If we got here via "Expand" from feed/profile, that page's card already
    // handed us this exact post -- render it immediately instead of showing
    // a loading state just to re-fetch data we already have.
    const cached = Store.getCachedPost(postId);

    container.innerHTML = `
      <div class="page-container">
        <button type="button" class="btn btn-secondary back-link" id="back-link">Back</button>

        <div id="post-container">
          ${cached ? '' : '<div class="loading">Loading post...</div>'}
        </div>

        <h2>Comments</h2>
        <div class="comment-form">
          <form id="comment-form">
            <!-- position:relative inlined rather than left to main.css - see
                 the same wrapper in create-post.js. -->
            <div class="mention-wrap" style="position: relative;">
              <textarea id="comment-text" placeholder="Write a comment... (type @ to tag someone)" maxlength="5000"></textarea>
              <div id="comment-text-mentions" class="search-dropdown hidden"></div>
            </div>
            <button type="submit" class="btn btn-primary">Post Comment</button>
          </form>
        </div>

        <div id="comments-container"></div>
        <div id="loading-comments" class="hidden">Loading comments...</div>
        <div id="empty-comments" class="hidden">No comments yet. Be the first to comment!</div>
      </div>
    `;

    this.attachEventListeners();

    if (cached) {
      this.post = cached;
      this.renderPost();
    } else {
      this.loadPost();
    }
    this.loadComments();
  },

  destroy() {
    this.isActive = false;
    if (this.postClickHandler && this.postContainerEl) {
      this.postContainerEl.removeEventListener('click', this.postClickHandler);
      this.postClickHandler = null;
      this.postContainerEl = null;
    }
    if (this.commentsClickHandler && this.commentsContainerEl) {
      this.commentsContainerEl.removeEventListener('click', this.commentsClickHandler);
      this.commentsClickHandler = null;
      this.commentsContainerEl = null;
    }
  },

  attachEventListeners() {
    document.getElementById('comment-form')?.addEventListener('submit', this.handleCommentSubmit.bind(this));
    restrictTextInput(document.getElementById('comment-text'));
    // Never let a missing/failed MentionPicker (e.g. a stale cached page from
    // just before a deploy, so this script never loaded) break the rest of
    // this function.
    try {
      this.mentionPicker = MentionPicker.attach(document.getElementById('comment-text'), document.getElementById('comment-text-mentions'));
    } catch (err) {
      console.error('MentionPicker failed to attach:', err);
      this.mentionPicker = null;
    }
    document.getElementById('back-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      history.back();
    });
  },

  async loadPost() {
    const container = document.getElementById('post-container');

    try {
      const result = await api.getPostById(this.postId);
      if (!this.isActive) return;
      this.post = result.post || null;

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

  // Patches just the count instead of calling renderPost() again, which
  // would rebuild the whole card and reload its image/video for a one-word
  // text change.
  updateCommentCount() {
    const el = document.querySelector('#post-container .comment-count');
    if (el) el.textContent = `(${this.comments.length}) comments`;
  },

  // Single delegated listener (see feed.js) - prevents handler accumulation
  // when the post card re-renders after like/unlike.
  attachPostEventListeners() {
    const container = document.getElementById('post-container');
    if (!container || this.postClickHandler) return;

    this.postContainerEl = container;
    this.postClickHandler = (e) => {
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
        this.handleDeletePost();
      }
    };
    container.addEventListener('click', this.postClickHandler);
  },

  async loadComments() {
    const container = document.getElementById('comments-container');
    const loading = document.getElementById('loading-comments');
    const empty = document.getElementById('empty-comments');

    loading?.classList.remove('hidden');

    try {
      const result = await api.getPostComments(this.postId);
      if (!this.isActive) return;
      // The API returns newest-first; reverse so the newest comment ends up
      // at the bottom of the list instead of the top.
      this.comments = (result.comments || []).slice().reverse();

      loading?.classList.add('hidden');
      this.renderComments();
      this.updateCommentCount();
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

    this.comments.forEach(comment => {
      const canDelete = comment.user_id === user?.id;
      const el = createCommentElement(comment, { showDeleteButton: canDelete });
      container.appendChild(el);
    });

    this.attachCommentEventListeners();
  },

  attachCommentEventListeners() {
    const container = document.getElementById('comments-container');
    if (!container || this.commentsClickHandler) return;

    this.commentsContainerEl = container;
    this.commentsClickHandler = (e) => {
      const deleteBtn = e.target.closest('.btn-delete-comment');
      if (deleteBtn && container.contains(deleteBtn)) {
        this.handleDeleteComment({ currentTarget: deleteBtn });
      }
    };
    container.addEventListener('click', this.commentsClickHandler);
  },

  async handleLikeClick(e) {
    const btn = e.currentTarget;
    const postId = this.postId;
    const user = Store.getUser();
    const isLiked = this.post.likes?.some(l => l.userId === user?.id);

    try {
      if (isLiked) {
        await api.unlikePost(postId);
        if (!this.isActive) return;
        this.post.likes = this.post.likes.filter(l => l.userId !== user?.id);
      } else {
        await api.likePost(postId);
        if (!this.isActive) return;
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
      // Falls back to posting the text exactly as typed if the picker never
      // attached - any @[id] typed by hand still works, it just wasn't
      // offered a dropdown to make it easier.
      const resolved = this.mentionPicker ? this.mentionPicker.resolve(text) : { text };
      const result = await api.createComment(this.postId, resolved.text);
      if (!this.isActive) return;
      const user = Store.getUser();

      this.comments.push({
        id: result.commentId,
        post_id: this.postId,
        user_id: user?.id,
        user_email: user?.email,
        text: resolved.text,
        mentions: resolved.mentions,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });

      textarea.value = '';
      this.renderComments();
      this.updateCommentCount();
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
      if (!this.isActive) return;
      this.comments = this.comments.filter(c => c.id != commentId);
      this.renderComments();
      this.updateCommentCount();
      showSuccess('Comment deleted');
    } catch (err) {
      showError(err.message);
    }
  }
};

window.PostPage = PostPage;