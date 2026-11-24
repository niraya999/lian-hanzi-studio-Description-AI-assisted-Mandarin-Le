import { createBookEngine } from './engine.mjs';
import { createIndexedDBStorage } from './storage.mjs';

const STRINGS = {
  en: { backLibrary:'Library', bookmark:'Bookmark', openBook:'Open book', readAgain:'Read again', backToLibrary:'Back to library', theEnd:'THE END', savedBookmarks:'Saved bookmarks', noBookmarks:'No bookmarks yet. Save a place to return to.', saved:'Bookmark saved', resumed:'Your place is saved. Continue reading.', start:'New story', cover:'COVER', page:'PAGE', pages:'PAGES', open:'Open', previous:'Previous', next:'Next', finish:'Finish', language:'Language', audio:'Story audio', narration:'Voice narration', backgroundMusic:'Background music', momentMusic:'Moment music', notConfigured:'Not configured', playlist:'Playlist', noPlaylist:'No playlist assigned', livingIllustrations:'Living illustrations' },
  id: { backLibrary:'Perpustakaan', bookmark:'Penanda', openBook:'Buka buku', readAgain:'Baca lagi', backToLibrary:'Kembali ke perpustakaan', theEnd:'TAMAT', savedBookmarks:'Penanda tersimpan', noBookmarks:'Belum ada penanda. Simpan halaman untuk kembali ke sini.', saved:'Penanda tersimpan', resumed:'Posisi baca tersimpan. Lanjutkan ceritanya.', start:'Cerita baru', cover:'SAMPUL', page:'HALAMAN', pages:'HALAMAN', open:'Buka', previous:'Sebelumnya', next:'Lanjut', finish:'Selesai', language:'Bahasa', audio:'Audio cerita', narration:'Narasi suara', backgroundMusic:'Musik latar', momentMusic:'Musik momen', notConfigured:'Belum dikonfigurasi', playlist:'Daftar putar', noPlaylist:'Belum ada daftar putar', livingIllustrations:'Ilustrasi bergerak' },
  'zh-Hant': { backLibrary:'書架', bookmark:'書籤', openBook:'打開書本', readAgain:'再讀一次', backToLibrary:'返回書架', theEnd:'故事結束', savedBookmarks:'已儲存的書籤', noBookmarks:'還沒有書籤。儲存一頁，方便下次回來。', saved:'書籤已儲存', resumed:'已記住上次閱讀的位置。繼續閱讀。', start:'新的故事', cover:'封面', page:'第', pages:'頁', open:'打開', previous:'上一頁', next:'下一頁', finish:'完成', language:'語言', audio:'故事音訊', narration:'語音旁白', backgroundMusic:'背景音樂', momentMusic:'情境音樂', notConfigured:'尚未設定', playlist:'播放清單', noPlaylist:'尚未指定播放清單', livingIllustrations:'動態插畫' }
};

const $ = selector => document.querySelector(selector);
const libraryView = $('#library');
const readerView = $('#reader');
const book = $('#book');
const openSpread = $('#openSpread');
const coverLeaf = $('#coverLeaf');
const endScreen = $('#endScreen');
const toast = $('#toast');
let manifest;
let engine;
let locale = 'en';
let toastTimer;
let pointerStart = null;
let explicitLayout = false;
let preferredLayout = 'portrait';

function text(key) { return STRINGS[locale]?.[key] || STRINGS.en[key] || key; }
function localized(value) { return value?.[locale] || value?.en || ''; }
function showToast(message) { toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400); }

function buildPage(page, pageNumber, total, side = '') {
  const card = document.createElement('article');
  card.className = `paper-page ${side ? `page-${side}` : ''}`;
  card.setAttribute('aria-label', `${text('page')} ${pageNumber} ${localized(page.chapterTitle)}`);
  const head = document.createElement('div'); head.className = 'page-running-head';
  const chapter = document.createElement('span'); chapter.textContent = localized(page.chapterTitle);
  const number = document.createElement('span'); number.textContent = `${String(pageNumber).padStart(2,'0')} · ${String(total).padStart(2,'0')}`;
  head.append(chapter, number);
  const illustration = document.createElement('img');
  const safeScene = ['dusk-path','river-bridge','window-home'].includes(page.illustration) ? page.illustration : 'dusk-path';
  illustration.src = `./assets/${safeScene}.svg`; illustration.alt = localized(page.illustrationAlt) || ''; illustration.className = 'page-illustration'; illustration.draggable = false;
  const caption = document.createElement('p'); caption.className = 'page-story'; caption.lang = locale; caption.textContent = localized(page.text);
  const folio = document.createElement('div'); folio.className = 'page-folio'; folio.textContent = String(pageNumber).padStart(2,'0');
  card.append(head, illustration, caption, folio);
  return card;
}

function updateLibrary(state) {
  const progress = state.hasProgress ? `${Math.min(state.pageIndex + 1, state.pageCount)} / ${state.pageCount}` : '';
  $('#resumeLine').innerHTML = state.hasProgress ? `${text('resumed')} <span>${progress} ↗</span>` : `${text('start')} <span aria-hidden="true">↗</span>`;
}

function render(state) {
  if (document.querySelector('#voicesReader')?.hidden === false) return;
  const onReader = state.screen !== 'library' && state.screen !== 'closed';
  libraryView.hidden = onReader;
  readerView.hidden = !onReader;
  $('#readerBookTitle').textContent = localized(manifest.title);
  $('#libraryTitle').textContent = localized(manifest.title);
  $('#libraryDescription').textContent = localized(manifest.description);
  $('#coverTitle').innerHTML = (localized(manifest.title) || 'A Small Light').replace(/\s+/, '<br>');
  $('#coverSubtitle').textContent = locale === 'id' ? 'Cerita contoh orisinal\nuntuk pratinjau ini.' : locale === 'zh-Hant' ? '為此預覽創作的\n原創示例故事。' : 'An original sample story\nmade for this preview.';
  $('#bookmarkCount').textContent = String(state.bookmarks.length);
  book.dataset.state = state.screen;
  book.dataset.layout = state.layout;
  book.classList.toggle('is-animating', Boolean(state.animating));
  coverLeaf.setAttribute('aria-hidden', String(state.screen !== 'cover'));
  coverLeaf.querySelector('#openCover').disabled = state.screen !== 'cover';
  endScreen.hidden = state.screen !== 'end';
  openSpread.replaceChildren();
  if (state.screen === 'content') {
    const pages = engine.currentPages();
    const count = state.layout === 'spread' ? 2 : 1;
    openSpread.dataset.pages = String(pages.length);
    pages.forEach((page, index) => openSpread.append(buildPage(page, state.pageIndex + index + 1, state.pageCount, state.layout === 'spread' ? (index === 0 ? 'left' : 'right') : 'single')));
    $('#chapterKicker').textContent = localized(pages[0]?.chapterTitle).toLocaleUpperCase(locale);
    $('#pageLabel').textContent = `${text('page').toLocaleUpperCase(locale)} ${state.pageIndex + 1}${pages.length > 1 ? `–${Math.min(state.pageIndex + pages.length, state.pageCount)}` : ''}`;
    $('#pageCount').textContent = `${Math.min(state.pageIndex + pages.length, state.pageCount)} / ${state.pageCount}`;
  } else if (state.screen === 'cover') {
    $('#chapterKicker').textContent = text('cover'); $('#pageLabel').textContent = text('cover').toLocaleUpperCase(locale); $('#pageCount').textContent = `0 / ${state.pageCount}`;
  } else {
    $('#chapterKicker').textContent = text('theEnd'); $('#pageLabel').textContent = text('theEnd').toLocaleUpperCase(locale); $('#pageCount').textContent = `${state.pageCount} / ${state.pageCount}`;
  }
  const progress = state.screen === 'cover' ? 0 : state.screen === 'end' ? 100 : ((state.pageIndex + (state.layout === 'spread' ? 2 : 1)) / state.pageCount) * 100;
  $('#progressBar').style.width = `${Math.max(0, Math.min(100, progress))}%`;
  $('#previousPage').disabled = ['cover'].includes(state.screen);
  const nextLabel = state.screen === 'cover' ? text('open') : state.screen === 'end' ? text('readAgain') : (state.pageIndex + (state.layout === 'spread' ? 2 : 1) >= state.pageCount ? text('finish') : text('next'));
  $('#nextLabel').textContent = nextLabel;
  $('#nextPage').setAttribute('aria-label', state.screen === 'cover' ? text('open') : nextLabel);
  $('#layoutLabel').textContent = state.layout === 'spread' ? 'Spread' : 'Portrait';
  $('#layoutToggle').setAttribute('aria-pressed', String(state.layout === 'spread'));
  $('#readerHint').textContent = state.screen === 'cover' ? text(state.hasProgress ? 'resumed' : 'start') : 'Use ← → keys or swipe the page to turn.';
  updateLibrary(state);
  updateBookmarks(state.bookmarks);
  if (state.screen === 'end') { coverLeaf.setAttribute('aria-hidden', 'true'); }
}

function updateBookmarks(bookmarks) {
  const list = $('#bookmarkList'); list.replaceChildren();
  if (!bookmarks.length) { const empty = document.createElement('p'); empty.className = 'empty-bookmarks'; empty.textContent = text('noBookmarks'); list.append(empty); return; }
  for (const item of bookmarks) {
    const button = document.createElement('button'); button.className = 'bookmark-item'; button.type = 'button';
    const label = document.createElement('span'); label.textContent = item.label;
    const page = document.createElement('small'); page.textContent = `${text('page')} ${item.pageIndex + 1}`;
    button.append(label,page); button.addEventListener('click', async () => { await engine.goToBookmark(item.id); $('#bookmarkPopover').hidden = true; }); list.append(button);
  }
}

function setLocale(next) { locale = STRINGS[next] ? next : 'en'; document.documentElement.lang = locale; document.querySelectorAll('[data-ui]').forEach(node => { node.textContent = text(node.dataset.ui); }); if (engine && (document.querySelector('#voicesReader')?.hidden !== false)) render(engine.getState()); }

async function toggleLayout() { if (!document.querySelector('#voicesReader')?.hidden) return; explicitLayout = true; preferredLayout = engine.getState().layout === 'portrait' ? 'spread' : 'portrait'; await engine.setLayout(preferredLayout); }

async function closeReader() { await engine.returnToLibrary(); $('#bookmarkPopover').hidden = true; }

$('#bookCard').addEventListener('click', async () => { const state = engine.getState(); await engine.openBook(); if (state.hasProgress) showToast(text('resumed')); });
$('#openCover').addEventListener('click', async () => { await engine.openCover(); });
$('#nextPage').addEventListener('click', async () => { const state = engine.getState(); if (state.screen === 'end') return engine.readAgain(); await engine.next(); });
$('#previousPage').addEventListener('click', () => engine.previous());
$('#backLibrary').addEventListener('click', closeReader);
$('#endLibrary').addEventListener('click', closeReader);
$('#readAgain').addEventListener('click', () => engine.readAgain());
$('#layoutToggle').addEventListener('click', toggleLayout);
$('#languageSelect').addEventListener('change', event => setLocale(event.target.value));
$('#bookmarkButton').addEventListener('click', async () => { const result = await engine.saveBookmark(localized(engine.pages[engine.getState().pageIndex]?.chapterTitle) + ` · ${text('page')} ${engine.getState().pageIndex + 1}`); if (result) showToast(text('saved')); });
$('#showBookmarks').addEventListener('click', () => { $('#bookmarkPopover').hidden = !$('#bookmarkPopover').hidden; });
$('#closeBookmarks').addEventListener('click', () => { $('#bookmarkPopover').hidden = true; });
$('#helpButton').addEventListener('click', () => $('#helpDialog').showModal());
$('#motionToggle').addEventListener('change', event => document.querySelector('.app-shell').classList.toggle('motion-disabled', !event.target.checked));
$('#helpDialog').addEventListener('click', event => { if (event.target === $('#helpDialog')) $('#helpDialog').close(); });

book.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; });
book.addEventListener('pointerup', async event => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x; const dy = event.clientY - pointerStart.y; pointerStart = null;
  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.15 || event.target.closest('button')) return;
  if (dx < 0) await engine.next(); else await engine.previous();
});
window.addEventListener('keydown', async event => {
  if ($('#helpDialog').open || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape') { if (!readerView.hidden) { event.preventDefault(); await closeReader(); } return; }
  if (readerView.hidden || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault(); if (event.key === 'ArrowRight') await engine.next(); else await engine.previous();
});

const media = window.matchMedia('(orientation: landscape) and (min-width: 760px)');
media.addEventListener?.('change', async event => { if (!explicitLayout && engine) await engine.setLayout(event.matches ? 'spread' : 'portrait'); });

try {
  manifest = await fetch('./book-manifest.json').then(response => { if (!response.ok) throw new Error('Could not load the sample book manifest.'); return response.json(); });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#motionToggle').checked = Boolean(manifest.illustrationMotion?.enabled) && !reducedMotion;
  document.querySelector('.app-shell').classList.toggle('motion-disabled', !$('#motionToggle').checked);
  engine = createBookEngine({ manifest, storage: createIndexedDBStorage(), reducedMotion, onChange: render });
  preferredLayout = media.matches ? 'spread' : 'portrait';
  await engine.setLayout(preferredLayout);
  await engine.initialize();
  setLocale($('#languageSelect').value);
} catch (error) {
  console.error(error);
  $('#library').innerHTML = `<section class="library-intro"><p class="eyebrow">READER UNAVAILABLE</p><h1>We couldn’t open<br><em>this book.</em></h1><p class="intro-copy">${String(error.message || error).replace(/[<>]/g, '')}</p></section>`;
}
