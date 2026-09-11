// components/comment.js - Comment Component
// Comment rendering is currently done inline in post.js
// This file can be used for additional comment functionality if needed

function createCommentElement(comment, options = {}) {
  const { showDeleteButton = false } = options;

  const user = Store.getUser();
  const isOwner = user && comment.user_id === user.id;

  const div = document.createElement('div');
  div.className = 'comment';
  div.dataset.commentId = comment.id;

  div.innerHTML = `
    <div class="comment-header">
      <a href="#/profile/${comment.user_id}" class="comment-user">${escapeHtml(comment.user_email || 'User')}</a>
      <span class="comment-time">${formatTimestamp(comment.created_at)}</span>
      ${isOwner && showDeleteButton ? '<button class="btn-delete-comment" data-comment-id="' + comment.id + '">×</button>' : ''}
    </div>
    <div class="comment-body">${escapeHtml(comment.text)}</div>
  `;

  return div;
}

window.createCommentElement = createCommentElement;