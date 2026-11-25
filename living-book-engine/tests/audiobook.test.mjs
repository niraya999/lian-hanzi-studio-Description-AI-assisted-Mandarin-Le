import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioPlaybackController, createDriveAudioLoader } from '../audiobook.mjs';
import { extractChapterParagraphs, paginateChapterParagraphs } from '../chapter-document.mjs';

test('authenticated audio loader validates MIME, caches bytes by account and asset, and releases its URL', async () => {
  let mediaRequests=0; const rows=new Map(),released=[]; const statuses=[];
  const fetchImpl=async url=>url.includes('alt=media')?(mediaRequests++,new Response(new Blob(['mp3'],{type:'audio/mpeg'}))):Response.json({id:'private-audio',mimeType:'audio/mpeg',md5Checksum:'v1'});
  const loader=createDriveAudioLoader({getAccessToken:async()=>({token:'token',accountId:'account'}),cache:{async get(k){return rows.get(k)},async put(v){rows.set(v.key,v)}},fetchImpl,makeURL:()=>`blob:audio-${mediaRequests}`,revokeURL:url=>released.push(url)});
  const opts={bookId:'voices-of-dawn',fileId:'private-audio',onStatus:s=>statuses.push(s)};
  const one=await loader.load(opts); const two=await loader.load(opts);
  assert.equal(one,'blob:audio-1'); assert.equal(two,'blob:audio-1'); assert.equal(mediaRequests,1);
  assert.deepEqual(statuses,['loading','ready','loading','ready']);
  loader.release(one); assert.deepEqual(released,[one]);
});

test('audio loader rejects non-MP3 assets and reports Drive authorization failures', async () => {
  const cache={async get(){return null},async put(){}};
  const wrongType=createDriveAudioLoader({getAccessToken:async()=>({token:'t',accountId:'a'}),cache,fetchImpl:async()=>Response.json({mimeType:'image/png',md5Checksum:'v'})});
  await assert.rejects(wrongType.load({bookId:'b',fileId:'f'}),/Unsupported audiobook type/);
  const denied=createDriveAudioLoader({getAccessToken:async()=>({token:'t',accountId:'a'}),cache,fetchImpl:async()=>new Response('',{status:403})});
  await assert.rejects(denied.load({bookId:'b',fileId:'f'}),error=>error.code==='AUTH_REQUIRED');
});

test('one persistent audio element supports seek, skip, volume, and the approved speed set', async () => {
  const listeners=new Map();
  const audio={currentTime:0,duration:100,volume:1,playbackRate:1,src:'',
    addEventListener(name,fn){listeners.set(name,fn)},load(){},pause(){listeners.get('pause')?.()},
    async play(){listeners.get('play')?.()},removeAttribute(name){if(name==='src')this.src=''}};
  const player=createAudioPlaybackController({audio});
  player.setSource('blob:pilot'); listeners.get('loadedmetadata')?.();
  await player.play(); assert.equal(player.state().playing,true);
  player.seek(50); assert.equal(audio.currentTime,50);
  player.skip(10); assert.equal(audio.currentTime,60);
  player.skip(100); assert.equal(audio.currentTime,100);
  player.setVolume(0.35); assert.equal(audio.volume,0.35);
  for(const rate of [0.75,1,1.25,1.5,2]) player.setRate(rate);
  assert.equal(audio.playbackRate,2);
  player.dispose(); assert.equal(audio.src,'');
});

test('chapter parsing preserves speaker labels as metadata and makes manual-turn pages without timing', () => {
  const document={body:{content:[
    {paragraph:{elements:[{textRun:{content:'Pagi di Qinglin.\n'}}]}},
    {paragraph:{elements:[{textRun:{content:'(Lian Xin)\n'}}]}},
    {paragraph:{elements:[{textRun:{content:'Berat?\n'}}]}},
    {paragraph:{elements:[{inlineObjectElement:{inlineObjectId:'image-1'}}]}}
  ]},inlineObjects:{'image-1':{inlineObjectProperties:{embeddedObject:{title:'Dawn',imageProperties:{contentUri:'https://docs.google.com/image'}}}}}};
  const blocks=extractChapterParagraphs(document);
  assert.equal(blocks[1].speaker,'Lian Xin');
  assert.equal(blocks[3].images[0].alt,'Dawn');
  const pages=paginateChapterParagraphs(blocks,10);
  assert.equal(pages[0].id,'chapter-01-page-01');
  assert.ok(pages.length>1);
  assert.equal('timestamp' in pages[0],false);
});
