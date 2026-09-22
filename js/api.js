// api.js - API Wrapper for Simple Social API
// Handles all HTTP requests to the backend API
// All authenticated requests include JWT in Authorization: Bearer header

const API = {
  baseUrl: '/api.php',
  jwt: null,

  async call(action, data = {}) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.jwt) {
      headers['Authorization'] = `Bearer ${this.jwt}`;
    }

    // Dropped rather than passed through: URLSearchParams stringifies null
    // into the literal text "null", which is what put mediaUrl="null" on a
    // batch of old posts. PHP reads an omitted field as null anyway.
    const present = Object.entries(data).filter(([, v]) => v !== null && v !== undefined);
    const body = new URLSearchParams(Object.fromEntries(present));
    body.set('action', action);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: body.toString()
      });

      const json = await response.json();

      if (!response.ok || !json.valid) {
        const errorMsg = json.message || json.error || `HTTP ${response.status}`;

        // Never intercept a failed login with the session-expired modal: the
        // modal's own re-login call would recurse into itself, leaving the
        // button stuck on "Logging in..." and the error message never shown.
        //
        // deleteAccount also returns 401 for a wrong password, not an expired
        // session (reaching that handler at all requires a valid JWT), so it
        // must be excluded too or the real error never reaches the caller.
        const bypassesSessionModal = action === 'login' || action === 'deleteAccount';

        if (!bypassesSessionModal && response.status === 401 && Store.isLoggedIn() && typeof SessionExpiredModal !== 'undefined') {
          const retryFn = () => this.call(action, data);
          const retryResult = await SessionExpiredModal.show(retryFn);
          if (retryResult !== undefined && retryResult !== null) return retryResult;
          return {};
        }

        throw new Error(errorMsg);
      }

      return json;
    } catch (error) {
      console.error('API Error:', error);
      if (typeof Logger !== 'undefined') Logger.error('API: ' + action + ' - ' + error.message);
      throw error;
    }
  },

  setJwt(token) {
    this.jwt = token;
    if (token) {
      localStorage.setItem('ss_jwt', token);
    } else {
      localStorage.removeItem('ss_jwt');
    }
  },

  clearJwt() {
    this.jwt = null;
    localStorage.removeItem('ss_jwt');
  },

  getJwt() {
    if (!this.jwt) {
      this.jwt = localStorage.getItem('ss_jwt');
    }
    return this.jwt;
  },

  isLoggedIn() {
    return !!this.getJwt();
  },

  // ============== AUTH ==============
  async login(email, password) {
    return this.call('login', { email, password });
  },

  async logout() {
    try {
      const result = await this.call('logout', {});
      this.clearJwt();
      return result;
    } catch (error) {
      this.clearJwt();
      throw error;
    }
  },

  async sendRegisterOTP(email) {
    return this.call('sendRegisterOTP', { email });
  },

  async verifyRegisterOTP(email, otp) {
    return this.call('verifyRegisterOTP', { email, otp });
  },

  async finishRegister(email, password, confirm) {
    return this.call('finishRegister', { email, password, confirm });
  },

  async sendOTP(email) {
    return this.call('sendOTP', { email });
  },

  async verifyOTP(email, otp) {
    return this.call('verifyOTP', { email, otp });
  },

  async resetPassword(email, password, confirm) {
    return this.call('resetPassword', { email, password, confirm });
  },

  // ============== USER ==============
  async getMyInfo() {
    return this.call('getMyInfo', {});
  },

  async getUserInfo(userId) {
    return this.call('getUserInfo', { userId });
  },

  async getUsers() {
    return this.call('getUsers', {});
  },

  async getUserEmails(userIds) {
    return this.call('getUserEmails', { userIds: JSON.stringify(userIds) });
  },

  async deleteAccount(password) {
    return this.call('deleteAccount', { password });
  },

  async updateTheme(theme) {
    return this.call('updateTheme', { theme });
  },

  async updateHand(hand) {
    return this.call('updateHand', { hand });
  },

  // ============== PUSH ==============
  async getVapidPublicKey() {
    return this.call('getVapidPublicKey', {});
  },

  async savePushSubscription(endpoint, p256dh, auth) {
    return this.call('savePushSubscription', { endpoint, p256dh, auth });
  },

  async deletePushSubscription(endpoint) {
    return this.call('deletePushSubscription', { endpoint });
  },

  // ============== POSTS ==============
  async post(postText, mediaUrl = null) {
    return this.call('post', { postText, mediaUrl });
  },

  async deletePost(postId) {
    return this.call('deletePost', { postId });
  },

  async getMyPosts(offset = 0, limit = 25) {
    return this.call('getMyPosts', { offset, limit });
  },

  async getUserPosts(userId, offset = 0, limit = 25) {
    return this.call('getUserPosts', { userId, offset, limit });
  },

  async fetchFollowedPosts(offset = 0, limit = 25) {
    return this.call('fetchFollowedPosts', { offset, limit });
  },


  async uploadMedia(file) {
    const formData = new FormData();
    formData.append('action', 'uploadMedia');
    formData.append('file', file);

    const headers = {};
    if (this.jwt) {
      headers['Authorization'] = 'Bearer ' + this.jwt;
    }

    let response;
    try {
      response = await fetch('/media.php', {
        method: 'POST',
        headers,
        body: formData
      });
    } catch (error) {
      // fetch() itself only throws for a connection that never happened at
      // all (offline, DNS failure, etc.) - a request the server responded to
      // always reaches the code below instead, even with an error status.
      console.error('Upload Error:', error);
      if (typeof Logger !== 'undefined') Logger.error('Upload: ' + error.message);
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    let json;
    try {
      json = await response.json();
    } catch (parseError) {
      // The webserver rejected the request before our PHP ever ran (most
      // often a proxy/PHP post_max_size limit on a large video), so the body
      // is an HTML error page instead of JSON. response.status still reflects
      // what happened.
      const msg = response.status === 413
        ? 'That file is too large for the server to accept.'
        : `Upload failed (server error ${response.status}). Please try again.`;
      console.error('Upload Error: non-JSON response, status=' + response.status);
      if (typeof Logger !== 'undefined') Logger.error('Upload: non-JSON response ' + response.status);
      throw new Error(msg);
    }

    if (!response.ok || !json.valid) {
      const errorMsg = json.message || json.error || 'HTTP ' + response.status;
      console.error('Upload Error:', errorMsg);
      if (typeof Logger !== 'undefined') Logger.error('Upload: ' + errorMsg);
      throw new Error(errorMsg);
    }
    return json;
  },

  async deleteMedia(mediaId) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.jwt) {
      headers['Authorization'] = 'Bearer ' + this.jwt;
    }

    const body = new URLSearchParams();
    body.set('action', 'deleteMedia');
    body.set('mediaId', mediaId);

    try {
      const response = await fetch('/media.php', {
        method: 'POST',
        headers,
        body: body.toString()
      });

      const json = await response.json();
      if (!response.ok || !json.valid) {
        const errorMsg = json.message || json.error || 'HTTP ' + response.status;
        throw new Error(errorMsg);
      }
      return json;
    } catch (error) {
      console.error('Delete Media Error:', error);
      if (typeof Logger !== 'undefined') Logger.error('DeleteMedia: ' + error.message);
      throw error;
    }
  },
  async likePost(postId) {
    return this.call('likePost', { postId });
  },

  async unlikePost(postId) {
    return this.call('unlikePost', { postId });
  },

  async getPostLikes(postId) {
    return this.call('getPostLikes', { postId });
  },

  // ============== COMMENTS ==============
  async createComment(postId, text) {
    return this.call('createComment', { postId, text });
  },

  async getPostComments(postId, offset = 0, limit = 25) {
    return this.call('getPostComments', { postId, offset, limit });
  },

  async deleteComment(commentId) {
    return this.call('deleteComment', { commentId });
  },

  async getPostCommentCounts(postIds) {
    return this.call('getPostCommentCounts', { postIds: JSON.stringify(postIds) });
  },

  // ============== FOLLOWS ==============
  async followUser(userId) {
    return this.call('followUser', { userId });
  },

  async unfollowUser(userId) {
    return this.call('unfollowUser', { userId });
  },

  async isFollowing(userId) {
    return this.call('isFollowing', { userId });
  },

  async getFollows(userId) {
    return this.call('getMyFollows', { userId });
  },

  async getFollowers(userId) {
    return this.call('getMyFollowers', { userId });
  },

  async getMyFollows() {
    return this.call('getMyFollows', {});
  },

  async getMyFollowers() {
    return this.call('getMyFollowers', {});
  },

  // ============== NOTIFICATIONS ==============
  async getNotifications(offset = 0) {
    return this.call('getNotifications', { offset });
  },

  async getUnseenNotificationCount() {
    return this.call('getUnseenNotificationCount', {});
  },

  async markNotificationsSeen() {
    return this.call('markNotificationsSeen', {});
  },

  async getPostById(postId) {
    return this.call('getPostById', { postId });
  },

  async getPostPreviews(postIds) {
    return this.call('getPostPreviews', { postIds: JSON.stringify(postIds) });
  }
};

window.api = API;