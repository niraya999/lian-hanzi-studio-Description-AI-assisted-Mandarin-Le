/** Read-only Drive asset loader. Credentials are supplied by the host and never persisted. */
export function createDriveAssetLoader({ getAccessToken, cache, fetchImpl = fetch, makeURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL }) {
  const urls = new Set();
  async function request(url, token) {
    const result = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (result.status === 401 || result.status === 403) { const error = new Error(result.status === 401 ? 'Google Drive access token expired or was rejected (401).' : 'The connected Google account cannot access this Drive file (403).'); error.code = 'AUTH_REQUIRED'; error.status = result.status; throw error; }
    if (!result.ok) throw new Error(`Drive request failed (${result.status}).`);
    return result;
  }
  async function load({ bookId, fileId, onStatus = () => {} }) {
    if (!bookId || !fileId) throw new Error('An asset needs a book ID and Drive file ID.');
    onStatus('loading');
    try {
      const session = await getAccessToken();
      if (!session?.token || !session?.accountId) { const error = new Error('Connect Google Drive to view this book.'); error.code = 'AUTH_REQUIRED'; throw error; }
      const id = encodeURIComponent(fileId);
      const meta = await (await request(`https://www.googleapis.com/drive/v3/files/${id}?fields=id%2Cname%2CmimeType%2CmodifiedTime%2Cmd5Checksum&supportsAllDrives=true`, session.token)).json();
      if (!['image/png', 'image/jpeg'].includes(meta.mimeType)) throw new Error('Only PNG and JPEG book assets are supported.');
      const version = meta.md5Checksum || meta.modifiedTime;
      if (!version) throw new Error('Drive did not provide a version for this asset.');
      const key = JSON.stringify([session.accountId, bookId, fileId]);
      let item = await cache.get(key);
      if (!item || item.version !== version || !(item.blob instanceof Blob)) {
        const response = await request(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, session.token);
        const blob = await response.blob();
        if (!blob.size || !['image/png', 'image/jpeg'].includes(blob.type)) throw new Error('Drive returned an invalid image.');
        item = { key, version, blob };
        await cache.put(item);
      }
      const url = makeURL(item.blob); urls.add(url); onStatus('ready'); return url;
    } catch (error) { onStatus(error.code === 'AUTH_REQUIRED' ? 'authorization-required' : 'error'); throw error; }
  }
  return { load, release(url) { if (urls.delete(url)) revokeURL(url); }, dispose() { for (const url of urls) revokeURL(url); urls.clear(); } };
}

/** Separate database prevents schema changes to existing progress or bookmarks. */
export function createDriveAssetCache(indexedDB = globalThis.indexedDB) {
  let opening;
  const open = () => opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('lian-living-book-asset-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    async get(key) { const db = await open(); return new Promise((resolve, reject) => { const req = db.transaction('assets').objectStore('assets').get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); },
    async put(item) { const db = await open(); return new Promise((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put(item); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  };
}
