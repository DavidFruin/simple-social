// js/logger.js - Frontend logging module
const Logger = {
  send(level, category, message, extra = '') {
    try {
      // The log action requires a logged-in user, so there's nothing to send without a token.
      const jwt = (typeof Store !== 'undefined' && Store.getJwt) ? Store.getJwt() : null;
      if (!jwt) return;

      const body = new URLSearchParams({
        action: 'log',
        level: level,
        category: category,
        message: message,
        url: window.location.href,
        extra: extra,
      });

      // Fire-and-forget. sendBeacon can't send an Authorization header, so use
      // fetch with keepalive so logs still go out if the page is closing.
      fetch('/api.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${jwt}`,
        },
        body: body.toString(),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {
      // Logger must never throw
    }
  },

  error(message, extra = '') {
    this.send('ERROR', 'frontend', message, extra);
  },

  warn(message, extra = '') {
    this.send('WARN', 'frontend', message, extra);
  },

  info(message, extra = '') {
    this.send('INFO', 'frontend', message, extra);
  },

  debug(message, extra = '') {
    this.send('DEBUG', 'frontend', message, extra);
  },
};

window.Logger = Logger;
