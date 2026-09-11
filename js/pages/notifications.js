// pages/notifications.js - Notifications Page
const NotificationsPage = {
  notifications: [],
  postPreviews: {},

  render(container) {
    this.isActive = true;
    container.innerHTML = `
      <div class="page-container">
        <h1>Notifications</h1>
        <div class="notifications-header">
          <button id="mark-seen-btn" class="btn btn-secondary">Mark as Seen</button>
        </div>
        <div id="notifications-container">
          <div class="loading">Loading notifications...</div>
        </div>
        <div id="empty-notifications" class="hidden">
          <p>No notifications yet.</p>
          <p>When someone follows you or interacts with your posts, you'll see it here.</p>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.loadNotifications();
  },

  destroy() {
    this.isActive = false;
  },

  attachEventListeners() {
    document.getElementById('mark-seen-btn')?.addEventListener('click', () => this.handleMarkSeen());
  },

  async loadNotifications() {
    const container = document.getElementById('notifications-container');
    const empty = document.getElementById('empty-notifications');

    try {
      const result = await api.getNotifications();
      if (!this.isActive) return;
      this.notifications = result.notifications || [];

      if (this.notifications.length === 0) {
        container.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
      }

      empty?.classList.add('hidden');
      await this.loadPostPreviews();
      if (!this.isActive) return;
      this.renderNotifications();
    } catch (err) {
      container.innerHTML = `<div class="error-message">${escapeHtml(err.message)}</div>`;
    }
  },

  async loadPostPreviews() {
    const postIds = [...new Set(
      this.notifications
        .filter(n => n.post_id)
        .map(n => n.post_id)
    )];

    if (postIds.length === 0) return;

    const promises = postIds.map(async (postId) => {
      try {
        const result = await api.getPostById(postId);
        if (result.post && result.post.text) {
          this.postPreviews[postId] = result.post.text.substring(0, 25) + '...';
        }
      } catch (err) {
        this.postPreviews[postId] = null;
      }
    });

    await Promise.all(promises);
  },

  async handleMarkSeen() {
    const btn = document.getElementById('mark-seen-btn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      await api.markNotificationsSeen();
      Store.setNotificationCount(0);
      showSuccess('Notifications marked as seen');
      this.loadNotifications();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Mark as Seen';
    }
  },

  renderNotifications() {
    const container = document.getElementById('notifications-container');
    
    const grouped = this.groupNotificationsByDate();

    let html = '';

    if (grouped.today.length) {
      html += '<div class="notification-group"><h3>Today</h3>';
      html += grouped.today.map(n => this.renderNotificationItem(n)).join('');
      html += '</div>';
    }

    if (grouped.yesterday.length) {
      html += '<div class="notification-group"><h3>Yesterday</h3>';
      html += grouped.yesterday.map(n => this.renderNotificationItem(n)).join('');
      html += '</div>';
    }

    if (grouped.earlier.length) {
      html += '<div class="notification-group"><h3>Earlier</h3>';
      html += grouped.earlier.map(n => this.renderNotificationItem(n)).join('');
      html += '</div>';
    }

    container.innerHTML = html;
  },

  groupNotificationsByDate() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const grouped = { today: [], yesterday: [], earlier: [] };

    this.notifications.forEach(n => {
      const date = new Date(n.created_at.replace(' ', 'T'));
      if (date >= today) {
        grouped.today.push(n);
      } else if (date >= yesterday) {
        grouped.yesterday.push(n);
      } else {
        grouped.earlier.push(n);
      }
    });

    return grouped;
  },

  renderNotificationItem(notification) {
    const icon = this.getNotificationIcon(notification.type);
    const text = this.getNotificationText(notification);
    const link = this.getNotificationLink(notification);
    const postPreview = notification.post_id ? this.postPreviews[notification.post_id] : null;

    return `
      <div class="notification-item" data-notification-id="${notification.id}">
        <a href="${link}" class="notification-content">
          <span class="notification-icon">${icon}</span>
          <div class="notification-text-container">
            <span class="notification-text">${text}</span>
            ${postPreview ? `<div class="notification-post-preview">"${escapeHtml(postPreview)}"</div>` : ''}
          </div>
        </a>
        <span class="notification-time">${formatTimestamp(notification.created_at)}</span>
      </div>
    `;
  },

  getNotificationIcon(type) {
    switch (type) {
      case 'follow': return '👤';
      case 'like': return '♥';
      case 'unlike': return '💔';
      case 'comment': return '💬';
      case 'unfollow': return '👤';
      default: return '🔔';
    }
  },

  getNotificationText(notification) {
    const actor = escapeHtml(notification.actor_email || 'Someone');
    switch (notification.type) {
      case 'follow': return `${actor} followed you`;
      case 'unfollow': return `${actor} unfollowed you`;
      case 'like': return `${actor} liked your post`;
      case 'unlike': return `${actor} unliked your post`;
      case 'comment': return `${actor} commented on your post`;
      default: return `${actor} interacted with you`;
    }
  },

  getNotificationLink(notification) {
    switch (notification.type) {
      case 'follow':
      case 'unfollow':
        return `#/profile/${notification.actor_id}`;
      case 'like':
      case 'unlike':
      case 'comment':
        return `#/post/${notification.post_id}`;
      default:
        return '#/notifications';
    }
  }
};

window.NotificationsPage = NotificationsPage;