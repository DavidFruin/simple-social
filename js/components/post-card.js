// components/post-card.js - Post Card Component

function createPostCard(post, options = {}) {
  // So the single-post page can render this exact post instantly if the user
  // taps "Expand" on it, instead of showing a loading state and re-fetching
  // data we already have right here.
  Store.cachePost(post);

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

  // The comment count is a second way into the post, wherever expanding makes
  // sense at all -- on the post's own page there's nowhere to go.
  let commentCountHtml = '';
  if (showCommentCount && showExpandLink) {
    commentCountHtml = `<a href="#/post/${post.id}" class="comment-count">(${commentCount}) comments</a>`;
  } else if (showCommentCount) {
    commentCountHtml = `<span class="comment-count">(${commentCount}) comments</span>`;
  }

  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <a href="#/profile/${post.userID || post.userId || ''}" class="post-user">${displayEmail(post.userEmail || 'User')}</a>
        <span class="post-time">${formatTimestamp(post.timestamp)}</span>
        ${isOwner ? `<button class="btn-delete-post" data-post-id="${post.id}">Delete</button>` : ''}
      </div>
      <div class="post-body">${escapeHtml(post.text)}</div>
      <button type="button" class="btn btn-secondary post-show-more hidden">Show more</button>
      ${mediaHtml}
      <div class="post-footer">
        <div class="like-section">
          ${isOwner ? '' : `<button class="btn-like ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
            ${isLiked ? '♥' : '♡'}
          </button>`}
          ${showLikeDropdown ? `<button class="btn-like-count" data-post-id="${post.id}">(${likeCount}) likes</button>
          <div class="like-dropdown hidden" data-post-id="${post.id}"></div>` : `<span>${likeCount}</span>`}
        </div>
        ${showExpandLink ? `<a href="#/post/${post.id}" class="btn btn-secondary btn-expand">Expand</a>` : ''}
        ${commentCountHtml}
      </div>
    </div>
  `;
}

function createMediaHtml(mediaUrl) {
  if (!mediaUrl) return '';

  const isVideo = mediaUrl.includes('/video/');
  const isAudio = mediaUrl.includes('/audio/');
  const isImage = mediaUrl.includes('/image/');

  if (isImage) {
    return `
      <div class="post-media" data-full-url="${escapeHtml(mediaUrl)}" data-type="image">
        <img src="${escapeHtml(mediaUrl)}" alt="Post media" class="media-thumbnail">
      </div>
    `;
  }

  if (isVideo) {
    // The server saves a WebP of the first frame as thumb_<name>.webp. Older
    // videos have none, in which case the browser shows the video's own frame.
    const posterUrl = mediaUrl.replace(/\/video\/([^/]+)\.[^./]+$/, '/video/thumb_$1.webp');
    return `
      <div class="post-media" data-full-url="${escapeHtml(mediaUrl)}" data-type="video">
        <video src="${escapeHtml(mediaUrl)}" class="media-thumbnail" poster="${escapeHtml(posterUrl)}" preload="metadata" muted playsinline></video>
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

// Escaped email for display, prefixed with "(you)" when it's the logged-in user's.
function displayEmail(email) {
  const current = Store.getUser()?.email;
  const isYou = email && current && email.toLowerCase() === current.toLowerCase();
  return (isYou ? '(you) ' : '') + escapeHtml(email);
}

const NO_DATE_PLACEHOLDER = '0000-00-00 00:00:00';

function formatTimestamp(timestamp) {
  // Missing, "Unknown" (legacy follows predating timestamp tracking), or
  // unparseable -- no real date to show anywhere in the app, so use an
  // all-zero placeholder that's clearly not a real date but still reads as
  // "long ago" rather than leaving a blank, confusing gap.
  if (!timestamp || timestamp === 'Unknown') return NO_DATE_PLACEHOLDER;

  const date = new Date(timestamp.replace(' ', 'T'));
  if (isNaN(date.getTime())) return NO_DATE_PLACEHOLDER;

  if (!Config.showRelativeTimeLabel) return timestamp;

  const now = new Date();
  const diffSeconds = (now - date) / 1000;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  let label = null;
  if (diffSeconds < 60) {
    label = 'just now';
  } else if (date >= startOfToday) {
    label = 'today';
  } else if (date >= startOfWeek) {
    label = 'this week';
  }

  return label ? `${timestamp} (${label})` : timestamp;
}

// Delegated "Show more"/"Show less" toggle for posts whose text is cut off
// by the line-clamp. Installed once at load; works for any dynamically
// re-rendered post card.
if (!window.__showMoreDelegated) {
  window.__showMoreDelegated = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.post-show-more');
    if (!btn) return;
    const body = btn.previousElementSibling;
    if (!body || !body.classList.contains('post-body')) return;
    const expanded = body.classList.toggle('expanded');
    btn.textContent = expanded ? 'Show less' : 'Show more';
  });
}

// Call after inserting post cards into the DOM (feed/profile, where post text
// is line-clamped): shows "Show more" only on posts actually cut off by it,
// not on ones short enough to fit already.
function initPostTruncation(container) {
  container.querySelectorAll('.post-body').forEach((body) => {
    const btn = body.nextElementSibling;
    if (!btn || !btn.classList.contains('post-show-more')) return;
    body.classList.remove('expanded');
    btn.textContent = 'Show more';
    btn.classList.toggle('hidden', body.scrollHeight <= body.clientHeight + 1);
  });
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
window.initPostTruncation = initPostTruncation;

// Updates a post card's like button/count in place after a successful
// like/unlike, instead of re-rendering the whole list -- which caused a
// visible flash as every other post's images/videos reloaded too.
function updatePostLikeUI(postId, isLiked, likeCount) {
  const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
  if (!card) return;

  const likeBtn = card.querySelector('.btn-like');
  if (likeBtn) {
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.textContent = isLiked ? '♥' : '♡';
  }

  const countBtn = card.querySelector('.btn-like-count');
  if (countBtn) {
    countBtn.textContent = `(${likeCount}) likes`;
  } else {
    const countSpan = card.querySelector('.like-section > span');
    if (countSpan) countSpan.textContent = likeCount;
  }
}

window.updatePostLikeUI = updatePostLikeUI;
window.escapeHtml = escapeHtml;
window.displayEmail = displayEmail;
window.formatTimestamp = formatTimestamp;
window.createMediaHtml = createMediaHtml;
