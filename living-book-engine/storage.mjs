const DB_NAME = 'lian-living-book-engine';
const DB_VERSION = 1;

function requestResult(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('IndexedDB request failed.')); });
}

export function createIndexedDBStorage(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error('IndexedDB is unavailable in this browser.');
  let dbPromise;
  const open = () => dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'bookId' });
      if (!db.objectStoreNames.contains('bookmarks')) { const store = db.createObjectStore('bookmarks', { keyPath: 'id' }); store.createIndex('byBook', 'bookId', { unique: false }); }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the reading library.'));
  });
  const transaction = async (storeName, mode, work) => {
    const db = await open(); const tx = db.transaction(storeName, mode); const store = tx.objectStore(storeName); const result = work(store);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted.')); });
    return result;
  };
  return {
    async getProgress(bookId) { const db = await open(); return requestResult(db.transaction('progress').objectStore('progress').get(bookId)); },
    async saveProgress(bookId, value) { return transaction('progress', 'readwrite', store => store.put({ bookId, ...value })); },
    async listBookmarks(bookId) { const db = await open(); return requestResult(db.transaction('bookmarks').objectStore('bookmarks').index('byBook').getAll(bookId)); },
    async addBookmark(bookId, value) { const id = globalThis.crypto?.randomUUID?.() || `${bookId}-${Date.now()}-${Math.random().toString(36).slice(2)}`; const item = { id, bookId, ...value }; await transaction('bookmarks', 'readwrite', store => store.put(item)); return item; }
  };
}
