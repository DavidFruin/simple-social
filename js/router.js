// router.js - Hash-based Router for Simple Social SPA
// Handles navigation by reading/writing window.location.hash
// Format: #/pageName or #/pageName/id

const Router = {
  routes: {
    login: { path: '/login', requiresAuth: false },
    register: { path: '/register', requiresAuth: false },
    'reset-password': { path: '/reset-password', requiresAuth: false },
    feed: { path: '/feed', requiresAuth: true },
    'create-post': { path: '/create-post', requiresAuth: true },
    profile: { path: '/profile', requiresAuth: true },
    post: { path: '/post', requiresAuth: true },
    notifications: { path: '/notifications', requiresAuth: true },
    settings: { path: '/settings', requiresAuth: true },
    search: { path: '/search', requiresAuth: true }
  },

  init() {
    window.addEventListener('hashchange', () => this.handleHashChange());
    this.handleHashChange();
  },

  navigate(path) {
    window.location.hash = path;
  },

  getRoute() {
    const hash = window.location.hash.replace('#', '') || '/feed';
    const segments = hash.split('/').filter(s => s);

    const page = segments[0] || 'feed';
    const id = segments[1] || null;

    return { page, id, hash: '/' + (segments.join('/') || 'feed') };
  },

  handleHashChange() {
    const route = this.getRoute();
    const page = route.page;
    const routeConfig = this.routes[page];

    if (!routeConfig) {
      this.navigate('/feed');
      return;
    }

    if (routeConfig.requiresAuth && !Store.isLoggedIn()) {
      this.navigate('/login');
      return;
    }

    if (!routeConfig.requiresAuth && Store.isLoggedIn() && page === 'login') {
      this.navigate('/feed');
      return;
    }

    this.render(route);
  },

  render(route) {
    const container = document.getElementById('main');
    if (!container) return;

    container.innerHTML = '';

    switch (route.page) {
      case 'login':
        if (typeof LoginPage !== 'undefined') LoginPage.render(container);
        break;
      case 'register':
        if (typeof RegisterPage !== 'undefined') RegisterPage.render(container);
        break;
      case 'reset-password':
        if (typeof ResetPasswordPage !== 'undefined') ResetPasswordPage.render(container);
        break;
      case 'feed':
        if (typeof FeedPage !== 'undefined') FeedPage.render(container);
        break;
      case 'create-post':
        if (typeof CreatePostPage !== 'undefined') CreatePostPage.render(container);
        break;
      case 'profile':
        if (typeof ProfilePage !== 'undefined') ProfilePage.render(container, route.id);
        break;
      case 'post':
        if (typeof PostPage !== 'undefined') PostPage.render(container, route.id);
        break;
      case 'notifications':
        if (typeof NotificationsPage !== 'undefined') NotificationsPage.render(container);
        break;
      case 'settings':
        if (typeof SettingsPage !== 'undefined') SettingsPage.render(container);
        break;
      case 'search':
        if (typeof SearchPage !== 'undefined') SearchPage.render(container);
        break;
      default:
        this.navigate('/feed');
    }

    if (typeof updateHeader === 'function') {
      updateHeader();
    }
  }
};

window.Router = Router;