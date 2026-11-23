/* LHS Artwork Cache Manager: image-only, origin-local IndexedDB. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),DB='lhs-artwork-cache-v1',STORE='images';
let cancelled=false,busy=false;
const autoKey='lhs.artwork.autocache';
const auto=()=>localStorage.getItem(autoKey)!=='false';
function db(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(Error('IndexedDB unavailable'));const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(STORE))q.result.createObjectStore(STORE,{keyPath:'id'})};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function transaction(mode,fn){const d=await db();try{return await new Promise((resolve,reject)=>{const t=d.transaction(STORE,mode),s=t.objectStore(STORE);let value;try{value=fn(s)}catch(e){reject(e);return}t.oncomplete=()=>resolve(value?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}finally{d.close()}}
async function lookup(id){const d=await db();try{return await new Promise((resolve,reject)=>{const q=d.transaction(STORE).objectStore(STORE).get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}finally{d.close()}}
async function all(){const d=await db();try{return await new Promise((resolve,reject)=>{const q=d.transaction(STORE).objectStore(STORE).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}finally{d.close()}}
const image=f=>f.mimeType?.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(f.name||'');
const mb=n=>(n/1048576).toFixed(1)+' MB';
async function usage(){try{const rows=await all(),bytes=rows.reduce((n,r)=>n+(r.blob?.size||0),0);$('artCacheUsage').textContent=rows.length+' images · '+mb(bytes);if(navigator.storage?.estimate){const e=await navigator.storage.estimate();$('artCacheQuota').textContent='Site storage (estimated): '+mb(e.usage||0)+' / '+mb(e.quota||0)}}catch(e){$('artCacheUsage').textContent='Cache unavailable: '+e.message}}
async function get(f,load,force=false,manual=false){if(!image(f))return load();try{const hit=await lookup(f.id);if(!force&&hit&&hit.modifiedTime===f.modifiedTime&&hit.blob?.size)return hit.blob;if(!auto()&&!force&&!manual)return load();const blob=await load();if(!blob.type?.startsWith('image/'))return blob;try{await transaction('readwrite',s=>s.put({id:f.id,modifiedTime:f.modifiedTime,blob}))}catch(e){console.warn('Artwork cache write skipped',e)}return blob}catch(e){console.warn('Artwork cache fallback',e);return load()}}
window.lhsArtworkCache={get,usage};
const status=s=>{$('artCacheStatus').textContent=s};
const controls=on=>{busy=on;for(const id of ['artCacheCollect','artCacheRefresh','artCacheClear'])$(id).disabled=on;$('artCacheCancel').hidden=!on};
async function collect(refresh){if(busy)return;const drive=window.lhsArtworkDrive;if(!drive?.connected()){status('Connect Google Drive first, then retry.');return}cancelled=false;controls(true);let done=0,total=0,errors=0;try{const albums=(await drive.list(drive.root)).filter(f=>f.mimeType===drive.folder&&!['Singer','Production Templates'].includes(f.name));const tasks=[];for(const album of albums){if(cancelled)break;const tracks=(await drive.list(album.id)).filter(f=>f.mimeType===drive.folder);for(const track of tracks){if(cancelled)break;const images=(await drive.list(track.id)).filter(image);tasks.push(...images)}}total=tasks.length;status('Found '+total+' images. Starting…');for(const f of tasks){if(cancelled)break;try{await get(f,()=>drive.blob(f.id),refresh,true)}catch(e){errors++;console.warn('Artwork collection failed',f.id,e)}done++;status((refresh?'Refreshing ':'Collecting ')+done+' / '+total+' images'+(errors?' · '+errors+' failed':''));if(done%10===0)await usage()}status((cancelled?'Cancelled: ':'Complete: ')+done+' / '+total+' images'+(errors?' · '+errors+' failed':''))}catch(e){status('Collection stopped: '+e.message)}finally{controls(false);await usage()}}
$('artCacheAuto').checked=auto();$('artCacheAuto').addEventListener('change',e=>localStorage.setItem(autoKey,String(e.target.checked)));
$('artCacheCollect').onclick=()=>collect(false);$('artCacheRefresh').onclick=()=>collect(true);
$('artCacheCancel').onclick=()=>{cancelled=true;status('Cancelling after current download…')};
$('artCacheClear').onclick=async()=>{if(busy)return;if(!confirm('Clear all locally stored artwork images? Google Drive files will not be deleted.'))return;try{await transaction('readwrite',s=>s.clear());status('Artwork cache cleared.');await usage()}catch(e){status('Clear failed: '+e.message)}};
usage();
})();