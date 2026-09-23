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
  currentPage: null,
  // hashchange can't tell a link click from back/forward, so link clicks and
  // navigate() flag the next change as fresh; anything unflagged came from
  // history and lets pages restore their cached state.
  pendingFresh: false,

  init() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      // .hash (not getAttribute('href')) so this catches header.js's nav,
      // which uses absolute hrefs like "/app.html#/settings" to also work
      // from the static marketing pages -- those never start with "#/", so
      // matching on the raw attribute missed every header/thumb-nav click
      // and misclassified it as a back/forward restore instead of fresh.
      if (link && link.hash && link.hash.startsWith('#/') && link.hash !== window.location.hash) {
        this.pendingFresh = true;
      }
    }, true);
    window.addEventListener('hashchange', () => this.handleHashChange());

    // Take scroll position off the browser. Left on "auto" it re-applies the
    // previous offset after a reload, and since a reload is a fresh document
    // load rather than a hashchange, nothing here was undoing it -- refreshing
    // while scrolled down on Settings put you below the theme selector.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // A document load starts at the top. It isn't a back/forward, and the
    // feed's and profile's own restore paths can't run on one anyway: both
    // require state (this.posts / this.user) that a fresh load doesn't have.
    this.pendingFresh = true;
    this.handleHashChange();
  },

  navigate(path) {
    if ('#' + path !== window.location.hash) this.pendingFresh = true;
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
    const restore = !this.pendingFresh;
    this.pendingFresh = false;
    const route = this.getRoute();
    route.restore = restore;
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

    if (this.currentPage && typeof this.currentPage.destroy === 'function') {
      this.currentPage.destroy();
    }

    container.innerHTML = '';
    this.currentPage = null;

    // A new page starts at the top; otherwise it inherits the previous
    // page's scroll offset and its top is hidden under the sticky header.
    // Back/forward leaves scrolling to the page so it can restore position.
    if (!route.restore) window.scrollTo(0, 0);

    switch (route.page) {
      case 'login':
        if (typeof LoginPage !== 'undefined') {
          LoginPage.render(container);
          this.currentPage = LoginPage;
        }
        break;
      case 'register':
        if (typeof RegisterPage !== 'undefined') {
          RegisterPage.render(container);
          this.currentPage = RegisterPage;
        }
        break;
      case 'reset-password':
        if (typeof ResetPasswordPage !== 'undefined') {
          ResetPasswordPage.render(container);
          this.currentPage = ResetPasswordPage;
        }
        break;
      case 'feed':
        if (typeof FeedPage !== 'undefined') {
          FeedPage.render(container, { restore: route.restore });
          this.currentPage = FeedPage;
        }
        break;
      case 'create-post':
        if (typeof CreatePostPage !== 'undefined') {
          CreatePostPage.render(container);
          this.currentPage = CreatePostPage;
        }
        break;
      case 'profile':
        if (typeof ProfilePage !== 'undefined') {
          ProfilePage.render(container, route.id, { restore: route.restore });
          this.currentPage = ProfilePage;
        }
        break;
      case 'post':
        if (typeof PostPage !== 'undefined') {
          PostPage.render(container, route.id);
          this.currentPage = PostPage;
        }
        break;
      case 'notifications':
        if (typeof NotificationsPage !== 'undefined') {
          NotificationsPage.render(container);
          this.currentPage = NotificationsPage;
        }
        break;
      case 'settings':
        if (typeof SettingsPage !== 'undefined') {
          SettingsPage.render(container);
          this.currentPage = SettingsPage;
        }
        break;
      case 'search':
        if (typeof SearchPage !== 'undefined') {
          SearchPage.render(container);
          this.currentPage = SearchPage;
        }
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