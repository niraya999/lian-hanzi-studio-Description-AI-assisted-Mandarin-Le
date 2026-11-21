/* LHS Word of the Day — sourced only from lyrics actually opened in Music Library. */
(()=>{'use strict';
const KEY='lhs.lyricWords.v1',MAX_TRACKS=120;
const meanings={
'喜歡':'menyukai','喜欢':'menyukai','學習':'belajar','学习':'belajar','中文':'bahasa Mandarin',
'希望':'harapan; berharap','一天':'satu hari','意義':'makna','意义':'makna',
'生命':'kehidupan','夢想':'impian','梦想':'impian','漫長':'panjang','漫长':'panjang',
'溫柔':'lembut','温柔':'lembut','陪伴':'menemani','春風':'angin musim semi','春风':'angin musim semi',
'落花':'bunga yang gugur','歲月':'perjalanan waktu','岁月':'perjalanan waktu',
'曾經':'pernah','曾经':'pernah','受傷':'terluka','受伤':'terluka',
'借':'meminjam','假':'palsu; semu','修':'melatih diri','真':'sejati','苦':'penderitaan',
'借苦':'menggunakan penderitaan untuk melatih diri','借假修真':'menggunakan yang sementara untuk mengembangkan yang sejati'
};
const $=id=>document.getElementById(id);
const dateKey=(days=0)=>{const d=new Date(Date.now()+days*86400000);const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
function getTracks(){try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function hanLines(text){return String(text).split(/\r?\n/).map(x=>x.trim()).filter(x=>/\p{Script=Han}/u.test(x)&&x.length<=160)}
function entries(){const out=[],seen=new Set();for(const item of (window.lhsVerifiedWords||[])){if(item.word&&item.line){out.push(item);seen.add(item.word)}}for(const track of getTracks()){for(const line of hanLines(track.lyrics)){for(const [word,meaning] of Object.entries(meanings)){if(!line.includes(word)||seen.has(word))continue;seen.add(word);out.push({word,meaning,line,trackId:track.id,title:track.title,url:track.url||''})}}}return out.sort((a,b)=>a.word.localeCompare(b.word,'zh'))}
function selected(days=0){const e=entries();if(!e.length)return null;const key=dateKey(days);let h=2166136261;for(const ch of key){h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0}return e[h%e.length]}
function speak(word){if(!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang='zh-CN';u.rate=.85;window.speechSynthesis.speak(u)}
function render(){const root=$('dailyWord');if(!root)return;const today=selected();root.replaceChildren();$('wordDate').textContent=dateKey();if(!today){const p=document.createElement('p');p.textContent='Belum ada kosakata. Hubungkan Google Drive, buka Music Library, lalu pilih lagu yang memiliki lirik Mandarin. Kata harian akan diambil dari lirik yang sudah dibaca.';root.append(p);$('wordHistory').replaceChildren();return}
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text)x.textContent=text;return x};
root.append(el('div','daily-hanzi',today.word),el('div','daily-pinyin',(typeof window.pinyinPro?.pinyin==='function'?window.pinyinPro.pinyin(today.word,{toneType:'symbol'}):today.pinyin||'Pinyin tidak tersedia')),el('div','daily-meaning',today.meaning),el('p','daily-lyric',today.line),el('p','daily-source','Sumber: '+today.title));
const actions=el('div','daily-actions');const audio=el('button','','▶ Dengarkan kata');audio.onclick=()=>speak(today.word);actions.append(audio);
const source=el('button','','Buka lagu sumber');source.onclick=()=>{if(typeof window.lhsOpenTrack==='function')window.lhsOpenTrack(today.trackId,today.title);else window.showTab('library')};actions.append(source);root.append(actions);
const history=$('wordHistory');history.replaceChildren();for(let day=-1;day>=-7;day--){const item=selected(day);if(!item)continue;const row=el('div','daily-history-row',dateKey(day)+' · '+item.word+' · '+item.meaning);history.append(row)}
}
window.lhsCaptureLyrics=(id,title,lyrics,url)=>{if(!id||!hanLines(lyrics).length)return;const tracks=getTracks().filter(t=>t.id!==id);tracks.push({id,title:String(title),lyrics:String(lyrics).slice(0,80000),url:String(url||'')});try{localStorage.setItem(KEY,JSON.stringify(tracks.slice(-MAX_TRACKS)))}catch(e){console.warn('Word of the Day cache unavailable',e)}render()};
let scanning=false;
window.lhsAutoDiscoverWords=async albums=>{
 if(scanning||!Array.isArray(albums)||!albums.length||typeof window.lhsScanLyrics!=='function')return;
 const stamp=dateKey(),scanKey='lhs.wordscan.'+stamp;
 if(entries().length>=12&&localStorage.getItem(scanKey)==='done')return;
 scanning=true;
 const root=$('dailyWord');
 const hint=document.createElement('p');hint.id='wordScanStatus';hint.textContent='Mencari kosakata dari lirik Google Drive…';root?.append(hint);
 try{const found=await window.lhsScanLyrics(albums,(count,checked)=>{hint.textContent='Memindai lirik: '+checked+' lagu diperiksa, '+count+' memiliki Hanzi…'});if(found>0)localStorage.setItem(scanKey,'done')}
 catch(e){console.warn('Daily word discovery unavailable',e)}
 finally{scanning=false;render()}
};
window.lhsRenderDailyWord=render;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();