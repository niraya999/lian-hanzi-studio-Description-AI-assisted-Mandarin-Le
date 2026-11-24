import { AudioRecordingEngine, parseDuration, RECORDING_BITRATES } from './audio-recording-engine.mjs';

(() => {
  const $ = (id) => document.getElementById(id);
  const keys = {
    enabled: 'lhs.recording.enabled', consent: 'lhs.recording.consent', reuse: 'lhs.recording.reuse',
    autoStop: 'lhs.recording.autoStop', bitrate: 'lhs.recording.bitrate', duration: 'lhs.recording.duration'
  };
  const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  const enabled = $('enableAudioRecording');
  const consent = $('rememberRecordingConsent');
  const reuse = $('reuseAudioCapture');
  const autoStop = $('recordingAutoStop');
  const bitrate = $('recordingBitrate');
  const manualDuration = $('recordingManualDuration');
  const panel = $('audioRecordingPanel');
  const stateText = $('audioRecordingStatus');
  const elapsedText = $('audioRecordingElapsed');
  const recButton = $('startAudioRecording');
  const stopButton = $('stopAudioRecording');
  const cancelButton = $('cancelAudioRecording');
  const disconnectButton = $('disconnectAudioCapture');
  if (!panel || !enabled) return;

  enabled.checked = read(keys.enabled, '0') === '1';
  consent.checked = read(keys.consent, '0') === '1';
  reuse.checked = read(keys.reuse, '1') !== '0';
  autoStop.checked = read(keys.autoStop, '1') !== '0';
  bitrate.value = RECORDING_BITRATES.includes(Number(read(keys.bitrate, '256'))) ? read(keys.bitrate, '256') : '256';
  manualDuration.value = read(keys.duration, '');
  let current = null;
  let readyMessage = '';
  const fmt = (seconds) => {
    const n = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  };
  const setStatus = (message, state = '') => {
    stateText.textContent = message;
    stateText.dataset.state = state;
  };
  const engine = new AudioRecordingEngine({
    onState(state) {
      if (state.state === 'recording') {
        panel.dataset.recording = 'true';
        elapsedText.textContent = `● REC ${fmt(state.elapsed)} / ${fmt(state.duration)}`;
        setStatus(`${state.captureActive ? 'Audio capture active' : 'Recording paused during ' + (state.playbackState || 'buffering')} · Auto Next suspended.`, 'recording');
        recButton.hidden = true;
        stopButton.hidden = false;
        cancelButton.hidden = false;
      } else if (state.state === 'encoding') {
        panel.dataset.recording = 'false';
        setStatus('Encoding MP3...', 'encoding');
        recButton.hidden = true;
        stopButton.hidden = true;
        cancelButton.hidden = true;
      } else if (state.state === 'ready') {
        panel.dataset.recording = 'false';
        elapsedText.textContent = '';
        recButton.hidden = false;
        stopButton.hidden = true;
        cancelButton.hidden = true;
        if (readyMessage) setStatus(readyMessage, 'ready');
        if (!reuse.checked) engine.releaseCaptureGraph();
      } else if (state.state === 'failed') {
        panel.dataset.recording = 'false';
        elapsedText.textContent = '';
        recButton.hidden = false;
        stopButton.hidden = true;
        cancelButton.hidden = true;
        setStatus(`Recording Failed — ${state.message}`, 'failed');
        if (!reuse.checked) engine.releaseCaptureGraph();
      }
      updatePanel();
    },
    async onReady(recording) {
      const store = window.lhsMp3Cache;
      if (!store?.putRecording) throw new Error('Persistent MP3 cache is unavailable. Enable the cache in Music Auto Sync settings.');
      if (!store.isEnabled()) throw new Error('Persistent MP3 cache is disabled. Enable it in Music Auto Sync settings, then record again.');
      const saved = await store.putRecording(recording);
      if (!saved) throw new Error('The MP3 could not be saved in persistent cache. Pending recordings were preserved.');
      readyMessage = `MP3 Ready · ${recording.trackName} · ${fmt(recording.duration)} · ${recording.bitrate} kbps · ${(recording.size / 1048576).toFixed(1)} MB · saved to persistent cache.`;
    },
    onError(message) { setStatus(`Recording Failed — ${message}`, 'failed'); }
  });
  window.lhsAudioRecordingEngine = engine;

  function metadataDuration(audio) {
    const value = Number(audio?.duration);
    return Number.isFinite(value) && value > 0 ? value : NaN;
  }
  function updatePanel() {
    const audio = $('nativeTrackAudio');
    const id = window.lhsCurrentTrackId;
    const isNative = !!(audio && id && !audio.error && /^blob:/i.test(audio.currentSrc || audio.src));
    const show = enabled.checked && consent.checked && isNative;
    panel.hidden = !show;
    recButton.hidden = !show || !!engine.session;
    stopButton.hidden = !engine.session || engine.stopping;
    cancelButton.hidden = !engine.session;
    const missing = !Number.isFinite(metadataDuration(audio));
    manualDuration.closest('label').hidden = !missing;
    recButton.disabled = !engine.supported || !window.lhsMp3Cache?.isEnabled?.();
    recButton.title = !engine.supported ? 'AudioWorklet is not available in this browser.' : !window.lhsMp3Cache?.isEnabled?.() ? 'Enable Persistent MP3 cache in Music Auto Sync.' : 'Start recording from the beginning of this track.';
  }
  function storePrefs() {
    write(keys.enabled, enabled.checked ? '1' : '0');
    write(keys.consent, consent.checked ? '1' : '0');
    write(keys.reuse, reuse.checked ? '1' : '0');
    write(keys.autoStop, autoStop.checked ? '1' : '0');
    write(keys.bitrate, bitrate.value);
    write(keys.duration, manualDuration.value);
    updatePanel();
  }
  for (const control of [enabled, consent, reuse, autoStop, bitrate, manualDuration]) control.addEventListener('change', storePrefs);
  $('recordingSettings').addEventListener('toggle', storePrefs);
  recButton.addEventListener('click', async () => {
    try {
      const audio = $('nativeTrackAudio');
      const id = window.lhsCurrentTrackId;
      if (!audio || !id) throw new Error('Select and play an MP3 track first.');
      if (!consent.checked) throw new Error('Check Remember Recording Consent in Music Recording settings first.');
      const duration = metadataDuration(audio);
      const seconds = Number.isFinite(duration) ? duration : parseDuration(manualDuration.value);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Enter a valid duration such as 03:42.');
      const trackName = $('playingTitle').textContent.trim();
      readyMessage = '';
      await engine.start({
        audio, trackId: id, folderId: id, trackName, duration: seconds, bitrate: Number(bitrate.value),
        trackIsCurrent: () => window.lhsCurrentTrackId === id,
        autoNextCheckbox: $('autoNextEnabled'),
        sourceType: 'authorized-native-audio', captureConsent: enabled.checked && consent.checked, autoStop: autoStop.checked
      });
    } catch (error) { setStatus(`Recording Failed — ${error.message}`, 'failed'); updatePanel(); }
  });
  stopButton.addEventListener('click', () => engine.stop('manual'));
  cancelButton.addEventListener('click', () => engine.cancel('Recording cancelled. No MP3 was saved.'));
  disconnectButton.addEventListener('click', async () => {
    await engine.disconnect();
    setStatus('Audio capture disconnected.');
    updatePanel();
  });
  window.addEventListener('lhs-track-ready', (event) => {
    current = event.detail || null;
    readyMessage = '';
    setStatus(engine.session ? 'Recording remains associated with its original track.' : 'Ready for a native MP3 track.');
    updatePanel();
  });
  window.addEventListener('lhs-mp3-cache-updated', updatePanel);
  $('nativeTrackAudio').addEventListener('loadedmetadata', updatePanel);
  $('nativeTrackAudio').addEventListener('play', updatePanel);
  $('nativeTrackAudio').addEventListener('pause', () => { if (!engine.session) updatePanel(); });
  setInterval(updatePanel, 500);
  updatePanel();
})();
