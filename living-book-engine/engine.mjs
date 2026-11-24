export const BOOK_STATES = Object.freeze({ LIBRARY: 'library', COVER: 'cover', CONTENT: 'content', END: 'end', CLOSED: 'closed' });

export function validateManifest(manifest) {
  if (!manifest || typeof manifest.bookId !== 'string' || !manifest.bookId.trim()) throw new Error('Manifest needs a stable bookId.');
  if (!Array.isArray(manifest.chapters) || !manifest.chapters.length) throw new Error('Manifest needs at least one chapter.');
  const ids = new Set();
  for (const chapter of manifest.chapters) {
    if (!chapter.chapterId || ids.has(chapter.chapterId) || !Array.isArray(chapter.pages)) throw new Error('Each chapter needs a unique chapterId and pages.');
    ids.add(chapter.chapterId);
    for (const page of chapter.pages) {
      if (!page.pageId || ids.has(page.pageId) || !page.text || !page.illustration) throw new Error('Each page needs a unique pageId, illustration, and multilingual text.');
      ids.add(page.pageId);
    }
  }
  return manifest;
}

export function flattenPages(manifest) {
  return manifest.chapters.flatMap(chapter => chapter.pages.map(page => ({ ...page, chapterId: chapter.chapterId, chapterTitle: chapter.title })));
}

export function createBookEngine({ manifest, storage, onChange = () => {}, reducedMotion = false }) {
  validateManifest(manifest);
  const pages = flattenPages(manifest);
  let state = { screen: BOOK_STATES.LIBRARY, pageIndex: 0, layout: 'portrait', bookmarks: [], hasProgress: false, animating: false };
  const snapshot = () => ({ ...state, bookmarks: [...state.bookmarks], bookId: manifest.bookId, pageCount: pages.length });
  const publish = () => onChange(snapshot());
  const persistProgress = async () => storage.saveProgress(manifest.bookId, { pageIndex: state.pageIndex, updatedAt: Date.now() });
  const loadBookmarks = async () => { state.bookmarks = await storage.listBookmarks(manifest.bookId); };

  return {
    manifest, pages, getState: snapshot,
    async initialize() { const progress = await storage.getProgress(manifest.bookId); state.hasProgress = Number.isInteger(progress?.pageIndex); if (state.hasProgress) state.pageIndex = Math.min(Math.max(progress.pageIndex, 0), pages.length - 1); await loadBookmarks(); publish(); return snapshot(); },
    async openBook() { state.screen = BOOK_STATES.COVER; state.animating = false; publish(); return snapshot(); },
    async openCover() {
      const progress = await storage.getProgress(manifest.bookId);
      state.hasProgress = Number.isInteger(progress?.pageIndex);
      state.pageIndex = state.hasProgress ? Math.min(Math.max(progress.pageIndex, 0), pages.length - 1) : 0;
      state.screen = BOOK_STATES.CONTENT;
      await loadBookmarks(); publish(); return snapshot();
    },
    async next() {
      if (state.screen === BOOK_STATES.COVER) return this.openCover();
      if (state.screen !== BOOK_STATES.CONTENT) return snapshot();
      const increment = state.layout === 'spread' ? 2 : 1;
      if (state.pageIndex + increment >= pages.length) { state.screen = BOOK_STATES.END; state.animating = !reducedMotion; await persistProgress(); publish(); return snapshot(); }
      state.pageIndex += increment; await persistProgress(); publish(); return snapshot();
    },
    async previous() {
      if (state.screen === BOOK_STATES.END) { state.screen = BOOK_STATES.CONTENT; state.animating = false; publish(); return snapshot(); }
      if (state.screen === BOOK_STATES.COVER) return snapshot();
      if (state.screen === BOOK_STATES.CONTENT) {
        const decrement = state.layout === 'spread' ? 2 : 1;
        if (state.pageIndex === 0) state.screen = BOOK_STATES.COVER;
        else state.pageIndex = Math.max(0, state.pageIndex - decrement);
        state.animating = !reducedMotion; await persistProgress(); publish();
      }
      return snapshot();
    },
    async close() { if ([BOOK_STATES.CONTENT, BOOK_STATES.COVER, BOOK_STATES.END].includes(state.screen)) { if (state.screen === BOOK_STATES.CONTENT) await persistProgress(); state.screen = BOOK_STATES.CLOSED; state.animating = false; publish(); } return snapshot(); },
    async readAgain() { state.pageIndex = 0; state.screen = BOOK_STATES.CONTENT; state.animating = !reducedMotion; await persistProgress(); publish(); return snapshot(); },
    async returnToLibrary() { if (state.screen === BOOK_STATES.CONTENT) await persistProgress(); state.screen = BOOK_STATES.LIBRARY; state.animating = false; publish(); return snapshot(); },
    async setLayout(layout) { if (!['portrait', 'spread'].includes(layout)) throw new Error('Layout must be portrait or spread.'); state.layout = layout; publish(); return snapshot(); },
    async saveBookmark(label) {
      if (state.screen !== BOOK_STATES.CONTENT) return null;
      const page = pages[state.pageIndex];
      const bookmark = await storage.addBookmark(manifest.bookId, { pageId: page.pageId, pageIndex: state.pageIndex, chapterId: page.chapterId, label: label || page.chapterTitle?.en || `Page ${state.pageIndex + 1}`, createdAt: Date.now() });
      await loadBookmarks(); publish(); return bookmark;
    },
    async goToBookmark(bookmarkId) {
      const bookmark = state.bookmarks.find(item => item.id === bookmarkId);
      if (!bookmark) return snapshot();
      state.pageIndex = Math.min(Math.max(bookmark.pageIndex, 0), pages.length - 1); state.screen = BOOK_STATES.CONTENT; await persistProgress(); publish(); return snapshot();
    },
    currentPages() { const count = state.layout === 'spread' ? 2 : 1; return pages.slice(state.pageIndex, state.pageIndex + count); }
  };
}

export function createMemoryStorage() {
  const progress = new Map(); const bookmarks = new Map(); let sequence = 0;
  return {
    async getProgress(bookId) { return progress.get(bookId) || null; },
    async saveProgress(bookId, value) { progress.set(bookId, value); },
    async listBookmarks(bookId) { return [...(bookmarks.get(bookId) || [])].sort((a,b) => a.createdAt - b.createdAt); },
    async addBookmark(bookId, value) { const item = { ...value, id: `${bookId}-bookmark-${++sequence}`, bookId }; const rows = bookmarks.get(bookId) || []; rows.push(item); bookmarks.set(bookId, rows); return item; }
  };
}
