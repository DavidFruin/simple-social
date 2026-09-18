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
    this.applyTheme();
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
    this.applyTheme();
    this.notify('user');
  },

  getUser() {
    return this.state.user;
  },

  getTheme() {
    return this.state.user?.theme || 'light';
  },

  // Not persisted, not part of reactive state -- just lets the single-post
  // page skip its loading flash when it already has the post's data from
  // whatever feed/profile card the user just clicked "Expand" on.
  postCache: {},

  cachePost(post) {
    if (post?.id) this.postCache[post.id] = post;
  },

  getCachedPost(id) {
    return this.postCache[id] || null;
  },

  // Which bottom corner the thumb nav sits in. Right-handed by default.
  getHand() {
    return this.state.user?.hand || 'right';
  },

  // Reflects the logged-in user's theme flag as a data-theme attribute on
  // <html>, which css/main.css uses to swap the --color-* variables. Runs on
  // every load and whenever the user object changes, so it applies before the
  // page has a chance to flash the wrong colors.
  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.getTheme());
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
    this.notificationCountLoaded = true;
    this.notify('notificationCount');
  },

  // The count starts at 0 only because we haven't asked the server yet -- that
  // is not the same as "you have no notifications". The home-screen badge
  // outlives the page, so it must not be cleared on that assumption.
  notificationCountLoaded: false,

  isNotificationCountLoaded() {
    return this.notificationCountLoaded;
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
    // Logged out is a real zero, not an unknown, so the badge should clear.
    this.notificationCountLoaded = true;
    localStorage.removeItem(this.JWT_KEY);
    localStorage.removeItem(this.USER_KEY);
    api.clearJwt();
    this.applyTheme();
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