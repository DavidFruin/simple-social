// components/post-card.js - Post Card Component

function createPostCard(post, options = {}) {
  const {
    showLikeDropdown = true,
    showExpandLink = true,
    showCommentCount = true,
    commentCount = 0,
    onLike,
    onDelete,
    onClick
  } = options;
  
  const user = Store.getUser();
  const isOwner = user && (post.userId === user.id || post.userID === user.id);
  const isLiked = post.likes?.some(l => l.userId === user?.id);
  const likeCount = post.likes ? post.likes.length : 0;

  const mediaHtml = createMediaHtml(post.mediaUrl);

  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <a href="#/profile/${post.userID || post.userId || ''}" class="post-user">${escapeHtml(post.userEmail || 'User')}</a>
        <span class="post-time">${formatTimestamp(post.timestamp)}</span>
        ${isOwner ? `<button class="btn-delete-post" data-post-id="${post.id}">Delete</button>` : ''}
      </div>
      <div class="post-body">${escapeHtml(post.text)}</div>
      ${mediaHtml}
      <div class="post-footer">
        <div class="like-section">
          <button class="btn-like ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
            ${isLiked ? '♥' : '♡'}
          </button>
          ${showLikeDropdown ? `<button class="btn-like-count" data-post-id="${post.id}">(${likeCount}) likes</button>
          <div class="like-dropdown hidden" data-post-id="${post.id}"></div>` : `<span>${likeCount}</span>`}
        </div>
        ${showExpandLink ? `<a href="#/post/${post.id}" class="btn-expand">Expand</a>` : ''}
        ${showCommentCount ? `<span class="comment-count">(${commentCount}) comments</span>` : ''}
      </div>
    </div>
  `;
}

function createMediaHtml(mediaUrl) {
  if (!mediaUrl) return '';

  const isVideo = mediaUrl.includes('/video/');
  const isAudio = mediaUrl.includes('/audio/');
  const isImage = mediaUrl.includes('/image/');

  let thumbnailUrl = mediaUrl;
  if (isVideo) {
    thumbnailUrl = mediaUrl.replace('/video/', '/video/thumb_');
  }

  if (isImage) {
    return `
      <div class="post-media" data-full-url="${escapeHtml(mediaUrl)}" data-type="image">
        <img src="${escapeHtml(thumbnailUrl)}" alt="Post media" class="media-thumbnail">
      </div>
    `;
  }

  if (isVideo) {
    return `
      <div class="post-media" data-full-url="${escapeHtml(mediaUrl)}" data-type="video">
        <video src="${escapeHtml(thumbnailUrl)}" class="media-thumbnail" poster="${escapeHtml(thumbnailUrl)}" muted></video>
        <div class="video-play-icon">▶</div>
      </div>
    `;
  }

  if (isAudio) {
    return `
      <div class="post-media" data-full-url="${escapeHtml(mediaUrl)}" data-type="audio">
        <audio controls src="${escapeHtml(mediaUrl)}"></audio>
      </div>
    `;
  }

  return '';
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(timestamp) {
  if (!timestamp || timestamp === 'Unknown') return '';
  
  const date = new Date(timestamp.replace(' ', 'T'));
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  
  return date.toLocaleDateString();
}

// Delegated media-viewer handling. Replaces inline onclick= attributes so the
// media URL is never interpolated into an executable JS string context.
// Installed once at load; works for any dynamically re-rendered post card.
if (!window.__mediaViewerDelegated) {
  window.__mediaViewerDelegated = true;
  document.addEventListener('click', (e) => {
    const thumb = e.target.closest('.media-thumbnail');
    if (!thumb) return;
    const wrapper = thumb.closest('.post-media');
    if (!wrapper) return;
    const url = wrapper.getAttribute('data-full-url');
    const type = wrapper.getAttribute('data-type');
    if (url && type && typeof MediaViewer !== 'undefined') {
      MediaViewer.open(url, type);
    }
  });
}

window.createPostCard = createPostCard;
window.escapeHtml = escapeHtml;
window.formatTimestamp = formatTimestamp;
window.createMediaHtml = createMediaHtml;
