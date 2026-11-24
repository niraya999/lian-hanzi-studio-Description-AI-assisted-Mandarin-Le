import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookEngine, createMemoryStorage, BOOK_STATES } from '../engine.mjs';
import manifest from '../book-manifest.json' with { type: 'json' };

function makeEngine(storage = createMemoryStorage(), reducedMotion = true) { return createBookEngine({ manifest, storage, reducedMotion }); }

test('cover opens into the first page and navigation advances one portrait page', async () => {
  const engine = makeEngine(); await engine.initialize(); await engine.openBook();
  assert.equal(engine.getState().screen, BOOK_STATES.COVER);
  await engine.openCover(); assert.equal(engine.getState().screen, BOOK_STATES.CONTENT); assert.equal(engine.getState().pageIndex, 0);
  await engine.next(); assert.equal(engine.getState().pageIndex, 1);
  await engine.previous(); assert.equal(engine.getState().pageIndex, 0);
});

test('end book closes the story and Read Again restarts it', async () => {
  const engine = makeEngine(); await engine.initialize(); await engine.openBook(); await engine.openCover();
  await engine.next(); await engine.next(); await engine.next();
  assert.equal(engine.getState().screen, BOOK_STATES.END);
  await engine.readAgain(); assert.equal(engine.getState().screen, BOOK_STATES.CONTENT); assert.equal(engine.getState().pageIndex, 0);
});

test('manual bookmarks are multiple, book-isolated, and navigate back to their page', async () => {
  const storage = createMemoryStorage(); const engine = makeEngine(storage); await engine.initialize(); await engine.openBook(); await engine.openCover();
  await engine.saveBookmark('Beginning'); await engine.next(); const second = await engine.saveBookmark('River');
  assert.equal(engine.getState().bookmarks.length, 2); await engine.goToBookmark(second.id); assert.equal(engine.getState().pageIndex, 1);
  const other = createBookEngine({ manifest: { ...manifest, bookId:'another-book' }, storage, reducedMotion:true }); await other.initialize();
  assert.equal(other.getState().bookmarks.length, 0);
});

test('auto resume restores the last-read page after closing and reopening the book', async () => {
  const storage = createMemoryStorage(); const first = makeEngine(storage); await first.initialize(); await first.openBook(); await first.openCover(); await first.next(); await first.close();
  assert.equal(first.getState().screen, BOOK_STATES.CLOSED);
  const reopened = makeEngine(storage); await reopened.initialize(); await reopened.openBook(); await reopened.openCover();
  assert.equal(reopened.getState().screen, BOOK_STATES.CONTENT); assert.equal(reopened.getState().pageIndex, 1);
});

test('spread layout presents two independent pages and advances by a spread', async () => {
  const engine = makeEngine(); await engine.initialize(); await engine.setLayout('spread'); await engine.openBook(); await engine.openCover();
  assert.equal(engine.getState().layout, 'spread'); assert.equal(engine.currentPages().length, 2);
  await engine.next(); assert.equal(engine.getState().pageIndex, 2); assert.equal(engine.currentPages().length, 1);
  await assert.rejects(engine.setLayout('square'), /Layout must be/);
});
