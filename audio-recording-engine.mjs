export const RECORDING_BITRATES = Object.freeze([128, 192, 256, 320]);

export function parseDuration(value) {
  const text = String(value ?? '').trim();
  if (!text) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const match = text.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (!match) return NaN;
  return match[3] ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : Number(match[1]) * 60 + Number(match[2]);
}

export function isValidMp3(blob) {
  return blob instanceof Blob && blob.size >= 4 && blob.type === 'audio/mpeg';
}

export class AudioRecordingEngine {
  constructor({ windowRef = globalThis.window, onState = () => {}, onReady = async () => {}, onError = () => {}, now = () => Date.now() } = {}) {
    this.win = windowRef;
    this.onState = onState;
    this.onReady = onReady;
    this.onError = onError;
    this.now = now;
    this.context = null;
    this.source = null;
    this.captureNode = null;
    this.worker = null;
    this.session = null;
    this.autoStopTimer = null;
    this.previousAutoNext = null;
    this.stopping = false;
  }

  get supported() {
    return !!(this.win?.AudioContext && this.win?.AudioWorkletNode && this.win?.Worker && this.win?.Blob);
  }

  async ensureSession(audio) {
    if (!this.supported) throw new Error('Audio recording is unavailable in this browser. Use an up-to-date Chrome browser.');
    if (this.source && this.audio !== audio) throw new Error('The active audio element changed. Disconnect audio capture before recording another source.');
    if (!this.source) {
      this.audio = audio;
      this.context = new this.win.AudioContext({ sampleRate: 44100 });
      this.source = this.context.createMediaElementSource(audio);
      this.source.connect(this.context.destination);
    }
    if (this.context.sampleRate !== 44100) throw new Error('This browser could not provide the required 44.1 kHz audio context.');
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.captureNode) {
      await this.context.audioWorklet.addModule(new URL('./audio-capture.worklet.js', import.meta.url));
      this.captureNode = new this.win.AudioWorkletNode(this.context, 'lhs-audio-capture', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
      });
      const silence = this.context.createGain();
      silence.gain.value = 0;
      this.source.connect(this.captureNode);
      this.captureNode.connect(silence);
      silence.connect(this.context.destination);
      this.silenceNode = silence;
    }
    return this.captureNode;
  }

  async start({ audio, trackId, folderId = trackId, trackName = '', duration, bitrate = 256, trackIsCurrent = () => true, autoNextCheckbox, sourceType = 'authorized-native-audio', captureConsent = false, autoStop = true }) {
    if (this.session) throw new Error('A recording session is already active.');
    if (!captureConsent) throw new Error('Enable audio recording and accept the recording consent in Music Recording settings first.');
    if (!audio || !trackId || !folderId || !trackIsCurrent()) throw new Error('A current track and its Google Drive folder are required.');
    if (!['authorized-native-audio', 'imported-local-audio'].includes(sourceType)) throw new Error('This audio source cannot be recorded in LHS. Suno embeds and restricted sources are not supported.');
    if (!(audio.currentSrc || audio.src || '').startsWith('blob:')) throw new Error('Recording is supported only for an authorized MP3 loaded in the native player.');
    const actual = Number(audio.duration);
    const seconds = Number.isFinite(actual) && actual > 0 ? actual : Number(duration);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Track duration is unavailable. Enter a duration such as 03:42 in Settings.');
    if (!RECORDING_BITRATES.includes(Number(bitrate))) throw new Error('Choose 128, 192, 256, or 320 kbps.');

    const captureNode = await this.ensureSession(audio);
    const sourceUrl = audio.currentSrc || audio.src;
    const worker = new this.win.Worker(new URL('./mp3-encoder.worker.js', import.meta.url));
    this.worker = worker;
    const channels = Math.min(2, audio.mozChannels || 2);
    try { await new Promise((resolve, reject) => {
      const timeout = this.win.setTimeout(() => reject(new Error('MP3 encoder did not initialize.')), 10000);
      worker.onmessage = (event) => {
        if (event.data?.type === 'started') { this.win.clearTimeout(timeout); resolve(); }
        if (event.data?.type === 'error') { this.win.clearTimeout(timeout); reject(new Error(event.data.message)); }
      };
      worker.onerror = (event) => { this.win.clearTimeout(timeout); reject(new Error(event.message || 'MP3 worker failed to load.')); };
      worker.postMessage({ type: 'start', bitrate: Number(bitrate), channels });
    }); } catch (error) { worker.terminate(); if (this.worker === worker) this.worker = null; throw error; }
    worker.onmessage = (event) => {
      if (event.data?.type === 'pcm') {
        const mono = event.data.channels.length === 1;
        worker.postMessage({ type: 'pcm', channels: event.data.channels, mono });
      }
      if (event.data?.type === 'done') this.finalizePromise = this.finalize(event.data.blob, Number(event.data.bitrate));
      if (event.data?.type === 'error') this.fail(new Error(event.data.message));
    };
    captureNode.port.onmessage = (event) => {
      if (!this.session) return;
      if (event.data?.type === 'pcm') worker.postMessage({ type: 'pcm', channels: event.data.channels }, event.data.channels.map((channel) => channel.buffer));
    };

    this.session = { audio, trackId, folderId, trackName, duration: seconds, bitrate: Number(bitrate), sourceUrl, sourceType, trackIsCurrent, autoStop: !!autoStop, startedAt: this.now() };
    this.stopping = false;
    this.setAutoNext(autoNextCheckbox, false);
    audio.pause();
    try { audio.currentTime = 0; } catch {}
    this.bindAudioEvents();
    try {
      await audio.play();
      if (!trackIsCurrent() || (audio.currentSrc || audio.src) !== sourceUrl) throw new Error('Track changed while recording was starting.');
      this.setCapturing(true);
      this.onState({ state: 'recording', elapsed: 0, duration: seconds, trackName });
      this.autoStopTimer = this.win.setInterval(() => this.tick(), 150);
      return true;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  setAutoNext(checkbox, value) {
    this.autoNextCheckbox = checkbox || null;
    if (!checkbox) return;
    if (this.previousAutoNext === null) {
      this.previousAutoNext = checkbox.checked;
      this.previousAutoNextDisabled = checkbox.disabled;
    }
    checkbox.checked = value;
    checkbox.disabled = true;
  }

  setCapturing(active) {
    this.captureNode?.port.postMessage({ type: active ? 'record' : 'pause' });
  }

  bindAudioEvents() {
    const a = this.session.audio;
    this.bound = {
      pause: () => this.updateCaptureState(false, 'paused'),
      waiting: () => this.updateCaptureState(false, 'buffering'),
      stalled: () => this.updateCaptureState(false, 'buffering'),
      seeking: () => this.updateCaptureState(false, 'seeking'),
      playing: () => this.updateCaptureState(true, 'playing'),
      canplay: () => { if (!a.paused && !a.seeking) this.updateCaptureState(true, 'playing'); },
      timeupdate: () => this.tick(),
      ended: () => { if (this.session?.autoStop) this.stop('duration'); else this.setCapturing(false); }
    };
    for (const [name, fn] of Object.entries(this.bound)) a.addEventListener(name, fn);
  }

  updateCaptureState(active, playbackState) {
    if (!this.session) return;
    const isActive = !!active && !this.session.audio.paused && !this.session.audio.seeking && this.session.audio.readyState >= 3;
    this.setCapturing(isActive);
    this.onState({ state: 'recording', elapsed: Number(this.session.audio.currentTime) || 0, duration: this.session.duration, trackName: this.session.trackName, captureActive: isActive, playbackState });
  }

  tick() {
    const s = this.session;
    if (!s) return;
    if (!s.trackIsCurrent() || (s.audio.currentSrc || s.audio.src) !== s.sourceUrl) {
      this.cancel('Recording cancelled because the active track changed.');
      return;
    }
    const elapsed = Math.max(0, Number(s.audio.currentTime) || 0);
    const captureActive = !s.audio.paused && !s.audio.seeking && s.audio.readyState >= 3;
    this.onState({ state: 'recording', elapsed: Math.min(elapsed, s.duration), duration: s.duration, trackName: s.trackName, captureActive, playbackState: captureActive ? 'playing' : s.audio.paused ? 'paused' : 'buffering' });
    if (s.autoStop && elapsed >= s.duration) return this.stop('duration');
  }

  async stop(reason = 'manual') {
    if (!this.session || !this.worker || this.stopping) return false;
    this.stopping = true;
    this.unbindAudioEvents();
    this.setCapturing(false);
    this.win.clearInterval(this.autoStopTimer);
    this.autoStopTimer = null;
    this.onState({ state: 'encoding', reason });
    this.session.recordedDuration = Math.max(0, Math.min(this.session.duration, Number(this.session.audio.currentTime) || 0));
    if (this.session.recordedDuration < 1) { this.fail(new Error('Record at least one second of audio before stopping.')); return false; }
    const worker = this.worker;
    await new Promise((resolve, reject) => {
      const port = this.captureNode.port;
      const previous = port.onmessage;
      const timeout = this.win.setTimeout(() => { port.onmessage = previous; reject(new Error('Audio capture flush timed out.')); }, 5000);
      const onFlush = (event) => {
        previous?.(event);
        if (event.data?.type !== 'flushed') return;
        this.win.clearTimeout(timeout);
        port.onmessage = previous;
        resolve();
      };
      port.onmessage = onFlush;
      port.postMessage({ type: 'flush' });
    }).catch((error) => { this.fail(error); throw error; });
    await new Promise((resolve, reject) => {
      const timeout = this.win.setTimeout(() => reject(new Error('MP3 encoding timed out. Try a shorter track.')), 120000);
      const previous = worker.onmessage;
      worker.onmessage = (event) => {
        previous?.(event);
        if (event.data?.type === 'done') { this.win.clearTimeout(timeout); resolve(); }
        if (event.data?.type === 'error') { this.win.clearTimeout(timeout); reject(new Error(event.data.message)); }
      };
      worker.postMessage({ type: 'finish' });
    }).then(() => this.finalizePromise).catch((error) => this.fail(error));
    return true;
  }

  async finalize(blob, bitrate) {
    const s = this.session;
    if (!s) return;
    if (!(blob instanceof Blob) || blob.size < 4 || blob.type !== 'audio/mpeg') return this.fail(new Error('The encoder returned an invalid MP3.'));
    try {
      await this.onReady({ ...s, duration: s.recordedDuration ?? s.duration, blob, bitrate, createdAt: new Date().toISOString(), size: blob.size });
      this.cleanup();
      this.onState({ state: 'ready', duration: s.duration, bitrate, size: blob.size, trackName: s.trackName });
    } catch (error) {
      this.fail(error);
    }
  }

  async cancel(message = 'Recording cancelled.') {
    if (!this.session) return false;
    this.worker?.postMessage({ type: 'cancel' });
    this.cleanup();
    this.onState({ state: 'failed', message });
    return true;
  }

  fail(error) {
    const message = error?.message || 'Recording failed.';
    this.worker?.postMessage({ type: 'cancel' });
    this.cleanup();
    this.onError(message);
    this.onState({ state: 'failed', message });
  }

  unbindAudioEvents() {
    if (!this.bound || !this.session) return;
    for (const [name, fn] of Object.entries(this.bound)) this.session.audio.removeEventListener(name, fn);
    this.bound = null;
  }

  cleanup() {
    const s = this.session;
    this.unbindAudioEvents();
    this.win.clearInterval(this.autoStopTimer);
    this.autoStopTimer = null;
    this.captureNode?.port.postMessage({ type: 'stop' });
    this.worker?.terminate();
    this.worker = null;
    this.session = null;
    this.stopping = false;
    if (this.previousAutoNext !== null && this.autoNextCheckbox) {
      this.autoNextCheckbox.checked = this.previousAutoNext;
      this.autoNextCheckbox.disabled = this.previousAutoNextDisabled;
    }
    this.previousAutoNext = null;
    this.previousAutoNextDisabled = null;
    this.autoNextCheckbox = null;
    if (s?.audio && !s.audio.paused && s.audio.currentTime >= s.duration) s.audio.pause();
  }

  releaseCaptureGraph() {
    this.captureNode?.disconnect();
    this.captureNode = null;
    this.silenceNode?.disconnect();
    this.silenceNode = null;
  }

  async disconnect() {
    if (this.session) await this.cancel('Recording cancelled because audio capture was disconnected.');
    this.releaseCaptureGraph();
    if (this.source) this.source.disconnect(this.context.destination);
    if (this.source && this.context) this.source.connect(this.context.destination);
    this.onState({ state: 'ready' });
  }
}
