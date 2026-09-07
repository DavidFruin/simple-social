// pages/create-post.js - Create Post Page
const CreatePostPage = {
  DRAFT_KEY: 'ss_post_draft',
  currentMediaUrl: null,
  currentMediaType: null,
  uploading: false,
  captureStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recording: false,
  recordingType: null,
  audioContext: null,
  analyser: null,
  animationFrame: null,

  render(container) {
    const draft = this.loadDraft();

    container.innerHTML = `
      <div class="page-container">
        <h1>Create Post</h1>
        
        <div class="composer">
          <form id="post-form">
            <textarea id="post-text" placeholder="What's on your mind?">${escapeHtml(draft)}</textarea>
            
            <div id="media-preview" class="media-preview"></div>
            
            <div class="media-upload-section">
              <input type="file" id="media-input" accept="image/jpeg,image/png,image/gif,image/webp,video/quicktime,video/mp4,video/m4v,audio/wav,audio/mpeg,audio/mp3" style="display:none">
              <button type="button" id="select-media-btn" class="btn btn-secondary">Add Media</button>
              <button type="button" id="capture-media-btn" class="btn btn-secondary">Capture Media</button>
              <span id="media-status"></span>
            </div>

            <div id="capture-modal" class="capture-modal hidden">
              <div class="capture-overlay"></div>
              <div class="capture-container">
                <div class="capture-header">
                  <h3>Capture Media</h3>
                  <button type="button" class="capture-close" onclick="CreatePostPage.closeCaptureModal()">×</button>
                </div>
                <div class="capture-preview">
                  <video id="capture-video" autoplay playsinline></video>
                  <canvas id="capture-canvas" class="hidden"></canvas>
                  <div id="capture-audio-viz" class="capture-audio-viz hidden">
                    <div class="cava-bars"></div>
                  </div>
                </div>
                <div class="capture-controls">
                  <button type="button" id="capture-photo-btn" class="btn btn-primary">📷 Photo</button>
                  <button type="button" id="capture-video-btn" class="btn btn-primary">🎥 Video</button>
                  <button type="button" id="capture-audio-btn" class="btn btn-primary">🎤 Audio</button>
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
    
    this.uploading = true;
    selectMediaBtn.disabled = true;
    status.textContent = 'Uploading...';

    try {
      const result = await api.uploadMedia(file);
      
      this.currentMediaUrl = result.mediaUrl;
      this.currentMediaType = result.type;
      
      this.renderMediaPreview(result);
      status.textContent = 'Uploaded!';
      selectMediaBtn.textContent = 'Change Media';
    } catch (err) {
      showError(err.message);
      status.textContent = 'Upload failed';
      this.clearMedia();
    } finally {
      this.uploading = false;
      selectMediaBtn.disabled = false;
    }
  },

  renderMediaPreview(mediaData) {
    const preview = document.getElementById('media-preview');
    if (!preview) return;

    const url = mediaData.thumbnailUrl || mediaData.mediaUrl;
    const type = mediaData.type;

    if (type === 'image') {
      preview.innerHTML = `
        <div class="media-preview-item">
          <img src="${url}" alt="Preview">
          <button type="button" class="media-remove-btn" onclick="CreatePostPage.clearMedia()">×</button>
        </div>
      `;
    } else if (type === 'video') {
      preview.innerHTML = `
        <div class="media-preview-item video">
          <video src="${url}"></video>
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

  async openCaptureModal() {
    const modal = document.getElementById('capture-modal');
    const video = document.getElementById('capture-video');
    const captureBtns = document.querySelectorAll('#capture-photo-btn, #capture-video-btn, #capture-audio-btn');
    const status = document.getElementById('media-status');
    const videoBtn = document.getElementById('capture-video-btn');
    const audioBtn = document.getElementById('capture-audio-btn');

    if (!modal || !video) return;

    this.stopCaptureStream();

    modal.classList.remove('hidden');
    status.textContent = 'Starting camera...';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      this.captureStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';

      // Show/hide relevant buttons
      videoBtn.style.display = 'inline-block';
      audioBtn.style.display = 'inline-block';
      
      captureBtns.forEach(btn => btn.disabled = false);
      this.recording = false;
      this.recordedChunks = [];
      status.textContent = '';
    } catch (err) {
      console.error('Error accessing media devices:', err);
      showError('Could not access camera/microphone. Please check permissions.');
      this.closeCaptureModal();
    }
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
    
    // Reset button texts
    const videoBtn = document.getElementById('capture-video-btn');
    const audioBtn = document.getElementById('capture-audio-btn');
    if (videoBtn) videoBtn.textContent = '🎥 Video';
    if (audioBtn) audioBtn.textContent = '🎤 Audio';
  },

  async capturePhoto() {
    const video = document.getElementById('capture-video');
    const canvas = document.getElementById('capture-canvas');
    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');

    if (!video || !video.srcObject) {
      showError('Camera not available. Click "Capture Media" first.');
      return;
    }

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

      const result = await api.uploadMedia(file);

      this.currentMediaUrl = result.mediaUrl;
      this.currentMediaType = result.type;
      this.renderMediaPreview(result);

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

    const video = document.getElementById('capture-video');
    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');
    const videoBtn = document.getElementById('capture-video-btn');

    if (!this.captureStream) {
      // Request camera if not already open
      status.textContent = 'Starting camera...';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.captureStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
      } catch (err) {
        showError('Camera not available. Click "Capture Media" first.');
        return;
      }
    }

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

      videoBtn.textContent = '⏹ Stop';
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

    const video = document.getElementById('capture-video');
    const audioViz = document.getElementById('capture-audio-viz');
    const status = document.getElementById('media-status');
    const selectMediaBtn = document.getElementById('select-media-btn');
    const audioBtn = document.getElementById('capture-audio-btn');

    if (!this.captureStream) {
      // Request microphone only
      status.textContent = 'Starting microphone...';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.captureStream = stream;
        video.style.display = 'none';
        audioViz.classList.remove('hidden');
      } catch (err) {
        showError('Microphone not available. Click "Capture Media" first.');
        return;
      }
    } else {
      // Hide video, show audio viz
      video.style.display = 'none';
      audioViz.classList.remove('hidden');
    }

    // Hide video when recording audio
    video.style.display = 'none';
    audioViz.classList.remove('hidden');

    status.textContent = 'Starting audio recording...';
    selectMediaBtn.disabled = true;

    try {
      const audioTracks = this.captureStream.getAudioTracks();
      if (audioTracks.length === 0) {
        showError('No microphone available');
        selectMediaBtn.disabled = false;
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      
      // Set up audio visualizer
      this.setupAudioVisualizer(audioStream);

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

      audioBtn.textContent = '⏹ Stop';
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
      if (!this.recording || !this.analyser) return;
      
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
    const video = document.getElementById('capture-video');
    const audioViz = document.getElementById('capture-audio-viz');
    
    if (!this.mediaRecorder || !this.recording) return;

    status.textContent = 'Processing...';
    this.mediaRecorder.stop();
    this.recording = false;

    // Reset button text
    if (this.recordingType === 'video' && videoBtn) {
      videoBtn.textContent = '🎥 Video';
    } else if (this.recordingType === 'audio' && audioBtn) {
      audioBtn.textContent = '🎤 Audio';
      // Show video again for audio mode
      if (video) video.style.display = 'block';
      if (audioViz) audioViz.classList.add('hidden');
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

      const result = await api.uploadMedia(file);

      this.currentMediaUrl = result.mediaUrl;
      this.currentMediaType = result.type;
      this.renderMediaPreview(result);

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
    this.currentMediaUrl = null;
    this.currentMediaType = null;
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    try {
      await api.post(text, this.currentMediaUrl);

      textarea.value = '';
      this.clearDraft();
      this.clearMedia();
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
