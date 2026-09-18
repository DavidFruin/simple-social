// pages/create-post.js - Create Post Page
const CreatePostPage = {
  DRAFT_KEY: 'ss_post_draft',
  currentMediaUrl: null,
  currentMediaType: null,
  currentMediaId: null,
  uploading: false,
  captureStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recording: false,
  recordingType: null,
  audioContext: null,
  analyser: null,
  animationFrame: null,
  // Images keep the original file so rotating always starts from it and
  // repeated rotations don't pile up re-encoding loss.
  originalImage: null,
  imageRotation: 0,

  render(container) {
    const draft = this.loadDraft();

    container.innerHTML = `
      <div class="page-container">
        <h1>Create Post</h1>
        
        <div class="composer">
          <form id="post-form">
            <textarea id="post-text" placeholder="What's on your mind?">${escapeHtml(draft)}</textarea>
            <p class="composer-note">Every post needs some text &mdash; media on its own isn't enough.</p>

            <div id="media-preview" class="media-preview"></div>
            
            <div class="media-upload-section">
              <input type="file" id="media-input" accept="image/jpeg,image/png,image/gif,image/webp,video/quicktime,video/mp4,video/m4v,audio/wav,audio/mpeg,audio/mp3" style="display:none">
              <div class="media-upload-buttons">
                <button type="button" id="select-media-btn" class="btn btn-secondary">Upload Media</button>
                <button type="button" id="capture-media-btn" class="btn btn-secondary">Capture Media</button>
              </div>
              <p class="media-upload-note">One media file per post</p>
              <span id="media-status" class="media-upload-status"></span>
            </div>

            <div id="capture-modal" class="capture-modal hidden">
              <div class="capture-overlay"></div>
              <div class="capture-container">
                <div class="capture-header">
                  <h3 id="capture-title">Capture Media</h3>
                  <button type="button" class="capture-close" onclick="CreatePostPage.closeCaptureModal()">×</button>
                </div>

                <div id="capture-chooser" class="capture-chooser">
                  <button type="button" id="choose-photo-btn" class="btn btn-secondary">Photo</button>
                  <button type="button" id="choose-video-btn" class="btn btn-secondary">Video</button>
                  <button type="button" id="choose-audio-btn" class="btn btn-secondary">Audio</button>
                </div>

                <div id="capture-stage" class="hidden">
                  <div class="capture-preview">
                    <video id="capture-video" autoplay playsinline muted></video>
                    <canvas id="capture-canvas" class="hidden"></canvas>
                    <div id="capture-audio-viz" class="capture-audio-viz hidden">
                      <div class="cava-bars"></div>
                    </div>
                  </div>
                  <div class="capture-controls">
                    <button type="button" id="capture-photo-btn" class="btn btn-primary hidden">Take Photo</button>
                    <button type="button" id="capture-video-btn" class="btn btn-primary hidden">Start Recording</button>
                    <button type="button" id="capture-audio-btn" class="btn btn-primary hidden">Start Recording</button>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="composer-actions">
              <span id="char-count">${draft.length}/5000</span>
              <button type="submit" class="btn btn-primary">Post</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.attachEventListeners();
  },

  attachEventListeners() {
    const form = document.getElementById('post-form');
    const textarea = document.getElementById('post-text');
    const mediaInput = document.getElementById('media-input');
    const selectMediaBtn = document.getElementById('select-media-btn');
    const captureBtn = document.getElementById('capture-media-btn');

    form?.addEventListener('submit', this.handlePostSubmit.bind(this));
    textarea?.addEventListener('input', this.handleInput.bind(this));
    selectMediaBtn?.addEventListener('click', () => mediaInput?.click());
    mediaInput?.addEventListener('change', this.handleMediaSelect.bind(this));
    captureBtn?.addEventListener('click', this.openCaptureModal.bind(this));

    // Step one: pick what to capture. Nothing is switched on until then.
    document.getElementById('choose-photo-btn')?.addEventListener('click', () => this.startCapture('photo'));
    document.getElementById('choose-video-btn')?.addEventListener('click', () => this.startCapture('video'));
    document.getElementById('choose-audio-btn')?.addEventListener('click', () => this.startCapture('audio'));

    // Capture controls
    document.getElementById('capture-photo-btn')?.addEventListener('click', this.capturePhoto.bind(this));
    document.getElementById('capture-video-btn')?.addEventListener('click', this.toggleVideoRecording.bind(this));
    document.getElementById('capture-audio-btn')?.addEventListener('click', this.toggleAudioRecording.bind(this));
  },

  handleInput() {
    const textarea = document.getElementById('post-text');
    const counter = document.getElementById('char-count');
    if (!textarea || !counter) return;

    const length = textarea.value.length;
    counter.textContent = `${length}/5000`;

    if (length > 5000) {
      counter.classList.add('error-message');
      counter.textContent = `${length}/5000 (limit exceeded)`;
    } else {
      counter.classList.remove('error-message');
    }

    this.saveDraft(textarea.value);
  },

  async handleMediaSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');
    
    selectMediaBtn.disabled = true;
    status.textContent = 'Uploading...';

    try {
      const isImage = file.type.startsWith('image/');
      const upload = isImage ? await this.renderImageFile(file, 0) : file;
      const result = await this.uploadAndReplace(upload);
      this.originalImage = isImage ? file : null;
      this.imageRotation = 0;
      this.renderMediaPreview(result);
      status.textContent = 'Uploaded!';
      selectMediaBtn.textContent = 'Change Media';
    } catch (err) {
      showError(err.message);
      status.textContent = 'Upload failed';
      this.clearMedia();
    } finally {
      selectMediaBtn.disabled = false;
    }
  },

  // Uploads a file and makes it the post's media, deleting the previous upload
  // so it isn't orphaned.
  async uploadAndReplace(file) {
    this.uploading = true;
    try {
      const result = await api.uploadMedia(file);
      const previousMediaId = this.currentMediaId;
      if (previousMediaId && previousMediaId !== result.mediaId) {
        api.deleteMedia(previousMediaId).catch(err => {
          console.error('Failed to delete replaced media:', err.message);
        });
      }
      this.currentMediaUrl = result.mediaUrl;
      this.currentMediaType = result.type;
      this.currentMediaId = result.mediaId;
      this.renderMediaPreview(result);
      return result;
    } finally {
      this.uploading = false;
    }
  },

  // Redraws an image upright (browsers apply the photo's EXIF orientation when
  // decoding it), rotated `rotation` degrees clockwise, with the longest side
  // capped at 1920px to match the server.
  async renderImageFile(source, rotation) {
    const url = URL.createObjectURL(source);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();

      const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.round(img.naturalWidth * scale);
      const height = Math.round(img.naturalHeight * scale);
      const sideways = rotation % 180 !== 0;

      const canvas = document.createElement('canvas');
      canvas.width = sideways ? height : width;
      canvas.height = sideways ? width : height;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);

      // Formats that can be transparent stay PNG; photos become JPEG.
      const keepsAlpha = ['image/png', 'image/gif', 'image/webp'].includes(source.type);
      const type = keepsAlpha ? 'image/png' : 'image/jpeg';
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
      if (!blob) throw new Error('Could not process image');
      return new File([blob], keepsAlpha ? 'image.png' : 'image.jpg', { type });
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  async rotateImage() {
    if (!this.originalImage || this.uploading) return;

    const status = document.getElementById('media-status');
    const rotateBtn = document.querySelector('.media-rotate-btn');
    if (rotateBtn) rotateBtn.disabled = true;
    status.textContent = 'Rotating...';

    const rotation = (this.imageRotation + 90) % 360;
    try {
      const file = await this.renderImageFile(this.originalImage, rotation);
      await this.uploadAndReplace(file);
      this.imageRotation = rotation;
      status.textContent = '';
    } catch (err) {
      showError(err.message);
      status.textContent = 'Rotate failed';
      if (rotateBtn) rotateBtn.disabled = false;
    }
  },

  renderMediaPreview(mediaData) {
    const preview = document.getElementById('media-preview');
    if (!preview) return;

    const url = mediaData.mediaUrl;
    const type = mediaData.type;

    if (type === 'image') {
      preview.innerHTML = `
        <div class="media-preview-item">
          <img src="${url}" alt="Preview">
          ${this.originalImage ? '<button type="button" class="media-rotate-btn" onclick="CreatePostPage.rotateImage()" title="Rotate" aria-label="Rotate image">⟳</button>' : ''}
          <button type="button" class="media-remove-btn" onclick="CreatePostPage.clearMedia()">×</button>
        </div>
      `;
    } else if (type === 'video') {
      preview.innerHTML = `
        <div class="media-preview-item video">
          <video src="${url}" poster="${mediaData.thumbnailUrl || ''}" preload="metadata" playsinline></video>
          <button type="button" class="media-remove-btn" onclick="CreatePostPage.clearMedia()">×</button>
        </div>
      `;
    } else if (type === 'audio') {
      preview.innerHTML = `
        <div class="media-preview-item audio">
          <audio controls src="${url}"></audio>
          <button type="button" class="media-remove-btn" onclick="CreatePostPage.clearMedia()">×</button>
        </div>
      `;
    }
  },

  // Opens on the chooser. Nothing is requested from the camera or microphone
  // until a mode is picked, so opening this doesn't trigger a permission
  // prompt on its own.
  openCaptureModal() {
    const modal = document.getElementById('capture-modal');
    if (!modal) return;

    this.stopCaptureStream();
    document.getElementById('capture-chooser')?.classList.remove('hidden');
    document.getElementById('capture-stage')?.classList.add('hidden');
    const title = document.getElementById('capture-title');
    if (title) title.textContent = 'Capture Media';
    modal.classList.remove('hidden');
  },

  // Each mode asks only for the devices it actually needs, so choosing Audio
  // never switches the camera on, and Photo never opens the microphone.
  async startCapture(mode) {
    const status = document.getElementById('media-status');
    const video = document.getElementById('capture-video');
    const audioViz = document.getElementById('capture-audio-viz');

    const constraints = {
      photo: { video: true, audio: false },
      video: { video: true, audio: true },
      audio: { video: false, audio: true }
    }[mode];

    status.textContent = mode === 'audio' ? 'Starting microphone...' : 'Starting camera...';

    try {
      this.captureStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      showError(mode === 'audio'
        ? 'Could not access the microphone. Please check permissions.'
        : 'Could not access the camera. Please check permissions.');
      status.textContent = '';
      return;
    }

    this.recording = false;
    this.recordedChunks = [];

    document.getElementById('capture-chooser')?.classList.add('hidden');
    document.getElementById('capture-stage')?.classList.remove('hidden');
    const title = document.getElementById('capture-title');
    if (title) title.textContent = { photo: 'Take a Photo', video: 'Record Video', audio: 'Record Audio' }[mode];

    if (mode === 'audio') {
      video.style.display = 'none';
      audioViz.classList.remove('hidden');
      // Runs from the moment the mic opens, so there's something to look at
      // before recording starts.
      this.setupAudioVisualizer(this.captureStream);
    } else {
      // Muted so the microphone isn't played back through the speakers.
      video.muted = true;
      video.srcObject = this.captureStream;
      video.style.display = 'block';
      audioViz.classList.add('hidden');
    }

    document.getElementById('capture-photo-btn').classList.toggle('hidden', mode !== 'photo');
    document.getElementById('capture-video-btn').classList.toggle('hidden', mode !== 'video');
    document.getElementById('capture-audio-btn').classList.toggle('hidden', mode !== 'audio');

    status.textContent = '';
  },

  closeCaptureModal() {
    const modal = document.getElementById('capture-modal');
    const status = document.getElementById('media-status');
    if (modal) modal.classList.add('hidden');
    if (status) status.textContent = '';
    this.stopCaptureStream();
    this.stopVisualizer();
  },

  stopCaptureStream() {
    if (this.captureStream) {
      this.captureStream.getTracks().forEach(track => track.stop());
      this.captureStream = null;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder = null;
    }
    this.recording = false;
    this.recordedChunks = [];

    const videoBtn = document.getElementById('capture-video-btn');
    const audioBtn = document.getElementById('capture-audio-btn');
    if (videoBtn) videoBtn.textContent = 'Start Recording';
    if (audioBtn) audioBtn.textContent = 'Start Recording';
  },

  async capturePhoto() {
    const video = document.getElementById('capture-video');
    const canvas = document.getElementById('capture-canvas');
    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');

    status.textContent = 'Capturing photo...';

    try {
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });

      status.textContent = 'Uploading...';
      selectMediaBtn.disabled = true;

      await this.uploadAndReplace(file);
      this.originalImage = file;
      this.imageRotation = 0;
      this.renderMediaPreview({ mediaUrl: this.currentMediaUrl, type: this.currentMediaType });

      this.closeCaptureModal();
      this.clearMediaInput();
      status.textContent = 'Photo captured!';
      selectMediaBtn.disabled = false;
    } catch (err) {
      console.error('Error capturing photo:', err);
      showError(err.message);
      status.textContent = 'Capture failed';
      selectMediaBtn.disabled = false;
    }
  },

  async toggleVideoRecording() {
    if (this.recording) {
      this.stopRecording();
      return;
    }

    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');
    const videoBtn = document.getElementById('capture-video-btn');

    status.textContent = 'Starting video recording...';
    selectMediaBtn.disabled = true;

    try {
      // Check support for mp4, fallback to webm
      let mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }
      
      // Use video + audio tracks
      const recordStream = new MediaStream([
        ...this.captureStream.getVideoTracks(),
        ...this.captureStream.getAudioTracks()
      ]);
      
      this.mediaRecorder = new MediaRecorder(recordStream, { mimeType });
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processRecordedMedia('video');
      };

      this.mediaRecorder.start(1000);
      this.recording = true;
      this.recordingType = 'video';

      videoBtn.textContent = 'Stop Recording';
      status.textContent = 'Recording video... (click to stop)';
    } catch (err) {
      console.error('Error starting video recording:', err);
      showError('Could not start recording: ' + err.message);
      selectMediaBtn.disabled = false;
    }
  },

  async toggleAudioRecording() {
    if (this.recording) {
      this.stopRecording();
      return;
    }

    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');
    const audioBtn = document.getElementById('capture-audio-btn');

    status.textContent = 'Starting audio recording...';
    selectMediaBtn.disabled = true;

    try {
      const audioStream = new MediaStream(this.captureStream.getAudioTracks());

      let mimeType = 'audio/mp4;codecs=mp4a.40.2';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
        }
      }

      this.mediaRecorder = new MediaRecorder(audioStream, { mimeType });
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.stopVisualizer();
        await this.processRecordedMedia('audio');
      };

      this.mediaRecorder.start(100);
      this.recording = true;
      this.recordingType = 'audio';

      audioBtn.textContent = 'Stop Recording';
      status.textContent = 'Recording audio... (click to stop)';
    } catch (err) {
      console.error('Error starting audio recording:', err);
      showError('Could not start recording: ' + err.message);
      selectMediaBtn.disabled = false;
    }
  },

  setupAudioVisualizer(stream) {
    const audioViz = document.getElementById('capture-audio-viz');
    if (!audioViz) return;
    
    // Create audio context and analyser
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    // Create CAVA-style bars
    const barsContainer = audioViz.querySelector('.cava-bars');
    if (barsContainer) {
      barsContainer.innerHTML = '';
      const bufferLength = this.analyser.frequencyBinCount;
      for (let i = 0; i < 32; i++) {
        const bar = document.createElement('div');
        bar.className = 'cava-bar';
        bar.style.animationDelay = `${i * 0.05}s`;
        barsContainer.appendChild(bar);
      }
    }

    const updateViz = () => {
      // Keyed off the analyser, not this.recording, so the bars move as soon
      // as the mic is live rather than only once recording has started.
      if (!this.analyser) return;

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);
      
      // Update bar heights based on frequency data
      const bars = barsContainer.querySelectorAll('.cava-bar');
      const step = Math.floor(bufferLength / bars.length);
      bars.forEach((bar, i) => {
        const value = dataArray[i * step];
        const height = (value / 255) * 100;
        bar.style.height = `${Math.max(10, height)}%`;
      });
      
      this.animationFrame = requestAnimationFrame(updateViz);
    };
    
    updateViz();
  },

  stopVisualizer() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
  },

  stopRecording() {
    const status = document.getElementById('media-status');
    const videoBtn = document.getElementById('capture-video-btn');
    const audioBtn = document.getElementById('capture-audio-btn');

    if (!this.mediaRecorder || !this.recording) return;

    status.textContent = 'Processing...';
    this.mediaRecorder.stop();
    this.recording = false;

    if (this.recordingType === 'video' && videoBtn) {
      videoBtn.textContent = 'Start Recording';
    } else if (this.recordingType === 'audio' && audioBtn) {
      audioBtn.textContent = 'Start Recording';
    }
  },

  async processRecordedMedia(type) {
    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');

    if (this.recordedChunks.length === 0) {
      showError('No recorded data found');
      return;
    }

    try {
      // Determine mime type
      let mimeType = type === 'video' 
        ? 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
        : 'audio/mpeg';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = type === 'video' ? 'video/webm' : 'audio/webm';
      }

      const extension = mimeType.includes('mp4') || mimeType.includes('mpeg') 
        ? (type === 'video' ? 'mp4' : 'mp3')
        : 'webm';
        
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const file = new File([blob], `${type}_${Date.now()}.${extension}`, { type: mimeType });

      status.textContent = `Uploading ${type}...`;

      this.originalImage = null;
      await this.uploadAndReplace(file);

      this.closeCaptureModal();
      this.clearMediaInput();

      status.textContent = type.charAt(0).toUpperCase() + type.slice(1) + ' recorded!';
      selectMediaBtn.disabled = false;
      this.recordedChunks = [];
    } catch (err) {
      console.error('Error processing recording:', err);
      showError(err.message);
      status.textContent = 'Upload failed';
      selectMediaBtn.disabled = false;
    }
  },

  clearMediaInput() {
    const mediaInput = document.getElementById('media-input');
    if (mediaInput) mediaInput.value = '';
  },

  clearMedia() {
    // Delete the uploaded file server-side so abandoned uploads don't orphan.
    // Only fires when media was uploaded but never attached to a post.
    const orphanId = this.currentMediaId;
    if (orphanId) {
      api.deleteMedia(orphanId).catch(err => {
        console.error('Failed to delete unused media:', err.message);
      });
    }

    this.currentMediaUrl = null;
    this.currentMediaType = null;
    this.currentMediaId = null;
    this.originalImage = null;
    this.imageRotation = 0;
    this.stopCaptureStream();
    this.stopVisualizer();
    
    const preview = document.getElementById('media-preview');
    const mediaInput = document.getElementById('media-input');
    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');
    
    if (preview) preview.innerHTML = '';
    if (mediaInput) mediaInput.value = '';
    if (status) status.textContent = '';
    if (selectMediaBtn) selectMediaBtn.textContent = 'Add Media';
  },

  // Reset media state WITHOUT deleting server-side (media is now owned by a post)
  resetMediaState() {
    this.currentMediaUrl = null;
    this.currentMediaType = null;
    this.currentMediaId = null;
    this.originalImage = null;
    this.imageRotation = 0;
    this.stopCaptureStream();
    this.stopVisualizer();

    const preview = document.getElementById('media-preview');
    const mediaInput = document.getElementById('media-input');
    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');

    if (preview) preview.innerHTML = '';
    if (mediaInput) mediaInput.value = '';
    if (status) status.textContent = '';
    if (selectMediaBtn) selectMediaBtn.textContent = 'Add Media';
  },

  async handlePostSubmit(e) {
    e.preventDefault();
    const textarea = document.getElementById('post-text');
    const text = textarea.value.trim();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!text) {
      showError('Please enter some text');
      return;
    }

    if (this.uploading) {
      showError('Please wait for your media to finish uploading');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    try {
      await api.post(text, this.currentMediaUrl);

      textarea.value = '';
      this.clearDraft();
      // Media is now owned by the post - reset state without deleting it
      this.resetMediaState();
      showSuccess('Post created!');
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post';
    }
  },

  saveDraft(text) {
    localStorage.setItem(this.DRAFT_KEY, text);
  },

  loadDraft() {
    return localStorage.getItem(this.DRAFT_KEY) || '';
  },

  clearDraft() {
    localStorage.removeItem(this.DRAFT_KEY);
  }
};

window.CreatePostPage = CreatePostPage;
