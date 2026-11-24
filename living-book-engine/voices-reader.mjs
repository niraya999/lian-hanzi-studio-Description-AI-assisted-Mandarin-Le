import { createDriveAuthorization } from './drive-auth.mjs';
import { createDriveAssetCache, createDriveAssetLoader } from './drive-assets.mjs';
import { createIndexedDBStorage } from './storage.mjs';

const $ = s => document.querySelector(s);
const state = { manifest: null, stage: 0, urls: {}, bookmarks: [], layout: matchMedia('(orientation: landscape) and (min-width: 760px)').matches ? 'spread' : 'portrait', busy: false };
const auth = createDriveAuthorization();
const storage = createIndexedDBStorage();
const loader = createDriveAssetLoader({ getAccessToken: () => auth.getAccessToken(), cache: createDriveAssetCache() });
const card = $('#voicesCard'), status = $('#voicesStatus'), library = $('#library');
const view = document.createElement('main'); view.className = 'voices-reader'; view.hidden = true; view.id = 'voicesReader';
view.innerHTML = `<div class="voices-toolbar"><button type="button" data-act="library">← Library</button><strong>破曉之聲 <small>Voices of Dawn</small></strong><div><button type="button" data-act="bookmark">＋ Bookmark</button><button type="button" data-act="bookmarks">Bookmarks <span data-bookmark-count>0</span></button></div></div><p class="voices-message" role="status" aria-live="polite"></p><div class="voices-book-stage"><div class="voices-book" tabindex="0" aria-label="Voices of Dawn book"></div></div><nav class="voices-controls" aria-label="Book navigation"><button type="button" data-act="previous">← Previous</button><span data-page-label></span><button type="button" data-act="next">Next →</button></nav><div class="voices-bookmarks" hidden><strong>Saved bookmarks</strong><div data-bookmark-list></div></div>`;
$('#reader').after(view);
const book = view.querySelector('.voices-book'), msg = view.querySelector('.voices-message'), list = view.querySelector('[data-bookmark-list]'), bookmarkPanel = view.querySelector('.voices-bookmarks');
let touch = null;
const words = {
  en: { connect:'Connect Google Drive', ready:'Open book', required:'Connect Google Drive to view the original artwork.', title:'Title page', inner:'Inner cover', front:'Front cover', back:'Back cover', previous:'← Previous', next:'Next →', library:'Back to library', reconnect:'Drive access expired or was denied. Connect again.', pending:'Loading original artwork…', bookmark:'Title page', saved:'Bookmark saved', empty:'No bookmarks saved.' },
  id: { connect:'Hubungkan Google Drive', ready:'Buka buku', required:'Hubungkan Google Drive untuk melihat gambar asli.', title:'Halaman judul', inner:'Sampul dalam', front:'Sampul depan', back:'Sampul belakang', previous:'← Sebelumnya', next:'Lanjut →', library:'Kembali ke perpustakaan', reconnect:'Akses Drive berakhir atau ditolak. Hubungkan kembali.', pending:'Memuat gambar asli…', bookmark:'Halaman judul', saved:'Penanda tersimpan', empty:'Belum ada penanda.' },
  'zh-Hant': { connect:'連接 Google 雲端硬碟', ready:'打開書本', required:'連接 Google 雲端硬碟以查看原始圖片。', title:'書名頁', inner:'內封', front:'封面', back:'封底', previous:'← 上一頁', next:'下一頁 →', library:'返回書架', reconnect:'雲端硬碟授權已過期或被拒絕，請重新連接。', pending:'正在載入原始圖片…', bookmark:'書名頁', saved:'書籤已儲存', empty:'尚未儲存書籤。' }
};
function t(key) { return (words[$('#languageSelect').value] || words.en)[key]; }
function safeAsset(id) { return state.manifest?.assets?.[id]; }
function image(src, cls, alt) { const img = document.createElement('img'); img.className = cls; img.alt = alt; img.src = src; return img; }
function setStatus(message) { status.textContent = message; }
function artwork(key, cls, label) { const img = image(state.urls[key], cls, label); return img; }
function createTitle() {
  const page = document.createElement('div'); page.className = 'voices-title-page'; page.setAttribute('aria-label', t('title')); page.style.backgroundImage = `url("${state.urls.paperTexture}")`;
  page.innerHTML = `<span class="lotus" aria-hidden="true">❀</span><h1 lang="zh-Hant">破曉之聲</h1><p class="voices-title-en">Voices of Dawn</p><div class="voices-divider"></div><p lang="zh-Hant">黑暗之後，仍有黎明。</p><p lang="en">Beyond the darkness, dawn awaits.</p><p lang="id">Setelah kegelapan, fajar tetap menanti.</p><footer>LIAN UNIVERSE<br><small>THE LIVING BOOK</small></footer>`;
  return page;
}
function refreshBookmarks() {
  view.querySelector('[data-bookmark-count]').textContent = String(state.bookmarks.length); list.replaceChildren();
  if (!state.bookmarks.length) { const p = document.createElement('p'); p.textContent = t('empty'); list.append(p); }
  for (const mark of state.bookmarks) { const b = document.createElement('button'); b.type = 'button'; b.textContent = mark.label; b.addEventListener('click', async () => { state.stage = Math.max(1, Math.min(3, mark.pageIndex)); bookmarkPanel.hidden = true; await storage.saveProgress(state.manifest.bookId, {pageIndex: state.stage, updatedAt: Date.now()}); render(); }); list.append(b); }
}
function render() {
  book.replaceChildren(); book.dataset.stage = String(state.stage); book.dataset.layout = state.layout;
  const isSpread = state.layout === 'spread';
  if (state.stage === 0 || state.stage === 4) {
    const which = state.stage === 0 ? 'frontCover' : 'backCover';
    const panel = document.createElement('div'); panel.className = 'voices-hardcover'; panel.append(artwork(which, 'voices-cover-image', t(state.stage === 0 ? 'front' : 'back')), artwork('spine', 'voices-spine', ''));
    book.append(panel);
  } else if (state.stage === 1 || state.stage === 3) {
    const inner = artwork('innerCover', 'voices-inner', t('inner')); book.append(inner);
    if (isSpread) { const blank = document.createElement('div'); blank.className = 'voices-blank-paper'; blank.style.backgroundImage = `url("${state.urls.paperTexture}")`; book.append(blank); }
  } else {
    if (isSpread) book.append(artwork('innerCover', 'voices-inner', t('inner')));
    book.append(createTitle());
  }
  view.querySelector('[data-page-label]').textContent = t(['front','inner','title','inner','back'][state.stage]);
  view.querySelector('[data-act=previous]').disabled = state.stage === 0;
  view.querySelector('[data-act=previous]').textContent = t('previous');
  view.querySelector('[data-act=next]').textContent = t(state.stage === 4 ? 'library' : 'next');
  view.querySelector('[data-act=bookmark]').disabled = state.stage !== 2;
  view.querySelector('[data-act=library]').textContent = '← ' + t('library');
  refreshBookmarks();
}
async function loadAsset(name) { return loader.load({bookId:state.manifest.bookId,fileId:safeAsset(name)}); }
async function loadAll() {
  state.busy = true; msg.textContent = t('pending');
  try {
    for (const key of ['frontCover','backCover','spine','innerCover','paperTexture']) if (!state.urls[key]) state.urls[key] = await loadAsset(key);
    msg.textContent = ''; setStatus(t('ready')); render();
  } catch (error) { msg.textContent = error.code === 'AUTH_REQUIRED' ? t('reconnect') : `${error.message} — ${t('connect')}`; setStatus(t('required')); throw error; }
  finally { state.busy = false; }
}
async function returnLibrary() {
  if (state.stage >= 1 && state.stage <= 3) await storage.saveProgress(state.manifest.bookId,{pageIndex:state.stage,updatedAt:Date.now()});
  view.hidden = true; library.hidden = false; bookmarkPanel.hidden = true; $('#voicesConnect').focus();
}
async function move(delta) {
  if (state.busy) return;
  if (state.stage === 4 && delta > 0) return returnLibrary();
  state.busy = true;
  let leaf;
  try {
    const previousStage = state.stage;
    let nextStage;
    if (previousStage === 0 && delta > 0) {
      const progress = await storage.getProgress(state.manifest.bookId);
      nextStage = Number.isInteger(progress?.pageIndex) ? Math.max(1, Math.min(3, progress.pageIndex)) : 1;
    } else nextStage = Math.max(0, Math.min(4, previousStage + delta));
    if (nextStage === previousStage) return;
    if (nextStage >= 1 && nextStage <= 3) await storage.saveProgress(state.manifest.bookId, {pageIndex:nextStage,updatedAt:Date.now()});

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stage = book.parentElement;
    const oldRect = book.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const isSpread = state.layout === 'spread' && previousStage > 0 && previousStage < 4;
    const width = isSpread ? oldRect.width / 2 : oldRect.width;
    if (!reduced) {
      leaf = document.createElement('div');
      leaf.className = 'voices-page-leaf';
      leaf.setAttribute('aria-hidden','true');
      const content = book.cloneNode(true);
      content.removeAttribute('tabindex');
      content.className = 'voices-page-snapshot';
      Object.assign(content.style, { width: oldRect.width + 'px', height: oldRect.height + 'px', left: (isSpread && delta > 0 ? -width : 0) + 'px' });
      leaf.append(content);
      const x = oldRect.left - stageRect.left + (isSpread && delta > 0 ? width : 0);
      Object.assign(leaf.style, {left:x + 'px',top:(oldRect.top-stageRect.top) + 'px',width:width + 'px',height:oldRect.height + 'px',transformOrigin:delta > 0 ? 'left center' : 'right center'});
      stage.append(leaf);
    }
    state.stage = nextStage;
    render();
    if (leaf) {
      const direction = delta > 0 ? -1 : 1;
      const animation = leaf.animate([
        {transform:'rotateY(0deg)',filter:'brightness(1)',opacity:1},
        {transform:'rotateY('+ (direction * 85) +'deg)',filter:'brightness(.76)',opacity:1,offset:.52},
        {transform:'rotateY('+ (direction * 165) +'deg)',filter:'brightness(.9)',opacity:0}
      ], {duration:800,easing:'cubic-bezier(.32,.05,.24,1)',fill:'forwards'});
      try { await animation.finished; } catch {}
    }
  } finally {
    leaf?.remove();
    state.busy = false;
  }
}

async function connect() {
  try { setStatus('Connecting Google Drive…'); await auth.connect(); await loadAll(); updateCard(); }
  catch(error) { auth.clear(); setStatus(error.message); msg.textContent = error.message; }
}
function updateCard() { if (!state.urls.frontCover) return; const old=card.querySelector('.card-cover'); const img=image(state.urls.frontCover,'voices-card-cover','Voices of Dawn front cover'); if(old) old.replaceWith(img); }
const connectButton = document.createElement('button'); connectButton.type='button'; connectButton.id='voicesConnect'; connectButton.className='secondary-button voices-connect'; connectButton.textContent='Connect Google Drive'; card.after(connectButton);
connectButton.addEventListener('click', connect);
card.addEventListener('click', async () => {
  try { await auth.getAccessToken(); } catch { setStatus(t('required')); connectButton.focus(); return; }
  try { state.stage=0; state.bookmarks=await storage.listBookmarks(state.manifest.bookId); library.hidden=true; view.hidden=false; await loadAll(); render(); }
  catch(error) { view.hidden=true; library.hidden=false; connectButton.focus(); }
});
view.addEventListener('click', async e => { const action=e.target.closest('[data-act]')?.dataset.act; if (!action) return; try { if(action==='library') await returnLibrary(); else if(action==='next') await move(1); else if(action==='previous') await move(-1); else if(action==='bookmarks') { bookmarkPanel.hidden=!bookmarkPanel.hidden; refreshBookmarks(); } else if(action==='bookmark' && state.stage===2) { await storage.addBookmark(state.manifest.bookId,{pageId:'title-page',pageIndex:2,chapterId:'front-matter',label:t('bookmark'),createdAt:Date.now()}); state.bookmarks=await storage.listBookmarks(state.manifest.bookId); msg.textContent=t('saved'); refreshBookmarks(); } } catch(error) { msg.textContent=error.message; } });
book.addEventListener('pointerdown', e => {touch={x:e.clientX,y:e.clientY};});
book.addEventListener('pointerup', e => {if(!touch)return; const dx=e.clientX-touch.x,dy=e.clientY-touch.y; touch=null;if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.15) move(dx<0?1:-1).catch(err=>msg.textContent=err.message);});
window.addEventListener('keydown', e => {if(view.hidden || e.altKey || e.ctrlKey || e.metaKey) return;if(e.key==='Escape'){e.preventDefault();returnLibrary();} else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}});
$('#layoutToggle').addEventListener('click', () => {if (!view.hidden) {state.layout=state.layout==='spread'?'portrait':'spread'; render();}});
$('#languageSelect').addEventListener('change', () => { connectButton.textContent=t('connect'); if(!view.hidden) render(); });
window.addEventListener('pagehide', () => loader.dispose());
try {
  const response = await fetch('./voices-of-dawn-manifest.json'); if (!response.ok) throw new Error('Book manifest unavailable.');
  state.manifest = await response.json();
  if (!state.manifest.bookId || state.manifest.assets?.provider !== 'google-drive') throw new Error('Invalid book manifest.');
  setStatus(t('required'));
  try { await auth.getAccessToken(); state.urls.frontCover=await loadAsset('frontCover'); updateCard(); setStatus(t('ready')); } catch { /* a user gesture is needed to connect */ }
} catch(error) { card.disabled=true; connectButton.disabled=true; setStatus(error.message); }
