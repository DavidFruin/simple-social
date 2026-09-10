// api.js - API Wrapper for Simple Social API
// Handles all HTTP requests to the backend API
// All authenticated requests include JWT in Authorization: Bearer header

const API = {
  baseUrl: '/api.php',
  jwt: null,

  async call(action, data = {}) {
    const formData = new FormData();
    formData.append('action', action);
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    }

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.jwt) {
      headers['Authorization'] = `Bearer ${this.jwt}`;
    }

    const body = new URLSearchParams(data);
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
        throw new Error(errorMsg);
      }

      return json;
    } catch (error) {
      console.error('API Error:', error);
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

    try {
      const response = await fetch('/media.php', {
        method: 'POST',
        headers,
        body: formData
      });

      const json = await response.json();
      if (!response.ok || !json.valid) {
        const errorMsg = json.message || json.error || 'HTTP ' + response.status;
        throw new Error(errorMsg);
      }
      return json;
    } catch (error) {
      console.error('Upload Error:', error);
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
  }
};

window.api = API;