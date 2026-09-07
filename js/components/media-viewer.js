// components/media-viewer.js - Media Fullscreen Viewer

const MediaViewer = {
  overlay: null,

  init() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'media-viewer-overlay';
    this.overlay.innerHTML = `
      <button class="media-viewer-close" onclick="MediaViewer.close()">×</button>
      <button class="media-viewer-fullscreen" onclick="MediaViewer.toggleFullscreen()">⛶</button>
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
  },

  open(url, type) {
    if (!this.overlay) this.init();

    const content = this.overlay.querySelector('.media-viewer-content');

    if (type === 'image') {
      content.innerHTML = `<img src="${url}" alt="Media">`;
    } else if (type === 'video') {
      content.innerHTML = `<video controls autoplay src="${url}"></video>`;
    } else if (type === 'audio') {
      content.innerHTML = `<audio controls autoplay src="${url}"></audio>`;
    }

    this.overlay.classList.add('active');
  },

  close() {
    if (!this.overlay) return;

    const content = this.overlay.querySelector('.media-viewer-content');
    content.innerHTML = '';
    this.overlay.classList.remove('active');
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
