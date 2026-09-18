// components/media-viewer.js - Media Fullscreen Viewer

const MediaViewer = {
  overlay: null,

  init() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'media-viewer-overlay';
    this.overlay.innerHTML = `
      <button class="media-viewer-close" onclick="MediaViewer.close()">×</button>
      <button class="media-viewer-fullscreen" onclick="MediaViewer.toggleFullscreen()">⛶</button>
      <a class="media-viewer-download" download title="Download" aria-label="Download">↓</a>
      <div class="media-viewer-content"></div>
    `;
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
        this.close();
      }
    });

    // Navigating away (e.g. back button) shouldn't leave the viewer open and
    // the page stuck unscrollable.
    window.addEventListener('hashchange', () => this.close());
  },

  open(url, type) {
    if (!this.overlay) this.init();

    const content = this.overlay.querySelector('.media-viewer-content');
    // Same-origin, so the download attribute saves the file rather than
    // navigating to it.
    this.overlay.querySelector('.media-viewer-download').href = url;

    if (type === 'image') {
      content.innerHTML = `<img src="${url}" alt="Media">`;
    } else if (type === 'video') {
      content.innerHTML = `<video controls autoplay src="${url}"></video>`;
    } else if (type === 'audio') {
      content.innerHTML = `<audio controls autoplay src="${url}"></audio>`;
    }

    this.overlay.classList.add('active');
    document.documentElement.classList.add('media-viewer-open');
  },

  close() {
    if (!this.overlay) return;

    // Closing while still fullscreen (e.g. pressed fullscreen, then the x)
    // left the browser fullscreened on this now-empty, invisible overlay --
    // which looks exactly like a frozen screen.
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }

    const content = this.overlay.querySelector('.media-viewer-content');
    content.innerHTML = '';
    this.overlay.classList.remove('active');
    document.documentElement.classList.remove('media-viewer-open');
  },

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.overlay.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
};

window.MediaViewer = MediaViewer;
MediaViewer.init();
