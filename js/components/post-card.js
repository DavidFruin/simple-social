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
      <div class="post-body">${renderPostText(post.text, post.mentions)}</div>
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

// Turns @[id] tokens (already surviving escapeHtml unchanged, since it's
// only digits/brackets) into a link to that user's profile, showing whatever
// email the server resolved the id to right now -- never the email as typed
// when the mention was made, so it stays correct if that user's email
// changes later. `mentions` is the [{id, email}] array the API attaches to
// the post/comment; a null email (the user was deleted) renders as plain,
// unlinked text instead.
// The one way a post or comment body becomes display HTML: escape, then link
// mentions, then link URLs. Kept as a single function so the two render sites
// (post-card and comment) can't drift apart in how they treat the same text.
// URLs are linked before mentions, and mentions are then kept out of any
// anchor that pass produced. Doing it the other way round split a URL that
// happened to contain an "@[26]" into three pieces: the mention replacement
// fired inside what was about to become the href.
function renderPostText(text, mentions) {
  const withUrls = linkifyUrls(escapeHtml(text));
  return outsideAnchors(withUrls, (segment) => linkifyMentions(segment, mentions));
}

// The input is fully escaped, so there are no tags in it yet and a plain
// replace is safe -- `<` only exists as `&lt;`.
function linkifyUrls(escapedText) {
  return escapedText.replace(/\bhttps?:\/\/[^\s<]+/g, (url) => {
    const { href, trail } = splitTrailingPunctuation(url);
    if (!href) return url;
    // target=_blank keeps the app (and any unsent draft) open; noopener is
    // what stops the opened page reaching back through window.opener.
    return `<a href="${href}" class="post-link" target="_blank" rel="noopener noreferrer">${href}</a>${trail}`;
  });
}

// Applies fn to the parts of the HTML that aren't inside an <a> element, so a
// later pass can't rewrite a link's href or its visible text.
function outsideAnchors(html, fn) {
  return html
    .split(/(<a\b[^>]*>[\s\S]*?<\/a>)/g)
    .map(part => (part.startsWith('<a') ? part : fn(part)))
    .join('');
}

// "look at https://example.com." shouldn't put the full stop inside the link.
// A closing bracket only belongs to the URL if the URL opened one.
//
// A bare ';' is never stripped: the text is already escaped, so `&amp;` and
// `&#39;` end in a semicolon, and cutting it would leave a broken entity.
// Whole trailing entities come off instead, which is what a quote mark
// written after a URL looks like by the time it reaches here.
function splitTrailingPunctuation(url) {
  let href = url;
  let trail = '';

  for (;;) {
    const entity = href.match(/(&[a-zA-Z]+;|&#\d+;)$/);
    if (entity) {
      trail = entity[0] + trail;
      href = href.slice(0, -entity[0].length);
      continue;
    }

    const last = href[href.length - 1];
    if (last === undefined) break;

    if ('.,!?:'.includes(last) || last === ']' || last === '}') {
      trail = last + trail;
      href = href.slice(0, -1);
      continue;
    }

    if (last === ')' && (href.split(')').length > href.split('(').length)) {
      trail = last + trail;
      href = href.slice(0, -1);
      continue;
    }

    break;
  }

  return { href, trail };
}

function linkifyMentions(escapedText, mentions) {
  if (!mentions || !mentions.length) return escapedText;
  const byId = {};
  mentions.forEach(m => { byId[m.id] = m.email; });
  return escapedText.replace(/@\[(\d+)\]/g, (match, id) => {
    const email = byId[id];
    if (!email) return '<span class="mention-deleted">@deleted user</span>';
    return `<a href="#/profile/${id}" class="mention-link">@${escapeHtml(email)}</a>`;
  });
}

// Escaped email for display, prefixed with "(you)" when it's the logged-in user's.
function displayEmail(email) {
  const current = Store.getUser()?.email;
  const isYou = email && current && email.toLowerCase() === current.toLowerCase();
  return (isYou ? '(you) ' : '') + escapeHtml(email);
}

// "3 minutes ago" rather than a date. Used where recency is the point and
// the exact moment isn't - the device list, mainly.
function relativeTime(timestamp) {
  if (!timestamp) return 'unknown';
  const then = new Date(String(timestamp).replace(' ', 'T'));
  if (isNaN(then.getTime())) return 'unknown';

  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';

  // Largest unit that fits wins. Sessions top out at 30 days, so weeks is
  // as coarse as this ever needs to get.
  const units = [['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [label, size] of units) {
    if (seconds < size) continue;
    const count = Math.floor(seconds / size);
    return `${count} ${label}${count === 1 ? '' : 's'} ago`;
  }
  return 'just now';
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
window.linkifyMentions = linkifyMentions;
window.displayEmail = displayEmail;
window.formatTimestamp = formatTimestamp;
window.relativeTime = relativeTime;
window.createMediaHtml = createMediaHtml;
