/** Authenticated Google Drive audio loading and a single reusable HTMLAudioElement controller. */
export function createDriveAudioLoader({ getAccessToken, cache, fetchImpl = fetch, makeURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL }) {
  const urls = new Set();
  async function request(url, token) {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      const error = new Error('Google Drive authorization expired or access was denied. Reconnect and retry.');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }
    if (!response.ok) throw new Error(`Drive request failed (${response.status}).`);
    return response;
  }
  async function load({ bookId, fileId, onStatus = () => {} }) {
    if (!bookId || !fileId) throw new Error('An audio asset needs a book ID and Drive file ID.');
    onStatus('loading');
    try {
      const session = await getAccessToken();
      if (!session?.token || !session?.accountId) {
        const error = new Error('Connect Google Drive to listen to this chapter.');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }
      const id = encodeURIComponent(fileId);
      const metadata = await (await request(`https://www.googleapis.com/drive/v3/files/${id}?fields=id%2Cname%2CmimeType%2CmodifiedTime%2Cmd5Checksum&supportsAllDrives=true`, session.token)).json();
      if (metadata.mimeType !== 'audio/mpeg') throw new Error(`Unsupported audiobook type: ${metadata.mimeType || 'unknown'}.`);
      const version = metadata.md5Checksum || metadata.modifiedTime;
      if (!version) throw new Error('Drive did not provide a version for this audio asset.');
      const key = JSON.stringify([session.accountId, bookId, fileId]);
      let item = await cache.get(key);
      if (!item || item.version !== version || !(item.blob instanceof Blob) || !item.blob.size) {
        const response = await request(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, session.token);
        const source = await response.blob();
        if (!source.size) throw new Error('Drive returned an empty audio file.');
        const blob = source.type === 'audio/mpeg' ? source : new Blob([source], { type: metadata.mimeType });
        item = { key, version, blob };
        await cache.put(item);
      }
      const url = makeURL(item.blob);
      urls.add(url);
      onStatus('ready');
      return url;
    } catch (error) {
      onStatus(error.code === 'AUTH_REQUIRED' ? 'authorization-required' : 'error');
      throw error;
    }
  }
  return { load, release(url) { if (urls.delete(url)) revokeURL(url); }, dispose() { for (const url of urls) revokeURL(url); urls.clear(); } };
}

export function createAudioPlaybackController({ audio, onStateChange = () => {} }) {
  const state = { loading: false, playing: false, currentTime: 0, duration: 0, volume: 1, rate: 1, error: '' };
  const publish = () => onStateChange({ ...state });
  const updateTime = () => { state.currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0; if (Number.isFinite(audio.duration)) state.duration = audio.duration; publish(); };
  audio.preload = 'metadata';
  audio.playbackRate = 1;
  audio.volume = 1;
  audio.addEventListener('loadstart', () => { state.loading = true; state.error = ''; publish(); });
  audio.addEventListener('waiting', () => { state.loading = true; publish(); });
  audio.addEventListener('canplay', () => { state.loading = false; publish(); });
  audio.addEventListener('loadedmetadata', () => { state.loading = false; state.duration = Number.isFinite(audio.duration) ? audio.duration : 0; publish(); });
  audio.addEventListener('timeupdate', updateTime);
  audio.addEventListener('durationchange', updateTime);
  audio.addEventListener('play', () => { state.playing = true; publish(); });
  audio.addEventListener('pause', () => { state.playing = false; publish(); });
  audio.addEventListener('ended', () => { state.playing = false; publish(); });
  audio.addEventListener('error', () => { state.loading = false; state.playing = false; state.error = 'Audio could not be loaded. Check your connection and retry.'; publish(); });
  publish();
  return {
    state: () => ({ ...state }),
    setSource(url) { audio.pause(); audio.src = url; state.currentTime = 0; state.duration = 0; state.error = ''; audio.load(); publish(); },
    async play() { state.error = ''; publish(); try { await audio.play(); } catch { state.playing = false; state.error = 'Playback could not start. Press Play to retry.'; publish(); } },
    pause() { audio.pause(); },
    seek(seconds) { if (!Number.isFinite(audio.duration) || !audio.duration) return; audio.currentTime = Math.max(0, Math.min(audio.duration, seconds)); updateTime(); },
    skip(seconds) { this.seek((Number.isFinite(audio.currentTime) ? audio.currentTime : 0) + seconds); },
    setVolume(value) { const volume = Math.max(0, Math.min(1, Number(value))); audio.volume = volume; state.volume = volume; publish(); },
    setRate(value) { const rate = [0.75, 1, 1.25, 1.5, 2].includes(Number(value)) ? Number(value) : 1; audio.playbackRate = rate; state.rate = rate; publish(); },
    retry() { if (!audio.src) return; audio.pause(); state.error = ''; state.loading = true; publish(); audio.load(); },
    dispose() { audio.pause(); audio.removeAttribute('src'); audio.load(); state.playing = false; state.loading = false; publish(); }
  };
}
