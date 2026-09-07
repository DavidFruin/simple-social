// store.js - Simple State Management for Simple Social SPA
// Manages application state and provides reactive updates

const Store = {
  JWT_KEY: 'ss_jwt',
  USER_KEY: 'ss_user',

  state: {
    jwt: null,
    user: null,
    notificationCount: 0
  },

  subscribers: [],

  init() {
    this.state.jwt = localStorage.getItem(this.JWT_KEY);
    const userStr = localStorage.getItem(this.USER_KEY);
    if (userStr) {
      try {
        this.state.user = JSON.parse(userStr);
      } catch (e) {
        this.state.user = null;
      }
    }
    return this.state;
  },

  setJwt(token) {
    this.state.jwt = token;
    if (token) {
      localStorage.setItem(this.JWT_KEY, token);
      api.setJwt(token);
    } else {
      localStorage.removeItem(this.JWT_KEY);
      api.clearJwt();
    }
    this.notify('jwt');
  },

  getJwt() {
    return this.state.jwt;
  },

  setUser(user) {
    this.state.user = user;
    if (user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.USER_KEY);
    }
    this.notify('user');
  },

  getUser() {
    return this.state.user;
  },

  setUserId(id) {
    if (this.state.user) {
      this.state.user.id = id;
      this.state.user.userId = id;
      localStorage.setItem(this.USER_KEY, JSON.stringify(this.state.user));
    }
  },

  isLoggedIn() {
    return this.state.jwt !== null;
  },

  setNotificationCount(count) {
    this.state.notificationCount = count;
    this.notify('notificationCount');
  },

  getNotificationCount() {
    return this.state.notificationCount;
  },

  incrementNotificationCount() {
    this.state.notificationCount++;
    this.notify('notificationCount');
  },

  clear() {
    this.state.jwt = null;
    this.state.user = null;
    this.state.notificationCount = 0;
    localStorage.removeItem(this.JWT_KEY);
    localStorage.removeItem(this.USER_KEY);
    api.clearJwt();
    this.notify();
  },

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  },

  notify(changed) {
    this.subscribers.forEach(callback => callback(this.state, changed));
  }
};

window.Store = Store;