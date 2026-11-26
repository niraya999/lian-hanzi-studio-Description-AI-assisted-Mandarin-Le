import { createDriveAuthorization } from './drive-auth.mjs';
import { createDriveAssetCache, createDriveAssetLoader } from './drive-assets.mjs';
import { createIndexedDBStorage } from './storage.mjs';
import { createDriveAudioLoader, createAudioPlaybackController } from './audiobook.mjs';
import { extractChapterParagraphs, loadGoogleDocument, paginateChapterParagraphs } from './chapter-document.mjs';
import { buildProloguePages } from './prologue-document.mjs';

const $ = s => document.querySelector(s);
const state = { manifest: null, stage: 0, urls: {}, bookmarks: [], layout: matchMedia('(orientation: landscape) and (min-width: 760px)').matches ? 'spread' : 'portrait', busy: false, prologue: null, showPinyin: false, showTranslation: false, section: 'prologue', chapterPage: 0, chapterPages: [], chapterDocument: null, readerMode: 'reading', audioUrl: '', audioLoading: false, audioError: '' };
const auth = createDriveAuthorization();
const storage = createIndexedDBStorage();
const loader = createDriveAssetLoader({ getAccessToken: () => auth.getAccessToken(), cache: createDriveAssetCache() });
const audioLoader = createDriveAudioLoader({ getAccessToken: () => auth.getAccessToken(), cache: createDriveAssetCache() });
const card = $('#voicesCard'), status = $('#voicesStatus'), library = $('#library');
const view = document.createElement('main'); view.className = 'voices-reader'; view.hidden = true; view.id = 'voicesReader';
view.innerHTML = `<div class="voices-toolbar"><button type="button" data-act="library">← Library</button><strong>破曉之聲 <small>Voices of Dawn</small></strong><label class="voices-section-label"><span>Section</span><select data-section aria-label="Story section"><option value="prologue">Prologue</option><option value="chapter-01">Chapter 01 · 青林村的晨光</option></select></label><div><button type="button" data-act="bookmark">＋ Bookmark</button><button type="button" data-act="bookmarks">Bookmarks <span data-bookmark-count>0</span></button></div></div><p class="voices-message" role="status" aria-live="polite"></p><div class="voices-reader-modes" role="group" aria-label="Reader mode" hidden><button type="button" data-mode="reading" aria-pressed="true">Reading</button><button type="button" data-mode="audiobook" aria-pressed="false">Audiobook</button><button type="button" data-mode="read-listen" aria-pressed="false">Read &amp; Listen</button></div><section class="voices-audiobook-scene" hidden><img data-scene-image alt="Chapter illustration"><div><p class="eyebrow">AUDIOBOOK · DRAFT / PILOT</p><h2 data-scene-title></h2><p data-scene-narrator></p><span data-scene-language></span></div></section><div class="voices-book-stage"><div class="voices-book" tabindex="0" aria-label="Voices of Dawn book"></div></div><section class="voices-audio-player" aria-label="Audiobook player" hidden><div class="voices-audio-heading"><div><span class="eyebrow" data-audio-chapter></span><strong data-audio-narrator></strong><small data-audio-language></small></div><span class="voices-audio-status" role="status" aria-live="polite"></span></div><audio data-audio-element preload="metadata" aria-hidden="true"></audio><div class="voices-audio-timeline"><span data-audio-current>0:00</span><input data-audio-seek type="range" min="0" max="1000" value="0" aria-label="Audio position"><span data-audio-duration>0:00</span></div><div class="voices-audio-controls"><button type="button" data-audio-action="rewind" aria-label="Rewind 10 seconds">↶ 10</button><button type="button" class="voices-audio-play" data-audio-action="play">Play</button><button type="button" data-audio-action="forward" aria-label="Forward 10 seconds">10 ↷</button><label>Speed<select data-audio-rate aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label>Volume<input data-audio-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></label><button type="button" data-audio-action="retry" hidden>Retry</button></div></section><nav class="voices-controls" aria-label="Book navigation"><button type="button" data-act="previous">← Previous</button><span data-page-label></span><button type="button" data-act="next">Next →</button></nav><div class="voices-bookmarks" hidden><strong>Saved bookmarks</strong><div data-bookmark-list></div></div>`;
$('#reader').after(view);
const book = view.querySelector('.voices-book'), msg = view.querySelector('.voices-message'), list = view.querySelector('[data-bookmark-list]'), bookmarkPanel = view.querySelector('.voices-bookmarks');
const bookStage = view.querySelector('.voices-book-stage'), modeBar = view.querySelector('.voices-reader-modes'), audioRoot = view.querySelector('.voices-audio-player');
const audioElement = view.querySelector('[data-audio-element]');
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
function formatAudioTime(seconds) { if (!Number.isFinite(seconds) || seconds < 0) return '0:00'; const value=Math.floor(seconds); return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`; }
function updateAudioUI(current) {
  const s = current || playback?.state?.() || {};
  audioRoot.dataset.loading=String(Boolean(s.loading||state.audioLoading));
  view.querySelector('[data-audio-current]').textContent = formatAudioTime(s.currentTime);
  view.querySelector('[data-audio-duration]').textContent = formatAudioTime(s.duration);
  view.querySelector('[data-audio-seek]').value = String(s.duration ? Math.round(s.currentTime / s.duration * 1000) : 0);
  view.querySelector('[data-audio-seek]').disabled = !s.duration;
  view.querySelector('[data-audio-action="play"]').textContent = s.playing ? 'Pause' : 'Play';
  view.querySelector('[data-audio-action="play"]').setAttribute('aria-label', s.playing ? 'Pause audio' : 'Play audio');
  view.querySelector('.voices-audio-status').textContent = s.error || state.audioError || (state.audioLoading || s.loading ? 'Loading audio…' : s.playing ? 'Playing' : 'Ready');
  view.querySelector('[data-audio-action="retry"]').hidden = !(s.error || state.audioError);
  if (view.querySelector('[data-audio-rate]').value !== String(s.rate || 1)) view.querySelector('[data-audio-rate]').value = String(s.rate || 1);
}
const playback = createAudioPlaybackController({ audio: audioElement, onStateChange: updateAudioUI });
const sectionSelect = view.querySelector('[data-section]');
const chapterRecord = () => state.manifest?.chapters?.find(item => item.id === 'chapter-01');
async function ensureChapterAudio(retry = false) {
  const audioMeta = chapterRecord()?.audio?.find(item => [item.approval_status, item.status].some(status => status === 'DRAFT / PILOT' || status === 'DRAFT/PILOT'));
  if (!audioMeta) throw new Error('No pilot audio is configured for this chapter.');
  if (state.audioUrl && !retry) return state.audioUrl;
  state.audioError = '';
  view.querySelector('[data-audio-chapter]').textContent = 'CHAPTER 01 · DRAFT / PILOT';
  view.querySelector('[data-audio-narrator]').textContent = audioMeta.narrator_name;
  view.querySelector('[data-audio-language]').textContent = audioMeta.language === 'id-ID' ? 'Bahasa Indonesia' : audioMeta.language;
  view.querySelector('[data-scene-narrator]').textContent = `Narator: ${audioMeta.narrator_name}`;
  view.querySelector('[data-scene-language]').textContent = 'Bahasa Indonesia · Draft / Pilot';
  state.audioLoading = true; updateAudioUI(playback.state());
  try {
    const url = await audioLoader.load({bookId:state.manifest.bookId,fileId:audioMeta.drive_file_id});
    if (state.audioUrl) audioLoader.release(state.audioUrl);
    state.audioUrl = url; playback.setSource(url); return url;
  } catch (error) { state.audioError = error.message; msg.textContent = error.message; throw error; }
  finally { state.audioLoading = false; updateAudioUI(playback.state()); }
}
async function setReaderMode(mode) {
  if (!['reading','audiobook','read-listen'].includes(mode)) return;
  state.readerMode = mode;
  if (mode === 'reading') playback.pause();
  render();
  if (mode !== 'reading' && !state.audioUrl) {
    try { await ensureChapterAudio(); } catch { /* visible retry control reports the load failure */ }
  }
}
async function selectSection(section) {
  if (section === 'prologue') { playback.pause(); state.section='prologue'; state.readerMode='reading'; render(); return; }
  if (section !== 'chapter-01' || !chapterRecord()) { sectionSelect.value=state.section; return; }
  state.section='chapter-01'; state.readerMode='reading'; state.chapterPage=0;
  await loadChapterPages();
}
async function loadChapterPages() {
  msg.textContent='Loading Chapter 01…'; render();
  try {
    if (!state.chapterPages.length) {
      const doc=await loadGoogleDocument({documentId:chapterRecord().source.document_id,getAccessToken:()=>auth.getAccessToken()});
      state.chapterDocument=doc;
      state.chapterPages=paginateChapterParagraphs(extractChapterParagraphs(doc));
      if (!state.chapterPages.length) throw new Error('Chapter 01 contains no readable paragraphs.');
    }
    msg.textContent=''; render();
  } catch(error) { msg.textContent=error.message; render(); }
}
view.addEventListener('click', e => {
  const mode=e.target.closest('[data-mode]')?.dataset.mode;
  if (mode) setReaderMode(mode);
  const action=e.target.closest('[data-audio-action]')?.dataset.audioAction;
  if (action==='play') playback.state().playing ? playback.pause() : playback.play();
  else if (action==='rewind') playback.skip(-10);
  else if (action==='forward') playback.skip(10);
  else if (action==='retry') { if (state.audioUrl) playback.retry(); else ensureChapterAudio(true).catch(()=>{}); }
});
view.querySelector('[data-audio-seek]').addEventListener('input', e => { const duration=playback.state().duration; if(duration) playback.seek(Number(e.target.value)/1000*duration); });
view.querySelector('[data-audio-volume]').addEventListener('input', e => playback.setVolume(e.target.value));
view.querySelector('[data-audio-rate]').addEventListener('change', e => playback.setRate(e.target.value));
sectionSelect.addEventListener('change', e => selectSection(e.target.value));
function lastStage() { return (state.prologue?.pages?.length || 0) + 4; }
function pageAtStage() { return state.prologue?.pages?.[state.stage - 3]; }
function createProloguePage(page) {
  const panel = document.createElement('article'); panel.className = 'voices-prologue-page';
  panel.style.backgroundImage = 'url("' + state.urls.paperTexture + '")';
  const heading = document.createElement('h2'); heading.textContent = state.prologue.title?.['zh-Hant'] || '灰燼中的哭聲'; panel.append(heading);
  const marker = document.createElement('p'); marker.className='voices-page-number'; marker.textContent = 'PROLOGUE · ' + String(state.stage - 2).padStart(2,'0'); panel.append(marker);
  if (state.prologue.status) { const status = document.createElement('p'); status.className='voices-page-status'; status.textContent=state.prologue.status; panel.append(status); }
  for (const artwork of page.images || []) {
    const img=image(artwork.src,'voices-page-illustration',artwork.alt || 'Prologue illustration');
    img.addEventListener('error',()=>img.remove(),{once:true}); panel.append(img);
  }
  for (const block of page.blocks || []) {
    const p=document.createElement('p'); p.className=block.speaker?'voices-speaker-line':'voices-prologue-paragraph';
    p.lang='id'; p.textContent=block.speaker?`(${block.speaker})`:block.text; panel.append(p);
  }
  return panel;
}
function createChapterPage(page) {
  const panel=document.createElement('article'); panel.className='voices-chapter-page';
  const chapterTitle=chapterRecord()?.title?.['id-ID'] || '青林村的晨光 — Cahaya Pagi di Desa Qinglin';
  const title=document.createElement('h2'); title.textContent=chapterTitle; panel.append(title);
  const marker=document.createElement('p'); marker.className='voices-page-number'; marker.textContent=`CHAPTER 01 · ${String(state.chapterPage+1).padStart(2,'0')} / ${state.chapterPages.length}`; panel.append(marker);
  for (const block of page.blocks) {
    for (const artwork of block.images || []) {
      const img=image(artwork.src,'voices-page-illustration',artwork.alt || 'Chapter 01 illustration');
      img.addEventListener('error',()=>img.remove(),{once:true}); panel.append(img);
    }
    if (!block.text.trim()) continue;
    const p=document.createElement(block.speaker?'p':'p'); p.className=block.speaker?'voices-speaker-line':'voices-chapter-paragraph';
    p.lang='id'; p.textContent=block.speaker?`(${block.speaker})`:block.text; panel.append(p);
  }
  return panel;
}
const words = {
  en: { connect:'Connect Google Drive through LHS', ready:'Open book', required:'Connect Google Drive through LHS to view the original artwork.', title:'Title page', inner:'Inner cover', front:'Front cover', back:'Back cover', previous:'← Previous', next:'Next →', library:'Back to library', reconnect:'LHS Drive access expired or was denied. Reconnect from LHS.', pending:'Loading original artwork…', bookmark:'Title page', saved:'Bookmark saved', empty:'No bookmarks saved.' },
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
  for (const mark of state.bookmarks) { const b = document.createElement('button'); b.type = 'button'; b.textContent = mark.label; b.addEventListener('click', async () => { if(mark.chapterId==='chapter-01'){await selectSection('chapter-01');state.chapterPage=Math.max(0,Math.min(state.chapterPages.length-1,mark.pageIndex));}else{state.section='prologue';sectionSelect.value='prologue';state.stage=Math.max(1,Math.min(lastStage()-1,mark.pageIndex));} bookmarkPanel.hidden = true; await storage.saveProgress(state.manifest.bookId, {chapterId:state.section,pageIndex:state.section==='chapter-01'?state.chapterPage:state.stage,updatedAt:Date.now()}); render(); }); list.append(b); }
}
function render() {
  const isChapter=state.section==='chapter-01';
  book.replaceChildren(); book.dataset.stage = String(state.stage); book.dataset.layout = state.layout;
  const isSpread = state.layout === 'spread';
  if(isChapter){
    const current=state.chapterPages[state.chapterPage];
    const hasAudio=Boolean(chapterRecord()?.audio?.some(item=>item.audio_asset_id&&item.drive_file_id&&item.approval_status));
    if(!hasAudio&&state.readerMode!=='reading') state.readerMode='reading';
    if(current && state.readerMode!=='audiobook') book.append(createChapterPage(current));
    const sceneImage=state.chapterPages.flatMap(p=>p.blocks).flatMap(b=>b.images||[])[0];
    const scene= view.querySelector('.voices-audiobook-scene');
    const titleData=chapterRecord()?.title||{};
    view.querySelector('[data-scene-title]').textContent=`${titleData['zh-Hant']||'青林村的晨光'} — ${titleData['id-ID']||'Cahaya Pagi di Desa Qinglin'}`;
    const sceneImg=view.querySelector('[data-scene-image]');
    sceneImg.hidden=!sceneImage;
    if(sceneImage && sceneImg.src!==sceneImage.src) sceneImg.src=sceneImage.src;
    scene.hidden=state.readerMode!=='audiobook'||!hasAudio;
    bookStage.hidden=state.readerMode==='audiobook';
    view.querySelector('[data-page-label]').textContent=`Chapter 01 · ${state.chapterPage+1} / ${state.chapterPages.length}`;
    view.querySelector('[data-act=previous]').disabled=state.chapterPage<=0;
    view.querySelector('[data-act=next]').disabled=state.chapterPage>=state.chapterPages.length-1;
    view.querySelector('[data-act=bookmark]').disabled=false;
    modeBar.hidden=!hasAudio;
    for(const button of modeBar.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed',String(button.dataset.mode===state.readerMode));
    audioRoot.hidden=state.readerMode==='reading'||!hasAudio;
  } else {
    const scene=view.querySelector('.voices-audiobook-scene'); scene.hidden=true;
    bookStage.hidden=false; modeBar.hidden=true; audioRoot.hidden=true;
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
    } else if (pageAtStage()) book.append(createProloguePage(pageAtStage()));
    view.querySelector('[data-page-label]').textContent = (pageAtStage() ? 'Prologue · Draft ' + (state.stage-2) + ' / ' + state.prologue.pages.length : t(state.stage===0?'front':state.stage===1||state.stage===lastStage()-1?'inner':state.stage===2?'title':'back'));
    view.querySelector('[data-act=previous]').disabled = state.stage === 0;
    view.querySelector('[data-act=next]').disabled = state.stage === lastStage();
    view.querySelector('[data-act=bookmark]').disabled = state.stage < 2 || state.stage >= lastStage()-1;
  }
  view.querySelector('[data-act=previous]').textContent = t('previous');
  view.querySelector('[data-act=next]').textContent = t('next');
  view.querySelector('[data-act=library]').textContent = '← ' + t('library');
  readingTools.hidden = true;
  view.querySelector('[data-audio-action="retry"]').hidden=!(playback.state().error || state.audioError);
  if(state.audioError) view.querySelector('.voices-audio-status').textContent=state.audioError;
  refreshBookmarks();
}
async function loadAsset(name) { return loader.load({bookId:state.manifest.bookId,fileId:safeAsset(name)}); }
async function loadAll() {
  state.busy = true; msg.textContent = t('pending');
  try {
    for (const key of ['frontCover','backCover','spine','innerCover','paperTexture']) if (!state.urls[key]) state.urls[key] = await loadAsset(key);
    if (!state.prologue.pages?.length) {
      const doc=await loadGoogleDocument({documentId:state.prologue.source.document_id,getAccessToken:()=>auth.getAccessToken()});
      state.prologue.pages=buildProloguePages(extractChapterParagraphs(doc));
      if (state.prologue.pages.length !== 6) throw new Error(`The current Drive prologue has ${state.prologue.pages.length} illustrated scenes; six are required.`);
    }
    msg.textContent = ''; setStatus(t('ready')); render();
  } catch (error) { msg.textContent = error.code === 'AUTH_REQUIRED' ? t('reconnect') : `${error.message} — ${t('connect')}`; setStatus(t('required')); throw error; }
  finally { state.busy = false; }
}
async function returnLibrary() {
  if(state.section==='chapter-01'&&state.chapterPages.length) await storage.saveProgress(state.manifest.bookId,{chapterId:'chapter-01',pageIndex:state.chapterPage,updatedAt:Date.now()});
  else if (state.stage >= 1 && state.stage < lastStage()) await storage.saveProgress(state.manifest.bookId,{chapterId:'prologue',pageIndex:state.stage,updatedAt:Date.now()});
  playback.dispose(); if(state.audioUrl) audioLoader.release(state.audioUrl); state.audioUrl=''; state.audioError='';
  view.hidden = true; library.hidden = false; bookmarkPanel.hidden = true; $('#voicesConnect').focus();
}
async function move(delta) {
  if (state.busy) return;
  if(state.section==='chapter-01'){
    state.chapterPage=Math.max(0,Math.min(state.chapterPages.length-1,state.chapterPage+delta));
    await storage.saveProgress(state.manifest.bookId,{chapterId:'chapter-01',pageIndex:state.chapterPage,updatedAt:Date.now()});
    book.classList.remove('voices-turn'); void book.offsetWidth; book.classList.add('voices-turn'); render(); return;
  }
  if (state.stage === lastStage() && delta > 0) return returnLibrary();
  if (state.stage === 0 && delta > 0) {
    state.stage = 1;
  } else state.stage = Math.max(0,Math.min(lastStage(),state.stage + delta));
  if (state.stage >= 1 && state.stage < lastStage()) await storage.saveProgress(state.manifest.bookId,{chapterId:'prologue',pageIndex:state.stage,updatedAt:Date.now()});
  readingTools.hidden = !pageAtStage();
  book.classList.remove('voices-turn'); void book.offsetWidth; book.classList.add('voices-turn'); render();
}
async function connect() {
  try { setStatus('Connecting through LHS…'); await auth.connect(); connectButton.hidden=true; await loadAll(); updateCard(); }
  catch(error) { auth.clear(); connectButton.hidden=false; setStatus(error.message); msg.textContent = error.message; }
}
function updateCard() { if (!state.urls.frontCover) return; const old=card.querySelector('.card-cover'); const img=image(state.urls.frontCover,'voices-card-cover','Voices of Dawn front cover'); if(old) old.replaceWith(img); }
const connectButton = document.createElement('button'); connectButton.type='button'; connectButton.id='voicesConnect'; connectButton.className='secondary-button voices-connect'; connectButton.textContent='Connect via LHS'; card.after(connectButton);
async function syncConnectButton() { try { await auth.getAccessToken(); connectButton.hidden=true; } catch { connectButton.hidden=false; } }
syncConnectButton();
connectButton.addEventListener('click', connect);
card.addEventListener('click', async () => {
  try { await auth.getAccessToken(); connectButton.hidden=true; } catch { connectButton.hidden=false; setStatus(t('required')); connectButton.focus(); return; }
  try { library.hidden=true; view.hidden=false; await loadAll(); const progress=await storage.getProgress(state.manifest.bookId); state.section=progress?.chapterId==='chapter-01'?'chapter-01':'prologue'; sectionSelect.value=state.section; state.chapterPage=state.section==='chapter-01'&&Number.isInteger(progress?.pageIndex)?progress.pageIndex:0; state.stage=state.section==='prologue'&&Number.isInteger(progress?.pageIndex)?Math.max(0,Math.min(lastStage()-1,progress.pageIndex)):0; state.readerMode='reading'; state.bookmarks=await storage.listBookmarks(state.manifest.bookId); if(state.section==='chapter-01') await loadChapterPages(); render(); }
  catch(error) { view.hidden=true; library.hidden=false; connectButton.focus(); }
});
view.addEventListener('click', async e => { const action=e.target.closest('[data-act]')?.dataset.act; if (!action) return; try { if(action==='library') await returnLibrary(); else if(action==='next') await move(1); else if(action==='previous') await move(-1); else if(action==='bookmarks') { bookmarkPanel.hidden=!bookmarkPanel.hidden; refreshBookmarks(); } else if(action==='bookmark' && (state.section==='chapter-01'||(state.stage>=2&&state.stage<lastStage()-1))) { const chapter=state.section==='chapter-01'; const pageId=chapter?state.chapterPages[state.chapterPage]?.id:(pageAtStage()?.id||'title-page'); await storage.addBookmark(state.manifest.bookId,{pageId,pageIndex:chapter?state.chapterPage:state.stage,chapterId:chapter?'chapter-01':pageAtStage()?'prologue':'front-matter',label:pageId,createdAt:Date.now()}); state.bookmarks=await storage.listBookmarks(state.manifest.bookId); msg.textContent=t('saved'); refreshBookmarks(); } } catch(error) { msg.textContent=error.message; } });
book.addEventListener('pointerdown', e => {touch={x:e.clientX,y:e.clientY};});
book.addEventListener('pointerup', e => {if(!touch)return; const dx=e.clientX-touch.x,dy=e.clientY-touch.y; touch=null;if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.15) move(dx<0?1:-1).catch(err=>msg.textContent=err.message);});
window.addEventListener('keydown', e => {if(view.hidden || e.altKey || e.ctrlKey || e.metaKey) return;if(e.key==='Escape'){e.preventDefault();returnLibrary();} else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}});
$('#layoutToggle').addEventListener('click', () => {if (!view.hidden) {state.layout=state.layout==='spread'?'portrait':'spread'; render();}});
$('#languageSelect').addEventListener('change', () => { connectButton.textContent=t('connect'); if(!view.hidden) render(); });
window.addEventListener('pagehide', () => { loader.dispose(); playback.dispose(); audioLoader.dispose(); });
try {
  const response = await fetch('./voices-of-dawn-manifest.json'); if (!response.ok) throw new Error('Book manifest unavailable.');
  state.manifest = await response.json();
  state.prologue = state.manifest.prologue;
  if (state.prologue?.chapter_id !== 'prologue' || state.prologue.source?.provider !== 'google-docs') throw new Error('Invalid prologue source in the book manifest.');
  if (!state.manifest.bookId || state.manifest.assets?.provider !== 'google-drive') throw new Error('Invalid book manifest.');
  setStatus(t('required'));
  try { await auth.getAccessToken(); state.urls.frontCover=await loadAsset('frontCover'); updateCard(); setStatus(t('ready')); } catch { /* a user gesture is needed to connect */ }
} catch(error) { card.disabled=true; connectButton.disabled=true; setStatus(error.message); }
