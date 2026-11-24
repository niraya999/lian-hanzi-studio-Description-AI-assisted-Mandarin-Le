import { createDriveAuthorization } from './drive-auth.mjs';
import { createDriveAssetCache, createDriveAssetLoader } from './drive-assets.mjs';
import { createIndexedDBStorage } from './storage.mjs';

const $ = s => document.querySelector(s);
const state = { manifest: null, stage: 0, urls: {}, bookmarks: [], layout: matchMedia('(orientation: landscape) and (min-width: 760px)').matches ? 'spread' : 'portrait', busy: false, prologue: null, showPinyin: false, showTranslation: false };
const auth = createDriveAuthorization();
const storage = createIndexedDBStorage();
const loader = createDriveAssetLoader({ getAccessToken: () => auth.getAccessToken(), cache: createDriveAssetCache() });
const card = $('#voicesCard'), status = $('#voicesStatus'), library = $('#library');
const view = document.createElement('main'); view.className = 'voices-reader'; view.hidden = true; view.id = 'voicesReader';
view.innerHTML = `<div class="voices-toolbar"><button type="button" data-act="library">← Library</button><strong>破曉之聲 <small>Voices of Dawn</small></strong><div><button type="button" data-act="bookmark">＋ Bookmark</button><button type="button" data-act="bookmarks">Bookmarks <span data-bookmark-count>0</span></button></div></div><p class="voices-message" role="status" aria-live="polite"></p><div class="voices-book-stage"><div class="voices-book" tabindex="0" aria-label="Voices of Dawn book"></div></div><nav class="voices-controls" aria-label="Book navigation"><button type="button" data-act="previous">← Previous</button><span data-page-label></span><button type="button" data-act="next">Next →</button></nav><div class="voices-bookmarks" hidden><strong>Saved bookmarks</strong><div data-bookmark-list></div></div>`;
$('#reader').after(view);
const book = view.querySelector('.voices-book'), msg = view.querySelector('.voices-message'), list = view.querySelector('[data-bookmark-list]'), bookmarkPanel = view.querySelector('.voices-bookmarks');
let touch = null;
const readingTools = document.createElement('div');
readingTools.className = 'voices-reading-tools';
readingTools.innerHTML = '<label><input type="checkbox" data-toggle="pinyin"> Pinyin</label> <label><input type="checkbox" data-toggle="translation"> Translation</label><p class="voices-gloss" role="status" aria-live="polite"></p>';
view.querySelector('.voices-book-stage').before(readingTools);
readingTools.addEventListener('change', e => {
  if (e.target.matches('[data-toggle="pinyin"]')) state.showPinyin = e.target.checked;
  if (e.target.matches('[data-toggle="translation"]')) state.showTranslation = e.target.checked;
  render();
});
function lastStage() { return (state.prologue?.pages?.length || 0) + 4; }
function pageAtStage() { return state.prologue?.pages?.[state.stage - 3]; }
function createProloguePage(page) {
  const panel = document.createElement('article'); panel.className = 'voices-prologue-page';
  panel.style.backgroundImage = 'url("' + state.urls.paperTexture + '")';
  const heading = document.createElement('h2'); heading.textContent = state.prologue.title?.['zh-Hant'] || '黎明之前'; panel.append(heading);
  const marker = document.createElement('p'); marker.className='voices-page-number'; marker.textContent = 'PROLOGUE · ' + String(state.stage - 2).padStart(2,'0'); panel.append(marker);
  if (page.illustration?.drive_file_id && state.urls[page.id]) panel.append(image(state.urls[page.id], 'voices-page-illustration', 'Prologue illustration'));
  else { const missing = document.createElement('p'); missing.className='voices-art-pending'; missing.textContent='Illustration pending · ' + page.id; panel.append(missing); }
  const locale = $('#languageSelect').value;
  for (const block of page.blocks || []) {
    const section = document.createElement('section'); section.className = 'voices-content-block'; section.dataset.type = block.type;
    for (const sentence of block.sentences || []) {
      const p = document.createElement('p'); p.className='voices-sentence'; p.dataset.sentenceId=sentence.id;
      const original = sentence.text?.['zh-Hant'] || '';
      const chars = Array.from(original);
      const tokens = [...(sentence.tokens || [])].sort((a,b)=>a.start-b.start);
      let pos=0;
      for (const token of tokens) {
        if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start < pos || token.end > chars.length || token.end <= token.start || chars.slice(token.start,token.end).join('') !== token.text) continue;
        p.append(document.createTextNode(chars.slice(pos,token.start).join('')));
        const button=document.createElement('button');button.type='button';button.className='voices-word';button.textContent=token.text;
        button.addEventListener('click',()=>{readingTools.querySelector('.voices-gloss').textContent=token.text+' · '+(token.pinyin || '')+' · '+(token.meanings?.[locale === 'id' ? 'id-ID' : 'en'] || '');});
        p.append(button);pos=token.end;
      }
      p.append(document.createTextNode(chars.slice(pos).join('')));
      section.append(p);
      if (state.showPinyin) {const pin=document.createElement('p');pin.className='voices-pinyin';pin.textContent=sentence.text?.pinyin || '';section.append(pin);}
      if (state.showTranslation && locale !== 'zh-Hant') {const tr=document.createElement('p');tr.className='voices-translation';tr.textContent=sentence.text?.[locale==='id'?'id-ID':'en'] || '';section.append(tr);}
    }
    panel.append(section);
  }
  return panel;
}
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
  for (const mark of state.bookmarks) { const b = document.createElement('button'); b.type = 'button'; b.textContent = mark.label; b.addEventListener('click', async () => { state.stage = Math.max(1, Math.min(lastStage()-1, mark.pageIndex)); bookmarkPanel.hidden = true; await storage.saveProgress(state.manifest.bookId, {pageIndex: state.stage, updatedAt: Date.now()}); render(); }); list.append(b); }
}
function render() {
  book.replaceChildren(); book.dataset.stage = String(state.stage); book.dataset.layout = state.layout;
  const isSpread = state.layout === 'spread';
  if (state.stage === 0 || state.stage === lastStage()) {
    const which = state.stage === 0 ? 'frontCover' : 'backCover';
    const panel = document.createElement('div'); panel.className = 'voices-hardcover'; panel.append(artwork(which, 'voices-cover-image', t(state.stage === 0 ? 'front' : 'back')), artwork('spine', 'voices-spine', ''));
    book.append(panel);
  } else if (state.stage === 1 || state.stage === lastStage()-1) {
    const inner = artwork('innerCover', 'voices-inner', t('inner')); book.append(inner);
    if (isSpread) { const blank = document.createElement('div'); blank.className = 'voices-blank-paper'; blank.style.backgroundImage = `url("${state.urls.paperTexture}")`; book.append(blank); }
  } else if (state.stage === 2) {
    if (isSpread) book.append(artwork('innerCover', 'voices-inner', t('inner')));
    book.append(createTitle());
  } else if (pageAtStage()) {
    book.append(createProloguePage(pageAtStage()));
  }
  view.querySelector('[data-page-label]').textContent = (pageAtStage() ? 'Prologue ' + (state.stage-2) + ' / ' + state.prologue.pages.length : t(state.stage===0?'front':state.stage===1||state.stage===lastStage()-1?'inner':state.stage===2?'title':'back'));
  view.querySelector('[data-act=previous]').disabled = state.stage === 0;
  view.querySelector('[data-act=previous]').textContent = t('previous');
  view.querySelector('[data-act=next]').textContent = t(state.stage === lastStage() ? 'library' : 'next');
  view.querySelector('[data-act=bookmark]').disabled = state.stage < 2 || state.stage >= lastStage()-1;
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
  if (state.stage >= 1 && state.stage < lastStage()) await storage.saveProgress(state.manifest.bookId,{pageIndex:state.stage,updatedAt:Date.now()});
  view.hidden = true; library.hidden = false; bookmarkPanel.hidden = true; $('#voicesConnect').focus();
}
async function move(delta) {
  if (state.busy) return;
  if (state.stage === lastStage() && delta > 0) return returnLibrary();
  if (state.stage === 0 && delta > 0) {
    const progress = await storage.getProgress(state.manifest.bookId);
    state.stage = Number.isInteger(progress?.pageIndex) ? Math.max(1,Math.min(lastStage()-1,progress.pageIndex)) : 1;
  } else state.stage = Math.max(0,Math.min(lastStage(),state.stage + delta));
  if (state.stage >= 1 && state.stage <= 3) await storage.saveProgress(state.manifest.bookId,{pageIndex:state.stage,updatedAt:Date.now()});
  book.classList.remove('voices-turn'); void book.offsetWidth; book.classList.add('voices-turn'); render();
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
view.addEventListener('click', async e => { const action=e.target.closest('[data-act]')?.dataset.act; if (!action) return; try { if(action==='library') await returnLibrary(); else if(action==='next') await move(1); else if(action==='previous') await move(-1); else if(action==='bookmarks') { bookmarkPanel.hidden=!bookmarkPanel.hidden; refreshBookmarks(); } else if(action==='bookmark' && state.stage>=2 && state.stage<lastStage()-1) { await storage.addBookmark(state.manifest.bookId,{pageId:pageAtStage()?.id || 'title-page',pageIndex:state.stage,chapterId:pageAtStage()?'prologue':'front-matter',label:pageAtStage()?.id || t('bookmark'),createdAt:Date.now()}); state.bookmarks=await storage.listBookmarks(state.manifest.bookId); msg.textContent=t('saved'); refreshBookmarks(); } } catch(error) { msg.textContent=error.message; } });
book.addEventListener('pointerdown', e => {touch={x:e.clientX,y:e.clientY};});
book.addEventListener('pointerup', e => {if(!touch)return; const dx=e.clientX-touch.x,dy=e.clientY-touch.y; touch=null;if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.15) move(dx<0?1:-1).catch(err=>msg.textContent=err.message);});
window.addEventListener('keydown', e => {if(view.hidden || e.altKey || e.ctrlKey || e.metaKey) return;if(e.key==='Escape'){e.preventDefault();returnLibrary();} else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}});
$('#layoutToggle').addEventListener('click', () => {if (!view.hidden) {state.layout=state.layout==='spread'?'portrait':'spread'; render();}});
$('#languageSelect').addEventListener('change', () => { connectButton.textContent=t('connect'); if(!view.hidden) render(); });
window.addEventListener('pagehide', () => loader.dispose());
try {
  const response = await fetch('./voices-of-dawn-manifest.json'); if (!response.ok) throw new Error('Book manifest unavailable.');
  state.manifest = await response.json();
  const pilotResponse = await fetch('./content/voices-of-dawn-prologue-pilot.json');
  if (!pilotResponse.ok) throw new Error('Prologue pilot content unavailable.');
  state.prologue = await pilotResponse.json();
  if (state.prologue.chapter_id !== 'prologue' || state.prologue.pages?.length !== 6) throw new Error('Invalid prologue pilot.');
  if (!state.manifest.bookId || state.manifest.assets?.provider !== 'google-drive') throw new Error('Invalid book manifest.');
  setStatus(t('required'));
  try { await auth.getAccessToken(); state.urls.frontCover=await loadAsset('frontCover'); updateCard(); setStatus(t('ready')); } catch { /* a user gesture is needed to connect */ }
} catch(error) { card.disabled=true; connectButton.disabled=true; setStatus(error.message); }
