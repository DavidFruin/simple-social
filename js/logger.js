// js/logger.js - Frontend logging module
const Logger = {
  send(level, category, message, extra = '') {
    try {
      const user = (typeof Store !== 'undefined' && Store.getUser) ? Store.getUser() : null;
      const body = new URLSearchParams({
        action: 'log',
        level: level,
        category: category,
        message: message,
        url: window.location.href,
        extra: extra,
      });

      // Fire-and-forget — non-blocking
      if (navigator.sendBeacon) {
        const blob = new Blob([body.toString()], { type: 'application/x-www-form-urlencoded' });
        navigator.sendBeacon('/api.php', blob);
      } else {
        fetch('/api.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          keepalive: true,
        }).catch(() => {});
      }
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
